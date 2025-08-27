

// webapp/src/share.ts
export function buildTaskMiniAppLink(taskId: string) {
  const bot =
    (import.meta.env.VITE_TG_BOT_USERNAME as string) || 'telegsar_bot';
  // deep-link, который откроет мини-апп на экране задачи
  // (в App.tsx обрабатывается tgWebAppStartParam/start_param = task_<id>)
  return `https://t.me/${bot}?startapp=task_${encodeURIComponent(taskId)}`;
}

export function buildTaskShareText(params: {
  title: string;
  description?: string | null;
  groupName?: string | null;
  due?: string | null;
}) {
  const lines: string[] = [];
  lines.push(`🗒️ ${params.title}`);
  if (params.groupName) lines.push(`Группа: ${params.groupName}`);
  if (params.due) lines.push(`Дедлайн: ${params.due}`);
  if (params.description) {
    const desc = params.description.trim();
    const short = desc.length > 500 ? `${desc.slice(0, 500)}…` : desc;
    lines.push('');
    lines.push(short);
  }
  return lines.join('\n');
}

export function buildFullSharePayload(task: {
  id: string;
  title: string;
  description?: string | null;
  groupName?: string | null;
  due?: string | null;
}) {
  const url = buildTaskMiniAppLink(task.id);
  const text = buildTaskShareText({
    title: task.title,
    description: task.description,
    groupName: task.groupName,
    due: task.due,
  });

  // ✅ Новый формат:
  // 🗒️ <заголовок>
  //
  // 📲 Открыть:
  // <ссылка>
  const full = `${text}\n\n📲 Открыть:\n${url}`;

  return { url, text, full };
}
