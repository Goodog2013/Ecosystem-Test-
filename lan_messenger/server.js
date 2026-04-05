#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const http = require("http");
const { URL } = require("url");

const HOST = process.env.HOST || "0.0.0.0";
const PORT = Number.parseInt(process.env.PORT || "4010", 10);
const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "chat-db.json");
const PUBLIC_DIR = path.join(__dirname, "public");
const BOTS_DIR = path.join(__dirname, "bots");
const UPLOADS_DIR = path.join(__dirname, "uploads");

const PRESENCE_TTL_MS = 45_000;
const SAVE_DEBOUNCE_MS = 350;
const MAX_MESSAGES_PER_ROOM = 500;
const MAX_MESSAGE_LENGTH = 1200;
const MAX_NAME_LENGTH = 24;
const MAX_ROOMS = 220;
const MAX_IP_REGISTRY = 5000;
const MAX_BOTS = 500;
const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;
const MAX_SIGNAL_EVENTS = 3200;
const SIGNAL_TTL_MS = 2 * 60 * 1000;
const REQUEST_BODY_LIMIT = 20 * 1024 * 1024;
const SIGNAL_BODY_LIMIT = 1024 * 1024;

const MESSAGE_KIND_SET = new Set(["text", "file", "audio", "video_note"]);
const SIGNAL_TYPE_SET = new Set([
  "call-invite",
  "call-join",
  "call-end",
  "call-busy",
  "offer",
  "answer",
  "ice",
  "stream-start",
  "stream-viewer-join",
  "stream-end",
]);

const DM_ROOM_RE = /^dm_[a-z0-9_.-]{3,24}__[a-z0-9_.-]{3,24}$/;
const GROUP_ROOM_RE = /^grp_[a-z0-9_.-]{3,40}$/;
const CHANNEL_ROOM_RE = /^chn_[a-z0-9_.-]{3,40}$/;

let state = createInitialState();
let saveTimer = null;
let saveQueue = Promise.resolve();
let shuttingDown = false;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".py": "text/x-python; charset=utf-8",
  ".webm": "video/webm",
  ".mp4": "video/mp4",
  ".ogg": "audio/ogg",
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".pdf": "application/pdf",
  ".zip": "application/zip",
};

let nextSignalSeq = 1;
const signalBus = [];

function nowMs() {
  return Date.now();
}

function toInt(value, fallback = 0) {
  const n = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function sanitizeRoomId(raw) {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9_.-]/g, "");
}

function sanitizeRoomTitle(raw, fallbackId = "") {
  const title = String(raw || "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[^0-9A-Za-z _.-]/g, "");
  if (title) return title.slice(0, 40);
  const fallback = String(fallbackId || "").trim();
  return fallback.slice(0, 40) || "chat";
}

function sanitizeDescription(raw) {
  return String(raw || "")
    .replace(/\r\n?/g, "\n")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 220);
}

