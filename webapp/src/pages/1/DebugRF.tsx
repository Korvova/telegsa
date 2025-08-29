// src/pages/DebugRF.tsx
import { useMemo } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  Position,
  Handle,
  type Node,
  type Edge,
  type Connection,
  type NodeProps,
} from 'reactflow';
import 'reactflow/dist/style.css';

type Data = { label: string };

function BoxNode({ data }: NodeProps<Data>) {
  return (
    <div style={{
      padding: 10,
      borderRadius: 12,
      background: '#fffbe6',
      border: '2px solid #f59e0b',
      minWidth: 160,
      textAlign: 'center',
      fontWeight: 700,
      color: '#111827',
    }}>
      {data.label}
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

const nodeTypes = { box: BoxNode };

const initNodes: Node<Data>[] = [
  { id: '1', type: 'box', position: { x: 100, y: 100 }, data: { label: 'Node 1' } },
  { id: '2', type: 'box', position: { x: 320, y: 100 }, data: { label: 'Node 2' } },
];

const initEdges: Edge[] = [{ id: 'e1-2', source: '1', target: '2' }];

function DebugRFInner() {
const [nodes, , onNodesChange] = useNodesState<Data>(initNodes);

  const [edges, setEdges, onEdgesChange] = useEdgesState(initEdges);
  const nt = useMemo(() => nodeTypes, []);

  const onConnect = (c: Connection) => setEdges((eds) => addEdge(c, eds));

  return (
    <div className="rf-scope" style={{ width: '100%', height: '100dvh', background: '#fff' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nt}
        fitView
      >
        <Background />
      </ReactFlow>
    </div>
  );
}

export default function DebugRF({ onExit }: { onExit: () => void }) {
  return (
    <div style={{ width: '100%', height: '100dvh', position: 'relative', background: '#fff' }}>
      <ReactFlowProvider>
        <DebugRFInner />
      </ReactFlowProvider>

      <button
        onClick={onExit}
        style={{
          position: 'fixed',
          left: 12,
          top: 12,
          zIndex: 10,
          padding: '8px 10px',
          borderRadius: 10,
          border: '1px solid #2a3346',
          background: '#202840',
          color: '#e8eaed',
        }}
      >
        ⟵ Назад
      </button>
    </div>
  );
}
