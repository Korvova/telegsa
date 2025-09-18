import { Handle, Position, type NodeProps } from 'reactflow';
import PreTaskCard from '../../components/PreTaskCard';
import EdgePreTaskBadge from '../../components/EdgePreTaskBadge';
import type { PreTaskDTO } from '../../api';

type Data = {
  p: PreTaskDTO;
  nameByChat?: Record<string, string> | Map<string, string>;
  groupTitle?: string | null;
  myChatId?: string;
  myRankIcon?: string | null;
};

export default function PreTaskNode({ id, data }: NodeProps<Data>) {
  const anchorId = `rf-pretask-${id}`;
  const pre = data?.p as PreTaskDTO;
  return (
    <div
      id={anchorId}
      style={{
        position: 'relative',
        minWidth: 240,
        maxWidth: 420,
        background: '#0f172a',
        color: '#e8eaed',
        border: '1px solid #2a3346',
        borderRadius: 16,
        padding: 12,
        boxShadow: '0 2px 8px rgba(0,0,0,.06)',
        cursor: 'grab',
      }}
    >
      <PreTaskCard
        p={pre}
        onOpen={() => {}}
        onEdit={() => {}}
        nameByChat={data?.nameByChat}
        groupTitle={data?.groupTitle}
        tone="subtle"
        myChatId={data?.myChatId}
        myRankIcon={data?.myRankIcon || null}
      />

      {/* Focus current edge badge */}
      <div style={{ position:'absolute', right: 16, top: 0, bottom: 0, overflow:'visible', pointerEvents:'none', zIndex: 80 }}>
        <div style={{ position:'absolute', right: 0, top: 0, bottom: 0, pointerEvents:'auto' }}>
          <EdgePreTaskBadge
            kind="pretask"
            count={0}
            title="Подсветить связь"
            onClick={() => {
              try {
                window.dispatchEvent(new CustomEvent('focus-process-edge', { detail: { nodeId: String(id) } }));
              } catch {}
            }}
          />
        </div>
      </div>

      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

