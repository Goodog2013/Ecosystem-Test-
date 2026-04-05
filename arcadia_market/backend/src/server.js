require("dotenv").config();

const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const { randomUUID } = require("crypto");
const fs = require("fs");
const path = require("path");
const { isIP } = require("net");
const multer = require("multer");
const QRCode = require("qrcode");

const { issueToken, verifyToken, requireAuth, getAuthTokenFromRequest } = require("./middleware/auth");
const { db, initDb } = require("./db");
const {
  AppError,
  isEmail,
  isUsername,
  cleanText,
  toPositiveInt,
  toNonNegativeInt,
  asyncHandler,
} = require("./utils/common");
const { encryptText, decryptText } = require("./utils/crypto");

const app = express();

const PORT = Number(process.env.PORT || 4000);
const HOST = process.env.HOST || "0.0.0.0";
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || "http://localhost:5173";
const MB_BANK_API_URL = process.env.MB_BANK_API_URL || "http://192.168.1.65:8000/api/mb-bank";
const MB_BANK_TIMEOUT_MS = Math.max(1500, Number(process.env.MB_BANK_TIMEOUT_MS || 7000));
const MB_BANK_BRIDGE_SECRET = process.env.MB_BANK_BRIDGE_SECRET || "mdm_bridge_secret_2026";
const TELEGRAM_BOT_TOKEN = String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
const TELEGRAM_BOT_USERNAME = String(process.env.TELEGRAM_BOT_USERNAME || "").trim().replace(/^@+/, "");
const TELEGRAM_BRIDGE_SECRET = String(process.env.TELEGRAM_BRIDGE_SECRET || "mdm_telegram_bridge_secret_2026").trim();
const TELEGRAM_LINK_TOKEN_TTL_MS = Math.max(60 * 1000, Number(process.env.TELEGRAM_LINK_TOKEN_TTL_MS || 10 * 60 * 1000));
const TELEGRAM_API_BASE = TELEGRAM_BOT_TOKEN ? `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}` : "";
const AUTH_COOKIE_NAME = String(process.env.AUTH_COOKIE_NAME || "mdm_auth").trim() || "mdm_auth";
const AUTH_COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_IMAGE_UPLOAD_BYTES = 5 * 1024 * 1024;
const UPLOADS_DIR = path.resolve(__dirname, "../uploads");
const USERDATA_EXPORT_PATH = path.resolve(__dirname, "../../../userdata.json");
const USERDATA_EXPORT_INTERVAL_MS = Math.max(5000, Number(process.env.USERDATA_EXPORT_INTERVAL_MS || 15000));
const CHECKOUT_QR_SESSION_TTL_MS = Math.max(60 * 1000, Number(process.env.CHECKOUT_QR_SESSION_TTL_MS || 10 * 60 * 1000));
const CHECKOUT_QR_PREFIX = "MDMQR:";

const ALLOWED_CATEGORIES = ["Skins", "Collectibles", "Boosts", "Craft", "Bundles", "Tools"];
const ALLOWED_CONDITIONS = ["New", "Used", "Refurbished"];
const ALLOWED_RARITIES = ["Common", "Rare", "Epic", "Legendary"];

const ORDER_STATUS = {
  PAID: "PAID",
  PREPARING: "PREPARING",
  DELIVERED: "DELIVERED",
};
const ORDER_STATUS_FLOW = [ORDER_STATUS.PAID, ORDER_STATUS.PREPARING, ORDER_STATUS.DELIVERED];
const ROLES = {
  ADMIN: "admin",
  SELLER: "seller",
  BUYER: "buyer",
};
const BAN_TARGET = {
  USERNAME: "username",
  IP: "ip",
};
const ADMIN_USERNAME = "Goodog2013";

initDb();
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

app.use(
  cors({
    origin: FRONTEND_ORIGIN === "*" ? true : FRONTEND_ORIGIN,
    credentials: true,
  })
);
app.use(express.json({ limit: "1mb" }));
app.use("/uploads", express.static(UPLOADS_DIR));
app.use(
  "/api",
  asyncHandler(async (req, _res, next) => {
    if (req.path === "/health") {
      next();
      return;
    }
    ensureRequestNotBannedOrThrow(req);
    next();
  })
);

const imageExtByMime = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/avif": ".avif",
};

const imageUploader = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
    filename: (_req, file, cb) => {
      const ext = imageExtByMime[file.mimetype] || ".bin";
      cb(null, `${Date.now()}-${randomUUID()}${ext}`);
    },
  }),
  limits: { fileSize: MAX_IMAGE_UPLOAD_BYTES },
  fileFilter: (_req, file, cb) => {
    if (!imageExtByMime[file.mimetype]) {
      cb(new AppError("Разрешены только изображения JPG, PNG, WEBP, GIF, AVIF.", 400));
      return;
    }
    cb(null, true);
  },
});

function imageUploadMiddleware(req, res, next) {
  imageUploader.single("image")(req, res, (err) => {
    if (!err) {
      next();
      return;
    }
    if (err.code === "LIMIT_FILE_SIZE") {
      next(new AppError("Размер файла не должен превышать 5 МБ.", 400));
      return;
    }
    next(err);
  });
}

const liveClients = new Map();
const liveUserConnections = new Map();
const telegramDedup = new Map();
let userdataExportTimer = null;

function pushLiveEvent(res, event, data = {}) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function broadcastLiveEvent(event, data = {}, predicate = () => true) {
  for (const client of liveClients.values()) {
    if (!predicate(client)) {
      continue;
    }
    pushLiveEvent(client.res, event, data);
  }
}

function notifyUsers(event, userIds = [], data = {}) {
  const allowed = new Set((userIds || []).filter(Boolean));
  if (!allowed.size) {
    return;
  }
  broadcastLiveEvent(event, { at: Date.now(), ...(data || {}) }, (client) => client.userId && allowed.has(client.userId));
}

function notifyAll(event, data = {}) {
  broadcastLiveEvent(event, { at: Date.now(), ...(data || {}) });
}

function nowIso() {
  return new Date().toISOString();
}

function parseJsonIfPossible(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw);
  } catch (_err) {
    return null;
  }
}

function groupRowsBy(rows = [], keyPicker = () => "") {
  const map = new Map();
  for (const row of rows) {
    const key = String(keyPicker(row) || "");
    if (!map.has(key)) {
      map.set(key, []);
    }
    map.get(key).push(row);
  }
  return map;
}

function readUserDataTables() {
  const users = db.prepare("SELECT * FROM users ORDER BY created_at ASC").all();
  const products = db.prepare("SELECT * FROM products ORDER BY created_at ASC").all();
  const cartItems = db.prepare("SELECT * FROM cart_items ORDER BY created_at ASC").all();
  const wishlistItems = db.prepare("SELECT * FROM wishlist_items ORDER BY created_at ASC").all();
  const orders = db.prepare("SELECT * FROM orders ORDER BY created_at ASC").all();
  const orderItems = db.prepare("SELECT * FROM order_items ORDER BY created_at ASC").all();
  const hiddenOrders = db.prepare("SELECT * FROM hidden_orders ORDER BY created_at ASC").all();
  const hiddenTransactions = db.prepare("SELECT * FROM hidden_transactions ORDER BY created_at ASC").all();
  const chats = db.prepare("SELECT * FROM chats ORDER BY created_at ASC").all();
  const promoCodes = db.prepare("SELECT * FROM promo_codes ORDER BY created_at ASC").all();
  const promoCodeProducts = db.prepare("SELECT * FROM promo_code_products ORDER BY created_at ASC").all();
  const pickupPoints = db.prepare("SELECT * FROM pickup_points ORDER BY created_at ASC").all();
  const checkoutQrSessions = db.prepare("SELECT * FROM checkout_qr_sessions ORDER BY created_at ASC").all();
  const bans = db.prepare("SELECT * FROM bans ORDER BY created_at ASC").all();

  const sellerReviews = db
    .prepare("SELECT * FROM seller_reviews ORDER BY created_at ASC")
    .all()
    .map((row) => {
      const commentRaw = String(row.comment || "");
      const comment = decryptText(commentRaw);
      return {
        ...row,
        comment_raw: commentRaw,
        comment,
      };
    });

  const chatMessages = db
    .prepare("SELECT * FROM chat_messages ORDER BY created_at ASC")
    .all()
    .map((row) => {
      const textRaw = String(row.text || "");
      const text = decryptText(textRaw);
      return {
        ...row,
        text_raw: textRaw,
        text,
      };
    });

  const transactions = db
    .prepare("SELECT * FROM transactions ORDER BY created_at ASC")
    .all()
    .map((row) => {
      const metadataRaw = String(row.metadata || "");
      const metadata = decryptText(metadataRaw);
      return {
        ...row,
        metadata_raw: metadataRaw,
        metadata,
        metadata_json: parseJsonIfPossible(metadata),
      };
    });

  return {
    users,
    products,
    cart_items: cartItems,
    wishlist_items: wishlistItems,
    orders,
    order_items: orderItems,
    transactions,
    hidden_orders: hiddenOrders,
    hidden_transactions: hiddenTransactions,
    seller_reviews: sellerReviews,
    chats,
    chat_messages: chatMessages,
    promo_codes: promoCodes,
    promo_code_products: promoCodeProducts,
    pickup_points: pickupPoints,
    checkout_qr_sessions: checkoutQrSessions,
    bans,
  };
}

function buildUserDataSnapshot() {
  const tables = readUserDataTables();
  const users = tables.users;
  const ordersById = new Map(tables.orders.map((row) => [row.id, row]));

  const productsBySeller = groupRowsBy(tables.products, (row) => row.seller_id);
  const cartByUser = groupRowsBy(tables.cart_items, (row) => row.user_id);
  const wishlistByUser = groupRowsBy(tables.wishlist_items, (row) => row.user_id);
  const ordersByBuyer = groupRowsBy(tables.orders, (row) => row.buyer_id);
  const orderItemsByOrder = groupRowsBy(tables.order_items, (row) => row.order_id);
  const orderItemsBySeller = groupRowsBy(tables.order_items, (row) => row.seller_id);
  const txFromByUser = groupRowsBy(tables.transactions, (row) => row.from_user_id);
  const txToByUser = groupRowsBy(tables.transactions, (row) => row.to_user_id);
  const hiddenOrdersByUser = groupRowsBy(tables.hidden_orders, (row) => row.user_id);
  const hiddenTxByUser = groupRowsBy(tables.hidden_transactions, (row) => row.user_id);
  const reviewsByBuyer = groupRowsBy(tables.seller_reviews, (row) => row.buyer_id);
  const reviewsBySeller = groupRowsBy(tables.seller_reviews, (row) => row.seller_id);
  const chatsByBuyer = groupRowsBy(tables.chats, (row) => row.buyer_id);
  const chatsBySeller = groupRowsBy(tables.chats, (row) => row.seller_id);
  const chatMessagesByChat = groupRowsBy(tables.chat_messages, (row) => row.chat_id);
  const chatMessagesBySender = groupRowsBy(tables.chat_messages, (row) => row.sender_id);
  const pickupPointsBySeller = groupRowsBy(tables.pickup_points, (row) => row.seller_id);
  const promoCodesByCreator = groupRowsBy(tables.promo_codes, (row) => row.created_by);
  const bansCreatedBy = groupRowsBy(tables.bans, (row) => row.created_by);
  const bansLiftedBy = groupRowsBy(tables.bans, (row) => row.lifted_by);

  const usersExpanded = users.map((user) => {
    const userId = String(user.id || "");
    const usernameKey = String(user.username || "")
      .trim()
      .toLowerCase();
    const purchaseOrders = (ordersByBuyer.get(userId) || []).map((order) => ({
      ...order,
      items: orderItemsByOrder.get(order.id) || [],
    }));
    const saleItems = (orderItemsBySeller.get(userId) || []).map((item) => ({
      ...item,
      order: ordersById.get(item.order_id) || null,
    }));

    const chatsOwned = [];
    const seenChats = new Set();
    for (const row of [...(chatsByBuyer.get(userId) || []), ...(chatsBySeller.get(userId) || [])]) {
      if (!row?.id || seenChats.has(row.id)) {
        continue;
      }
      seenChats.add(row.id);
      chatsOwned.push(row);
    }

    const chatMessagesInOwnedChats = [];
    for (const chat of chatsOwned) {
      const rows = chatMessagesByChat.get(chat.id) || [];
      for (const message of rows) {
        chatMessagesInOwnedChats.push(message);
      }
    }

    const bansByUsername = tables.bans.filter(
      (ban) => ban.target_type === BAN_TARGET.USERNAME && String(ban.target_key || "").toLowerCase() === usernameKey
    );

    return {
      id: userId,
      username: user.username || "",
      role: user.role || "",
      profile: user,
      products: productsBySeller.get(userId) || [],
      cartItems: cartByUser.get(userId) || [],
      wishlistItems: wishlistByUser.get(userId) || [],
      purchases: purchaseOrders,
      salesOrderItems: saleItems,
      transactionsOutgoing: txFromByUser.get(userId) || [],
      transactionsIncoming: txToByUser.get(userId) || [],
      hiddenOrders: hiddenOrdersByUser.get(userId) || [],
      hiddenTransactions: hiddenTxByUser.get(userId) || [],
      reviewsLeft: reviewsByBuyer.get(userId) || [],
      reviewsReceived: reviewsBySeller.get(userId) || [],
      chats: chatsOwned,
      chatMessagesInOwnedChats,
      chatMessagesSent: chatMessagesBySender.get(userId) || [],
      pickupPoints: pickupPointsBySeller.get(userId) || [],
      promoCodesCreated: promoCodesByCreator.get(userId) || [],
      bansByUsername,
      bansCreated: bansCreatedBy.get(userId) || [],
      bansLifted: bansLiftedBy.get(userId) || [],
    };
  });

  return {
    generatedAt: nowIso(),
    generatedBy: "mdm-backend",
    fileVersion: 1,
    summary: {
      users: tables.users.length,
      products: tables.products.length,
      orders: tables.orders.length,
      orderItems: tables.order_items.length,
      transactions: tables.transactions.length,
      chats: tables.chats.length,
      chatMessages: tables.chat_messages.length,
      reviews: tables.seller_reviews.length,
    },
    users: usersExpanded,
    tables,
  };
}

function exportUserDataToFile() {
  try {
    const snapshot = buildUserDataSnapshot();
    fs.mkdirSync(path.dirname(USERDATA_EXPORT_PATH), { recursive: true });
    fs.writeFileSync(USERDATA_EXPORT_PATH, JSON.stringify(snapshot, null, 2), "utf8");
  } catch (err) {
    console.error("[userdata] export failed:", err?.message || err);
  }
}

function startUserDataExportLoop() {
  if (userdataExportTimer) {
    return;
  }
  exportUserDataToFile();
  userdataExportTimer = setInterval(exportUserDataToFile, USERDATA_EXPORT_INTERVAL_MS);
  userdataExportTimer.unref?.();
}

function normalizeUserId(value) {
  return cleanText(value, 80);
}

function setUserLastSeen(userId, timestamp = nowIso()) {
  const normalizedUserId = normalizeUserId(userId);
  if (!normalizedUserId) {
    return;
  }
  db.prepare("UPDATE users SET last_seen_at = ? WHERE id = ?").run(timestamp, normalizedUserId);
}

function isUserOnline(userId) {
  const normalizedUserId = normalizeUserId(userId);
  if (!normalizedUserId) {
    return false;
  }
  return Number(liveUserConnections.get(normalizedUserId) || 0) > 0;
}

function markUserConnected(userId) {
  const normalizedUserId = normalizeUserId(userId);
  if (!normalizedUserId) {
    return;
  }
  const current = Number(liveUserConnections.get(normalizedUserId) || 0);
  const next = current + 1;
  liveUserConnections.set(normalizedUserId, next);
  const ts = nowIso();
  if (current <= 0) {
    db.prepare("UPDATE users SET last_seen_at = COALESCE(last_seen_at, ?) WHERE id = ?").run(ts, normalizedUserId);
    notifyAll("presence_changed", { userId: normalizedUserId, online: true, lastSeenAt: ts });
  }
}

function markUserDisconnected(userId) {
  const normalizedUserId = normalizeUserId(userId);
  if (!normalizedUserId) {
    return;
  }
  const current = Number(liveUserConnections.get(normalizedUserId) || 0);
  if (current <= 1) {
    liveUserConnections.delete(normalizedUserId);
    const ts = nowIso();
    setUserLastSeen(normalizedUserId, ts);
    notifyAll("presence_changed", { userId: normalizedUserId, online: false, lastSeenAt: ts });
    return;
  }
  liveUserConnections.set(normalizedUserId, current - 1);
}

function boolToInt(value) {
  return value ? 1 : 0;
}

function toBoolean(value) {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return value === 1;
  }
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function normalizeReviewStars(value) {
  const stars = Number(value);
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) {
    return null;
  }
  return stars;
}

function cleanReviewImage(value) {
  const image = cleanText(value, 500);
  if (!image) {
    return "";
  }
  if (image.startsWith("/uploads/")) {
    return image;
  }
  if (/^https?:\/\//i.test(image)) {
    return image;
  }
  if (/^data:image\//i.test(image)) {
    return image;
  }
  throw new AppError("Некорректный формат изображения для отзыва.", 400);
}

function cleanImageUrl(value) {
  const image = cleanText(value, 500);
  if (!image) {
    return "";
  }
  if (image.startsWith("/uploads/")) {
    return image;
  }
  if (/^https?:\/\//i.test(image)) {
    return image;
  }
  if (/^data:image\//i.test(image)) {
    return image;
  }
  throw new AppError("Некорректный формат изображения.", 400);
}

function cleanPickupPointName(value) {
  return cleanText(value, 90);
}

function cleanPickupPointAddress(value) {
  return cleanText(value, 220);
}

function cleanPickupPointCity(value) {
  return cleanText(value, 90);
}

function cleanPickupPointDetails(value) {
  return cleanText(value, 320);
}

function normalizePickupPointPayload(payload, { partial = false } = {}) {
  const source = payload && typeof payload === "object" ? payload : {};
  const out = {};

  const hasName = Object.prototype.hasOwnProperty.call(source, "name");
  const hasAddress = Object.prototype.hasOwnProperty.call(source, "address");
  const hasCity = Object.prototype.hasOwnProperty.call(source, "city");
  const hasDetails = Object.prototype.hasOwnProperty.call(source, "details");
  const hasIsActive = Object.prototype.hasOwnProperty.call(source, "isActive");

  if (!partial || hasName) {
    const name = cleanPickupPointName(source.name);
    if (!name) {
      throw new AppError("Укажите название пункта выдачи.", 400);
    }
    out.name = name;
  }

  if (!partial || hasAddress) {
    const address = cleanPickupPointAddress(source.address);
    if (!address) {
      throw new AppError("Укажите адрес пункта выдачи.", 400);
    }
    out.address = address;
  }

  if (!partial || hasCity) {
    out.city = cleanPickupPointCity(source.city);
  }

  if (!partial || hasDetails) {
    out.details = cleanPickupPointDetails(source.details);
  }

  if (!partial || hasIsActive) {
    out.isActive = boolToInt(toBoolean(source.isActive));
  }

  if (partial && !Object.keys(out).length) {
    throw new AppError("Нет данных для обновления пункта выдачи.", 400);
  }

  return out;
}

