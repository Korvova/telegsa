import { useEffect, useState } from 'react';
import CreateTaskModal from './create-task/CreateTaskModal';
import type { Group } from '../api';

type Props = {
  defaultGroupId?: string | null;
  chatId: string;
  groups?: Group[];
  onCreated?: () => void;
};

export default function CreateTaskFab({
  defaultGroupId: _defaultGroupId = null,
  chatId: _chatId,
  groups: _groupsProp,
  onCreated,
}: Props) {
  const [open, setOpen] = useState(false);
  const [edgeInit, setEdgeInit] = useState<null | { text: string; groupId: string | null; links: Array<{ taskId?: string; preTaskId?: string }>; mode?: string; startAt?: string | null; delayMinutes?: number | null; autoCancelOnAny?: boolean }>(null);
  const [editInit, setEditInit] = useState<null | any>(null);

  const openModal = () => setOpen(true);

  // sync global listeners with modal visibility (for external UI that relies on it)
  useEffect(() => {
    try { window.dispatchEvent(new CustomEvent('create-task-open', { detail: open })); } catch {}
  }, [open]);

  // open modal on external events used by feed (edit or edge pretask)
  useEffect(() => {
    const onEdge = (e: Event) => {
      try {
        const ce = e as CustomEvent<any>;
        const d = (ce && ce.detail) || {};
        const tid = d?.taskId ? String(d.taskId) : '';
        const pid = d?.preTaskId ? String(d.preTaskId) : '';
        if (!tid && !pid) return;
        const txt = String(d.text || '');
        const gid = (typeof d.groupId === 'string' || d.groupId === null) ? d.groupId : null;
        const links = tid ? [{ taskId: tid }] : [{ preTaskId: pid }];
        setEdgeInit({ text: txt, groupId: gid ?? null, links, mode: 'AFTER_ALL_DONE', startAt: null, delayMinutes: null, autoCancelOnAny: false });
        setOpen(true);
      } catch { setOpen(true); }
    };
    const onEdit = (e: Event) => {
      try { setEditInit((e as any).detail || {}); } catch {}
      setOpen(true);
    };
    window.addEventListener('edge-pre-open', onEdge as any);
    window.addEventListener('edit-task-open', onEdit as any);
    return () => {
      window.removeEventListener('edge-pre-open', onEdge as any);
      window.removeEventListener('edit-task-open', onEdit as any);
    };
  }, []);

  return (
    <div>
      <button
        onClick={openModal}
        aria-label="Создать задачу"
        style={{
          position: 'fixed',
          right: 16,
          bottom: `calc(84px + env(safe-area-inset-bottom, 0px))`,
          width: 56,
          height: 56,
          borderRadius: 28,
          background: '#2563eb',
          color: '#fff',
          border: 'none',
          boxShadow: '0 10px 24px rgba(0,0,0,.35)',
          fontSize: 28,
          lineHeight: '56px',
          textAlign: 'center',
          cursor: 'pointer',
          zIndex: 50,
        }}
      >
        +
      </button>

      {open && (
        <CreateTaskModal
          open={open}
          onClose={() => { setOpen(false); setEdgeInit(null); setEditInit(null); }}
          chatId={_chatId}
          defaultGroupId={_defaultGroupId}
          groups={_groupsProp}
          onCreated={onCreated}
          initialEdge={edgeInit || undefined}
          initialEdit={editInit || undefined}
        />
      )}
    </div>
  );
}
