// Thin wrapper to reuse PreTaskToggle from CreateTaskFab in other modals
// placeholder (not used currently)

export default function PreTaskToggleEmbed(_props: { chatId: string; groupId: string | null; value: any; onApplied: (cfg: any)=>void }) {
  // We can't import inner component directly; provide a minimal re‑implementation using CreateTaskFab's exported bits is not trivial.
  // For now render a small inline help and ask user to adjust via existing UI (already integrated in CreateTaskFab)
  // Placeholder: not used; in EdgeCreatePreTaskModal we built inline chips and rely less on this wrapper.
  return null;
}
