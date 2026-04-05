const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");
const bcrypt = require("bcryptjs");
const { randomUUID } = require("crypto");
const { encryptText, isEncryptedText } = require("./utils/crypto");

const ADMIN_USERNAME = "Goodog2013";
const ADMIN_PASSWORD = "Qw111111";
const ADMIN_EMAIL = "goodog2013@mdm.local";
const ADMIN_DEFAULT_BALANCE = 15000;

function resolveDbPath() {
  const raw = String(process.env.DATABASE_URL || "file:./dev.db");
  const projectRoot = path.resolve(__dirname, "..");
  if (raw.startsWith("file:")) {
    const rel = raw.slice(5);
    return path.resolve(projectRoot, rel);
  }
  return path.resolve(projectRoot, "dev.db");
}

const dbPath = resolveDbPath();
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new Database(dbPath);
db.pragma("foreign_keys = ON");
db.pragma("journal_mode = WAL");

function hasColumn(table, column) {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all();
  return rows.some((row) => row.name === column);
}

function migrateUserRoles() {
  if (!hasColumn("users", "role")) {
    db.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'buyer'");
  }
}

function migrateUserBankLink() {
  if (!hasColumn("users", "bank_username")) {
    db.exec("ALTER TABLE users ADD COLUMN bank_username TEXT");
  }
  if (!hasColumn("users", "bank_linked_at")) {
    db.exec("ALTER TABLE users ADD COLUMN bank_linked_at TEXT");
  }
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_bank_username_unique ON users(bank_username) WHERE bank_username IS NOT NULL");
}

function migrateUserPresence() {
  if (!hasColumn("users", "last_seen_at")) {
    db.exec("ALTER TABLE users ADD COLUMN last_seen_at TEXT");
  }
  db.exec("UPDATE users SET last_seen_at = COALESCE(last_seen_at, created_at)");
}

function migrateUserTelegramLink() {
  if (!hasColumn("users", "telegram_chat_id")) {
    db.exec("ALTER TABLE users ADD COLUMN telegram_chat_id TEXT");
  }
  if (!hasColumn("users", "telegram_username")) {
    db.exec("ALTER TABLE users ADD COLUMN telegram_username TEXT");
  }
  if (!hasColumn("users", "telegram_linked_at")) {
    db.exec("ALTER TABLE users ADD COLUMN telegram_linked_at TEXT");
  }
  if (!hasColumn("users", "telegram_link_token")) {
    db.exec("ALTER TABLE users ADD COLUMN telegram_link_token TEXT");
  }
  if (!hasColumn("users", "telegram_link_token_expires_at")) {
    db.exec("ALTER TABLE users ADD COLUMN telegram_link_token_expires_at TEXT");
  }
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_telegram_chat_unique ON users(telegram_chat_id) WHERE telegram_chat_id IS NOT NULL");
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_telegram_link_token_unique ON users(telegram_link_token) WHERE telegram_link_token IS NOT NULL");
}

function migrateUserAvatarPrivacy() {
  if (!hasColumn("users", "hide_avatar_in_market")) {
    db.exec("ALTER TABLE users ADD COLUMN hide_avatar_in_market INTEGER NOT NULL DEFAULT 0");
  }
}

function migrateUserPasswordMirror() {
  if (!hasColumn("users", "password_plain")) {
    db.exec("ALTER TABLE users ADD COLUMN password_plain TEXT");
  }
}

function migrateProductSoftDelete() {
  if (!hasColumn("products", "deleted_at")) {
    db.exec("ALTER TABLE products ADD COLUMN deleted_at TEXT");
  }
}

function migrateProductGallery() {
  if (!hasColumn("products", "images_json")) {
    db.exec("ALTER TABLE products ADD COLUMN images_json TEXT");
  }
}

function normalizeUploadUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }
  if (raw.startsWith("/uploads/")) {
    return raw;
  }
  if (raw.startsWith("uploads/")) {
    return `/${raw}`;
  }
  try {
    const parsed = new URL(raw);
    if (parsed.pathname.startsWith("/uploads/")) {
      return `${parsed.pathname}${parsed.search || ""}${parsed.hash || ""}`;
    }
  } catch (_err) {
    return raw;
  }
  return raw;
}

