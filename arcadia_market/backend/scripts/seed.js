require("dotenv").config();

const bcrypt = require("bcryptjs");
const { randomUUID } = require("crypto");
const { db, initDb } = require("../src/db");

function nowIso() {
  return new Date().toISOString();
}

const demoUsers = [
  {
    username: "NovaSeller",
    email: "nova@arcadia.local",
    bio: "Hunts rare gear and sells mint condition loot.",
    avatar: "https://images.unsplash.com/photo-1541101767792-f9b2b1c4f127?auto=format&fit=crop&w=220&q=80",
    balance: 7200,
    rating: 4.9,
  },
  {
    username: "PixelForge",
    email: "pixel@arcadia.local",
    bio: "Crafts cosmetic bundles and event collectibles.",
    avatar: "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=220&q=80",
    balance: 6400,
    rating: 4.7,
  },
  {
    username: "RookieBuyer",
    email: "rookie@arcadia.local",
    bio: "Trying to build the cleanest inventory in MDM.",
    avatar: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=220&q=80",
    balance: 9800,
    rating: 4.6,
  },
];

const demoProducts = [
  {
    title: "Nebula Blade Skin",
    description: "Animated legendary sword skin with comet trail effect.",
    price: 1800,
    image: "https://images.unsplash.com/photo-1550745165-9bc0b252726f?auto=format&fit=crop&w=900&q=80",
    category: "Skins",
    condition: "New",
    rarity: "Legendary",
    stock: 3,
    sellerUsername: "NovaSeller",
  },
  {
    title: "Aurora Pet Capsule",
    description: "Companion capsule with random epic pet variants.",
    price: 950,
    image: "https://images.unsplash.com/photo-1511512578047-dfb367046420?auto=format&fit=crop&w=900&q=80",
    category: "Collectibles",
    condition: "New",
    rarity: "Epic",
    stock: 9,
    sellerUsername: "NovaSeller",
  },
  {
    title: "Forge Emote Pack",
    description: "Six handcrafted emotes optimized for stream clips.",
    price: 520,
    image: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=900&q=80",
    category: "Boosts",
    condition: "Used",
    rarity: "Rare",
    stock: 12,
    sellerUsername: "PixelForge",
  },
  {
    title: "Crystal Crate x5",
    description: "Bundle of five craft crates with bonus upgrade shards.",
    price: 1300,
    image: "https://images.unsplash.com/photo-1611078489935-0cb964de46d6?auto=format&fit=crop&w=900&q=80",
    category: "Craft",
    condition: "New",
    rarity: "Epic",
    stock: 5,
    sellerUsername: "PixelForge",
  },
];

async function main() {
  initDb();
  const hash = await bcrypt.hash("demo123", 10);

  const ts = nowIso();

  db.prepare("DELETE FROM transactions").run();
  db.prepare("DELETE FROM order_items").run();
  db.prepare("DELETE FROM orders").run();
  db.prepare("DELETE FROM cart_items").run();
  db.prepare("DELETE FROM products").run();
  db.prepare("DELETE FROM users").run();

  const insertUser = db.prepare(
    `
    INSERT INTO users (id, username, email, password_hash, avatar, bio, balance, rating, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `
  );

  const userIdByUsername = {};

  for (const user of demoUsers) {
    const userId = randomUUID();
    userIdByUsername[user.username] = userId;
    insertUser.run(
      userId,
      user.username,
      user.email,
      hash,
      user.avatar,
      user.bio,
      user.balance,
      user.rating,
      ts,
      ts
    );
  }

  const insertProduct = db.prepare(
    `
    INSERT INTO products (
      id, title, description, price, image, category, condition, rarity,
      stock, is_listed, seller_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
  `
  );

  for (const item of demoProducts) {
    insertProduct.run(
      randomUUID(),
      item.title,
      item.description,
      item.price,
      item.image,
      item.category,
      item.condition,
      item.rarity,
      item.stock,
      userIdByUsername[item.sellerUsername],
      ts,
      ts
    );
  }

  console.log("Seed complete.");
  console.log("Demo login: rookie@arcadia.local / demo123");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
