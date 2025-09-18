import { Handle, Position, type NodeProps } from 'reactflow';

type Data = {
  id?: string;
  text: string;
};

export default function FeedTaskNode({ data }: NodeProps<Data>) {
  const text = String(data?.text || 'Новая задача');
  const shortId = (data?.id || '').slice(0, 6);
  return (
    <div
      style={{
        position: 'relative',
        minWidth: 260,
        maxWidth: 420,
        background: '#ffffff',
        color: '#0f1216',
        border: '1px solid #e5e7eb',
        borderRadius: 16,
        padding: 12,
        boxShadow: '0 2px 8px rgba(0,0,0,.06)',
        cursor: 'grab',
      }}
    >
      <div style={{ fontSize: 12, opacity: 0.6, marginBottom: 6, display:'flex', alignItems:'center', gap:6 }}>
        {shortId ? <span>#{shortId}</span> : null}
      </div>
      <div style={{ fontSize: 16, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{text}</div>

      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
