class AppError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = "AppError";
    this.status = status;
  }
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function isUsername(value) {
  return /^[A-Za-z0-9_]{3,20}$/.test(String(value || "").trim());
}

function stripHtmlLikeMarkup(value) {
  let text = String(value ?? "");
  // Remove ASCII control chars except TAB/LF/CR to avoid hidden payloads.
  text = text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
  // Drop any HTML-like tags (<script>, <img ...>, etc.).
  text = text.replace(/<[^>]*>/g, "");
  return text;
}

function cleanText(value, max = 240) {
  const safe = stripHtmlLikeMarkup(value).trim();
  return safe.slice(0, Math.max(0, Number(max) || 0));
}

function toPositiveInt(value, fallback = null) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) {
    return fallback;
  }
  return n;
}

function toNonNegativeInt(value, fallback = null) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) {
    return fallback;
  }
  return n;
}

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

module.exports = {
  AppError,
  isEmail,
  isUsername,
  cleanText,
  toPositiveInt,
  toNonNegativeInt,
  asyncHandler,
};
