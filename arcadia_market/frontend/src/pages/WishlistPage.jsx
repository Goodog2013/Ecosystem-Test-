import { useCallback, useEffect } from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import { Heart } from "lucide-react";
import AnimatedPage from "../components/AnimatedPage";
import EmptyState from "../components/EmptyState";
import ProductCard from "../components/ProductCard";
import SkeletonCard from "../components/SkeletonCard";
import { LIVE_UI_EVENTS, onLiveUIEvent } from "../lib/liveEvents";
import { useAuthStore } from "../store/authStore";
import { useUiStore } from "../store/uiStore";
import { useWishlistStore } from "../store/wishlistStore";

const COPY = {
  ru: {
    title: "Вишлист",
    subtitle: "Сохраненные лоты, к которым хотите вернуться позже.",
    loadError: "Не удалось загрузить вишлист",
    emptyTitle: "Вишлист пуст",
    emptyDescription: "Добавляйте товары из каталога, чтобы не потерять их.",
    toCatalog: "Перейти в каталог",
  },
  en: {
    title: "Wishlist",
    subtitle: "Saved listings you want to revisit later.",
    loadError: "Failed to load wishlist",
    emptyTitle: "Wishlist is empty",
    emptyDescription: "Save items from the catalog so you do not lose them.",
    toCatalog: "Go to catalog",
  },
};

export default function WishlistPage() {
  const { token } = useAuthStore();
  const language = useUiStore((state) => state.language);
  const t = COPY[language] || COPY.ru;
  const products = useWishlistStore((state) => state.products);
  const loading = useWishlistStore((state) => state.loading);
  const fetchWishlist = useWishlistStore((state) => state.fetchWishlist);
  const fetchWishlistIds = useWishlistStore((state) => state.fetchWishlistIds);

  const loadWishlist = useCallback(
    async (showError = true) => {
      if (!token) {
        return;
      }
      try {
        await fetchWishlist();
      } catch (err) {
        if (showError) {
          toast.error(err.message || t.loadError);
        }
      }
    },
    [token, fetchWishlist, t.loadError]
  );

  useEffect(() => {
    loadWishlist(true);
  }, [loadWishlist]);

  useEffect(() => {
    return onLiveUIEvent(LIVE_UI_EVENTS.WISHLIST_CHANGED, () => {
      fetchWishlistIds();
      loadWishlist(false);
    });
  }, [fetchWishlistIds, loadWishlist]);

  useEffect(() => {
    return onLiveUIEvent(LIVE_UI_EVENTS.CATALOG_CHANGED, () => {
      loadWishlist(false);
    });
  }, [loadWishlist]);

  return (
    <AnimatedPage>
      <section className="rounded-2xl border border-slate-200/80 bg-white/80 p-4 dark:border-slate-700/80 dark:bg-slate-900/70">
        <div className="flex items-center gap-2 text-slate-700 dark:text-slate-200">
          <Heart size={16} />
          <h1 className="text-lg font-semibold">{t.title}</h1>
        </div>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{t.subtitle}</p>
      </section>

      <section className="mt-6">
        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, idx) => (
              <SkeletonCard key={idx} />
            ))}
          </div>
        ) : products.length ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {products.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        ) : (
          <EmptyState
            title={t.emptyTitle}
            description={t.emptyDescription}
            action={
              <Link
                to="/catalog"
                className="inline-flex rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-cyan-600"
              >
                {t.toCatalog}
              </Link>
            }
          />
        )}
      </section>
    </AnimatedPage>
  );
}