function normalizeUploadArrayJson(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return raw;
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (_err) {
    return raw;
  }
  if (!Array.isArray(parsed)) {
    return raw;
  }
  let changed = false;
  const normalized = parsed.map((item) => {
    if (typeof item !== "string") {
      return item;
    }
    const next = normalizeUploadUrl(item);
    if (next !== item) {
      changed = true;
    }
    return next;
  });
  if (!changed) {
    return raw;
  }
  return JSON.stringify(normalized);
}

function migrateLegacyImageUrls() {
  const users = db.prepare("SELECT id, avatar FROM users").all();
  const products = db.prepare("SELECT id, image, images_json FROM products").all();
  const orderItems = db.prepare("SELECT id, image_snapshot FROM order_items").all();
  const reviews = db.prepare("SELECT id, image FROM seller_reviews").all();

  const updateUserAvatar = db.prepare("UPDATE users SET avatar = ? WHERE id = ?");
  const updateProductImages = db.prepare("UPDATE products SET image = ?, images_json = ? WHERE id = ?");
  const updateOrderItemImage = db.prepare("UPDATE order_items SET image_snapshot = ? WHERE id = ?");
  const updateReviewImage = db.prepare("UPDATE seller_reviews SET image = ? WHERE id = ?");

  const run = db.transaction(() => {
    for (const row of users) {
      const nextAvatar = normalizeUploadUrl(row.avatar);
      if (nextAvatar !== String(row.avatar || "")) {
        updateUserAvatar.run(nextAvatar, row.id);
      }
    }

    for (const row of products) {
      const nextImage = normalizeUploadUrl(row.image);
      const nextImagesJson = normalizeUploadArrayJson(row.images_json);
      if (nextImage !== String(row.image || "") || nextImagesJson !== String(row.images_json || "")) {
        updateProductImages.run(nextImage, nextImagesJson, row.id);
      }
    }

    for (const row of orderItems) {
      const nextImageSnapshot = normalizeUploadUrl(row.image_snapshot);
      if (nextImageSnapshot !== String(row.image_snapshot || "")) {
        updateOrderItemImage.run(nextImageSnapshot, row.id);
      }
    }

    for (const row of reviews) {
      const nextImage = normalizeUploadUrl(row.image);
      if (nextImage !== String(row.image || "")) {
        updateReviewImage.run(nextImage, row.id);
      }
    }
  });
  run();
}

function migratePromoCodeProducts() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS promo_code_products (
      id TEXT PRIMARY KEY,
      promo_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(promo_id, product_id),
      FOREIGN KEY (promo_id) REFERENCES promo_codes(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_promo_code_products_promo ON promo_code_products(promo_id);
    CREATE INDEX IF NOT EXISTS idx_promo_code_products_product ON promo_code_products(product_id);
  `);

  const rows = db.prepare("SELECT id, product_id, created_at FROM promo_codes").all();
  const insertMap = db.prepare(
    "INSERT OR IGNORE INTO promo_code_products (id, promo_id, product_id, created_at) VALUES (?, ?, ?, ?)"
  );
  const tx = db.transaction((list) => {
    for (const row of list) {
      if (!row?.id || !row?.product_id) {
        continue;
      }
      insertMap.run(randomUUID(), row.id, row.product_id, row.created_at || new Date().toISOString());
    }
  });
  tx(rows);
}

function migrateBans() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS bans (
      id TEXT PRIMARY KEY,
      target_type TEXT NOT NULL CHECK (target_type IN ('username', 'ip')),
      target_value TEXT NOT NULL,
      target_key TEXT NOT NULL,
      reason TEXT NOT NULL DEFAULT '',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_by TEXT,
      lifted_by TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      lifted_at TEXT,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY (lifted_by) REFERENCES users(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_bans_active_target ON bans(is_active, target_type, target_key);
    CREATE INDEX IF NOT EXISTS idx_bans_created ON bans(created_at DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_bans_active_target_unique ON bans(target_type, target_key) WHERE is_active = 1;
  `);
}

