import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Camera, FileText, MessageCircle, PackageCheck, ShoppingBag, Star, Trash2, User2, X } from "lucide-react";
import toast from "react-hot-toast";
import { api } from "../lib/api";
import { LIVE_UI_EVENTS, onLiveUIEvent } from "../lib/liveEvents";
import { formatCoins, relativeDate } from "../lib/format";
import { useAuthStore } from "../store/authStore";
import { useUiStore } from "../store/uiStore";
import AnimatedPage from "../components/AnimatedPage";
import EmptyState from "../components/EmptyState";
import OrderStatusBadge from "../components/OrderStatusBadge";

const statusOptions = ["PAID", "PREPARING", "DELIVERED"];
const statusLabelMap = {
  PAID: "Оплачен",
  PREPARING: "Готовится",
  DELIVERED: "Доставлен",
};

const COPY = {
  ru: {
    order: "Заказ",
    total: "Итого",
    coins: "₽",
    updateStatus: "Обновить статус",
    loadOrdersError: "Не удалось загрузить заказы",
    statusUpdated: "Статус заказа обновлен",
    updateStatusError: "Не удалось обновить статус заказа",
    title: "Заказы",
    subtitle: "Отслеживайте, что вы купили и что продали.",
    purchases: "Покупки",
    sales: "Продажи",
    emptyPurchasesTitle: "Покупок пока нет",
    emptySalesTitle: "Продаж пока нет",
    emptyPurchasesDescription: "После оформления заказа ваши покупки появятся здесь.",
    emptySalesDescription: "Когда кто-то купит ваш лот, он появится здесь.",
    seller: "Продавец",
    buyer: "Покупатель",
    chat: "Чат",
    leaveReview: "Оставить отзыв",
    reviewDone: "Отзыв",
    reviewModalTitle: "Отзыв о продавце",
    reviewModalSubtitle: "Оцените продавца звездами и добавьте фото при необходимости.",
    starsLabel: "Оценка",
    commentLabel: "Комментарий",
    commentPlaceholder: "Напишите, как прошла покупка...",
    imageLabel: "Фото (опционально)",
    uploadPhoto: "Загрузить фото",
    uploadingPhoto: "Загрузка фото...",
    close: "Закрыть",
    sendReview: "Отправить отзыв",
    reviewSent: "Отзыв отправлен",
    reviewFailed: "Не удалось отправить отзыв",
    reviewExists: "Вы уже оставили отзыв на этот товар",
    reviewValidation: "Добавьте текст отзыва или фото",
    openChatError: "Не удалось открыть чат",
    deletingOrder: "Удаление...",
    deleteOrder: "Удалить",
  },
  en: {
    order: "Order",
    total: "Total",
    coins: "₽",
    updateStatus: "Update status",
    loadOrdersError: "Failed to load orders",
    statusUpdated: "Order status updated",
    updateStatusError: "Could not update order status",
    title: "Orders",
    subtitle: "Track what you bought and what you sold.",
    purchases: "Purchases",
    sales: "Sales",
    emptyPurchasesTitle: "No purchases yet",
    emptySalesTitle: "No sales yet",
    emptyPurchasesDescription: "After checkout, your purchases will appear here.",
    emptySalesDescription: "After someone buys your listing, it will appear here.",
    seller: "Seller",
    buyer: "Buyer",
    chat: "Chat",
    leaveReview: "Leave review",
    reviewDone: "Reviewed",
    reviewModalTitle: "Seller review",
    reviewModalSubtitle: "Rate with stars and attach a photo if needed.",
    starsLabel: "Rating",
    commentLabel: "Comment",
    commentPlaceholder: "Describe your purchase experience...",
    imageLabel: "Photo (optional)",
    uploadPhoto: "Upload photo",
    uploadingPhoto: "Uploading photo...",
    close: "Close",
    sendReview: "Send review",
    reviewSent: "Review submitted",
    reviewFailed: "Failed to submit review",
    reviewExists: "You already reviewed this item",
    reviewValidation: "Add comment text or photo",
    openChatError: "Failed to open chat",
  },
};

