"use strict";

const STORAGE_KEY = "lanMessengerPrefsV3";
const LEGACY_STORAGE_KEY_V2 = "lanMessengerPrefsV2";
const LEGACY_STORAGE_KEY_V1 = "lanMessengerPrefsV1";

const DEFAULT_ACCENT = "#ef6a3a";
const DEFAULT_THEME = "light";
const DEFAULT_ROOM = "";
const DM_ROOM_RE = /^dm_[a-z0-9_.-]{3,24}__[a-z0-9_.-]{3,24}$/;
const GROUP_ROOM_RE = /^grp_[a-z0-9_.-]{3,40}$/;
const CHANNEL_ROOM_RE = /^chn_[a-z0-9_.-]{3,40}$/;
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const MAX_ATTACHMENT_BYTES = 12 * 1024 * 1024;

const POLL_INTERVAL_MS = 1200;
const SIGNAL_POLL_MS = 900;
const ROOMS_REFRESH_MS = 7000;
const PRESENCE_INTERVAL_MS = 15000;
const AUDIO_NOTE_MAX_MS = 120000;
const VIDEO_NOTE_MAX_MS = 60000;
const ROOM_TYPE = {
  NONE: "none",
  DM: "dm",
  GROUP: "group",
  CHANNEL: "channel",
};
const RTC_SIGNAL = {
  CALL_INVITE: "call-invite",
  CALL_JOIN: "call-join",
  CALL_END: "call-end",
  CALL_BUSY: "call-busy",
  OFFER: "offer",
  ANSWER: "answer",
  ICE: "ice",
  STREAM_START: "stream-start",
  STREAM_VIEWER_JOIN: "stream-viewer-join",
  STREAM_END: "stream-end",
};
const EMOJI_LIST = [
  "😀",
  "😁",
  "😂",
  "🤣",
  "😊",
  "😍",
  "😘",
  "😎",
  "🤔",
  "😴",
  "😡",
  "😭",
  "🤯",
  "👍",
  "👎",
  "👏",
  "🙌",
  "🤝",
  "🙏",
  "🔥",
  "✨",
  "💯",
  "❤️",
  "💙",
  "💚",
  "💛",
  "💜",
  "🖤",
  "🤍",
  "💬",
  "🎉",
  "🎮",
];

const elements = {
  ipGate: document.getElementById("ipGate"),
  ipGateMeta: document.getElementById("ipGateMeta"),
  ipGateLoginInput: document.getElementById("ipGateLoginInput"),
  ipGatePasswordInput: document.getElementById("ipGatePasswordInput"),
  ipGateRegisterBtn: document.getElementById("ipGateRegisterBtn"),
  ipGateHint: document.getElementById("ipGateHint"),

  settingsBtn: document.getElementById("settingsBtn"),
  profileBtn: document.getElementById("profileBtn"),
  settingsPopup: document.getElementById("settingsPopup"),
  profilePopup: document.getElementById("profilePopup"),
  themeSelect: document.getElementById("themeSelect"),
  accentInput: document.getElementById("accentInput"),
  resetAccentBtn: document.getElementById("resetAccentBtn"),

  profileBtnAvatar: document.getElementById("profileBtnAvatar"),
  profileBtnName: document.getElementById("profileBtnName"),
  profilePreviewAvatar: document.getElementById("profilePreviewAvatar"),
  profileCurrentName: document.getElementById("profileCurrentName"),
  profileCurrentHint: document.getElementById("profileCurrentHint"),
  profilePopupHint: document.getElementById("profilePopupHint"),
  profileManageSection: document.getElementById("profileManageSection"),

  authLoginInput: document.getElementById("authLoginInput"),
  authPasswordInput: document.getElementById("authPasswordInput"),
  loginBtn: document.getElementById("loginBtn"),
  registerBtn: document.getElementById("registerBtn"),

  newPasswordInput: document.getElementById("newPasswordInput"),
  savePasswordBtn: document.getElementById("savePasswordBtn"),
  avatarFileInput: document.getElementById("avatarFileInput"),
  removeAvatarBtn: document.getElementById("removeAvatarBtn"),
  logoutBtn: document.getElementById("logoutBtn"),
  deleteProfileBtn: document.getElementById("deleteProfileBtn"),

  roomInput: document.getElementById("roomInput"),
  joinRoomBtn: document.getElementById("joinRoomBtn"),
  newGroupBtn: document.getElementById("newGroupBtn"),
  newChannelBtn: document.getElementById("newChannelBtn"),
  roomSettingsBtn: document.getElementById("roomSettingsBtn"),
  newBotBtn: document.getElementById("newBotBtn"),
  botInfoLabel: document.getElementById("botInfoLabel"),

  conversationPopup: document.getElementById("conversationPopup"),
  conversationPopupTitle: document.getElementById("conversationPopupTitle"),
  convTitleInput: document.getElementById("convTitleInput"),
  convDescInput: document.getElementById("convDescInput"),
  convPrivateInput: document.getElementById("convPrivateInput"),
  convAllowPostsWrap: document.getElementById("convAllowPostsWrap"),
  convAllowPostsInput: document.getElementById("convAllowPostsInput"),
  convSaveBtn: document.getElementById("convSaveBtn"),
  convPopupHint: document.getElementById("convPopupHint"),

  botPopup: document.getElementById("botPopup"),
  botNameInput: document.getElementById("botNameInput"),
  botTargetSelect: document.getElementById("botTargetSelect"),
  botTriggerInput: document.getElementById("botTriggerInput"),
  botReplyInput: document.getElementById("botReplyInput"),
  botCreateBtn: document.getElementById("botCreateBtn"),
  botPopupHint: document.getElementById("botPopupHint"),

  roomsList: document.getElementById("roomsList"),
  callAudioBtn: document.getElementById("callAudioBtn"),
  callVideoBtn: document.getElementById("callVideoBtn"),
  groupCallBtn: document.getElementById("groupCallBtn"),
  streamBtn: document.getElementById("streamBtn"),
  endCallBtn: document.getElementById("endCallBtn"),
  rtcPanel: document.getElementById("rtcPanel"),
  rtcStatusLabel: document.getElementById("rtcStatusLabel"),
  rtcVideos: document.getElementById("rtcVideos"),

  messages: document.getElementById("messages"),
  composerForm: document.getElementById("composerForm"),
  messageInput: document.getElementById("messageInput"),
  attachBtn: document.getElementById("attachBtn"),
  fileInput: document.getElementById("fileInput"),
  recordAudioBtn: document.getElementById("recordAudioBtn"),
  recordVideoNoteBtn: document.getElementById("recordVideoNoteBtn"),
  emojiBtn: document.getElementById("emojiBtn"),
  emojiPanel: document.getElementById("emojiPanel"),
  composerHint: document.getElementById("composerHint"),
  sendBtn: document.getElementById("sendBtn"),
  currentRoomLabel: document.getElementById("currentRoomLabel"),
  chatAvatar: document.getElementById("chatAvatar"),
  chatUserLabel: document.getElementById("chatUserLabel"),
  onlineLabel: document.getElementById("onlineLabel"),
  statusBadge: document.getElementById("statusBadge"),
  apiLabel: document.getElementById("apiLabel"),
};

function createRtcState() {
  return {
    active: false,
    mode: "none",
    sessionId: "",
    roomId: "",
    initiator: "",
    videoEnabled: false,
    streamHost: "",
    localStream: null,
    peers: new Map(),
    remoteStreams: new Map(),
    joining: false,
  };
}

const state = {
  apiBase: "",
  clientIp: "",
  requiresIpRegistration: false,
  profiles: [],
  activeProfileId: "",
  name: "guest",
  room: DEFAULT_ROOM,
  roomType: ROOM_TYPE.NONE,
  roomTitle: "",
  chatTarget: "",
  activeRoomMeta: null,
  onlineUsers: [],
  roomsCache: [],
  theme: DEFAULT_THEME,
  accent: DEFAULT_ACCENT,

  lastSeq: 0,
  seenSeq: new Set(),
  pollTimer: null,
  signalTimer: null,
  roomsTimer: null,
  presenceTimer: null,
  activePoll: false,
  signalAfter: 0,
  recordingAudio: null,
  recordingVideo: null,
  rtc: createRtcState(),
  started: false,
  conversationPopupMode: "settings",
  pendingConversationKind: ROOM_TYPE.GROUP,
};

function sanitizeRoom(raw) {
  const room = String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9_.-]/g, "");
  return room;
}

function sanitizeLogin(raw) {
  const login = String(raw || "")
    .trim()
    .replace(/\s+/g, "")
    .replace(/[^0-9A-Za-zА-Яа-яЁё_.-]/g, "")
    .slice(0, 24);
  return login;
}

function sanitizeStoredRoom(raw) {
  const room = sanitizeRoom(raw);
  if (DM_ROOM_RE.test(room)) return room;
  if (GROUP_ROOM_RE.test(room)) return room;
  if (CHANNEL_ROOM_RE.test(room)) return room;
  return "";
}

function getRoomTypeById(roomId) {
  const safe = sanitizeStoredRoom(roomId);
  if (DM_ROOM_RE.test(safe)) return ROOM_TYPE.DM;
  if (GROUP_ROOM_RE.test(safe)) return ROOM_TYPE.GROUP;
  if (CHANNEL_ROOM_RE.test(safe)) return ROOM_TYPE.CHANNEL;
  return ROOM_TYPE.NONE;
}

function makeDirectRoomId(loginA, loginB) {
  const left = sanitizeLogin(loginA).toLowerCase();
  const right = sanitizeLogin(loginB).toLowerCase();
  if (!left || !right || left === right) return "";
  const [a, b] = [left, right].sort((x, y) => x.localeCompare(y, "en"));
  return `dm_${a}__${b}`;
}

function getPeerFromRoom(roomId, ownLogin) {
  const safeRoom = sanitizeStoredRoom(roomId);
  const own = sanitizeLogin(ownLogin).toLowerCase();
  if (!safeRoom || !own) return "";

  const pair = safeRoom.slice(3).split("__");
  if (pair.length !== 2) return "";
  const left = sanitizeLogin(pair[0]).toLowerCase();
  const right = sanitizeLogin(pair[1]).toLowerCase();
  if (!left || !right || left === right) return "";

  if (own === left) return right;
  if (own === right) return left;
  return "";
}

function updateCurrentRoomLabel() {
  if (!state.room || state.roomType === ROOM_TYPE.NONE) {
    elements.currentRoomLabel.textContent = "Выберите чат";
    return;
  }

  if (state.roomType === ROOM_TYPE.DM) {
    elements.currentRoomLabel.textContent = state.chatTarget
      ? `@${state.chatTarget}`
      : "@unknown";
    return;
  }

  if (state.roomType === ROOM_TYPE.GROUP) {
    elements.currentRoomLabel.textContent = `Группа: ${state.roomTitle || state.room}`;
    return;
  }

  elements.currentRoomLabel.textContent = `Канал: ${state.roomTitle || state.room}`;
}

function normalizeTheme(raw) {
  const theme = String(raw || DEFAULT_THEME).trim().toLowerCase();
  if (theme === "mint" || theme === "night") return theme;
  return DEFAULT_THEME;
}

function normalizeAccent(raw) {
  const value = String(raw || "").trim();
  if (/^#[0-9a-fA-F]{6}$/.test(value)) {
    return value.toLowerCase();
  }
  return DEFAULT_ACCENT;
}

function sanitizeAvatar(raw) {
  const avatar = String(raw || "").trim();
  if (!avatar) return "";
  if (!avatar.startsWith("data:image/")) return "";
  if (avatar.length > 2_500_000) return "";
  return avatar;
}

function toInt(value, fallback = 0) {
  const n = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(n) ? n : fallback;
}

