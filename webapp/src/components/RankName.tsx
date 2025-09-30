import { useMyRankIcon } from '../hooks/useMyRankIcon';

export default function RankName({ chatId, name, meChatId, myRankIcon }: { chatId?: string | null; name: string; meChatId?: string; myRankIcon?: string | null }) {
  const cid = (chatId ?? '').toString();
  const icon = useMyRankIcon(cid);
  const fallback = cid && meChatId && cid === String(meChatId) ? (myRankIcon || null) : null;
  const finalIcon = icon || fallback || null;
  return <>{finalIcon ? `${finalIcon} ${name}` : name}</>;
}
