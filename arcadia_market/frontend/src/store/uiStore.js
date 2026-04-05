import { create } from "zustand";

const THEME_KEY = "mdm_theme";
const LANGUAGE_KEY = "mdm_language";
const SFX_ENABLED_KEY = "mdm_sfx_enabled";
const SFX_VOLUME_KEY = "mdm_sfx_volume";
const ACCENT_KEY = "mdm_accent";

function readStorage(key) {
  try {
    return localStorage.getItem(key) || "";
  } catch {
    return "";
  }
}

function writeStorage(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Ignore storage errors in restricted environments.
  }
}

function normalizeTheme(value) {
  return value === "light" ? "light" : "dark";
}

function normalizeLanguage(value) {
  return value === "en" ? "en" : "ru";
}

function normalizeSfxEnabled(value) {
  return value !== "0" && value !== "false";
}

function normalizeSfxVolume(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 0.45;
  }
  if (parsed < 0) {
    return 0;
  }
  if (parsed > 1) {
    return 1;
  }
  return Math.round(parsed * 100) / 100;
}

function normalizeAccent(value) {
  const raw = String(value || "")
    .trim()
    .toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(raw)) {
    return raw;
  }
  return "#06b6d4";
}

export const useUiStore = create((set) => ({
  theme: normalizeTheme(readStorage(THEME_KEY) || "dark"),
  language: normalizeLanguage(readStorage(LANGUAGE_KEY) || "ru"),
  sfxEnabled: normalizeSfxEnabled(readStorage(SFX_ENABLED_KEY) || "1"),
  sfxVolume: normalizeSfxVolume(readStorage(SFX_VOLUME_KEY) || "0.45"),
  accent: normalizeAccent(readStorage(ACCENT_KEY) || "#06b6d4"),

  setTheme: (value) => {
    const theme = normalizeTheme(value);
    writeStorage(THEME_KEY, theme);
    set({ theme });
  },

  setLanguage: (value) => {
    const language = normalizeLanguage(value);
    writeStorage(LANGUAGE_KEY, language);
    set({ language });
  },

  setSfxEnabled: (value) => {
    const sfxEnabled = Boolean(value);
    writeStorage(SFX_ENABLED_KEY, sfxEnabled ? "1" : "0");
    set({ sfxEnabled });
  },

  setSfxVolume: (value) => {
    const sfxVolume = normalizeSfxVolume(value);
    writeStorage(SFX_VOLUME_KEY, String(sfxVolume));
    set({ sfxVolume });
  },

  setAccent: (value) => {
    const accent = normalizeAccent(value);
    writeStorage(ACCENT_KEY, accent);
    set({ accent });
  },
}));