function makeProfileId() {
  return `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function hasActiveProfile() {
  return Boolean(getActiveProfile());
}

function getProfileSeed(profile) {
  return profile?.login || "LAN";
}

function getDefaultAvatar(seed) {
  return `https://api.dicebear.com/9.x/shapes/svg?seed=${encodeURIComponent(seed || "LAN")}`;
}

function getAvatarSrc(profile) {
  if (profile && profile.avatar) return profile.avatar;
  return getDefaultAvatar(getProfileSeed(profile));
}

function profileLoginLower(profile) {
  return String(profile?.login || "").toLowerCase();
}

function findProfileByLogin(login) {
  const safe = sanitizeLogin(login).toLowerCase();
  if (!safe) return null;
  return state.profiles.find((profile) => profileLoginLower(profile) === safe) || null;
}

function makeUniqueLogin(baseLogin, usedLogins) {
  let candidate = sanitizeLogin(baseLogin);
  if (!candidate) candidate = "User";
  if (!usedLogins.has(candidate.toLowerCase())) return candidate;

  for (let i = 2; i <= 99; i += 1) {
    const next = `${candidate.slice(0, 20)}${i}`;
    if (!usedLogins.has(next.toLowerCase())) return next;
  }
  return `${candidate.slice(0, 18)}${Math.floor(Math.random() * 90 + 10)}`;
}

function buildProfile(raw = {}) {
  const login = sanitizeLogin(raw.login || raw.name);
  if (!login) return null;
  const now = Date.now();
  return {
    id: String(raw.id || makeProfileId()),
    login,
    passwordHash: typeof raw.passwordHash === "string" ? raw.passwordHash : "",
    avatar: sanitizeAvatar(raw.avatar),
    room: sanitizeStoredRoom(raw.room),
    theme: normalizeTheme(raw.theme),
    accent: normalizeAccent(raw.accent),
    createdAt: toInt(raw.createdAt, now),
    lastLoginAt: toInt(raw.lastLoginAt, 0),
  };
}

function getActiveProfile() {
  return state.profiles.find((profile) => profile.id === state.activeProfileId) || null;
}

async function hashPassword(password) {
  const text = String(password || "");
  if (!window.crypto || !window.crypto.subtle) {
    return `plain:${text}`;
  }
  const data = new TextEncoder().encode(text);
  const digest = await window.crypto.subtle.digest("SHA-256", data);
  const bytes = Array.from(new Uint8Array(digest));
  return bytes.map((value) => value.toString(16).padStart(2, "0")).join("");
}

async function verifyPassword(profile, password) {
  const expected = String(profile?.passwordHash || "");
  const given = String(password || "");

  if (!expected) {
    return given.length === 0;
  }
  if (expected.startsWith("plain:")) {
    return expected === `plain:${given}`;
  }
  const hashed = await hashPassword(given);
  return hashed === expected;
}

function shiftHex(hex, percent) {
  const safe = normalizeAccent(hex).replace("#", "");
  const r = parseInt(safe.slice(0, 2), 16);
  const g = parseInt(safe.slice(2, 4), 16);
  const b = parseInt(safe.slice(4, 6), 16);
  const move = (value) => {
    const next = value + (percent / 100) * 255;
    return Math.max(0, Math.min(255, Math.round(next)));
  };
  const rr = move(r).toString(16).padStart(2, "0");
  const gg = move(g).toString(16).padStart(2, "0");
  const bb = move(b).toString(16).padStart(2, "0");
  return `#${rr}${gg}${bb}`;
}

function savePrefs() {
  const payload = {
    version: 3,
    activeProfileId: state.activeProfileId,
    profiles: state.profiles.map((profile) => ({
      id: profile.id,
      login: profile.login,
      passwordHash: profile.passwordHash,
      avatar: profile.avatar,
      room: profile.room,
      theme: profile.theme,
      accent: profile.accent,
      createdAt: profile.createdAt,
      lastLoginAt: profile.lastLoginAt,
    })),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

function migrateFromV2(rawV2) {
  const used = new Set();
  const profiles = [];

  for (const oldProfile of rawV2?.profiles || []) {
    const login = makeUniqueLogin(oldProfile?.name || "User", used);
    used.add(login.toLowerCase());
    const migrated = buildProfile({
      id: oldProfile?.id || makeProfileId(),
      login,
      passwordHash: "",
      avatar: "",
      room: "",
      theme: oldProfile?.theme || DEFAULT_THEME,
      accent: oldProfile?.accent || DEFAULT_ACCENT,
      createdAt: Date.now(),
      lastLoginAt: 0,
    });
    if (migrated) profiles.push(migrated);
  }

  let activeProfileId = String(rawV2?.activeProfileId || "");
  if (!profiles.some((profile) => profile.id === activeProfileId)) {
    activeProfileId = profiles[0]?.id || "";
  }
  return { profiles, activeProfileId };
}

function migrateFromV1(rawV1) {
  const login = sanitizeLogin(rawV1?.name || "User");
  const profile = buildProfile({
    id: makeProfileId(),
    login: login || "User",
    passwordHash: "",
    avatar: "",
    room: "",
    theme: DEFAULT_THEME,
    accent: DEFAULT_ACCENT,
  });
  if (!profile) return { profiles: [], activeProfileId: "" };
  return { profiles: [profile], activeProfileId: profile.id };
}

function loadPrefs() {
  state.profiles = [];
  state.activeProfileId = "";

  let parsedV3 = null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) parsedV3 = JSON.parse(raw);
  } catch (_error) {
    parsedV3 = null;
  }

  if (parsedV3 && Array.isArray(parsedV3.profiles)) {
    const used = new Set();
    for (const candidate of parsedV3.profiles) {
      const profile = buildProfile(candidate);
      if (!profile) continue;
      const key = profileLoginLower(profile);
      if (used.has(key)) continue;
      used.add(key);
      state.profiles.push(profile);
    }
    state.activeProfileId = String(parsedV3.activeProfileId || "");
  } else {
    let migrated = null;
    try {
      const rawV2 = localStorage.getItem(LEGACY_STORAGE_KEY_V2);
      if (rawV2) {
        migrated = migrateFromV2(JSON.parse(rawV2));
      }
    } catch (_error) {
      migrated = null;
    }
    if (!migrated) {
      try {
        const rawV1 = localStorage.getItem(LEGACY_STORAGE_KEY_V1);
        if (rawV1) {
          migrated = migrateFromV1(JSON.parse(rawV1));
        }
      } catch (_error) {
        migrated = null;
      }
    }
    if (migrated) {
      state.profiles = migrated.profiles;
      state.activeProfileId = migrated.activeProfileId;
    }
  }

  if (!state.profiles.some((profile) => profile.id === state.activeProfileId)) {
    state.activeProfileId = state.profiles[0]?.id || "";
  }

  const active = getActiveProfile();
  if (active) {
    state.name = active.login;
    state.room = sanitizeStoredRoom(active.room);
    state.roomType = getRoomTypeById(state.room);
    state.chatTarget = state.roomType === ROOM_TYPE.DM ? getPeerFromRoom(state.room, active.login) : "";
    state.roomTitle = "";
    state.activeRoomMeta = null;
    state.theme = active.theme;
    state.accent = active.accent;
  } else {
    state.name = "guest";
    state.room = DEFAULT_ROOM;
    state.roomType = ROOM_TYPE.NONE;
    state.chatTarget = "";
    state.roomTitle = "";
    state.activeRoomMeta = null;
    state.theme = DEFAULT_THEME;
    state.accent = DEFAULT_ACCENT;
  }
}

function applyTheme(theme, accent) {
  const safeTheme = normalizeTheme(theme);
  const safeAccent = normalizeAccent(accent);
  document.body.dataset.theme = safeTheme;
  document.documentElement.style.setProperty("--accent", safeAccent);
  document.documentElement.style.setProperty("--accent-2", shiftHex(safeAccent, -26));
  elements.themeSelect.value = safeTheme;
  elements.accentInput.value = safeAccent;
  state.theme = safeTheme;
  state.accent = safeAccent;
}

function renderProfileButton() {
  const active = getActiveProfile();
  elements.profileBtnName.textContent = active ? active.login : "Профиль";
  const avatar = getAvatarSrc(active);
  elements.profileBtnAvatar.src = avatar;
  elements.profilePreviewAvatar.src = avatar;
  elements.chatAvatar.src = avatar;
  elements.chatUserLabel.textContent = active
    ? `Профиль: ${active.login}`
    : "Профиль: вход не выполнен";
}

function renderProfilePopup() {
  const active = getActiveProfile();
  if (active) {
    elements.profileCurrentName.textContent = active.login;
    elements.profileCurrentHint.textContent = "Профиль активен.";
    elements.profileManageSection.classList.remove("hidden");
    const safeRoom = sanitizeStoredRoom(active.room);
    const roomType = getRoomTypeById(safeRoom);
    const peer = roomType === ROOM_TYPE.DM ? getPeerFromRoom(safeRoom, active.login) : "";
    if (peer) {
      elements.profilePopupHint.textContent = `Открыт чат: @${peer}`;
    } else if (roomType === ROOM_TYPE.GROUP) {
      elements.profilePopupHint.textContent = `Открыта группа: ${safeRoom}`;
    } else if (roomType === ROOM_TYPE.CHANNEL) {
      elements.profilePopupHint.textContent = `Открыт канал: ${safeRoom}`;
    } else {
      elements.profilePopupHint.textContent = "Откройте чат, группу или канал.";
    }
    elements.authLoginInput.value = active.login;
  } else {
    elements.profileCurrentName.textContent = "Не выполнен вход";
    elements.profileCurrentHint.textContent = "Войдите или создайте профиль.";
    elements.profileManageSection.classList.add("hidden");
    elements.profilePopupHint.textContent =
      "После входа имя в чате будет равно логину профиля.";
    if (!elements.authLoginInput.value.trim()) {
      elements.authLoginInput.value = "";
    }
  }
}

function renderSettingsAvailability() {
  const active = getActiveProfile();
  const disabled = !active;
  elements.themeSelect.disabled = disabled;
  elements.accentInput.disabled = disabled;
  elements.resetAccentBtn.disabled = disabled;
}

function updateSendAvailability() {
  const active = getActiveProfile();
  const hasRoom = Boolean(state.room && state.roomType !== ROOM_TYPE.NONE);
  const canPostFromMeta = state.activeRoomMeta ? state.activeRoomMeta.canPost !== false : true;
  const canPost = hasRoom && canPostFromMeta;
  const canManageCurrent = Boolean(
    state.activeRoomMeta &&
      (state.activeRoomMeta.type === ROOM_TYPE.GROUP ||
        state.activeRoomMeta.type === ROOM_TYPE.CHANNEL) &&
      state.activeRoomMeta.canManage
  );
  const rtcAvailable = supportsRtc();
  const canCall = Boolean(rtcAvailable && active);
  const canGroupCall = Boolean(active && rtcAvailable);
  const canStream = Boolean(
    rtcAvailable &&
      supportsScreenShare() &&
      active
  );

  elements.sendBtn.disabled = !active || !canPost;
  if (elements.emojiBtn) {
    elements.emojiBtn.disabled = !active || !canPost;
  }
  if (elements.attachBtn) {
    elements.attachBtn.disabled = !active || !canPost;
  }
  if (elements.recordAudioBtn) {
    elements.recordAudioBtn.disabled = !active || !canPost;
  }
  if (elements.recordVideoNoteBtn) {
    elements.recordVideoNoteBtn.disabled = !active || !canPost;
  }
  elements.messageInput.disabled = !active || !canPost;
  if (!active) {
    elements.messageInput.placeholder = "Сначала войдите в профиль.";
  } else if (!hasRoom) {
    elements.messageInput.placeholder = "Выберите чат для начала.";
  } else if (!canPostFromMeta) {
    elements.messageInput.placeholder = "В этом канале писать могут только администраторы.";
  } else {
    elements.messageInput.placeholder =
      "Напишите сообщение... Enter - отправить, Shift+Enter - новая строка";
  }

  if (elements.roomSettingsBtn) {
    elements.roomSettingsBtn.disabled = !active || !canManageCurrent;
  }
  if (elements.newBotBtn) {
    elements.newBotBtn.disabled = !active;
  }
  if (elements.callAudioBtn) {
    elements.callAudioBtn.disabled = !canCall || state.rtc.active;
  }
  if (elements.callVideoBtn) {
    elements.callVideoBtn.disabled = !canCall || state.rtc.active;
  }
  if (elements.groupCallBtn) {
    elements.groupCallBtn.disabled = !canGroupCall || !rtcAvailable || state.rtc.active;
  }
  if (elements.streamBtn) {
    elements.streamBtn.disabled = !canStream || state.rtc.active;
  }
  if (elements.endCallBtn) {
    elements.endCallBtn.disabled = !state.rtc.active;
  }
}

