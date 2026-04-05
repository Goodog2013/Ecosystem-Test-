import { create } from "zustand";
import { api } from "../lib/api";

const TOKEN_KEY = "mdm_token";
export const COOKIE_SESSION_TOKEN = "__cookie_session__";

function isCookieSessionToken(value) {
  return String(value || "").trim() === COOKIE_SESSION_TOKEN;
}

function toApiToken(value) {
  const token = String(value || "").trim();
  if (!token || isCookieSessionToken(token)) {
    return "";
  }
  return token;
}

function isAuthExpiredError(error) {
  const status = Number(error?.status || 0);
  return status === 401 || status === 403;
}

export const useAuthStore = create((set, get) => ({
  token: localStorage.getItem(TOKEN_KEY) || "",
  user: null,
  bootstrapped: false,
  loading: false,

  setToken: (token) => {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }
    set({ token: token || "" });
  },

  hydrate: async () => {
    const token = get().token;
    set({ loading: true });
    try {
      const data = await api.get("/auth/me", toApiToken(token));
      if (!token) {
        get().setToken(COOKIE_SESSION_TOKEN);
      }
      set({ user: data.user || null, bootstrapped: true, loading: false });
    } catch (error) {
      if (isAuthExpiredError(error)) {
        get().setToken("");
        set({ user: null, bootstrapped: true, loading: false });
        return;
      }
      set({ bootstrapped: true, loading: false });
    }
  },

  login: async (login, password) => {
    set({ loading: true });
    const data = await api.post("/auth/login", { login, password });
    get().setToken(data.token || COOKIE_SESSION_TOKEN);
    set({ user: data.user, loading: false, bootstrapped: true });
    return data.user;
  },

  signup: async (username, email, password) => {
    set({ loading: true });
    const data = await api.post("/auth/signup", { username, email, password });
    get().setToken(data.token || COOKIE_SESSION_TOKEN);
    set({ user: data.user, loading: false, bootstrapped: true });
    return data.user;
  },

  logout: () => {
    api.post("/auth/logout", {}).catch(() => {});
    get().setToken("");
    set({ user: null });
  },

  refreshMe: async () => {
    const token = get().token;
    try {
      const data = await api.get("/auth/me", toApiToken(token));
      if (!token) {
        get().setToken(COOKIE_SESSION_TOKEN);
      }
      set({ user: data.user || null });
      return data.user;
    } catch (error) {
      if (isAuthExpiredError(error)) {
        get().setToken("");
        set({ user: null });
      }
      return null;
    }
  },

  updateProfile: async (payload) => {
    const token = get().token;
    if (!token) {
      return null;
    }
    const data = await api.put("/users/me", payload, toApiToken(token));
    set({ user: data.user || null });
    return data.user;
  },
}));
