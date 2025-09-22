import PreTaskToggle from './PreTask/PreTaskToggle';

type PreConfig = {
  links: Array<{ taskId?: string; preTaskId?: string }>;
  mode: 'AFTER_ALL_DONE' | 'DATE_PLUS' | 'DELAY_AFTER' | 'AFTER_ALL_CANCELED';
  startAt?: string | null;
  delayMinutes?: number | null;
  autoCancelOnAny?: boolean;
  plannedAssigneeChatId?: string | null;
};

export default function AttachBar({
  chatId,
  groupId,
  preCfg,
  onApplyPreCfg,
  onPickFiles,
  onOpenCamera,
  onOpenDeadline,
  onOpenAccept,
  onOpenReminders,
  fileAnyRef,
  filePhotoRef,
  hidePreLinks = false,
}: {
  chatId: string;
  groupId: string | null;
  preCfg: PreConfig | null;
  onApplyPreCfg: (cfg: PreConfig | null) => void;
  onPickFiles: (files: FileList | null) => void;
  onOpenCamera: () => void;
  onOpenDeadline: () => void;
  onOpenAccept: () => void;
  onOpenReminders: () => void;
  fileAnyRef: React.RefObject<HTMLInputElement | null>;
  filePhotoRef: React.RefObject<HTMLInputElement | null>;
  hidePreLinks?: boolean;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <button type="button" onClick={() => fileAnyRef.current?.click()} title="Прикрепить файл" style={{ width: 36, height: 36, borderRadius: 10, border: '1px solid #2a3346', background: '#202840', color: '#e8eaed', cursor: 'pointer' }}>📑</button>
      <button type="button" onClick={() => filePhotoRef.current?.click()} title="Выбрать фото" style={{ width: 36, height: 36, borderRadius: 10, border: '1px solid #2a3346', background: '#202840', color: '#e8eaed', cursor: 'pointer' }}>🖼️</button>
      <button type="button" onClick={onOpenCamera} title="Открыть камеру" style={{ width: 36, height: 36, borderRadius: 10, border: '1px solid #2a3346', background: '#202840', color: '#e8eaed', cursor: 'pointer' }}>📸</button>
      <button type="button" onClick={onOpenDeadline} title="Установить дедлайн" style={{ width: 36, height: 36, borderRadius: 10, border: '1px solid #2a3346', background: '#202840', color: '#e8eaed', cursor: 'pointer' }}>🚩</button>
      <button type="button" onClick={onOpenAccept} title="Условия приёма" style={{ width: 36, height: 36, borderRadius: 10, border: '1px solid #2a3346', background: '#202840', color: '#e8eaed', cursor: 'pointer' }}>☝️</button>
      <button type="button" onClick={onOpenReminders} title="Добавить напоминание" style={{ width: 36, height: 36, borderRadius: 10, border: '1px solid #2a3346', background: '#202840', color: '#e8eaed', cursor: 'pointer' }}>⏰</button>
      <PreTaskToggle chatId={chatId} groupId={groupId} value={preCfg} onApplied={onApplyPreCfg} hideLinks={hidePreLinks} style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #2a3346', background: '#202840', color: '#e8eaed' }} />
      <input ref={fileAnyRef} type="file" multiple style={{ display: 'none' }} onChange={(e) => onPickFiles(e.target.files)} />
      <input ref={filePhotoRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={(e) => onPickFiles(e.target.files)} />
    </div>
  );
}