function showIpGate() {
  elements.ipGate.classList.remove("hidden");
  elements.ipGateMeta.textContent = state.clientIp
    ? `IP устройства: ${state.clientIp}`
    : "IP устройства не определен.";
  elements.ipGateHint.textContent = "";
  elements.ipGateLoginInput.value = "";
  elements.ipGatePasswordInput.value = "";
  closePopups();
}

function hideIpGate() {
  elements.ipGate.classList.add("hidden");
  elements.ipGateHint.textContent = "";
}

function closePopups() {
  elements.settingsPopup.classList.add("hidden");
  elements.profilePopup.classList.add("hidden");
  if (elements.conversationPopup) elements.conversationPopup.classList.add("hidden");
  if (elements.botPopup) elements.botPopup.classList.add("hidden");
  closeEmojiPanel();
}

function togglePopup(target) {
  const isHidden = target.classList.contains("hidden");
  closePopups();
  if (isHidden) {
    target.classList.remove("hidden");
  }
}

function isEmojiPanelOpen() {
  return elements.emojiPanel && !elements.emojiPanel.classList.contains("hidden");
}

function closeEmojiPanel() {
  if (!elements.emojiPanel) return;
  elements.emojiPanel.classList.add("hidden");
}

function toggleEmojiPanel() {
  if (!elements.emojiPanel) return;
  const willOpen = !isEmojiPanelOpen();
  if (willOpen) {
    closePopups();
    elements.emojiPanel.classList.remove("hidden");
  } else {
    closeEmojiPanel();
  }
}

function insertEmojiToMessage(emoji) {
  const input = elements.messageInput;
  if (!input || input.disabled) return;

  const safeEmoji = String(emoji || "");
  if (!safeEmoji) return;

  const start = Number.isFinite(input.selectionStart) ? input.selectionStart : input.value.length;
  const end = Number.isFinite(input.selectionEnd) ? input.selectionEnd : start;
  input.value = `${input.value.slice(0, start)}${safeEmoji}${input.value.slice(end)}`;
  const caret = start + safeEmoji.length;
  input.focus();
  input.setSelectionRange(caret, caret);
}

function renderEmojiPanel() {
  if (!elements.emojiPanel) return;
  elements.emojiPanel.innerHTML = "";
  for (const emoji of EMOJI_LIST) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "emoji-item";
    button.dataset.emoji = emoji;
    button.textContent = emoji;
    elements.emojiPanel.appendChild(button);
  }
}

function syncStateToActiveProfile() {
  const active = getActiveProfile();
  if (!active) return;
  active.room = sanitizeStoredRoom(state.room);
  active.theme = normalizeTheme(state.theme);
  active.accent = normalizeAccent(state.accent);
}

function setStatus(kind, label) {
  elements.statusBadge.classList.remove("status-online", "status-offline", "status-sync");
  if (kind === "online") elements.statusBadge.classList.add("status-online");
  if (kind === "sync") elements.statusBadge.classList.add("status-sync");
  if (kind === "offline") elements.statusBadge.classList.add("status-offline");
  elements.statusBadge.textContent = label;
}

function setConnectedStatus() {
  if (hasActiveProfile()) {
    setStatus("online", "Онлайн");
  } else {
    setStatus("offline", "Нужен вход");
  }
}

