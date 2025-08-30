// src/components/AssigneeToolbar.tsx
import { NodeToolbar, Position } from 'reactflow';

type Props = {
  name?: string | null;
  onPick?: () => void;
};

export default function AssigneeToolbar({ name, onPick }: Props) {
  return (
    <NodeToolbar isVisible position={Position.Bottom} offset={8}>
      <button
        onClick={onPick}
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
    </NodeToolbar>
  );
}
