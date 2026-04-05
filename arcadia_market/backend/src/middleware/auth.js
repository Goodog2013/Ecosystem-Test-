const jwt = require("jsonwebtoken");

const AUTH_COOKIE_NAME = String(process.env.AUTH_COOKIE_NAME || "mdm_auth").trim() || "mdm_auth";

function parseCookies(rawCookieHeader) {
  const cookies = {};
  const source = String(rawCookieHeader || "");
  if (!source) {
    return cookies;
  }
  for (const part of source.split(";")) {
    const separator = part.indexOf("=");
    if (separator <= 0) {
      continue;
    }
    const key = part.slice(0, separator).trim();
    if (!key) {
      continue;
    }
    const rawValue = part.slice(separator + 1).trim();
    try {
      cookies[key] = decodeURIComponent(rawValue);
    } catch (_err) {
      cookies[key] = rawValue;
    }
  }
  return cookies;
}

function getAuthTokenFromRequest(req) {
  const header = String(req.headers?.authorization || "");
  if (/^Bearer\s+/i.test(header)) {
    const token = header.replace(/^Bearer\s+/i, "").trim();
    if (token) {
      return token;
    }
  }

  const cookies = parseCookies(req.headers?.cookie);
  return String(cookies[AUTH_COOKIE_NAME] || "").trim();
}

function issueToken(userId) {
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: "7d" });
}

function verifyToken(token) {
  const payload = jwt.verify(token, process.env.JWT_SECRET);
  return { userId: payload.userId };
}

function requireAuth(req, res, next) {
  const token = getAuthTokenFromRequest(req);

  if (!token) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    req.auth = verifyToken(token);
    return next();
  } catch (_err) {
    return res.status(401).json({ message: "Invalid token" });
  }
}

module.exports = {
  issueToken,
  verifyToken,
  requireAuth,
  getAuthTokenFromRequest,
};