function formatTime(ts) {
  const date = new Date(ts);
  return date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

function formatBytes(size) {
  const bytes = Number(size || 0);
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function setComposerHint(text) {
  if (!elements.composerHint) return;
  elements.composerHint.textContent = String(text || "");
}

function getMessageKind(message) {
  const kind = String(message?.kind || "text").trim().toLowerCase();
  if (kind === "file" || kind === "audio" || kind === "video_note") return kind;
  return "text";
}

function getMessageFile(message) {
  const src = message?.file;
  if (!src || typeof src !== "object") return null;
  const name = String(src.name || "").trim();
  const url = String(src.url || "").trim();
  const mime = String(src.mime || "").trim().toLowerCase();
  const size = Number(src.size || 0);
  if (!url || !url.startsWith("/uploads/")) return null;
  return { name: name || "file", url, mime, size: Number.isFinite(size) ? size : 0 };
}

function renderMessageBody(article, message) {
  const kind = getMessageKind(message);
  const text = String(message?.text || "");
  const file = getMessageFile(message);

  if (kind === "text" || !file) {
    const textNode = document.createElement("p");
    textNode.className = "msg-text";
    textNode.textContent = text;
    article.appendChild(textNode);
    return;
  }

  const absoluteUrl = `${window.location.origin}${file.url}`;

  if (kind === "audio") {
    const audio = document.createElement("audio");
    audio.className = "msg-audio";
    audio.controls = true;
    audio.preload = "metadata";
    audio.src = absoluteUrl;
    article.appendChild(audio);
  } else if (kind === "video_note") {
    const video = document.createElement("video");
    video.className = "rtc-video-note";
    video.controls = true;
    video.preload = "metadata";
    video.src = absoluteUrl;
    article.appendChild(video);
  } else if (file.mime.startsWith("image/")) {
    const img = document.createElement("img");
    img.className = "msg-video";
    img.alt = file.name;
    img.loading = "lazy";
    img.src = absoluteUrl;
    article.appendChild(img);
  } else if (file.mime.startsWith("video/")) {
    const video = document.createElement("video");
    video.className = "msg-video";
    video.controls = true;
    video.preload = "metadata";
    video.src = absoluteUrl;
    article.appendChild(video);
  } else {
    const link = document.createElement("a");
    link.className = "msg-file-link";
    link.href = absoluteUrl;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = `📎 ${file.name} (${formatBytes(file.size)})`;
    article.appendChild(link);
  }

  if (text) {
    const caption = document.createElement("p");
    caption.className = "msg-text";
    caption.textContent = text;
    article.appendChild(caption);
  }
}

function clearMessages() {
  state.seenSeq.clear();
  state.lastSeq = 0;
  elements.messages.innerHTML = "";
}

function nearBottom() {
  return (
    elements.messages.scrollTop + elements.messages.clientHeight >=
    elements.messages.scrollHeight - 90
  );
}

function renderEmptyIfNeeded() {
  if (elements.messages.children.length > 0) return;
  const empty = document.createElement("p");
  empty.className = "empty-chat";
  empty.textContent = state.room
    ? "Пока нет сообщений. Напишите первым."
    : "Выберите username слева или введите его в поле.";
  elements.messages.appendChild(empty);
}

function removeEmptyPlaceholder() {
  const empty = elements.messages.querySelector(".empty-chat");
  if (empty) empty.remove();
}

function renderMessage(message) {
  if (!message || typeof message !== "object") return;
  const seq = Number(message.seq || 0);
  if (seq > 0 && state.seenSeq.has(seq)) return;
  if (seq > 0) state.seenSeq.add(seq);

  removeEmptyPlaceholder();
  const autoScroll = nearBottom();
  const article = document.createElement("article");
  article.className = "msg";
  if (message.author === state.name) {
    article.classList.add("mine");
  }

  const meta = document.createElement("p");
  meta.className = "msg-meta";

  const author = document.createElement("span");
  author.className = "msg-author";
  author.textContent = message.author || "User";

  const time = document.createElement("span");
  time.textContent = formatTime(message.createdAt || Date.now());

  meta.append(author, time);

  article.append(meta);
  renderMessageBody(article, message);
  elements.messages.appendChild(article);

  if (seq > state.lastSeq) {
    state.lastSeq = seq;
  }
  if (autoScroll) {
    elements.messages.scrollTop = elements.messages.scrollHeight;
  }
}

function setOnlineUsers(users) {
  const list = Array.isArray(users) ? users : [];
  state.onlineUsers = list.slice();
  elements.onlineLabel.textContent = `Онлайн: ${list.length}`;
}

function detectApiBase() {
  const params = new URLSearchParams(window.location.search);
  const fromQuery = params.get("api");
  if (fromQuery) return fromQuery.replace(/\/+$/, "");
  const protocol = window.location.protocol === "https:" ? "https:" : "http:";
  const host = window.location.hostname || "127.0.0.1";
  return `${protocol}//${host}:4010/api`;
}

async function apiRequest(path, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9000);
  try {
    const response = await fetch(`${state.apiBase}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
      signal: controller.signal,
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`HTTP ${response.status}: ${text || response.statusText}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchIpStatus() {
  try {
    const data = await apiRequest("/ip-status");
    state.clientIp = String(data?.ip || "");
    state.requiresIpRegistration = Boolean(data?.requiresRegistration);
    return data;
  } catch (_error) {
    state.clientIp = "";
    state.requiresIpRegistration = false;
    return null;
  }
}

async function registerCurrentIp(login, hintTarget = elements.profilePopupHint) {
  try {
    const data = await apiRequest("/ip-register", {
      method: "POST",
      body: JSON.stringify({ login }),
    });
    state.clientIp = String(data?.ip || state.clientIp || "");
    state.requiresIpRegistration = false;
    return true;
  } catch (_error) {
    if (hintTarget) {
      hintTarget.textContent = "Не удалось зарегистрировать IP. Проверьте соединение.";
    }
    return false;
  }
}

async function ensureRoomExists(room) {
  const safeRoom = sanitizeStoredRoom(room);
  if (!safeRoom || getRoomTypeById(safeRoom) !== ROOM_TYPE.DM) return;
  const active = getActiveProfile();
  await apiRequest("/rooms", {
    method: "POST",
    body: JSON.stringify({ room: safeRoom, actor: active?.login || "" }),
  });
}

async function createConversation(kind, payload) {
  return apiRequest("/conversations", {
    method: "POST",
    body: JSON.stringify({
      kind,
      ...payload,
    }),
  });
}

async function updateConversationSettings(roomId, payload) {
  return apiRequest("/conversations/settings", {
    method: "POST",
    body: JSON.stringify({
      room: roomId,
      ...payload,
    }),
  });
}

async function joinConversation(roomId, actor) {
  return apiRequest("/conversations/join", {
    method: "POST",
    body: JSON.stringify({
      room: roomId,
      actor,
    }),
  });
}

async function uploadFileAsset({ file, author, roomId }) {
  if (!file) throw new Error("Файл не выбран.");
  if (file.size > MAX_ATTACHMENT_BYTES) {
    throw new Error("Файл слишком большой (до 12 МБ).");
  }
  const dataUrl = await readFileAsDataURL(file);
  const response = await apiRequest("/upload", {
    method: "POST",
    body: JSON.stringify({
      room: roomId,
      author,
      name: file.name,
      mime: file.type || "application/octet-stream",
      dataUrl,
    }),
  });
  if (!response?.file) {
    throw new Error("Не удалось загрузить файл.");
  }
  return response.file;
}

async function sendTypedMessage({ roomId, author, kind = "text", text = "", file = null }) {
  const payload = {
    room: roomId,
    author,
    kind,
    text,
  };
  if (file) payload.file = file;
  const response = await apiRequest("/send", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return response?.message || null;
}

async function sendRtcSignal(type, payload = {}, to = "") {
  const actor = getCurrentActor();
  if (!actor || !state.room) return null;
  return apiRequest("/webrtc/signal", {
    method: "POST",
    body: JSON.stringify({
      room: state.room,
      from: actor,
      to: sanitizeLogin(to).toLowerCase(),
      type,
      payload,
    }),
  });
}

function getRoomMetaById(roomId) {
  const safe = sanitizeStoredRoom(roomId);
  if (!safe) return null;
  return state.roomsCache.find((room) => room.id === safe) || null;
}

function roomTypeCaption(type) {
  if (type === ROOM_TYPE.DM) return "Личка";
  if (type === ROOM_TYPE.GROUP) return "Группа";
  if (type === ROOM_TYPE.CHANNEL) return "Канал";
  return "Чат";
}

function getCurrentActor() {
  return sanitizeLogin(getActiveProfile()?.login || "");
}

function openConversationPopupForCreate(kind) {
  state.conversationPopupMode = "create";
  state.pendingConversationKind = kind === ROOM_TYPE.CHANNEL ? ROOM_TYPE.CHANNEL : ROOM_TYPE.GROUP;
  elements.conversationPopupTitle.textContent =
    state.pendingConversationKind === ROOM_TYPE.CHANNEL ? "Новый канал" : "Новая группа";
  elements.convTitleInput.value = "";
  elements.convDescInput.value = "";
  elements.convPrivateInput.checked = false;
  elements.convAllowPostsInput.checked = true;
  elements.convAllowPostsWrap.classList.toggle(
    "hidden",
    state.pendingConversationKind !== ROOM_TYPE.CHANNEL
  );
  elements.convSaveBtn.disabled = false;
  elements.convPopupHint.textContent = "";
  closePopups();
  elements.conversationPopup.classList.remove("hidden");
}

function openConversationPopupForSettings(roomMeta) {
  if (!roomMeta || (roomMeta.type !== ROOM_TYPE.GROUP && roomMeta.type !== ROOM_TYPE.CHANNEL)) return;
  state.conversationPopupMode = "settings";
  state.pendingConversationKind = roomMeta.type;
  elements.conversationPopupTitle.textContent = "Настройки чата";
  elements.convTitleInput.value = roomMeta.title || "";
  elements.convDescInput.value = String(roomMeta.settings?.description || "");
  elements.convPrivateInput.checked = Boolean(roomMeta.settings?.isPrivate);
  elements.convAllowPostsInput.checked = roomMeta.settings?.allowMemberPosts !== false;
  elements.convAllowPostsWrap.classList.toggle("hidden", roomMeta.type !== ROOM_TYPE.CHANNEL);
  elements.convPopupHint.textContent = roomMeta.canManage
    ? ""
    : "Изменение настроек доступно только владельцу/админу.";
  elements.convSaveBtn.disabled = !roomMeta.canManage;
  closePopups();
  elements.conversationPopup.classList.remove("hidden");
}

async function onSaveConversationPopup() {
  const active = getActiveProfile();
  if (!active) return;
  const actor = getCurrentActor();
  const title = String(elements.convTitleInput.value || "").trim();
  const description = String(elements.convDescInput.value || "").trim();
  const isPrivate = Boolean(elements.convPrivateInput.checked);
  const allowMemberPosts = Boolean(elements.convAllowPostsInput.checked);

  if (title.length < 3) {
    elements.convPopupHint.textContent = "Название должно быть минимум 3 символа.";
    return;
  }

  elements.convSaveBtn.disabled = true;
  try {
    if (state.conversationPopupMode === "create") {
      const created = await createConversation(state.pendingConversationKind, {
        creator: actor,
        title,
        description,
        isPrivate,
        allowMemberPosts,
      });
      const room = created?.room;
      if (!room?.id) {
        elements.convPopupHint.textContent = "Не удалось создать чат.";
        return;
      }
      elements.convPopupHint.textContent = "Чат создан.";
      await refreshRooms();
      elements.conversationPopup.classList.add("hidden");
      await openRoom(room.id, room, {});
      return;
    }

    const targetRoom = state.activeRoomMeta?.id || state.room;
    if (!targetRoom) {
      elements.convPopupHint.textContent = "Сначала выберите группу или канал.";
      return;
    }

    await updateConversationSettings(targetRoom, {
      actor,
      title,
      description,
      isPrivate,
      allowMemberPosts,
    });
    elements.convPopupHint.textContent = "Настройки сохранены.";
    await refreshRooms();
  } catch (_error) {
    elements.convPopupHint.textContent = "Ошибка сохранения.";
  } finally {
    elements.convSaveBtn.disabled = false;
  }
}

function populateBotTargets() {
  if (!elements.botTargetSelect) return;
  elements.botTargetSelect.innerHTML = "";
  const targets = state.roomsCache.filter(
    (room) =>
      (room.type === ROOM_TYPE.GROUP || room.type === ROOM_TYPE.CHANNEL) &&
      room.joined &&
      room.canManage
  );

  if (targets.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "Нет доступных групп/каналов";
    elements.botTargetSelect.appendChild(option);
    return;
  }

  for (const room of targets) {
    const option = document.createElement("option");
    option.value = room.id;
    option.textContent = `${roomTypeCaption(room.type)}: ${room.title}`;
    elements.botTargetSelect.appendChild(option);
  }
}

async function refreshBotsInfo() {
  const actor = getCurrentActor();
  if (!actor || !elements.botInfoLabel) {
    elements.botInfoLabel.textContent = "";
    return;
  }
  try {
    const data = await apiRequest(`/bots?owner=${encodeURIComponent(actor)}`);
    const bots = Array.isArray(data?.bots) ? data.bots : [];
    elements.botInfoLabel.textContent =
      bots.length > 0 ? `Python-ботов: ${bots.length}` : "Python-ботов пока нет.";
  } catch (_error) {
    elements.botInfoLabel.textContent = "Не удалось загрузить ботов.";
  }
}

function openBotPopup() {
  const active = getActiveProfile();
  if (!active) {
    setStatus("offline", "Нужен вход");
    return;
  }
  populateBotTargets();
  elements.botNameInput.value = "";
  elements.botTriggerInput.value = "!ping";
  elements.botReplyInput.value = "pong";
  elements.botPopupHint.textContent = "";
  closePopups();
  elements.botPopup.classList.remove("hidden");
}

async function onCreateBot() {
  const actor = getCurrentActor();
  if (!actor) return;

  const name = String(elements.botNameInput.value || "").trim();
  const room = sanitizeStoredRoom(elements.botTargetSelect.value);
  const trigger = String(elements.botTriggerInput.value || "").trim();
  const response = String(elements.botReplyInput.value || "").trim();

  if (name.length < 3) {
    elements.botPopupHint.textContent = "Имя бота должно быть минимум 3 символа.";
    return;
  }
  if (!room) {
    elements.botPopupHint.textContent = "Выберите цель для бота.";
    return;
  }
  if (!trigger || !response) {
    elements.botPopupHint.textContent = "Укажите триггер и ответ.";
    return;
  }

  elements.botCreateBtn.disabled = true;
  try {
    const result = await apiRequest("/bots", {
      method: "POST",
      body: JSON.stringify({ owner: actor, name, room, trigger, response }),
    });
    if (!result?.bot) {
      elements.botPopupHint.textContent = "Не удалось создать бота.";
      return;
    }
    const pathLabel = String(result.bot.filePath || "");
    elements.botPopupHint.textContent = pathLabel
      ? `Бот создан: ${pathLabel}`
      : "Бот создан.";
    await refreshRooms();
    await refreshBotsInfo();
  } catch (_error) {
    elements.botPopupHint.textContent = "Ошибка создания бота.";
  } finally {
    elements.botCreateBtn.disabled = false;
  }
}

function supportsRtc() {
  return Boolean(
    window.RTCPeerConnection &&
      navigator.mediaDevices &&
      typeof navigator.mediaDevices.getUserMedia === "function"
  );
}

function supportsScreenShare() {
  return Boolean(navigator.mediaDevices && typeof navigator.mediaDevices.getDisplayMedia === "function");
}

function supportsMediaRecording() {
  return typeof window.MediaRecorder !== "undefined";
}

function makeSessionId(prefix = "sess") {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function stopMediaStream(stream) {
  if (!stream) return;
  for (const track of stream.getTracks()) {
    try {
      track.stop();
    } catch (_error) {
      // ignore
    }
  }
}

function closeRtcPeer(peerLogin) {
  const safePeer = sanitizeLogin(peerLogin).toLowerCase();
  const entry = state.rtc.peers.get(safePeer);
  if (!entry) return;
  try {
    entry.pc.close();
  } catch (_error) {
    // ignore
  }
  state.rtc.peers.delete(safePeer);
  state.rtc.remoteStreams.delete(safePeer);
}

function setRtcStatus(text) {
  if (!elements.rtcStatusLabel) return;
  elements.rtcStatusLabel.textContent = String(text || "");
}

function createRtcTile(label, stream, options = {}) {
  const tile = document.createElement("article");
  tile.className = "rtc-tile";
  if (options.local) tile.classList.add("local");

  const hasVideo = Boolean(stream && stream.getVideoTracks().length > 0);
  if (hasVideo) {
    const video = document.createElement("video");
    video.autoplay = true;
    video.playsInline = true;
    video.srcObject = stream;
    video.muted = Boolean(options.local);
    tile.appendChild(video);
  } else {
    const voice = document.createElement("div");
    voice.className = "muted";
    voice.textContent = "audio";
    voice.style.padding = "20px 10px 12px";
    tile.appendChild(voice);
  }

  const name = document.createElement("p");
  name.className = "rtc-name";
  name.textContent = String(label || "participant");
  tile.appendChild(name);
  return tile;
}

function renderRtcPanel() {
  if (!elements.rtcPanel || !elements.rtcVideos) return;
  const visible =
    state.rtc.active || Boolean(state.rtc.localStream) || state.rtc.remoteStreams.size > 0;
  elements.rtcPanel.classList.toggle("hidden", !visible);

  if (elements.endCallBtn) {
    elements.endCallBtn.classList.toggle("hidden", !state.rtc.active);
  }

  elements.rtcVideos.innerHTML = "";
  if (state.rtc.localStream) {
    elements.rtcVideos.appendChild(createRtcTile("You", state.rtc.localStream, { local: true }));
  }
  for (const [peer, stream] of state.rtc.remoteStreams.entries()) {
    elements.rtcVideos.appendChild(createRtcTile(peer, stream));
  }
  if (elements.rtcVideos.children.length === 0 && visible) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "Ожидание подключения участников...";
    elements.rtcVideos.appendChild(empty);
  }
  updateSendAvailability();
}

async function stopRtcSession(reason = "", notifyPeers = false) {
  const wasActive = state.rtc.active;
  const sessionId = state.rtc.sessionId;
  const mode = state.rtc.mode;

  if (notifyPeers && wasActive && sessionId) {
    const signalType = mode === "stream-broadcast" || mode === "stream-watch"
      ? RTC_SIGNAL.STREAM_END
      : RTC_SIGNAL.CALL_END;
    try {
      await sendRtcSignal(signalType, { sessionId, reason: String(reason || "") });
    } catch (_error) {
      // ignore network race on stop
    }
  }

  for (const peer of Array.from(state.rtc.peers.keys())) {
    closeRtcPeer(peer);
  }
  stopMediaStream(state.rtc.localStream);
  state.rtc = createRtcState();
  setRtcStatus(reason || "Медиа-сессия не активна.");
  renderRtcPanel();
}

function isCurrentSession(sessionId) {
  return Boolean(
    state.rtc.active &&
      state.rtc.sessionId &&
      String(sessionId || "") === String(state.rtc.sessionId)
  );
}

function shouldOfferToPeer(peerLogin) {
  const self = getCurrentActor();
  const peer = sanitizeLogin(peerLogin).toLowerCase();
  if (!self || !peer) return false;
  return self.localeCompare(peer, "en") < 0;
}

function ensurePeerConnection(peerLogin) {
  const peer = sanitizeLogin(peerLogin).toLowerCase();
  if (!peer) return null;
  const existing = state.rtc.peers.get(peer);
  if (existing) return existing;

  const pc = new RTCPeerConnection({ iceServers: [] });
  const entry = { pc };
  state.rtc.peers.set(peer, entry);

  const shouldSendTracks = state.rtc.mode !== "stream-watch" && Boolean(state.rtc.localStream);
  if (shouldSendTracks && state.rtc.localStream) {
    for (const track of state.rtc.localStream.getTracks()) {
      pc.addTrack(track, state.rtc.localStream);
    }
  }

  pc.onicecandidate = (event) => {
    if (!event.candidate || !state.rtc.active) return;
    void sendRtcSignal(
      RTC_SIGNAL.ICE,
      { sessionId: state.rtc.sessionId, candidate: event.candidate },
      peer
    );
  };

  pc.ontrack = (event) => {
    let remote = state.rtc.remoteStreams.get(peer);
    if (!remote) {
      remote = new MediaStream();
      state.rtc.remoteStreams.set(peer, remote);
    }
    if (event.streams && event.streams[0]) {
      for (const track of event.streams[0].getTracks()) {
        if (!remote.getTracks().some((t) => t.id === track.id)) remote.addTrack(track);
      }
    } else if (event.track && !remote.getTracks().some((t) => t.id === event.track.id)) {
      remote.addTrack(event.track);
    }
    renderRtcPanel();
  };

  pc.onconnectionstatechange = () => {
    if (pc.connectionState === "failed" || pc.connectionState === "closed") {
      closeRtcPeer(peer);
      renderRtcPanel();
    }
  };

  return entry;
}

async function createOfferForPeer(peerLogin) {
  const peer = sanitizeLogin(peerLogin).toLowerCase();
  if (!peer || !state.rtc.active) return;
  const entry = ensurePeerConnection(peer);
  if (!entry) return;
  const pc = entry.pc;
  if (pc.signalingState !== "stable") return;

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  await sendRtcSignal(
    RTC_SIGNAL.OFFER,
    { sessionId: state.rtc.sessionId, mode: state.rtc.mode, sdp: pc.localDescription },
    peer
  );
}

async function ensureLocalStream(constraints) {
  if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== "function") {
    throw new Error("WebRTC недоступен в этом браузере.");
  }
  const stream = await navigator.mediaDevices.getUserMedia(constraints);
  return stream;
}

async function startCallSession(options = {}) {
  if (!supportsRtc()) {
    setComposerHint("Браузер не поддерживает WebRTC.");
    return;
  }
  if (state.rtc.active) return;
  if (!state.room) {
    setComposerHint("Сначала выберите чат.");
    return;
  }

  const actor = getCurrentActor();
  if (!actor) return;
  const withVideo = Boolean(options.video);
  const isGroup = Boolean(options.group);

  if (state.roomType === ROOM_TYPE.CHANNEL) {
    setComposerHint("Звонки доступны только в личке и группах.");
    return;
  }
  if (isGroup && state.roomType !== ROOM_TYPE.GROUP) {
    setComposerHint("Групповой звонок доступен только в группе.");
    return;
  }

  const localStream = await ensureLocalStream({ audio: true, video: withVideo });
  state.rtc = createRtcState();
  state.rtc.active = true;
  state.rtc.mode = "call";
  state.rtc.sessionId = makeSessionId("call");
  state.rtc.roomId = state.room;
  state.rtc.initiator = actor;
  state.rtc.videoEnabled = withVideo;
  state.rtc.localStream = localStream;
  renderRtcPanel();
  setRtcStatus(withVideo ? "Видеозвонок: приглашение отправлено." : "Аудиозвонок: приглашение отправлено.");

  const candidates = [];
  if (state.roomType === ROOM_TYPE.DM) {
    if (state.chatTarget) candidates.push(state.chatTarget);
  } else {
    const self = actor.toLowerCase();
    for (const user of state.onlineUsers) {
      const login = sanitizeLogin(user).toLowerCase();
      if (!login || login === self) continue;
      if (!candidates.includes(login)) candidates.push(login);
    }
  }

  if (candidates.length === 0) {
    setComposerHint("Нет онлайн-участников для звонка.");
  }

  for (const target of candidates) {
    await sendRtcSignal(RTC_SIGNAL.CALL_INVITE, {
      sessionId: state.rtc.sessionId,
      video: withVideo,
      group: isGroup,
      initiator: actor,
    }, target);
  }

  await sendRtcSignal(RTC_SIGNAL.CALL_JOIN, {
    sessionId: state.rtc.sessionId,
    video: withVideo,
    initiator: actor,
  });
  updateSendAvailability();
}

async function startIncomingCall({ sessionId, from, video, initiator }) {
  if (state.rtc.active && state.rtc.sessionId !== sessionId) {
    await sendRtcSignal(RTC_SIGNAL.CALL_BUSY, { sessionId }, from);
    return;
  }
  if (state.rtc.active && state.rtc.sessionId === sessionId) return;

  const localStream = await ensureLocalStream({ audio: true, video: Boolean(video) });
  state.rtc = createRtcState();
  state.rtc.active = true;
  state.rtc.mode = "call";
  state.rtc.sessionId = sessionId;
  state.rtc.roomId = state.room;
  state.rtc.initiator = sanitizeLogin(initiator || from).toLowerCase();
  state.rtc.videoEnabled = Boolean(video);
  state.rtc.localStream = localStream;
  renderRtcPanel();
  setRtcStatus(`В звонке с ${from}`);

  await sendRtcSignal(RTC_SIGNAL.CALL_JOIN, {
    sessionId,
    video: Boolean(video),
    initiator: state.rtc.initiator,
  });

  if (shouldOfferToPeer(from)) {
    await createOfferForPeer(from);
  }
}

async function startChannelStream() {
  if (!supportsRtc() || !supportsScreenShare()) {
    setComposerHint("Стрим недоступен в этом браузере.");
    return;
  }
  if (state.roomType !== ROOM_TYPE.CHANNEL || !state.activeRoomMeta?.canManage) {
    setComposerHint("Стрим в канале может запускать только владелец/админ.");
    return;
  }
  if (state.rtc.active) return;

  const actor = getCurrentActor();
  if (!actor) return;

  const localStream = await navigator.mediaDevices.getDisplayMedia({
    video: true,
    audio: true,
  });

  state.rtc = createRtcState();
  state.rtc.active = true;
  state.rtc.mode = "stream-broadcast";
  state.rtc.sessionId = makeSessionId("stream");
  state.rtc.roomId = state.room;
  state.rtc.initiator = actor;
  state.rtc.videoEnabled = true;
  state.rtc.localStream = localStream;

  for (const track of localStream.getVideoTracks()) {
    track.addEventListener("ended", () => {
      void stopRtcSession("Стрим завершен.", true);
    });
  }

  renderRtcPanel();
  setRtcStatus("Стрим запущен.");

  await sendRtcSignal(RTC_SIGNAL.STREAM_START, {
    sessionId: state.rtc.sessionId,
    initiator: actor,
    title: state.roomTitle || state.room,
  });
}

async function joinChannelStream(sessionId, hostLogin) {
  if (state.rtc.active) return;
  state.rtc = createRtcState();
  state.rtc.active = true;
  state.rtc.mode = "stream-watch";
  state.rtc.sessionId = sessionId;
  state.rtc.roomId = state.room;
  state.rtc.streamHost = sanitizeLogin(hostLogin).toLowerCase();
  renderRtcPanel();
  setRtcStatus(`Подключение к стриму @${state.rtc.streamHost}...`);
  await sendRtcSignal(RTC_SIGNAL.STREAM_VIEWER_JOIN, { sessionId }, state.rtc.streamHost);
}

async function handleRtcOffer(event) {
  const from = sanitizeLogin(event.from).toLowerCase();
  const payload = event.payload && typeof event.payload === "object" ? event.payload : {};
  if (!from || !payload.sessionId || !isCurrentSession(payload.sessionId)) return;
  if (!payload.sdp || typeof payload.sdp !== "object") return;

  const entry = ensurePeerConnection(from);
  if (!entry) return;
  const pc = entry.pc;

  await pc.setRemoteDescription(payload.sdp);
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  await sendRtcSignal(RTC_SIGNAL.ANSWER, { sessionId: state.rtc.sessionId, sdp: pc.localDescription }, from);
}

async function handleRtcAnswer(event) {
  const from = sanitizeLogin(event.from).toLowerCase();
  const payload = event.payload && typeof event.payload === "object" ? event.payload : {};
  if (!from || !payload.sessionId || !isCurrentSession(payload.sessionId)) return;
  if (!payload.sdp || typeof payload.sdp !== "object") return;

  const entry = ensurePeerConnection(from);
  if (!entry) return;
  if (!entry.pc.currentRemoteDescription) {
    await entry.pc.setRemoteDescription(payload.sdp);
  }
}

async function handleRtcIce(event) {
  const from = sanitizeLogin(event.from).toLowerCase();
  const payload = event.payload && typeof event.payload === "object" ? event.payload : {};
  if (!from || !payload.sessionId || !isCurrentSession(payload.sessionId)) return;
  if (!payload.candidate || typeof payload.candidate !== "object") return;

  const entry = ensurePeerConnection(from);
  if (!entry) return;
  try {
    await entry.pc.addIceCandidate(payload.candidate);
  } catch (_error) {
    // ignore race where remote description is not ready yet
  }
}

async function handleRtcSignalEvent(event) {
  const type = String(event?.type || "").trim().toLowerCase();
  const from = sanitizeLogin(event?.from).toLowerCase();
  const payload = event?.payload && typeof event.payload === "object" ? event.payload : {};
  if (!type || !from) return;

  if (type === RTC_SIGNAL.CALL_INVITE) {
    if (state.rtc.active && !isCurrentSession(payload.sessionId)) {
      await sendRtcSignal(RTC_SIGNAL.CALL_BUSY, { sessionId: payload.sessionId }, from);
      return;
    }
    if (state.rtc.active) return;

    const isVideo = Boolean(payload.video);
    const isGroup = Boolean(payload.group);
    const prompt = isVideo
      ? `${from} приглашает в видеозвонок${isGroup ? " (групповой)" : ""}. Принять?`
      : `${from} приглашает в аудиозвонок${isGroup ? " (групповой)" : ""}. Принять?`;
    const accepted = window.confirm(prompt);
    if (!accepted) {
      await sendRtcSignal(RTC_SIGNAL.CALL_BUSY, { sessionId: payload.sessionId }, from);
      return;
    }

    try {
      await startIncomingCall({
        sessionId: String(payload.sessionId || ""),
        from,
        video: Boolean(payload.video),
        initiator: payload.initiator,
      });
    } catch (_error) {
      setComposerHint("Не удалось подключить звонок.");
    }
    return;
  }

  if (type === RTC_SIGNAL.CALL_JOIN) {
    if (!isCurrentSession(payload.sessionId)) return;
    if (shouldOfferToPeer(from)) {
      await createOfferForPeer(from);
    }
    return;
  }

  if (type === RTC_SIGNAL.CALL_END) {
    if (!isCurrentSession(payload.sessionId)) return;
    await stopRtcSession("Звонок завершен.", false);
    return;
  }

  if (type === RTC_SIGNAL.CALL_BUSY) {
    if (!isCurrentSession(payload.sessionId)) return;
    setRtcStatus(`${from} занят.`);
    return;
  }

  if (type === RTC_SIGNAL.STREAM_START) {
    if (state.roomType !== ROOM_TYPE.CHANNEL || state.rtc.active) return;
    const sessionId = String(payload.sessionId || "");
    if (!sessionId) return;
    const accepted = window.confirm(`@${from} запустил стрим в канале. Подключиться?`);
    if (!accepted) return;
    await joinChannelStream(sessionId, from);
    return;
  }

  if (type === RTC_SIGNAL.STREAM_VIEWER_JOIN) {
    if (!isCurrentSession(payload.sessionId)) return;
    if (state.rtc.mode !== "stream-broadcast") return;
    await createOfferForPeer(from);
    return;
  }

  if (type === RTC_SIGNAL.STREAM_END) {
    if (!isCurrentSession(payload.sessionId)) return;
    await stopRtcSession("Стрим завершен.", false);
    return;
  }

  if (type === RTC_SIGNAL.OFFER) {
    await handleRtcOffer(event);
    return;
  }
  if (type === RTC_SIGNAL.ANSWER) {
    await handleRtcAnswer(event);
    return;
  }
  if (type === RTC_SIGNAL.ICE) {
    await handleRtcIce(event);
  }
}

function scheduleSignalPoll(delay) {
  if (state.signalTimer) clearTimeout(state.signalTimer);
  state.signalTimer = setTimeout(() => {
    void pollSignals();
  }, delay);
}

async function pollSignals() {
  const actor = getCurrentActor();
  if (!state.room || !actor) {
    scheduleSignalPoll(1500);
    return;
  }
  try {
    const response = await apiRequest(
      `/webrtc/poll?room=${encodeURIComponent(state.room)}&actor=${encodeURIComponent(
        actor
      )}&after=${encodeURIComponent(state.signalAfter)}`
    );
    const events = Array.isArray(response?.events) ? response.events : [];
    for (const event of events) {
      const seq = Number(event?.seq || 0);
      if (seq > state.signalAfter) state.signalAfter = seq;
      try {
        await handleRtcSignalEvent(event);
      } catch (_error) {
        // keep polling even if one signal failed
      }
    }
    const cursor = Number(response?.cursor || 0);
    if (cursor > state.signalAfter) state.signalAfter = cursor;
    scheduleSignalPoll(SIGNAL_POLL_MS);
  } catch (_error) {
    scheduleSignalPoll(2200);
  }
}

function stopActiveRecordings() {
  if (state.recordingAudio?.recorder && state.recordingAudio.recorder.state !== "inactive") {
    state.recordingAudio.recorder.stop();
  }
  if (state.recordingVideo?.recorder && state.recordingVideo.recorder.state !== "inactive") {
    state.recordingVideo.recorder.stop();
  }
}

async function uploadAndSendMediaMessage(kind, file, caption = "", options = {}) {
  const active = getActiveProfile();
  const roomId = sanitizeStoredRoom(options.roomId || state.room);
  const author = sanitizeLogin(options.author || active?.login || "");
  if (!author || !roomId) return null;
  const uploaded = await uploadFileAsset({
    file,
    author,
    roomId,
  });
  return sendTypedMessage({
    roomId,
    author,
    kind,
    text: String(caption || "").trim(),
    file: uploaded,
  });
}

async function onAttachFileSelected() {
  const active = getActiveProfile();
  const file = elements.fileInput.files && elements.fileInput.files[0];
  elements.fileInput.value = "";
  if (!active || !state.room || !file) return;

  elements.attachBtn.disabled = true;
  setComposerHint("Загрузка файла...");
  try {
    const kind = file.type.startsWith("audio/") ? "audio" : "file";
    const caption = elements.messageInput.value.trim();
    const message = await uploadAndSendMediaMessage(kind, file, caption);
    if (message) {
      renderMessage(message);
      elements.messageInput.value = "";
      setComposerHint("Файл отправлен.");
    }
  } catch (error) {
    setComposerHint(error?.message || "Не удалось отправить файл.");
  } finally {
    updateSendAvailability();
  }
}

async function toggleAudioRecording() {
  if (!supportsMediaRecording()) {
    setComposerHint("Запись аудио не поддерживается браузером.");
    return;
  }
  if (state.recordingAudio?.recorder) {
    state.recordingAudio.recorder.stop();
    return;
  }
  if (state.recordingVideo?.recorder) {
    setComposerHint("Сначала остановите запись кружка.");
    return;
  }

  const active = getActiveProfile();
  const roomId = sanitizeStoredRoom(state.room);
  const author = sanitizeLogin(active?.login || "");
  if (!roomId || !author) {
    setComposerHint("Сначала выберите чат.");
    return;
  }

  const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  const chunks = [];
  const preferred = window.MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
    ? "audio/webm;codecs=opus"
    : "audio/webm";
  const recorder = preferred ? new MediaRecorder(stream, { mimeType: preferred }) : new MediaRecorder(stream);

  recorder.ondataavailable = (event) => {
    if (event.data && event.data.size > 0) chunks.push(event.data);
  };
  recorder.onstop = () => {
    const localChunks = chunks.slice();
    stopMediaStream(stream);
    state.recordingAudio = null;
    elements.recordAudioBtn.classList.remove("recording");
    elements.recordAudioBtn.textContent = "Audio";
    void (async () => {
      const blob = new Blob(localChunks, { type: recorder.mimeType || "audio/webm" });
      if (!blob.size) {
        setComposerHint("Аудио не записано.");
        return;
      }
      const file = new File([blob], `voice_${Date.now().toString(36)}.webm`, {
        type: blob.type || "audio/webm",
      });
      try {
        const message = await uploadAndSendMediaMessage("audio", file, "", { roomId, author });
        if (message) renderMessage(message);
        setComposerHint("Аудиосообщение отправлено.");
      } catch (_error) {
        setComposerHint("Не удалось отправить аудио.");
      } finally {
        updateSendAvailability();
      }
    })();
  };

  state.recordingAudio = {
    recorder,
    startedAt: Date.now(),
  };
  recorder.start(250);
  elements.recordAudioBtn.classList.add("recording");
  elements.recordAudioBtn.textContent = "Stop";
  setComposerHint("Идет запись аудио...");

  setTimeout(() => {
    if (state.recordingAudio?.recorder === recorder && recorder.state !== "inactive") {
      recorder.stop();
    }
  }, AUDIO_NOTE_MAX_MS);
}

async function toggleVideoNoteRecording() {
  if (!supportsMediaRecording()) {
    setComposerHint("Запись видео не поддерживается браузером.");
    return;
  }
  if (state.recordingVideo?.recorder) {
    state.recordingVideo.recorder.stop();
    return;
  }
  if (state.recordingAudio?.recorder) {
    setComposerHint("Сначала остановите запись аудио.");
    return;
  }

  const active = getActiveProfile();
  const roomId = sanitizeStoredRoom(state.room);
  const author = sanitizeLogin(active?.login || "");
  if (!roomId || !author) {
    setComposerHint("Сначала выберите чат.");
    return;
  }

  const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
  const chunks = [];
  const preferred = window.MediaRecorder.isTypeSupported("video/webm;codecs=vp8,opus")
    ? "video/webm;codecs=vp8,opus"
    : "video/webm";
  const recorder = preferred ? new MediaRecorder(stream, { mimeType: preferred }) : new MediaRecorder(stream);

  recorder.ondataavailable = (event) => {
    if (event.data && event.data.size > 0) chunks.push(event.data);
  };
  recorder.onstop = () => {
    const localChunks = chunks.slice();
    stopMediaStream(stream);
    state.recordingVideo = null;
    elements.recordVideoNoteBtn.classList.remove("recording");
    elements.recordVideoNoteBtn.textContent = "Circle";
    void (async () => {
      const blob = new Blob(localChunks, { type: recorder.mimeType || "video/webm" });
      if (!blob.size) {
        setComposerHint("Видео не записано.");
        return;
      }
      const file = new File([blob], `circle_${Date.now().toString(36)}.webm`, {
        type: blob.type || "video/webm",
      });
      try {
        const message = await uploadAndSendMediaMessage("video_note", file, "", { roomId, author });
        if (message) renderMessage(message);
        setComposerHint("Кружок отправлен.");
      } catch (_error) {
        setComposerHint("Не удалось отправить кружок.");
      } finally {
        updateSendAvailability();
      }
    })();
  };

  state.recordingVideo = {
    recorder,
    startedAt: Date.now(),
  };
  recorder.start(250);
  elements.recordVideoNoteBtn.classList.add("recording");
  elements.recordVideoNoteBtn.textContent = "Stop";
  setComposerHint("Идет запись кружка...");

  setTimeout(() => {
    if (state.recordingVideo?.recorder === recorder && recorder.state !== "inactive") {
      recorder.stop();
    }
  }, VIDEO_NOTE_MAX_MS);
}

async function sendPresence(online, roomOverride = null, authorOverride = null) {
  const active = getActiveProfile();
  if (!active) return;
  const room = sanitizeStoredRoom(roomOverride || state.room);
  const author = sanitizeLogin(authorOverride || state.name);
  if (!author || !room) return;

  try {
    const response = await apiRequest("/presence", {
      method: "POST",
      body: JSON.stringify({
        room,
        author,
        online: Boolean(online),
      }),
    });
    setOnlineUsers(response.onlineUsers);
  } catch (_error) {
    // Presence is best-effort.
  }
}

function schedulePoll(delay) {
  if (state.pollTimer) {
    clearTimeout(state.pollTimer);
  }
  state.pollTimer = setTimeout(() => {
    void pollMessages();
  }, delay);
}

async function pollMessages() {
  if (!state.room) {
    setOnlineUsers([]);
    renderEmptyIfNeeded();
    updateSendAvailability();
    return;
  }
  if (state.activePoll) return;
  state.activePoll = true;
  try {
    const active = getActiveProfile();
    const actor = sanitizeLogin(active?.login || state.name);
    const response = await apiRequest(
      `/messages?room=${encodeURIComponent(state.room)}&after=${encodeURIComponent(
        state.lastSeq
      )}&actor=${encodeURIComponent(actor)}`
    );
    if (response?.room && typeof response.room === "object") {
      state.roomType = String(response.room.type || state.roomType || ROOM_TYPE.NONE);
      if (state.roomType === ROOM_TYPE.DM) {
        state.chatTarget = getPeerFromRoom(state.room, actor);
      }
      state.activeRoomMeta = {
        ...(state.activeRoomMeta || {}),
        ...response.room,
      };
      updateCurrentRoomLabel();
    }
    const incoming = Array.isArray(response.messages) ? response.messages : [];
    for (const message of incoming) {
      renderMessage(message);
    }
    setOnlineUsers(response.onlineUsers);
    updateSendAvailability();
    setConnectedStatus();
    schedulePoll(POLL_INTERVAL_MS);
  } catch (_error) {
    setStatus("offline", "Связь потеряна");
    schedulePoll(2500);
  } finally {
    state.activePoll = false;
  }
}

function renderRooms(rooms) {
  elements.roomsList.innerHTML = "";
  const active = getActiveProfile();
  if (!active) {
    const hint = document.createElement("p");
    hint.className = "muted";
    hint.textContent = "Войдите в профиль, чтобы открыть чат.";
    elements.roomsList.appendChild(hint);
    return;
  }

  const list = Array.isArray(rooms) ? rooms : [];
  state.roomsCache = list.slice();

  if (list.length === 0) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "Чатов пока нет.";
    elements.roomsList.appendChild(empty);
    return;
  }

  for (const room of list) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "room-item";
    if (room.id === state.room) {
      button.classList.add("active");
    }

    const kind = document.createElement("p");
    kind.className = "kind";
    kind.textContent = roomTypeCaption(room.type);

    const title = document.createElement("p");
    title.className = "title";

    const peer = room.peer || getPeerFromRoom(room.id, active.login);
    if (room.type === ROOM_TYPE.DM) {
      title.textContent = `@${peer || "unknown"}`;
    } else {
      title.textContent = room.title || room.id;
    }

    const meta = document.createElement("p");
    meta.className = "meta";
    const suffix = room.lastMessage
      ? `${room.lastMessage.author}: ${room.lastMessage.text}`
      : "Без сообщений";
    meta.textContent = suffix;

    button.append(kind, title, meta);

    if (room.type !== ROOM_TYPE.DM && room.joined === false && room.settings?.isPrivate !== true) {
      const badge = document.createElement("span");
      badge.className = "badge";
      badge.textContent = "Вступить";
      button.appendChild(badge);
    }

    button.addEventListener("click", () => {
      if (room.type === ROOM_TYPE.DM) {
        elements.roomInput.value = peer || "";
        void openDialogByUsername(peer || "");
      } else {
        void openRoom(room.id, room, {});
      }
    });
    elements.roomsList.appendChild(button);
  }
}

async function refreshRooms() {
  const active = getActiveProfile();
  const actor = sanitizeLogin(active?.login || "");
  try {
    const response = await apiRequest(`/rooms?actor=${encodeURIComponent(actor)}`);
    renderRooms(response.rooms);

    if (state.room) {
      const current = getRoomMetaById(state.room);
      if (current) {
        state.activeRoomMeta = current;
        state.roomType = current.type || getRoomTypeById(state.room);
        state.roomTitle = current.title || state.roomTitle || "";
        if (state.roomType === ROOM_TYPE.DM) {
          state.chatTarget = current.peer || getPeerFromRoom(state.room, actor);
        }
        updateCurrentRoomLabel();
        updateSendAvailability();
      }
    }
    await refreshBotsInfo();
    setConnectedStatus();
  } catch (_error) {
    setStatus("offline", "Связь потеряна");
  } finally {
    if (state.roomsTimer) clearTimeout(state.roomsTimer);
    state.roomsTimer = setTimeout(() => void refreshRooms(), ROOMS_REFRESH_MS);
  }
}

async function openRoom(roomId, roomMeta = null, options = {}) {
  const active = getActiveProfile();
  if (!active) return;

  const nextRoom = sanitizeStoredRoom(roomId);
  const nextType = getRoomTypeById(nextRoom);
  if (!nextRoom || nextType === ROOM_TYPE.NONE) return;

  const actor = sanitizeLogin(active.login).toLowerCase();
  let meta = roomMeta || getRoomMetaById(nextRoom);

  if (nextType !== ROOM_TYPE.DM && meta && meta.joined === false) {
    try {
      const joinResponse = await joinConversation(nextRoom, actor);
      if (joinResponse?.room) {
        meta = joinResponse.room;
      }
    } catch (_error) {
      setStatus("offline", "Нужен доступ к чату");
      return;
    }
  }

  const prevRoom = state.room;
  if (state.rtc.active && prevRoom && prevRoom !== nextRoom) {
    await stopRtcSession("Медиа-сессия остановлена при смене чата.", true);
  }
  state.room = nextRoom;
  state.roomType = nextType;
  state.activeRoomMeta = meta || null;
  state.roomTitle = meta?.title || "";
  state.signalAfter = 0;
  state.chatTarget =
    nextType === ROOM_TYPE.DM
      ? sanitizeLogin(meta?.peer || getPeerFromRoom(nextRoom, actor)).toLowerCase()
      : "";

  if (nextType === ROOM_TYPE.DM) {
    elements.roomInput.value = state.chatTarget;
  } else {
    elements.roomInput.value = "";
  }

  updateCurrentRoomLabel();
  active.room = nextRoom;
  syncStateToActiveProfile();
  savePrefs();
  updateSendAvailability();

  if (active && !options.skipPreviousLeave && prevRoom && prevRoom !== nextRoom) {
    await sendPresence(false, prevRoom, state.name);
  }

  clearMessages();
  renderEmptyIfNeeded();
  setStatus("sync", "Синхронизация");

  try {
    await ensureRoomExists(nextRoom);
  } catch (_error) {
    setStatus("offline", "Ошибка комнаты");
    return;
  }

  await sendPresence(true, nextRoom, active.login);
  await pollMessages();
  scheduleSignalPoll(120);
  await refreshRooms();
}

async function openDialogByUsername(rawLogin, options = {}) {
  const active = getActiveProfile();
  if (!active) {
    setStatus("offline", "Нужен вход");
    elements.profilePopupHint.textContent = "Сначала войдите в профиль.";
    togglePopup(elements.profilePopup);
    return;
  }

  const target = sanitizeLogin(rawLogin).toLowerCase();
  if (target.length < 3) {
    setStatus("offline", "Укажите username");
    return;
  }

  if (target === sanitizeLogin(active.login).toLowerCase()) {
    setStatus("offline", "Нельзя писать себе");
    return;
  }

  const roomId = makeDirectRoomId(active.login, target);
  if (!roomId) {
    setStatus("offline", "Некорректный username");
    return;
  }

  await openRoom(
    roomId,
    {
      id: roomId,
      type: ROOM_TYPE.DM,
      title: target,
      peer: target,
      joined: true,
      canPost: true,
      canManage: false,
    },
    options
  );
}

async function activateProfile(profile, options = {}) {
  const prevName = state.name;
  const prevRoom = state.room;
  const prevHadActive = hasActiveProfile();

  stopActiveRecordings();
  if (state.rtc.active) {
    await stopRtcSession("Медиа-сессия остановлена.", true);
  }

  if (state.started && prevHadActive && prevRoom && !options.skipPreviousLeave) {
    await sendPresence(false, prevRoom, prevName);
  }

  if (!profile) {
    state.activeProfileId = "";
    state.name = "guest";
    state.room = DEFAULT_ROOM;
    state.roomType = ROOM_TYPE.NONE;
    state.roomTitle = "";
    state.activeRoomMeta = null;
    state.chatTarget = "";
    state.theme = DEFAULT_THEME;
    state.accent = DEFAULT_ACCENT;
    applyTheme(state.theme, state.accent);
    renderProfileButton();
    renderProfilePopup();
    renderSettingsAvailability();
    updateSendAvailability();
    elements.roomInput.value = "";
    updateCurrentRoomLabel();
    clearMessages();
    renderEmptyIfNeeded();
    setOnlineUsers([]);
    savePrefs();
    if (state.started) {
      await refreshRooms();
      setConnectedStatus();
    }
    return;
  }

  profile.lastLoginAt = Date.now();
  state.activeProfileId = profile.id;
  state.name = profile.login;
  state.room = sanitizeStoredRoom(profile.room);
  state.roomType = getRoomTypeById(state.room);
  state.roomTitle = "";
  state.activeRoomMeta = null;
  state.chatTarget = state.roomType === ROOM_TYPE.DM ? getPeerFromRoom(state.room, profile.login) : "";
  state.theme = profile.theme;
  state.accent = profile.accent;

  applyTheme(state.theme, state.accent);
  renderProfileButton();
  renderProfilePopup();
  renderSettingsAvailability();
  updateSendAvailability();
  elements.roomInput.value = state.roomType === ROOM_TYPE.DM ? state.chatTarget : "";
  updateCurrentRoomLabel();
  savePrefs();

  if (state.started) {
    if (state.room) {
      await openRoom(state.room, getRoomMetaById(state.room), { skipPreviousLeave: true });
    } else {
      clearMessages();
      renderEmptyIfNeeded();
      setOnlineUsers([]);
      await refreshRooms();
      setConnectedStatus();
      updateSendAvailability();
    }
  }
}

async function onRegister(options = {}) {
  const login = sanitizeLogin(
    options.login !== undefined ? options.login : elements.authLoginInput.value
  );
  const password = String(
    options.password !== undefined ? options.password : elements.authPasswordInput.value || ""
  );
  const hintTarget = options.hintTarget || elements.profilePopupHint;
  const autoRegisterIp = options.autoRegisterIp !== false;

  if (login.length < 3) {
    if (hintTarget) hintTarget.textContent = "Логин должен быть минимум 3 символа.";
    return null;
  }
  if (password.length < 4) {
    if (hintTarget) hintTarget.textContent = "Пароль должен быть минимум 4 символа.";
    return null;
  }
  if (findProfileByLogin(login)) {
    if (hintTarget) hintTarget.textContent = "Профиль с таким логином уже есть.";
    return null;
  }

  const passwordHash = await hashPassword(password);
  const profile = buildProfile({
    id: makeProfileId(),
    login,
    passwordHash,
    avatar: "",
    room: state.room || "",
    theme: state.theme || DEFAULT_THEME,
    accent: state.accent || DEFAULT_ACCENT,
    createdAt: Date.now(),
    lastLoginAt: Date.now(),
  });
  if (!profile) {
    if (hintTarget) hintTarget.textContent = "Не удалось создать профиль.";
    return null;
  }

  state.profiles.push(profile);
  elements.authPasswordInput.value = "";
  elements.newPasswordInput.value = "";
  await activateProfile(profile);

  if (autoRegisterIp) {
    await registerCurrentIp(profile.login, hintTarget);
  }
  if (hintTarget) hintTarget.textContent = `Профиль "${profile.login}" создан.`;
  return profile;
}

async function onLogin(options = {}) {
  const login = sanitizeLogin(
    options.login !== undefined ? options.login : elements.authLoginInput.value
  );
  const password = String(
    options.password !== undefined ? options.password : elements.authPasswordInput.value || ""
  );
  const hintTarget = options.hintTarget || elements.profilePopupHint;
  const autoRegisterIp = Boolean(options.autoRegisterIp);

  if (!login) {
    if (hintTarget) hintTarget.textContent = "Введите логин.";
    return null;
  }
  const profile = findProfileByLogin(login);
  if (!profile) {
    if (hintTarget) hintTarget.textContent = "Профиль не найден.";
    return null;
  }

  const ok = await verifyPassword(profile, password);
  if (!ok) {
    if (hintTarget) hintTarget.textContent = "Неверный пароль.";
    return null;
  }

  elements.authPasswordInput.value = "";
  await activateProfile(profile);

  if (autoRegisterIp) {
    await registerCurrentIp(profile.login, hintTarget);
  }
  if (hintTarget) hintTarget.textContent = `Вход выполнен: ${profile.login}`;
  return profile;
}

async function onIpGateRegister() {
  const login = sanitizeLogin(elements.ipGateLoginInput.value);
  const password = String(elements.ipGatePasswordInput.value || "");
  if (login.length < 3) {
    elements.ipGateHint.textContent = "Логин должен быть минимум 3 символа.";
    return;
  }
  if (password.length < 4) {
    elements.ipGateHint.textContent = "Пароль должен быть минимум 4 символа.";
    return;
  }

  elements.ipGateRegisterBtn.disabled = true;
  try {
    const existing = findProfileByLogin(login);
    let profile = null;
    if (existing) {
      profile = await onLogin({
        login,
        password,
        hintTarget: elements.ipGateHint,
        autoRegisterIp: true,
      });
    } else {
      profile = await onRegister({
        login,
        password,
        hintTarget: elements.ipGateHint,
        autoRegisterIp: true,
      });
    }
    if (!profile) return;

    state.requiresIpRegistration = false;
    hideIpGate();
    if (!state.started) {
      await startMessenger();
    }
  } finally {
    elements.ipGateRegisterBtn.disabled = false;
  }
}

async function onLogout() {
  await activateProfile(null);
  elements.profilePopupHint.textContent = "Вы вышли из профиля.";
}

async function onDeleteProfile() {
  const active = getActiveProfile();
  if (!active) return;
  const confirmText = `Удалить профиль "${active.login}"?`;
  if (!window.confirm(confirmText)) return;

  state.profiles = state.profiles.filter((profile) => profile.id !== active.id);
  if (state.profiles.length > 0) {
    await activateProfile(state.profiles[0]);
  } else {
    await activateProfile(null);
  }
  elements.profilePopupHint.textContent = "Профиль удален.";
}

async function onSavePassword() {
  const active = getActiveProfile();
  if (!active) return;
  const password = String(elements.newPasswordInput.value || "");
  if (password.length < 4) {
    elements.profilePopupHint.textContent = "Новый пароль должен быть минимум 4 символа.";
    return;
  }
  active.passwordHash = await hashPassword(password);
  elements.newPasswordInput.value = "";
  savePrefs();
  elements.profilePopupHint.textContent = "Пароль сохранен.";
}

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Не удалось прочитать файл."));
    reader.readAsDataURL(file);
  });
}

