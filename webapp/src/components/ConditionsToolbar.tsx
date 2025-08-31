import { NodeToolbar, Position, useStore } from 'reactflow';

function useRfZoom() {
  return useStore((s) => s.transform[2]); // текущий zoom
}

export default function ConditionsToolbar({ onClick }: { onClick: () => void }) {
  const zoom = useRfZoom();
  const contentScale = zoom * zoom;

  const stopAll = (e: React.SyntheticEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <NodeToolbar isVisible position={Position.Top} offset={8}>
      <div
        style={{
          // компенсируем внутреннюю инверсию NodeToolbar
          transform: `scale(${contentScale})`,
          transformOrigin: 'center bottom',
        }}
      >
        <button
          type="button"
          // гасим всё, чтобы не открывалось нижнее меню ноды
          onPointerDown={stopAll}
          onDoubleClick={stopAll}
          onContextMenu={stopAll}
          onClick={(e) => {
            stopAll(e);
            onClick(); // открываем модалку условий
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
      </div>
    </NodeToolbar>
  );
}
