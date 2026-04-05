# Ecosystem-Test-

Мульти-проект с локальной экосистемой:

- `arcadia_market` — MDM маркетплейс (frontend + backend)
- `mb_bank` — MB Bank API + web-интерфейс
- `tg_mdm` — Telegram bridge-бот для MDM
- `lan_messenger` — локальный мессенджер
- `server.py` — основной локальный сервер/шлюз
- `start_game.bat` / `stop_server.bat` — запуск и остановка

## Быстрый старт

1. Установить:
   - Python 3.11+
   - Node.js 20+
2. Установить зависимости:
   - `arcadia_market/backend`: `npm install`
   - `arcadia_market/frontend`: `npm install`
   - `tg_mdm`: `npm install`
3. Настроить окружение:
   - `arcadia_market/backend/.env` (из `.env.example`)
   - `tg_mdm/.env` (из `.env.example`)
4. Запуск:
   - `start_game.bat`

## Безопасность

- Секреты (`.env`, токены, ключи) не должны попадать в git.
- В репозитории оставляются только `.env.example` с шаблонами.
- Локальные БД, логи, кеш и пользовательские данные исключены через `.gitignore`.

## Структура релиза

- Код и конфиги-шаблоны (`*.example`)
- Скрипты запуска/остановки
- Документация
- Без локальных runtime-данных

## Публикация в GitHub

```bash
git init
git branch -M main
git remote add origin https://github.com/Goodog2013/Ecosystem-Test-.git
git add .
git commit -m "chore: prepare release"
git push -u origin main
```