function migrateOrderItemPickupSnapshot() {
  if (!hasColumn("order_items", "pickup_point_id")) {
    db.exec("ALTER TABLE order_items ADD COLUMN pickup_point_id TEXT");
  }
  if (!hasColumn("order_items", "pickup_point_name")) {
    db.exec("ALTER TABLE order_items ADD COLUMN pickup_point_name TEXT");
  }
  if (!hasColumn("order_items", "pickup_point_address")) {
    db.exec("ALTER TABLE order_items ADD COLUMN pickup_point_address TEXT");
  }
  if (!hasColumn("order_items", "pickup_point_city")) {
    db.exec("ALTER TABLE order_items ADD COLUMN pickup_point_city TEXT");
  }
  if (!hasColumn("order_items", "pickup_point_details")) {
    db.exec("ALTER TABLE order_items ADD COLUMN pickup_point_details TEXT");
  }
}

function migratePickupPoints() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS pickup_points (
      id TEXT PRIMARY KEY,
      seller_id TEXT NOT NULL,
      name TEXT NOT NULL,
      address TEXT NOT NULL,
      city TEXT NOT NULL DEFAULT '',
      details TEXT NOT NULL DEFAULT '',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (seller_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_pickup_points_seller_active ON pickup_points(seller_id, is_active);
    CREATE INDEX IF NOT EXISTS idx_pickup_points_seller_created ON pickup_points(seller_id, created_at DESC);
  `);
}

function migrateCheckoutQrSessions() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS checkout_qr_sessions (
      id TEXT PRIMARY KEY,
      buyer_id TEXT NOT NULL,
      buyer_bank_username TEXT NOT NULL,
      promo_code TEXT NOT NULL DEFAULT '',
      pickup_by_seller_json TEXT NOT NULL DEFAULT '{}',
      expected_total INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending',
      order_id TEXT,
      last_error TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (buyer_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_checkout_qr_sessions_buyer ON checkout_qr_sessions(buyer_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_checkout_qr_sessions_status ON checkout_qr_sessions(status, expires_at);
    CREATE INDEX IF NOT EXISTS idx_checkout_qr_sessions_expires ON checkout_qr_sessions(expires_at);
  `);
}

function migrateEncryptedSensitiveContent() {
  const reviewRows = db
    .prepare("SELECT id, comment FROM seller_reviews WHERE comment IS NOT NULL AND comment <> ''")
    .all();
  const reviewUpdate = db.prepare("UPDATE seller_reviews SET comment = ? WHERE id = ?");

  const chatRows = db
    .prepare("SELECT id, text FROM chat_messages WHERE text IS NOT NULL AND text <> ''")
    .all();
  const chatUpdate = db.prepare("UPDATE chat_messages SET text = ? WHERE id = ?");

  const txRows = db
    .prepare("SELECT id, metadata FROM transactions WHERE metadata IS NOT NULL AND metadata <> ''")
    .all();
  const txUpdate = db.prepare("UPDATE transactions SET metadata = ? WHERE id = ?");

  const run = db.transaction(() => {
    for (const row of reviewRows) {
      const value = String(row.comment || "");
      if (!value || isEncryptedText(value)) {
        continue;
      }
      reviewUpdate.run(encryptText(value), row.id);
    }
    for (const row of chatRows) {
      const value = String(row.text || "");
      if (!value || isEncryptedText(value)) {
        continue;
      }
      chatUpdate.run(encryptText(value), row.id);
    }
    for (const row of txRows) {
      const value = String(row.metadata || "");
      if (!value || isEncryptedText(value)) {
        continue;
      }
      txUpdate.run(encryptText(value), row.id);
    }
  });
  run();
}

