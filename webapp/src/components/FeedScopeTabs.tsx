// src/components/FeedScopeTabs.tsx

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { listGroups, type Group } from '../api';

export type FeedScope =
  | { kind: 'all' }
  | { kind: 'personal' }
  | { kind: 'group'; groupId: string };

type Props = {
  chatId: string;
  value: FeedScope;
  onChange: (next: FeedScope) => void;
  /** Включить свайпы влево/вправо для переключения вкладок (по умолчанию выкл) */
  enableSwipe?: boolean;
};

export default function FeedScopeTabs({
  chatId,
  value,
  onChange,
  enableSwipe = false,
}: Props) {
  const [groups, setGroups] = useState<Group[]>([]);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // грузим группы
  useEffect(() => {
    let alive = true;
    listGroups(String(chatId))
      .then((r) => {
        if (!alive || !r?.ok) return;
        setGroups(r.groups || []);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [chatId]);

  const ownGroups = useMemo(() => groups.filter(g => g.kind === 'own'), [groups]);
  const memberGroups = useMemo(() => groups.filter(g => g.kind === 'member'), [groups]);

  // свайпы (по умолчанию OFF) — оставили задел, но без смены вкладок
  useEffect(() => {
    if (!enableSwipe || !wrapRef.current) return;
    let startX = 0, startY = 0;

    const onTouchStart = (e: TouchEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) return;
      const t = e.touches[0];
      startX = t.clientX;
      startY = t.clientY;
    };
    const onTouchMove = (e: TouchEvent) => {
      if (!startX && !startY) return;
      const t = e.touches[0];
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      // игнор вертикальных движений; смену вкладок пока не делаем
      if (Math.abs(dy) > Math.abs(dx)) return;
    };
    const onTouchEnd = () => {
      startX = 0;
      startY = 0;
    };

    document.addEventListener('touchstart', onTouchStart, { passive: true });
    document.addEventListener('touchmove', onTouchMove, { passive: true });
    document.addEventListener('touchend', onTouchEnd, { passive: true });
    return () => {
      document.removeEventListener('touchstart', onTouchStart as any);
      document.removeEventListener('touchmove', onTouchMove as any);
      document.removeEventListener('touchend', onTouchEnd as any);
    };
  }, [enableSwipe]);

  const Tab = ({
    active,
    onClick,
    children,
    color = '#e5e7eb',
  }: {
    active?: boolean;
    onClick?: () => void;
    children: any;
    color?: string;
  }) => (
    <button
      onClick={onClick}
      onMouseDown={(e) => e.preventDefault()}
      style={{
        background: 'transparent',
        border: 'none',
        outline: 'none',
        padding: '6px 8px 8px',
        color,
        cursor: 'pointer',
        fontSize: 14,
        fontWeight: active ? 700 : 500,
        whiteSpace: 'nowrap',
        userSelect: 'none' as const,
        borderBottom: `2px solid ${active ? color : 'transparent'}`,
        opacity: active ? 1 : 0.85,
      }}
    >
      {children}
    </button>
  );

  const isActive = (s: FeedScope) =>
    (value.kind === 'all' && s.kind === 'all') ||
    (value.kind === 'personal' && s.kind === 'personal') ||
    (value.kind === 'group' && s.kind === 'group' && (value as any).groupId === (s as any).groupId);

  // Собираем массив «табов» как элементов для рендера
  const renderTabs = () => {
   const items: ReactNode[] = [];

    const pushSep = () =>
      items.push(
        <span key={`sep-${items.length}`} style={{ color: '#2a3346', opacity: 0.9 }}>
          &nbsp;|&nbsp;
        </span>
      );

    // Все
    items.push(
      <Tab
        key="all"
        active={value.kind === 'all'}
        onClick={() => onChange({ kind: 'all' })}
        color="#e5e7eb"
      >
        Все
      </Tab>
    );
    pushSep();

    // Личные
    items.push(
      <Tab
        key="personal"
        active={value.kind === 'personal'}
        onClick={() => onChange({ kind: 'personal' })}
        color="#e5e7eb"
      >
        Личные
      </Tab>
    );

    // Разделитель между базовыми и группами
    if (groups.length > 0) pushSep();

    // Мои проекты — белые
    ownGroups.forEach((g, idx) => {
      const isTg = (g as any).isTelegramGroup === true;
      items.push(
        <Tab
          key={`own-${g.id}`}
          active={isActive({ kind: 'group', groupId: g.id })}
          onClick={() => onChange({ kind: 'group', groupId: g.id })}
          color={isTg ? '#42aaff' : '#ffffff'}
        >
          {isTg ? '➡️📁 ' : ''}{g.title}
        </Tab>
      );
      // ставим | между всеми, кроме последнего общего случая
      if (idx < ownGroups.length - 1 || memberGroups.length > 0) pushSep();
    });

    // Участник — голубые
    memberGroups.forEach((g, idx) => {
      const isTg = (g as any).isTelegramGroup === true;
      items.push(
        <Tab
          key={`mem-${g.id}`}
          active={isActive({ kind: 'group', groupId: g.id })}
          onClick={() => onChange({ kind: 'group', groupId: g.id })}
          color={isTg ? '#42aaff' : '#8aa0ff'}
        >
          {isTg ? '➡️📁 ' : ''}{g.title}
        </Tab>
      );
      if (idx < memberGroups.length - 1) pushSep();
    });

    return items;
  };

  return (
    <div
      ref={wrapRef}
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 21,
        background: '#0f1216',
        padding: '8px 0 4px',
        borderBottom: '1px solid #1a2132',
        marginBottom: 8,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          overflowX: 'auto',
          WebkitOverflowScrolling: 'touch',
          padding: '0 12px',
          // без обводок/капсул — чистый текст с разделителями
          gap: 0,
        }}
      >
        {renderTabs()}
      </div>
    </div>
  );
}