function rowToPickupPoint(row) {
  if (!row) {
    return null;
  }
  return {
    id: row.id,
    sellerId: row.seller_id || "",
    sellerUsername: row.seller_username || "",
    name: row.name || "",
    address: row.address || "",
    city: row.city || "",
    details: row.details || "",
    isActive: Boolean(row.is_active),
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

function fetchSellerPickupPoints(sellerId, { activeOnly = false } = {}) {
  const normalizedSellerId = cleanText(sellerId, 80);
  if (!normalizedSellerId) {
    return [];
  }
  const where = ["pp.seller_id = ?"];
  const params = [normalizedSellerId];
  if (activeOnly) {
    where.push("pp.is_active = 1");
  }
  const rows = db
    .prepare(
      `
      SELECT
        pp.*,
        u.username AS seller_username
      FROM pickup_points pp
      JOIN users u ON u.id = pp.seller_id
      WHERE ${where.join(" AND ")}
      ORDER BY pp.is_active DESC, pp.created_at DESC
    `
    )
    .all(...params);
  return rows.map(rowToPickupPoint);
}

function fetchPickupPointsBySellerIds(sellerIds, { activeOnly = true } = {}) {
  const unique = Array.from(
    new Set(
      (Array.isArray(sellerIds) ? sellerIds : [])
        .map((value) => cleanText(value, 80))
        .filter(Boolean)
    )
  );
  const map = new Map(unique.map((sellerId) => [sellerId, []]));
  if (!unique.length) {
    return map;
  }

  const placeholders = unique.map(() => "?").join(", ");
  const where = [`pp.seller_id IN (${placeholders})`];
  if (activeOnly) {
    where.push("pp.is_active = 1");
  }
  const rows = db
    .prepare(
      `
      SELECT
        pp.*,
        u.username AS seller_username
      FROM pickup_points pp
      JOIN users u ON u.id = pp.seller_id
      WHERE ${where.join(" AND ")}
      ORDER BY pp.seller_id ASC, pp.is_active DESC, pp.created_at DESC
    `
    )
    .all(...unique);

  for (const row of rows) {
    const sellerId = cleanText(row.seller_id, 80);
    if (!sellerId || !map.has(sellerId)) {
      continue;
    }
    map.get(sellerId).push(rowToPickupPoint(row));
  }

  return map;
}

function normalizePromoCode(value, { allowEmpty = true } = {}) {
  const code = String(value || "")
    .trim()
    .toUpperCase();
  if (!code) {
    if (allowEmpty) {
      return "";
    }
    throw new AppError("Введите промокод.", 400);
  }
  if (!/^[A-Z0-9_-]{3,32}$/.test(code)) {
    throw new AppError("Некорректный формат промокода.", 400);
  }
  return code;
}

function normalizePromoPercent(value) {
  const percent = toPositiveInt(value);
  if (!percent || percent < 1 || percent > 100) {
    return null;
  }
  return percent;
}

function normalizePromoProductIds(raw) {
  const source = Array.isArray(raw) ? raw : raw !== undefined && raw !== null ? [raw] : [];
  const unique = [];
  for (const item of source) {
    const id = cleanText(item, 60);
    if (!id || unique.includes(id)) {
      continue;
    }
    unique.push(id);
  }
  return unique;
}

function resolvePromoProductIds(payloadProductIds, legacyProductId = "") {
  const ids = normalizePromoProductIds(payloadProductIds);
  if (ids.length) {
    return ids;
  }
  const fallback = cleanText(legacyProductId, 60);
  return fallback ? [fallback] : [];
}

function ensurePromoProductsExistOrThrow(productIds) {
  const ids = normalizePromoProductIds(productIds);
  if (!ids.length) {
    throw new AppError("Выберите хотя бы один товар для промокода.", 400);
  }

  const placeholders = ids.map(() => "?").join(", ");
  const rows = db.prepare(`SELECT id, deleted_at FROM products WHERE id IN (${placeholders})`).all(...ids);
  const byId = new Map(rows.map((row) => [row.id, row]));

  for (const id of ids) {
    const row = byId.get(id);
    if (!row || row.deleted_at) {
      throw new AppError("Один или несколько товаров для промокода не найдены.", 404);
    }
  }
  return ids;
}

function rowToPromoCode(row, products = null) {
  if (!row) {
    return null;
  }
  const promoProducts = Array.isArray(products) ? products : [];
  const first = promoProducts[0] || null;
  return {
    id: row.id,
    code: row.code,
    percent: Number(row.percent || 0),
    isActive: Boolean(row.is_active),
    productId: first?.id || row.product_id,
    productTitle: first?.title || row.product_title || "",
    productDeleted: first ? Boolean(first.deleted) : Boolean(row.product_deleted_at),
    sellerId: first?.sellerId || row.seller_id || "",
    sellerUsername: first?.sellerUsername || row.seller_username || "",
    productIds: promoProducts.map((item) => item.id),
    products: promoProducts,
    applicableProductIds: promoProducts.filter((item) => !item.deleted).map((item) => item.id),
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function fetchPromoProducts(promoId, fallbackProductId = "") {
  const rows = db
    .prepare(
      `
      SELECT
        pcp.product_id,
        p.title AS product_title,
        p.deleted_at AS product_deleted_at,
        p.seller_id AS seller_id,
        u.username AS seller_username
      FROM promo_code_products pcp
      LEFT JOIN products p ON p.id = pcp.product_id
      LEFT JOIN users u ON u.id = p.seller_id
      WHERE pcp.promo_id = ?
      ORDER BY pcp.created_at ASC
    `
    )
    .all(promoId);

  const out = rows
    .filter((row) => row.product_id)
    .map((row) => ({
      id: row.product_id,
      title: row.product_title || "",
      deleted: Boolean(row.product_deleted_at),
      sellerId: row.seller_id || "",
      sellerUsername: row.seller_username || "",
    }));

  if (out.length || !fallbackProductId) {
    return out;
  }

  const fallback = db
    .prepare(
      `
      SELECT p.id AS product_id, p.title AS product_title, p.deleted_at AS product_deleted_at, p.seller_id, u.username AS seller_username
      FROM products p
      LEFT JOIN users u ON u.id = p.seller_id
      WHERE p.id = ?
      LIMIT 1
    `
    )
    .get(fallbackProductId);
  if (!fallback?.product_id) {
    return [];
  }
  return [
    {
      id: fallback.product_id,
      title: fallback.product_title || "",
      deleted: Boolean(fallback.product_deleted_at),
      sellerId: fallback.seller_id || "",
      sellerUsername: fallback.seller_username || "",
    },
  ];
}

function updatePromoProducts(promoId, productIds) {
  const ids = normalizePromoProductIds(productIds);
  const ts = nowIso();
  const deleteStmt = db.prepare("DELETE FROM promo_code_products WHERE promo_id = ?");
  const insertStmt = db.prepare(
    "INSERT INTO promo_code_products (id, promo_id, product_id, created_at) VALUES (?, ?, ?, ?)"
  );
  const tx = db.transaction((list) => {
    deleteStmt.run(promoId);
    for (const productId of list) {
      insertStmt.run(randomUUID(), promoId, productId, ts);
    }
  });
  tx(ids);
}

function buildPromoCodePayload(row) {
  if (!row) {
    return null;
  }
  const products = fetchPromoProducts(row.id, row.product_id);
  return rowToPromoCode(row, products);
}

function getPromoCodeByCode(code) {
  return db
    .prepare(
      `
      SELECT
        pc.*,
        p.title AS product_title,
        p.deleted_at AS product_deleted_at,
        p.seller_id AS seller_id,
        u.username AS seller_username
      FROM promo_codes pc
      LEFT JOIN products p ON p.id = pc.product_id
      LEFT JOIN users u ON u.id = p.seller_id
      WHERE pc.code = ?
      LIMIT 1
    `
    )
    .get(code);
}

function getPromoCodeById(promoId) {
  return db
    .prepare(
      `
      SELECT
        pc.*,
        p.title AS product_title,
        p.deleted_at AS product_deleted_at,
        p.seller_id AS seller_id,
        u.username AS seller_username
      FROM promo_codes pc
      LEFT JOIN products p ON p.id = pc.product_id
      LEFT JOIN users u ON u.id = p.seller_id
      WHERE pc.id = ?
      LIMIT 1
    `
    )
    .get(promoId);
}

function ensureActivePromoOrThrow(code) {
  const row = getPromoCodeByCode(code);
  const promo = buildPromoCodePayload(row);
  if (!promo || !promo.isActive || !promo.applicableProductIds.length) {
    throw new AppError("Промокод недействителен.", 404);
  }
  return promo;
}

function calculateLineDiscount(lineTotal, percent) {
  const safeTotal = Math.max(0, Number(lineTotal) || 0);
  const safePercent = Math.max(0, Number(percent) || 0);
  if (!safeTotal || !safePercent) {
    return 0;
  }
  return Math.min(safeTotal, Math.floor((safeTotal * safePercent) / 100));
}

function normalizeProductImages(payloadImages, fallbackImage = "") {
  const fromPayload = Array.isArray(payloadImages) ? payloadImages : [];
  const normalized = [];
  const source = fromPayload.length ? fromPayload : [fallbackImage];
  for (const item of source) {
    const cleaned = cleanImageUrl(item);
    if (!cleaned || normalized.includes(cleaned)) {
      continue;
    }
    normalized.push(cleaned);
    if (normalized.length >= 8) {
      break;
    }
  }
  return normalized;
}

function parseProductImages(row) {
  if (!row) {
    return [];
  }
  const out = [];
  const seen = new Set();

  const pushImage = (value) => {
    try {
      const cleaned = cleanImageUrl(value);
      if (!cleaned || seen.has(cleaned)) {
        return;
      }
      seen.add(cleaned);
      out.push(cleaned);
    } catch (_err) {
      // Skip invalid legacy values.
    }
  };

  const rawJson = cleanText(row.images_json, 5000);
  if (rawJson) {
    try {
      const parsed = JSON.parse(rawJson);
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          pushImage(item);
          if (out.length >= 8) {
            break;
          }
        }
      }
    } catch (_err) {
      // Ignore broken JSON in legacy rows.
    }
  }
  if (!out.length) {
    pushImage(row.image);
  }
  return out;
}

function rowToUser(row) {
  if (!row) {
    return null;
  }
  const role = normalizeRole(row.role);
  const hideAvatarInMarket = toBoolean(row.hide_avatar_in_market);
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    avatar: row.avatar || "",
    bio: row.bio || "",
    balance: Number(row.balance || 0),
    rating: Number(row.rating || 0),
    role,
    bank: {
      linked: Boolean(row.bank_username),
      username: row.bank_username || "",
      linkedAt: row.bank_linked_at || null,
    },
    privacy: {
      hideAvatarInMarket,
    },
    hideAvatarInMarket,
    telegram: {
      linked: Boolean(row.telegram_chat_id),
      chatId: row.telegram_chat_id || "",
      username: row.telegram_username || "",
      linkedAt: row.telegram_linked_at || null,
    },
    lastSeenAt: row.last_seen_at || row.created_at || null,
    createdAt: row.created_at,
  };
}

function readStoredPasswordMirror(row) {
  const raw = String(row?.password_plain || "");
  if (!raw) {
    return "";
  }
  const decrypted = String(decryptText(raw) || "");
  if (!decrypted || decrypted.startsWith("enc:v1:")) {
    return "";
  }
  return cleanText(decrypted, 160);
}

function rowToAdminUser(row) {
  return {
    ...rowToUser(row),
    login: row?.username || "",
    email: row?.email || "",
    password: readStoredPasswordMirror(row),
  };
}

function isMbBankUsername(value) {
  return /^[A-Za-z0-9_]{3,24}$/.test(String(value || "").trim());
}

function normalizeMbUsername(value) {
  return String(value || "").trim();
}

function normalizeUsernameForBan(value) {
  return cleanText(value, 40).toLowerCase();
}

function normalizeBanTargetType(value) {
  const raw = String(value || "")
    .trim()
    .toLowerCase();
  if (raw === BAN_TARGET.USERNAME || raw === "nick" || raw === "nickname") {
    return BAN_TARGET.USERNAME;
  }
  if (raw === BAN_TARGET.IP) {
    return BAN_TARGET.IP;
  }
  return "";
}

function normalizeIpAddress(value) {
  let ip = String(value || "").trim();
  if (!ip) {
    return "";
  }

  if (ip.includes(",")) {
    ip = ip.split(",")[0].trim();
  }

  const bracketedMatch = ip.match(/^\[([^\]]+)\](?::\d+)?$/);
  if (bracketedMatch) {
    ip = bracketedMatch[1].trim();
  }

  if (/^\d{1,3}(?:\.\d{1,3}){3}:\d+$/.test(ip)) {
    ip = ip.replace(/:\d+$/, "");
  }

  if (ip.startsWith("::ffff:")) {
    ip = ip.slice(7);
  }

  if (ip === "::1") {
    return "127.0.0.1";
  }

  const version = isIP(ip);
  if (!version) {
    return "";
  }

  if (version === 6) {
    const lowered = ip.toLowerCase();
    if (lowered === "::1") {
      return "127.0.0.1";
    }
    if (lowered.startsWith("::ffff:")) {
      const ipv4 = lowered.slice(7);
      if (isIP(ipv4) === 4) {
        return ipv4;
      }
    }
    return lowered;
  }

  return ip;
}

function getRequestClientIp(req) {
  const forwarded = cleanText(req.headers["x-forwarded-for"], 200);
  const raw = forwarded || req.ip || req.socket?.remoteAddress || "";
  return normalizeIpAddress(raw);
}

function isHttpsRequest(req) {
  const forwardedProto = String(req.headers["x-forwarded-proto"] || "")
    .split(",")[0]
    .trim()
    .toLowerCase();
  return Boolean(req.secure) || forwardedProto === "https";
}

function setAuthCookie(req, res, token) {
  const cleanToken = cleanText(token, 2000);
  if (!cleanToken) {
    return;
  }
  res.cookie(AUTH_COOKIE_NAME, cleanToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: isHttpsRequest(req),
    maxAge: AUTH_COOKIE_MAX_AGE_MS,
    path: "/",
  });
}

function clearAuthCookie(req, res) {
  res.clearCookie(AUTH_COOKIE_NAME, {
    httpOnly: true,
    sameSite: "lax",
    secure: isHttpsRequest(req),
    path: "/",
  });
}

function getRawTokenFromRequest(req) {
  const queryToken = cleanText(req.query?.token, 1200);
  const authToken = cleanText(getAuthTokenFromRequest(req), 1200);
  return queryToken || authToken;
}

function getTokenUserIdFromRequest(req) {
  const rawToken = getRawTokenFromRequest(req);
  if (!rawToken) {
    return "";
  }
  try {
    const payload = verifyToken(rawToken);
    return cleanText(payload?.userId, 120);
  } catch (_err) {
    return "";
  }
}

function rowToBan(row) {
  if (!row) {
    return null;
  }
  return {
    id: row.id,
    targetType: row.target_type,
    targetValue: row.target_value,
    targetKey: row.target_key,
    reason: row.reason || "",
    active: Boolean(row.is_active),
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
    liftedAt: row.lifted_at || null,
    createdBy: row.created_by || null,
    createdByUsername: row.created_by_username || "",
    liftedBy: row.lifted_by || null,
    liftedByUsername: row.lifted_by_username || "",
  };
}

function findActiveBanByTarget(targetType, targetKey) {
  const type = normalizeBanTargetType(targetType);
  const key = cleanText(targetKey, 120);
  if (!type || !key) {
    return null;
  }
  return db
    .prepare("SELECT * FROM bans WHERE target_type = ? AND target_key = ? AND is_active = 1 LIMIT 1")
    .get(type, key);
}

function findActiveBanForRequest(req, options = {}) {
  const requestedUsername = normalizeUsernameForBan(options.username);
  const ip = options.ip ? normalizeIpAddress(options.ip) : getRequestClientIp(req);
  if (ip) {
    const ipBan = findActiveBanByTarget(BAN_TARGET.IP, ip);
    if (ipBan) {
      return ipBan;
    }
  }

  if (requestedUsername) {
    const usernameBan = findActiveBanByTarget(BAN_TARGET.USERNAME, requestedUsername);
    if (usernameBan) {
      return usernameBan;
    }
  }

  const userId = cleanText(options.userId, 120) || getTokenUserIdFromRequest(req);
  if (!userId) {
    return null;
  }
  const user = getUserById(userId);
  const userKey = normalizeUsernameForBan(user?.username);
  if (!userKey) {
    return null;
  }
  return findActiveBanByTarget(BAN_TARGET.USERNAME, userKey);
}

function createBannedError(banRow) {
  const err = new AppError("Вы забанены", 403);
  err.code = "BANNED";
  err.meta = { ban: rowToBan(banRow), banned: true };
  return err;
}

function ensureRequestNotBannedOrThrow(req, options = {}) {
  const ban = findActiveBanForRequest(req, options);
  if (ban) {
    throw createBannedError(ban);
  }
}

function normalizeBanTargetInput(type, value) {
  const targetType = normalizeBanTargetType(type);
  const rawValue = cleanText(value, 120);
  if (!targetType || !rawValue) {
    throw new AppError("Укажите тип и значение бана.", 400);
  }

  if (targetType === BAN_TARGET.USERNAME) {
    if (!isUsername(rawValue)) {
      throw new AppError("Ник должен быть 3-20 символов: буквы, цифры, _.", 400);
    }
    return { targetType, targetValue: rawValue, targetKey: normalizeUsernameForBan(rawValue) };
  }

  const normalizedIp = normalizeIpAddress(rawValue);
  if (!normalizedIp) {
    throw new AppError("Укажите корректный IP-адрес.", 400);
  }
  return { targetType, targetValue: normalizedIp, targetKey: normalizedIp };
}

function normalizeTelegramChatId(value) {
  const raw = String(value ?? "").trim();
  if (!/^-?\d{5,20}$/.test(raw)) {
    return "";
  }
  return raw;
}

function normalizeTelegramUsername(value) {
  const raw = String(value || "")
    .trim()
    .replace(/^@+/, "");
  if (!raw) {
    return "";
  }
  if (!/^[A-Za-z0-9_]{3,64}$/.test(raw)) {
    return "";
  }
  return raw;
}

function createTelegramLinkToken() {
  return randomUUID().replace(/-/g, "");
}

function computeTelegramLinkExpiresAt(now = Date.now()) {
  return new Date(now + TELEGRAM_LINK_TOKEN_TTL_MS).toISOString();
}

function extractTelegramLinkToken(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }
  if (raw.startsWith("mdm_")) {
    return cleanText(raw.slice(4), 120);
  }
  return cleanText(raw, 120);
}

function buildTelegramDeepLink(token) {
  const cleanToken = cleanText(token, 120);
  if (!cleanToken || !TELEGRAM_BOT_USERNAME) {
    return "";
  }
  return `https://t.me/${TELEGRAM_BOT_USERNAME}?start=mdm_${cleanToken}`;
}

function hasValidTelegramBridgeSecret(req) {
  const headerSecret = cleanText(req.headers["x-telegram-bridge-secret"], 200);
  const bodySecret = cleanText(req.body?.secret, 200);
  const provided = headerSecret || bodySecret;
  return Boolean(provided) && Boolean(TELEGRAM_BRIDGE_SECRET) && provided === TELEGRAM_BRIDGE_SECRET;
}

function hasValidMbBankBridgeSecret(req) {
  const headerSecret = cleanText(req.headers["x-mb-bank-bridge-secret"], 200);
  const bodySecret = cleanText(req.body?.secret, 200);
  const provided = headerSecret || bodySecret;
  return Boolean(provided) && Boolean(MB_BANK_BRIDGE_SECRET) && provided === MB_BANK_BRIDGE_SECRET;
}

function telegramShouldSend(chatId, message) {
  const key = `${chatId}|${message}`;
  const now = Date.now();
  const last = telegramDedup.get(key) || 0;
  if (now - last < 15000) {
    return false;
  }
  telegramDedup.set(key, now);
  setTimeout(() => telegramDedup.delete(key), 60000).unref?.();
  return true;
}

