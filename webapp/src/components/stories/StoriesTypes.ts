// StoriesTypes.ts


export type StorySegment = {
  seen?: boolean;       // просмотрен?
  progress?: number;    // 0..1 — прогресс у активного сегмента
};

export type StorySlide = {
  id: string;
  kind: 'task_created' | 'status' | 'assignee' | 'comment' | 'media' | 'group_created' | 'text';
  actorName?: string | null;
  text?: string | null;
  taskTitle?: string | null;
  imageUrl?: string | null;
  comment?: string | null;
  at?: string | null;     // подпись времени
};

export type StoriesBarItem = {
  id: string;            // уникальный id для списка
  projectId: string;     // id проекта (для onOpen/markSeen)
  title: string;         // название проекта
  ownerName?: string | null; // показываем только в «Проекты со мной»
  segments: StorySegment[];  // 1..20 сегментов
  slides?: StorySlide[];     // слайды (опц.) — удобно пробрасывать в viewer
};