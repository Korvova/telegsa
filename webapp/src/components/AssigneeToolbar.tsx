import { NodeToolbar, Position, useStore } from 'reactflow';

function useRfZoom() {
  return useStore((s) => s.transform[2]);
}

export default function AssigneeToolbar({
  name,
  onClick,
}: {
  name?: string | null;
  onClick: () => void;
}) {
  const zoom = useRfZoom();
  const contentScale = zoom * zoom;

  const stopAll = (e: React.SyntheticEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <NodeToolbar isVisible position={Position.Bottom} offset={8}>
      <div
        style={{
          transform: `scale(${contentScale})`,
          transformOrigin: 'center top',
        }}
      >
        <button
          type="button"
          // блокируем всплытие, чтобы на ПК не открывалось нижнее меню ноды
          onPointerDown={stopAll}
          onDoubleClick={stopAll}
          onContextMenu={stopAll}
          onClick={(e) => {
            stopAll(e);
            onClick();
          }}
          title="Выбрать исполнителя"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            whiteSpace: 'nowrap',
            maxWidth: 320,
            padding: '8px 12px',
            borderRadius: 999,
            border: '1px solid #d1d5db',
            background: '#ffffff',
            boxShadow: '0 6px 16px rgba(0,0,0,.10)',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            gap: 8,
          }}
        >
          <span aria-hidden>👤</span>
          <span
            style={{
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              maxWidth: 240,
            }}
          >
            {name || 'Владелец группы'}
          </span>
        </button>
      </div>
    </NodeToolbar>
  );
}
