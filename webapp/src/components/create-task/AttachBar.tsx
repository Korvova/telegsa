import ComplexityToggle from './ComplexityToggle';

// PreConfig removed from here; complexity picker replaces pretask modal in this bar

export default function AttachBar({
  complexity,
  onPickComplexity,
  onPickFiles,
  onOpenCamera,
  onOpenDeadline,
  onOpenAccept,
  onOpenReminders,
  fileAnyRef,
  filePhotoRef,
}: {
  complexity: number | null;
  onPickComplexity: (n: number | null) => void;
  onPickFiles: (files: FileList | null) => void;
  onOpenCamera: () => void;
  onOpenDeadline: () => void;
  onOpenAccept: () => void;
  onOpenReminders: () => void;
  fileAnyRef: React.RefObject<HTMLInputElement | null>;
  filePhotoRef: React.RefObject<HTMLInputElement | null>;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <button type="button" onClick={() => fileAnyRef.current?.click()} title="Прикрепить файл" style={{ width: 36, height: 36, borderRadius: 10, border: '1px solid #2a3346', background: '#202840', color: '#e8eaed', cursor: 'pointer' }}>📑</button>
      <button type="button" onClick={() => filePhotoRef.current?.click()} title="Выбрать фото" style={{ width: 36, height: 36, borderRadius: 10, border: '1px solid #2a3346', background: '#202840', color: '#e8eaed', cursor: 'pointer' }}>🖼️</button>
      <button type="button" onClick={onOpenCamera} title="Открыть камеру" style={{ width: 36, height: 36, borderRadius: 10, border: '1px solid #2a3346', background: '#202840', color: '#e8eaed', cursor: 'pointer' }}>📸</button>
      <button type="button" onClick={onOpenDeadline} title="Установить дедлайн" style={{ width: 36, height: 36, borderRadius: 10, border: '1px solid #2a3346', background: '#202840', color: '#e8eaed', cursor: 'pointer' }}>🚩</button>
      <button type="button" onClick={onOpenAccept} title="Условия приёма" style={{ width: 36, height: 36, borderRadius: 10, border: '1px solid #2a3346', background: '#202840', color: '#e8eaed', cursor: 'pointer' }}>☝️</button>
      <button type="button" onClick={onOpenReminders} title="Добавить напоминание" style={{ width: 36, height: 36, borderRadius: 10, border: '1px solid #2a3346', background: '#202840', color: '#e8eaed', cursor: 'pointer' }}>⏰</button>
      <ComplexityToggle value={complexity} onChange={onPickComplexity} style={{ width: 36, height: 36, borderRadius: 10, border: '1px solid #2a3346', background: '#202840', color: '#e8eaed', cursor: 'pointer' }} />
      <input ref={fileAnyRef} type="file" multiple style={{ display: 'none' }} onChange={(e) => onPickFiles(e.target.files)} />
      <input ref={filePhotoRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={(e) => onPickFiles(e.target.files)} />
    </div>
  );
}
