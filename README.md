# 🌐 Ecosystem-Test-

Современная локальная экосистема для игровых сценариев: маркетплейс, банк, Telegram-бот и вспомогательные сервисы в одном проекте.

## ✨ Что внутри

- 🛒 `arcadia_market` — MDM маркетплейс (frontend + backend)
- 🏦 `mb_bank` — MB Bank API + web-интерфейс
- 🤖 `tg_mdm` — Telegram bridge-бот для MDM
- 💬 `lan_messenger` — локальный мессенджер
- 🔌 `server.py` — основной локальный сервер/шлюз
- ⚙️ `start_game.bat` / `stop_server.bat` — запуск и остановка экосистемы

## 🚀 Быстрый старт

1. Установи:
   - Python 3.11+
   - Node.js 20+
2. Поставь зависимости:
   - `arcadia_market/backend`: `npm install`
   - `arcadia_market/frontend`: `npm install`
   - `tg_mdm`: `npm install`
3. Настрой окружение:
   - `arcadia_market/backend/.env` (из `.env.example`)
   - `tg_mdm/.env` (из `.env.example`)
4. Запусти проект:
   - `start_game.bat`

## 🖥️ Установка на своем хосте (Windows)

1. Подготовка хоста:
   - Установи Python 3.11+ и Node.js 20+
   - Открой PowerShell от имени администратора
2. Клонирование:
   - `git clone https://github.com/Goodog2013/Ecosystem-Test-.git`
   - `cd Ecosystem-Test-`
3. Установка зависимостей:
   - `cd arcadia_market/backend && npm install`
   - `cd ../frontend && npm install`
   - `cd ../../tg_mdm && npm install`
   - `cd ..`
4. Настройка `.env`:
   - создай `arcadia_market/backend/.env` из `.env.example`
   - создай `tg_mdm/.env` из `.env.example`
   - в backend оставь `HOST="0.0.0.0"` (доступ со всех интерфейсов)
   - `MB_BANK_API_URL` обычно: `http://127.0.0.1:8000/api/mb-bank`
5. Запуск:
   - `start_game.bat`
6. Проверка:
   - backend health: `http://127.0.0.1:4000/api/health`
   - web/hub: `http://127.0.0.1:8000/hub.html`
7. Firewall (если нужен доступ с других устройств):
   - `netsh advfirewall firewall add rule name="Ecosystem 8000" dir=in action=allow protocol=TCP localport=8000`
   - `netsh advfirewall firewall add rule name="Ecosystem 4000" dir=in action=allow protocol=TCP localport=4000`

## 📡 Как определить IP, где доступен сайт

1. Узнай IPv4 адреса:
   - `ipconfig`
   - или: `Get-NetIPAddress -AddressFamily IPv4 | Select-Object IPAddress,InterfaceAlias`
2. Выбери IP под свой сценарий:
   - `127.0.0.1` — только этот ПК
   - `192.168.x.x` — устройства в одной LAN
   - `26.x.x.x` — Radmin VPN
3. Проверь, что порты слушаются:
   - `Get-NetTCPConnection -State Listen -LocalPort 8000,4000`
4. Проверь доступность:
   - `Test-NetConnection -ComputerName <ТВОЙ_IP> -Port 8000`
5. Открывай сайт:
   - `http://<ТВОЙ_IP>:8000/hub.html`

Пример:
- `http://192.168.1.65:8000/hub.html`
- `http://26.191.181.104:8000/hub.html`

## 🤖 Telegram-бот

Полный гайд по созданию и подключению собственного бота:

- `tg_mdm/README.md` → **Create your own Telegram bot (step-by-step)**

## 🔐 Безопасность

- Никогда не коммить реальные `.env`, токены и ключи
- В репозитории должны быть только `.env.example`
- Локальные БД, логи, кэш и пользовательские runtime-данные исключены через `.gitignore`

## 📁 Структура релиза

- исходники и конфиги-шаблоны (`*.example`)
- скрипты запуска/остановки
- документация
- без локальных runtime-данных

## ☁️ Публикация в GitHub

```bash
git init
git branch -M main
git remote add origin https://github.com/Goodog2013/Ecosystem-Test-.git
git add .
git commit -m "chore: prepare release"
git push -u origin main
```

