"use strict";

const { createCipheriv, createDecipheriv, createHash, randomBytes } = require("crypto");

const ENC_PREFIX = "enc:v1:";
const ENC_ALGO = "aes-256-gcm";
const ENC_IV_BYTES = 12;

function deriveEncryptionKey() {
  const raw = String(process.env.DATA_ENCRYPTION_KEY || process.env.JWT_SECRET || "").trim();
  if (!raw) {
    return null;
  }
  return createHash("sha256").update(raw).digest();
}

const ENCRYPTION_KEY = deriveEncryptionKey();

function isEncryptedText(value) {
  return String(value || "").startsWith(ENC_PREFIX);
}

function encryptText(value) {
  const plain = String(value ?? "");
  if (!plain) {
    return "";
  }
  if (isEncryptedText(plain)) {
    return plain;
  }
  if (!ENCRYPTION_KEY) {
    return plain;
  }

  const iv = randomBytes(ENC_IV_BYTES);
  const cipher = createCipheriv(ENC_ALGO, ENCRYPTION_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${ENC_PREFIX}${iv.toString("base64")}.${tag.toString("base64")}.${encrypted.toString("base64")}`;
}

function decryptText(value) {
  const raw = String(value ?? "");
  if (!raw) {
    return "";
  }
  if (!isEncryptedText(raw)) {
    return raw;
  }
  if (!ENCRYPTION_KEY) {
    return raw;
  }

  const payload = raw.slice(ENC_PREFIX.length);
  const parts = payload.split(".");
  if (parts.length !== 3) {
    return raw;
  }

  try {
    const iv = Buffer.from(parts[0], "base64");
    const tag = Buffer.from(parts[1], "base64");
    const encrypted = Buffer.from(parts[2], "base64");
    const decipher = createDecipheriv(ENC_ALGO, ENCRYPTION_KEY, iv);
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
    return plain;
  } catch (_err) {
    return raw;
  }
}

module.exports = {
  encryptText,
  decryptText,
  isEncryptedText,
};
