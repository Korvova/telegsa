# Telegsar — краткая информация

- Назначение: сервис (API + Web) для задач/процессов.
- Технологии: Node.js (Express/Prisma), React (Vite), SQLite/PostgreSQL.

## Быстрый старт

- API: `cd api && cp .env.example .env && pnpm i && pnpm dev`
- Webapp: `cd webapp && cp .env.example .env && pnpm i && pnpm dev`
- Продуктивный запуск: см. скрипты PM2 в `api` и `webapp`.

## Полезное

- Логи API: `api/logs` или журнал PM2 (`pm2 logs`).
- Миграции Prisma: `cd api && pnpm prisma migrate dev`.
- Переменные окружения: см. `api/.env.example` и `webapp/.env.example`.

## Ветки

- Текущая рабочая ветка: `Ficha` (feature-работы).

Обновляйте этот файл короткими заметками: что сделано, где смотреть логи,
важные URL, переменные окружения и т.д.
