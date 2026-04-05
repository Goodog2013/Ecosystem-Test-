# tg_mdm

Telegram bot bridge for MDM.

## What it does

- Accepts `/start mdm_<token>` links from MDM profile.
- Confirms Telegram link in MDM backend (`/api/integrations/telegram/confirm`).
- Supports `/balance` to show MDM + MB Bank balance for linked account.
- Supports `/unlink` to detach Telegram from MDM.
- Receives automatic Telegram notifications for key MDM events (orders, order status, chat messages, reviews).

## Setup

1. Create bot in `@BotFather` and get token.
2. Copy `.env.example` to `.env` and fill:
   - `TELEGRAM_BOT_TOKEN`
   - `TELEGRAM_BRIDGE_SECRET` (must match backend `.env`)
   - `MDM_API_BASE` (default `http://127.0.0.1:4000/api`)
   You can keep `TELEGRAM_BOT_TOKEN` empty in `.env` and set it in system env instead.
3. Start MDM backend.
4. Run:

```bat
start_tg_mdm.bat
```

or

```powershell
node index.js
```

## Commands

- `/start <token>` - link Telegram to MDM account
- `/balance` - show MDM and MB balances
- `/unlink` - unlink Telegram from MDM
- `/help` - commands list