function sanitizeName(raw) {
  const cleaned = String(raw || "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[^0-9A-Za-z _.-]/g, "");
  if (!cleaned) return `Guest-${Math.floor(Math.random() * 9000 + 1000)}`;
  return cleaned.slice(0, MAX_NAME_LENGTH);
}

function sanitizeLogin(raw) {
  return String(raw || "")
    .trim()
    .replace(/\s+/g, "")
    .replace(/[^0-9A-Za-z_.-]/g, "")
    .slice(0, MAX_NAME_LENGTH);
}

function sanitizeText(raw) {
  const text = String(raw || "")
    .replace(/\r\n?/g, "\n")
    .trim();
  if (!text) return "";
  return text.slice(0, MAX_MESSAGE_LENGTH);
}

function sanitizeMessageKind(raw) {
  const kind = String(raw || "text").trim().toLowerCase();
  return MESSAGE_KIND_SET.has(kind) ? kind : "text";
}

function sanitizeFileName(raw) {
  const value = String(raw || "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "")
    .replace(/[\u0000-\u001f]/g, "");
  if (!value) return "file";
  return value.slice(0, 96);
}

function sanitizeMime(raw) {
  const value = String(raw || "application/octet-stream").trim().toLowerCase();
  if (!/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/.test(value)) {
    return "application/octet-stream";
  }
  return value.slice(0, 80);
}

function sanitizeUploadUrl(raw) {
  const text = String(raw || "").trim();
  if (!text || !text.startsWith("/uploads/")) return "";
  const normalized = path.posix.normalize(text);
  if (!normalized.startsWith("/uploads/")) return "";
  if (normalized.includes("..")) return "";
  return normalized;
}

function normalizeFileMeta(rawFile) {
  if (!rawFile || typeof rawFile !== "object") return null;
  const name = sanitizeFileName(rawFile.name || rawFile.fileName);
  const url = sanitizeUploadUrl(rawFile.url || rawFile.path);
  const mime = sanitizeMime(rawFile.mime || rawFile.contentType);
  const size = clamp(toInt(rawFile.size, 0), 0, MAX_UPLOAD_BYTES);
  if (!name || !url) return null;
  return { name, url, mime, size };
}

function parseDataUrl(rawData) {
  const text = String(rawData || "").trim();
  const match = /^data:([^;,]+)?;base64,([A-Za-z0-9+/=\s]+)$/.exec(text);
  if (!match) return null;

  const mime = sanitizeMime(match[1] || "application/octet-stream");
  const base64 = String(match[2] || "").replace(/\s+/g, "");
  if (!base64) return null;

  let buffer = null;
  try {
    buffer = Buffer.from(base64, "base64");
  } catch (_error) {
    return null;
  }
  if (!buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) return null;
  return { mime, buffer };
}

function sanitizeSlug(raw, fallback = "room", maxLen = 26) {
  const cleaned = String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9.-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "");
  if (cleaned) return cleaned.slice(0, maxLen);
  return fallback;
}

function normalizeIp(rawIp) {
  const text = String(rawIp || "").trim();
  if (!text) return "";
  if (text.startsWith("::ffff:")) return text.slice(7);
  return text;
}

function getRoomTypeById(roomId) {
  const safe = sanitizeRoomId(roomId);
  if (DM_ROOM_RE.test(safe)) return "dm";
  if (GROUP_ROOM_RE.test(safe)) return "group";
  if (CHANNEL_ROOM_RE.test(safe)) return "channel";
  return "";
}

function isDirectRoomId(roomId) {
  return getRoomTypeById(roomId) === "dm";
}

function isGroupOrChannelRoomId(roomId) {
  const type = getRoomTypeById(roomId);
  return type === "group" || type === "channel";
}

function getDmParticipants(roomId) {
  const safe = sanitizeRoomId(roomId);
  if (!DM_ROOM_RE.test(safe)) return [];
  const pair = safe.slice(3).split("__");
  if (pair.length !== 2) return [];
  const left = sanitizeLogin(pair[0]).toLowerCase();
  const right = sanitizeLogin(pair[1]).toLowerCase();
  if (!left || !right || left === right) return [];
  return [left, right];
}

function createInitialState() {
  const now = nowMs();
  return {
    schemaVersion: 2,
    nextSeq: 1,
    updatedAt: now,
    ipRegistry: {},
    rooms: {},
    bots: {},
  };
}
function normalizeMessage(raw, seqFallback) {
  if (!raw || typeof raw !== "object") return null;
  const kind = sanitizeMessageKind(raw.kind || "text");
  const text = sanitizeText(raw.text);
  const file = normalizeFileMeta(raw.file);
  if (kind === "text" && !text) return null;
  if (kind !== "text" && !file) return null;
  const seq = clamp(toInt(raw.seq, seqFallback), 1, Number.MAX_SAFE_INTEGER);
  return {
    id: String(raw.id || `m_${seq}_${Math.random().toString(36).slice(2, 8)}`),
    seq,
    author: sanitizeName(raw.author || "User"),
    kind,
    text,
    file: file || null,
    createdAt: clamp(toInt(raw.createdAt, nowMs()), 0, Number.MAX_SAFE_INTEGER),
  };
}

function normalizePresence(rawPresence) {
  const normalized = {};
  if (!rawPresence || typeof rawPresence !== "object") return normalized;
  const now = nowMs();
  for (const [rawName, rawSeen] of Object.entries(rawPresence)) {
    const name = sanitizeName(rawName);
    const seenAt = clamp(toInt(rawSeen, now), 0, Number.MAX_SAFE_INTEGER);
    if (!name) continue;
    if (now - seenAt > PRESENCE_TTL_MS) continue;
    normalized[name] = seenAt;
  }
  return normalized;
}

function normalizeRoomType(rawType, roomId) {
  const type = String(rawType || "").trim().toLowerCase();
  if (type === "dm" || type === "group" || type === "channel") return type;
  return getRoomTypeById(roomId);
}

function normalizeRoomSettings(rawSettings, type) {
  const src = rawSettings && typeof rawSettings === "object" ? rawSettings : {};
  if (type === "dm") {
    return {
      description: "",
      isPrivate: true,
      allowMemberPosts: true,
    };
  }
  return {
    description: sanitizeDescription(src.description),
    isPrivate: Boolean(src.isPrivate),
    allowMemberPosts: type === "channel" ? src.allowMemberPosts !== false : true,
  };
}

function sanitizeRole(raw) {
  const role = String(raw || "").trim().toLowerCase();
  if (role === "owner" || role === "admin" || role === "member" || role === "bot") {
    return role;
  }
  return "member";
}

function normalizeMembers(rawMembers) {
  const members = {};
  if (!rawMembers) return members;

  if (Array.isArray(rawMembers)) {
    for (const item of rawMembers) {
      const login = sanitizeLogin(item).toLowerCase();
      if (!login) continue;
      members[login] = "member";
    }
    return members;
  }

  if (typeof rawMembers !== "object") return members;
  for (const [rawLogin, rawRole] of Object.entries(rawMembers)) {
    const login = sanitizeLogin(rawLogin).toLowerCase();
    if (!login) continue;
    members[login] = sanitizeRole(rawRole);
  }
  return members;
}

function normalizeRoom(rawId, rawRoom) {
  const roomId = sanitizeRoomId(rawId);
  const type = normalizeRoomType(rawRoom?.type, roomId);
  if (!roomId || !type) return null;

  const now = nowMs();
  const source = rawRoom && typeof rawRoom === "object" ? rawRoom : {};

  const messages = [];
  const rawMessages = Array.isArray(source.messages) ? source.messages : [];
  let seqFallback = 1;
  for (const item of rawMessages) {
    const normalized = normalizeMessage(item, seqFallback);
    if (!normalized) continue;
    seqFallback = Math.max(seqFallback, normalized.seq + 1);
    messages.push(normalized);
  }
  messages.sort((a, b) => a.seq - b.seq);

  if (messages.length > MAX_MESSAGES_PER_ROOM) {
    messages.splice(0, messages.length - MAX_MESSAGES_PER_ROOM);
  }

  const owner = sanitizeLogin(source.owner).toLowerCase();
  const members = normalizeMembers(source.members);
  if (type !== "dm" && owner) {
    members[owner] = "owner";
  }

  const lastSeq = messages.length > 0 ? messages[messages.length - 1].seq : 0;

  return {
    id: roomId,
    type,
    title: sanitizeRoomTitle(source.title, roomId),
    owner: type === "dm" ? "" : owner,
    settings: normalizeRoomSettings(source.settings, type),
    members: type === "dm" ? {} : members,
    createdAt: clamp(toInt(source.createdAt, now), 0, Number.MAX_SAFE_INTEGER),
    updatedAt: clamp(
      toInt(source.updatedAt, messages[messages.length - 1]?.createdAt || now),
      0,
      Number.MAX_SAFE_INTEGER
    ),
    messages,
    presence: normalizePresence(source.presence),
    _lastSeq: lastSeq,
  };
}

function normalizeBot(rawId, rawBot) {
  const src = rawBot && typeof rawBot === "object" ? rawBot : {};
  const id = sanitizeSlug(rawId, "bot", 40);
  const owner = sanitizeLogin(src.owner).toLowerCase();
  const login = sanitizeLogin(src.login || src.name).toLowerCase();
  const roomId = sanitizeRoomId(src.roomId || src.targetRoomId);
  if (!id || !owner || !login || !isGroupOrChannelRoomId(roomId)) return null;

  return {
    id,
    name: sanitizeRoomTitle(src.name || login, login),
    login,
    owner,
    roomId,
    trigger: String(src.trigger || "!ping").slice(0, 80),
    response: String(src.response || "pong").slice(0, 320),
    createdAt: clamp(toInt(src.createdAt, nowMs()), 0, Number.MAX_SAFE_INTEGER),
    fileName: String(src.fileName || `${id}.py`).replace(/[^a-zA-Z0-9_.-]/g, ""),
  };
}

function normalizeIpRegistry(rawRegistry) {
  const registry = {};
  if (!rawRegistry || typeof rawRegistry !== "object") return registry;
  const now = nowMs();

  let count = 0;
  for (const [rawIp, rawEntry] of Object.entries(rawRegistry)) {
    if (count >= MAX_IP_REGISTRY) break;
    const ip = normalizeIp(rawIp);
    if (!ip) continue;
    if (!rawEntry || typeof rawEntry !== "object") continue;

    const login = sanitizeLogin(rawEntry.login || rawEntry.name);
    if (!login) continue;

    registry[ip] = {
      login,
      registeredAt: clamp(toInt(rawEntry.registeredAt, now), 0, Number.MAX_SAFE_INTEGER),
      lastSeenAt: clamp(toInt(rawEntry.lastSeenAt, now), 0, Number.MAX_SAFE_INTEGER),
    };
    count += 1;
  }

  return registry;
}

function normalizeState(rawState) {
  if (!rawState || typeof rawState !== "object") {
    return createInitialState();
  }

  const normalized = {
    schemaVersion: 2,
    nextSeq: clamp(toInt(rawState.nextSeq, 1), 1, Number.MAX_SAFE_INTEGER),
    updatedAt: clamp(toInt(rawState.updatedAt, nowMs()), 0, Number.MAX_SAFE_INTEGER),
    ipRegistry: normalizeIpRegistry(rawState.ipRegistry),
    rooms: {},
    bots: {},
  };

  const rawRooms = rawState.rooms && typeof rawState.rooms === "object" ? rawState.rooms : {};
  let maxSeq = 0;
  let roomCount = 0;

  for (const [rawId, room] of Object.entries(rawRooms)) {
    if (roomCount >= MAX_ROOMS) break;
    const normalizedRoom = normalizeRoom(rawId, room);
    if (!normalizedRoom) continue;

    normalized.rooms[normalizedRoom.id] = {
      id: normalizedRoom.id,
      type: normalizedRoom.type,
      title: normalizedRoom.title,
      owner: normalizedRoom.owner,
      settings: normalizedRoom.settings,
      members: normalizedRoom.members,
      createdAt: normalizedRoom.createdAt,
      updatedAt: normalizedRoom.updatedAt,
      messages: normalizedRoom.messages,
      presence: normalizedRoom.presence,
    };
    maxSeq = Math.max(maxSeq, normalizedRoom._lastSeq);
    roomCount += 1;
  }

  const rawBots = rawState.bots && typeof rawState.bots === "object" ? rawState.bots : {};
  let botCount = 0;
  for (const [rawId, rawBot] of Object.entries(rawBots)) {
    if (botCount >= MAX_BOTS) break;
    const bot = normalizeBot(rawId, rawBot);
    if (!bot) continue;
    normalized.bots[bot.id] = bot;
    botCount += 1;
  }

  normalized.nextSeq = Math.max(normalized.nextSeq, maxSeq + 1, 1);
  return normalized;
}

function buildSnapshotForDisk() {
  const snapshot = {
    schemaVersion: 2,
    nextSeq: state.nextSeq,
    updatedAt: state.updatedAt,
    ipRegistry: state.ipRegistry || {},
    rooms: {},
    bots: state.bots || {},
  };

  for (const room of Object.values(state.rooms)) {
    snapshot.rooms[room.id] = {
      id: room.id,
      type: room.type,
      title: room.title,
      owner: room.owner,
      settings: room.settings,
      members: room.members,
      createdAt: room.createdAt,
      updatedAt: room.updatedAt,
      messages: room.messages,
      presence: {},
    };
  }

  return snapshot;
}

async function persistNow() {
  const payload = JSON.stringify(buildSnapshotForDisk(), null, 2);
  await fs.promises.mkdir(DATA_DIR, { recursive: true });
  const tmpFile = `${DATA_FILE}.tmp`;
  await fs.promises.writeFile(tmpFile, payload, "utf8");
  await fs.promises.rename(tmpFile, DATA_FILE);
}

function queuePersist() {
  if (shuttingDown) return;
  if (saveTimer) clearTimeout(saveTimer);

  saveTimer = setTimeout(() => {
    saveTimer = null;
    saveQueue = saveQueue
      .then(() => persistNow())
      .catch((error) => {
        console.error("[WARN] Failed to persist messenger data:", error.message);
      });
  }, SAVE_DEBOUNCE_MS);
}

async function flushPendingSave() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
    saveQueue = saveQueue
      .then(() => persistNow())
      .catch((error) => {
        console.error("[WARN] Failed to persist messenger data:", error.message);
      });
  }
  await saveQueue;
}

