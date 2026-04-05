import { create } from "zustand";
import { api } from "../lib/api";
import { useAuthStore } from "./authStore";

function uniqueIds(items) {
  return Array.from(new Set((items || []).filter(Boolean)));
}

export const useWishlistStore = create((set, get) => ({
  ids: [],
  products: [],
  loading: false,

  reset: () => set({ ids: [], products: [], loading: false }),

  fetchWishlistIds: async () => {
    const token = useAuthStore.getState().token;
    if (!token) {
      set({ ids: [] });
      return [];
    }
    try {
      const data = await api.get("/wishlist/ids", token);
      const ids = uniqueIds(data.ids || []);
      set({ ids });
      return ids;
    } catch {
      return get().ids;
    }
  },

  fetchWishlist: async () => {
    const token = useAuthStore.getState().token;
    if (!token) {
      set({ ids: [], products: [], loading: false });
      return [];
    }

    set({ loading: true });
    try {
      const data = await api.get("/wishlist", token);
      const products = data.products || [];
      const ids = uniqueIds(products.map((item) => item.id));
      set({ products, ids, loading: false });
      return products;
    } catch {
      set({ loading: false });
      return [];
    }
  },

  toggleWishlist: async (productId) => {
    const token = useAuthStore.getState().token;
    if (!token) {
      throw new Error("Сначала войдите в аккаунт.");
    }
    const ids = get().ids || [];
    const wished = ids.includes(productId);
    const result = wished
      ? await api.delete(`/wishlist/${encodeURIComponent(productId)}`, token)
      : await api.post("/wishlist", { productId }, token);
    const nextIds = uniqueIds(result.ids || []);
    set({ ids: nextIds, products: get().products.filter((item) => nextIds.includes(item.id)) });
    return !wished;
  },
}));