async function onAvatarUpload() {
  const active = getActiveProfile();
  if (!active) return;
  const file = elements.avatarFileInput.files && elements.avatarFileInput.files[0];
  if (!file) return;

  if (!file.type.startsWith("image/")) {
    elements.profilePopupHint.textContent = "Нужен файл-изображение.";
    elements.avatarFileInput.value = "";
    return;
  }
  if (file.size > MAX_AVATAR_BYTES) {
    elements.profilePopupHint.textContent = "Файл слишком большой (до 2 МБ).";
    elements.avatarFileInput.value = "";
    return;
  }

  try {
    const dataURL = await readFileAsDataURL(file);
    if (!dataURL.startsWith("data:image/")) {
      throw new Error("bad format");
    }
    active.avatar = dataURL;
    savePrefs();
    renderProfileButton();
    renderProfilePopup();
    elements.profilePopupHint.textContent = "Аватар обновлен.";
  } catch (_error) {
    elements.profilePopupHint.textContent = "Ошибка загрузки аватара.";
  } finally {
    elements.avatarFileInput.value = "";
  }
}

function onRemoveAvatar() {
  const active = getActiveProfile();
  if (!active) return;
  active.avatar = "";
  savePrefs();
  renderProfileButton();
  renderProfilePopup();
  elements.profilePopupHint.textContent = "Аватар удален.";
}

