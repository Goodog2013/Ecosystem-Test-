import { useCallback, useEffect, useMemo, useState } from "react";
import { Filter, Search } from "lucide-react";
import toast from "react-hot-toast";
import { api } from "../lib/api";
import { LIVE_UI_EVENTS, onLiveUIEvent } from "../lib/liveEvents";
import AnimatedPage from "../components/AnimatedPage";
import ProductCard from "../components/ProductCard";
import SkeletonCard from "../components/SkeletonCard";
import EmptyState from "../components/EmptyState";
import {
  PRODUCT_CATEGORIES,
  PRODUCT_CONDITIONS,
  PRODUCT_RARITIES,
  getCategoryLabel,
  getConditionLabel,
  getRarityLabel,
} from "../constants/marketOptions";
import { useUiStore } from "../store/uiStore";

const COPY = {
  ru: {
    loadCatalogError: "Не удалось загрузить каталог",
    catalogTitle: "Каталог маркетплейса",
    searchPlaceholder: "Поиск по названию или описанию",
    all: "Все",
    newest: "Сначала новые",
    priceLowToHigh: "Цена: по возрастанию",
    priceHighToLow: "Цена: по убыванию",
    stockHighToLow: "Остаток: по убыванию",
    min: "Мин",
    max: "Макс",
    items: "Товары",
    found: "найдено",
    emptyTitle: "Товары не найдены",
    emptyDescription: "Измените фильтры поиска или проверьте новые лоты позже.",
  },
  en: {
    loadCatalogError: "Failed to load catalog",
    catalogTitle: "Marketplace catalog",
    searchPlaceholder: "Search by title or description",
    all: "All",
    newest: "Newest",
    priceLowToHigh: "Price: low to high",
    priceHighToLow: "Price: high to low",
    stockHighToLow: "Stock: high to low",
    min: "Min",
    max: "Max",
    items: "Items",
    found: "found",
    emptyTitle: "No items found",
    emptyDescription: "Adjust search filters or check new listings later.",
  },
};

const initialFilters = {
  q: "",
  category: "All",
  condition: "All",
  rarity: "All",
  sort: "newest",
  min: "",
  max: "",
};

export default function CatalogPage() {
  const language = useUiStore((state) => state.language);
  const t = COPY[language] || COPY.ru;
  const [filters, setFilters] = useState(initialFilters);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (filters.q) params.set("q", filters.q);
    if (filters.category !== "All") params.set("category", filters.category);
    if (filters.condition !== "All") params.set("condition", filters.condition);
    if (filters.rarity !== "All") params.set("rarity", filters.rarity);
    if (filters.min) params.set("min", String(Math.max(0, Number(filters.min) || 0)));
    if (filters.max) params.set("max", String(Math.max(0, Number(filters.max) || 0)));
    params.set("sort", filters.sort);
    params.set("page", "1");
    params.set("pageSize", "24");
    return params.toString();
  }, [filters]);

  const loadCatalog = useCallback(
    async (withLoader = true, showError = true) => {
      try {
        if (withLoader) {
          setLoading(true);
        }
        const data = await api.get(`/products?${queryString}`);
        setProducts(data.products || []);
      } catch (err) {
        if (showError) {
          toast.error(err.message || t.loadCatalogError);
        }
      } finally {
        if (withLoader) {
          setLoading(false);
        }
      }
    },
    [queryString, t.loadCatalogError]
  );

  useEffect(() => {
    loadCatalog(true, true);
  }, [loadCatalog]);

  useEffect(() => {
    return onLiveUIEvent(LIVE_UI_EVENTS.CATALOG_CHANGED, () => {
      loadCatalog(false, false);
    });
  }, [loadCatalog]);

  return (
    <AnimatedPage>
      <section className="rounded-2xl border border-slate-200/80 bg-white/80 p-4 dark:border-slate-700/80 dark:bg-slate-900/70">
        <div className="flex items-center gap-2 text-slate-700 dark:text-slate-200">
          <Filter size={16} />
          <h1 className="text-lg font-semibold">{t.catalogTitle}</h1>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-12">
          <label className="relative lg:col-span-4">
            <Search className="pointer-events-none absolute left-3 top-2.5 text-slate-400" size={16} />
            <input
              value={filters.q}
              onChange={(event) => setFilters((prev) => ({ ...prev, q: event.target.value }))}
              placeholder={t.searchPlaceholder}
              className="w-full rounded-xl border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm outline-none ring-cyan-400 transition focus:ring dark:border-slate-700 dark:bg-slate-900"
            />
          </label>

          <select
            value={filters.category}
            onChange={(event) => setFilters((prev) => ({ ...prev, category: event.target.value }))}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-cyan-400 transition focus:ring dark:border-slate-700 dark:bg-slate-900 lg:col-span-2"
          >
            <option value="All">{t.all}</option>
            {PRODUCT_CATEGORIES.map((item) => (
              <option key={item} value={item}>
                {getCategoryLabel(item)}
              </option>
            ))}
          </select>

          <select
            value={filters.condition}
            onChange={(event) => setFilters((prev) => ({ ...prev, condition: event.target.value }))}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-cyan-400 transition focus:ring dark:border-slate-700 dark:bg-slate-900 lg:col-span-2"
          >
            <option value="All">{t.all}</option>
            {PRODUCT_CONDITIONS.map((item) => (
              <option key={item} value={item}>
                {getConditionLabel(item)}
              </option>
            ))}
          </select>

          <select
            value={filters.rarity}
            onChange={(event) => setFilters((prev) => ({ ...prev, rarity: event.target.value }))}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-cyan-400 transition focus:ring dark:border-slate-700 dark:bg-slate-900 lg:col-span-2"
          >
            <option value="All">{t.all}</option>
            {PRODUCT_RARITIES.map((item) => (
              <option key={item} value={item}>
                {getRarityLabel(item)}
              </option>
            ))}
          </select>

          <select
            value={filters.sort}
            onChange={(event) => setFilters((prev) => ({ ...prev, sort: event.target.value }))}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-cyan-400 transition focus:ring dark:border-slate-700 dark:bg-slate-900 lg:col-span-2"
          >
            <option value="newest">{t.newest}</option>
            <option value="priceAsc">{t.priceLowToHigh}</option>
            <option value="priceDesc">{t.priceHighToLow}</option>
            <option value="stockDesc">{t.stockHighToLow}</option>
          </select>

          <input
            type="number"
            min={0}
            value={filters.min}
            onChange={(event) => setFilters((prev) => ({ ...prev, min: event.target.value }))}
            placeholder={t.min}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-cyan-400 transition focus:ring dark:border-slate-700 dark:bg-slate-900 lg:col-span-1"
          />

          <input
            type="number"
            min={0}
            value={filters.max}
            onChange={(event) => setFilters((prev) => ({ ...prev, max: event.target.value }))}
            placeholder={t.max}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-cyan-400 transition focus:ring dark:border-slate-700 dark:bg-slate-900 lg:col-span-1"
          />
        </div>
      </section>

      <section className="mt-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">{t.items}</h2>
          <span className="text-sm text-slate-500 dark:text-slate-300">
            {products.length} {t.found}
          </span>
        </div>

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
          <EmptyState title={t.emptyTitle} description={t.emptyDescription} />
        )}
      </section>
    </AnimatedPage>
  );
}
