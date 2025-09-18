import { Handle, Position, type NodeProps } from 'reactflow';
import FeedTaskCard, { type FeedTaskCardProps } from '../feed/FeedTaskCard';
import StageQuickBar from '../StageQuickBar';
import LongPressOutline from '../LongPressOutline';
import { useEffect, useState } from 'react';
import EdgePreTaskBadge from '../EdgePreTaskBadge';

type Data = {
  card: FeedTaskCardProps;
  bg?: string;
  brd?: string;
  meChatId?: string;
  groupId?: string | null;
};

export default function FeedTaskNode({ data }: NodeProps<Data>) {
  const card = data?.card as FeedTaskCardProps;
  const anchorId = `rf-card-${card?.id || 'x'}`;
  const [openQBar, setOpenQBar] = useState(false as boolean);
  const phase = (card as any)?.phase as string | undefined;
  const currentPhase = ((): any => {
    const p = String(phase || '').trim();
    const low = p.toLowerCase();
    if (['inbox', 'новые', 'новое'].includes(low)) return 'Inbox';
    if (['doing', 'в работе'].includes(low)) return 'Doing';
    if (['done', 'готово', 'готов'].includes(low)) return 'Done';
    if (['cancel', 'отмена', 'отменено', 'отменена'].includes(low)) return 'Cancel';
    if (['approval', 'согласование', 'на согласовании'].includes(low)) return 'Approval';
    if (['wait', 'ждет', 'ждёт', 'ожидание'].includes(low)) return 'Wait';
    return p || 'Inbox';
  })();
  const [localCard, setLocalCard] = useState(card);
  const [containerColors, setContainerColors] = useState(colorsForPhase(currentPhase));
  const [localGroupId, setLocalGroupId] = useState<string | null>(data?.groupId ?? null);

  // sync with incoming props when data.card is updated from server (mapTaskToFeedCard)
  useEffect(() => {
    const next = data?.card as any;
    if (!next) return;
    const phase = ((): any => {
      const p = String((next as any)?.phase || '').trim();
      const low = p.toLowerCase();
      if (['inbox', 'новые', 'новое'].includes(low)) return 'Inbox';
      if (['doing', 'в работе'].includes(low)) return 'Doing';
      if (['done', 'готово', 'готов'].includes(low)) return 'Done';
      if (['cancel', 'отмена', 'отменено', 'отменена'].includes(low)) return 'Cancel';
      if (['approval', 'согласование', 'на согласовании'].includes(low)) return 'Approval';
      if (['wait', 'ждет', 'ждёт', 'ожидание'].includes(low)) return 'Wait';
      return p || 'Inbox';
    })();
    const badge = badgeForPhase(phase);
    setLocalCard({ ...(next as any), phase, badge: (next as any)?.badge ?? badge } as any);
    setContainerColors(colorsForPhase(phase));
    setLocalGroupId(data?.groupId ?? null);
  }, [data?.card, data?.groupId]);

  // слушаем глобальные патчи (после редактирования): обновляем локальную карточку
  useEffect(() => {
    const onPatched = (e: any) => {
      try {
        const d = (e && e.detail) || {};
        const id = String(d.id || '');
        if (!id || String(id) !== String(localCard.id)) return;
        setLocalCard((prev:any) => {
          const next: any = { ...prev };
          if (d.text !== undefined) next.text = d.text;
          if (d.deadlineAt !== undefined) {
            next.deadline = (d.deadlineAt === null) ? null : ({ iso: d.deadlineAt, leftText: prev?.deadline?.leftText || '', overdue: Date.parse(String(d.deadlineAt)) < Date.now() });
          }
          if (d.groupTitle !== undefined || d.isPublicGroup !== undefined || d.groupId !== undefined) {
            next.group = {
              ...(prev.group || {}),
              title: d.groupTitle !== undefined ? d.groupTitle : (prev.group?.title || ''),
              public: d.isPublicGroup !== undefined ? Boolean(d.isPublicGroup) : (prev.group?.public || false),
            };
            if (d.groupId !== undefined) setLocalGroupId(d.groupId);
          }
          if (d.phase !== undefined) {
            next.phase = d.phase;
            setContainerColors(colorsForPhase(d.phase));
          }
          return next;
        });
      } catch {}
    };
    window.addEventListener('task-patched', onPatched as any);
    return () => window.removeEventListener('task-patched', onPatched as any);
  }, [localCard.id]);
  return (
    <div id={anchorId}
      style={{
        position: 'relative',
        minWidth: 260,
        maxWidth: 420,
        background: containerColors.bg,
        color: '#0f1216',
        border: `1px solid ${containerColors.brd}`,
        borderRadius: 16,
        padding: 12,
        boxShadow: '0 2px 8px rgba(0,0,0,.06)',
        cursor: 'grab',
      }}
    >
      {/* long-press: синяя рамка + переход в редактор */}
      <LongPressOutline
        targetId={anchorId}
        durationMs={1000}
        radius={16}
        onComplete={() => {
          try {
            const detail = {
              taskId: card?.id,
              text: card?.text || '',
              groupId: null,
              deadlineAt: card?.deadline?.iso || null,
              acceptCondition: card?.acceptCondition || 'NONE',
              anchorId,
            } as any;
            window.dispatchEvent(new CustomEvent('edit-task-open', { detail }));
          } catch {}
        }}
      />
      <FeedTaskCard
        {...(localCard as any)}
        onClickBadge={() => {
          try { console.log('[RF] badge click', { id: String(localCard.id), phase: (localCard as any)?.phase }); } catch {}
          setOpenQBar(true);
        }}
      />

      {/* Focus edge badge on the right */}
      <div style={{ position:'absolute', right: 16, top: 0, bottom: 0, overflow:'visible', pointerEvents:'none', zIndex: 80 }}>
        <div style={{ position:'absolute', right: 0, top: 0, bottom: 0, pointerEvents:'auto' }}>
          <EdgePreTaskBadge
            kind="task"
            count={1}
            title="Подсветить связь"
            onClick={() => {
              try { window.dispatchEvent(new CustomEvent('focus-process-edge', { detail: { nodeId: String(localCard.id) } })); } catch {}
            }}
          />
        </div>
      </div>

      {openQBar && (
        <StageQuickBar
          anchorId={anchorId}
          taskId={String(localCard.id)}
          groupId={localGroupId}
          meChatId={String(data?.meChatId || '')}
          currentPhase={currentPhase as any}
          edgeInset={12}
          onPicked={(next) => {
            try { console.log('[RF] stage picked', { id: String(localCard.id), next }); } catch {}
            // визуально перестроим бейдж
            const badge = badgeForPhase(next as any);
            setLocalCard((prev) => ({ ...(prev as any), badge, phase: next } as any));
            setContainerColors(colorsForPhase(next as any));
            try {
              window.dispatchEvent(new CustomEvent('task-patched', { detail: { id: String(localCard.id), phase: next, status: statusTextFromStage(next as any) } }));
              // попросим полотно обновить граф (pretask -> task) после смены статуса
              window.dispatchEvent(new CustomEvent('process-reload-request', { detail: { taskId: String(localCard.id), next: String(next) } }));
            } catch {}
            setOpenQBar(false);
          }}
          onRequestClose={() => setOpenQBar(false)}
        />
      )}

      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
    </div>
  );
}