function saveThemeAndAccent() {
  const active = getActiveProfile();
  if (!active) return;
  state.theme = normalizeTheme(elements.themeSelect.value);
  state.accent = normalizeAccent(elements.accentInput.value);
  active.theme = state.theme;
  active.accent = state.accent;
  applyTheme(state.theme, state.accent);
  savePrefs();
}

function resetAccent() {
  const active = getActiveProfile();
  if (!active) return;
  state.accent = DEFAULT_ACCENT;
  active.accent = DEFAULT_ACCENT;
  applyTheme(state.theme, state.accent);
  savePrefs();
}

async function sendMessage() {
  if (state.requiresIpRegistration) {
    showIpGate();
    setStatus("offline", "Требуется регистрация");
    return;
  }

  const active = getActiveProfile();
  if (!active) {
    setStatus("offline", "Нужен вход");
    elements.profilePopupHint.textContent = "Сначала войдите в профиль.";
    togglePopup(elements.profilePopup);
    return;
  }

  if (!state.room || state.roomType === ROOM_TYPE.NONE) {
    setStatus("offline", "Выберите чат");
    return;
  }

  const text = elements.messageInput.value.trim();
  if (!text) return;

  elements.sendBtn.disabled = true;
  try {
    const message = await sendTypedMessage({
      roomId: state.room,
      author: active.login,
      kind: "text",
      text,
    });
    if (message) {
      renderMessage(message);
      elements.messageInput.value = "";
      closeEmojiPanel();
      setComposerHint("");
    }
    setConnectedStatus();
  } catch (_error) {
    setStatus("offline", "Не отправлено");
  } finally {
    updateSendAvailability();
  }
}