function cleanupPresence(room) {
  const now = nowMs();
  let changed = false;
  for (const [name, lastSeenAt] of Object.entries(room.presence || {})) {
    if (now - toInt(lastSeenAt, 0) > PRESENCE_TTL_MS) {
      delete room.presence[name];
      changed = true;
    }
  }
  return changed;
}

function cleanupAllPresence() {
  let changed = false;
  for (const room of Object.values(state.rooms)) {
    if (cleanupPresence(room)) changed = true;
  }
  return changed;
}

function getOnlineUsers(room) {
  cleanupPresence(room);
  return Object.keys(room.presence || {}).sort((a, b) => a.localeCompare(b, "en"));
}

function getRoomParticipants(room) {
  if (!room) return [];
  if (room.type === "dm") return getDmParticipants(room.id);
  return Object.keys(room.members || {});
}

function isRoomMember(room, login) {
  const actor = sanitizeLogin(login).toLowerCase();
  if (!actor || !room) return false;
  if (room.type === "dm") {
    const [left, right] = getDmParticipants(room.id);
    return actor === left || actor === right;
  }
  return Boolean(room.members && room.members[actor]);
}

function canReadRoom(room, login) {
  const actor = sanitizeLogin(login).toLowerCase();
  if (!room || !actor) return false;
  if (room.type === "dm") return isRoomMember(room, actor);
  if (room.settings?.isPrivate) return isRoomMember(room, actor);
  return true;
}

function canSendRoom(room, login) {
  const actor = sanitizeLogin(login).toLowerCase();
  if (!room || !actor) return false;

  if (room.type === "dm") return isRoomMember(room, actor);
  if (room.type === "group") return isRoomMember(room, actor);
  if (room.type === "channel") {
    if (!isRoomMember(room, actor)) return false;
    const role = sanitizeRole(room.members?.[actor]);
    if (role === "owner" || role === "admin" || role === "bot") return true;
    return room.settings?.allowMemberPosts !== false;
  }
  return false;
}

function canManageRoom(room, login) {
  const actor = sanitizeLogin(login).toLowerCase();
  if (!room || !actor || room.type === "dm") return false;
  const role = sanitizeRole(room.members?.[actor]);
  return role === "owner" || role === "admin";
}

function canJoinRoom(room, login) {
  const actor = sanitizeLogin(login).toLowerCase();
  if (!room || !actor || room.type === "dm") return false;
  if (isRoomMember(room, actor)) return true;
  return room.settings?.isPrivate !== true;
}

function getOrCreateDmRoom(rawRoomId, rawTitle = "") {
  const roomId = sanitizeRoomId(rawRoomId);
  if (!isDirectRoomId(roomId)) return null;

  const existing = state.rooms[roomId];
  if (existing) return existing;
  if (Object.keys(state.rooms).length >= MAX_ROOMS) return null;

  const now = nowMs();
  const created = {
    id: roomId,
    type: "dm",
    title: sanitizeRoomTitle(rawTitle, roomId),
    owner: "",
    settings: normalizeRoomSettings({}, "dm"),
    members: {},
    createdAt: now,
    updatedAt: now,
    messages: [],
    presence: {},
  };

  state.rooms[roomId] = created;
  state.updatedAt = now;
  queuePersist();
  return created;
}

function generateConversationId(kind, title) {
  const prefix = kind === "group" ? "grp" : "chn";
  const slug = sanitizeSlug(title, kind === "group" ? "group" : "channel", 24);
  for (let i = 0; i < 40; i += 1) {
    const suffix = Math.random().toString(36).slice(2, 7);
    const candidate = sanitizeRoomId(`${prefix}_${slug}_${suffix}`);
    if (!state.rooms[candidate]) return candidate;
  }
  return sanitizeRoomId(`${prefix}_${Date.now().toString(36)}`);
}

function createConversation(kind, title, creator, settings = {}) {
  const safeKind = kind === "group" ? "group" : kind === "channel" ? "channel" : "";
  const owner = sanitizeLogin(creator).toLowerCase();
  if (!safeKind || !owner) return null;
  if (Object.keys(state.rooms).length >= MAX_ROOMS) return null;

  const id = generateConversationId(safeKind, title);
  const now = nowMs();
  const room = {
    id,
    type: safeKind,
    title: sanitizeRoomTitle(title, id),
    owner,
    settings: normalizeRoomSettings(settings, safeKind),
    members: { [owner]: "owner" },
    createdAt: now,
    updatedAt: now,
    messages: [],
    presence: {},
  };

  state.rooms[id] = room;
  state.updatedAt = now;
  queuePersist();
  return room;
}
function joinRoomAsMember(room, login, role = "member") {
  if (!room || room.type === "dm") return false;
  const actor = sanitizeLogin(login).toLowerCase();
  if (!actor) return false;
  room.members[actor] = sanitizeRole(role);
  room.updatedAt = nowMs();
  state.updatedAt = room.updatedAt;
  queuePersist();
  return true;
}

function leaveRoomMember(room, login) {
  if (!room || room.type === "dm") return false;
  const actor = sanitizeLogin(login).toLowerCase();
  if (!actor) return false;
  const current = sanitizeRole(room.members?.[actor]);
  if (!current || current === "owner") return false;

  delete room.members[actor];
  delete room.presence[sanitizeName(actor)];
  room.updatedAt = nowMs();
  state.updatedAt = room.updatedAt;
  queuePersist();
  return true;
}

