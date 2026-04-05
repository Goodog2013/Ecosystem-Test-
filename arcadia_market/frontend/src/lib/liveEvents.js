export const LIVE_UI_EVENTS = {
  CATALOG_CHANGED: "mdm:catalog-changed",
  CART_CHANGED: "mdm:cart-changed",
  ORDERS_CHANGED: "mdm:orders-changed",
  PROFILE_CHANGED: "mdm:profile-changed",
  BALANCE_CHANGED: "mdm:balance-changed",
  WISHLIST_CHANGED: "mdm:wishlist-changed",
  REVIEWS_CHANGED: "mdm:reviews-changed",
  CHATS_CHANGED: "mdm:chats-changed",
  CHAT_TYPING: "mdm:chat-typing",
  PRESENCE_CHANGED: "mdm:presence-changed",
};

export function emitLiveUIEvent(eventName, detail = {}) {
  window.dispatchEvent(new CustomEvent(eventName, { detail }));
}

export function onLiveUIEvent(eventName, handler) {
  window.addEventListener(eventName, handler);
  return () => {
    window.removeEventListener(eventName, handler);
  };
}