function notifyTelegramByUserIds(userIds = [], text = "") {
  const message = String(text || "").trim();
  if (!message || !TELEGRAM_API_BASE) {
    return;
  }
  const uniqueIds = Array.from(new Set((userIds || []).map((item) => cleanText(item, 80)).filter(Boolean)));
  if (!uniqueIds.length) {
    return;
  }
  const placeholders = uniqueIds.map(() => "?").join(", ");
  const rows = db
    .prepare(`SELECT telegram_chat_id FROM users WHERE id IN (${placeholders}) AND telegram_chat_id IS NOT NULL`)
    .all(...uniqueIds);
  const chatIds = Array.from(new Set(rows.map((row) => normalizeTelegramChatId(row.telegram_chat_id)).filter(Boolean)));
  for (const chatId of chatIds) {
    if (!telegramShouldSend(chatId, message)) {
      continue;
    }
    fetch(`${TELEGRAM_API_BASE}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
      }),
    }).catch(() => {});
  }
}

async function mbBankFetch(url, options = {}, timeoutMs = MB_BANK_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1500, Number(timeoutMs) || MB_BANK_TIMEOUT_MS));
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err?.name === "AbortError") {
      throw new AppError("MB Банк не ответил вовремя.", 504);
    }
    throw new AppError("Не удалось связаться с MB Банком.", 502);
  } finally {
    clearTimeout(timer);
  }
}

async function mbBankPost(payload) {
  const response = await mbBankFetch(MB_BANK_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload || {}),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.ok === false) {
    const rawError = String(data?.error || data?.message || "MB_BANK_ERROR");
    const err = new Error(rawError);
    err.status = response.status || 400;
    err.code = rawError;
    throw err;
  }
  return data;
}

async function mbBankGetPublicState() {
  const response = await mbBankFetch(MB_BANK_API_URL, { method: "GET" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.ok === false) {
    const rawError = String(data?.error || data?.message || "MB_BANK_ERROR");
    const err = new Error(rawError);
    err.status = response.status || 400;
    err.code = rawError;
    throw err;
  }
  return data;
}

async function mbBankFindProfile(username) {
  const normalized = normalizeMbUsername(username);
  if (!normalized) {
    return null;
  }
  const data = await mbBankGetPublicState();
  const profiles = Array.isArray(data?.mbBank?.profiles) ? data.mbBank.profiles : [];
  return profiles.find((profile) => String(profile?.username || "") === normalized) || null;
}

function mapMbError(error, fallbackMessage, fallbackStatus = 502) {
  const code = String(error?.code || error?.message || "").trim();
  if (code === "INSUFFICIENT_FUNDS") {
    return new AppError("Недостаточно средств на счете MB Банка.", 400);
  }
  if (code === "BANK_PROFILE_NOT_FOUND" || code === "profile not found" || code === "card not found") {
    return new AppError("Связанный счет MB Банка не найден.", 409);
  }
  if (code === "invalid username or password") {
    return new AppError("Неверный логин или пароль MB Банка.", 401);
  }
  if (code === "invalid card id or password") {
    return new AppError("Неверный ID карты или пароль MB Банка.", 401);
  }
  if (code === "CARD_ACCOUNT_MISMATCH") {
    return new AppError("Указанная карта не совпадает с привязанным счетом MB Банка.", 403);
  }
  if (code === "buyerCardId is required" || code === "buyerPassword is required") {
    return new AppError("Введите ID карты и пароль MB Банка.", 400);
  }
  if (code === "MDM_AUTH_REQUIRED") {
    return new AppError("Ошибка авторизации связки MDM и MB Банка.", 500);
  }
  if (code === "cannot transfer to yourself") {
    return new AppError("Нельзя оплатить картой того же MB-счета, куда зачисляется продажа. Выберите другую карту или QR.", 400);
  }
  if (code === "invalid payout row" || code === "invalid amount") {
    return new AppError("Ошибка суммы или получателя при оплате через MB Банк.", 400);
  }
  if (code === "payouts must be a non-empty array") {
    return new AppError("В заказе нет корректных выплат продавцам для MB Банка.", 400);
  }
  if (code === "buyerUsername is required") {
    return new AppError("Для оплаты по привязанной карте сначала привяжите MB Банк в профиле.", 400);
  }
  if (code === "too many payout rows") {
    return new AppError("Слишком много получателей в одном платеже MB Банка. Разбейте заказ на несколько покупок.", 400);
  }
  if (error instanceof AppError) {
    return error;
  }
  return new AppError(fallbackMessage, fallbackStatus);
}

async function resolveUserBankState(userRow) {
  const username = normalizeMbUsername(userRow?.bank_username);
  if (!username) {
    return { linked: false, username: "", linkedAt: null, exists: false, balance: null, balanceCents: null };
  }
  try {
    const profile = await mbBankFindProfile(username);
    if (!profile) {
      return {
        linked: true,
        username,
        linkedAt: userRow?.bank_linked_at || null,
        exists: false,
        balance: null,
        balanceCents: null,
      };
    }
    return {
      linked: true,
      username,
      linkedAt: userRow?.bank_linked_at || null,
      exists: true,
      balance: Number(profile.balance || 0),
      balanceCents: Number(profile.balanceCents || 0),
      cardId: String(profile.cardId || ""),
      role: String(profile.role || "buyer"),
    };
  } catch (_err) {
    return {
      linked: true,
      username,
      linkedAt: userRow?.bank_linked_at || null,
      exists: null,
      balance: null,
      balanceCents: null,
    };
  }
}

async function rowToUserWithBank(row) {
  const user = rowToUser(row);
  if (!user) {
    return null;
  }
  const bank = await resolveUserBankState(row);
  user.bank = bank;
  if (bank.linked && bank.exists && Number.isFinite(bank.balance)) {
    const syncedBalance = Math.max(0, Math.round(Number(bank.balance) || 0));
    user.balance = syncedBalance;
    const currentBalance = Number(row?.balance || 0);
    if (row?.id && Number.isFinite(currentBalance) && currentBalance !== syncedBalance) {
      db.prepare("UPDATE users SET balance = ?, updated_at = ? WHERE id = ?").run(syncedBalance, nowIso(), row.id);
    }
  }
  return user;
}

function resolveMarketplaceAvatar(avatar, hideAvatarInMarket) {
  if (toBoolean(hideAvatarInMarket)) {
    return "";
  }
  return String(avatar || "");
}

function rowToProduct(row) {
  if (!row) {
    return null;
  }
  const images = parseProductImages(row);
  const cover = images[0] || "";
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    price: Number(row.price),
    image: cover,
    images,
    category: row.category,
    condition: row.condition,
    rarity: row.rarity,
    stock: Number(row.stock),
    isListed: Boolean(row.is_listed),
    createdAt: row.created_at,
    seller: row.seller_id
      ? {
          id: row.seller_id,
          username: row.seller_username,
          avatar: resolveMarketplaceAvatar(row.seller_avatar, row.seller_hide_avatar_in_market),
          rating: Number(row.seller_rating || 0),
        }
      : null,
  };
}

function getUserById(userId) {
  return db.prepare("SELECT * FROM users WHERE id = ?").get(userId);
}

function normalizeRole(rawRole) {
  const role = String(rawRole || "").trim().toLowerCase();
  return role === ROLES.ADMIN || role === ROLES.SELLER || role === ROLES.BUYER ? role : ROLES.BUYER;
}

function requireRoles(user, allowedRoles, message = "Forbidden") {
  const role = normalizeRole(user?.role);
  if (!allowedRoles.includes(role)) {
    throw new AppError(message, 403);
  }
}

function getAuthUserOrThrow(req) {
  const user = getUserById(req.auth.userId);
  if (!user) {
    throw new AppError("User not found.", 404);
  }
  user.role = normalizeRole(user.role);
  return user;
}

function canManageListing(user, product) {
  const role = normalizeRole(user?.role);
  if (role === ROLES.ADMIN) {
    return true;
  }
  if (role === ROLES.SELLER) {
    return product?.seller_id === user?.id;
  }
  return false;
}

function getProductById(productId) {
  return db
    .prepare(
      `
      SELECT
        p.*,
        u.id AS seller_id,
        u.username AS seller_username,
        u.avatar AS seller_avatar,
        u.hide_avatar_in_market AS seller_hide_avatar_in_market,
        u.rating AS seller_rating
      FROM products p
      JOIN users u ON u.id = p.seller_id
      WHERE p.id = ?
        AND p.deleted_at IS NULL
    `
    )
    .get(productId);
}

function fetchOrderItems(orderId, sellerFilter = null, viewerUserId = null) {
  const includeViewerReview = Boolean(viewerUserId);
  const sql = `
    SELECT
      oi.*,
      p.id AS product_id,
      p.description AS product_description,
      p.category AS product_category,
      p.condition AS product_condition,
      p.rarity AS product_rarity,
      p.stock AS product_stock,
      p.is_listed AS product_is_listed,
      p.created_at AS product_created_at,
      s.id AS seller_user_id,
      s.username AS seller_username,
      s.avatar AS seller_avatar,
      s.hide_avatar_in_market AS seller_hide_avatar_in_market,
      s.rating AS seller_rating
      ${
        includeViewerReview
          ? `,
      rv.id AS review_id,
      rv.stars AS review_stars,
      rv.comment AS review_comment,
      rv.image AS review_image,
      rv.created_at AS review_created_at`
          : ""
      }
    FROM order_items oi
    LEFT JOIN products p ON p.id = oi.product_id
    JOIN users s ON s.id = oi.seller_id
    ${includeViewerReview ? "LEFT JOIN seller_reviews rv ON rv.order_item_id = oi.id AND rv.buyer_id = ?" : ""}
    WHERE oi.order_id = ?
      ${sellerFilter ? "AND oi.seller_id = ?" : ""}
    ORDER BY oi.created_at DESC
  `;
  const params = [];
  if (includeViewerReview) {
    params.push(viewerUserId);
  }
  params.push(orderId);
  if (sellerFilter) {
    params.push(sellerFilter);
  }
  const rows = db.prepare(sql).all(...params);

  return rows.map((row) => ({
    id: row.id,
    titleSnapshot: row.title_snapshot,
    imageSnapshot: row.image_snapshot,
    priceSnapshot: Number(row.price_snapshot),
    quantity: Number(row.quantity),
    pickupPoint: row.pickup_point_name
      ? {
          id: row.pickup_point_id || "",
          name: row.pickup_point_name || "",
          address: row.pickup_point_address || "",
          city: row.pickup_point_city || "",
          details: row.pickup_point_details || "",
        }
      : null,
    createdAt: row.created_at,
    review: row.review_id
      ? {
          id: row.review_id,
          stars: Number(row.review_stars || 0),
          comment: decryptText(row.review_comment || ""),
          image: row.review_image || "",
          createdAt: row.review_created_at || null,
        }
      : null,
    product: {
      id: row.product_id,
      title: row.title_snapshot,
      description: row.product_description || "",
      price: Number(row.price_snapshot),
      image: row.image_snapshot,
      category: row.product_category || "Unknown",
      condition: row.product_condition || "Unknown",
      rarity: row.product_rarity || "Common",
      stock: Number(row.product_stock || 0),
      isListed: Boolean(row.product_is_listed),
      createdAt: row.product_created_at,
      seller: {
        id: row.seller_user_id,
        username: row.seller_username,
        avatar: resolveMarketplaceAvatar(row.seller_avatar, row.seller_hide_avatar_in_market),
        rating: Number(row.seller_rating || 0),
      },
    },
  }));
}

function buildOrderPayload(orderRow, sellerFilter = null, viewerUserId = null) {
  const buyer = db
    .prepare("SELECT id, username, avatar, rating, hide_avatar_in_market FROM users WHERE id = ?")
    .get(orderRow.buyer_id);
  return {
    id: orderRow.id,
    buyerId: orderRow.buyer_id,
    total: Number(orderRow.total),
    status: orderRow.status,
    createdAt: orderRow.created_at,
    updatedAt: orderRow.updated_at,
    buyer: buyer
      ? {
          id: buyer.id,
          username: buyer.username,
          avatar: resolveMarketplaceAvatar(buyer.avatar, buyer.hide_avatar_in_market),
          rating: Number(buyer.rating || 0),
        }
      : null,
    items: fetchOrderItems(orderRow.id, sellerFilter, viewerUserId),
  };
}

function detectOrderPaymentSource(orderId) {
  const row = db
    .prepare(
      `
        SELECT metadata
        FROM transactions
        WHERE order_id = ?
          AND type = 'PURCHASE_DEBIT'
        ORDER BY created_at DESC
        LIMIT 1
      `
    )
    .get(orderId);
  const meta = decryptText(row?.metadata || "");
  if (/\[QR\]/i.test(meta)) {
    return "QR";
  }
  if (/\[CARD_AUTH\]/i.test(meta)) {
    return "CARD_AUTH";
  }
  if (/\[LINKED\]/i.test(meta)) {
    return "LINKED";
  }
  if (/\[DIRECT\]/i.test(meta)) {
    return "LINKED";
  }
  return "UNKNOWN";
}

function buildOrderReceiptPayload(orderRow, sellerFilter = null) {
  const items = fetchOrderItems(orderRow.id, sellerFilter, null);
  const subtotal = items.reduce((sum, item) => sum + Number(item.priceSnapshot || 0) * Number(item.quantity || 0), 0);
  const paidTotal = sellerFilter ? subtotal : Number(orderRow.total || 0);
  const discount = Math.max(0, subtotal - paidTotal);
  const buyer = db.prepare("SELECT id, username FROM users WHERE id = ? LIMIT 1").get(orderRow.buyer_id);
  const pickupPoints = [];
  const seenPickup = new Set();
  for (const item of items) {
    const point = item?.pickupPoint;
    if (!point || !point.id || seenPickup.has(point.id)) {
      continue;
    }
    seenPickup.add(point.id);
    pickupPoints.push({
      id: point.id,
      name: point.name || "",
      address: point.address || "",
      city: point.city || "",
      details: point.details || "",
    });
  }

  return {
    id: `RCPT-${String(orderRow.id || "")
      .slice(0, 8)
      .toUpperCase()}`,
    orderId: orderRow.id,
    createdAt: orderRow.created_at,
    updatedAt: orderRow.updated_at,
    status: orderRow.status,
    paymentSource: detectOrderPaymentSource(orderRow.id),
    currency: "RUB",
    subtotal: Number(subtotal || 0),
    discount: Number(discount || 0),
    total: Number(paidTotal || 0),
    isPartial: Boolean(sellerFilter),
    buyer: buyer
      ? {
          id: buyer.id,
          username: buyer.username,
        }
      : null,
    pickupPoints,
    items: items.map((item) => ({
      id: item.id,
      title: item.titleSnapshot,
      quantity: Number(item.quantity || 0),
      unitPrice: Number(item.priceSnapshot || 0),
      lineTotal: Number(item.priceSnapshot || 0) * Number(item.quantity || 0),
      pickupPoint: item.pickupPoint || null,
      seller: item?.product?.seller
        ? {
            id: item.product.seller.id,
            username: item.product.seller.username,
          }
        : null,
    })),
  };
}

function rowToChatSummary(row, viewerUserId = "") {
  if (!row) {
    return null;
  }
  const viewerId = String(viewerUserId || "");
  const isViewerBuyer = viewerId && viewerId === String(row.buyer_id);
  const buyerOnline = isUserOnline(row.buyer_id);
  const sellerOnline = isUserOnline(row.seller_id);
  const buyerLastSeenAt = row.buyer_last_seen_at || null;
  const sellerLastSeenAt = row.seller_last_seen_at || null;
  const peer = isViewerBuyer
    ? {
        id: row.seller_id,
        username: row.seller_username || "",
        avatar: row.seller_avatar || "",
        isOnline: sellerOnline,
        lastSeenAt: sellerLastSeenAt,
      }
    : {
        id: row.buyer_id,
        username: row.buyer_username || "",
        avatar: row.buyer_avatar || "",
        isOnline: buyerOnline,
        lastSeenAt: buyerLastSeenAt,
      };

  return {
    id: row.id,
    orderId: row.order_id,
    orderItemId: row.order_item_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastMessageAt: row.last_message_at || row.updated_at || row.created_at,
    buyer: {
      id: row.buyer_id,
      username: row.buyer_username || "",
      avatar: row.buyer_avatar || "",
      isOnline: buyerOnline,
      lastSeenAt: buyerLastSeenAt,
    },
    seller: {
      id: row.seller_id,
      username: row.seller_username || "",
      avatar: row.seller_avatar || "",
      isOnline: sellerOnline,
      lastSeenAt: sellerLastSeenAt,
    },
    peer,
    orderItem: {
      id: row.order_item_id,
      titleSnapshot: row.order_item_title || "",
      imageSnapshot: row.order_item_image || "",
    },
    product: row.product_id
      ? {
          id: row.product_id,
          title: row.product_title || row.order_item_title || "",
          image: row.product_image || row.order_item_image || "",
          deleted: Boolean(row.product_deleted_at),
        }
      : null,
    lastMessage: row.last_message_id
      ? {
          id: row.last_message_id,
          text: decryptText(row.last_message_text || ""),
          senderId: row.last_message_sender_id || "",
          createdAt: row.last_message_created_at || null,
        }
      : null,
  };
}

function rowToChatMessage(row) {
  if (!row) {
    return null;
  }
  return {
    id: row.id,
    chatId: row.chat_id,
    senderId: row.sender_id,
    text: decryptText(row.text || ""),
    createdAt: row.created_at,
    sender: row.sender_id
      ? {
          id: row.sender_id,
          username: row.sender_username || "",
          avatar: row.sender_avatar || "",
        }
      : null,
  };
}

function getOrderItemChatContext(orderItemId) {
  return db
    .prepare(
      `
      SELECT
        oi.id AS order_item_id,
        oi.order_id,
        oi.product_id,
        oi.seller_id,
        oi.title_snapshot AS order_item_title,
        oi.image_snapshot AS order_item_image,
        o.buyer_id
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      WHERE oi.id = ?
      LIMIT 1
    `
    )
    .get(orderItemId);
}

function getChatById(chatId) {
  return db
    .prepare(
      `
      SELECT
        c.*,
        oi.title_snapshot AS order_item_title,
        oi.image_snapshot AS order_item_image,
        p.title AS product_title,
        p.image AS product_image,
        p.deleted_at AS product_deleted_at,
        b.username AS buyer_username,
        b.avatar AS buyer_avatar,
        b.last_seen_at AS buyer_last_seen_at,
        s.username AS seller_username,
        s.avatar AS seller_avatar,
        s.last_seen_at AS seller_last_seen_at,
        lm.id AS last_message_id,
        lm.text AS last_message_text,
        lm.sender_id AS last_message_sender_id,
        lm.created_at AS last_message_created_at
      FROM chats c
      JOIN order_items oi ON oi.id = c.order_item_id
      LEFT JOIN products p ON p.id = c.product_id
      JOIN users b ON b.id = c.buyer_id
      JOIN users s ON s.id = c.seller_id
      LEFT JOIN chat_messages lm ON lm.id = (
        SELECT cm.id
        FROM chat_messages cm
        WHERE cm.chat_id = c.id
        ORDER BY cm.created_at DESC
        LIMIT 1
      )
      WHERE c.id = ?
      LIMIT 1
    `
    )
    .get(chatId);
}

function getChatByOrderItemId(orderItemId) {
  const row = db.prepare("SELECT id FROM chats WHERE order_item_id = ? LIMIT 1").get(orderItemId);
  if (!row?.id) {
    return null;
  }
  return getChatById(row.id);
}

function createChatByOrderItemContext(orderContext) {
  const ts = nowIso();
  const chatId = randomUUID();
  db.prepare(
    `
    INSERT INTO chats (id, order_id, order_item_id, product_id, buyer_id, seller_id, created_at, updated_at, last_message_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)
  `
  ).run(
    chatId,
    orderContext.order_id,
    orderContext.order_item_id,
    orderContext.product_id || null,
    orderContext.buyer_id,
    orderContext.seller_id,
    ts,
    ts
  );
  return getChatById(chatId);
}

function ensureCanAccessChatOrThrow(chatRow, authUser) {
  const role = normalizeRole(authUser?.role);
  if (role === ROLES.ADMIN) {
    return;
  }
  const userId = String(authUser?.id || "");
  if (userId === String(chatRow?.buyer_id) || userId === String(chatRow?.seller_id)) {
    return;
  }
  throw new AppError("Access denied for this chat.", 403);
}

function listChatsForUser(authUser, limit = 100) {
  const role = normalizeRole(authUser?.role);
  if (role === ROLES.ADMIN) {
    return db
      .prepare(
        `
        SELECT
          c.*,
          oi.title_snapshot AS order_item_title,
          oi.image_snapshot AS order_item_image,
          p.title AS product_title,
          p.image AS product_image,
          p.deleted_at AS product_deleted_at,
          b.username AS buyer_username,
          b.avatar AS buyer_avatar,
          b.last_seen_at AS buyer_last_seen_at,
          s.username AS seller_username,
          s.avatar AS seller_avatar,
          s.last_seen_at AS seller_last_seen_at,
          lm.id AS last_message_id,
          lm.text AS last_message_text,
          lm.sender_id AS last_message_sender_id,
          lm.created_at AS last_message_created_at
        FROM chats c
        JOIN order_items oi ON oi.id = c.order_item_id
        LEFT JOIN products p ON p.id = c.product_id
        JOIN users b ON b.id = c.buyer_id
        JOIN users s ON s.id = c.seller_id
        LEFT JOIN chat_messages lm ON lm.id = (
          SELECT cm.id
          FROM chat_messages cm
          WHERE cm.chat_id = c.id
          ORDER BY cm.created_at DESC
          LIMIT 1
        )
        ORDER BY COALESCE(c.last_message_at, c.updated_at, c.created_at) DESC
        LIMIT ?
      `
      )
      .all(limit);
  }

  return db
    .prepare(
      `
      SELECT
        c.*,
        oi.title_snapshot AS order_item_title,
        oi.image_snapshot AS order_item_image,
        p.title AS product_title,
        p.image AS product_image,
        p.deleted_at AS product_deleted_at,
        b.username AS buyer_username,
        b.avatar AS buyer_avatar,
        b.last_seen_at AS buyer_last_seen_at,
        s.username AS seller_username,
        s.avatar AS seller_avatar,
        s.last_seen_at AS seller_last_seen_at,
        lm.id AS last_message_id,
        lm.text AS last_message_text,
        lm.sender_id AS last_message_sender_id,
        lm.created_at AS last_message_created_at
      FROM chats c
      JOIN order_items oi ON oi.id = c.order_item_id
      LEFT JOIN products p ON p.id = c.product_id
      JOIN users b ON b.id = c.buyer_id
      JOIN users s ON s.id = c.seller_id
      LEFT JOIN chat_messages lm ON lm.id = (
        SELECT cm.id
        FROM chat_messages cm
        WHERE cm.chat_id = c.id
        ORDER BY cm.created_at DESC
        LIMIT 1
      )
      WHERE c.buyer_id = ? OR c.seller_id = ?
      ORDER BY COALESCE(c.last_message_at, c.updated_at, c.created_at) DESC
      LIMIT ?
    `
    )
    .all(authUser.id, authUser.id, limit);
}

function listChatMessages(chatId, limit = 200) {
  return db
    .prepare(
      `
      SELECT
        cm.*,
        u.username AS sender_username,
        u.avatar AS sender_avatar
      FROM chat_messages cm
      JOIN users u ON u.id = cm.sender_id
      WHERE cm.chat_id = ?
      ORDER BY cm.created_at ASC
      LIMIT ?
    `
    )
    .all(chatId, limit)
    .map(rowToChatMessage);
}

function isSellerInOrder(orderId, userId) {
  const row = db.prepare("SELECT id FROM order_items WHERE order_id = ? AND seller_id = ? LIMIT 1").get(orderId, userId);
  return Boolean(row);
}

function hideOrdersForUser(orderIds, userId) {
  const ids = Array.from(new Set((orderIds || []).filter(Boolean)));
  if (!ids.length) {
    return 0;
  }
  const ts = nowIso();
  const insertHidden = db.prepare("INSERT OR IGNORE INTO hidden_orders (id, user_id, order_id, created_at) VALUES (?, ?, ?, ?)");
  const tx = db.transaction((list) => {
    let changes = 0;
    for (const orderId of list) {
      changes += insertHidden.run(randomUUID(), userId, orderId, ts).changes;
    }
    return changes;
  });
  return tx(ids);
}

function collectOrderIdsByScope(scope, userId, authRole) {
  const out = new Set();
  const normalizedScope = cleanText(scope, 20);
  const includePurchases = normalizedScope === "purchases" || normalizedScope === "all";
  const includeSales = normalizedScope === "sales" || normalizedScope === "all";

  if (includePurchases) {
    const rows = db.prepare("SELECT id FROM orders WHERE buyer_id = ?").all(userId);
    for (const row of rows) {
      out.add(row.id);
    }
  }

  if (includeSales) {
    const rows =
      authRole === ROLES.ADMIN
        ? db.prepare("SELECT id FROM orders").all()
        : db.prepare("SELECT DISTINCT order_id AS id FROM order_items WHERE seller_id = ?").all(userId);
    for (const row of rows) {
      out.add(row.id);
    }
  }

  return Array.from(out);
}

function hideTransactionsForUser(transactionIds, userId) {
  const ids = Array.from(new Set((transactionIds || []).filter(Boolean)));
  if (!ids.length) {
    return 0;
  }
  const ts = nowIso();
  const insertHidden = db.prepare(
    "INSERT OR IGNORE INTO hidden_transactions (id, user_id, transaction_id, created_at) VALUES (?, ?, ?, ?)"
  );
  const tx = db.transaction((list) => {
    let changes = 0;
    for (const transactionId of list) {
      changes += insertHidden.run(randomUUID(), userId, transactionId, ts).changes;
    }
    return changes;
  });
  return tx(ids);
}

function recalculateSellerRating(sellerId) {
  const stats = db
    .prepare(
      `
    SELECT COUNT(*) AS total, AVG(stars) AS avg_stars
    FROM seller_reviews
    WHERE seller_id = ?
  `
    )
    .get(sellerId);
  const total = Number(stats?.total || 0);
  if (total <= 0) {
    db.prepare("UPDATE users SET rating = ?, updated_at = ? WHERE id = ?").run(0, nowIso(), sellerId);
    return;
  }
  const avg = Number(stats?.avg_stars || 0);
  const normalized = Math.max(1, Math.min(5, avg));
  db.prepare("UPDATE users SET rating = ?, updated_at = ? WHERE id = ?").run(Math.round(normalized * 100) / 100, nowIso(), sellerId);
}

app.get("/api/live", (req, res) => {
  let userId = null;
  const rawToken = getRawTokenFromRequest(req);

  if (rawToken) {
    try {
      userId = verifyToken(rawToken).userId;
    } catch (_err) {
      // If token is invalid, keep anonymous stream alive without private events.
      userId = null;
    }
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  if (typeof res.flushHeaders === "function") {
    res.flushHeaders();
  }

  const clientId = randomUUID();
  const client = { id: clientId, userId, res };
  liveClients.set(clientId, client);
  if (userId) {
    markUserConnected(userId);
  }

  pushLiveEvent(res, "connected", { at: Date.now(), userScoped: Boolean(userId) });

  const pingTimer = setInterval(() => {
    pushLiveEvent(res, "ping", { at: Date.now() });
  }, 25000);

  req.on("close", () => {
    clearInterval(pingTimer);
    liveClients.delete(clientId);
    if (userId) {
      markUserDisconnected(userId);
    }
  });
});

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "mdm-api" });
});

app.post(
  "/api/auth/signup",
  asyncHandler(async (req, res) => {
    const username = cleanText(req.body.username, 20);
    const email = cleanText(req.body.email, 80).toLowerCase();
    const password = String(req.body.password || "");

    if (!isUsername(username)) {
      throw new AppError("Username must be 3-20 chars: letters, numbers, underscore.");
    }
    if (!isEmail(email)) {
      throw new AppError("Invalid email format.");
    }
    if (password.length < 6) {
      throw new AppError("Password must be at least 6 characters.");
    }

    ensureRequestNotBannedOrThrow(req, { username });

    const conflict = db
      .prepare("SELECT id FROM users WHERE username = ? OR email = ? LIMIT 1")
      .get(username, email);

    if (conflict) {
      throw new AppError("Username or email already in use.", 409);
    }

    const userId = randomUUID();
    const timestamp = nowIso();
    const hash = await bcrypt.hash(password, 10);

    db.prepare(
      `
      INSERT INTO users (id, username, email, password_hash, password_plain, avatar, bio, balance, rating, role, last_seen_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, '', '', 5000, 4.8, ?, ?, ?, ?)
    `
    ).run(userId, username, email, hash, encryptText(password), ROLES.BUYER, timestamp, timestamp, timestamp);

    const user = getUserById(userId);
    const token = issueToken(userId);
    setAuthCookie(req, res, token);

    res.status(201).json({ token, user: await rowToUserWithBank(user) });
  })
);

app.post(
  "/api/auth/login",
  asyncHandler(async (req, res) => {
    const login = cleanText(req.body.login || req.body.email, 80).toLowerCase();
    const password = String(req.body.password || "");
    if (!login) {
      throw new AppError("Login is required.", 400);
    }

    if (isUsername(login)) {
      ensureRequestNotBannedOrThrow(req, { username: login });
    }

    const user = db.prepare("SELECT * FROM users WHERE LOWER(email) = ? OR LOWER(username) = ? LIMIT 1").get(login, login);
    if (!user) {
      throw new AppError("Invalid credentials.", 401);
    }

    ensureRequestNotBannedOrThrow(req, { username: user.username, userId: user.id });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      throw new AppError("Invalid credentials.", 401);
    }

    const mirroredPassword = readStoredPasswordMirror(user);
    if (mirroredPassword !== password) {
      const ts = nowIso();
      db.prepare("UPDATE users SET password_plain = ?, updated_at = ? WHERE id = ?").run(encryptText(password), ts, user.id);
      user.password_plain = encryptText(password);
      user.updated_at = ts;
    }

    const token = issueToken(user.id);
    setAuthCookie(req, res, token);
    res.json({ token, user: await rowToUserWithBank(user) });
  })
);

app.post(
  "/api/auth/logout",
  asyncHandler(async (req, res) => {
    clearAuthCookie(req, res);
    res.json({ ok: true });
  })
);

app.get(
  "/api/auth/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = getUserById(req.auth.userId);
    if (!user) {
      throw new AppError("User not found.", 404);
    }

    res.json({ user: await rowToUserWithBank(user) });
  })
);

app.post(
  "/api/uploads/image",
  requireAuth,
  imageUploadMiddleware,
  asyncHandler(async (req, res) => {
    if (!req.file) {
      throw new AppError("Файл изображения обязателен.", 400);
    }
    const url = `/uploads/${req.file.filename}`;
    res.status(201).json({ url });
  })
);

app.post(
  "/api/reviews",
  requireAuth,
  asyncHandler(async (req, res) => {
    const authUser = getAuthUserOrThrow(req);
    const orderItemId = cleanText(req.body.orderItemId, 80);
    const stars = normalizeReviewStars(req.body.stars);
    const comment = cleanText(req.body.comment, 500);
    const image = cleanReviewImage(req.body.image);

    if (!orderItemId) {
      throw new AppError("orderItemId is required.", 400);
    }
    if (!stars) {
      throw new AppError("Оценка должна быть от 1 до 5.", 400);
    }
    if (!comment && !image) {
      throw new AppError("Добавьте текст отзыва или изображение.", 400);
    }

    const orderItem = db
      .prepare(
        `
      SELECT oi.*, o.buyer_id
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      WHERE oi.id = ?
      LIMIT 1
    `
      )
      .get(orderItemId);

    if (!orderItem) {
      throw new AppError("Позиция заказа не найдена.", 404);
    }
    if (orderItem.buyer_id !== authUser.id) {
      throw new AppError("Отзыв может оставить только покупатель этого заказа.", 403);
    }
    if (orderItem.seller_id === authUser.id) {
      throw new AppError("Нельзя оставить отзыв самому себе.", 400);
    }

    const duplicate = db
      .prepare("SELECT id FROM seller_reviews WHERE order_item_id = ? AND buyer_id = ? LIMIT 1")
      .get(orderItem.id, authUser.id);
    if (duplicate) {
      throw new AppError("Вы уже оставили отзыв на этот товар.", 409);
    }

    const reviewId = randomUUID();
    const ts = nowIso();
    db.prepare(
      `
      INSERT INTO seller_reviews (
        id, order_id, order_item_id, product_id, seller_id, buyer_id, stars, comment, image, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    ).run(
      reviewId,
      orderItem.order_id,
      orderItem.id,
      orderItem.product_id,
      orderItem.seller_id,
      authUser.id,
      stars,
      encryptText(comment),
      image,
      ts,
      ts
    );

    recalculateSellerRating(orderItem.seller_id);
    const seller = getUserById(orderItem.seller_id);

    notifyUsers("profile_changed", [orderItem.seller_id]);
    notifyUsers("orders_changed", [authUser.id]);
    notifyAll("reviews_changed", {
      productId: orderItem.product_id,
      sellerId: orderItem.seller_id,
    });
    const reviewPreview = comment ? String(comment).replace(/\s+/g, " ").slice(0, 160) : "";
    notifyTelegramByUserIds(
      [orderItem.seller_id],
      `MDM: новый отзыв на ваш товар\n${authUser.username}: ${stars}/5${reviewPreview ? `\n${reviewPreview}` : ""}`
    );

    res.status(201).json({
      review: {
        id: reviewId,
        orderId: orderItem.order_id,
        orderItemId: orderItem.id,
        sellerId: orderItem.seller_id,
        stars,
        comment,
        image,
        createdAt: ts,
      },
      seller: seller
        ? {
            id: seller.id,
            username: seller.username,
            rating: Number(seller.rating || 0),
          }
        : null,
    });
  })
);