function OrderCard({
  order,
  canManageStatus,
  onStatusUpdate,
  onOpenReceipt,
  canReview,
  onOpenReview,
  onOpenChat,
  openingChatItemId,
  onDeleteOrder,
  deletingOrderId,
  loadingReceiptOrderId,
  receiptLabel,
  onDeleteReview,
  deletingReviewId,
  deleteReviewLabel,
  t,
}) {
  const [nextStatus, setNextStatus] = useState(order.status);

  return (
    <article className="rounded-2xl border border-slate-200/80 bg-white/85 p-4 shadow-sm dark:border-slate-700/70 dark:bg-slate-900/75">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            {t.order} #{order.id.slice(0, 8)}
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">{relativeDate(order.createdAt)}</p>
          {canManageStatus && order?.buyer?.username ? (
            <p className="mt-1 inline-flex items-center gap-1 text-xs text-slate-600 dark:text-slate-300">
              <User2 size={12} />
              {t.buyer}: {order.buyer.username}
            </p>
          ) : null}
        </div>
        <OrderStatusBadge status={order.status} />
      </div>

      <div className="mt-3 space-y-2">
        {order.items.map((item) => (
          <div key={item.id} className="flex items-center justify-between gap-3 rounded-xl bg-slate-100/80 px-3 py-2 dark:bg-slate-800/80">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{item.titleSnapshot}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {item.quantity} x {formatCoins(item.priceSnapshot)}
              </p>
              {canReview && item.product?.seller?.username ? (
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  {t.seller}: {item.product.seller.username}
                </p>
              ) : null}
            </div>
            <div className="text-right">
              <p className="text-sm font-bold text-cyan-600 dark:text-cyan-300">
                {formatCoins(item.priceSnapshot * item.quantity)}
              </p>
              {canReview ? (
                <div className="mt-1 flex flex-wrap items-center justify-end gap-2">
                  {item.product?.seller?.id ? (
                    <button
                      type="button"
                      onClick={() => onOpenChat(order, item)}
                      disabled={openingChatItemId === item.id}
                      className="inline-flex items-center gap-1 rounded-lg border border-cyan-300 bg-cyan-50 px-2 py-1 text-xs font-semibold text-cyan-700 transition hover:bg-cyan-100 disabled:opacity-70 dark:border-cyan-700 dark:bg-cyan-900/20 dark:text-cyan-300 dark:hover:bg-cyan-900/30"
                    >
                      <MessageCircle size={12} />
                      {openingChatItemId === item.id ? "..." : t.chat}
                    </button>
                  ) : null}

                  {item.review ? (
                    <>
                      <p className="inline-flex items-center gap-1 text-xs font-semibold text-amber-600 dark:text-amber-300">
                        <Star size={12} className="fill-current" />
                        {t.reviewDone}: {item.review.stars}/5
                      </p>
                      <button
                        type="button"
                        onClick={() => onDeleteReview(item.review.id)}
                        disabled={deletingReviewId === item.review.id}
                        className="inline-flex items-center gap-1 rounded-lg border border-rose-300 px-2 py-1 text-[11px] font-semibold text-rose-600 transition hover:bg-rose-50 disabled:opacity-70 dark:border-rose-800 dark:text-rose-300 dark:hover:bg-rose-900/20"
                      >
                        <Trash2 size={11} />
                        {deletingReviewId === item.review.id ? "..." : deleteReviewLabel}
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onOpenReview(order, item)}
                      className="rounded-lg bg-amber-500 px-2 py-1 text-xs font-semibold text-white transition hover:bg-amber-600"
                    >
                      {t.leaveReview}
                    </button>
                  )}
                </div>
              ) : null}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          {t.total}: {formatCoins(order.total)} {t.coins}
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onOpenReceipt(order.id)}
            disabled={loadingReceiptOrderId === order.id}
            className="inline-flex items-center gap-1 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-70 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300 dark:hover:bg-emerald-900/30"
          >
            <FileText size={12} />
            {loadingReceiptOrderId === order.id ? "..." : receiptLabel}
          </button>
          {canManageStatus && (
            <>
              <select
                value={nextStatus}
                onChange={(event) => setNextStatus(event.target.value)}
                className="rounded-xl border border-slate-300 bg-white px-2 py-1.5 text-xs outline-none ring-cyan-400 focus:ring dark:border-slate-700 dark:bg-slate-900"
              >
                {statusOptions.map((status) => (
                  <option key={status} value={status}>
                    {statusLabelMap[status] || status}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => onStatusUpdate(order.id, nextStatus)}
                className="rounded-xl bg-cyan-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-cyan-600"
              >
                {t.updateStatus}
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => onDeleteOrder(order.id)}
            disabled={deletingOrderId === order.id}
            className="inline-flex items-center gap-1 rounded-xl bg-slate-700 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:opacity-70 dark:bg-slate-600 dark:hover:bg-slate-500"
          >
            <Trash2 size={12} />
            {deletingOrderId === order.id ? t.deletingOrder : t.deleteOrder}
          </button>
        </div>
      </div>
    </article>
  );
}

export default function OrdersPage() {
  const { token } = useAuthStore();
  const navigate = useNavigate();
  const language = useUiStore((state) => state.language);
  const t = COPY[language] || COPY.ru;
  const receiptLabel = language === "en" ? "Receipt" : "Чек";
  const receiptLoadError = language === "en" ? "Failed to load receipt" : "Не удалось загрузить чек";
  const receiptTitle = language === "en" ? "Order receipt" : "Чек заказа";
  const receiptStatusLabel = language === "en" ? "Status" : "Статус";
  const receiptSourceLabel = language === "en" ? "Payment source" : "Источник оплаты";
  const receiptSubtotalLabel = language === "en" ? "Subtotal" : "Подытог";
  const receiptDiscountLabel = language === "en" ? "Discount" : "Скидка";
  const receiptTotalLabel = language === "en" ? "Total paid" : "Итого оплачено";
  const receiptBuyerLabel = language === "en" ? "Buyer" : "Покупатель";
  const receiptPickupLabel = language === "en" ? "Pickup points" : "Пункты выдачи";
  const receiptCloseLabel = language === "en" ? "Close" : "Закрыть";
  const deleteReviewLabel = language === "en" ? "Delete review" : "Удалить отзыв";
  const deleteOrderSuccess = language === "en" ? "Order removed from your list" : "Заказ удален из списка";
  const deleteOrderError = language === "en" ? "Failed to delete order" : "Не удалось удалить заказ";
  const clearOrdersError = language === "en" ? "Failed to clear list" : "Не удалось очистить список";
  const clearTabLabel = language === "en" ? "Clear tab" : "Очистить вкладку";
  const clearingLabel = language === "en" ? "Clearing..." : "Очистка...";
  const clearedPurchasesLabel = language === "en" ? "Purchases cleared" : "Покупки очищены";
  const clearedSalesLabel = language === "en" ? "Sales cleared" : "Продажи очищены";
  const clearedAllLabel = language === "en" ? "History cleared" : "История очищена";
  const [tab, setTab] = useState("purchases");
  const [loading, setLoading] = useState(true);
  const [purchases, setPurchases] = useState([]);
  const [sales, setSales] = useState([]);
  const [deletingOrderId, setDeletingOrderId] = useState("");
  const [clearingScope, setClearingScope] = useState("");
  const [receiptModal, setReceiptModal] = useState(null);
  const [loadingReceiptOrderId, setLoadingReceiptOrderId] = useState("");
  const [reviewModal, setReviewModal] = useState(null);
  const [reviewStars, setReviewStars] = useState(5);
  const [reviewComment, setReviewComment] = useState("");
  const [reviewImage, setReviewImage] = useState("");
  const [reviewUploadingImage, setReviewUploadingImage] = useState(false);
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [deletingReviewId, setDeletingReviewId] = useState("");
  const [openingChatItemId, setOpeningChatItemId] = useState("");

  const loadOrders = useCallback(
    async (withLoader = true, showError = true) => {
      try {
        if (withLoader) {
          setLoading(true);
        }
        const [purchasesData, salesData] = await Promise.all([api.get("/orders/my", token), api.get("/orders/sales", token)]);

        setPurchases(purchasesData.orders || []);
        setSales(salesData.orders || []);
      } catch (err) {
        if (showError) {
          toast.error(err.message || t.loadOrdersError);
        }
      } finally {
        if (withLoader) {
          setLoading(false);
        }
      }
    },
    [token, t.loadOrdersError]
  );

  useEffect(() => {
    loadOrders(true, true);
  }, [loadOrders]);

  useEffect(() => {
    return onLiveUIEvent(LIVE_UI_EVENTS.ORDERS_CHANGED, () => {
      loadOrders(false, false);
    });
  }, [loadOrders]);

  const updateStatus = async (orderId, status) => {
    try {
      await api.patch(`/orders/${orderId}/status`, { status }, token);
      toast.success(t.statusUpdated);
      await loadOrders(false, false);
    } catch (err) {
      toast.error(err.message || t.updateStatusError);
    }
  };

  const onDeleteOrder = async (orderId) => {
    try {
      setDeletingOrderId(orderId);
      await api.delete(`/orders/${orderId}`, token);
      setPurchases((prev) => prev.filter((item) => item.id !== orderId));
      setSales((prev) => prev.filter((item) => item.id !== orderId));
      toast.success(deleteOrderSuccess);
      await loadOrders(false, false);
    } catch (err) {
      toast.error(err.message || deleteOrderError);
    } finally {
      setDeletingOrderId("");
    }
  };

  const onClearTab = async (scope) => {
    try {
      setClearingScope(scope);
      await api.post("/orders/clear", { scope }, token);
      if (scope === "purchases") {
        setPurchases([]);
        toast.success(clearedPurchasesLabel);
      } else if (scope === "sales") {
        setSales([]);
        toast.success(clearedSalesLabel);
      } else {
        setPurchases([]);
        setSales([]);
        toast.success(clearedAllLabel);
      }
      await loadOrders(false, false);
    } catch (err) {
      toast.error(err.message || clearOrdersError);
    } finally {
      setClearingScope("");
    }
  };

  const openReceipt = async (orderId) => {
    const safeOrderId = String(orderId || "").trim();
    if (!safeOrderId || !token || loadingReceiptOrderId) {
      return;
    }
    try {
      setLoadingReceiptOrderId(safeOrderId);
      const data = await api.get(`/orders/${safeOrderId}/receipt`, token);
      if (!data?.receipt) {
        throw new Error(receiptLoadError);
      }
      setReceiptModal(data.receipt);
    } catch (err) {
      toast.error(err.message || receiptLoadError);
    } finally {
      setLoadingReceiptOrderId("");
    }
  };

  const paymentSourceText = (value) => {
    const source = String(value || "")
      .trim()
      .toUpperCase();
    if (source === "QR") {
      return "MB Bank QR";
    }
    if (source === "CARD_AUTH") {
      return language === "en" ? "MB card ID + password" : "ID карты MB + пароль";
    }
    if (source === "LINKED" || source === "DIRECT") {
      return language === "en" ? "Linked MB account" : "Привязанный счет MB";
    }
    return language === "en" ? "Unknown" : "Неизвестно";
  };

  const openReviewModal = (order, item) => {
    setReviewModal({
      orderId: order.id,
      orderItemId: item.id,
      sellerName: item?.product?.seller?.username || "",
      itemTitle: item?.titleSnapshot || "",
    });
    setReviewStars(5);
    setReviewComment("");
    setReviewImage("");
  };

  const openChat = async (_order, item) => {
    const orderItemId = String(item?.id || "").trim();
    if (!orderItemId || openingChatItemId) {
      return;
    }
    try {
      setOpeningChatItemId(orderItemId);
      const data = await api.post("/chats/open", { orderItemId }, token);
      const chatId = String(data?.chat?.id || "").trim();
      if (!chatId) {
        throw new Error(t.openChatError);
      }
      navigate(`/chats?chat=${encodeURIComponent(chatId)}`);
    } catch (err) {
      toast.error(err.message || t.openChatError);
    } finally {
      setOpeningChatItemId("");
    }
  };

  const closeReviewModal = () => {
    if (reviewSubmitting || reviewUploadingImage) {
      return;
    }
    setReviewModal(null);
  };

  const onReviewImageFileChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file || !token) {
      return;
    }
    try {
      setReviewUploadingImage(true);
      const data = await api.uploadImage(file, token);
      setReviewImage(data.url || "");
    } catch (err) {
      toast.error(err.message || t.reviewFailed);
    } finally {
      setReviewUploadingImage(false);
      event.target.value = "";
    }
  };

  const submitReview = async () => {
    if (!reviewModal?.orderItemId) {
      return;
    }
    if (!String(reviewComment || "").trim() && !reviewImage) {
      toast.error(t.reviewValidation);
      return;
    }

    try {
      setReviewSubmitting(true);
      await api.post(
        "/reviews",
        {
          orderItemId: reviewModal.orderItemId,
          stars: reviewStars,
          comment: String(reviewComment || "").trim(),
          image: reviewImage || "",
        },
        token
      );
      toast.success(t.reviewSent);
      setReviewModal(null);
      await loadOrders(false, false);
    } catch (err) {
      if (err?.status === 409) {
        toast.error(t.reviewExists);
      } else {
        toast.error(err.message || t.reviewFailed);
      }
    } finally {
      setReviewSubmitting(false);
    }
  };

  const deleteReview = async (reviewId) => {
    if (!reviewId || deletingReviewId) {
      return;
    }
    try {
      setDeletingReviewId(reviewId);
      await api.delete(`/reviews/${reviewId}`, token);
      toast.success(language === "en" ? "Review deleted" : "Отзыв удален");
      await loadOrders(false, false);
    } catch (err) {
      toast.error(err.message || (language === "en" ? "Failed to delete review" : "Не удалось удалить отзыв"));
    } finally {
      setDeletingReviewId("");
    }
  };

  const current = tab === "purchases" ? purchases : sales;

  return (
    <AnimatedPage>
      <section className="rounded-3xl border border-slate-200/80 bg-white/85 p-5 dark:border-slate-700/70 dark:bg-slate-900/75">
        <h1 className="text-3xl font-black text-slate-900 dark:text-slate-100">{t.title}</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{t.subtitle}</p>

        <div className="mt-4 grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1 dark:bg-slate-800/80">
          <button
            type="button"
            onClick={() => setTab("purchases")}
            className={`rounded-lg py-2 text-sm font-semibold transition ${
              tab === "purchases"
                ? "bg-white text-slate-900 shadow dark:bg-slate-700 dark:text-slate-100"
                : "text-slate-500 dark:text-slate-300"
            }`}
          >
            <span className="inline-flex items-center gap-2">
              <ShoppingBag size={16} />
              {t.purchases} ({purchases.length})
            </span>
          </button>
          <button
            type="button"
            onClick={() => setTab("sales")}
            className={`rounded-lg py-2 text-sm font-semibold transition ${
              tab === "sales"
                ? "bg-white text-slate-900 shadow dark:bg-slate-700 dark:text-slate-100"
                : "text-slate-500 dark:text-slate-300"
            }`}
          >
            <span className="inline-flex items-center gap-2">
              <PackageCheck size={16} />
              {t.sales} ({sales.length})
            </span>
          </button>
        </div>

        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={() => onClearTab(tab)}
            disabled={Boolean(deletingOrderId) || clearingScope === tab}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-700 px-3 py-2 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:opacity-70 dark:bg-slate-600 dark:hover:bg-slate-500"
          >
            <Trash2 size={13} />
            {clearingScope === tab ? clearingLabel : clearTabLabel}
          </button>
        </div>
      </section>

      <section className="mt-5">
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <div
                key={index}
                className="h-44 rounded-2xl border border-slate-200/70 bg-white/70 animate-pulse dark:border-slate-700/70 dark:bg-slate-900/70"
              />
            ))}
          </div>
        ) : current.length ? (
          <div className="space-y-3">
            {current.map((order) => (
              <OrderCard
                key={`${order.id}-${order.status}`}
                order={order}
                canManageStatus={tab === "sales"}
                onOpenReceipt={openReceipt}
                canReview={tab === "purchases"}
                onStatusUpdate={updateStatus}
                onOpenReview={openReviewModal}
                onOpenChat={openChat}
                openingChatItemId={openingChatItemId}
                onDeleteOrder={onDeleteOrder}
                deletingOrderId={deletingOrderId}
                loadingReceiptOrderId={loadingReceiptOrderId}
                receiptLabel={receiptLabel}
                onDeleteReview={deleteReview}
                deletingReviewId={deletingReviewId}
                deleteReviewLabel={deleteReviewLabel}
                t={t}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            title={tab === "purchases" ? t.emptyPurchasesTitle : t.emptySalesTitle}
            description={tab === "purchases" ? t.emptyPurchasesDescription : t.emptySalesDescription}
          />
        )}
      </section>

      {receiptModal ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-4"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setReceiptModal(null);
            }
          }}
        >
          <div className="w-full max-w-xl rounded-2xl border border-slate-200/90 bg-white p-5 shadow-2xl dark:border-slate-700/70 dark:bg-slate-900">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-black text-slate-900 dark:text-slate-100">{receiptTitle}</h3>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {receiptModal.id} • {relativeDate(receiptModal.createdAt)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setReceiptModal(null)}
                className="rounded-lg bg-slate-100 p-2 text-slate-600 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                <X size={16} />
              </button>
            </div>

            <div className="mt-3 grid grid-cols-1 gap-2 text-xs text-slate-600 dark:text-slate-300 sm:grid-cols-2">
              <p>
                <span className="font-semibold">{receiptStatusLabel}:</span> {String(receiptModal.status || "-")}
              </p>
              <p>
                <span className="font-semibold">{receiptSourceLabel}:</span> {paymentSourceText(receiptModal.paymentSource)}
              </p>
              {receiptModal?.buyer?.username ? (
                <p className="sm:col-span-2">
                  <span className="font-semibold">{receiptBuyerLabel}:</span> {receiptModal.buyer.username}
                </p>
              ) : null}
            </div>

            <div className="mt-3 max-h-56 space-y-2 overflow-y-auto rounded-xl border border-slate-200/80 bg-slate-50/70 p-3 dark:border-slate-700/70 dark:bg-slate-800/40">
              {(receiptModal.items || []).map((item) => (
                <div key={item.id} className="rounded-lg border border-slate-200/80 bg-white/90 px-2 py-2 dark:border-slate-700/70 dark:bg-slate-900/80">
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{item.title}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {item.quantity} x {formatCoins(item.unitPrice)} ₽
                  </p>
                  <p className="text-xs font-semibold text-cyan-600 dark:text-cyan-300">{formatCoins(item.lineTotal)} ₽</p>
                </div>
              ))}
            </div>

            <div className="mt-3 space-y-1 text-sm">
              <p className="flex items-center justify-between text-slate-600 dark:text-slate-300">
                <span>{receiptSubtotalLabel}</span>
                <span>{formatCoins(receiptModal.subtotal)} ₽</span>
              </p>
              <p className="flex items-center justify-between text-emerald-600 dark:text-emerald-300">
                <span>{receiptDiscountLabel}</span>
                <span>-{formatCoins(receiptModal.discount)} ₽</span>
              </p>
              <p className="flex items-center justify-between font-bold text-slate-900 dark:text-slate-100">
                <span>{receiptTotalLabel}</span>
                <span>{formatCoins(receiptModal.total)} ₽</span>
              </p>
            </div>

            {(receiptModal.pickupPoints || []).length ? (
              <div className="mt-3 rounded-xl border border-slate-200/80 bg-slate-50/70 p-3 dark:border-slate-700/70 dark:bg-slate-800/40">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{receiptPickupLabel}</p>
                <div className="mt-2 space-y-1">
                  {receiptModal.pickupPoints.map((point) => (
                    <p key={point.id} className="text-xs text-slate-700 dark:text-slate-200">
                      {point.name || "Пункт"}: {[point.city, point.address].filter(Boolean).join(", ")}
                      {point.details ? ` • ${point.details}` : ""}
                    </p>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => setReceiptModal(null)}
                className="rounded-xl bg-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
              >
                {receiptCloseLabel}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {reviewModal ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              closeReviewModal();
            }
          }}
        >
          <div className="w-full max-w-lg rounded-2xl border border-slate-200/90 bg-white p-5 shadow-2xl dark:border-slate-700/70 dark:bg-slate-900">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-black text-slate-900 dark:text-slate-100">{t.reviewModalTitle}</h3>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{t.reviewModalSubtitle}</p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {reviewModal.itemTitle}
                  {reviewModal.sellerName ? ` • ${t.seller}: ${reviewModal.sellerName}` : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={closeReviewModal}
                className="rounded-lg bg-slate-100 p-2 text-slate-600 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                <X size={16} />
              </button>
            </div>

            <div className="mt-4">
              <p className="mb-2 text-sm font-semibold text-slate-800 dark:text-slate-200">{t.starsLabel}</p>
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setReviewStars(value)}
                    className="rounded-lg p-1.5 text-amber-500 transition hover:bg-amber-50 dark:hover:bg-slate-800"
                  >
                    <Star size={22} className={value <= reviewStars ? "fill-current" : ""} />
                  </button>
                ))}
                <span className="ml-2 text-sm font-semibold text-slate-700 dark:text-slate-200">{reviewStars}/5</span>
              </div>
            </div>

            <label className="mt-4 block">
              <span className="mb-1 block text-sm font-semibold text-slate-800 dark:text-slate-200">{t.commentLabel}</span>
              <textarea
                value={reviewComment}
                onChange={(event) => setReviewComment(event.target.value.slice(0, 500))}
                rows={4}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-cyan-400 focus:ring dark:border-slate-700 dark:bg-slate-900"
                placeholder={t.commentPlaceholder}
              />
            </label>

            <label className="mt-4 block">
              <span className="mb-1 block text-sm font-semibold text-slate-800 dark:text-slate-200">{t.imageLabel}</span>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
                onChange={onReviewImageFileChange}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-cyan-400 focus:ring dark:border-slate-700 dark:bg-slate-900"
              />
              <p className="mt-1 inline-flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                <Camera size={12} />
                {reviewUploadingImage ? t.uploadingPhoto : t.uploadPhoto}
              </p>
              {reviewImage ? (
                <img
                  src={reviewImage}
                  alt="review"
                  className="mt-2 h-24 w-24 rounded-lg border border-slate-300 object-cover dark:border-slate-700"
                />
              ) : null}
            </label>

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={closeReviewModal}
                disabled={reviewSubmitting}
                className="rounded-xl bg-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-300 disabled:opacity-70 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
              >
                {t.close}
              </button>
              <button
                type="button"
                onClick={submitReview}
                disabled={reviewSubmitting || reviewUploadingImage}
                className="rounded-xl bg-amber-500 px-3 py-2 text-sm font-semibold text-white transition hover:bg-amber-600 disabled:opacity-70"
              >
                {reviewSubmitting ? `${t.sendReview}...` : t.sendReview}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </AnimatedPage>
  );
}

