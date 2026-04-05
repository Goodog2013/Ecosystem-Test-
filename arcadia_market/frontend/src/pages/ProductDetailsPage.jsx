import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { Heart, MessageSquare, ShieldCheck, ShoppingCart, Sparkles, Star, Trash2, X } from "lucide-react";
import toast from "react-hot-toast";
import { api } from "../lib/api";
import { LIVE_UI_EVENTS, onLiveUIEvent } from "../lib/liveEvents";
import { formatCoins, relativeDate } from "../lib/format";
import { useAuthStore } from "../store/authStore";
import { useCartStore } from "../store/cartStore";
import { useWishlistStore } from "../store/wishlistStore";
import { getCategoryLabel, getConditionLabel, getRarityLabel } from "../constants/marketOptions";
import AnimatedPage from "../components/AnimatedPage";
import ProductCard from "../components/ProductCard";
import SkeletonCard from "../components/SkeletonCard";
import EmptyState from "../components/EmptyState";
import CurrencyIcon from "../components/CurrencyIcon";

export default function ProductDetailsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, token } = useAuthStore();
  const { addToCart } = useCartStore();
  const wishlistIds = useWishlistStore((state) => state.ids);
  const fetchWishlistIds = useWishlistStore((state) => state.fetchWishlistIds);
  const toggleWishlist = useWishlistStore((state) => state.toggleWishlist);

  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [product, setProduct] = useState(null);
  const [related, setRelated] = useState([]);
  const [relatedLoading, setRelatedLoading] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [activeImage, setActiveImage] = useState("");
  const [togglingWishlist, setTogglingWishlist] = useState(false);
  const [reviews, setReviews] = useState([]);
  const [reviewsSummary, setReviewsSummary] = useState({ total: 0, avgStars: 0 });
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [reviewsError, setReviewsError] = useState("");
  const [isReviewsOpen, setIsReviewsOpen] = useState(false);
  const [deletingReviewId, setDeletingReviewId] = useState("");

  const loadProduct = useCallback(
    async (withLoader = true, showError = true) => {
      try {
        if (withLoader) {
          setLoading(true);
        }

        const data = await api.get(`/products/${id}`);
        const current = data.product || null;
        setProduct(current);
        setRelatedLoading(true);

        if (current) {
          try {
            const unique = new Map();
            const pushCandidates = (list) => {
              for (const item of list || []) {
                if (!item?.id || item.id === current.id || unique.has(item.id)) {
                  continue;
                }
                unique.set(item.id, item);
              }
            };

            if (current.category) {
              const categoryData = await api.get(
                `/products?category=${encodeURIComponent(current.category)}&sort=newest&pageSize=24`
              );
              pushCandidates(categoryData.products);
            }

            if (unique.size < 4) {
              const fallbackData = await api.get("/products?sort=newest&pageSize=24");
              pushCandidates(fallbackData.products);
            }

            const scored = Array.from(unique.values())
              .map((item) => {
                const sameCategory = item.category === current.category ? 1 : 0;
                const sameRarity = item.rarity === current.rarity ? 1 : 0;
                const priceDiff = Math.abs(Number(item.price || 0) - Number(current.price || 0));
                const priceScore = 1 - Math.min(priceDiff / Math.max(Number(current.price || 1), 1), 1);
                return {
                  item,
                  score: sameCategory * 3 + sameRarity * 1.5 + priceScore,
                };
              })
              .sort((a, b) => b.score - a.score)
              .map((entry) => entry.item)
              .slice(0, 4);

            setRelated(scored);
          } catch (_err) {
            setRelated([]);
          }
        } else {
          setRelated([]);
        }
      } catch (err) {
        if (showError) {
          toast.error(err.message || "Не удалось загрузить товар");
        }
        setProduct(null);
        setRelated([]);
      } finally {
        setRelatedLoading(false);
        if (withLoader) {
          setLoading(false);
        }
      }
    },
    [id]
  );

  const loadReviews = useCallback(
    async ({ withLoader = true, silent = false } = {}) => {
      try {
        if (withLoader) {
          setReviewsLoading(true);
        }
        setReviewsError("");
        const data = await api.get(`/products/${id}/reviews?limit=80`);
        setReviews(Array.isArray(data.reviews) ? data.reviews : []);
        setReviewsSummary({
          total: Number(data?.summary?.total || 0),
          avgStars: Number(data?.summary?.avgStars || 0),
        });
      } catch (err) {
        setReviews([]);
        setReviewsSummary({ total: 0, avgStars: 0 });
        const message = err.message || "Не удалось загрузить отзывы";
        setReviewsError(message);
        if (!silent) {
          toast.error(message);
        }
      } finally {
        if (withLoader) {
          setReviewsLoading(false);
        }
      }
    },
    [id]
  );

  useEffect(() => {
    loadProduct(true, true);
  }, [loadProduct]);

  useEffect(() => {
    setIsReviewsOpen(false);
    loadReviews({ withLoader: false, silent: true });
  }, [loadReviews]);

  useEffect(() => {
    return onLiveUIEvent(LIVE_UI_EVENTS.CATALOG_CHANGED, () => {
      loadProduct(false, false);
    });
  }, [loadProduct]);

  useEffect(() => {
    return onLiveUIEvent(LIVE_UI_EVENTS.REVIEWS_CHANGED, (event) => {
      const changedProductId = String(event?.detail?.productId || "");
      const changedSellerId = String(event?.detail?.sellerId || "");
      const currentSellerId = String(product?.seller?.id || "");

      const sameProduct = changedProductId && changedProductId === String(id);
      const sameSeller = changedSellerId && currentSellerId && changedSellerId === currentSellerId;
      if (!sameProduct && !sameSeller) {
        return;
      }

      loadProduct(false, false);
      if (sameProduct) {
        loadReviews({ withLoader: false, silent: true });
      }
    });
  }, [id, product?.seller?.id, loadProduct, loadReviews]);

  useEffect(() => {
    if (!isReviewsOpen) {
      return undefined;
    }
    const onEscape = (event) => {
      if (event.key === "Escape") {
        setIsReviewsOpen(false);
      }
    };
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("keydown", onEscape);
    };
  }, [isReviewsOpen]);

  const maxQty = useMemo(() => Math.max(1, Number(product?.stock || 1)), [product?.stock]);

  useEffect(() => {
    setQuantity(1);
  }, [id]);

  useEffect(() => {
    if (!user) {
      return;
    }
    fetchWishlistIds();
  }, [user, fetchWishlistIds]);

  useEffect(() => {
    const fallback = product?.image || "";
    const first = Array.isArray(product?.images) && product.images.length ? product.images[0] : fallback;
    setActiveImage(first || "");
  }, [product]);

  const galleryImages = useMemo(() => {
    const list = Array.isArray(product?.images) ? product.images.filter(Boolean) : [];
    if (product?.image && !list.includes(product.image)) {
      list.unshift(product.image);
    }
    return list.slice(0, 8);
  }, [product]);

  const handleAdd = async () => {
    if (!product) return;
    if (!user) {
      navigate("/auth", { state: { from: location.pathname } });
      return;
    }

    try {
      setAdding(true);
      await addToCart(product.id, quantity);
      toast.success("Товар добавлен в корзину");
    } catch (err) {
      toast.error(err.message || "Не удалось добавить в корзину");
    } finally {
      setAdding(false);
    }
  };

  const handleToggleWishlist = async () => {
    if (!product?.id) {
      return;
    }
    if (!user) {
      navigate("/auth", { state: { from: location.pathname } });
      return;
    }

    try {
      setTogglingWishlist(true);
      const nowWished = await toggleWishlist(product.id);
      toast.success(nowWished ? "Добавлено в вишлист" : "Удалено из вишлиста");
    } catch (err) {
      toast.error(err.message || "Не удалось обновить вишлист");
    } finally {
      setTogglingWishlist(false);
    }
  };

  const openReviewsModal = () => {
    setIsReviewsOpen(true);
    loadReviews({ withLoader: true, silent: true });
  };

  const canDeleteReview = (review) => {
    if (!user || !review?.id) {
      return false;
    }
    if (user.role === "admin") {
      return true;
    }
    return user.id === review?.buyer?.id || user.id === product?.seller?.id;
  };

  const deleteReview = async (review) => {
    if (!token || !review?.id || deletingReviewId) {
      return;
    }
    try {
      setDeletingReviewId(review.id);
      const data = await api.delete(`/reviews/${review.id}`, token);
      setReviews((prev) => prev.filter((item) => item.id !== review.id));
      setReviewsSummary((prev) => ({
        total: Math.max(0, Number(prev?.total || 0) - 1),
        avgStars: Number(prev?.avgStars || 0),
      }));
      if (data?.seller?.id && product?.seller?.id === data.seller.id) {
        setProduct((prev) =>
          prev
            ? {
                ...prev,
                seller: {
                  ...(prev.seller || {}),
                  rating: Number(data.seller.rating || 0),
                },
              }
            : prev
        );
      }
      toast.success("Отзыв удален");
      loadReviews({ withLoader: false, silent: true });
    } catch (err) {
      toast.error(err.message || "Не удалось удалить отзыв");
    } finally {
      setDeletingReviewId("");
    }
  };

  if (loading) {
    return (
      <AnimatedPage>
        <div className="grid gap-5 lg:grid-cols-5">
          <div className="h-[420px] rounded-3xl bg-slate-200 animate-pulse dark:bg-slate-800 lg:col-span-3" />
          <div className="space-y-3 rounded-3xl border border-slate-200/80 bg-white/80 p-5 dark:border-slate-700/70 dark:bg-slate-900/70 lg:col-span-2">
            <div className="h-7 w-2/3 rounded bg-slate-200 animate-pulse dark:bg-slate-800" />
            <div className="h-4 w-full rounded bg-slate-200 animate-pulse dark:bg-slate-800" />
            <div className="h-4 w-4/5 rounded bg-slate-200 animate-pulse dark:bg-slate-800" />
            <div className="h-10 w-40 rounded-xl bg-slate-200 animate-pulse dark:bg-slate-800" />
          </div>
        </div>
      </AnimatedPage>
    );
  }

  if (!product) {
    return (
      <AnimatedPage>
        <EmptyState
          title="Товар не найден"
          description="Этот лот мог быть удален или уже распродан."
          action={
            <Link
              to="/catalog"
              className="inline-flex rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-cyan-600"
            >
              Вернуться в каталог
            </Link>
          }
        />
      </AnimatedPage>
    );
  }

  const isOwnItem = user?.id === product.seller?.id;
  const unavailable = !product.isListed || product.stock <= 0;
  const wished = (wishlistIds || []).includes(product.id);

  return (
    <AnimatedPage>
      <section className="grid gap-5 lg:grid-cols-5">
        <div className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white/85 shadow-lg dark:border-slate-700/70 dark:bg-slate-900/75 lg:col-span-3">
          <img src={activeImage || product.image} alt={product.title} className="h-[440px] w-full object-cover" />
          {galleryImages.length > 1 ? (
            <div className="grid grid-cols-5 gap-2 border-t border-slate-200/80 bg-slate-50/80 p-3 dark:border-slate-700/70 dark:bg-slate-950/30 sm:grid-cols-6">
              {galleryImages.map((img) => (
                <button
                  key={img}
                  type="button"
                  onClick={() => setActiveImage(img)}
                  className={`overflow-hidden rounded-xl border transition ${
                    img === (activeImage || product.image)
                      ? "border-cyan-500 ring-2 ring-cyan-300/60 dark:ring-cyan-700/60"
                      : "border-slate-300 hover:border-cyan-400 dark:border-slate-700"
                  }`}
                >
                  <img src={img} alt={product.title} className="h-16 w-full object-cover" loading="lazy" />
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="rounded-3xl border border-slate-200/80 bg-white/85 p-5 shadow-lg dark:border-slate-700/70 dark:bg-slate-900/75 lg:col-span-2">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full bg-cyan-100 px-2 py-1 font-semibold text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-200">
              {getCategoryLabel(product.category)}
            </span>
            <span className="rounded-full bg-indigo-100 px-2 py-1 font-semibold text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-200">
              {getRarityLabel(product.rarity)}
            </span>
            <span className="rounded-full bg-slate-100 px-2 py-1 font-semibold text-slate-700 dark:bg-slate-700 dark:text-slate-200">
              {getConditionLabel(product.condition)}
            </span>
          </div>

          <h1 className="mt-3 text-3xl font-extrabold text-slate-900 dark:text-slate-50">{product.title}</h1>
          <p className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-300">{product.description}</p>

          <p className="mt-4 inline-flex items-center gap-2 text-3xl font-black text-cyan-600 dark:text-cyan-300">
            <CurrencyIcon size={24} />
            {formatCoins(product.price)} ₽
          </p>

          <div className="mt-4 rounded-2xl bg-slate-100/80 p-3 text-sm dark:bg-slate-800/70">
            <p className="font-semibold text-slate-900 dark:text-slate-100">Продавец: {product.seller?.username}</p>
            <p className="text-slate-600 dark:text-slate-300">Рейтинг: {Number(product.seller?.rating || 0).toFixed(1)}</p>
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={openReviewsModal}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 transition hover:border-cyan-400 hover:text-cyan-700 dark:border-slate-600 dark:bg-slate-900/60 dark:text-slate-200 dark:hover:border-cyan-500 dark:hover:text-cyan-200"
              >
                <MessageSquare size={13} />
                Отзывы ({reviewsSummary.total})
              </button>
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-500 dark:text-amber-300">
                <Star size={12} className="fill-current" />
                {reviewsSummary.total > 0 ? Number(reviewsSummary.avgStars || 0).toFixed(1) : "0.0"}
              </span>
            </div>
            <p className="text-slate-600 dark:text-slate-300">Размещен: {relativeDate(product.createdAt)}</p>
            <p className="text-slate-600 dark:text-slate-300">Доступно: {product.stock}</p>
          </div>

          <div className="mt-5 flex items-center gap-2">
            <label className="text-sm font-semibold text-slate-700 dark:text-slate-200" htmlFor="qty-field">
              Кол-во:
            </label>
            <input
              id="qty-field"
              type="number"
              min={1}
              max={maxQty}
              value={quantity}
              onChange={(event) => {
                const next = Number(event.target.value || 1);
                setQuantity(Math.max(1, Math.min(maxQty, next)));
              }}
              className="w-24 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-cyan-400 focus:ring dark:border-slate-700 dark:bg-slate-900"
            />
          </div>

          {isOwnItem && (
            <p className="mt-3 inline-flex items-center gap-2 rounded-xl bg-amber-100 px-3 py-2 text-sm font-medium text-amber-700 dark:bg-amber-900/35 dark:text-amber-200">
              <ShieldCheck size={16} />
              Это ваш лот.
            </p>
          )}

          {unavailable && (
            <p className="mt-3 rounded-xl bg-rose-100 px-3 py-2 text-sm font-medium text-rose-700 dark:bg-rose-900/35 dark:text-rose-200">
              Этот товар сейчас недоступен.
            </p>
          )}

          <div className="mt-5 grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={handleAdd}
              disabled={adding || isOwnItem || unavailable}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-500 px-4 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-cyan-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <ShoppingCart size={16} />
              {adding ? "Добавление..." : "В корзину"}
            </button>
            <button
              type="button"
              onClick={handleToggleWishlist}
              disabled={togglingWishlist}
              className={`inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition ${
                wished
                  ? "bg-rose-500 text-white hover:bg-rose-600"
                  : "bg-slate-200 text-slate-700 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-100 dark:hover:bg-slate-600"
              }`}
            >
              <Heart size={16} className={wished ? "fill-current" : ""} />
              {wished ? "В вишлисте" : "В вишлист"}
            </button>
          </div>
        </div>
      </section>

      <section className="mt-10">
        <div className="mb-4 flex items-center gap-2">
          <Sparkles className="text-cyan-500" size={18} />
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">Похожие товары</h2>
        </div>

        {relatedLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <SkeletonCard key={index} />
            ))}
          </div>
        ) : related.length ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {related.map((item) => (
              <ProductCard key={item.id} product={item} />
            ))}
          </div>
        ) : (
          <EmptyState title="Пока нет похожих товаров" description="Вернитесь позже или посмотрите новые лоты в каталоге." />
        )}
      </section>

      {isReviewsOpen ? (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/70 px-4 backdrop-blur-sm"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setIsReviewsOpen(false);
            }
          }}
        >
          <div className="w-full max-w-2xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-700">
              <div>
                <h3 className="text-lg font-black text-slate-900 dark:text-slate-100">Отзывы о товаре</h3>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                  {reviewsSummary.total} шт. • средняя оценка {reviewsSummary.total > 0 ? Number(reviewsSummary.avgStars || 0).toFixed(1) : "0.0"}/5
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsReviewsOpen(false)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-300 text-slate-600 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                aria-label="Закрыть отзывы"
              >
                <X size={16} />
              </button>
            </div>

            <div className="max-h-[65vh] overflow-y-auto p-5">
              {reviewsLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 3 }).map((_, index) => (
                    <div
                      key={index}
                      className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/70"
                    >
                      <div className="h-4 w-32 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
                      <div className="mt-2 h-3 w-24 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
                      <div className="mt-3 h-3 w-full animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
                    </div>
                  ))}
                </div>
              ) : reviews.length ? (
                <div className="space-y-3">
                  {reviews.map((review) => (
                    <article
                      key={review.id}
                      className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/70"
                    >
                      <div className="flex items-start gap-3">
                        {review?.buyer?.avatar ? (
                          <img
                            src={review.buyer.avatar}
                            alt={review?.buyer?.username || "Покупатель"}
                            className="h-10 w-10 rounded-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-300 text-sm font-bold text-slate-700 dark:bg-slate-700 dark:text-slate-100">
                            {String(review?.buyer?.username || "?")
                              .slice(0, 1)
                              .toUpperCase()}
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-sm font-bold text-slate-900 dark:text-slate-100">
                              {review?.buyer?.username || "Покупатель"}
                            </p>
                            <div className="inline-flex items-center gap-2">
                              <span className="text-xs text-slate-500 dark:text-slate-400">
                                {review.createdAt ? relativeDate(review.createdAt) : ""}
                              </span>
                              {canDeleteReview(review) ? (
                                <button
                                  type="button"
                                  onClick={() => deleteReview(review)}
                                  disabled={deletingReviewId === review.id}
                                  className="inline-flex items-center gap-1 rounded-lg border border-rose-300 px-2 py-1 text-[11px] font-semibold text-rose-600 transition hover:bg-rose-50 disabled:opacity-70 dark:border-rose-800 dark:text-rose-300 dark:hover:bg-rose-900/20"
                                >
                                  <Trash2 size={11} />
                                  {deletingReviewId === review.id ? "Удаление..." : "Удалить"}
                                </button>
                              ) : null}
                            </div>
                          </div>
                          <div className="mt-1 inline-flex items-center gap-1 text-amber-500 dark:text-amber-300">
                            {Array.from({ length: 5 }).map((_, index) => (
                              <Star
                                key={`${review.id}-${index}`}
                                size={13}
                                className={index < Number(review.stars || 0) ? "fill-current" : "text-slate-300 dark:text-slate-600"}
                              />
                            ))}
                            <span className="ml-1 text-xs font-semibold text-slate-600 dark:text-slate-300">
                              {Number(review.stars || 0)}/5
                            </span>
                          </div>
                        </div>
                      </div>

                      {review.comment ? (
                        <p className="mt-3 whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-200">{review.comment}</p>
                      ) : null}
                      {review.image ? (
                        <div className="mt-3">
                          <a
                            href={review.image}
                            target="_blank"
                            rel="noreferrer"
                            className="block"
                            title="Открыть файл"
                          >
                            <img
                              src={review.image}
                              alt="Фото из отзыва"
                              className="max-h-64 w-full rounded-xl border border-slate-200 object-cover transition hover:opacity-95 dark:border-slate-700"
                              loading="lazy"
                            />
                          </a>
                          <div className="mt-2">
                            <a
                              href={review.image}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center rounded-lg border border-cyan-300 px-3 py-1.5 text-xs font-semibold text-cyan-700 transition hover:bg-cyan-50 dark:border-cyan-700 dark:text-cyan-300 dark:hover:bg-cyan-900/20"
                            >
                              Открыть файл
                            </a>
                          </div>
                        </div>
                      ) : null}
                    </article>
                  ))}
                </div>
              ) : (
                <p className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-600 dark:border-slate-700 dark:text-slate-300">
                  Отзывов пока нет.
                </p>
              )}

              {!reviewsLoading && reviewsError ? (
                <p className="mt-3 text-sm font-semibold text-rose-600 dark:text-rose-300">{reviewsError}</p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </AnimatedPage>
  );
}
