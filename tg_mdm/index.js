"use strict";

const fs = require("fs");
const path = require("path");
const dns = require("node:dns");
const { execFile } = require("child_process");

try {
  if (typeof dns.setDefaultResultOrder === "function") {
    dns.setDefaultResultOrder("ipv4first");
  }
} catch (_err) {
  // ignore DNS priority issues
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }
  const raw = fs.readFileSync(filePath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = String(line || "").trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex <= 0) {
      continue;
    }
    const key = trimmed.slice(0, eqIndex).trim();
    if (!key || process.env[key] !== undefined) {
      continue;
    }
    let value = trimmed.slice(eqIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

loadEnvFile(path.resolve(__dirname, "..", "arcadia_market", "backend", ".env"));
loadEnvFile(path.resolve(__dirname, ".env"));

const BOT_TOKEN = String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
const BRIDGE_SECRET = String(process.env.TELEGRAM_BRIDGE_SECRET || "").trim();
const MDM_API_BASE = String(process.env.MDM_API_BASE || "http://127.0.0.1:4000/api")
  .trim()
  .replace(/\/+$/, "");
const POLL_TIMEOUT_SEC = Math.max(5, Number(process.env.POLL_TIMEOUT_SEC || 25));
const RETRY_DELAY_MS = Math.max(500, Number(process.env.RETRY_DELAY_MS || 1500));

if (!BOT_TOKEN) {
  console.error("[ERROR] TELEGRAM_BOT_TOKEN is required.");
  process.exit(1);
}
if (!BRIDGE_SECRET) {
  console.error("[ERROR] TELEGRAM_BRIDGE_SECRET is required.");
  process.exit(1);
}

const TELEGRAM_API_BASE = `https://api.telegram.org/bot${BOT_TOKEN}`;
let telegramTransport = "fetch";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function commandFromText(text) {
  const source = String(text || "").trim();
  const match = source.match(/^\/([a-z_]+)(?:@[A-Za-z0-9_]+)?(?:\s+(.*))?$/i);
  if (!match) {
    return { command: "", arg: "" };
  }
  return {
    command: String(match[1] || "").toLowerCase(),
    arg: String(match[2] || "").trim(),
  };
}

async function telegramCall(method, payload) {
  if (telegramTransport === "powershell") {
    return telegramCallViaPowershell(method, payload);
  }
  try {
    const response = await fetch(`${TELEGRAM_API_BASE}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload || {}),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok || data?.ok === false) {
      const reason = String(data?.description || data?.message || `Telegram API ${method} failed`).trim();
      const error = new Error(reason);
      error.status = response.status;
      throw error;
    }
    return data;
  } catch (error) {
    const msg = String(error?.message || "").toLowerCase();
    if (msg.includes("fetch failed") || msg.includes("timeout")) {
      telegramTransport = "powershell";
      return telegramCallViaPowershell(method, payload);
    }
    throw error;
  }
}

function telegramCallViaPowershell(method, payload) {
  const url = `${TELEGRAM_API_BASE}/${method}`;
  const payloadBase64 = Buffer.from(JSON.stringify(payload || {}), "utf8").toString("base64");
  const script = [
    "$ErrorActionPreference='Stop'",
    "$url=$env:TG_URL",
    "$json=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($env:TG_PAYLOAD_B64))",
    "try {",
    "  $resp=Invoke-RestMethod -Uri $url -Method Post -ContentType 'application/json' -Body $json -TimeoutSec 50",
    "  $out=@{ok=$true;data=$resp} | ConvertTo-Json -Compress -Depth 100",
    "  Write-Output $out",
    "} catch {",
    "  $status=0",
    "  try { $status=[int]$_.Exception.Response.StatusCode.value__ } catch {}",
    "  $body=''",
    "  try {",
    "    $reader=New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())",
    "    $body=$reader.ReadToEnd()",
    "  } catch {}",
    "  $out=@{ok=$false;status=$status;message=$_.Exception.Message;body=$body} | ConvertTo-Json -Compress -Depth 20",
    "  Write-Output $out",
    "}",
  ].join("; ");

  return new Promise((resolve, reject) => {
    execFile(
      "powershell",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
      {
        timeout: 70000,
        maxBuffer: 1024 * 1024,
        env: {
          ...process.env,
          TG_URL: url,
          TG_PAYLOAD_B64: payloadBase64,
        },
      },
      (error, stdout, stderr) => {
        const lines = String(stdout || "")
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean);
        const raw = lines.length ? lines[lines.length - 1] : "";
        let parsed = null;
        if (raw) {
          try {
            parsed = JSON.parse(raw);
          } catch (_parseErr) {
            parsed = null;
          }
        }

        if (!parsed || parsed.ok !== true) {
          const reason = String(
            parsed?.message ||
              parsed?.body ||
              (stderr || "").trim() ||
              error?.message ||
              "Telegram API call failed"
          ).trim();
          const err = new Error(reason);
          const status = Number(parsed?.status || 0);
          if (status) {
            err.status = status;
          }
          reject(err);
          return;
        }

        const data = parsed.data || {};
        if (data?.ok === false) {
          const reason = String(data?.description || data?.message || "Telegram API rejected request").trim();
          const err = new Error(reason);
          err.status = Number(data?.error_code || 0) || undefined;
          reject(err);
          return;
        }
        resolve(data);
      }
    );
  });
}

async function sendText(chatId, text) {
  await telegramCall("sendMessage", {
    chat_id: chatId,
    text: String(text || ""),
    disable_web_page_preview: true,
  });
}

async function mdmPost(pathname, payload, attempts = 3) {
  let lastErr;
  for (let i = 1; i <= attempts; i += 1) {
    try {
      const response = await fetch(`${MDM_API_BASE}${pathname}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-telegram-bridge-secret": BRIDGE_SECRET,
        },
        body: JSON.stringify(payload || {}),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok || data?.ok === false) {
        const reason = String(data?.message || data?.error || "MDM request failed").trim();
        const error = new Error(reason);
        error.status = response.status;
        throw error;
      }
      return data;
    } catch (e) {
      lastErr = e;
      if (i < attempts && String(e?.message || "").toLowerCase().includes("fetch failed")) {
        await sleep(300 * i);
        continue;
      }
      throw e;
    }
  }
  throw lastErr;
}

