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

## Установка на своем хосте (Windows, полный гайд)

1. Подготовка хоста:
   - Установи Python 3.11+ и Node.js 20+.
   - Открой PowerShell от имени администратора.
2. Клонирование и вход в проект:
   - `git clone https://github.com/Goodog2013/Ecosystem-Test-.git`
   - `cd Ecosystem-Test-`
3. Установка зависимостей:
   - `cd arcadia_market/backend && npm install`
   - `cd ../frontend && npm install`
   - `cd ../../tg_mdm && npm install`
   - `cd ..`
4. Настройка `.env`:
   - `arcadia_market/backend/.env` из `.env.example`
   - `tg_mdm/.env` из `.env.example`
   - В `backend/.env` оставь `HOST="0.0.0.0"` чтобы backend слушал все интерфейсы.
   - `MB_BANK_API_URL` укажи на адрес MB API (обычно `http://127.0.0.1:8000/api/mb-bank` для локального хоста).
5. Запуск:
   - `start_game.bat`
6. Проверка, что сервисы живы:
   - MDM backend: `http://127.0.0.1:4000/api/health`
   - Главная страница: `http://127.0.0.1:8000/hub.html`
7. Разрешение в Windows Firewall (если нужно для других устройств):
   - `netsh advfirewall firewall add rule name="Ecosystem 8000" dir=in action=allow protocol=TCP localport=8000`
   - `netsh advfirewall firewall add rule name="Ecosystem 4000" dir=in action=allow protocol=TCP localport=4000`

## Как определить IP, где доступен сайт

1. Посмотреть IPv4 адреса хоста:
   - `ipconfig`
   - или точнее: `Get-NetIPAddress -AddressFamily IPv4 | Select-Object IPAddress,InterfaceAlias`
2. Выбрать нужный IP:
   - Для локального доступа с этого же ПК: `127.0.0.1`
   - Для устройств в домашней сети: обычно `192.168.x.x`
   - Для Radmin VPN: обычно `26.x.x.x`
3. Проверить, что порты слушаются:
   - `Get-NetTCPConnection -State Listen -LocalPort 8000,4000`
4. Проверить доступность с другого устройства:
   - `Test-NetConnection -ComputerName <ТВОЙ_IP> -Port 8000`
5. Открывать сайт с клиента:
   - `http://<ТВОЙ_IP>:8000/hub.html`

Пример:
- если твой LAN IP `192.168.1.65`, адрес будет `http://192.168.1.65:8000/hub.html`
- если твой Radmin IP `26.191.181.104`, адрес будет `http://26.191.181.104:8000/hub.html`

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

## Telegram bot setup

- Full guide for creating and connecting your own Telegram bot:
  - `tg_mdm/README.md` -> **Create your own Telegram bot (step-by-step)**