function patchConversationSettings(room, patch) {
  if (!room || room.type === "dm") return null;

  if (typeof patch.title === "string") {
    room.title = sanitizeRoomTitle(patch.title, room.id);
  }

  const nextSettings = { ...room.settings };
  if (Object.prototype.hasOwnProperty.call(patch, "description")) {
    nextSettings.description = sanitizeDescription(patch.description);
  }
  if (Object.prototype.hasOwnProperty.call(patch, "isPrivate")) {
    nextSettings.isPrivate = Boolean(patch.isPrivate);
  }
  if (room.type === "channel" && Object.prototype.hasOwnProperty.call(patch, "allowMemberPosts")) {
    nextSettings.allowMemberPosts = patch.allowMemberPosts !== false;
  }

  room.settings = normalizeRoomSettings(nextSettings, room.type);
  room.updatedAt = nowMs();
  state.updatedAt = room.updatedAt;
  queuePersist();
  return room;
}

function pushMessage(room, author, payload) {
  const source = payload && typeof payload === "object" ? payload : { text: payload };
  const kind = sanitizeMessageKind(source.kind || "text");
  const text = sanitizeText(source.text);
  const file = normalizeFileMeta(source.file);
  if (kind === "text" && !text) return null;
  if (kind !== "text" && !file) return null;

  const now = nowMs();
  const message = {
    id: `m_${now.toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    seq: state.nextSeq++,
    author: sanitizeName(author),
    kind,
    text,
    file: file || null,
    createdAt: now,
  };

  room.messages.push(message);
  if (room.messages.length > MAX_MESSAGES_PER_ROOM) {
    room.messages.splice(0, room.messages.length - MAX_MESSAGES_PER_ROOM);
  }
  room.updatedAt = now;
  room.presence[message.author] = now;
  state.updatedAt = now;
  queuePersist();
  return message;
}

function getMessagePreviewText(message) {
  const msg = message && typeof message === "object" ? message : null;
  if (!msg) return "";
  if (msg.kind === "audio") return msg.text || "Аудиосообщение";
  if (msg.kind === "video_note") return msg.text || "Видео-кружок";
  if (msg.kind === "file") {
    const name = msg.file?.name ? String(msg.file.name) : "Файл";
    return msg.text ? `${name}: ${msg.text}` : name;
  }
  return sanitizeText(msg.text);
}

function sanitizeBotName(raw) {
  const value = String(raw || "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[^0-9A-Za-z _.-]/g, "");
  return value.slice(0, 24);
}

function makeBotId(name) {
  const slug = sanitizeSlug(name, "bot", 20);
  for (let i = 0; i < 40; i += 1) {
    const suffix = Math.random().toString(36).slice(2, 7);
    const id = sanitizeSlug(`bot_${slug}_${suffix}`, "bot", 40);
    if (!state.bots[id]) return id;
  }
  return sanitizeSlug(`bot_${Date.now().toString(36)}`, "bot", 40);
}

function createBotScript(bot) {
  const esc = (value) => JSON.stringify(String(value || ""));
  return [
    "#!/usr/bin/env python3",
    "# -*- coding: utf-8 -*-",
    "\"\"\"Generated LAN Messenger bot\"\"\"",
    "",
    "import json",
    "import time",
    "import urllib.error",
    "import urllib.request",
    "",
    `API_BASE = ${esc(`http://127.0.0.1:${PORT}/api`)}`,
    `ROOM_ID = ${esc(bot.roomId)}`,
    `BOT_LOGIN = ${esc(bot.login)}`,
    `TRIGGER = ${esc(bot.trigger.toLowerCase())}`,
    `RESPONSE = ${esc(bot.response)}`,
    "POLL_DELAY_SEC = 1.5",
    "last_seq = 0",
    "",
    "def http_json(method, path, payload=None):",
    "    url = API_BASE + path",
    "    data = None",
    "    headers = {'Content-Type': 'application/json'}",
    "    if payload is not None:",
    "        data = json.dumps(payload).encode('utf-8')",
    "    req = urllib.request.Request(url, data=data, headers=headers, method=method)",
    "    try:",
    "        with urllib.request.urlopen(req, timeout=8) as resp:",
    "            return json.loads(resp.read().decode('utf-8'))",
    "    except urllib.error.HTTPError as exc:",
    "        print(f'[WARN] HTTP {exc.code} {path}')",
    "        return None",
    "    except Exception as exc:",
    "        print(f'[WARN] Request failed: {exc}')",
    "        return None",
    "",
    "def main():",
    "    global last_seq",
    "    print(f'[INFO] Bot started in {ROOM_ID} as {BOT_LOGIN}')",
    "    while True:",
    "        data = http_json('GET', f'/messages?room={ROOM_ID}&after={last_seq}&actor={BOT_LOGIN}')",
    "        if data and data.get('ok'):",
    "            for message in data.get('messages') or []:",
    "                seq = int(message.get('seq') or 0)",
    "                if seq > last_seq:",
    "                    last_seq = seq",
    "                author = str(message.get('author') or '')",
    "                text = str(message.get('text') or '')",
    "                if not text:",
    "                    continue",
    "                if author.lower() == BOT_LOGIN.lower():",
    "                    continue",
    "                if TRIGGER and TRIGGER not in text.lower():",
    "                    continue",
    "                http_json('POST', '/send', {'room': ROOM_ID, 'author': BOT_LOGIN, 'text': RESPONSE})",
    "        time.sleep(POLL_DELAY_SEC)",
    "",
    "if __name__ == '__main__':",
    "    try:",
    "        main()",
    "    except KeyboardInterrupt:",
    "        print('[INFO] Bot stopped')",
  ].join("\n");
}

async function createPythonBot({ name, owner, roomId, trigger, response }) {
  const safeOwner = sanitizeLogin(owner).toLowerCase();
  const safeRoomId = sanitizeRoomId(roomId);
  const safeName = sanitizeBotName(name);
  const safeTrigger = String(trigger || "!ping").trim().slice(0, 80);
  const safeResponse = String(response || "pong").trim().slice(0, 320);

  if (!safeOwner || !safeName || !safeTrigger || !safeResponse) return null;

  const room = state.rooms[safeRoomId];
  if (!room || !isGroupOrChannelRoomId(safeRoomId) || room.type === "dm") return null;
  if (!canManageRoom(room, safeOwner)) return null;
  if (Object.keys(state.bots).length >= MAX_BOTS) return null;

  const botId = makeBotId(safeName);
  const botLoginBase = sanitizeLogin(safeName).toLowerCase();
  const botLogin = botLoginBase.length >= 3 ? botLoginBase : `bot${Math.floor(Math.random() * 900 + 100)}`;
  const fileName = `${botId}.py`;

  const bot = {
    id: botId,
    name: safeName,
    login: botLogin,
    owner: safeOwner,
    roomId: safeRoomId,
    trigger: safeTrigger,
    response: safeResponse,
    createdAt: nowMs(),
    fileName,
  };

  await fs.promises.mkdir(BOTS_DIR, { recursive: true });
  await fs.promises.writeFile(path.join(BOTS_DIR, fileName), createBotScript(bot), "utf8");

  room.members[bot.login] = room.members[bot.login] || "bot";
  room.updatedAt = nowMs();

  state.bots[bot.id] = bot;
  state.updatedAt = nowMs();
  queuePersist();

  return { ...bot, filePath: `bots/${fileName}` };
}

function getRequestBody(req, limitBytes = REQUEST_BODY_LIMIT) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > limitBytes) {
        reject(Object.assign(new Error("Body too large"), { statusCode: 413 }));
        req.destroy();
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

async function parseJsonBody(req, limitBytes = REQUEST_BODY_LIMIT) {
  const body = await getRequestBody(req, limitBytes);
  if (!body.trim()) return {};
  try {
    return JSON.parse(body);
  } catch (_error) {
    throw Object.assign(new Error("Invalid JSON"), { statusCode: 400 });
  }
}
function writeJson(res, statusCode, payload) {
  const json = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(json);
}

function writeText(res, statusCode, text) {
  res.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(text);
}

function getClientIp(req) {
  const forwarded = String(req.headers["x-forwarded-for"] || "").trim();
  if (forwarded) {
    const first = forwarded.split(",")[0].trim();
    return normalizeIp(first);
  }
  return normalizeIp(req.socket?.remoteAddress || "");
}

function getIpRegistration(ip) {
  const key = normalizeIp(ip);
  if (!key) return null;
  const registry = state.ipRegistry || {};
  const entry = registry[key];
  if (!entry || typeof entry !== "object") return null;
  const login = sanitizeLogin(entry.login);
  if (!login) return null;
  return {
    ip: key,
    login,
    registeredAt: toInt(entry.registeredAt, 0),
    lastSeenAt: toInt(entry.lastSeenAt, 0),
  };
}

function touchIpRegistration(ip) {
  const key = normalizeIp(ip);
  if (!key) return null;
  if (!state.ipRegistry || typeof state.ipRegistry !== "object") state.ipRegistry = {};
  const existing = getIpRegistration(key);
  if (!existing) return null;

  state.ipRegistry[key] = {
    login: existing.login,
    registeredAt: existing.registeredAt || nowMs(),
    lastSeenAt: nowMs(),
  };
  return state.ipRegistry[key];
}

function registerIpLogin(ip, login) {
  const key = normalizeIp(ip);
  const safeLogin = sanitizeLogin(login);
  if (!key || !safeLogin) return null;

  if (!state.ipRegistry || typeof state.ipRegistry !== "object") state.ipRegistry = {};
  if (!state.ipRegistry[key] && Object.keys(state.ipRegistry).length >= MAX_IP_REGISTRY) return null;

  const current = getIpRegistration(key);
  const now = nowMs();
  state.ipRegistry[key] = {
    login: safeLogin,
    registeredAt: current?.registeredAt || now,
    lastSeenAt: now,
  };
  state.updatedAt = now;
  queuePersist();
  return state.ipRegistry[key];
}

function serializeRoomForList(room, actorLogin) {
  const lastMessage = room.messages[room.messages.length - 1] || null;
  const actor = sanitizeLogin(actorLogin).toLowerCase();
  const joined = actor ? isRoomMember(room, actor) : false;
  const canPost = actor ? canSendRoom(room, actor) : false;
  const canManage = actor ? canManageRoom(room, actor) : false;

  let peer = "";
  if (room.type === "dm" && actor) {
    const [left, right] = getDmParticipants(room.id);
    if (actor === left) peer = right;
    else if (actor === right) peer = left;
  }

  return {
    id: room.id,
    type: room.type,
    title: room.title,
    owner: room.owner,
    peer,
    settings: room.settings,
    updatedAt: room.updatedAt,
    messageCount: room.messages.length,
    onlineCount: getOnlineUsers(room).length,
    memberCount: getRoomParticipants(room).length,
    joined: room.type === "dm" ? true : joined,
    canPost,
    canManage,
    lastMessage: lastMessage
      ? {
          author: lastMessage.author,
          kind: sanitizeMessageKind(lastMessage.kind || "text"),
          text: getMessagePreviewText(lastMessage).slice(0, 80),
          file: lastMessage.file || null,
          createdAt: lastMessage.createdAt,
        }
      : null,
  };
}

const MIME_EXTENSION_MAP = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "video/webm": ".webm",
  "video/mp4": ".mp4",
  "audio/webm": ".webm",
  "audio/ogg": ".ogg",
  "audio/wav": ".wav",
  "audio/mpeg": ".mp3",
  "audio/mp4": ".m4a",
  "application/pdf": ".pdf",
  "application/zip": ".zip",
  "text/plain": ".txt",
};

function getExtByMime(mime) {
  return MIME_EXTENSION_MAP[sanitizeMime(mime)] || "";
}

function sanitizeUploadDiskName(fileName, mime) {
  const safeFileName = sanitizeFileName(fileName || "file");
  const sourceExt = path.extname(safeFileName).toLowerCase();
  const extFromMime = getExtByMime(mime);
  const ext = /^[.a-z0-9]{2,12}$/.test(sourceExt) ? sourceExt : extFromMime || ".bin";
  const baseName = path.basename(safeFileName, sourceExt || undefined);
  const slugBase = sanitizeSlug(baseName || "file", "file", 42);
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}_${slugBase}${ext}`;
}

async function saveUploadedFile({ fileName, mime, dataUrl }) {
  const parsed = parseDataUrl(dataUrl);
  if (!parsed) {
    throw Object.assign(new Error("Invalid file payload."), { statusCode: 400 });
  }
  if (parsed.buffer.length > MAX_UPLOAD_BYTES) {
    throw Object.assign(new Error("File too large."), { statusCode: 413 });
  }

  const safeMime = sanitizeMime(mime || "");
  const finalMime = safeMime === "application/octet-stream" ? parsed.mime : safeMime;
  const diskName = sanitizeUploadDiskName(fileName, finalMime);
  const fullPath = path.join(UPLOADS_DIR, diskName);

  await fs.promises.mkdir(UPLOADS_DIR, { recursive: true });
  await fs.promises.writeFile(fullPath, parsed.buffer);

  return {
    name: sanitizeFileName(fileName || diskName),
    url: `/uploads/${diskName}`,
    mime: finalMime,
    size: parsed.buffer.length,
  };
}

function sanitizeSignalType(raw) {
  const type = String(raw || "").trim().toLowerCase();
  if (!SIGNAL_TYPE_SET.has(type)) return "";
  return type;
}

function sanitizeSignalPayload(raw) {
  if (!raw || typeof raw !== "object") return {};
  try {
    const serialized = JSON.stringify(raw);
    if (serialized.length > 400_000) return {};
    return JSON.parse(serialized);
  } catch (_error) {
    return {};
  }
}

function cleanupSignalBus() {
  const cutoff = nowMs() - SIGNAL_TTL_MS;
  while (signalBus.length > 0) {
    const first = signalBus[0];
    if (!first) break;
    if (signalBus.length > MAX_SIGNAL_EVENTS || first.createdAt < cutoff) {
      signalBus.shift();
      continue;
    }
    break;
  }
}

function enqueueSignal({ roomId, from, to, type, payload }) {
  cleanupSignalBus();
  const event = {
    seq: nextSignalSeq++,
    roomId: sanitizeRoomId(roomId),
    from: sanitizeLogin(from).toLowerCase(),
    to: sanitizeLogin(to).toLowerCase(),
    type: sanitizeSignalType(type),
    payload: sanitizeSignalPayload(payload),
    createdAt: nowMs(),
  };
  if (!event.roomId || !event.from || !event.type) return null;

  signalBus.push(event);
  cleanupSignalBus();
  return event;
}

function getSignalsForActor({ roomId, actor, afterSeq }) {
  cleanupSignalBus();
  const safeRoomId = sanitizeRoomId(roomId);
  const safeActor = sanitizeLogin(actor).toLowerCase();
  const safeAfter = clamp(toInt(afterSeq, 0), 0, Number.MAX_SAFE_INTEGER);
  if (!safeRoomId || !safeActor) {
    return { events: [], cursor: Math.max(0, nextSignalSeq - 1) };
  }

  const events = signalBus
    .filter(
      (event) =>
        event.seq > safeAfter &&
        event.roomId === safeRoomId &&
        event.from !== safeActor &&
        (!event.to || event.to === safeActor)
    )
    .slice(-300)
    .map((event) => ({
      seq: event.seq,
      room: event.roomId,
      from: event.from,
      to: event.to,
      type: event.type,
      payload: event.payload,
      createdAt: event.createdAt,
    }));

  return {
    events,
    cursor: Math.max(0, nextSignalSeq - 1),
  };
}

function serveStatic(req, res, urlObj) {
  let requested = decodeURIComponent(urlObj.pathname || "/");
  let rootDir = PUBLIC_DIR;
  if (requested.startsWith("/uploads/")) {
    rootDir = UPLOADS_DIR;
    requested = requested.replace(/^\/uploads/, "/");
  } else if (requested === "/") {
    requested = "/index.html";
  }

  const normalized = path.normalize(requested).replace(/^[/\\]+/, "");
  const fullPath = path.join(rootDir, normalized);
  const rel = path.relative(rootDir, fullPath);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    writeText(res, 403, "Forbidden");
    return;
  }

  fs.promises
    .stat(fullPath)
    .then((stat) => {
      if (!stat.isDirectory()) return fullPath;
      if (rootDir === UPLOADS_DIR) throw new Error("Directory listing disabled");
      return path.join(fullPath, "index.html");
    })
    .then((filePath) => fs.promises.readFile(filePath).then((buffer) => ({ filePath, buffer })))
    .then(({ filePath, buffer }) => {
      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || "application/octet-stream";
      const headers = { "Content-Type": contentType };
      headers["Cache-Control"] = ext === ".html" || ext === ".css" || ext === ".js"
        ? "no-store"
        : "public, max-age=300";
      res.writeHead(200, headers);
      res.end(buffer);
    })
    .catch(() => {
      writeText(res, 404, "Not Found");
    });
}