function helpText() {
  return [
    "MDM bot commands:",
    "/start <token> - link Telegram with MDM",
    "/balance - show your MDM and MB balance",
    "/unlink - unlink Telegram from MDM",
    "/help - show commands",
  ].join("\n");
}

function formatRub(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) {
    return "—";
  }
  const rounded = Math.round(amount * 100) / 100;
  const hasFraction = Math.abs(rounded % 1) > 0.00001;
  return `${rounded.toLocaleString("ru-RU", {
    minimumFractionDigits: hasFraction ? 2 : 0,
    maximumFractionDigits: 2,
  })} ₽`;
}

function roleLabel(role) {
  const normalized = String(role || "")
    .trim()
    .toLowerCase();
  if (normalized === "admin") {
    return "админ";
  }
  if (normalized === "seller") {
    return "продавец";
  }
  return "покупатель";
}

async function handleStart(message, startArg) {
  const chatId = String(message?.chat?.id || "").trim();
  if (!chatId) {
    return;
  }

  const token = String(startArg || "").trim();
  if (!token) {
    await sendText(chatId, `Привет! Для привязки открой ссылку из профиля МДМ.\n\n${helpText()}`);
    return;
  }

  try {
    const result = await mdmPost("/integrations/telegram/confirm", {
      token,
      chatId,
      username: String(message?.from?.username || "").trim(),
    });

    await sendText(
      chatId,
      `Готово. Telegram привязан к MDM аккаунту ${result?.username || ""}.\nТеперь вы будете получать уведомления о чатах и заказах.`
    );
  } catch (error) {
    if (error?.status === 410) {
      await sendText(chatId, "Ссылка истекла. Создайте новую в профиле МДМ и нажмите Start снова.");
      return;
    }
    if (error?.status === 404) {
      await sendText(chatId, "Ссылка не найдена. Сгенерируйте новую в профиле МДМ.");
      return;
    }
    await sendText(chatId, `Не удалось привязать Telegram: ${error.message}`);
  }
}