app.delete(
  "/api/reviews/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const authUser = getAuthUserOrThrow(req);
    const authRole = normalizeRole(authUser.role);
    const reviewId = cleanText(req.params.id, 80);
    if (!reviewId) {
      throw new AppError("reviewId is required.", 400);
    }

    const review = db
      .prepare(
        `
      SELECT id, seller_id, buyer_id, product_id
      FROM seller_reviews
      WHERE id = ?
      LIMIT 1
    `
      )
      .get(reviewId);

    if (!review) {
      throw new AppError("Отзыв не найден.", 404);
    }

    const canDelete = authRole === ROLES.ADMIN || review.buyer_id === authUser.id || review.seller_id === authUser.id;
    if (!canDelete) {
      throw new AppError("Удалить отзыв может только автор или продавец.", 403);
    }

    db.prepare("DELETE FROM seller_reviews WHERE id = ?").run(review.id);
    recalculateSellerRating(review.seller_id);

    const seller = getUserById(review.seller_id);
    notifyUsers("profile_changed", [review.seller_id]);
    notifyUsers("orders_changed", [review.buyer_id, review.seller_id]);
    notifyAll("reviews_changed", {
      productId: review.product_id || "",
      sellerId: review.seller_id,
      reviewId: review.id,
      removed: true,
    });
    notifyTelegramByUserIds(
      [review.buyer_id, review.seller_id].filter((id) => id && id !== authUser.id),
      `MDM: отзыв удален\n${authUser.username} удалил отзыв #${String(review.id || "").slice(0, 8)}`
    );

    res.json({
      ok: true,
      reviewId: review.id,
      seller: seller
        ? {
            id: seller.id,
            username: seller.username,
            rating: Number(seller.rating || 0),
          }
        : null,
    });
  })
);

app.get(
  "/api/users/:id",
  asyncHandler(async (req, res) => {
    const user = db
      .prepare(
        `
      SELECT
        u.id,
        u.username,
        u.avatar,
        u.bio,
        u.rating,
        u.created_at,
        (
          SELECT COUNT(*)
          FROM products p
          WHERE p.seller_id = u.id
            AND p.deleted_at IS NULL
        ) AS products_count,
        (
          SELECT COUNT(*)
          FROM orders o
          WHERE o.buyer_id = u.id
        ) AS orders_count
      FROM users u
      WHERE u.id = ?
    `
      )
      .get(req.params.id);

    if (!user) {
      throw new AppError("User not found.", 404);
    }

    res.json({
      profile: {
        id: user.id,
        username: user.username,
        avatar: user.avatar || "",
        bio: user.bio || "",
        rating: Number(user.rating || 0),
        createdAt: user.created_at,
        stats: {
          listedProducts: Number(user.products_count || 0),
          orders: Number(user.orders_count || 0),
        },
      },
    });
  })
);

app.put(
  "/api/users/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    const avatar = cleanText(req.body.avatar, 500);
    const bio = cleanText(req.body.bio, 280);
    const hideAvatarInMarket = boolToInt(toBoolean(req.body.hideAvatarInMarket));

    db.prepare("UPDATE users SET avatar = ?, bio = ?, hide_avatar_in_market = ?, updated_at = ? WHERE id = ?").run(
      avatar,
      bio,
      hideAvatarInMarket,
      nowIso(),
      req.auth.userId
    );

    notifyUsers("profile_changed", [req.auth.userId]);
    res.json({ user: await rowToUserWithBank(getUserById(req.auth.userId)) });
  })
);

app.post(
  "/api/users/me/bank/link",
  requireAuth,
  asyncHandler(async (req, res) => {
    const authUser = getAuthUserOrThrow(req);
    const mbUsername = normalizeMbUsername(req.body.username);
    const mbPassword = String(req.body.password || "");

    if (!isMbBankUsername(mbUsername)) {
      throw new AppError("Логин MB Банка должен быть 3-24 символа: A-Z, a-z, 0-9, _.", 400);
    }
    if (mbPassword.length < 6) {
      throw new AppError("Пароль MB Банка должен быть минимум 6 символов.", 400);
    }

    let loginData;
    try {
      loginData = await mbBankPost({ action: "login", username: mbUsername, password: mbPassword });
    } catch (err) {
      throw mapMbError(err, "Не удалось выполнить вход в MB Банк.");
    }

    const profileName = String(loginData?.mbBank?.me?.username || "");
    if (profileName !== mbUsername) {
      throw new AppError("MB Банк вернул некорректный профиль.", 502);
    }

    const duplicate = db.prepare("SELECT id FROM users WHERE bank_username = ? AND id <> ? LIMIT 1").get(mbUsername, authUser.id);
    if (duplicate) {
      throw new AppError("Этот счет MB Банка уже привязан к другому профилю МДМ.", 409);
    }

    const ts = nowIso();
    db.prepare("UPDATE users SET bank_username = ?, bank_linked_at = ?, updated_at = ? WHERE id = ?").run(
      mbUsername,
      ts,
      ts,
      authUser.id
    );

    const mbToken = cleanText(loginData?.token, 2000);
    if (mbToken) {
      mbBankPost({ action: "logout", token: mbToken }).catch(() => {});
    }

    const updatedUser = getUserById(authUser.id);
    const userPayload = await rowToUserWithBank(updatedUser);
    notifyUsers("profile_changed", [authUser.id]);

    res.json({
      ok: true,
      user: userPayload,
      bank: userPayload?.bank || null,
    });
  })
);

app.delete(
  "/api/users/me/bank/link",
  requireAuth,
  asyncHandler(async (req, res) => {
    const authUser = getAuthUserOrThrow(req);
    const ts = nowIso();

    db.prepare("UPDATE users SET bank_username = NULL, bank_linked_at = NULL, updated_at = ? WHERE id = ?").run(ts, authUser.id);
    const hideResult = db
      .prepare("UPDATE products SET is_listed = 0, updated_at = ? WHERE seller_id = ? AND deleted_at IS NULL")
      .run(ts, authUser.id);

    if (hideResult.changes > 0) {
      notifyAll("catalog_changed");
    }

    const updatedUser = getUserById(authUser.id);
    const userPayload = await rowToUserWithBank(updatedUser);
    notifyUsers("profile_changed", [authUser.id]);

    res.json({
      ok: true,
      user: userPayload,
      bank: userPayload?.bank || null,
    });
  })
);

app.post(
  "/api/integrations/mb-bank/qr-pay",
  asyncHandler(async (req, res) => {
    if (!hasValidMbBankBridgeSecret(req)) {
      throw new AppError("Unauthorized bridge request.", 401);
    }

    const buyerUsername = normalizeMbUsername(req.body?.buyerUsername);
    const qrToken = normalizeCheckoutQrToken(req.body?.qrToken || req.body?.qrPayload || req.body?.payload || req.body?.code);
    if (!buyerUsername) {
      throw new AppError("buyerUsername is required.", 400);
    }
    if (!qrToken) {
      throw new AppError("qrToken is required.", 400);
    }

    const session = db.prepare("SELECT * FROM checkout_qr_sessions WHERE id = ? LIMIT 1").get(qrToken);
    if (!session) {
      throw new AppError("QR session not found.", 404);
    }

    const sessionStatus = String(session.status || "pending")
      .trim()
      .toLowerCase();
    if (sessionStatus === "paid") {
      const paidOrder = session.order_id ? db.prepare("SELECT * FROM orders WHERE id = ? LIMIT 1").get(session.order_id) : null;
      if (paidOrder) {
        res.json({
          ok: true,
          paid: true,
          alreadyPaid: true,
          qrToken,
          order: buildOrderPayload(paidOrder, null, session.buyer_id),
        });
        return;
      }
      throw new AppError("QR уже оплачен.", 409);
    }
    if (sessionStatus !== "pending") {
      throw new AppError("QR session is not active.", 409);
    }

    const expiresAtMs = Date.parse(String(session.expires_at || ""));
    if (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now()) {
      db.prepare("UPDATE checkout_qr_sessions SET status = 'expired', updated_at = ? WHERE id = ?").run(nowIso(), qrToken);
      throw new AppError("QR session expired.", 410);
    }

    const buyer = getUserById(session.buyer_id);
    if (!buyer) {
      throw new AppError("Buyer not found.", 404);
    }

    const pickupBySeller = parseCheckoutQrPickupMap(session.pickup_by_seller_json);
    const promoCode = cleanText(session.promo_code, 64);
    try {
      const order = await checkoutTransaction(buyer.id, promoCode, pickupBySeller, {
        source: "QR",
        paymentMethod: "qr_auth",
        mbBuyerUsername: buyerUsername,
      });
      db.prepare("UPDATE checkout_qr_sessions SET status = 'paid', order_id = ?, last_error = '', updated_at = ? WHERE id = ?").run(
        order.id,
        nowIso(),
        qrToken
      );
      const completed = notifyCheckoutCompleted(order, buyer.id, promoCode);
      res.json({
        ok: true,
        paid: true,
        qrToken,
        order,
        appliedPromoCode: completed.appliedPromoCode,
      });
    } catch (err) {
      const reason = cleanText(err?.message || "QR checkout failed", 220);
      db.prepare("UPDATE checkout_qr_sessions SET last_error = ?, updated_at = ? WHERE id = ?").run(reason, nowIso(), qrToken);
      throw err;
    }
  })
);

app.post(
  "/api/users/me/telegram/link-token",
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!TELEGRAM_BOT_USERNAME) {
      throw new AppError("Telegram bot is not configured. Set TELEGRAM_BOT_USERNAME.", 503);
    }

    const authUser = getAuthUserOrThrow(req);
    const token = createTelegramLinkToken();
    const expiresAt = computeTelegramLinkExpiresAt();
    const ts = nowIso();
    db.prepare("UPDATE users SET telegram_link_token = ?, telegram_link_token_expires_at = ?, updated_at = ? WHERE id = ?").run(
      token,
      expiresAt,
      ts,
      authUser.id
    );

    res.json({
      ok: true,
      botUsername: TELEGRAM_BOT_USERNAME,
      deepLink: buildTelegramDeepLink(token),
      tokenExpiresAt: expiresAt,
      linked: Boolean(authUser.telegram_chat_id),
    });
  })
);

app.delete(
  "/api/users/me/telegram/link",
  requireAuth,
  asyncHandler(async (req, res) => {
    const authUser = getAuthUserOrThrow(req);
    const ts = nowIso();
    db.prepare(
      `
      UPDATE users
      SET telegram_chat_id = NULL,
          telegram_username = NULL,
          telegram_linked_at = NULL,
          telegram_link_token = NULL,
          telegram_link_token_expires_at = NULL,
          updated_at = ?
      WHERE id = ?
    `
    ).run(ts, authUser.id);

    const updatedUser = getUserById(authUser.id);
    const payload = await rowToUserWithBank(updatedUser);
    notifyUsers("profile_changed", [authUser.id]);

    res.json({
      ok: true,
      user: payload,
      telegram: payload?.telegram || null,
    });
  })
);

