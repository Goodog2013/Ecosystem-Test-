const defaultApiBase =
  window.location.port === "5173"
    ? `${window.location.protocol}//${window.location.hostname}:4000/api`
    : `${window.location.origin}/api/mdm`;

export const API_URL = import.meta.env.VITE_API_URL || defaultApiBase;
export const API_BANNED_EVENT = "mdm:banned";
const COOKIE_SESSION_TOKEN = "__cookie_session__";
const MEDIA_FIELDS = new Set(["image", "avatar", "imageSnapshot", "url"]);
const MEDIA_ARRAY_FIELDS = new Set(["images"]);

function emitBannedEvent(detail = {}) {
  if (typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(new CustomEvent(API_BANNED_EVENT, { detail }));
}

function normalizeMediaUrl(rawValue) {
  if (typeof rawValue !== "string") {
    return rawValue;
  }
  const value = rawValue.trim();
  if (!value) {
    return "";
  }
  if (/^(data:|blob:)/i.test(value)) {
    return value;
  }
  if (value.startsWith("/uploads/")) {
    return `${window.location.origin}${value}`;
  }
  if (value.startsWith("uploads/")) {
    return `${window.location.origin}/${value}`;
  }

  try {
    const parsed = new URL(value);
    if (parsed.pathname.startsWith("/uploads/")) {
      return `${window.location.origin}${parsed.pathname}${parsed.search || ""}${parsed.hash || ""}`;
    }
    return value;
  } catch {
    return value;
  }
}

function normalizePayload(payload) {
  if (Array.isArray(payload)) {
    return payload.map((item) => normalizePayload(item));
  }
  if (!payload || typeof payload !== "object") {
    return payload;
  }

  const normalized = {};
  for (const [key, value] of Object.entries(payload)) {
    if (Array.isArray(value) && MEDIA_ARRAY_FIELDS.has(key)) {
      normalized[key] = value.map((item) => normalizeMediaUrl(item)).filter(Boolean);
    } else if (typeof value === "string" && MEDIA_FIELDS.has(key)) {
      normalized[key] = normalizeMediaUrl(value);
    } else {
      normalized[key] = normalizePayload(value);
    }
  }
  return normalized;
}

async function request(path, options = {}) {
  const { token, body, method = "GET", timeoutMs = 7000 } = options;
  const isFormData = typeof FormData !== "undefined" && body instanceof FormData;
  const headers = {
    ...(options.headers || {}),
  };
  if (!isFormData) {
    headers["Content-Type"] = "application/json";
  }

  const authToken = String(token || "").trim();
  if (authToken && authToken !== COOKIE_SESSION_TOKEN) {
    headers.Authorization = `Bearer ${authToken}`;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1000, Number(timeoutMs) || 7000));
  let response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      credentials: "include",
      body: body ? (isFormData ? body : JSON.stringify(body)) : undefined,
      signal: controller.signal,
    });
  } catch (err) {
    if (err?.name === "AbortError") {
      throw new Error("Превышено время ожидания API. Проверьте, что сервер МДМ запущен.");
    }
    if (err instanceof TypeError && String(err.message || "").toLowerCase().includes("failed to fetch")) {
      throw new Error("Нет соединения с API МДМ. Перезапустите start_game.bat и дождитесь запуска backend.");
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = payload.message || "Ошибка запроса";
    const error = new Error(message);
    error.status = response.status;
    error.code = payload?.code || "";
    error.payload = payload;

    if (error.code === "BANNED" || (response.status === 403 && /забан/i.test(String(payload?.message || "")))) {
      emitBannedEvent({
        status: response.status,
        code: error.code || "BANNED",
        message,
        ...(payload || {}),
      });
    }

    throw error;
  }

  return normalizePayload(payload);
}

export const api = {
  get: (path, token) => request(path, { token }),
  post: (path, body, token) => request(path, { method: "POST", body, token }),
  put: (path, body, token) => request(path, { method: "PUT", body, token }),
  patch: (path, body, token) => request(path, { method: "PATCH", body, token }),
  delete: (path, token) => request(path, { method: "DELETE", token }),
  uploadImage: (file, token) => {
    const formData = new FormData();
    formData.append("image", file);
    return request("/uploads/image", { method: "POST", body: formData, token });
  },
};
