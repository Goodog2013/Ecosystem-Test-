import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Copy, CreditCard, KeyRound, MapPin, Minus, Plus, QrCode, ShoppingBag, Tag, Trash2, X, XCircle } from "lucide-react";
import toast from "react-hot-toast";
import AnimatedPage from "../components/AnimatedPage";
import EmptyState from "../components/EmptyState";
import { LIVE_UI_EVENTS, onLiveUIEvent } from "../lib/liveEvents";
import { api } from "../lib/api";
import { formatCoins, relativeDate } from "../lib/format";
import { useCartStore } from "../store/cartStore";
import { useAuthStore } from "../store/authStore";
import CurrencyIcon from "../components/CurrencyIcon";

export default function CartPage() {
  const navigate = useNavigate();
  const { items, total, loading, pickupSellers, pickupReady, fetchCart, updateQuantity, removeItem, checkout } = useCartStore();
  const { user, refreshMe, token } = useAuthStore();
  const [submitting, setSubmitting] = useState(false);
  const [promoInput, setPromoInput] = useState("");
  const [promoPreview, setPromoPreview] = useState(null);
  const [applyingPromo, setApplyingPromo] = useState(false);
  const [pickupBySeller, setPickupBySeller] = useState({});
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("linked");
  const [mbCardIdInput, setMbCardIdInput] = useState("");
  const [mbPasswordInput, setMbPasswordInput] = useState("");
  const [qrModal, setQrModal] = useState(null);
  const [creatingQr, setCreatingQr] = useState(false);
  const hasBankLink = Boolean(user?.bank?.linked);
  const linkedMbCardId = String(user?.bank?.cardId || "")
    .replace(/\D/g, "")
    .slice(0, 12);

  useEffect(() => {
    fetchCart();
  }, [fetchCart]);

  useEffect(() => {
    const stopCart = onLiveUIEvent(LIVE_UI_EVENTS.CART_CHANGED, () => {
      fetchCart();
    });
    const stopCatalog = onLiveUIEvent(LIVE_UI_EVENTS.CATALOG_CHANGED, () => {
      fetchCart();
    });

    return () => {
      stopCart();
      stopCatalog();
    };
  }, [fetchCart]);

  const serviceFee = useMemo(() => 0, []);
  const promoDiscount = Number(promoPreview?.promoApplied ? promoPreview.discountTotal || 0 : 0);
  const payableTotal = Number(promoPreview?.promoApplied ? promoPreview.payableTotal || total : total);
  const grandTotal = Math.max(0, payableTotal + serviceFee);
  const sellerWithoutPickup = (pickupSellers || []).find((seller) => !Array.isArray(seller?.points) || !seller.points.length);
  const sellerWithoutSelection = (pickupSellers || []).find((seller) => {
    const sellerId = String(seller?.sellerId || "");
    const points = Array.isArray(seller?.points) ? seller.points : [];
    if (!sellerId || !points.length) {
      return false;
    }
    return !String(pickupBySeller?.[sellerId] || "").trim();
  });
  const checkoutBlockedByPickup = Boolean(sellerWithoutPickup || sellerWithoutSelection || pickupReady === false);

  useEffect(() => {
    if (!items.length) {
      setPromoPreview(null);
      setPromoInput("");
    }
  }, [items.length]);

  useEffect(() => {
    setPickupBySeller((prev) => {
      const next = {};
      for (const seller of pickupSellers || []) {
        const sellerId = String(seller?.sellerId || "");
        if (!sellerId) {
          continue;
        }
        const points = Array.isArray(seller?.points) ? seller.points : [];
        const current = String(prev?.[sellerId] || "");
        const stillValid = points.some((point) => String(point?.id || "") === current);
        next[sellerId] = stillValid ? current : String(points[0]?.id || "");
      }
      return next;
    });
  }, [pickupSellers]);

  useEffect(() => {
    const activeCode = String(promoPreview?.promo?.code || "");
    if (!activeCode || !token || !items.length) {
      return undefined;
    }
    let cancelled = false;

    const refreshPromoPreview = async () => {
      try {
        const data = await api.post("/cart/promo/preview", { code: activeCode }, token);
        if (!cancelled) {
          setPromoPreview(data || null);
        }
      } catch (err) {
        if (!cancelled) {
          setPromoPreview(null);
          setPromoInput("");
          toast.error(err.message || "Промокод больше не действует");
        }
      }
    };

    refreshPromoPreview();
    return () => {
      cancelled = true;
    };
  }, [token, items, total, promoPreview?.promo?.code]);

  const changeQty = async (item, delta) => {
    const next = Math.max(1, Math.min(item.product.stock, item.quantity + delta));
    if (next === item.quantity) return;

    try {
      await updateQuantity(item.id, next);
    } catch (err) {
      toast.error(err.message || "Не удалось изменить количество");
    }
  };

  const onRemove = async (itemId) => {
    try {
      await removeItem(itemId);
      toast.success("Удалено из корзины");
    } catch (err) {
      toast.error(err.message || "Не удалось удалить товар");
    }
  };

  const validateCheckoutPrerequisites = () => {
    if (sellerWithoutPickup) {
      toast.error(`У продавца ${sellerWithoutPickup.sellerUsername || "без имени"} нет активного пункта выдачи.`);
      return false;
    }
    if (sellerWithoutSelection) {
      toast.error(`Выберите пункт выдачи для продавца ${sellerWithoutSelection.sellerUsername || "без имени"}.`);
      return false;
    }
    return true;
  };

  const openPaymentModal = () => {
    if (!validateCheckoutPrerequisites()) {
      return;
    }
    setPaymentMethod(hasBankLink ? "linked" : "qr");
    setMbCardIdInput(linkedMbCardId || "");
    setMbPasswordInput("");
    setPaymentModalOpen(true);
  };

  const onCheckout = async (method = "linked", cardId = "", cardPassword = "") => {
    if (!validateCheckoutPrerequisites()) {
      return false;
    }
    let cardIdToSend = String(cardId || "");
    let passwordToSend = String(cardPassword || "");
    if (method === "card_auth") {
      const enteredCardId = String(cardIdToSend || "")
        .replace(/\D/g, "")
        .slice(0, 12);
      const safeCardId = enteredCardId || linkedMbCardId;
      const safePassword = String(passwordToSend || "");
      if (!safeCardId || !safePassword) {
        toast.error("Введите ID карты и пароль MB Банка");
        return false;
      }
      cardIdToSend = safeCardId;
      passwordToSend = safePassword;
    }
    try {
      setSubmitting(true);
      await checkout({
        promoCode: promoPreview?.promoApplied ? promoPreview?.promo?.code : "",
        pickupBySeller,
        paymentMethod: method,
        mbCardId: cardIdToSend,
        mbPassword: passwordToSend,
      });
      await refreshMe();
      toast.success("Покупка завершена");
      navigate("/orders");
      return true;
    } catch (err) {
      toast.error(err.message || "Не удалось оформить заказ");
      return false;
    } finally {
      setSubmitting(false);
    }
  };

  const onCreateQrCheckout = async () => {
    if (!validateCheckoutPrerequisites()) {
      return false;
    }
    if (!token) {
      toast.error("Сначала войдите в аккаунт.");
      return false;
    }
    try {
      setCreatingQr(true);
      const data = await api.post(
        "/cart/checkout/qr",
        {
          promoCode: promoPreview?.promoApplied ? promoPreview?.promo?.code : "",
          pickupBySeller,
        },
        token
      );
      setQrModal({
        qrToken: String(data?.qrToken || ""),
        qrDataUrl: String(data?.qrDataUrl || ""),
        qrPayload: String(data?.qrPayload || ""),
        expiresAt: String(data?.expiresAt || ""),
        expectedTotal: Number(data?.expectedTotal || 0),
        status: "pending",
        lastError: "",
      });
      return true;
    } catch (err) {
      toast.error(err.message || "Не удалось создать QR для оплаты");
      return false;
    } finally {
      setCreatingQr(false);
    }
  };

  const onSubmitPayment = async () => {
    if (paymentMethod === "qr") {
      const ok = await onCreateQrCheckout();
      if (ok) {
        setPaymentModalOpen(false);
      }
      return;
    }

    if (paymentMethod === "card_auth") {
      const ok = await onCheckout("card_auth", mbCardIdInput, mbPasswordInput);
      if (ok) {
        setPaymentModalOpen(false);
      }
      return;
    }

    if (!hasBankLink) {
      toast.error("Привяжите MB Банк для оплаты по привязанной карте или выберите QR / ID карты + пароль.");
      return;
    }
    const ok = await onCheckout("linked");
    if (ok) {
      setPaymentModalOpen(false);
    }
  };

  const onCopyQrPayload = async () => {
    const payload = String(qrModal?.qrPayload || "").trim();
    if (!payload) {
      return;
    }
    try {
      await navigator.clipboard.writeText(payload);
      toast.success("Код QR скопирован");
    } catch (_err) {
      toast.error("Не удалось скопировать код");
    }
  };

  useEffect(() => {
    const qrToken = String(qrModal?.qrToken || "").trim();
    if (!qrToken || !token) {
      return undefined;
    }

    let cancelled = false;
    let timer = null;

    const pollStatus = async () => {
      try {
        const data = await api.get(`/cart/checkout/qr/${encodeURIComponent(qrToken)}`, token);
        if (cancelled) {
          return;
        }
        const status = String(data?.status || "pending")
          .trim()
          .toLowerCase();
        const orderId = String(data?.order?.id || "").trim();
        if (status === "paid" && orderId) {
          setQrModal(null);
          await refreshMe();
          await fetchCart();
          toast.success("Оплата по QR подтверждена");
          navigate("/orders");
          return;
        }
        setQrModal((prev) => {
          if (!prev) {
            return prev;
          }
          return {
            ...prev,
            status,
            expiresAt: String(data?.expiresAt || prev.expiresAt || ""),
            lastError: String(data?.lastError || ""),
          };
        });
      } catch (_err) {
        // keep modal open, next poll may recover
      }
      if (!cancelled) {
        timer = setTimeout(pollStatus, 1500);
      }
    };

    pollStatus();
    return () => {
      cancelled = true;
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [qrModal?.qrToken, token, navigate, refreshMe, fetchCart]);

  const onApplyPromo = async () => {
    const code = String(promoInput || "").trim();
    if (!code) {
      toast.error("Введите промокод");
      return;
    }
    if (!token) {
      toast.error("Сначала войдите в аккаунт.");
      return;
    }
    try {
      setApplyingPromo(true);
      const data = await api.post("/cart/promo/preview", { code }, token);
      setPromoPreview(data || null);
      if (data?.promo?.code) {
        setPromoInput(data.promo.code);
      }
      toast.success("Промокод применен");
    } catch (err) {
      toast.error(err.message || "Не удалось применить промокод");
    } finally {
      setApplyingPromo(false);
    }
  };

  const onClearPromo = () => {
    setPromoPreview(null);
    setPromoInput("");
  };

  return (
    <AnimatedPage>
      <h1 className="text-3xl font-black text-slate-900 dark:text-slate-100">Корзина и оформление</h1>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
        Проверьте количество перед оформлением. Оплата и зачисления выполняются через MB Банк.
      </p>

      {loading ? (
        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          <div className="space-y-3 lg:col-span-2">
            {Array.from({ length: 3 }).map((_, idx) => (
              <div
                key={idx}
                className="h-32 rounded-2xl border border-slate-200/70 bg-white/70 animate-pulse dark:border-slate-700/70 dark:bg-slate-900/70"
              />
            ))}
          </div>
          <div className="h-72 rounded-2xl border border-slate-200/70 bg-white/70 animate-pulse dark:border-slate-700/70 dark:bg-slate-900/70" />
        </div>
      ) : !items.length ? (
        <div className="mt-6">
          <EmptyState
            title="Корзина пуста"
            description="Откройте каталог и добавьте товары для оформления заказа."
            action={
              <Link
                to="/catalog"
                className="inline-flex rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-cyan-600"
              >
                Перейти в каталог
              </Link>
            }
          />
        </div>
      ) : (
        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          <section className="space-y-3 lg:col-span-2">
            {items.map((item) => (
              <article
                key={item.id}
                className="flex flex-col gap-3 rounded-2xl border border-slate-200/80 bg-white/85 p-4 shadow-sm dark:border-slate-700/70 dark:bg-slate-900/75 sm:flex-row"
              >
                <img src={item.product.image} alt={item.product.title} className="h-24 w-full rounded-xl object-cover sm:w-36" />

                <div className="flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-base font-semibold text-slate-900 dark:text-slate-100">{item.product.title}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-300">продавец: {item.product.seller?.username}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onRemove(item.id)}
                      className="rounded-lg bg-rose-100 p-2 text-rose-700 transition hover:bg-rose-200 dark:bg-rose-900/35 dark:text-rose-200"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                    <div className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-2 py-1 dark:border-slate-600">
                      <button
                        type="button"
                        onClick={() => changeQty(item, -1)}
                        className="rounded-md bg-slate-100 p-1 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200"
                      >
                        <Minus size={14} />
                      </button>
                      <span className="min-w-7 text-center text-sm font-semibold">{item.quantity}</span>
                      <button
                        type="button"
                        onClick={() => changeQty(item, 1)}
                        className="rounded-md bg-slate-100 p-1 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200"
                      >
                        <Plus size={14} />
                      </button>
                    </div>

                    <p className="inline-flex items-center gap-1 text-sm font-bold text-cyan-600 dark:text-cyan-300">
                      <CurrencyIcon size={15} />
                      {formatCoins(item.lineTotal)}
                    </p>
                  </div>
                </div>
              </article>
            ))}
          </section>

          <aside className="h-fit rounded-2xl border border-slate-200/80 bg-white/85 p-5 shadow-sm dark:border-slate-700/70 dark:bg-slate-900/75">
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Сводка заказа</h2>

            <div className="mt-4 rounded-xl border border-slate-200/80 bg-slate-50/70 p-3 dark:border-slate-700/70 dark:bg-slate-800/40">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Промокод</p>
              <div className="flex items-center gap-2">
                <input
                  value={promoInput}
                  onChange={(event) => setPromoInput(event.target.value.toUpperCase().slice(0, 32))}
                  placeholder="Например: SKIN20"
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-cyan-400 focus:ring dark:border-slate-700 dark:bg-slate-900"
                />
                <button
                  type="button"
                  onClick={onApplyPromo}
                  disabled={applyingPromo}
                  className="inline-flex items-center gap-1 rounded-xl bg-indigo-500 px-3 py-2 text-xs font-semibold text-white transition hover:bg-indigo-600 disabled:opacity-70"
                >
                  <Tag size={13} />
                  {applyingPromo ? "..." : "Применить"}
                </button>
              </div>
              {promoPreview?.promoApplied ? (
                <div className="mt-2 flex items-center justify-between rounded-lg border border-emerald-300/70 bg-emerald-50/80 px-2 py-1.5 text-xs text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300">
                  <span>
                    {promoPreview?.promo?.code} • -{promoPreview?.promo?.percent}% на "{promoPreview?.promo?.productTitle || "товар"}"
                  </span>
                  <button type="button" onClick={onClearPromo} className="inline-flex items-center gap-1 hover:opacity-80">
                    <XCircle size={12} />
                    Сбросить
                  </button>
                </div>
              ) : null}
            </div>

            <div className="mt-4 rounded-xl border border-slate-200/80 bg-slate-50/70 p-3 dark:border-slate-700/70 dark:bg-slate-800/40">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Пункты выдачи</p>
              <div className="space-y-2">
                {(pickupSellers || []).map((seller) => {
                  const sellerId = String(seller?.sellerId || "");
                  const points = Array.isArray(seller?.points) ? seller.points : [];
                  const selectedPointId = String(pickupBySeller?.[sellerId] || "");
                  const selectedPoint = points.find((point) => String(point?.id || "") === selectedPointId) || points[0] || null;
                  return (
                    <div
                      key={sellerId || seller?.sellerUsername}
                      className="rounded-lg border border-slate-200/80 bg-white/85 p-2 dark:border-slate-700/80 dark:bg-slate-900/70"
                    >
                      <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                        Продавец: {seller?.sellerUsername || "Без имени"}
                      </p>
                      {points.length ? (
                        <>
                          <select
                            value={selectedPointId}
                            onChange={(event) =>
                              setPickupBySeller((prev) => ({
                                ...prev,
                                [sellerId]: event.target.value,
                              }))
                            }
                            className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-2 py-1.5 text-xs outline-none ring-cyan-400 focus:ring dark:border-slate-700 dark:bg-slate-900"
                          >
                            {points.map((point) => (
                              <option key={point.id} value={point.id}>
                                {point.name} • {point.address}
                              </option>
                            ))}
                          </select>
                          {selectedPoint ? (
                            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                              {selectedPoint.city ? `${selectedPoint.city}, ` : ""}
                              {selectedPoint.address}
                              {selectedPoint.details ? ` • ${selectedPoint.details}` : ""}
                            </p>
                          ) : null}
                        </>
                      ) : (
                        <p className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-rose-600 dark:text-rose-300">
                          <MapPin size={12} />
                          У продавца нет активных пунктов выдачи
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="mt-4 space-y-2 text-sm">
              <div className="flex items-center justify-between text-slate-600 dark:text-slate-300">
                <span>Товары</span>
                <span>{formatCoins(total)}</span>
              </div>
              {promoDiscount > 0 ? (
                <div className="flex items-center justify-between text-emerald-600 dark:text-emerald-300">
                  <span>Скидка по промокоду</span>
                  <span>-{formatCoins(promoDiscount)}</span>
                </div>
              ) : null}
              <div className="flex items-center justify-between text-slate-600 dark:text-slate-300">
                <span>Комиссия платформы</span>
                <span>{formatCoins(serviceFee)}</span>
              </div>
              <div className="mt-2 border-t border-slate-200 pt-2 dark:border-slate-700" />
              <div className="flex items-center justify-between text-base font-bold text-slate-900 dark:text-slate-100">
                <span>Итого</span>
                <span>{formatCoins(grandTotal)} ₽</span>
              </div>
            </div>

            <button
              type="button"
              onClick={openPaymentModal}
              disabled={submitting || creatingQr || checkoutBlockedByPickup}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-cyan-600 disabled:cursor-not-allowed disabled:opacity-70"
            >
              <ShoppingBag size={16} />
              {submitting || creatingQr ? "Обработка..." : "Выбрать способ оплаты"}
            </button>

            <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
              {hasBankLink
                ? checkoutBlockedByPickup
                  ? "Для оформления нужно выбрать пункт выдачи по каждому продавцу. Если пунктов нет, попросите продавца добавить их."
                  : "Выберите в поп-апе: привязанная карта, QR или ID карты + пароль MB Банка."
                : checkoutBlockedByPickup
                  ? "Для оформления нужно выбрать пункт выдачи по каждому продавцу. Если пунктов нет, попросите продавца добавить их."
                  : "Без привязки доступна оплата по QR и ID карты + пароль. Оплата по привязанной карте требует связку MB Банка."}
            </p>
          </aside>
        </div>
      )}

      {paymentModalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-4"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setPaymentModalOpen(false);
            }
          }}
        >
          <div className="w-full max-w-md rounded-2xl border border-slate-200/90 bg-white p-4 shadow-2xl dark:border-slate-700/80 dark:bg-slate-900">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-black text-slate-900 dark:text-slate-100">Способ оплаты</h3>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Все варианты выполняются через MB Банк.</p>
              </div>
              <button
                type="button"
                onClick={() => setPaymentModalOpen(false)}
                className="rounded-lg bg-slate-100 p-2 text-slate-600 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                <X size={16} />
              </button>
            </div>

            <div className="mt-3 grid grid-cols-1 gap-2">
              <button
                type="button"
                onClick={() => {
                  if (!hasBankLink) {
                    return;
                  }
                  setPaymentMethod("linked");
                }}
                disabled={!hasBankLink}
                className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition ${
                  paymentMethod === "linked"
                    ? "border-cyan-500 bg-cyan-500 text-white"
                    : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                } ${!hasBankLink ? "cursor-not-allowed opacity-60" : ""}`}
              >
                <CreditCard size={16} />
                {hasBankLink ? "По привязанной карте" : "По привязанной карте (недоступно)"}
              </button>
              <button
                type="button"
                onClick={() => setPaymentMethod("qr")}
                className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition ${
                  paymentMethod === "qr"
                    ? "border-indigo-500 bg-indigo-500 text-white"
                    : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                }`}
              >
                <QrCode size={16} />
                По QR
              </button>
              <button
                type="button"
                onClick={() => setPaymentMethod("card_auth")}
                className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition ${
                  paymentMethod === "card_auth"
                    ? "border-emerald-500 bg-emerald-500 text-white"
                    : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                }`}
              >
                <KeyRound size={16} />
                ID карты + пароль
              </button>
            </div>

            {paymentMethod === "card_auth" ? (
              <div className="mt-3 space-y-2 rounded-xl border border-slate-200/80 bg-slate-50/70 p-3 dark:border-slate-700/70 dark:bg-slate-800/40">
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    ID карты MB (12 цифр)
                  </span>
                  <input
                    value={mbCardIdInput}
                    onChange={(event) => setMbCardIdInput(String(event.target.value || "").replace(/\D/g, "").slice(0, 12))}
                    placeholder="100000000001"
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-cyan-400 focus:ring dark:border-slate-700 dark:bg-slate-900"
                  />
                  {linkedMbCardId ? (
                    <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                      Привязанная карта: {linkedMbCardId}{" "}
                      <button
                        type="button"
                        onClick={() => setMbCardIdInput(linkedMbCardId)}
                        className="font-semibold text-cyan-600 transition hover:opacity-80 dark:text-cyan-300"
                      >
                        Подставить
                      </button>
                    </p>
                  ) : null}
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Пароль MB
                  </span>
                  <input
                    type="password"
                    value={mbPasswordInput}
                    onChange={(event) => setMbPasswordInput(event.target.value)}
                    placeholder="Введите пароль"
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-cyan-400 focus:ring dark:border-slate-700 dark:bg-slate-900"
                  />
                </label>
              </div>
            ) : paymentMethod === "qr" ? (
              <p className="mt-3 rounded-xl border border-indigo-300/70 bg-indigo-50/80 px-3 py-2 text-xs text-indigo-700 dark:border-indigo-800 dark:bg-indigo-900/25 dark:text-indigo-200">
                Система создаст QR, затем оплатите его в MB Банке.
              </p>
            ) : (
              <p className="mt-3 rounded-xl border border-cyan-300/70 bg-cyan-50/80 px-3 py-2 text-xs text-cyan-700 dark:border-cyan-800 dark:bg-cyan-900/25 dark:text-cyan-200">
                Оплата пройдет напрямую со связанного счета MB Банка.
              </p>
            )}

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setPaymentModalOpen(false)}
                disabled={submitting || creatingQr}
                className="rounded-xl bg-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-300 disabled:opacity-70 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={onSubmitPayment}
                disabled={submitting || creatingQr}
                className="inline-flex items-center gap-2 rounded-xl bg-cyan-500 px-3 py-2 text-sm font-semibold text-white transition hover:bg-cyan-600 disabled:opacity-70"
              >
                <ShoppingBag size={15} />
                {submitting || creatingQr ? "Обработка..." : "Оплатить"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {qrModal ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-4"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setQrModal(null);
            }
          }}
        >
          <div className="w-full max-w-md rounded-2xl border border-slate-200/90 bg-white p-4 shadow-2xl dark:border-slate-700/80 dark:bg-slate-900">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-black text-slate-900 dark:text-slate-100">Оплата по QR</h3>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Сканируйте в MB Банке и подтвердите платеж.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setQrModal(null)}
                className="rounded-lg bg-slate-100 p-2 text-slate-600 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                <X size={16} />
              </button>
            </div>

            <div className="mt-3 flex justify-center rounded-xl border border-slate-200/80 bg-slate-50/60 p-3 dark:border-slate-700/70 dark:bg-slate-800/50">
              {qrModal.qrDataUrl ? (
                <img src={qrModal.qrDataUrl} alt="MDM checkout QR" className="h-56 w-56 rounded-lg bg-white p-2 object-contain" />
              ) : (
                <p className="text-sm text-slate-500 dark:text-slate-400">QR недоступен</p>
              )}
            </div>

            <div className="mt-3 space-y-1 text-sm">
              <p className="flex items-center justify-between text-slate-700 dark:text-slate-200">
                <span>Сумма</span>
                <span className="font-semibold">{formatCoins(qrModal.expectedTotal)} ₽</span>
              </p>
              <p className="flex items-center justify-between text-slate-700 dark:text-slate-200">
                <span>Срок действия</span>
                <span className="text-xs">{relativeDate(qrModal.expiresAt)}</span>
              </p>
              <p className="flex items-center justify-between text-slate-700 dark:text-slate-200">
                <span>Статус</span>
                <span
                  className={`text-xs font-semibold ${
                    qrModal.status === "paid"
                      ? "text-emerald-600 dark:text-emerald-300"
                      : qrModal.status === "expired"
                        ? "text-rose-600 dark:text-rose-300"
                        : "text-cyan-600 dark:text-cyan-300"
                  }`}
                >
                  {qrModal.status === "paid" ? "Оплачен" : qrModal.status === "expired" ? "Истек" : "Ожидает оплату"}
                </span>
              </p>
            </div>

            {qrModal.lastError ? (
              <p className="mt-2 rounded-lg border border-rose-300/70 bg-rose-50/80 px-2 py-1 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-900/25 dark:text-rose-200">
                {qrModal.lastError}
              </p>
            ) : null}

            <div className="mt-3 rounded-xl border border-slate-200/80 bg-slate-50/70 p-2 dark:border-slate-700/70 dark:bg-slate-800/40">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">QR Payload</p>
              <div className="mt-1 flex items-start gap-2">
                <code className="line-clamp-2 flex-1 rounded-md bg-white px-2 py-1 text-[11px] text-slate-700 dark:bg-slate-900 dark:text-slate-200">
                  {qrModal.qrPayload || "—"}
                </code>
                <button
                  type="button"
                  onClick={onCopyQrPayload}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  <Copy size={12} />
                  Копировать
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </AnimatedPage>
  );
}
