import { useEffect, useMemo, useState } from 'react';
import WheelPicker, { type WheelItem } from './WheelPicker';
import { listGroups } from '../api';

type MinimalGroup = { id: string; title: string };

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onApply: (groupId: string) => void;
  initialGroupId?: string;
  chatId?: number | string; // сделал опциональным, чтобы не падало при отсутствии
  groupsProp?: { own: MinimalGroup[]; member: MinimalGroup[] };
};

export default function GroupFilterModal({
  isOpen,
  onClose,
  onApply,
  initialGroupId,
  chatId,
  groupsProp,
}: Props) {
  const [tab, setTab] = useState<'own' | 'member'>('own');
  const [loading, setLoading] = useState(false);
  const [own, setOwn] = useState<MinimalGroup[]>([]);
  const [member, setMember] = useState<MinimalGroup[]>([]);
  const [selectedId, setSelectedId] = useState<string | undefined>(initialGroupId);

  // маппер любых Group → MinimalGroup
  const mapGroup = (g: any): MinimalGroup => ({
    id: String(g?.id ?? g?.groupId ?? ''),
    title: String(g?.title ?? g?.name ?? 'Без названия'),
  });

  useEffect(() => {
    if (!isOpen) return;

    setTab('own');
    setSelectedId(initialGroupId);

    // если дали готовые группы — используем их
    if (groupsProp) {
      setOwn(groupsProp.own ?? []);
      setMember(groupsProp.member ?? []);
      return;
    }

    // иначе пробуем загрузить
    (async () => {
      if (!chatId) {
        // нет chatId — показать пусто, без ошибки
        setOwn([]);
        setMember([]);
        return;
      }
      try {
        setLoading(true);
        const res: any = await listGroups(String(chatId));
        let ownMapped: MinimalGroup[] = [];
        let memberMapped: MinimalGroup[] = [];

        if (res?.own || res?.member) {
          // вариант API с own/member
          ownMapped = (res.own ?? []).map(mapGroup);
          memberMapped = (res.member ?? []).map(mapGroup);
        } else if (Array.isArray(res?.groups)) {
          // вариант API с groups: Group[]
          const groupsArr = res.groups as any[];
          const isMine = (g: any) => {
            const my = String(chatId);
            // эвристики определения «моих» групп
            const owner =
              g?.ownerId ?? g?.ownerChatId ?? g?.owner?.chatId ?? g?.creatorId ?? g?.chatId;
            return String(owner) === my || g?.isOwner === true || g?.kind === 'own';
          };
          ownMapped = groupsArr.filter(isMine).map(mapGroup);
          memberMapped = groupsArr.filter((g) => !isMine(g)).map(mapGroup);
        } else if (Array.isArray(res)) {
          // на всякий случай: пришёл массив
          ownMapped = (res as any[]).map(mapGroup);
          memberMapped = [];
        } else {
          // ничего похожего — пусто
          ownMapped = [];
          memberMapped = [];
        }

        // «Моя группа» первой
        ownMapped.sort((a, b) =>
          a.title === 'Моя группа' ? -1 : b.title === 'Моя группа' ? 1 : 0
        );

        setOwn(ownMapped);
        setMember(memberMapped);
      } catch (e) {
        console.error('listGroups failed', e);
        setOwn([]);
        setMember([]);
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, chatId]);

  const items: WheelItem[] = useMemo(() => {
    const src = tab === 'own' ? own : member;
    return src.map((g) => ({ id: g.id, label: g.title }));
  }, [tab, own, member]);

  const initialIndex = useMemo(() => {
    if (!selectedId) return 0;
    const idx = items.findIndex((x) => x.id === selectedId);
    return idx >= 0 ? idx : 0;
  }, [items, selectedId]);

  if (!isOpen) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 2000,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(520px, 94vw)',
          maxHeight: '82vh',
          background: '#fff',
          borderRadius: 14,
          boxShadow: '0 10px 32px rgba(0,0,0,0.2)',
          padding: 16,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontWeight: 800, fontSize: 18 }}>Выбор группы</div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              fontSize: 22,
              lineHeight: '22px',
              cursor: 'pointer',
            }}
            aria-label="Закрыть"
          >
            ✕
          </button>
        </div>

        {/* Табы */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 8,
            background: '#f2f4f8',
            padding: 6,
            borderRadius: 10,
          }}
        >
          <button
            onClick={() => setTab('own')}
            style={{
              border: 'none',
              borderRadius: 8,
              padding: '10px 0',
              fontWeight: 700,
              background: tab === 'own' ? '#2b7cff' : '#ffffff',
              color: tab === 'own' ? '#fff' : '#333',
              boxShadow: tab === 'own' ? '0 2px 8px rgba(43,124,255,0.35)' : 'none',
              cursor: 'pointer',
            }}
          >
            Мои
          </button>
          <button
            onClick={() => setTab('member')}
            style={{
              border: 'none',
              borderRadius: 8,
              padding: '10px 0',
              fontWeight: 700,
              background: tab === 'member' ? '#2b7cff' : '#ffffff',
              color: tab === 'member' ? '#fff' : '#333',
              boxShadow: tab === 'member' ? '0 2px 8px rgba(43,124,255,0.35)' : 'none',
              cursor: 'pointer',
            }}
          >
            Со мной
          </button>
        </div>

        {/* Слайдер */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            minHeight: 220,
            padding: '8px 0',
          }}
        >
          {loading ? (
            <div style={{ opacity: 0.6, fontSize: 14 }}>Загрузка…</div>
          ) : items.length === 0 ? (
            <div style={{ opacity: 0.6, fontSize: 14 }}>
              {tab === 'own' ? 'У вас нет проектов' : 'Нет проектов с вашим участием'}
            </div>
          ) : (
            <WheelPicker
              items={items}
              itemHeight={40}
              visibleCount={5}
              initialIndex={initialIndex}
              onChange={(idx) => setSelectedId(items[idx]?.id)}
            />
          )}
        </div>

        {/* Кнопки */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 8 }}>
          <button
            onClick={onClose}
            style={{
              padding: '12px 14px',
              borderRadius: 10,
              border: '1px solid #ddd',
              background: '#f5f5f5',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Отмена
          </button>
          <button
            disabled={!selectedId}
            onClick={() => selectedId && onApply(selectedId)}
            style={{
              padding: '12px 14px',
              borderRadius: 10,
              border: 'none',
              background: selectedId ? '#2b7cff' : '#aac6ff',
              color: '#fff',
              fontWeight: 800,
              cursor: selectedId ? 'pointer' : 'not-allowed',
            }}
          >
            Применить
          </button>
        </div>
      </div>
    </div>
  );
}
