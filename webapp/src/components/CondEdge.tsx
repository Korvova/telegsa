// src/components/CondEdge.tsx
import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from 'reactflow';

export default function CondEdge(props: EdgeProps) {
  const [path, labelX, labelY] = getBezierPath(props);
  const icon = (props.data as any)?.icon ?? '➡️';

  return (
    <>
      {/* markerEnd передаём как есть — не спредим (иначе TS-ошибка) */}
      <BaseEdge {...props} path={path} markerEnd={props.markerEnd} />
      <EdgeLabelRenderer>
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            pointerEvents: 'all',
            fontSize: 14,
            background: '#fff',
            border: '1px solid #e5e7eb',
            borderRadius: 10,
            padding: '2px 6px',
          }}
        >
          {icon}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
