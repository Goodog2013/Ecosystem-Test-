export const PRODUCT_CATEGORIES = ["Skins", "Collectibles", "Boosts", "Craft", "Bundles", "Tools"];
export const PRODUCT_CONDITIONS = ["New", "Used", "Refurbished"];
export const PRODUCT_RARITIES = ["Common", "Rare", "Epic", "Legendary"];

const CATEGORY_LABELS = {
  Skins: "Скины",
  Collectibles: "Коллекционные",
  Boosts: "Бусты",
  Craft: "Крафт",
  Bundles: "Наборы",
  Tools: "Инструменты",
};

const CONDITION_LABELS = {
  New: "Новый",
  Used: "Б/у",
  Refurbished: "Восстановленный",
};

const RARITY_LABELS = {
  Common: "Обычный",
  Rare: "Редкий",
  Epic: "Эпический",
  Legendary: "Легендарный",
};

export function getCategoryLabel(value) {
  return CATEGORY_LABELS[value] || value;
}

export function getConditionLabel(value) {
  return CONDITION_LABELS[value] || value;
}

export function getRarityLabel(value) {
  return RARITY_LABELS[value] || value;
}