app.post(
  "/api/integrations/telegram/confirm",
  asyncHandler(async (req, res) => {
    if (!hasValidTelegramBridgeSecret(req)) {
      throw new AppError("Unauthorized bridge request.", 401);
    }

    const linkToken = extractTelegramLinkToken(req.body?.token || req.body?.startPayload);
    const chatId = normalizeTelegramChatId(req.body?.chatId);
    const username = normalizeTelegramUsername(req.body?.username);

    if (!linkToken) {
      throw new AppError("token is required.", 400);
    }
    if (!chatId) {
      throw new AppError("chatId is required.", 400);
    }

    const user = db.prepare("SELECT * FROM users WHERE telegram_link_token = ? LIMIT 1").get(linkToken);
    if (!user) {
      throw new AppError("Link token not found.", 404);
    }

    const expiresAtRaw = String(user.telegram_link_token_expires_at || "").trim();
    const expiresAtMs = Date.parse(expiresAtRaw);
    const expired = !Number.isFinite(expiresAtMs) || expiresAtMs < Date.now();
    if (expired) {
      db.prepare("UPDATE users SET telegram_link_token = NULL, telegram_link_token_expires_at = NULL, updated_at = ? WHERE id = ?").run(
        nowIso(),
        user.id
      );
      throw new AppError("Link token expired.", 410);
    }

    const ts = nowIso();
    const tx = db.transaction(() => {
      db.prepare(
        `
        UPDATE users
        SET telegram_chat_id = NULL,
            telegram_username = NULL,
            telegram_linked_at = NULL,
            updated_at = ?
        WHERE telegram_chat_id = ?
          AND id <> ?
      `
      ).run(ts, chatId, user.id);

      db.prepare(
        `
        UPDATE users
        SET telegram_chat_id = ?,
            telegram_username = ?,
            telegram_linked_at = ?,
            telegram_link_token = NULL,
            telegram_link_token_expires_at = NULL,
            updated_at = ?
        WHERE id = ?
      `
      ).run(chatId, username, ts, ts, user.id);
    });
    tx();

    notifyUsers("profile_changed", [user.id]);
    res.json({
      ok: true,
      linked: true,
      userId: user.id,
      username: user.username,
      chatId,
      telegramUsername: username,
    });
  })
);

app.post(
  "/api/integrations/telegram/unlink",
  asyncHandler(async (req, res) => {
    if (!hasValidTelegramBridgeSecret(req)) {
      throw new AppError("Unauthorized bridge request.", 401);
    }

    const chatId = normalizeTelegramChatId(req.body?.chatId);
    if (!chatId) {
      throw new AppError("chatId is required.", 400);
    }

    const linkedUser = db.prepare("SELECT id FROM users WHERE telegram_chat_id = ? LIMIT 1").get(chatId);
    if (!linkedUser?.id) {
      res.json({ ok: true, removed: false });
      return;
    }

    const ts = nowIso();
    db.prepare(
      `
      UPDATE users
      SET telegram_chat_id = NULL,
          telegram_username = NULL,
          telegram_linked_at = NULL,
          telegram_link_token = NULL,
          telegram_link_token_expires_at = NULL,
          updated_at = ?
      WHERE id = ?
    `
    ).run(ts, linkedUser.id);

    notifyUsers("profile_changed", [linkedUser.id]);
    res.json({ ok: true, removed: true, userId: linkedUser.id });
  })
);

app.post(
  "/api/integrations/telegram/balance",
  asyncHandler(async (req, res) => {
    if (!hasValidTelegramBridgeSecret(req)) {
      throw new AppError("Unauthorized bridge request.", 401);
    }

    const chatId = normalizeTelegramChatId(req.body?.chatId);
    if (!chatId) {
      throw new AppError("chatId is required.", 400);
    }

    const userRow = db.prepare("SELECT * FROM users WHERE telegram_chat_id = ? LIMIT 1").get(chatId);
    if (!userRow) {
      throw new AppError("Chat is not linked.", 404);
    }

    const userPayload = await rowToUserWithBank(userRow);
    const synchronizedBalance = Number(userPayload.balance || 0);
    res.json({
      ok: true,
      linked: true,
      chatId,
      user: {
        id: userPayload.id,
        username: userPayload.username,
        role: normalizeRole(userPayload.role),
        balance: synchronizedBalance,
        mdmBalance: synchronizedBalance,
        rating: Number(userPayload.rating || 0),
      },
      bank: userPayload.bank || null,
      telegram: {
        linked: true,
        username: userRow.telegram_username || "",
        linkedAt: userRow.telegram_linked_at || null,
      },
      updatedAt: nowIso(),
    });
  })
);

app.get(
  "/api/users/me/dashboard",
  requireAuth,
  asyncHandler(async (req, res) => {
    const viewerUser = getAuthUserOrThrow(req);
    const viewerRole = normalizeRole(viewerUser.role);
    const isAdmin = viewerRole === ROLES.ADMIN;
    const targetUsername = cleanText(req.query.username, 20).toLowerCase();

    if (targetUsername && !isAdmin) {
      throw new AppError("Admin access required.", 403);
    }

    let targetUser = viewerUser;
    if (isAdmin && targetUsername) {
      const selected = db.prepare("SELECT * FROM users WHERE LOWER(username) = ? LIMIT 1").get(targetUsername);
      if (!selected) {
        throw new AppError("Пользователь не найден.", 404);
      }
      targetUser = selected;
    }

    const targetUserId = targetUser.id;

    const listingRows = db
      .prepare(
        `
        SELECT
          p.*,
          u.id AS seller_id,
          u.username AS seller_username,
          u.avatar AS seller_avatar,
          u.hide_avatar_in_market AS seller_hide_avatar_in_market,
          u.rating AS seller_rating
        FROM products p
        JOIN users u ON u.id = p.seller_id
        WHERE p.seller_id = ?
          AND p.deleted_at IS NULL
        ORDER BY p.created_at DESC
      `
      )
      .all(targetUserId);

    const purchaseRows = db
      .prepare(
        `
      SELECT o.*
      FROM orders o
      WHERE o.buyer_id = ?
        AND NOT EXISTS (
          SELECT 1
          FROM hidden_orders ho
          WHERE ho.user_id = ?
            AND ho.order_id = o.id
        )
      ORDER BY o.created_at DESC
    `
      )
      .all(targetUserId, targetUserId)
      .map((row) => buildOrderPayload(row, null, targetUserId));

    const salesRows = db
      .prepare(
        `
        SELECT DISTINCT o.*
        FROM orders o
        JOIN order_items oi ON oi.order_id = o.id
        WHERE oi.seller_id = ?
          AND NOT EXISTS (
            SELECT 1
            FROM hidden_orders ho
            WHERE ho.user_id = ?
              AND ho.order_id = o.id
          )
        ORDER BY o.created_at DESC
      `
      )
      .all(targetUserId, targetUserId)
      .map((row) => buildOrderPayload(row, targetUserId));

    const transactions = db
      .prepare(
        `
      SELECT t.*
      FROM transactions t
      WHERE (t.from_user_id = ? OR t.to_user_id = ?)
        AND NOT EXISTS (
          SELECT 1
          FROM hidden_transactions ht
          WHERE ht.user_id = ?
            AND ht.transaction_id = t.id
        )
      ORDER BY t.created_at DESC
      LIMIT 80
    `
      )
      .all(targetUserId, targetUserId, targetUserId)
      .map((row) => ({
        id: row.id,
        type: row.type,
        amount: Number(row.amount),
        metadata: decryptText(row.metadata || ""),
        fromUserId: row.from_user_id,
        toUserId: row.to_user_id,
        orderId: row.order_id,
        createdAt: row.created_at,
      }));

    res.json({
      user: await rowToUserWithBank(targetUser),
      dashboardTarget: {
        id: targetUser.id,
        username: targetUser.username,
        role: normalizeRole(targetUser.role),
        self: targetUser.id === viewerUser.id,
      },
      viewerRole,
      listings: listingRows.map(rowToProduct),
      purchases: purchaseRows,
      sales: salesRows,
      transactions,
    });
  })
);

app.get(
  "/api/pickup-points/my",
  requireAuth,
  asyncHandler(async (req, res) => {
    const authUser = getAuthUserOrThrow(req);
    requireRoles(authUser, [ROLES.ADMIN, ROLES.SELLER], "Only sellers and admins can manage pickup points.");
    res.json({ pickupPoints: fetchSellerPickupPoints(authUser.id, { activeOnly: false }) });
  })
);

