import { useEffect, useRef, useState } from 'react';
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
  const [overrideGroupId, setOverrideGroupId] = useState<string | null>(null);
  const [edgeInit, setEdgeInit] = useState<null | { text: string; groupId: string | null; links: Array<{ taskId?: string; preTaskId?: string }>; mode?: string; startAt?: string | null; delayMinutes?: number | null; autoCancelOnAny?: boolean }>(null);
  const [taskEdgeInit, setTaskEdgeInit] = useState<null | { parentTaskId: string; groupId: string | null; text?: string }>(null);
  const [editInit, setEditInit] = useState<null | any>(null);
  const [preEditInit, setPreEditInit] = useState<null | { preTaskId: string }>(null);
  const processOpenRef = useRef(false);
  const iosFocusRef = useRef<HTMLInputElement | null>(null);

  const isIOS = () => {
    try {
      const ua = navigator.userAgent || '';
      // iOS Chrome/Safari/Telegram all report iPhone/iPad in UA
      return /iPad|iPhone|iPod/i.test(ua);
    } catch { return false; }
  };

  const openModal = () => {
    if (isIOS()) {
      try { iosFocusRef.current?.focus({ preventScroll: true } as any); } catch {}
    }
    setOpen(true);
    try { setTimeout(() => { window.dispatchEvent(new CustomEvent('create-task-focus')); }, 0); } catch {}
  };

  // sync global listeners with modal visibility (for external UI that relies on it)
  useEffect(() => {
    try { window.dispatchEvent(new CustomEvent('create-task-open', { detail: open })); } catch {}
  }, [open]);

  // track process overlay to suppress edit modal in feed when process is open
  useEffect(() => {
    const onOpened = () => { processOpenRef.current = true; };
    const onClosed = () => { processOpenRef.current = false; };
    window.addEventListener('taskfeed-process-opened', onOpened as any);
    window.addEventListener('taskfeed-process-closed', onClosed as any);
    return () => {
      window.removeEventListener('taskfeed-process-opened', onOpened as any);
      window.removeEventListener('taskfeed-process-closed', onClosed as any);
    };
  }, []);

  // open modal on external events used by feed (edit or edge pretask / edge task / edit pretask)
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
    const onEdgeTask = (e: Event) => {
      try {
        const ce = e as CustomEvent<any>;
        const d = (ce && ce.detail) || {};
        const tid = d?.taskId ? String(d.taskId) : '';
        if (!tid) return;
        const txt = String(d.text || '');
        const gid = (typeof d.groupId === 'string' || d.groupId === null) ? d.groupId : null;
        setTaskEdgeInit({ parentTaskId: tid, groupId: gid ?? null, text: txt });
        setOpen(true);
      } catch { setOpen(true); }
    };
    const onEdit = (e: Event) => {
      if (processOpenRef.current) return; // не открываем редактор из ленты, если открыт процесс
      try { setEditInit((e as any).detail || {}); } catch {}
      setOpen(true);
    };
    const onEditPre = (e: Event) => {
      if (processOpenRef.current) return;
      try {
        const d = ((e as CustomEvent<any>).detail) || {};
        const pid = String(d?.preTaskId || '');
        if (!pid) return;
        setPreEditInit({ preTaskId: pid });
      } catch {}
      setOpen(true);
    };
    window.addEventListener('edge-pre-open', onEdge as any);
    window.addEventListener('edge-task-open', onEdgeTask as any);
    window.addEventListener('edit-pretask-open', onEditPre as any);
    window.addEventListener('edit-task-open', onEdit as any);
    const onDefaultGroup = (e: Event) => {
      try {
        const d = (e as CustomEvent<any>)?.detail || {};
        const gid = (typeof d?.groupId === 'string') ? d.groupId : null;
        setOverrideGroupId(gid);
      } catch {}
    };
    window.addEventListener('create-task-default-group', onDefaultGroup as any);
    return () => {
      window.removeEventListener('edge-pre-open', onEdge as any);
      window.removeEventListener('edge-task-open', onEdgeTask as any);
      window.removeEventListener('edit-pretask-open', onEditPre as any);
      window.removeEventListener('edit-task-open', onEdit as any);
      window.removeEventListener('create-task-default-group', onDefaultGroup as any);
    };
  }, []);

  return (
    <div>
      {/* Hidden focus target to reliably bootstrap iOS keyboard on tap */}
      <input
        ref={iosFocusRef}
        aria-hidden="true"
        tabIndex={-1}
        style={{ position: 'fixed', opacity: 0, width: 1, height: 1, bottom: 0, left: 0, pointerEvents: 'none' }}
      />
      <button
        onMouseDown={() => { if (isIOS()) { try { iosFocusRef.current?.focus({ preventScroll: true } as any); } catch {} } }}
        onTouchStart={() => { if (isIOS()) { try { iosFocusRef.current?.focus({ preventScroll: true } as any); } catch {} } }}
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

      <CreateTaskModal
        open={open}
        onClose={() => { setOpen(false); setEdgeInit(null); setTaskEdgeInit(null); setEditInit(null); setPreEditInit(null); }}
        chatId={_chatId}
        defaultGroupId={(overrideGroupId !== null ? overrideGroupId : _defaultGroupId)}
        groups={_groupsProp}
        onCreated={onCreated}
        initialEdge={edgeInit || undefined}
        initialTaskEdge={taskEdgeInit || undefined}
        initialPreTaskEdit={preEditInit || undefined}
        initialEdit={editInit || undefined}
      />
    </div>
  );
}