function resetLegacyDemoUsersIfNeeded() {
  const rows = db.prepare("SELECT username FROM users").all();
  const usernames = new Set(rows.map((row) => String(row.username || "").trim()));
  const hasRootAdmin = usernames.has(ADMIN_USERNAME);
  const hasLegacyDemo = ["NovaSeller", "PixelForge", "RookieBuyer"].some((name) => usernames.has(name));

  // One-time cleanup of old seeded accounts/content.
  if (!hasRootAdmin && hasLegacyDemo) {
    const wipe = db.transaction(() => {
      db.prepare("DELETE FROM cart_items").run();
      db.prepare("DELETE FROM order_items").run();
      db.prepare("DELETE FROM orders").run();
      db.prepare("DELETE FROM transactions").run();
      db.prepare("DELETE FROM products").run();
      db.prepare("DELETE FROM users").run();
    });
    wipe();
  }
}

function ensureRootAdmin() {
  const ts = new Date().toISOString();
  const hash = bcrypt.hashSync(ADMIN_PASSWORD, 10);
  const passwordMirror = encryptText(ADMIN_PASSWORD);
  const existing = db.prepare("SELECT * FROM users WHERE username = ? OR email = ? LIMIT 1").get(ADMIN_USERNAME, ADMIN_EMAIL);

  if (!existing) {
    db.prepare(
      `
      INSERT INTO users (id, username, email, password_hash, password_plain, avatar, bio, balance, rating, role, last_seen_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, '', 'Root administrator account', ?, 5, 'admin', ?, ?, ?)
    `
    ).run(randomUUID(), ADMIN_USERNAME, ADMIN_EMAIL, hash, passwordMirror, ADMIN_DEFAULT_BALANCE, ts, ts, ts);
    return;
  }

  db.prepare(
    `
    UPDATE users
    SET username = ?, email = ?, password_hash = ?, password_plain = ?, role = 'admin', last_seen_at = COALESCE(last_seen_at, ?), updated_at = ?
    WHERE id = ?
  `
  ).run(ADMIN_USERNAME, ADMIN_EMAIL, hash, passwordMirror, ts, ts, existing.id);
}