async function handleApiRequest(req, res, urlObj) {
  const pathname = urlObj.pathname || "/";
  const method = req.method || "GET";
  const clientIp = getClientIp(req);

  if (method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Cache-Control": "no-store",
    });
    res.end();
    return;
  }

  if (pathname === "/api/health" && method === "GET") {
    writeJson(res, 200, {
      ok: true,
      service: "lan_messenger",
      timestamp: nowMs(),
      uptimeSec: Math.floor(process.uptime()),
      roomCount: Object.keys(state.rooms).length,
      botCount: Object.keys(state.bots || {}).length,
      signalQueue: signalBus.length,
      clientIp: clientIp || "",
    });
    return;
  }

  if (pathname === "/api/ip-status" && method === "GET") {
    const registration = getIpRegistration(clientIp);
    if (registration) touchIpRegistration(clientIp);
    writeJson(res, 200, {
      ok: true,
      ip: clientIp || "",
      requiresRegistration: !registration,
      registration: registration
        ? {
            login: registration.login,
            registeredAt: registration.registeredAt,
            lastSeenAt: nowMs(),
          }
        : null,
      serverTime: nowMs(),
    });
    return;
  }

  if (pathname === "/api/ip-register" && method === "POST") {
    const body = await parseJsonBody(req);
    const login = sanitizeLogin(body.login);
    if (!clientIp) {
      writeJson(res, 400, { ok: false, error: "Client IP is unavailable." });
      return;
    }
    if (login.length < 3) {
      writeJson(res, 400, { ok: false, error: "Login must be at least 3 characters." });
      return;
    }
    const saved = registerIpLogin(clientIp, login);
    if (!saved) {
      writeJson(res, 500, { ok: false, error: "Unable to register this IP." });
      return;
    }
    writeJson(res, 200, {
      ok: true,
      ip: clientIp,
      registration: {
        login: saved.login,
        registeredAt: saved.registeredAt,
        lastSeenAt: saved.lastSeenAt,
      },
    });
    return;
  }

  if (pathname === "/api/rooms" && method === "GET") {
    cleanupAllPresence();
    const actor = sanitizeLogin(urlObj.searchParams.get("actor")).toLowerCase();

    const rooms = Object.values(state.rooms)
      .filter((room) => {
        if (room.type === "dm") return actor ? isRoomMember(room, actor) : false;
        return canReadRoom(room, actor);
      })
      .map((room) => serializeRoomForList(room, actor))
      .sort((a, b) => b.updatedAt - a.updatedAt);

    writeJson(res, 200, { ok: true, rooms, serverTime: nowMs() });
    return;
  }
  if (pathname === "/api/rooms" && method === "POST") {
    const body = await parseJsonBody(req);
    const roomId = sanitizeRoomId(body.room);
    const actor = sanitizeLogin(body.actor).toLowerCase();

    if (!isDirectRoomId(roomId)) {
      writeJson(res, 400, { ok: false, error: "Room must be DM chat id." });
      return;
    }

    if (actor) {
      const participants = getDmParticipants(roomId);
      if (!participants.includes(actor)) {
        writeJson(res, 403, { ok: false, error: "You are not a participant of this DM." });
        return;
      }
    }

    const room = getOrCreateDmRoom(roomId, body.title || "");
    if (!room) {
      writeJson(res, 503, { ok: false, error: "Room limit reached." });
      return;
    }

    writeJson(res, 200, {
      ok: true,
      room: { id: room.id, title: room.title, type: room.type, updatedAt: room.updatedAt },
    });
    return;
  }

  if (pathname === "/api/conversations" && method === "POST") {
    const body = await parseJsonBody(req);
    const kind = String(body.kind || "").trim().toLowerCase();
    const creator = sanitizeLogin(body.creator).toLowerCase();
    const title = sanitizeRoomTitle(body.title, kind === "group" ? "group" : "channel");

    if (!(kind === "group" || kind === "channel")) {
      writeJson(res, 400, { ok: false, error: "Conversation kind must be group or channel." });
      return;
    }
    if (creator.length < 3) {
      writeJson(res, 400, { ok: false, error: "Creator login is invalid." });
      return;
    }

    const room = createConversation(kind, title, creator, {
      description: body.description,
      isPrivate: Boolean(body.isPrivate),
      allowMemberPosts: body.allowMemberPosts !== false,
    });

    if (!room) {
      writeJson(res, 503, { ok: false, error: "Unable to create conversation." });
      return;
    }

    writeJson(res, 201, {
      ok: true,
      room: serializeRoomForList(room, creator),
    });
    return;
  }

  if (pathname === "/api/conversations/settings" && method === "POST") {
    const body = await parseJsonBody(req);
    const roomId = sanitizeRoomId(body.room);
    const actor = sanitizeLogin(body.actor).toLowerCase();
    const room = state.rooms[roomId];

    if (!room || !isGroupOrChannelRoomId(roomId)) {
      writeJson(res, 404, { ok: false, error: "Conversation not found." });
      return;
    }
    if (!canManageRoom(room, actor)) {
      writeJson(res, 403, { ok: false, error: "Not enough permissions." });
      return;
    }

    patchConversationSettings(room, {
      title: body.title,
      description: body.description,
      isPrivate: body.isPrivate,
      allowMemberPosts: body.allowMemberPosts,
    });

    writeJson(res, 200, {
      ok: true,
      room: serializeRoomForList(room, actor),
    });
    return;
  }

  if (pathname === "/api/conversations/join" && method === "POST") {
    const body = await parseJsonBody(req);
    const roomId = sanitizeRoomId(body.room);
    const actor = sanitizeLogin(body.actor).toLowerCase();
    const room = state.rooms[roomId];

    if (!room || !isGroupOrChannelRoomId(roomId)) {
      writeJson(res, 404, { ok: false, error: "Conversation not found." });
      return;
    }
    if (!actor) {
      writeJson(res, 400, { ok: false, error: "Actor is required." });
      return;
    }
    if (!canJoinRoom(room, actor)) {
      writeJson(res, 403, { ok: false, error: "Cannot join this conversation." });
      return;
    }

    joinRoomAsMember(room, actor, room.members?.[actor] || "member");
    writeJson(res, 200, {
      ok: true,
      room: serializeRoomForList(room, actor),
    });
    return;
  }

  if (pathname === "/api/conversations/leave" && method === "POST") {
    const body = await parseJsonBody(req);
    const roomId = sanitizeRoomId(body.room);
    const actor = sanitizeLogin(body.actor).toLowerCase();
    const room = state.rooms[roomId];

    if (!room || !isGroupOrChannelRoomId(roomId)) {
      writeJson(res, 404, { ok: false, error: "Conversation not found." });
      return;
    }
    if (!actor) {
      writeJson(res, 400, { ok: false, error: "Actor is required." });
      return;
    }

    const left = leaveRoomMember(room, actor);
    if (!left) {
      writeJson(res, 400, { ok: false, error: "Cannot leave this conversation." });
      return;
    }

    writeJson(res, 200, { ok: true });
    return;
  }

  if (pathname === "/api/messages" && method === "GET") {
    const roomId = sanitizeRoomId(urlObj.searchParams.get("room"));
    const actor = sanitizeLogin(urlObj.searchParams.get("actor")).toLowerCase();
    const afterSeq = clamp(toInt(urlObj.searchParams.get("after"), 0), 0, Number.MAX_SAFE_INTEGER);
    const type = getRoomTypeById(roomId);

    if (!type) {
      writeJson(res, 400, { ok: false, error: "Unknown room id." });
      return;
    }

    const room = state.rooms[roomId];
    if (!room) {
      if (type === "dm" && actor && getDmParticipants(roomId).includes(actor)) {
        writeJson(res, 200, {
          ok: true,
          room: {
            id: roomId,
            title: sanitizeRoomTitle("", roomId),
            type,
            joined: true,
            settings: normalizeRoomSettings({}, "dm"),
            canPost: true,
            canManage: false,
          },
          messages: [],
          onlineUsers: [],
          lastSeq: 0,
          serverTime: nowMs(),
        });
        return;
      }
      writeJson(res, 404, { ok: false, error: "Room not found." });
      return;
    }

    if (!isRoomMember(room, actor)) {
      writeJson(res, 403, { ok: false, error: "Only conversation members can receive media signals." });
      return;
    }

    cleanupPresence(room);
    let messages = room.messages.filter((message) => message.seq > afterSeq);
    if (messages.length > 180) messages = messages.slice(-180);

    const lastSeq = room.messages.length > 0 ? room.messages[room.messages.length - 1].seq : 0;
    writeJson(res, 200, {
      ok: true,
      room: {
        id: room.id,
        title: room.title,
        type: room.type,
        joined: isRoomMember(room, actor),
        settings: room.settings,
        canPost: canSendRoom(room, actor),
        canManage: canManageRoom(room, actor),
      },
      messages,
      onlineUsers: getOnlineUsers(room),
      lastSeq,
      serverTime: nowMs(),
    });
    return;
  }

  if (pathname === "/api/send" && method === "POST") {
    const body = await parseJsonBody(req);
    const roomId = sanitizeRoomId(body.room);
    const author = sanitizeLogin(body.author).toLowerCase();
    const kind = sanitizeMessageKind(body.kind || "text");
    const text = sanitizeText(body.text);
    const file = normalizeFileMeta(body.file);

    if (!author) {
      writeJson(res, 400, { ok: false, error: "Author is required." });
      return;
    }
    if (kind === "text" && !text) {
      writeJson(res, 400, { ok: false, error: "Message text is empty." });
      return;
    }
    if (kind !== "text" && !file) {
      writeJson(res, 400, { ok: false, error: "File payload is required." });
      return;
    }

    const roomType = getRoomTypeById(roomId);
    if (!roomType) {
      writeJson(res, 400, { ok: false, error: "Unknown room id." });
      return;
    }

    let room = state.rooms[roomId];
    if (!room) {
      if (roomType === "dm" && getDmParticipants(roomId).includes(author)) {
        room = getOrCreateDmRoom(roomId, "");
      } else {
        writeJson(res, 404, { ok: false, error: "Room not found." });
        return;
      }
    }

    if (!canSendRoom(room, author)) {
      writeJson(res, 403, { ok: false, error: "You cannot post in this conversation." });
      return;
    }

    const message = pushMessage(room, author, { kind, text, file });
    if (!message) {
      writeJson(res, 400, { ok: false, error: "Invalid message payload." });
      return;
    }
    writeJson(res, 201, {
      ok: true,
      message,
      room: { id: room.id, title: room.title, type: room.type },
    });
    return;
  }
  if (pathname === "/api/presence" && method === "POST") {
    const body = await parseJsonBody(req);
    const roomId = sanitizeRoomId(body.room);
    const author = sanitizeLogin(body.author).toLowerCase();
    const online = body.online !== false;

    if (!author) {
      writeJson(res, 400, { ok: false, error: "Author is required." });
      return;
    }

    const roomType = getRoomTypeById(roomId);
    if (!roomType) {
      writeJson(res, 400, { ok: false, error: "Unknown room id." });
      return;
    }

    let room = state.rooms[roomId];
    if (!room) {
      if (roomType === "dm" && getDmParticipants(roomId).includes(author)) {
        room = getOrCreateDmRoom(roomId, "");
      } else {
        writeJson(res, 404, { ok: false, error: "Room not found." });
        return;
      }
    }

    if (!canReadRoom(room, author)) {
      writeJson(res, 403, { ok: false, error: "Access denied." });
      return;
    }

    const visibleName = sanitizeName(author);
    if (online) room.presence[visibleName] = nowMs();
    else delete room.presence[visibleName];

    cleanupPresence(room);
    writeJson(res, 200, { ok: true, onlineUsers: getOnlineUsers(room) });
    return;
  }

  if (pathname === "/api/upload" && method === "POST") {
    const body = await parseJsonBody(req, REQUEST_BODY_LIMIT);
    const roomId = sanitizeRoomId(body.room);
    const author = sanitizeLogin(body.author).toLowerCase();
    const roomType = getRoomTypeById(roomId);
    const fileName = sanitizeFileName(body.fileName || body.name);
    const mime = sanitizeMime(body.mime);
    const dataUrl = String(body.dataUrl || body.data || "");

    if (!author) {
      writeJson(res, 400, { ok: false, error: "Author is required." });
      return;
    }
    if (!roomType) {
      writeJson(res, 400, { ok: false, error: "Unknown room id." });
      return;
    }
    if (!dataUrl.startsWith("data:")) {
      writeJson(res, 400, { ok: false, error: "Invalid file payload." });
      return;
    }

    let room = state.rooms[roomId];
    if (!room) {
      if (roomType === "dm" && getDmParticipants(roomId).includes(author)) {
        room = getOrCreateDmRoom(roomId, "");
      } else {
        writeJson(res, 404, { ok: false, error: "Room not found." });
        return;
      }
    }

    if (!canSendRoom(room, author)) {
      writeJson(res, 403, { ok: false, error: "You cannot upload to this conversation." });
      return;
    }

    const file = await saveUploadedFile({ fileName, mime, dataUrl });
    writeJson(res, 201, {
      ok: true,
      file,
      room: { id: room.id, title: room.title, type: room.type },
      serverTime: nowMs(),
    });
    return;
  }

  if (pathname === "/api/webrtc/poll" && method === "GET") {
    const roomId = sanitizeRoomId(urlObj.searchParams.get("room"));
    const actor = sanitizeLogin(urlObj.searchParams.get("actor")).toLowerCase();
    const after = clamp(toInt(urlObj.searchParams.get("after"), 0), 0, Number.MAX_SAFE_INTEGER);
    const roomType = getRoomTypeById(roomId);

    if (!actor) {
      writeJson(res, 400, { ok: false, error: "Actor is required." });
      return;
    }
    if (!roomType) {
      writeJson(res, 400, { ok: false, error: "Unknown room id." });
      return;
    }

    let room = state.rooms[roomId];
    if (!room) {
      if (roomType === "dm" && getDmParticipants(roomId).includes(actor)) {
        room = getOrCreateDmRoom(roomId, "");
      } else {
        writeJson(res, 404, { ok: false, error: "Room not found." });
        return;
      }
    }

    if (!isRoomMember(room, actor)) {
      writeJson(res, 403, { ok: false, error: "Only conversation members can receive media signals." });
      return;
    }

    const result = getSignalsForActor({ roomId: room.id, actor, afterSeq: after });
    writeJson(res, 200, {
      ok: true,
      events: result.events,
      cursor: result.cursor,
      serverTime: nowMs(),
    });
    return;
  }

  if (pathname === "/api/webrtc/signal" && method === "POST") {
    const body = await parseJsonBody(req, SIGNAL_BODY_LIMIT);
    const roomId = sanitizeRoomId(body.room);
    const from = sanitizeLogin(body.from).toLowerCase();
    const to = sanitizeLogin(body.to).toLowerCase();
    const type = sanitizeSignalType(body.type);
    const payload = body.payload;
    const roomType = getRoomTypeById(roomId);

    if (!from) {
      writeJson(res, 400, { ok: false, error: "Sender is required." });
      return;
    }
    if (!roomType) {
      writeJson(res, 400, { ok: false, error: "Unknown room id." });
      return;
    }
    if (!type) {
      writeJson(res, 400, { ok: false, error: "Unknown signal type." });
      return;
    }

    let room = state.rooms[roomId];
    if (!room) {
      if (roomType === "dm" && getDmParticipants(roomId).includes(from)) {
        room = getOrCreateDmRoom(roomId, "");
      } else {
        writeJson(res, 404, { ok: false, error: "Room not found." });
        return;
      }
    }

    if (!isRoomMember(room, from)) {
      writeJson(res, 403, { ok: false, error: "Only conversation members can send media signals." });
      return;
    }
    if (to && !isRoomMember(room, to)) {
      writeJson(res, 403, { ok: false, error: "Target user is not a room member." });
      return;
    }

    const event = enqueueSignal({ roomId: room.id, from, to, type, payload });
    if (!event) {
      writeJson(res, 400, { ok: false, error: "Cannot enqueue signal." });
      return;
    }

    writeJson(res, 201, {
      ok: true,
      event: {
        seq: event.seq,
        room: event.roomId,
        from: event.from,
        to: event.to,
        type: event.type,
        createdAt: event.createdAt,
      },
      serverTime: nowMs(),
    });
    return;
  }

  if (pathname === "/api/bots" && method === "GET") {
    const owner = sanitizeLogin(urlObj.searchParams.get("owner")).toLowerCase();
    const bots = Object.values(state.bots || {})
      .filter((bot) => (owner ? bot.owner === owner : true))
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((bot) => ({
        id: bot.id,
        name: bot.name,
        login: bot.login,
        owner: bot.owner,
        roomId: bot.roomId,
        trigger: bot.trigger,
        response: bot.response,
        createdAt: bot.createdAt,
        filePath: `bots/${bot.fileName}`,
      }));

    writeJson(res, 200, { ok: true, bots, serverTime: nowMs() });
    return;
  }

  if (pathname === "/api/bots" && method === "POST") {
    const body = await parseJsonBody(req);
    const bot = await createPythonBot({
      name: body.name,
      owner: body.owner,
      roomId: body.room,
      trigger: body.trigger,
      response: body.response,
    });

    if (!bot) {
      writeJson(res, 400, { ok: false, error: "Unable to create bot." });
      return;
    }

    writeJson(res, 201, { ok: true, bot });
    return;
  }

  writeJson(res, 404, { ok: false, error: "Not found" });
}