async function startMessenger() {
  if (state.started) return;
  state.started = true;
  setRtcStatus("Медиа-сессия не активна.");
  state.presenceTimer = setInterval(() => {
    const active = getActiveProfile();
    if (!active) return;
    if (!state.room) return;
    void sendPresence(true, state.room, active.login);
  }, PRESENCE_INTERVAL_MS);
  scheduleSignalPoll(200);

  await refreshRooms();
  if (state.room) {
    await openRoom(state.room, getRoomMetaById(state.room), { skipPreviousLeave: true });
  } else {
    clearMessages();
    renderEmptyIfNeeded();
    setOnlineUsers([]);
    setConnectedStatus();
    updateSendAvailability();
  }
}

function setupEventHandlers() {
  elements.ipGate.addEventListener("click", (event) => {
    if (event.target === elements.ipGate) {
      event.stopPropagation();
    }
  });
  elements.ipGateRegisterBtn.addEventListener("click", () => void onIpGateRegister());
  elements.ipGatePasswordInput.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    void onIpGateRegister();
  });
  elements.ipGateLoginInput.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    void onIpGateRegister();
  });

  elements.settingsBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    togglePopup(elements.settingsPopup);
  });

  elements.profileBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    togglePopup(elements.profilePopup);
  });

  elements.settingsPopup.addEventListener("click", (event) => event.stopPropagation());
  elements.profilePopup.addEventListener("click", (event) => event.stopPropagation());
  if (elements.conversationPopup) {
    elements.conversationPopup.addEventListener("click", (event) => event.stopPropagation());
  }
  if (elements.botPopup) {
    elements.botPopup.addEventListener("click", (event) => event.stopPropagation());
  }
  if (elements.emojiBtn) {
    elements.emojiBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      toggleEmojiPanel();
    });
  }
  if (elements.emojiPanel) {
    elements.emojiPanel.addEventListener("click", (event) => {
      event.stopPropagation();
      const target = event.target;
      if (!(target instanceof Element)) return;
      const button = target.closest(".emoji-item");
      if (!button) return;
      insertEmojiToMessage(button.dataset.emoji || "");
    });
  }

  document.addEventListener("click", () => {
    if (!elements.ipGate.classList.contains("hidden")) return;
    closePopups();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closePopups();
    }
  });

  elements.themeSelect.addEventListener("change", saveThemeAndAccent);
  elements.accentInput.addEventListener("input", saveThemeAndAccent);
  elements.resetAccentBtn.addEventListener("click", resetAccent);

  elements.loginBtn.addEventListener("click", () => void onLogin());
  elements.registerBtn.addEventListener("click", () => void onRegister());
  elements.authPasswordInput.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    void onLogin();
  });
  elements.authLoginInput.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    void onLogin();
  });

  elements.savePasswordBtn.addEventListener("click", () => void onSavePassword());
  elements.avatarFileInput.addEventListener("change", () => void onAvatarUpload());
  elements.removeAvatarBtn.addEventListener("click", onRemoveAvatar);
  elements.logoutBtn.addEventListener("click", () => void onLogout());
  elements.deleteProfileBtn.addEventListener("click", () => void onDeleteProfile());
  elements.newGroupBtn.addEventListener("click", () => openConversationPopupForCreate(ROOM_TYPE.GROUP));
  elements.newChannelBtn.addEventListener("click", () =>
    openConversationPopupForCreate(ROOM_TYPE.CHANNEL)
  );
  elements.roomSettingsBtn.addEventListener("click", () => {
    const room = state.activeRoomMeta || getRoomMetaById(state.room);
    if (!room || (room.type !== ROOM_TYPE.GROUP && room.type !== ROOM_TYPE.CHANNEL)) {
      setStatus("offline", "Выберите группу или канал");
      return;
    }
    openConversationPopupForSettings(room);
  });
  elements.convSaveBtn.addEventListener("click", () => void onSaveConversationPopup());
  elements.newBotBtn.addEventListener("click", openBotPopup);
  elements.botCreateBtn.addEventListener("click", () => void onCreateBot());
  if (elements.callAudioBtn) {
    elements.callAudioBtn.addEventListener("click", () => {
      void startCallSession({ video: false, group: false }).catch(() => {
        setComposerHint("Не удалось начать аудиозвонок.");
      });
    });
  }
  if (elements.callVideoBtn) {
    elements.callVideoBtn.addEventListener("click", () => {
      void startCallSession({ video: true, group: false }).catch(() => {
        setComposerHint("Не удалось начать видеозвонок.");
      });
    });
  }
  if (elements.groupCallBtn) {
    elements.groupCallBtn.addEventListener("click", () => {
      void startCallSession({ video: true, group: true }).catch(() => {
        setComposerHint("Не удалось начать групповой звонок.");
      });
    });
  }
  if (elements.streamBtn) {
    elements.streamBtn.addEventListener("click", () => {
      void startChannelStream().catch(() => {
        setComposerHint("Не удалось запустить стрим.");
      });
    });
  }
  if (elements.endCallBtn) {
    elements.endCallBtn.addEventListener("click", () => {
      void stopRtcSession("Медиа-сессия завершена.", true);
    });
  }
  if (elements.attachBtn) {
    elements.attachBtn.addEventListener("click", () => {
      if (!elements.fileInput || elements.attachBtn.disabled) return;
      elements.fileInput.value = "";
      elements.fileInput.click();
    });
  }
  if (elements.fileInput) {
    elements.fileInput.addEventListener("change", () => {
      void onAttachFileSelected();
    });
  }
  if (elements.recordAudioBtn) {
    elements.recordAudioBtn.addEventListener("click", () => {
      void toggleAudioRecording().catch(() => {
        setComposerHint("Не удалось записать аудио.");
      });
    });
  }
  if (elements.recordVideoNoteBtn) {
    elements.recordVideoNoteBtn.addEventListener("click", () => {
      void toggleVideoNoteRecording().catch(() => {
        setComposerHint("Не удалось записать кружок.");
      });
    });
  }

  elements.joinRoomBtn.addEventListener("click", () =>
    void openDialogByUsername(elements.roomInput.value)
  );
  elements.roomInput.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    void openDialogByUsername(elements.roomInput.value);
  });

  elements.composerForm.addEventListener("submit", (event) => {
    event.preventDefault();
    void sendMessage();
  });

  elements.messageInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage();
    }
  });

  window.addEventListener("beforeunload", () => {
    const active = getActiveProfile();
    if (!active || !state.room) return;

    if (state.rtc.active && state.rtc.sessionId) {
      const signalType =
        state.rtc.mode === "stream-broadcast" || state.rtc.mode === "stream-watch"
          ? RTC_SIGNAL.STREAM_END
          : RTC_SIGNAL.CALL_END;
      const signalPayload = JSON.stringify({
        room: state.room,
        from: active.login,
        to: "",
        type: signalType,
        payload: { sessionId: state.rtc.sessionId, reason: "unload" },
      });
      navigator.sendBeacon(
        `${state.apiBase}/webrtc/signal`,
        new Blob([signalPayload], { type: "application/json" })
      );
    }

    const payload = JSON.stringify({
      room: state.room,
      author: active.login,
      online: false,
    });
    const data = new Blob([payload], { type: "application/json" });
    navigator.sendBeacon(`${state.apiBase}/presence`, data);
  });
}

async function init() {
  loadPrefs();
  state.apiBase = detectApiBase();
  elements.apiLabel.textContent = `API: ${state.apiBase}`;
  elements.joinRoomBtn.textContent = "Найти";
  elements.roomInput.placeholder = "username";

  applyTheme(state.theme, state.accent);
  renderProfileButton();
  renderProfilePopup();
  renderSettingsAvailability();
  updateSendAvailability();
  elements.roomInput.value = state.roomType === ROOM_TYPE.DM ? state.chatTarget : "";
  updateCurrentRoomLabel();
  renderEmojiPanel();
  renderRtcPanel();
  setComposerHint("");
  renderEmptyIfNeeded();
  setupEventHandlers();
  savePrefs();

  const ipStatus = await fetchIpStatus();
  if (ipStatus && ipStatus.requiresRegistration) {
    state.requiresIpRegistration = true;
    showIpGate();
    setStatus("offline", "Требуется регистрация");
    return;
  }

  hideIpGate();
  state.requiresIpRegistration = false;
  await startMessenger();
}

void init();