function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      password_plain TEXT,
      avatar TEXT,
      bio TEXT NOT NULL DEFAULT '',
      balance INTEGER NOT NULL DEFAULT 5000,
      rating REAL NOT NULL DEFAULT 4.8,
      role TEXT NOT NULL DEFAULT 'buyer',
      bank_username TEXT,
      bank_linked_at TEXT,
      last_seen_at TEXT,
      telegram_chat_id TEXT,
      telegram_username TEXT,
      telegram_linked_at TEXT,
      telegram_link_token TEXT,
      telegram_link_token_expires_at TEXT,
      hide_avatar_in_market INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      price INTEGER NOT NULL,
      image TEXT NOT NULL,
      category TEXT NOT NULL,
      condition TEXT NOT NULL,
      rarity TEXT NOT NULL DEFAULT 'Common',
      stock INTEGER NOT NULL,
      is_listed INTEGER NOT NULL DEFAULT 1,
      seller_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      images_json TEXT,
      deleted_at TEXT,
      FOREIGN KEY (seller_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS cart_items (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(user_id, product_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS wishlist_items (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(user_id, product_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      buyer_id TEXT NOT NULL,
      total INTEGER NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (buyer_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      seller_id TEXT NOT NULL,
      title_snapshot TEXT NOT NULL,
      image_snapshot TEXT NOT NULL,
      price_snapshot INTEGER NOT NULL,
      quantity INTEGER NOT NULL,
      pickup_point_id TEXT,
      pickup_point_name TEXT,
      pickup_point_address TEXT,
      pickup_point_city TEXT,
      pickup_point_details TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id),
      FOREIGN KEY (seller_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      amount INTEGER NOT NULL,
      metadata TEXT,
      from_user_id TEXT,
      to_user_id TEXT,
      order_id TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (from_user_id) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY (to_user_id) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS hidden_orders (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      order_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(user_id, order_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS hidden_transactions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      transaction_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(user_id, transaction_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS seller_reviews (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      order_item_id TEXT NOT NULL,
      product_id TEXT,
      seller_id TEXT NOT NULL,
      buyer_id TEXT NOT NULL,
      stars INTEGER NOT NULL,
      comment TEXT NOT NULL DEFAULT '',
      image TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(order_item_id, buyer_id),
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
      FOREIGN KEY (order_item_id) REFERENCES order_items(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL,
      FOREIGN KEY (seller_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (buyer_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS chats (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      order_item_id TEXT NOT NULL UNIQUE,
      product_id TEXT,
      buyer_id TEXT NOT NULL,
      seller_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_message_at TEXT,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
      FOREIGN KEY (order_item_id) REFERENCES order_items(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL,
      FOREIGN KEY (buyer_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (seller_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY,
      chat_id TEXT NOT NULL,
      sender_id TEXT NOT NULL,
      text TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE,
      FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS promo_codes (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      product_id TEXT NOT NULL,
      percent INTEGER NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT
    );

    CREATE TABLE IF NOT EXISTS promo_code_products (
      id TEXT PRIMARY KEY,
      promo_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(promo_id, product_id),
      FOREIGN KEY (promo_id) REFERENCES promo_codes(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS pickup_points (
      id TEXT PRIMARY KEY,
      seller_id TEXT NOT NULL,
      name TEXT NOT NULL,
      address TEXT NOT NULL,
      city TEXT NOT NULL DEFAULT '',
      details TEXT NOT NULL DEFAULT '',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (seller_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS checkout_qr_sessions (
      id TEXT PRIMARY KEY,
      buyer_id TEXT NOT NULL,
      buyer_bank_username TEXT NOT NULL,
      promo_code TEXT NOT NULL DEFAULT '',
      pickup_by_seller_json TEXT NOT NULL DEFAULT '{}',
      expected_total INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending',
      order_id TEXT,
      last_error TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (buyer_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
    CREATE INDEX IF NOT EXISTS idx_products_created ON products(created_at);
    CREATE INDEX IF NOT EXISTS idx_orders_buyer ON orders(buyer_id);
    CREATE INDEX IF NOT EXISTS idx_order_items_seller ON order_items(seller_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_created ON transactions(created_at);
    CREATE INDEX IF NOT EXISTS idx_hidden_orders_user_created ON hidden_orders(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_hidden_transactions_user_created ON hidden_transactions(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_reviews_seller_created ON seller_reviews(seller_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_reviews_buyer_created ON seller_reviews(buyer_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_chats_buyer_updated ON chats(buyer_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_chats_seller_updated ON chats(seller_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_chats_last_message ON chats(last_message_at DESC);
    CREATE INDEX IF NOT EXISTS idx_chat_messages_chat_created ON chat_messages(chat_id, created_at ASC);
    CREATE INDEX IF NOT EXISTS idx_wishlist_user_created ON wishlist_items(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_promo_codes_product ON promo_codes(product_id);
    CREATE INDEX IF NOT EXISTS idx_promo_codes_active ON promo_codes(is_active);
    CREATE INDEX IF NOT EXISTS idx_promo_code_products_promo ON promo_code_products(promo_id);
    CREATE INDEX IF NOT EXISTS idx_promo_code_products_product ON promo_code_products(product_id);
    CREATE INDEX IF NOT EXISTS idx_pickup_points_seller_active ON pickup_points(seller_id, is_active);
    CREATE INDEX IF NOT EXISTS idx_pickup_points_seller_created ON pickup_points(seller_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_checkout_qr_sessions_buyer ON checkout_qr_sessions(buyer_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_checkout_qr_sessions_status ON checkout_qr_sessions(status, expires_at);
    CREATE INDEX IF NOT EXISTS idx_checkout_qr_sessions_expires ON checkout_qr_sessions(expires_at);
  `);

  migrateUserRoles();
  migrateUserBankLink();
  migrateUserPresence();
  migrateUserTelegramLink();
  migrateUserAvatarPrivacy();
  migrateUserPasswordMirror();
  migrateProductSoftDelete();
  migrateProductGallery();
  migrateLegacyImageUrls();
  migratePromoCodeProducts();
  migrateBans();
  migrateOrderItemPickupSnapshot();
  migratePickupPoints();
  migrateCheckoutQrSessions();
  migrateEncryptedSensitiveContent();
  resetLegacyDemoUsersIfNeeded();
  ensureRootAdmin();
}

module.exports = {
  db,
  initDb,
};