app.post(
  "/api/pickup-points",
  requireAuth,
  asyncHandler(async (req, res) => {
    const authUser = getAuthUserOrThrow(req);
    requireRoles(authUser, [ROLES.ADMIN, ROLES.SELLER], "Only sellers and admins can manage pickup points.");
    const payload = normalizePickupPointPayload(req.body, { partial: false });
    const ts = nowIso();
    const id = randomUUID();
    db.prepare(
      `
      INSERT INTO pickup_points (id, seller_id, name, address, city, details, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    ).run(
      id,
      authUser.id,
      payload.name,
      payload.address,
      payload.city || "",
      payload.details || "",
      payload.isActive,
      ts,
      ts
    );
    notifyUsers("profile_changed", [authUser.id]);
    notifyCartChangedForSeller(authUser.id);
    const point = db
      .prepare(
        `
        SELECT pp.*, u.username AS seller_username
        FROM pickup_points pp
        JOIN users u ON u.id = pp.seller_id
        WHERE pp.id = ?
        LIMIT 1
      `
      )
      .get(id);
    res.status(201).json({ pickupPoint: rowToPickupPoint(point), pickupPoints: fetchSellerPickupPoints(authUser.id, { activeOnly: false }) });
  })
);

app.patch(
  "/api/pickup-points/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const authUser = getAuthUserOrThrow(req);
    requireRoles(authUser, [ROLES.ADMIN, ROLES.SELLER], "Only sellers and admins can manage pickup points.");

    const pointId = cleanText(req.params.id, 80);
    const current = db.prepare("SELECT * FROM pickup_points WHERE id = ? LIMIT 1").get(pointId);
    if (!current) {
      throw new AppError("Пункт выдачи не найден.", 404);
    }
    if (normalizeRole(authUser.role) !== ROLES.ADMIN && current.seller_id !== authUser.id) {
      throw new AppError("Нет доступа к этому пункту выдачи.", 403);
    }

    const payload = normalizePickupPointPayload(req.body, { partial: true });
    const nextName = payload.name !== undefined ? payload.name : current.name;
    const nextAddress = payload.address !== undefined ? payload.address : current.address;
    const nextCity = payload.city !== undefined ? payload.city : current.city;
    const nextDetails = payload.details !== undefined ? payload.details : current.details;
    const nextIsActive = payload.isActive !== undefined ? payload.isActive : current.is_active;
    const ts = nowIso();

    db.prepare(
      `
      UPDATE pickup_points
      SET name = ?, address = ?, city = ?, details = ?, is_active = ?, updated_at = ?
      WHERE id = ?
    `
    ).run(nextName, nextAddress, nextCity || "", nextDetails || "", nextIsActive, ts, current.id);

    notifyUsers("profile_changed", [current.seller_id]);
    notifyCartChangedForSeller(current.seller_id);
    const updated = db
      .prepare(
        `
        SELECT pp.*, u.username AS seller_username
        FROM pickup_points pp
        JOIN users u ON u.id = pp.seller_id
        WHERE pp.id = ?
        LIMIT 1
      `
      )
      .get(current.id);
    res.json({
      pickupPoint: rowToPickupPoint(updated),
      pickupPoints: fetchSellerPickupPoints(current.seller_id, { activeOnly: false }),
    });
  })
);

app.delete(
  "/api/pickup-points/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const authUser = getAuthUserOrThrow(req);
    requireRoles(authUser, [ROLES.ADMIN, ROLES.SELLER], "Only sellers and admins can manage pickup points.");

    const pointId = cleanText(req.params.id, 80);
    const current = db.prepare("SELECT * FROM pickup_points WHERE id = ? LIMIT 1").get(pointId);
    if (!current) {
      throw new AppError("Пункт выдачи не найден.", 404);
    }
    if (normalizeRole(authUser.role) !== ROLES.ADMIN && current.seller_id !== authUser.id) {
      throw new AppError("Нет доступа к этому пункту выдачи.", 403);
    }

    db.prepare("DELETE FROM pickup_points WHERE id = ?").run(current.id);
    notifyUsers("profile_changed", [current.seller_id]);
    notifyCartChangedForSeller(current.seller_id);
    res.json({ ok: true, pickupPoints: fetchSellerPickupPoints(current.seller_id, { activeOnly: false }) });
  })
);

app.get(
  "/api/products",
  asyncHandler(async (req, res) => {
    const q = cleanText(req.query.q, 60);
    const category = cleanText(req.query.category, 30);
    const condition = cleanText(req.query.condition, 20);
    const rarity = cleanText(req.query.rarity, 20);
    const min = toNonNegativeInt(req.query.min, 0);
    const max = toNonNegativeInt(req.query.max, 1000000);
    const sort = cleanText(req.query.sort, 20) || "newest";
    const page = Math.max(toPositiveInt(req.query.page, 1), 1);
    const pageSize = Math.min(Math.max(toPositiveInt(req.query.pageSize, 12), 1), 48);

    const where = ["p.deleted_at IS NULL", "p.is_listed = 1", "p.stock > 0", "p.price BETWEEN ? AND ?", "u.bank_username IS NOT NULL"];
    const params = [min, max];

    if (q) {
      where.push("(LOWER(p.title) LIKE ? OR LOWER(p.description) LIKE ?)");
      params.push(`%${q.toLowerCase()}%`, `%${q.toLowerCase()}%`);
    }
    if (category && category !== "All") {
      where.push("p.category = ?");
      params.push(category);
    }
    if (condition && condition !== "All") {
      where.push("p.condition = ?");
      params.push(condition);
    }
    if (rarity && rarity !== "All") {
      where.push("p.rarity = ?");
      params.push(rarity);
    }

    const orderByMap = {
      newest: "p.created_at DESC",
      priceAsc: "p.price ASC",
      priceDesc: "p.price DESC",
      stockDesc: "p.stock DESC",
    };
    const orderBy = orderByMap[sort] || orderByMap.newest;

    const totalRow = db
      .prepare(
        `
      SELECT COUNT(*) AS total
      FROM products p
      JOIN users u ON u.id = p.seller_id
      WHERE ${where.join(" AND ")}
    `
      )
      .get(...params);

    const rows = db
      .prepare(
        `
      SELECT
        p.*,
        u.id AS seller_id,
        u.username AS seller_username,
        u.avatar AS seller_avatar,
        u.hide_avatar_in_market AS seller_hide_avatar_in_market,
        u.rating AS seller_rating
      FROM products p
      JOIN users u ON u.id = p.seller_id
      WHERE ${where.join(" AND ")}
      ORDER BY ${orderBy}
      LIMIT ? OFFSET ?
    `
      )
      .all(...params, pageSize, (page - 1) * pageSize);

    const total = Number(totalRow.total || 0);

    res.json({
      products: rows.map(rowToProduct),
      pagination: {
        page,
        pageSize,
        total,
        pages: Math.max(1, Math.ceil(total / pageSize)),
      },
      facets: {
        categories: ALLOWED_CATEGORIES,
        conditions: ALLOWED_CONDITIONS,
        rarities: ALLOWED_RARITIES,
      },
    });
  })
);

app.get(
  "/api/products/:id/reviews",
  asyncHandler(async (req, res) => {
    const productId = cleanText(req.params.id, 80);
    const limit = Math.min(Math.max(toPositiveInt(req.query.limit, 30), 1), 100);

    const product = db.prepare("SELECT id FROM products WHERE id = ? AND deleted_at IS NULL LIMIT 1").get(productId);
    if (!product) {
      throw new AppError("Product not found.", 404);
    }

    const stats = db
      .prepare(
        `
      SELECT COUNT(*) AS total, AVG(stars) AS avg_stars
      FROM seller_reviews
      WHERE product_id = ?
    `
      )
      .get(productId);

    const rows = db
      .prepare(
        `
      SELECT
        r.id,
        r.stars,
        r.comment,
        r.image,
        r.created_at,
        b.id AS buyer_id,
        b.username AS buyer_username,
        b.avatar AS buyer_avatar
      FROM seller_reviews r
      JOIN users b ON b.id = r.buyer_id
      WHERE r.product_id = ?
      ORDER BY r.created_at DESC
      LIMIT ?
    `
      )
      .all(productId, limit);

    res.json({
      summary: {
        total: Number(stats?.total || 0),
        avgStars: Number(stats?.avg_stars || 0),
      },
      reviews: rows.map((row) => ({
        id: row.id,
        stars: Number(row.stars || 0),
        comment: decryptText(row.comment || ""),
        image: row.image || "",
        createdAt: row.created_at,
        buyer: {
          id: row.buyer_id,
          username: row.buyer_username,
          avatar: row.buyer_avatar || "",
        },
      })),
    });
  })
);

app.get(
  "/api/products/:id",
  asyncHandler(async (req, res) => {
    const product = getProductById(req.params.id);
    if (!product) {
      throw new AppError("Product not found.", 404);
    }

    res.json({ product: rowToProduct(product) });
  })
);

app.post(
  "/api/products",
  requireAuth,
  asyncHandler(async (req, res) => {
    const authUser = getAuthUserOrThrow(req);
    requireRoles(authUser, [ROLES.ADMIN, ROLES.SELLER], "Only sellers and admins can create listings.");
    if (!normalizeMbUsername(authUser.bank_username)) {
      throw new AppError("Для продажи привяжите MB Банк в профиле.", 403);
    }

    const title = cleanText(req.body.title, 80);
    const description = cleanText(req.body.description, 500);
    const image = cleanImageUrl(req.body.image);
    const images = normalizeProductImages(req.body.images, image);
    const category = cleanText(req.body.category, 30);
    const condition = cleanText(req.body.condition, 20);
    const rarity = cleanText(req.body.rarity, 20) || "Common";
    const price = toPositiveInt(req.body.price);
    const stock = toPositiveInt(req.body.stock);

    if (!title || !description || !images.length) {
      throw new AppError("Title, description and image are required.");
    }
    if (!price || !stock) {
      throw new AppError("Price and stock must be positive integers.");
    }
    if (!ALLOWED_CATEGORIES.includes(category)) {
      throw new AppError("Invalid category.");
    }
    if (!ALLOWED_CONDITIONS.includes(condition)) {
      throw new AppError("Invalid condition.");
    }
    if (!ALLOWED_RARITIES.includes(rarity)) {
      throw new AppError("Invalid rarity.");
    }

    const productId = randomUUID();
    const ts = nowIso();

    db.prepare(
      `
      INSERT INTO products (
        id, title, description, price, image, images_json, category, condition, rarity,
        stock, is_listed, seller_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
    `
    ).run(
      productId,
      title,
      description,
      price,
      images[0],
      JSON.stringify(images),
      category,
      condition,
      rarity,
      stock,
      authUser.id,
      ts,
      ts
    );

    notifyAll("catalog_changed");
    notifyUsers("profile_changed", [authUser.id]);
    res.status(201).json({ product: rowToProduct(getProductById(productId)) });
  })
);

app.put(
  "/api/products/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const authUser = getAuthUserOrThrow(req);
    const current = db.prepare("SELECT * FROM products WHERE id = ? AND deleted_at IS NULL").get(req.params.id);
    if (!current) {
      throw new AppError("Product not found.", 404);
    }
    if (!canManageListing(authUser, current)) {
      throw new AppError("Forbidden", 403);
    }

    const existingImages = parseProductImages(current);
    const providedImage = req.body.image !== undefined ? cleanImageUrl(req.body.image) : "";
    let nextImages = existingImages;
    if (req.body.images !== undefined) {
      nextImages = normalizeProductImages(req.body.images, providedImage || existingImages[0] || current.image);
    } else if (req.body.image !== undefined) {
      nextImages = normalizeProductImages([providedImage, ...existingImages], providedImage);
    }

    const next = {
      title: req.body.title !== undefined ? cleanText(req.body.title, 80) : current.title,
      description: req.body.description !== undefined ? cleanText(req.body.description, 500) : current.description,
      image: nextImages[0] || current.image,
      category: req.body.category !== undefined ? cleanText(req.body.category, 30) : current.category,
      condition: req.body.condition !== undefined ? cleanText(req.body.condition, 20) : current.condition,
      rarity: req.body.rarity !== undefined ? cleanText(req.body.rarity, 20) : current.rarity,
      price: req.body.price !== undefined ? toPositiveInt(req.body.price) : Number(current.price),
      stock: req.body.stock !== undefined ? toNonNegativeInt(req.body.stock) : Number(current.stock),
    };

    if (!next.title || !next.description || !next.image || !nextImages.length) {
      throw new AppError("Title, description and image are required.");
    }
    if (!next.price || next.stock === null) {
      throw new AppError("Price must be positive and stock must be >= 0.");
    }
    if (!ALLOWED_CATEGORIES.includes(next.category)) {
      throw new AppError("Invalid category.");
    }
    if (!ALLOWED_CONDITIONS.includes(next.condition)) {
      throw new AppError("Invalid condition.");
    }
    if (!ALLOWED_RARITIES.includes(next.rarity)) {
      throw new AppError("Invalid rarity.");
    }

    db.prepare(
      `
      UPDATE products
      SET title = ?, description = ?, image = ?, category = ?, condition = ?, rarity = ?,
          images_json = ?, price = ?, stock = ?, is_listed = ?, updated_at = ?
      WHERE id = ?
    `
    ).run(
      next.title,
      next.description,
      next.image,
      next.category,
      next.condition,
      next.rarity,
      JSON.stringify(nextImages),
      next.price,
      next.stock,
      boolToInt(next.stock > 0 && current.is_listed),
      nowIso(),
      current.id
    );

    notifyAll("catalog_changed");
    notifyUsers("profile_changed", [current.seller_id, authUser.id]);
    res.json({ product: rowToProduct(getProductById(current.id)) });
  })
);

const deleteProductHandler = asyncHandler(async (req, res) => {
  const authUser = getAuthUserOrThrow(req);
  const current = db.prepare("SELECT * FROM products WHERE id = ? AND deleted_at IS NULL").get(req.params.id);
  if (!current) {
    throw new AppError("Product not found.", 404);
  }
  if (!canManageListing(authUser, current)) {
    throw new AppError("Forbidden", 403);
  }

  const soldRow = db.prepare("SELECT COUNT(*) AS total FROM order_items WHERE product_id = ?").get(current.id);
  const soldCount = Number(soldRow?.total || 0);
  if (soldCount > 0 && Number(current.is_listed) === 1) {
    throw new AppError("Нельзя удалить лот с историей покупок, пока он на продаже. Снимите его с продажи.", 400);
  }

  const cartUsers = db
    .prepare("SELECT DISTINCT user_id FROM cart_items WHERE product_id = ?")
    .all(current.id)
    .map((row) => row.user_id)
    .filter(Boolean);

  const ts = nowIso();
  const removeProduct = db.transaction(() => {
    db.prepare("DELETE FROM cart_items WHERE product_id = ?").run(current.id);
    if (soldCount > 0) {
      db.prepare("UPDATE products SET is_listed = 0, stock = 0, deleted_at = ?, updated_at = ? WHERE id = ?").run(
        ts,
        ts,
        current.id
      );
    } else {
      db.prepare("DELETE FROM products WHERE id = ?").run(current.id);
    }
  });
  removeProduct();

  notifyAll("catalog_changed");
  if (cartUsers.length) {
    notifyUsers("cart_changed", cartUsers);
  }
  notifyUsers("profile_changed", [current.seller_id, authUser.id]);

  res.json({ ok: true, deletedId: current.id });
});

app.delete("/api/products/:id", requireAuth, deleteProductHandler);
app.post("/api/products/:id/delete", requireAuth, deleteProductHandler);

app.patch(
  "/api/products/:id/listing",
  requireAuth,
  asyncHandler(async (req, res) => {
    const authUser = getAuthUserOrThrow(req);
    const current = db.prepare("SELECT * FROM products WHERE id = ? AND deleted_at IS NULL").get(req.params.id);
    if (!current) {
      throw new AppError("Product not found.", 404);
    }
    if (!canManageListing(authUser, current)) {
      throw new AppError("Forbidden", 403);
    }

    const listed = Boolean(req.body.listed) && Number(current.stock) > 0;
    if (listed && !normalizeMbUsername(authUser.bank_username)) {
      throw new AppError("Для продажи привяжите MB Банк в профиле.", 403);
    }
    db.prepare("UPDATE products SET is_listed = ?, updated_at = ? WHERE id = ?").run(boolToInt(listed), nowIso(), current.id);

    notifyAll("catalog_changed");
    notifyUsers("profile_changed", [current.seller_id, authUser.id]);
    res.json({ product: rowToProduct(getProductById(current.id)) });
  })
);

function fetchWishlistIds(userId) {
  return db
    .prepare("SELECT product_id FROM wishlist_items WHERE user_id = ? ORDER BY created_at DESC")
    .all(userId)
    .map((row) => row.product_id)
    .filter(Boolean);
}

function fetchWishlistProducts(userId) {
  const rows = db
    .prepare(
      `
      SELECT
        p.*,
        u.id AS seller_id,
        u.username AS seller_username,
        u.avatar AS seller_avatar,
        u.hide_avatar_in_market AS seller_hide_avatar_in_market,
        u.rating AS seller_rating,
        w.created_at AS wishlist_created_at
      FROM wishlist_items w
      JOIN products p ON p.id = w.product_id
      JOIN users u ON u.id = p.seller_id
      WHERE w.user_id = ?
        AND p.deleted_at IS NULL
      ORDER BY w.created_at DESC
    `
    )
    .all(userId);

  return rows.map((row) => ({
    ...rowToProduct(row),
    wishedAt: row.wishlist_created_at,
  }));
}

app.get(
  "/api/wishlist",
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({ products: fetchWishlistProducts(req.auth.userId) });
  })
);

app.get(
  "/api/wishlist/ids",
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({ ids: fetchWishlistIds(req.auth.userId) });
  })
);

app.post(
  "/api/wishlist",
  requireAuth,
  asyncHandler(async (req, res) => {
    const productId = cleanText(req.body.productId, 60);
    if (!productId) {
      throw new AppError("productId is required.", 400);
    }

    const product = db.prepare("SELECT id FROM products WHERE id = ? AND deleted_at IS NULL LIMIT 1").get(productId);
    if (!product) {
      throw new AppError("Product not found.", 404);
    }

    db.prepare(
      `
      INSERT INTO wishlist_items (id, user_id, product_id, created_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id, product_id) DO NOTHING
    `
    ).run(randomUUID(), req.auth.userId, productId, nowIso());

    notifyUsers("wishlist_changed", [req.auth.userId]);
    res.status(201).json({ ok: true, ids: fetchWishlistIds(req.auth.userId) });
  })
);

app.delete(
  "/api/wishlist/:productId",
  requireAuth,
  asyncHandler(async (req, res) => {
    const productId = cleanText(req.params.productId, 60);
    db.prepare("DELETE FROM wishlist_items WHERE user_id = ? AND product_id = ?").run(req.auth.userId, productId);
    notifyUsers("wishlist_changed", [req.auth.userId]);
    res.json({ ok: true, ids: fetchWishlistIds(req.auth.userId) });
  })
);

function buildCartPickupSellers(items = []) {
  const grouped = new Map();
  for (const item of Array.isArray(items) ? items : []) {
    const sellerId = cleanText(item?.product?.seller?.id, 80);
    if (!sellerId) {
      continue;
    }
    if (!grouped.has(sellerId)) {
      grouped.set(sellerId, {
        sellerId,
        sellerUsername: String(item?.product?.seller?.username || ""),
        points: [],
        itemsCount: 0,
      });
    }
    const group = grouped.get(sellerId);
    group.itemsCount += Number(item?.quantity || 0);
  }

  const sellerIds = Array.from(grouped.keys());
  const bySeller = fetchPickupPointsBySellerIds(sellerIds, { activeOnly: true });
  for (const sellerId of sellerIds) {
    const group = grouped.get(sellerId);
    group.points = bySeller.get(sellerId) || [];
  }
  return Array.from(grouped.values());
}

function notifyCartChangedForSeller(sellerId) {
  const targetSellerId = cleanText(sellerId, 80);
  if (!targetSellerId) {
    return;
  }
  const buyerIds = db
    .prepare(
      `
      SELECT DISTINCT c.user_id
      FROM cart_items c
      JOIN products p ON p.id = c.product_id
      WHERE p.seller_id = ?
    `
    )
    .all(targetSellerId)
    .map((row) => row.user_id)
    .filter(Boolean);
  if (buyerIds.length) {
    notifyUsers("cart_changed", buyerIds);
  }
}

function fetchCart(userId, promoCodeRaw = "", strictPromo = false) {
  const rows = db
    .prepare(
      `
      SELECT
        c.id AS cart_id,
        c.quantity AS cart_quantity,
        p.*,
        u.id AS seller_id,
        u.username AS seller_username,
        u.avatar AS seller_avatar,
        u.hide_avatar_in_market AS seller_hide_avatar_in_market,
        u.rating AS seller_rating
      FROM cart_items c
      JOIN products p ON p.id = c.product_id
      JOIN users u ON u.id = p.seller_id
      WHERE c.user_id = ?
        AND p.deleted_at IS NULL
      ORDER BY c.created_at DESC
    `
    )
    .all(userId);

  const items = rows.map((row) => ({
    id: row.cart_id,
    quantity: Number(row.cart_quantity),
    product: rowToProduct(row),
    lineTotal: Number(row.cart_quantity) * Number(row.price),
    lineDiscount: 0,
    payableLineTotal: Number(row.cart_quantity) * Number(row.price),
  }));

  const total = items.reduce((sum, item) => sum + item.lineTotal, 0);
  const basePickupSellers = buildCartPickupSellers(items);
  const basePayload = {
    items,
    total,
    discountTotal: 0,
    payableTotal: total,
    promoApplied: false,
    promo: null,
    pickupSellers: basePickupSellers,
    pickupRequired: basePickupSellers.length > 0,
    pickupReady: basePickupSellers.every((seller) => Array.isArray(seller.points) && seller.points.length > 0),
  };
  const promoCode = normalizePromoCode(promoCodeRaw, { allowEmpty: true });
  if (!promoCode) {
    return basePayload;
  }

  let promo = null;
  try {
    promo = ensureActivePromoOrThrow(promoCode);
  } catch (err) {
    if (strictPromo) {
      throw err;
    }
    return basePayload;
  }
  let matched = 0;
  let discountTotal = 0;
  const promoProductSet = new Set(promo.applicableProductIds || []);
  const discountedItems = items.map((item) => {
    if (!promoProductSet.has(item.product?.id)) {
      return item;
    }
    matched += 1;
    const lineDiscount = calculateLineDiscount(item.lineTotal, promo.percent);
    discountTotal += lineDiscount;
    return {
      ...item,
      lineDiscount,
      payableLineTotal: Math.max(0, item.lineTotal - lineDiscount),
    };
  });

  if (matched <= 0) {
    if (strictPromo) {
      throw new AppError("Промокод не подходит к товарам в корзине.", 400);
    }
    return basePayload;
  }

  const discountedPickupSellers = buildCartPickupSellers(discountedItems);
  return {
    items: discountedItems,
    total,
    discountTotal,
    payableTotal: Math.max(0, total - discountTotal),
    promoApplied: true,
    promo: {
      id: promo.id,
      code: promo.code,
      percent: promo.percent,
      productId: promo.productId,
      productTitle: promo.productTitle,
      productIds: promo.productIds || [],
      products: promo.products || [],
    },
    pickupSellers: discountedPickupSellers,
    pickupRequired: discountedItems.length > 0,
    pickupReady: discountedPickupSellers.every((seller) => Array.isArray(seller.points) && seller.points.length > 0),
  };
}

app.get(
  "/api/cart",
  requireAuth,
  asyncHandler(async (req, res) => {
    const promoCode = cleanText(req.query.promoCode, 64);
    res.json(fetchCart(req.auth.userId, promoCode, false));
  })
);

app.post(
  "/api/cart/promo/preview",
  requireAuth,
  asyncHandler(async (req, res) => {
    const code = normalizePromoCode(req.body.code, { allowEmpty: false });
    res.json(fetchCart(req.auth.userId, code, true));
  })
);

app.post(
  "/api/cart/items",
  requireAuth,
  asyncHandler(async (req, res) => {
    const productId = cleanText(req.body.productId, 60);
    const quantity = toPositiveInt(req.body.quantity, 1);

    const product = db.prepare("SELECT * FROM products WHERE id = ? AND deleted_at IS NULL").get(productId);
    if (!product) {
      throw new AppError("Product not found.", 404);
    }
    if (!product.is_listed || Number(product.stock) <= 0) {
      throw new AppError("Product is not available.");
    }
    if (product.seller_id === req.auth.userId) {
      throw new AppError("You cannot buy your own item.");
    }
    const seller = db.prepare("SELECT username, bank_username FROM users WHERE id = ?").get(product.seller_id);
    if (!seller || !normalizeMbUsername(seller.bank_username)) {
      throw new AppError("Продавец не привязал MB Банк. Покупка недоступна.", 409);
    }

    const existing = db
      .prepare("SELECT * FROM cart_items WHERE user_id = ? AND product_id = ?")
      .get(req.auth.userId, productId);

    if (existing) {
      const nextQty = Math.min(Number(existing.quantity) + quantity, Number(product.stock));
      db.prepare("UPDATE cart_items SET quantity = ?, updated_at = ? WHERE id = ?").run(nextQty, nowIso(), existing.id);
    } else {
      db.prepare(
        "INSERT INTO cart_items (id, user_id, product_id, quantity, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
      ).run(randomUUID(), req.auth.userId, productId, Math.min(quantity, Number(product.stock)), nowIso(), nowIso());
    }

    notifyUsers("cart_changed", [req.auth.userId]);
    res.status(201).json(fetchCart(req.auth.userId));
  })
);

app.patch(
  "/api/cart/items/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const quantity = toPositiveInt(req.body.quantity);
    if (!quantity) {
      throw new AppError("Quantity must be a positive integer.");
    }

    const item = db
      .prepare(
        `
      SELECT c.*, p.stock
      FROM cart_items c
      JOIN products p ON p.id = c.product_id
      WHERE c.id = ?
        AND p.deleted_at IS NULL
    `
      )
      .get(req.params.id);

    if (!item || item.user_id !== req.auth.userId) {
      throw new AppError("Cart item not found.", 404);
    }

    const nextQty = Math.min(quantity, Number(item.stock));
    db.prepare("UPDATE cart_items SET quantity = ?, updated_at = ? WHERE id = ?").run(nextQty, nowIso(), item.id);

    notifyUsers("cart_changed", [req.auth.userId]);
    res.json({ ok: true });
  })
);

app.delete(
  "/api/cart/items/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const item = db.prepare("SELECT * FROM cart_items WHERE id = ?").get(req.params.id);
    if (!item || item.user_id !== req.auth.userId) {
      throw new AppError("Cart item not found.", 404);
    }

    db.prepare("DELETE FROM cart_items WHERE id = ?").run(item.id);
    notifyUsers("cart_changed", [req.auth.userId]);
    res.json({ ok: true });
  })
);

function normalizeCheckoutQrToken(rawValue) {
  const raw = cleanText(rawValue, 200);
  if (!raw) {
    return "";
  }
  if (raw.startsWith(CHECKOUT_QR_PREFIX)) {
    return cleanText(raw.slice(CHECKOUT_QR_PREFIX.length), 120);
  }
  return cleanText(raw, 120);
}

function parseCheckoutQrPickupMap(rawValue) {
  const parsed = parseJsonIfPossible(rawValue);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {};
  }
  const out = {};
  for (const [sellerIdRaw, pointIdRaw] of Object.entries(parsed)) {
    const sellerId = cleanText(sellerIdRaw, 80);
    const pointId = cleanText(pointIdRaw, 80);
    if (!sellerId || !pointId) {
      continue;
    }
    out[sellerId] = pointId;
  }
  return out;
}

function cleanupExpiredCheckoutQrSessions() {
  db.prepare(
    `
      DELETE FROM checkout_qr_sessions
      WHERE status = 'pending'
        AND expires_at <= ?
    `
  ).run(nowIso());
}

async function createCheckoutQrSession(userId, promoCodeRaw = "", pickupBySellerRaw = {}) {
  const buyer = getUserById(userId);
  if (!buyer) {
    throw new AppError("Buyer not found.", 404);
  }

  const buyerBankUsername = normalizeMbUsername(buyer.bank_username) || "";

  const promoCode = normalizePromoCode(promoCodeRaw, { allowEmpty: true });
  const cart = fetchCart(userId, promoCode, true);
  if (!Array.isArray(cart.items) || !cart.items.length) {
    throw new AppError("Cart is empty.");
  }

  const pickupMap = normalizeCheckoutPickupSelections(pickupBySellerRaw);
  const pickupSellers = Array.isArray(cart.pickupSellers) ? cart.pickupSellers : [];
  for (const seller of pickupSellers) {
    const sellerId = cleanText(seller?.sellerId, 80);
    const sellerName = cleanText(seller?.sellerUsername, 40) || "без имени";
    const points = Array.isArray(seller?.points) ? seller.points : [];
    if (!sellerId) {
      continue;
    }
    if (!points.length) {
      throw new AppError(`У продавца ${sellerName} нет активного пункта выдачи.`, 409);
    }
    const selectedPointId = pickupMap.get(sellerId);
    if (!selectedPointId) {
      throw new AppError(`Выберите пункт выдачи для продавца ${sellerName}.`, 400);
    }
    const selectedPoint = points.find((point) => cleanText(point?.id, 80) === selectedPointId);
    if (!selectedPoint) {
      throw new AppError(`Выбранный пункт выдачи продавца ${sellerName} недоступен.`, 400);
    }
  }

  const pickupToStore = {};
  for (const [sellerId, pointId] of pickupMap.entries()) {
    pickupToStore[sellerId] = pointId;
  }

  const expectedTotal = Math.max(0, Number(cart.payableTotal ?? cart.total ?? 0) || 0);
  const sessionId = randomUUID();
  const createdAt = nowIso();
  const expiresAt = new Date(Date.now() + CHECKOUT_QR_SESSION_TTL_MS).toISOString();
  const qrPayload = `${CHECKOUT_QR_PREFIX}${sessionId}`;
  const qrDataUrl = await QRCode.toDataURL(qrPayload, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 280,
  });

  cleanupExpiredCheckoutQrSessions();
  db.prepare(
    `
      INSERT INTO checkout_qr_sessions (
        id,
        buyer_id,
        buyer_bank_username,
        promo_code,
        pickup_by_seller_json,
        expected_total,
        status,
        order_id,
        last_error,
        created_at,
        expires_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'pending', NULL, '', ?, ?, ?)
    `
  ).run(
    sessionId,
    userId,
    buyerBankUsername,
    promoCode,
    JSON.stringify(pickupToStore),
    Math.round(expectedTotal),
    createdAt,
    expiresAt,
    createdAt
  );

  return {
    qrToken: sessionId,
    qrPayload,
    qrDataUrl,
    expectedTotal: Math.round(expectedTotal),
    promoCode: promoCode || "",
    createdAt,
    expiresAt,
  };
}

function normalizeCheckoutPickupSelections(rawValue) {
  const out = new Map();
  if (!rawValue || typeof rawValue !== "object" || Array.isArray(rawValue)) {
    return out;
  }
  for (const [sellerIdRaw, pointIdRaw] of Object.entries(rawValue)) {
    const sellerId = cleanText(sellerIdRaw, 80);
    const pointId = cleanText(pointIdRaw, 80);
    if (!sellerId || !pointId) {
      continue;
    }
    out.set(sellerId, pointId);
  }
  return out;
}

async function settleCheckoutViaMbBank(
  buyerUsername,
  sellerPayoutsByBankUsername,
  orderRef,
  paymentOptions = {
    method: "linked",
    cardId: "",
    password: "",
  }
) {
  const normalizedBuyerUsername = normalizeMbUsername(buyerUsername);
  const payouts = Array.from(sellerPayoutsByBankUsername.entries())
    .map(([toUsername, amount]) => ({
      toUsername,
      amount: Number(amount),
    }))
    .filter((item) => Number.isFinite(item.amount) && item.amount > 0);
  if (!payouts.length) {
    return { ok: true, skipped: true, reason: "ZERO_TOTAL", balances: null };
  }
  try {
    const method = String(paymentOptions?.method || "linked")
      .trim()
      .toLowerCase();
    if (method === "card_auth") {
      return await mbBankPost({
        action: "mdm_checkout_card_auth",
        secret: MB_BANK_BRIDGE_SECRET,
        buyerCardId: cleanText(paymentOptions?.cardId, 32),
        buyerPassword: String(paymentOptions?.password || ""),
        payouts,
        orderRef: String(orderRef || ""),
      });
    }

    if (!normalizedBuyerUsername) {
      throw new AppError("Для оплаты по привязанной карте сначала привяжите MB Банк в профиле.", 403);
    }

    return await mbBankPost({
      action: "mdm_checkout",
      secret: MB_BANK_BRIDGE_SECRET,
      buyerUsername: normalizedBuyerUsername,
      payouts,
      orderRef: String(orderRef || ""),
    });
  } catch (err) {
    throw mapMbError(err, "Не удалось провести оплату через MB Банк.");
  }
}

async function checkoutTransaction(userId, promoCodeRaw = "", pickupBySellerRaw = {}, options = {}) {
  db.prepare("BEGIN IMMEDIATE").run();

  try {
    const checkoutSource = String(options?.source || "DIRECT")
      .trim()
      .toUpperCase();
    const paymentMethod = String(options?.paymentMethod || "linked")
      .trim()
      .toLowerCase();
    const sourceLabel =
      checkoutSource === "QR" ? "QR" : paymentMethod === "card_auth" ? "CARD_AUTH" : "LINKED";
    const buyer = getUserById(userId);
    if (!buyer) {
      throw new AppError("Buyer not found.", 404);
    }

    const buyerLinkedBankUsername = normalizeMbUsername(buyer.bank_username);
    const buyerQrBankUsername = normalizeMbUsername(options?.mbBuyerUsername);
    if (paymentMethod !== "linked" && paymentMethod !== "card_auth" && paymentMethod !== "qr_auth") {
      throw new AppError("Invalid payment method.", 400);
    }
    if (paymentMethod === "linked" && !buyerLinkedBankUsername) {
      throw new AppError("Для покупки привяжите MB Банк в профиле.", 403);
    }
    if (paymentMethod === "qr_auth" && !buyerQrBankUsername) {
      throw new AppError("QR платеж не содержит покупателя MB Банка.", 400);
    }
    if (paymentMethod === "card_auth") {
      const buyerCardId = cleanText(options?.mbCardId, 32);
      const buyerPassword = String(options?.mbPassword || "");
      if (!buyerCardId || !buyerPassword) {
        throw new AppError("Введите ID карты и пароль MB Банка.", 400);
      }
    }

    const cartRows = db
      .prepare(
        `
      SELECT c.id, c.quantity, p.*
      FROM cart_items c
      JOIN products p ON p.id = c.product_id
      WHERE c.user_id = ?
    `
      )
      .all(userId);

    if (!cartRows.length) {
      throw new AppError("Cart is empty.");
    }

    const promoCode = normalizePromoCode(promoCodeRaw, { allowEmpty: true });
    const promo = promoCode ? ensureActivePromoOrThrow(promoCode) : null;
    const promoProductSet = new Set(promo?.applicableProductIds || []);

    let subtotal = 0;
    let discountTotal = 0;
    let total = 0;
    let matchedPromoItems = 0;
    const sellerCredits = new Map();
    const prepared = [];

    for (const row of cartRows) {
      if (!row.is_listed || Number(row.stock) <= 0) {
        throw new AppError(`${row.title} is out of stock.`);
      }
      if (row.seller_id === userId) {
        throw new AppError("Cannot buy your own item.");
      }
      if (Number(row.quantity) > Number(row.stock)) {
        throw new AppError(`${row.title} does not have enough stock.`);
      }

      const lineTotal = Number(row.price) * Number(row.quantity);
      const isPromoMatch = Boolean(promoProductSet.has(row.id));
      if (isPromoMatch) {
        matchedPromoItems += 1;
      }
      const lineDiscount = isPromoMatch ? calculateLineDiscount(lineTotal, promo.percent) : 0;
      const payableLineTotal = Math.max(0, lineTotal - lineDiscount);

      subtotal += lineTotal;
      discountTotal += lineDiscount;
      total += payableLineTotal;
      if (payableLineTotal > 0) {
        sellerCredits.set(row.seller_id, (sellerCredits.get(row.seller_id) || 0) + payableLineTotal);
      }

      prepared.push({
        productId: row.id,
        sellerId: row.seller_id,
        quantity: Number(row.quantity),
        title: row.title,
        image: row.image,
        price: Number(row.price),
        currentStock: Number(row.stock),
        lineTotal,
        lineDiscount,
        payableLineTotal,
      });
    }

    if (promoCode && matchedPromoItems <= 0) {
      throw new AppError("Промокод не подходит к товарам в корзине.", 400);
    }

    const selectedPickupBySeller = normalizeCheckoutPickupSelections(pickupBySellerRaw);
    const orderSellerIds = Array.from(new Set(prepared.map((item) => item.sellerId).filter(Boolean)));
    const pickupOptionsBySeller = fetchPickupPointsBySellerIds(orderSellerIds, { activeOnly: true });
    const sellerPickupPointBySellerId = new Map();

    for (const sellerId of orderSellerIds) {
      const seller = getUserById(sellerId);
      if (!seller) {
        throw new AppError("Seller not found.", 404);
      }
      const sellerPoints = pickupOptionsBySeller.get(sellerId) || [];
      if (!sellerPoints.length) {
        throw new AppError(`У продавца ${seller.username} нет активного пункта выдачи.`, 409);
      }
      const selectedPointId = selectedPickupBySeller.get(sellerId);
      if (!selectedPointId) {
        throw new AppError(`Выберите пункт выдачи для продавца ${seller.username}.`, 400);
      }
      const selectedPoint = sellerPoints.find((point) => point.id === selectedPointId);
      if (!selectedPoint) {
        throw new AppError(`Выбранный пункт выдачи продавца ${seller.username} недоступен.`, 400);
      }
      sellerPickupPointBySellerId.set(sellerId, selectedPoint);
    }

    const sellerPayoutsByBankUsername = new Map();
    const sellerBankByUserId = new Map();
    for (const [sellerId, amount] of sellerCredits.entries()) {
      const seller = getUserById(sellerId);
      if (!seller) {
        throw new AppError("Seller not found.", 404);
      }
      const sellerBankUsername = normalizeMbUsername(seller.bank_username);
      if (!sellerBankUsername) {
        throw new AppError(`Продавец ${seller.username} не привязал MB Банк.`, 409);
      }
      sellerPayoutsByBankUsername.set(
        sellerBankUsername,
        (sellerPayoutsByBankUsername.get(sellerBankUsername) || 0) + Number(amount)
      );
      sellerBankByUserId.set(sellerId, sellerBankUsername);
    }

    const orderId = randomUUID();
    const settlementMethod = paymentMethod === "card_auth" ? "card_auth" : "linked";
    const settlementBuyerUsername =
      paymentMethod === "linked"
        ? buyerLinkedBankUsername
        : paymentMethod === "qr_auth"
          ? buyerQrBankUsername
          : buyerLinkedBankUsername;
    const bankSettlement =
      total > 0
        ? await settleCheckoutViaMbBank(settlementBuyerUsername, sellerPayoutsByBankUsername, orderId, {
            method: settlementMethod,
            cardId: cleanText(options?.mbCardId, 32),
            password: String(options?.mbPassword || ""),
          })
        : null;
    const balancesFromBank = bankSettlement && typeof bankSettlement.balances === "object" ? bankSettlement.balances : null;
    const settlementBuyerUsernameFromBank = normalizeMbUsername(bankSettlement?.buyerUsername);
    const buyerBalanceLookupUsername = settlementBuyerUsername || settlementBuyerUsernameFromBank;

    const ts = nowIso();
    const buyerBalanceCents = buyerBalanceLookupUsername && balancesFromBank ? Number(balancesFromBank[buyerBalanceLookupUsername]) : NaN;
    if (Number.isFinite(buyerBalanceCents)) {
      db.prepare("UPDATE users SET balance = ?, updated_at = ? WHERE id = ?").run(Math.round(buyerBalanceCents / 100), ts, userId);
    } else {
      db.prepare("UPDATE users SET balance = balance - ?, updated_at = ? WHERE id = ?").run(total, ts, userId);
    }

    for (const [sellerId, amount] of sellerCredits.entries()) {
      const sellerBankUsername = sellerBankByUserId.get(sellerId);
      const sellerBalanceCents = sellerBankUsername && balancesFromBank ? Number(balancesFromBank[sellerBankUsername]) : NaN;
      if (Number.isFinite(sellerBalanceCents)) {
        db.prepare("UPDATE users SET balance = ?, updated_at = ? WHERE id = ?").run(
          Math.round(sellerBalanceCents / 100),
          ts,
          sellerId
        );
      } else {
        db.prepare("UPDATE users SET balance = balance + ?, updated_at = ? WHERE id = ?").run(amount, ts, sellerId);
      }
    }

    db.prepare("INSERT INTO orders (id, buyer_id, total, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)").run(
      orderId,
      userId,
      total,
      ORDER_STATUS.PAID,
      ts,
      ts
    );

    for (const item of prepared) {
      const pickupPoint = sellerPickupPointBySellerId.get(item.sellerId) || null;
      db.prepare(
        `
      INSERT INTO order_items (
        id, order_id, product_id, seller_id, title_snapshot,
        image_snapshot, price_snapshot, quantity,
        pickup_point_id, pickup_point_name, pickup_point_address, pickup_point_city, pickup_point_details,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
      ).run(
        randomUUID(),
        orderId,
        item.productId,
        item.sellerId,
        item.title,
        item.image,
        item.price,
        item.quantity,
        pickupPoint?.id || "",
        pickupPoint?.name || "",
        pickupPoint?.address || "",
        pickupPoint?.city || "",
        pickupPoint?.details || "",
        ts
      );

      const newStock = item.currentStock - item.quantity;
      db.prepare("UPDATE products SET stock = ?, is_listed = ?, updated_at = ? WHERE id = ?").run(
        newStock,
        boolToInt(newStock > 0),
        ts,
        item.productId
      );
    }

    db.prepare(
      "INSERT INTO transactions (id, type, amount, metadata, from_user_id, to_user_id, order_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(
      randomUUID(),
      "PURCHASE_DEBIT",
      total,
      encryptText(
        promo
          ? `Buyer checkout via MB Bank [${sourceLabel}] | promo ${promo.code} (${promo.percent}%), discount ${discountTotal}, subtotal ${subtotal}`
          : `Buyer checkout via MB Bank [${sourceLabel}]`
      ),
      userId,
      null,
      orderId,
      ts
    );

    for (const [sellerId, amount] of sellerCredits.entries()) {
      db.prepare(
        "INSERT INTO transactions (id, type, amount, metadata, from_user_id, to_user_id, order_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
      ).run(
        randomUUID(),
        "SALE_CREDIT",
        amount,
        encryptText(promo ? `Seller payout via MB Bank [${sourceLabel}] (promo ${promo.code})` : `Seller payout via MB Bank [${sourceLabel}]`),
        null,
        sellerId,
        orderId,
        ts
      );
    }

    db.prepare("DELETE FROM cart_items WHERE user_id = ?").run(userId);
    db.prepare("COMMIT").run();

    const orderRow = db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId);
    return buildOrderPayload(orderRow, null, userId);
  } catch (err) {
    if (db.inTransaction) {
      try {
        db.prepare("ROLLBACK").run();
      } catch (_rollbackErr) {
        // noop
      }
    }
    throw err;
  }
}

function notifyCheckoutCompleted(order, buyerUserId, promoCode = "") {
  const sellerIds = db
    .prepare("SELECT DISTINCT seller_id FROM order_items WHERE order_id = ?")
    .all(order.id)
    .map((row) => row.seller_id);
  const affectedUsers = [buyerUserId, ...sellerIds];

  notifyAll("catalog_changed");
  notifyUsers("orders_changed", affectedUsers);
  notifyUsers("balance_changed", affectedUsers);
  notifyUsers("profile_changed", sellerIds);
  notifyUsers("cart_changed", [buyerUserId]);
  notifyTelegramByUserIds(
    [buyerUserId],
    `MDM: заказ создан\n#${String(order.id || "").slice(0, 8)} • ${Number(order.total || 0)} ₽`
  );
  notifyTelegramByUserIds(
    sellerIds,
    `MDM: у вас новая продажа\nЗаказ #${String(order.id || "").slice(0, 8)}`
  );

  return {
    affectedUsers,
    sellerIds,
    appliedPromoCode: promoCode ? normalizePromoCode(promoCode, { allowEmpty: true }) : "",
  };
}

app.post(
  "/api/cart/checkout",
  requireAuth,
  asyncHandler(async (req, res) => {
    const promoCode = cleanText(req.body.promoCode, 64);
    const paymentMethod = cleanText(req.body?.paymentMethod, 32).toLowerCase() || "linked";
    const mbCardId = cleanText(req.body?.mbCardId, 32);
    const mbPassword = String(req.body?.mbPassword || "");
    const pickupBySeller =
      req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body.pickupBySeller || {} : {};
    const order = await checkoutTransaction(req.auth.userId, promoCode, pickupBySeller, {
      source: "DIRECT",
      paymentMethod,
      mbCardId,
      mbPassword,
    });
    const completed = notifyCheckoutCompleted(order, req.auth.userId, promoCode);

    res.status(201).json({
      order,
      appliedPromoCode: completed.appliedPromoCode,
    });
  })
);

app.post(
  "/api/cart/checkout/qr",
  requireAuth,
  asyncHandler(async (req, res) => {
    const promoCode = cleanText(req.body?.promoCode, 64);
    const pickupBySeller =
      req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body.pickupBySeller || {} : {};
    const session = await createCheckoutQrSession(req.auth.userId, promoCode, pickupBySeller);
    res.status(201).json({
      ...session,
      appliedPromoCode: promoCode ? normalizePromoCode(promoCode, { allowEmpty: true }) : "",
    });
  })
);

app.get(
  "/api/cart/checkout/qr/:token",
  requireAuth,
  asyncHandler(async (req, res) => {
    const qrToken = normalizeCheckoutQrToken(req.params?.token);
    if (!qrToken) {
      throw new AppError("qrToken is required.", 400);
    }

    cleanupExpiredCheckoutQrSessions();
    const session = db.prepare("SELECT * FROM checkout_qr_sessions WHERE id = ? LIMIT 1").get(qrToken);
    if (!session) {
      throw new AppError("QR session not found.", 404);
    }
    if (session.buyer_id !== req.auth.userId) {
      throw new AppError("Access denied for this QR session.", 403);
    }

    let status = String(session.status || "pending")
      .trim()
      .toLowerCase();
    const expiresAtMs = Date.parse(String(session.expires_at || ""));
    if (status === "pending" && Number.isFinite(expiresAtMs) && expiresAtMs <= Date.now()) {
      db.prepare("UPDATE checkout_qr_sessions SET status = 'expired', updated_at = ? WHERE id = ?").run(nowIso(), qrToken);
      status = "expired";
    }

    const order = session.order_id ? db.prepare("SELECT * FROM orders WHERE id = ? LIMIT 1").get(session.order_id) : null;
    res.json({
      qrToken,
      status,
      expiresAt: session.expires_at || null,
      expectedTotal: Number(session.expected_total || 0),
      promoCode: cleanText(session.promo_code, 64),
      lastError: cleanText(session.last_error, 220),
      order: order ? buildOrderPayload(order, null, req.auth.userId) : null,
    });
  })
);

app.patch(
  "/api/orders/:id/status",
  requireAuth,
  asyncHandler(async (req, res) => {
    const authUser = getAuthUserOrThrow(req);
    const authRole = normalizeRole(authUser.role);
    const nextStatus = cleanText(req.body.status, 20);
    if (!ORDER_STATUS_FLOW.includes(nextStatus)) {
      throw new AppError("Invalid order status.");
    }

    const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(req.params.id);
    if (!order) {
      throw new AppError("Order not found.", 404);
    }

    const sellerInOrder = db.prepare("SELECT id FROM order_items WHERE order_id = ? AND seller_id = ? LIMIT 1").get(order.id, req.auth.userId);
    if (authRole !== ROLES.ADMIN && !sellerInOrder) {
      throw new AppError("Only sellers in this order can update status.", 403);
    }

    if (order.status === nextStatus) {
      const updated = db.prepare("SELECT * FROM orders WHERE id = ?").get(order.id);
      res.json({ order: buildOrderPayload(updated, authRole === ROLES.ADMIN ? null : req.auth.userId, null) });
      return;
    }

    const currentIndex = ORDER_STATUS_FLOW.indexOf(order.status);
    const nextIndex = ORDER_STATUS_FLOW.indexOf(nextStatus);
    if (currentIndex !== -1 && nextIndex < currentIndex) {
      throw new AppError("Status cannot move backwards.");
    }

    db.prepare("UPDATE orders SET status = ?, updated_at = ? WHERE id = ?").run(nextStatus, nowIso(), order.id);

    const sellerIds = db
      .prepare("SELECT DISTINCT seller_id FROM order_items WHERE order_id = ?")
      .all(order.id)
      .map((row) => row.seller_id);
    const affectedUsers = [order.buyer_id, ...sellerIds];
    notifyUsers("orders_changed", affectedUsers);
    notifyTelegramByUserIds(
      affectedUsers.filter((id) => id && id !== authUser.id),
      `MDM: обновлен статус заказа\n#${String(order.id || "").slice(0, 8)} → ${nextStatus}`
    );

    const updated = db.prepare("SELECT * FROM orders WHERE id = ?").get(order.id);
    res.json({ order: buildOrderPayload(updated, authRole === ROLES.ADMIN ? null : req.auth.userId, null) });
  })
);

app.get(
  "/api/orders/my",
  requireAuth,
  asyncHandler(async (req, res) => {
    const rows = db
      .prepare(
        `
      SELECT o.*
      FROM orders o
      WHERE o.buyer_id = ?
        AND NOT EXISTS (
          SELECT 1
          FROM hidden_orders ho
          WHERE ho.user_id = ?
            AND ho.order_id = o.id
        )
      ORDER BY o.created_at DESC
    `
      )
      .all(req.auth.userId, req.auth.userId);
    res.json({ orders: rows.map((row) => buildOrderPayload(row, null, req.auth.userId)) });
  })
);

app.get(
  "/api/orders/sales",
  requireAuth,
  asyncHandler(async (req, res) => {
    const authUser = getAuthUserOrThrow(req);
    const role = normalizeRole(authUser.role);
    const rows =
      role === ROLES.ADMIN
        ? db
            .prepare(
              `
        SELECT o.*
        FROM orders o
        WHERE NOT EXISTS (
          SELECT 1
          FROM hidden_orders ho
          WHERE ho.user_id = ?
            AND ho.order_id = o.id
        )
        ORDER BY o.created_at DESC
      `
            )
            .all(req.auth.userId)
        : db
            .prepare(
              `
        SELECT DISTINCT o.*
        FROM orders o
        JOIN order_items oi ON oi.order_id = o.id
        WHERE oi.seller_id = ?
          AND NOT EXISTS (
            SELECT 1
            FROM hidden_orders ho
            WHERE ho.user_id = ?
              AND ho.order_id = o.id
          )
        ORDER BY o.created_at DESC
      `
            )
            .all(req.auth.userId, req.auth.userId);

    res.json({ orders: rows.map((row) => buildOrderPayload(row, role === ROLES.ADMIN ? null : req.auth.userId, null)) });
  })
);

app.get(
  "/api/orders/:id/receipt",
  requireAuth,
  asyncHandler(async (req, res) => {
    const authUser = getAuthUserOrThrow(req);
    const authRole = normalizeRole(authUser.role);
    const orderId = cleanText(req.params.id, 80);
    const order = db.prepare("SELECT * FROM orders WHERE id = ? LIMIT 1").get(orderId);
    if (!order) {
      throw new AppError("Order not found.", 404);
    }

    const isBuyer = order.buyer_id === req.auth.userId;
    const isSeller = isSellerInOrder(order.id, req.auth.userId);
    if (authRole !== ROLES.ADMIN && !isBuyer && !isSeller) {
      throw new AppError("Access denied for this order receipt.", 403);
    }

    const sellerFilter = authRole === ROLES.ADMIN || isBuyer ? null : req.auth.userId;
    res.json({
      receipt: buildOrderReceiptPayload(order, sellerFilter),
    });
  })
);

app.delete(
  "/api/orders/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const authUser = getAuthUserOrThrow(req);
    const authRole = normalizeRole(authUser.role);
    const orderId = cleanText(req.params.id, 80);
    const order = db.prepare("SELECT * FROM orders WHERE id = ? LIMIT 1").get(orderId);
    if (!order) {
      throw new AppError("Order not found.", 404);
    }

    const isBuyer = order.buyer_id === req.auth.userId;
    const isSeller = isSellerInOrder(order.id, req.auth.userId);
    if (authRole !== ROLES.ADMIN && !isBuyer && !isSeller) {
      throw new AppError("You can delete only your own purchase or sale order.", 403);
    }

    const hidden = hideOrdersForUser([order.id], req.auth.userId);
    notifyUsers("orders_changed", [req.auth.userId]);
    notifyUsers("profile_changed", [req.auth.userId]);
    res.json({ ok: true, hidden });
  })
);