async function loadStateFromDisk() {
  await fs.promises.mkdir(DATA_DIR, { recursive: true });
  await fs.promises.mkdir(BOTS_DIR, { recursive: true });
  await fs.promises.mkdir(UPLOADS_DIR, { recursive: true });

  if (!fs.existsSync(DATA_FILE)) {
    state = createInitialState();
    await persistNow();
    return;
  }

  try {
    const rawText = await fs.promises.readFile(DATA_FILE, "utf8");
    state = normalizeState(JSON.parse(rawText));
  } catch (error) {
    console.error("[WARN] Failed to parse chat DB, restoring default:", error.message);
    const brokenFile = path.join(DATA_DIR, `chat-db.broken.${Date.now()}.json`);
    try {
      await fs.promises.rename(DATA_FILE, brokenFile);
    } catch (_renameError) {
      // ignore
    }
    state = createInitialState();
    await persistNow();
  }
}

async function bootstrap() {
  await loadStateFromDisk();

  setInterval(() => {
    if (cleanupAllPresence()) state.updatedAt = nowMs();
    cleanupSignalBus();
  }, 12_000).unref();

  const server = http.createServer((req, res) => {
    const method = req.method || "GET";
    const requestUrl = req.url || "/";
    const urlObj = new URL(requestUrl, `http://${req.headers.host || "localhost"}`);

    if (urlObj.pathname.startsWith("/api/")) {
      handleApiRequest(req, res, urlObj).catch((error) => {
        const statusCode = clamp(toInt(error.statusCode, 500), 400, 599);
        const message = statusCode >= 500 ? "Internal server error" : error.message;
        if (statusCode >= 500) console.error("[ERROR] API failure:", error);
        writeJson(res, statusCode, { ok: false, error: message });
      });
      return;
    }

    if (method !== "GET" && method !== "HEAD") {
      writeText(res, 405, "Method Not Allowed");
      return;
    }

    serveStatic(req, res, urlObj);
  });

  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[INFO] ${signal} received, shutting down LAN Messenger...`);
    try {
      await flushPendingSave();
    } catch (error) {
      console.error("[WARN] Failed to flush state:", error.message);
    }
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 2000).unref();
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  server.listen(PORT, HOST, () => {
    console.log(`[INFO] LAN Messenger listening on http://${HOST}:${PORT}`);
    console.log(`[INFO] Health endpoint: http://127.0.0.1:${PORT}/api/health`);
  });
}

bootstrap().catch((error) => {
  console.error("[ERROR] Failed to start LAN Messenger:", error);
  process.exit(1);
});
