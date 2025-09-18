import { useMemo } from 'react';
import { ReactFlowProvider, ReactFlow, Background, useNodesState, type Node } from 'reactflow';
import 'reactflow/dist/style.css';
import FeedTaskNode from './FeedTaskNode';

type Props = {
  open: boolean;
  task: { id: string; text: string } | null;
  onClose: () => void;
};

export default function TaskFeedProcessPage({ open, task, onClose }: Props) {
  if (!open || !task) return null;
  return (
    <ReactFlowProvider>
      <Inner task={task} onClose={onClose} />
    </ReactFlowProvider>
  );
}

function Inner({ task, onClose }: { task: { id: string; text: string }; onClose: () => void }) {
  const initialNodes = useMemo<Node[]>(() => [
    {
      id: String(task.id),
      type: 'feedTask',
      position: { x: 100, y: 120 },
      data: { text: task.text },
    },
  ], [task.id, task.text]);

  const [nodes, , onNodesChange] = useNodesState(initialNodes);
  const nodeTypes = useMemo(() => ({ feedTask: FeedTaskNode }), []);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 3000,
        background: '#0f1216',
        color: '#e8eaed',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div style={{ flex: 1, minHeight: 0 }}>
        <ReactFlow nodes={nodes} onNodesChange={onNodesChange} nodeTypes={nodeTypes} fitView>
          <Background />
        </ReactFlow>
      </div>

      {/* Кнопка назад (синий круг) */}
      <button
        onClick={onClose}
        aria-label="Назад"
        style={{
          position: 'fixed',
          left: '50%',
          bottom: `calc(18px + env(safe-area-inset-bottom, 0px))`,
          transform: 'translateX(-50%)',
          width: 56,
          height: 56,
          borderRadius: 28,
          border: 'none',
          background: '#2563eb',
          color: '#fff',
          boxShadow: '0 10px 24px rgba(0,0,0,.35)',
          fontSize: 22,
          lineHeight: '56px',
          textAlign: 'center',
          cursor: 'pointer',
          zIndex: 3200,
        }}
      >
        ⟵
      </button>
    </div>
  );
}
