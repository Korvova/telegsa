import { NodeToolbar, Position, useStore } from 'reactflow';

export type NodeStatus =
  | 'NEW'
  | 'IN_PROGRESS'
  | 'DONE'
  | 'CANCELLED'
  | 'APPROVAL'
  | 'WAITING';

function useRfZoom() {
  return useStore((s) => s.transform[2]); // текущий zoom
}

function statusLabel(s: NodeStatus) {
  switch (s) {
    case 'IN_PROGRESS': return 'В работе';
    case 'DONE':        return 'Готово';
    case 'CANCELLED':   return 'Отмена';
    case 'APPROVAL':    return 'Согласование';
    case 'WAITING':     return 'Ждёт';
    default:            return 'Новое';
  }
}

function statusDotColor(s: NodeStatus) {
  switch (s) {
    case 'IN_PROGRESS': return '#3b82f6'; // синий
    case 'DONE':        return '#22c55e'; // зелёный
    case 'CANCELLED':   return '#ef4444'; // красный
    case 'APPROVAL':    return '#f59e0b'; // оранжевый
    case 'WAITING':     return '#06b6d4'; // голубой
    default:            return '#9ca3af'; // серый
  }
}

export default function NodeTopToolbar({
  currentStatus,
  onOpenConditions,
  onOpenStatus,
  visible = false, // 👈 новое
}: {
  currentStatus: NodeStatus;
  onOpenConditions: () => void;
  onOpenStatus: () => void;
  visible?: boolean;
}) {
  const zoom = useRfZoom();
  const contentScale = zoom * zoom;

  const stopAll = (e: React.SyntheticEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <NodeToolbar isVisible={visible} position={Position.Top} offset={8}>
      <div
        style={{
          transform: `scale(${contentScale})`,
          transformOrigin: 'center bottom',
          display: 'flex',
          gap: 8,
        }}
      >
        {/* ⚙️ Условия */}
        <button
          type="button"
          onPointerDown={stopAll}
          onDoubleClick={stopAll}
          onContextMenu={stopAll}
          onClick={(e) => {
            stopAll(e);
            onOpenConditions();
          }}
          title="Условия запуска/отмены"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '6px 10px',
            borderRadius: 999,
            border: '1px solid #d1d5db',
            background: '#fff',
            boxShadow: '0 6px 16px rgba(0,0,0,.10)',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            gap: 8,
          }}
        >
          <span aria-hidden>⚙️</span>
          <span>Условия</span>
        </button>

        {/* 🏷 Статус */}
        <button
          type="button"
          onPointerDown={stopAll}
          onDoubleClick={stopAll}
          onContextMenu={stopAll}
          onClick={(e) => {
            stopAll(e);
            onOpenStatus();
          }}
          title="Изменить статус"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '6px 10px',
            borderRadius: 999,
            border: '1px solid #d1d5db',
            background: '#fff',
            boxShadow: '0 6px 16px rgba(0,0,0,.10)',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            gap: 8,
          }}
        >
          <span
            aria-hidden
            style={{
              width: 10,
              height: 10,
              borderRadius: 999,
              background: statusDotColor(currentStatus),
              display: 'inline-block',
            }}
          />
          <span>{statusLabel(currentStatus)}</span>
        </button>
      </div>
    </NodeToolbar>
  );
}
