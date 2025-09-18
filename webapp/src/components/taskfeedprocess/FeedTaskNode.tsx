import { Handle, Position, type NodeProps } from 'reactflow';

type Data = {
  text: string;
};

export default function FeedTaskNode({ data }: NodeProps<Data>) {
  const text = String(data?.text || 'Новая задача');
  return (
    <div
      style={{
        position: 'relative',
        minWidth: 240,
        maxWidth: 360,
        background: '#121722',
        color: '#e8eaed',
        border: '1px solid #2a3346',
        borderRadius: 16,
        padding: 12,
        boxShadow: '0 10px 24px rgba(0,0,0,.35)',
        cursor: 'grab',
      }}
    >
      <div style={{ fontSize: 12, opacity: 0.65, marginBottom: 6 }}>Карточка из ленты</div>
      <div style={{ fontSize: 16, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{text}</div>

      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

