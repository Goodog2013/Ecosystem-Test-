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

## Create your own Telegram bot (step-by-step)

1. Open Telegram and start chat with `@BotFather`.
2. Run command:

```text
/newbot
```

3. Set bot name (any display name).
4. Set bot username (must end with `bot`, for example `MyMdmBridgeBot`).
5. BotFather returns token like:

```text
123456789:AA....
```

6. Put token into `tg_mdm/.env`:

```env
TELEGRAM_BOT_TOKEN=123456789:AA....
```

7. In `arcadia_market/backend/.env` set:
   - `TELEGRAM_BOT_TOKEN` = same token
   - `TELEGRAM_BOT_USERNAME` = username without `@`
   - `TELEGRAM_BRIDGE_SECRET` = same value as in `tg_mdm/.env`
8. Restart backend and bot:
   - `start_game.bat` (or restart backend manually)
   - `tg_mdm/start_tg_mdm.bat`
9. Open MDM profile, generate Telegram link, click it and run `/start`.
10. Verify with `/balance` in bot chat.

### Important security note

- Never commit real bot token to git.
- If token leaks, immediately run `/revoke` in `@BotFather` and update `.env`.

## Commands

- `/start <token>` - link Telegram to MDM account
- `/balance` - show MDM and MB balances
- `/unlink` - unlink Telegram from MDM
- `/help` - commands list
