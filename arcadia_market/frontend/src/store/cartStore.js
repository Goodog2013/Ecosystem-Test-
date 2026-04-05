import { create } from "zustand";
import { api } from "../lib/api";
import { useAuthStore } from "./authStore";

export const useCartStore = create((set, get) => ({
  items: [],
  total: 0,
  pickupSellers: [],
  pickupRequired: false,
  pickupReady: true,
  loading: false,

  reset: () => set({ items: [], total: 0, pickupSellers: [], pickupRequired: false, pickupReady: true }),

  fetchCart: async () => {
    const token = useAuthStore.getState().token;
    if (!token) {
      set({ items: [], total: 0, pickupSellers: [], pickupRequired: false, pickupReady: true });
      return;
    }
    set({ loading: true });
    try {
      const data = await api.get("/cart", token);
      set({
        items: data.items || [],
        total: data.total || 0,
        pickupSellers: data.pickupSellers || [],
        pickupRequired: Boolean(data.pickupRequired),
        pickupReady: data.pickupReady !== false,
        loading: false,
      });
    } catch {
      set({ loading: false });
    }
  },

  addToCart: async (productId, quantity = 1) => {
    const token = useAuthStore.getState().token;
    if (!token) {
      throw new Error("Сначала войдите в аккаунт.");
    }
    const data = await api.post("/cart/items", { productId, quantity }, token);
    set({
      items: data.items || [],
      total: data.total || 0,
      pickupSellers: data.pickupSellers || [],
      pickupRequired: Boolean(data.pickupRequired),
      pickupReady: data.pickupReady !== false,
    });
    return data;
  },

  updateQuantity: async (itemId, quantity) => {
    const token = useAuthStore.getState().token;
    if (!token) {
      return;
    }
    await api.patch(`/cart/items/${itemId}`, { quantity }, token);
    await get().fetchCart();
  },

  removeItem: async (itemId) => {
    const token = useAuthStore.getState().token;
    if (!token) {
      return;
    }
    await api.delete(`/cart/items/${itemId}`, token);
    await get().fetchCart();
  },

  checkout: async (options = {}) => {
    const token = useAuthStore.getState().token;
    if (!token) {
      throw new Error("Сначала войдите в аккаунт.");
    }
    const promoCode = String(options?.promoCode || "").trim();
    const pickupBySeller =
      options?.pickupBySeller && typeof options.pickupBySeller === "object" && !Array.isArray(options.pickupBySeller)
        ? options.pickupBySeller
        : {};
    const payload = {
      ...(promoCode ? { promoCode } : {}),
      pickupBySeller,
    };
    const paymentMethod = String(options?.paymentMethod || "").trim().toLowerCase();
    if (paymentMethod) {
      payload.paymentMethod = paymentMethod;
    }
    const mbCardId = String(options?.mbCardId || "").trim();
    const mbPassword = String(options?.mbPassword || "");
    if (mbCardId) {
      payload.mbCardId = mbCardId;
    }
    if (mbPassword) {
      payload.mbPassword = mbPassword;
    }
    const data = await api.post("/cart/checkout", payload, token);
    await Promise.all([get().fetchCart(), useAuthStore.getState().refreshMe()]);
    return data.order;
  },
}));
