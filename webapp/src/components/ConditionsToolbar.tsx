// src/components/ConditionsToolbar.tsx
import { NodeToolbar, Position } from 'reactflow';

export default function ConditionsToolbar({ onClick }: { onClick: () => void }) {
  return (
    <NodeToolbar isVisible position={Position.Top} offset={8}>
      <button
        onClick={onClick}
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
    </NodeToolbar>
  );
}