async function handleUnlink(message) {
  const chatId = String(message?.chat?.id || "").trim();
  if (!chatId) {
    return;
  }
  try {
    const result = await mdmPost("/integrations/telegram/unlink", { chatId });
    if (result?.removed) {
      await sendText(chatId, "Telegram отвязан от MDM.");
    } else {
      await sendText(chatId, "Этот чат не привязан к MDM.");
    }
  } catch (error) {
    await sendText(chatId, `Не удалось выполнить отвязку: ${error.message}`);
  }
}

async function handleBalance(message) {
  const chatId = String(message?.chat?.id || "").trim();
  if (!chatId) {
    return;
  }
  try {
    const result = await mdmPost("/integrations/telegram/balance", { chatId });
    const user = result?.user || {};
    const bank = result?.bank || {};
    const lines = [`Профиль: ${user.username || "—"} (${roleLabel(user.role)})`];

    if (bank?.linked) {
      const bankName = String(bank.username || "—");
      if (bank.exists === true) {
        lines.push(`MB Банк: привязан (${bankName})`);
        lines.push(`Баланс MB: ${formatRub(bank.balance)}`);
      } else if (bank.exists === false) {
        lines.push(`MB Банк: привязан (${bankName}), счет не найден`);
      } else {
        lines.push(`MB Банк: привязан (${bankName}), статус временно недоступен`);
      }
    } else {
      lines.push("MB Банк: не привязан");
    }

    await sendText(chatId, lines.join("\n"));
  } catch (error) {
    if (error?.status === 404) {
      await sendText(chatId, "Этот чат не привязан к MDM. Привяжите Telegram в профиле MDM.");
      return;
    }
    await sendText(chatId, `Не удалось получить баланс: ${error.message}`);
  }
}

async function handleMessage(message) {
  const chatId = String(message?.chat?.id || "").trim();
  const text = String(message?.text || "").trim();
  if (!chatId || !text) {
    return;
  }

  const parsed = commandFromText(text);
  switch (parsed.command) {
    case "start":
      await handleStart(message, parsed.arg);
      return;
    case "balance":
    case "bal":
      await handleBalance(message);
      return;
    case "unlink":
      await handleUnlink(message);
      return;
    case "help":
      await sendText(chatId, helpText());
      return;
    case "ping":
      await sendText(chatId, "pong");
      return;
    default:
      await sendText(chatId, helpText());
      return;
  }
}

async function run() {
  let offset = 0;
  console.log("[TG] bot started");
  console.log(`[TG] MDM API base: ${MDM_API_BASE}`);

  while (true) {
    try {
      const updates = await telegramCall("getUpdates", {
        timeout: POLL_TIMEOUT_SEC,
        offset,
        allowed_updates: ["message"],
      });
      const items = Array.isArray(updates?.result) ? updates.result : [];
      for (const update of items) {
        const updateId = Number(update?.update_id || 0);
        if (Number.isFinite(updateId) && updateId >= offset) {
          offset = updateId + 1;
        }
        if (update?.message) {
          await handleMessage(update.message);
        }
      }
    } catch (error) {
      console.error("[TG] polling error:", error.message || error);
      await sleep(RETRY_DELAY_MS);
    }
  }
}

run().catch((error) => {
  console.error("[TG] fatal:", error);
  process.exit(1);
});