function badgeForPhase(p?: any) {
  switch (p) {
    case 'Inbox':
      return { text: '🌱 Новое', bg: '#F3F4F6', fg: '#111827', brd: '#E5E7EB' };
    case 'Done':
      return { text: '✓ Готово', bg: '#D1F2DC', fg: '#0f5132', brd: '#A3DFB9' };
    case 'Cancel':
      return { text: '❌ Отмена', bg: '#FDDCDC', fg: '#7a1f1f', brd: '#F3B3B3' };
    case 'Doing':
      return { text: '🔨 В работе', bg: '#D7E6FF', fg: '#123a7a', brd: '#BBD6FF' };
    case 'Approval':
      return { text: '👉👈 Согласов', bg: '#FFE9CC', fg: '#6b3d06', brd: '#FFD59A' };
    case 'Wait':
      return { text: '🥶 Ждёт', bg: '#E0F2FF', fg: '#063f5c', brd: '#B9E4FF' };
    case 'Inbox':
    default:
      return null;
  }
}

function statusTextFromStage(s: any): string {
  switch (String(s)) {
    case 'Inbox': return 'Новые';
    case 'Doing': return 'В работе';
    case 'Done': return 'Готово';
    case 'Cancel': return 'Отмена';
    case 'Approval': return 'Согласование';
    case 'Wait': return 'Ждёт';
    default: return String(s);
  }
}

function colorsForPhase(p?: any) {
  switch (String(p)) {
    case 'Done':     return { bg: '#E8F5E9', brd: '#C8E6C9' };
    case 'Cancel':   return { bg: '#FDECEC', brd: '#F5C2C2' };
    case 'Doing':    return { bg: '#E3F2FD', brd: '#BBDEFB' };
    case 'Wait':     return { bg: '#E7F5FF', brd: '#B8E1FF' };
    case 'Approval': return { bg: '#FFF3E0', brd: '#FFE0B2' };
    default:         return { bg: '#FFFFFF', brd: '#e5e7eb' };
  }
}