app.post(
  "/api/orders/clear",
  requireAuth,
  asyncHandler(async (req, res) => {
    const authUser = getAuthUserOrThrow(req);
    const authRole = normalizeRole(authUser.role);
    const scope = cleanText(req.body.scope, 20) || "all";
    if (!["purchases", "sales", "all"].includes(scope)) {
      throw new AppError("Invalid clear scope.", 400);
    }

    const orderIds = collectOrderIdsByScope(scope, req.auth.userId, authRole);
    const hidden = hideOrdersForUser(orderIds, req.auth.userId);
    notifyUsers("orders_changed", [req.auth.userId]);
    notifyUsers("profile_changed", [req.auth.userId]);
    res.json({ ok: true, scope, hidden, total: orderIds.length });
  })
);

app.post(
  "/api/transactions/clear",
  requireAuth,
  asyncHandler(async (req, res) => {
    const transactionIds = db
      .prepare("SELECT id FROM transactions WHERE from_user_id = ? OR to_user_id = ?")
      .all(req.auth.userId, req.auth.userId)
      .map((row) => row.id);
    const hidden = hideTransactionsForUser(transactionIds, req.auth.userId);

    notifyUsers("profile_changed", [req.auth.userId]);
    res.json({ ok: true, hidden, total: transactionIds.length });
  })
);

