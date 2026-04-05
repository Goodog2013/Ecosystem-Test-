# LAN Messenger

Простой мессенджер для локальной сети (LAN) на чистом JS:

- backend: `node` + встроенный `http` (без внешних зависимостей);
- frontend: обычный `HTML/CSS/JS`;
- хранение сообщений: `data/chat-db.json` (автосохранение);
- комнаты, онлайн-статус (presence), история сообщений.

## Локальный запуск

```bat
cd lan_messenger
node server.js
```

По умолчанию сервер слушает `0.0.0.0:4010`.

## API

- `GET /api/health`
- `GET /api/rooms`
- `POST /api/rooms`
- `GET /api/messages?room=general&after=0`
- `POST /api/send`
- `POST /api/presence`

## Интеграция с проектом

В этом репозитории сервис автоматически запускается через `start_game.bat`
и останавливается через `stop_server.bat`.
