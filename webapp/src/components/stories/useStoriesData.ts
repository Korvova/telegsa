import { useEffect, useMemo, useState } from 'react';
import type { StoriesBarItem, StorySlide, StorySegment } from './StoriesTypes';
import { listMyFeed, listGroups, type TaskFeedItem } from '../../api';

// ключ локального хранилища: на пользователя и день (YYYY-MM-DD)
function todayKey(meChatId: string) {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `stories:${meChatId}:${y}-${m}-${day}`;
}

type SeenMap = Record<string, number[]>; // projectId -> индексы просмотренных слайдов

export function useStoriesData(meChatId: string) {
  const [items, setItems] = useState<StoriesBarItem[]>([]);

  // загрузка реальных проектов и событий за сегодня
  useEffect(() => {
    let alive = true;

    async function load() {
      try {
        const [groupsResp, feedResp] = await Promise.all([
          listGroups(meChatId),
          // возьмём обновления (фид)
          listMyFeed({ chatId: meChatId, role: 'all', limit: 200 }),
        ]);

        if (!alive) return;

        const groups = groupsResp.ok ? groupsResp.groups : [];
        const feed = (feedResp.ok ? feedResp.items : []) as TaskFeedItem[];

        // фильтруем по «сегодня»
        const start = new Date(); start.setHours(0,0,0,0);
        const end = new Date();   end.setHours(23,59,59,999);

        const isToday = (iso: string) => {
          const d = new Date(iso);
          return d >= start && d <= end;
        };

        // группируем слайды по groupId
        const groupSlides = new Map<string | null, StorySlide[]>();
        for (const it of feed) {
          if (!it.updatedAt || !isToday(it.updatedAt)) continue;

          const slide: StorySlide = {
            id: String(it.id),
            kind: 'text', // минимально: «текстовая история»; можно улучшить на основании статусов
            actorName: it.creatorName || undefined,
            text: humanizeChange(it),
            taskTitle: it.text || undefined,
            at: new Date(it.updatedAt).toLocaleTimeString(),
          };

          const key = it.groupId ?? null;
          const arr = groupSlides.get(key) || [];
          arr.push(slide);
          groupSlides.set(key, arr);
        }

        // собираем элементы для бара
        const out: StoriesBarItem[] = [];
        for (const g of groups) {
          const slides = (groupSlides.get(g.id) || []).slice(0, 40);
          if (slides.length === 0) continue;

          // сегменты (макс 20); каждый сегмент отвечает одному слайду
          const segments: StorySegment[] = slides.slice(0, 20).map(() => ({
            seen: false,
          }));

          out.push({
            id: g.id,
            projectId: g.id,
            title: g.title,
            ownerName: g.ownerName ?? undefined,
            segments,
            slides,
          });
        }

        // личная доска (groupId = null)
        const personalSlides = groupSlides.get(null) || [];
        if (personalSlides.length) {
          out.unshift({
            id: 'personal',
            projectId: 'personal',
            title: 'Моя группа',
            segments: personalSlides.slice(0, 20).map(() => ({ seen: false })),
            slides: personalSlides,
          });
        }

        // применяем сохранённые «просмотры»
        const key = todayKey(meChatId);
        let persisted: SeenMap = {};
        try { persisted = JSON.parse(localStorage.getItem(key) || '{}'); } catch {}
        const applied = out.map(p => {
          const seenIdx = new Set(persisted[p.projectId] || []);
          return {
            ...p,
            segments: p.segments.map((s, i) => ({ ...s, seen: seenIdx.has(i) })),
          };
        });

        setItems(applied);
      } catch (e) {
        console.warn('[useStoriesData] load error', e);
        setItems([]); // без сториз — просто пусто
      }
    }

    load();
    return () => { alive = false; };
  }, [meChatId]);

  // пометка «прочитал i-й слайд» + сохранение в localStorage
  const markSeen = (projectId: string, slideIndex: number) => {
    setItems(prev => {
      const next = prev.map(p => {
        if (p.projectId !== projectId) return p;
        return {
          ...p,
          segments: p.segments.map((s, i) =>
            i === slideIndex ? { ...s, seen: true } : s
          ),
        };
      });

      // persist
      const key = todayKey(meChatId);
      let persisted: SeenMap = {};
      try { persisted = JSON.parse(localStorage.getItem(key) || '{}'); } catch {}
      const set = new Set(persisted[projectId] || []);
      set.add(slideIndex);
      persisted[projectId] = Array.from(set);
      localStorage.setItem(key, JSON.stringify(persisted));

      return next;
    });
  };

  // проекты с непросмотренными сегментами идут раньше
  const sorted = useMemo(() => {
    return [...items].sort((a, b) => {
      const aAllSeen = a.segments.length > 0 && a.segments.every(s => !!s.seen);
      const bAllSeen = b.segments.length > 0 && b.segments.every(s => !!s.seen);
      if (aAllSeen === bAllSeen) return 0;
      return aAllSeen ? 1 : -1;
    });
  }, [items]);

  return { items: sorted, markSeen };
}

// компактное описание события
function humanizeChange(t: TaskFeedItem): string {
  const s = (t.status || '').toLowerCase();
  if (s.includes('создан')) return 'Создал новую задачу';
  if (s.includes('коммент')) return 'Оставил комментарий';
  if (s.includes('назнач')) return 'Назначил ответственного';
  if (s.includes('готов') || s.includes('done')) return 'Перевёл в «Готово»';
  return 'Обновил задачу';
}