app.post(
  "/api/chats/open",
  requireAuth,
  asyncHandler(async (req, res) => {
    const authUser = getAuthUserOrThrow(req);
    const authRole = normalizeRole(authUser.role);
    const orderItemId = cleanText(req.body.orderItemId, 80);
    if (!orderItemId) {
      throw new AppError("orderItemId is required.", 400);
    }

    const orderContext = getOrderItemChatContext(orderItemId);
    if (!orderContext) {
      throw new AppError("Order item not found.", 404);
    }

    const isParticipant = authUser.id === orderContext.buyer_id || authUser.id === orderContext.seller_id;
    if (authRole !== ROLES.ADMIN && !isParticipant) {
      throw new AppError("Only order participants can open this chat.", 403);
    }

    let chat = getChatByOrderItemId(orderItemId);
    let created = false;
    if (!chat) {
      chat = createChatByOrderItemContext(orderContext);
      created = true;
    }

    if (!chat) {
      throw new AppError("Failed to open chat.", 500);
    }

    if (created) {
      notifyUsers("chats_changed", [chat.buyer_id, chat.seller_id], { chatId: chat.id, created: true });
    }

    res.status(created ? 201 : 200).json({ chat: rowToChatSummary(chat, authUser.id), created });
  })
);

app.get(
  "/api/chats",
  requireAuth,
  asyncHandler(async (req, res) => {
    const authUser = getAuthUserOrThrow(req);
    const limit = Math.min(Math.max(toPositiveInt(req.query.limit, 80), 1), 200);
    const rows = listChatsForUser(authUser, limit);
    res.json({ chats: rows.map((row) => rowToChatSummary(row, authUser.id)) });
  })
);

app.get(
  "/api/chats/:id/messages",
  requireAuth,
  asyncHandler(async (req, res) => {
    const authUser = getAuthUserOrThrow(req);
    const chatId = cleanText(req.params.id, 80);
    if (!chatId) {
      throw new AppError("chatId is required.", 400);
    }

    const chat = getChatById(chatId);
    if (!chat) {
      throw new AppError("Chat not found.", 404);
    }
    ensureCanAccessChatOrThrow(chat, authUser);

    const limit = Math.min(Math.max(toPositiveInt(req.query.limit, 200), 1), 500);
    const messages = listChatMessages(chat.id, limit);
    res.json({
      chat: rowToChatSummary(chat, authUser.id),
      messages,
    });
  })
);

app.post(
  "/api/chats/:id/typing",
  requireAuth,
  asyncHandler(async (req, res) => {
    const authUser = getAuthUserOrThrow(req);
    const chatId = cleanText(req.params.id, 80);
    if (!chatId) {
      throw new AppError("chatId is required.", 400);
    }

    const chat = getChatById(chatId);
    if (!chat) {
      throw new AppError("Chat not found.", 404);
    }
    ensureCanAccessChatOrThrow(chat, authUser);

    const typing = toBoolean(req.body?.typing);
    notifyUsers("chat_typing", [chat.buyer_id, chat.seller_id], {
      chatId: chat.id,
      userId: authUser.id,
      typing,
    });

    res.json({ ok: true, chatId: chat.id, userId: authUser.id, typing });
  })
);

app.post(
  "/api/chats/:id/messages",
  requireAuth,
  asyncHandler(async (req, res) => {
    const authUser = getAuthUserOrThrow(req);
    const chatId = cleanText(req.params.id, 80);
    if (!chatId) {
      throw new AppError("chatId is required.", 400);
    }

    const chat = getChatById(chatId);
    if (!chat) {
      throw new AppError("Chat not found.", 404);
    }
    ensureCanAccessChatOrThrow(chat, authUser);

    const text = String(req.body.text || "")
      .slice(0, 2000)
      .trim();
    if (!text) {
      throw new AppError("Message text is required.", 400);
    }

    const ts = nowIso();
    const messageId = randomUUID();
    db.prepare("INSERT INTO chat_messages (id, chat_id, sender_id, text, created_at) VALUES (?, ?, ?, ?, ?)").run(
      messageId,
      chat.id,
      authUser.id,
      encryptText(text),
      ts
    );
    db.prepare("UPDATE chats SET updated_at = ?, last_message_at = ? WHERE id = ?").run(ts, ts, chat.id);

    const messageRow = db
      .prepare(
        `
        SELECT
          cm.*,
          u.username AS sender_username,
          u.avatar AS sender_avatar
        FROM chat_messages cm
        JOIN users u ON u.id = cm.sender_id
        WHERE cm.id = ?
        LIMIT 1
      `
      )
      .get(messageId);

    const messagePayload = rowToChatMessage(messageRow);
    const updatedChat = getChatById(chat.id);
    notifyUsers("chats_changed", [chat.buyer_id, chat.seller_id], {
      chatId: chat.id,
      messageId,
      senderId: authUser.id,
      message: messagePayload,
    });
    notifyUsers("chat_typing", [chat.buyer_id, chat.seller_id], {
      chatId: chat.id,
      userId: authUser.id,
      typing: false,
    });
    const recipients = [chat.buyer_id, chat.seller_id].filter((id) => id && id !== authUser.id);
    const compactText = String(text || "").replace(/\s+/g, " ").slice(0, 180);
    notifyTelegramByUserIds(recipients, `MDM: новое сообщение от ${authUser.username}\n${compactText}`);

    res.status(201).json({
      message: messagePayload,
      chat: rowToChatSummary(updatedChat, authUser.id),
    });
  })
);

app.delete(
  "/api/chats/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const authUser = getAuthUserOrThrow(req);
    const chatId = cleanText(req.params.id, 80);
    if (!chatId) {
      throw new AppError("chatId is required.", 400);
    }

    const chat = getChatById(chatId);
    if (!chat) {
      throw new AppError("Chat not found.", 404);
    }
    ensureCanAccessChatOrThrow(chat, authUser);

    db.prepare("DELETE FROM chats WHERE id = ?").run(chat.id);
    notifyUsers("chats_changed", [chat.buyer_id, chat.seller_id], {
      chatId: chat.id,
      deleted: true,
      deletedBy: authUser.id,
    });

    res.json({ ok: true, deletedId: chat.id });
  })
);

app.get(
  "/api/admin/users",
  requireAuth,
  asyncHandler(async (req, res) => {
    const authUser = getAuthUserOrThrow(req);
    requireRoles(authUser, [ROLES.ADMIN], "Admin access required.");

    const rows = db.prepare("SELECT * FROM users ORDER BY created_at ASC").all();
    res.json({
      users: rows.map((row) => rowToAdminUser(row)),
    });
  })
);

app.patch(
  "/api/admin/users/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const authUser = getAuthUserOrThrow(req);
    requireRoles(authUser, [ROLES.ADMIN], "Admin access required.");

    const targetId = cleanText(req.params.id, 60);
    if (!targetId) {
      throw new AppError("User id is required.", 400);
    }
    const target = db.prepare("SELECT * FROM users WHERE id = ? LIMIT 1").get(targetId);
    if (!target) {
      throw new AppError("User not found.", 404);
    }

    const body = req.body && typeof req.body === "object" ? req.body : {};
    const hasLogin = Object.prototype.hasOwnProperty.call(body, "login") || Object.prototype.hasOwnProperty.call(body, "username");
    const hasEmail = Object.prototype.hasOwnProperty.call(body, "email");
    const hasPassword = Object.prototype.hasOwnProperty.call(body, "password");
    if (!hasLogin && !hasEmail && !hasPassword) {
      throw new AppError("Укажите логин, почту или пароль для обновления.", 400);
    }

    const updateParts = [];
    const updateParams = [];

    if (hasLogin) {
      const login = cleanText(body.login ?? body.username, 20);
      if (!isUsername(login)) {
        throw new AppError("Логин должен быть 3-20 символов: буквы, цифры, _.", 400);
      }
      if (target.username === ADMIN_USERNAME && login !== ADMIN_USERNAME) {
        throw new AppError("Логин root admin менять нельзя.", 400);
      }
      const duplicateLogin = db.prepare("SELECT id FROM users WHERE LOWER(username) = LOWER(?) AND id <> ? LIMIT 1").get(login, target.id);
      if (duplicateLogin) {
        throw new AppError("Логин уже занят.", 409);
      }
      updateParts.push("username = ?");
      updateParams.push(login);
    }

    if (hasEmail) {
      const email = cleanText(body.email, 80).toLowerCase();
      if (!isEmail(email)) {
        throw new AppError("Некорректный формат почты.", 400);
      }
      if (target.username === ADMIN_USERNAME && email !== String(target.email || "").toLowerCase()) {
        throw new AppError("Почту root admin менять нельзя.", 400);
      }
      const duplicateEmail = db.prepare("SELECT id FROM users WHERE LOWER(email) = LOWER(?) AND id <> ? LIMIT 1").get(email, target.id);
      if (duplicateEmail) {
        throw new AppError("Почта уже используется.", 409);
      }
      updateParts.push("email = ?");
      updateParams.push(email);
    }

    if (hasPassword) {
      const password = String(body.password || "");
      if (password.length < 6) {
        throw new AppError("Пароль должен быть минимум 6 символов.", 400);
      }
      if (target.username === ADMIN_USERNAME) {
        throw new AppError("Пароль root admin менять нельзя.", 400);
      }
      const passwordHash = await bcrypt.hash(password, 10);
      updateParts.push("password_hash = ?", "password_plain = ?");
      updateParams.push(passwordHash, encryptText(password));
    }

    if (!updateParts.length) {
      throw new AppError("Нет данных для обновления.", 400);
    }

    updateParts.push("updated_at = ?");
    updateParams.push(nowIso(), target.id);

    db.prepare(`UPDATE users SET ${updateParts.join(", ")} WHERE id = ?`).run(...updateParams);

    const updated = db.prepare("SELECT * FROM users WHERE id = ? LIMIT 1").get(target.id);
    notifyUsers("profile_changed", [target.id]);
    res.json({ user: rowToAdminUser(updated) });
  })
);

app.patch(
  "/api/admin/users/:id/role",
  requireAuth,
  asyncHandler(async (req, res) => {
    const authUser = getAuthUserOrThrow(req);
    requireRoles(authUser, [ROLES.ADMIN], "Admin access required.");

    const targetId = cleanText(req.params.id, 60);
    const nextRole = normalizeRole(req.body.role);
    const target = db.prepare("SELECT * FROM users WHERE id = ?").get(targetId);
    if (!target) {
      throw new AppError("User not found.", 404);
    }

    if (target.username === ADMIN_USERNAME && nextRole !== ROLES.ADMIN) {
      throw new AppError("Root admin role is locked.", 400);
    }

    db.prepare("UPDATE users SET role = ?, updated_at = ? WHERE id = ?").run(nextRole, nowIso(), target.id);

    // Buyer role cannot keep active sale inventory.
    if (nextRole === ROLES.BUYER) {
      db.prepare("UPDATE products SET is_listed = 0, updated_at = ? WHERE seller_id = ? AND deleted_at IS NULL").run(
        nowIso(),
        target.id
      );
      notifyAll("catalog_changed");
    }

    notifyUsers("profile_changed", [target.id]);
    const updatedUser = db.prepare("SELECT * FROM users WHERE id = ?").get(target.id);
    res.json({ user: rowToAdminUser(updatedUser) });
  })
);

app.get(
  "/api/admin/bans",
  requireAuth,
  asyncHandler(async (req, res) => {
    const authUser = getAuthUserOrThrow(req);
    requireRoles(authUser, [ROLES.ADMIN], "Admin access required.");

    const rows = db
      .prepare(
        `
      SELECT
        b.*,
        creator.username AS created_by_username,
        lifter.username AS lifted_by_username
      FROM bans b
      LEFT JOIN users creator ON creator.id = b.created_by
      LEFT JOIN users lifter ON lifter.id = b.lifted_by
      ORDER BY b.is_active DESC, b.created_at DESC
    `
      )
      .all();

    res.json({ bans: rows.map((row) => rowToBan(row)) });
  })
);

app.post(
  "/api/admin/bans",
  requireAuth,
  asyncHandler(async (req, res) => {
    const authUser = getAuthUserOrThrow(req);
    requireRoles(authUser, [ROLES.ADMIN], "Admin access required.");

    const type = normalizeBanTargetType(req.body.mode || req.body.type || req.body.targetType);
    const value = cleanText(req.body.value || req.body.targetValue, 120);
    const reason = cleanText(req.body.reason, 240);
    const { targetType, targetValue, targetKey } = normalizeBanTargetInput(type, value);

    if (targetType === BAN_TARGET.USERNAME && targetKey === normalizeUsernameForBan(ADMIN_USERNAME)) {
      throw new AppError("Root admin ban is locked.", 400);
    }

    const existing = db
      .prepare("SELECT * FROM bans WHERE target_type = ? AND target_key = ? AND is_active = 1 LIMIT 1")
      .get(targetType, targetKey);
    if (existing) {
      res.status(200).json({ ban: rowToBan(existing), alreadyActive: true });
      return;
    }

    const banId = randomUUID();
    const ts = nowIso();
    db.prepare(
      `
      INSERT INTO bans (id, target_type, target_value, target_key, reason, is_active, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)
    `
    ).run(banId, targetType, targetValue, targetKey, reason, authUser.id, ts, ts);

    if (targetType === BAN_TARGET.USERNAME) {
      const bannedUser = db.prepare("SELECT id FROM users WHERE LOWER(username) = ? LIMIT 1").get(targetKey);
      if (bannedUser?.id) {
        notifyUsers("profile_changed", [bannedUser.id]);
      }
    }

    const created = db.prepare("SELECT * FROM bans WHERE id = ? LIMIT 1").get(banId);
    res.status(201).json({ ban: rowToBan(created) });
  })
);

app.delete(
  "/api/admin/bans/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const authUser = getAuthUserOrThrow(req);
    requireRoles(authUser, [ROLES.ADMIN], "Admin access required.");

    const banId = cleanText(req.params.id, 80);
    if (!banId) {
      throw new AppError("banId is required.", 400);
    }

    const current = db.prepare("SELECT * FROM bans WHERE id = ? LIMIT 1").get(banId);
    if (!current) {
      throw new AppError("Бан не найден.", 404);
    }

    if (!Number(current.is_active)) {
      res.json({ ban: rowToBan(current), alreadyInactive: true });
      return;
    }

    const ts = nowIso();
    db.prepare("UPDATE bans SET is_active = 0, lifted_at = ?, lifted_by = ?, updated_at = ? WHERE id = ?").run(
      ts,
      authUser.id,
      ts,
      banId
    );

    const updated = db.prepare("SELECT * FROM bans WHERE id = ? LIMIT 1").get(banId);
    if (updated?.target_type === BAN_TARGET.USERNAME) {
      const userRow = db.prepare("SELECT id FROM users WHERE LOWER(username) = ? LIMIT 1").get(updated.target_key);
      if (userRow?.id) {
        notifyUsers("profile_changed", [userRow.id]);
      }
    }
    res.json({ ok: true, ban: rowToBan(updated) });
  })
);

app.get(
  "/api/admin/promo-codes",
  requireAuth,
  asyncHandler(async (req, res) => {
    const authUser = getAuthUserOrThrow(req);
    requireRoles(authUser, [ROLES.ADMIN], "Admin access required.");

    const rows = db
      .prepare(
        `
      SELECT
        pc.*,
        p.title AS product_title,
        p.deleted_at AS product_deleted_at,
        p.seller_id AS seller_id,
        u.username AS seller_username
      FROM promo_codes pc
      LEFT JOIN products p ON p.id = pc.product_id
      LEFT JOIN users u ON u.id = p.seller_id
      ORDER BY pc.created_at DESC
    `
      )
      .all();

    res.json({ promoCodes: rows.map((row) => buildPromoCodePayload(row)) });
  })
);

app.post(
  "/api/admin/promo-codes",
  requireAuth,
  asyncHandler(async (req, res) => {
    const authUser = getAuthUserOrThrow(req);
    requireRoles(authUser, [ROLES.ADMIN], "Admin access required.");

    const code = normalizePromoCode(req.body.code, { allowEmpty: false });
    const productIds = ensurePromoProductsExistOrThrow(resolvePromoProductIds(req.body.productIds, req.body.productId));
    const percent = normalizePromoPercent(req.body.percent);
    const isActive = req.body.isActive === undefined ? true : Boolean(req.body.isActive);

    if (!percent) {
      throw new AppError("Скидка должна быть от 1% до 100%.", 400);
    }

    const conflict = db.prepare("SELECT id FROM promo_codes WHERE code = ? LIMIT 1").get(code);
    if (conflict) {
      throw new AppError("Промокод уже существует.", 409);
    }

    const promoId = randomUUID();
    const ts = nowIso();
    db.prepare(
      `
      INSERT INTO promo_codes (id, code, product_id, percent, is_active, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `
    ).run(promoId, code, productIds[0], percent, boolToInt(isActive), authUser.id, ts, ts);
    updatePromoProducts(promoId, productIds);

    const row = getPromoCodeById(promoId);
    res.status(201).json({ promoCode: buildPromoCodePayload(row) });
  })
);

app.patch(
  "/api/admin/promo-codes/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const authUser = getAuthUserOrThrow(req);
    requireRoles(authUser, [ROLES.ADMIN], "Admin access required.");

    const promoId = cleanText(req.params.id, 80);
    const current = getPromoCodeById(promoId);
    if (!current) {
      throw new AppError("Промокод не найден.", 404);
    }

    const nextCode = req.body.code !== undefined ? normalizePromoCode(req.body.code, { allowEmpty: false }) : current.code;
    const currentProductIds = fetchPromoProducts(current.id, current.product_id).map((item) => item.id);
    const providedProductIds =
      req.body.productIds !== undefined || req.body.productId !== undefined
        ? resolvePromoProductIds(req.body.productIds, req.body.productId)
        : currentProductIds;
    const nextProductIds = ensurePromoProductsExistOrThrow(providedProductIds);
    const nextPercent = req.body.percent !== undefined ? normalizePromoPercent(req.body.percent) : Number(current.percent);
    const nextIsActive = req.body.isActive !== undefined ? boolToInt(Boolean(req.body.isActive)) : Number(current.is_active);

    if (!nextPercent) {
      throw new AppError("Скидка должна быть от 1% до 100%.", 400);
    }

    const codeConflict = db.prepare("SELECT id FROM promo_codes WHERE code = ? AND id != ? LIMIT 1").get(nextCode, promoId);
    if (codeConflict) {
      throw new AppError("Промокод уже существует.", 409);
    }

    db.prepare(
      `
      UPDATE promo_codes
      SET code = ?, product_id = ?, percent = ?, is_active = ?, updated_at = ?
      WHERE id = ?
    `
    ).run(nextCode, nextProductIds[0], nextPercent, nextIsActive, nowIso(), promoId);
    updatePromoProducts(promoId, nextProductIds);

    res.json({ promoCode: buildPromoCodePayload(getPromoCodeById(promoId)) });
  })
);

app.delete(
  "/api/admin/promo-codes/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const authUser = getAuthUserOrThrow(req);
    requireRoles(authUser, [ROLES.ADMIN], "Admin access required.");

    const promoId = cleanText(req.params.id, 80);
    const row = db.prepare("SELECT id FROM promo_codes WHERE id = ? LIMIT 1").get(promoId);
    if (!row) {
      throw new AppError("Промокод не найден.", 404);
    }

    db.prepare("DELETE FROM promo_codes WHERE id = ?").run(promoId);
    res.json({ ok: true, deletedId: promoId });
  })
);

app.use((req, res) => {
  res.status(404).json({ message: "Route not found" });
});

app.use((err, _req, res, _next) => {
  if (err instanceof AppError) {
    const payload = { message: err.message };
    if (err.code) {
      payload.code = err.code;
    }
    if (err.meta && typeof err.meta === "object") {
      Object.assign(payload, err.meta);
    }
    return res.status(err.status || 400).json(payload);
  }
  if (err?.name === "MulterError") {
    return res.status(400).json({ message: "Ошибка загрузки файла." });
  }

  console.error(err);
  return res.status(500).json({ message: "Internal server error" });
});

app.listen(PORT, HOST, () => {
  console.log(`MDM API running on http://${HOST}:${PORT}`);
  console.log(`Allowed origin: ${FRONTEND_ORIGIN}`);
  startUserDataExportLoop();
  console.log(`[userdata] Exporting to ${USERDATA_EXPORT_PATH} every ${USERDATA_EXPORT_INTERVAL_MS} ms`);
});
