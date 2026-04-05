import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Lock, MapPinPlus, MessageCircle, PlusCircle, Sparkles, Trash2, X } from "lucide-react";
import toast from "react-hot-toast";
import { api } from "../lib/api";
import { LIVE_UI_EVENTS, onLiveUIEvent } from "../lib/liveEvents";
import AnimatedPage from "../components/AnimatedPage";
import ProductCard from "../components/ProductCard";
import SkeletonCard from "../components/SkeletonCard";
import { useAuthStore } from "../store/authStore";
import {
  PRODUCT_CATEGORIES,
  PRODUCT_CONDITIONS,
  PRODUCT_RARITIES,
  getCategoryLabel,
  getConditionLabel,
  getRarityLabel,
} from "../constants/marketOptions";

const initialForm = {
  title: "",
  description: "",
  image: "",
  images: [],
  category: PRODUCT_CATEGORIES[0],
  condition: PRODUCT_CONDITIONS[0],
  rarity: PRODUCT_RARITIES[0],
  price: "",
  stock: "",
};

const initialPickupForm = {
  name: "",
  address: "",
  city: "",
  details: "",
};

export default function SellPage() {
  const { token, user } = useAuthStore();
  const [form, setForm] = useState(initialForm);
  const [submitting, setSubmitting] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [loadingListings, setLoadingListings] = useState(true);
  const [listings, setListings] = useState([]);
  const [pickupModalOpen, setPickupModalOpen] = useState(false);
  const [loadingPickupPoints, setLoadingPickupPoints] = useState(false);
  const [pickupPoints, setPickupPoints] = useState([]);
  const [pickupForm, setPickupForm] = useState(initialPickupForm);
  const [creatingPickupPoint, setCreatingPickupPoint] = useState(false);
  const [deletingPickupId, setDeletingPickupId] = useState("");
  const [togglingPickupId, setTogglingPickupId] = useState("");

  const hasSellerRole = useMemo(() => user?.role === "admin" || user?.role === "seller", [user?.role]);
  const hasBankLink = Boolean(user?.bank?.linked);
  const canCreateListings = useMemo(() => hasSellerRole && hasBankLink, [hasSellerRole, hasBankLink]);

  const loadListings = useCallback(
    async (withLoader = true, showError = true) => {
      try {
        if (withLoader) {
          setLoadingListings(true);
        }
        const data = await api.get("/users/me/dashboard", token);
        setListings(data.listings || []);
      } catch (err) {
        if (showError) {
          toast.error(err.message || "Не удалось загрузить ваши лоты");
        }
      } finally {
        if (withLoader) {
          setLoadingListings(false);
        }
      }
    },
    [token]
  );

  useEffect(() => {
    loadListings(true, true);
  }, [loadListings]);

  useEffect(() => {
    return onLiveUIEvent(LIVE_UI_EVENTS.PROFILE_CHANGED, () => {
      loadListings(false, false);
    });
  }, [loadListings]);

  const loadPickupPoints = useCallback(
    async (withLoader = true, showError = true) => {
      if (!token || !hasSellerRole) {
        setPickupPoints([]);
        return;
      }
      try {
        if (withLoader) {
          setLoadingPickupPoints(true);
        }
        const data = await api.get("/pickup-points/my", token);
        setPickupPoints(data.pickupPoints || []);
      } catch (err) {
        if (showError) {
          toast.error(err.message || "Не удалось загрузить пункты выдачи");
        }
      } finally {
        if (withLoader) {
          setLoadingPickupPoints(false);
        }
      }
    },
    [token, hasSellerRole]
  );

  useEffect(() => {
    if (!hasSellerRole) {
      setPickupPoints([]);
      return;
    }
    loadPickupPoints(true, false);
  }, [hasSellerRole, loadPickupPoints]);

  const hasActivePickupPoint = useMemo(
    () => (pickupPoints || []).some((point) => Boolean(point?.isActive)),
    [pickupPoints]
  );

  const onCreatePickupPoint = async (event) => {
    event.preventDefault();
    if (!token) {
      return;
    }
    const payload = {
      name: String(pickupForm.name || "").trim(),
      address: String(pickupForm.address || "").trim(),
      city: String(pickupForm.city || "").trim(),
      details: String(pickupForm.details || "").trim(),
      isActive: true,
    };
    if (!payload.name || !payload.address) {
      toast.error("Заполните название и адрес пункта выдачи");
      return;
    }
    try {
      setCreatingPickupPoint(true);
      const data = await api.post("/pickup-points", payload, token);
      setPickupPoints(data.pickupPoints || []);
      setPickupForm(initialPickupForm);
      toast.success("Пункт выдачи добавлен");
    } catch (err) {
      toast.error(err.message || "Не удалось добавить пункт выдачи");
    } finally {
      setCreatingPickupPoint(false);
    }
  };

  const onTogglePickupPoint = async (point) => {
    if (!token || !point?.id) {
      return;
    }
    try {
      setTogglingPickupId(point.id);
      const data = await api.patch(
        `/pickup-points/${point.id}`,
        {
          isActive: !point.isActive,
        },
        token
      );
      setPickupPoints(data.pickupPoints || []);
      toast.success(point.isActive ? "Пункт выдачи выключен" : "Пункт выдачи включен");
    } catch (err) {
      toast.error(err.message || "Не удалось обновить пункт выдачи");
    } finally {
      setTogglingPickupId("");
    }
  };

  const onDeletePickupPoint = async (point) => {
    if (!token || !point?.id) {
      return;
    }
    try {
      setDeletingPickupId(point.id);
      const data = await api.delete(`/pickup-points/${point.id}`, token);
      setPickupPoints(data.pickupPoints || []);
      toast.success("Пункт выдачи удален");
    } catch (err) {
      toast.error(err.message || "Не удалось удалить пункт выдачи");
    } finally {
      setDeletingPickupId("");
    }
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    if (!canCreateListings) {
      toast.error(hasSellerRole ? "Сначала привяжите MB Банк в профиле" : "Роль покупателя не может создавать лоты");
      return;
    }
    if (uploadingImage) {
      toast.error("Дождитесь окончания загрузки изображения");
      return;
    }

    const gallery = Array.from(new Set([form.image, ...(form.images || [])].map((item) => String(item || "").trim()).filter(Boolean))).slice(0, 8);
    if (!gallery.length) {
      toast.error("Добавьте хотя бы одно изображение лота");
      return;
    }

    try {
      setSubmitting(true);
      const payload = {
        ...form,
        image: gallery[0],
        images: gallery,
        price: Number(form.price),
        stock: Number(form.stock),
      };
      const result = await api.post("/products", payload, token);
      toast.success("Лот создан");
      setForm(initialForm);
      setListings((prev) => [result.product, ...prev]);
    } catch (err) {
      toast.error(err.message || "Не удалось создать лот");
    } finally {
      setSubmitting(false);
    }
  };

  const onListingImageFileChange = async (event) => {
    const files = Array.from(event.target.files || []);
    if (!files.length || !token) {
      return;
    }
    try {
      setUploadingImage(true);
      const uploaded = [];
      for (const file of files) {
        const data = await api.uploadImage(file, token);
        if (data.url) {
          uploaded.push(data.url);
        }
      }
      if (uploaded.length) {
        setForm((prev) => {
          const merged = [...(prev.images || []), ...uploaded];
          const unique = Array.from(new Set(merged.filter(Boolean))).slice(0, 8);
          return {
            ...prev,
            image: prev.image || unique[0] || "",
            images: unique,
          };
        });
        toast.success(`Изображений добавлено: ${uploaded.length}`);
      }
    } catch (err) {
      toast.error(err.message || "Не удалось загрузить изображение");
    } finally {
      setUploadingImage(false);
      event.target.value = "";
    }
  };

  const onImageUrlChange = (value) => {
    setForm((prev) => {
      const trimmed = String(value || "").trim();
      const rest = (prev.images || []).filter((img) => img !== trimmed);
      const nextImages = trimmed ? [trimmed, ...rest].slice(0, 8) : rest.slice(0, 8);
      return { ...prev, image: value, images: nextImages };
    });
  };

  const removeImageFromGallery = (imageUrl) => {
    setForm((prev) => {
      const nextImages = (prev.images || []).filter((img) => img !== imageUrl);
      const nextCover = prev.image === imageUrl ? nextImages[0] || "" : prev.image;
      return {
        ...prev,
        image: nextCover,
        images: nextImages,
      };
    });
  };

  if (!canCreateListings) {
    return (
      <AnimatedPage>
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="mx-auto max-w-2xl rounded-3xl border border-amber-300/60 bg-gradient-to-br from-amber-50 to-orange-50 p-7 shadow-lg dark:border-amber-700/50 dark:from-slate-900 dark:to-slate-800"
        >
          <div className="inline-flex items-center gap-2 rounded-full bg-amber-200/70 px-3 py-1 text-xs font-semibold text-amber-900 dark:bg-amber-900/30 dark:text-amber-200">
            <Lock size={14} />
            Доступ ограничен
          </div>
          <h1 className="mt-3 text-2xl font-black text-slate-900 dark:text-slate-100">Создание лотов недоступно</h1>
          <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">
            {hasSellerRole
              ? "У вас есть права продавца, но нет привязки MB Банка. Привяжите счет в профиле, чтобы создавать и продавать лоты."
              : "У вас роль покупателя. Попросите администратора сменить роль на продавца в профиле."}
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <Link
              to="/chats"
              className="inline-flex items-center gap-2 rounded-xl border border-cyan-300 bg-cyan-50 px-4 py-2 text-sm font-semibold text-cyan-700 transition hover:bg-cyan-100 dark:border-cyan-700/70 dark:bg-cyan-900/20 dark:text-cyan-300 dark:hover:bg-cyan-900/35"
            >
              <MessageCircle size={15} />
              Мои чаты
            </Link>
            <Link
              to="/profile"
              className="inline-flex items-center gap-2 rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-cyan-600"
            >
              Открыть профиль
            </Link>
          </div>
        </motion.section>
      </AnimatedPage>
    );
  }

  return (
    <AnimatedPage>
      <div className="grid gap-5 xl:grid-cols-5">
        <section className="rounded-3xl border border-slate-200/80 bg-white/85 p-5 shadow-sm dark:border-slate-700/70 dark:bg-slate-900/75 xl:col-span-2">
          <h1 className="text-2xl font-black text-slate-900 dark:text-slate-100">Создать новый лот</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Чистый заголовок и понятное описание ускоряют продажи.</p>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200/80 bg-slate-50/70 p-3 dark:border-slate-700/70 dark:bg-slate-800/40">
            <button
              type="button"
              onClick={() => {
                setPickupModalOpen(true);
                loadPickupPoints(false, false);
              }}
              className="inline-flex items-center gap-2 rounded-xl bg-cyan-500 px-3 py-2 text-xs font-semibold text-white transition hover:bg-cyan-600"
            >
              <MapPinPlus size={14} />
              Пункты выдачи
            </button>
            <p
              className={`text-xs font-semibold ${
                hasActivePickupPoint ? "text-emerald-600 dark:text-emerald-300" : "text-amber-700 dark:text-amber-300"
              }`}
            >
              {hasActivePickupPoint
                ? `Активных пунктов выдачи: ${(pickupPoints || []).filter((point) => point?.isActive).length}`
                : "Нет активных пунктов выдачи: покупатели не смогут оформить заказ"}
            </p>
          </div>

          <form className="mt-4 space-y-3" onSubmit={onSubmit}>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">Название</span>
              <input
                value={form.title}
                onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value.slice(0, 80) }))}
                required
                minLength={3}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-cyan-400 focus:ring dark:border-slate-700 dark:bg-slate-900"
                placeholder="Например: Набор брони «Небула»"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">Описание</span>
              <textarea
                value={form.description}
                onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value.slice(0, 500) }))}
                required
                rows={4}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-cyan-400 focus:ring dark:border-slate-700 dark:bg-slate-900"
                placeholder="Что делает этот предмет полезным или редким?"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">Ссылка на обложку</span>
              <input
                type="url"
                value={form.image}
                onChange={(event) => onImageUrlChange(event.target.value.slice(0, 500))}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-cyan-400 focus:ring dark:border-slate-700 dark:bg-slate-900"
                placeholder="https://images.unsplash.com/..."
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">Галерея (файлы, до 8)</span>
              <input
                type="file"
                multiple
                accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
                onChange={onListingImageFileChange}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-cyan-400 focus:ring dark:border-slate-700 dark:bg-slate-900"
              />
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {uploadingImage ? "Загрузка файлов..." : "Можно загрузить JPG, PNG, WEBP, GIF, AVIF до 5 МБ."}
              </p>
            </label>

            {form.images.length ? (
              <div className="grid grid-cols-4 gap-2 rounded-xl border border-slate-200 p-2 dark:border-slate-700">
                {form.images.map((img, index) => (
                  <div key={img} className="relative overflow-hidden rounded-lg border border-slate-300 dark:border-slate-700">
                    <img src={img} alt="preview" className="h-16 w-full object-cover" />
                    {index === 0 ? (
                      <span className="absolute left-1 top-1 rounded bg-cyan-500 px-1 py-0.5 text-[10px] font-bold text-white">cover</span>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => removeImageFromGallery(img)}
                      className="absolute right-1 top-1 rounded bg-black/60 p-0.5 text-white hover:bg-black/80"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            ) : null}

            <div className="grid gap-2 sm:grid-cols-3">
              <select
                value={form.category}
                onChange={(event) => setForm((prev) => ({ ...prev, category: event.target.value }))}
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-cyan-400 focus:ring dark:border-slate-700 dark:bg-slate-900"
              >
                {PRODUCT_CATEGORIES.map((option) => (
                  <option key={option} value={option}>
                    {getCategoryLabel(option)}
                  </option>
                ))}
              </select>

              <select
                value={form.condition}
                onChange={(event) => setForm((prev) => ({ ...prev, condition: event.target.value }))}
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-cyan-400 focus:ring dark:border-slate-700 dark:bg-slate-900"
              >
                {PRODUCT_CONDITIONS.map((option) => (
                  <option key={option} value={option}>
                    {getConditionLabel(option)}
                  </option>
                ))}
              </select>

              <select
                value={form.rarity}
                onChange={(event) => setForm((prev) => ({ ...prev, rarity: event.target.value }))}
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-cyan-400 focus:ring dark:border-slate-700 dark:bg-slate-900"
              >
                {PRODUCT_RARITIES.map((option) => (
                  <option key={option} value={option}>
                    {getRarityLabel(option)}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <input
                type="number"
                min={1}
                required
                value={form.price}
                onChange={(event) => setForm((prev) => ({ ...prev, price: event.target.value }))}
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-cyan-400 focus:ring dark:border-slate-700 dark:bg-slate-900"
                placeholder="Цена"
              />
              <input
                type="number"
                min={1}
                required
                value={form.stock}
                onChange={(event) => setForm((prev) => ({ ...prev, stock: event.target.value }))}
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-cyan-400 focus:ring dark:border-slate-700 dark:bg-slate-900"
                placeholder="Остаток"
              />
            </div>

            <button
              type="submit"
              disabled={submitting || uploadingImage}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-cyan-600 disabled:cursor-not-allowed disabled:opacity-70"
            >
              <PlusCircle size={16} />
              {submitting ? "Публикация..." : "Опубликовать лот"}
            </button>
          </form>
        </section>

        <section className="xl:col-span-3">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">Ваши недавние лоты</h2>
            <div className="flex items-center gap-3">
              <Link
                to="/chats"
                className="inline-flex items-center gap-1 rounded-xl border border-cyan-300 bg-cyan-50 px-3 py-1.5 text-xs font-semibold text-cyan-700 transition hover:bg-cyan-100 dark:border-cyan-700/70 dark:bg-cyan-900/20 dark:text-cyan-300 dark:hover:bg-cyan-900/35"
              >
                <MessageCircle size={13} />
                Мои чаты
              </Link>
              <Link to="/profile" className="text-sm font-semibold text-cyan-600 hover:text-cyan-500">
                Управлять в профиле
              </Link>
            </div>
          </div>

          {loadingListings ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {Array.from({ length: 4 }).map((_, idx) => (
                <SkeletonCard key={idx} />
              ))}
            </div>
          ) : listings.length ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {listings.slice(0, 6).map((item) => (
                <ProductCard key={item.id} product={item} />
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-200/80 bg-white/80 p-8 text-center dark:border-slate-700/70 dark:bg-slate-900/75">
              <Sparkles className="mx-auto text-cyan-500" />
              <p className="mt-3 font-semibold text-slate-900 dark:text-slate-100">Лотов пока нет</p>
              <p className="text-sm text-slate-600 dark:text-slate-300">Используйте форму, чтобы опубликовать первый товар.</p>
            </div>
          )}
        </section>
      </div>

      <AnimatePresence>
        {pickupModalOpen ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-4"
            onClick={(event) => {
              if (event.target === event.currentTarget) {
                setPickupModalOpen(false);
              }
            }}
          >
            <motion.section
              initial={{ opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.98 }}
              transition={{ duration: 0.18 }}
              className="w-full max-w-3xl rounded-3xl border border-slate-200/90 bg-white p-5 shadow-2xl dark:border-slate-700/80 dark:bg-slate-900"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-xl font-black text-slate-900 dark:text-slate-100">Пункты выдачи</h3>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                    Добавьте адреса, чтобы покупатели могли выбрать пункт выдачи именно вашего товара.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setPickupModalOpen(false)}
                  className="rounded-lg bg-slate-100 p-2 text-slate-600 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <form onSubmit={onCreatePickupPoint} className="space-y-3 rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4 dark:border-slate-700/80 dark:bg-slate-800/40">
                  <p className="text-sm font-bold text-slate-900 dark:text-slate-100">Добавить пункт выдачи</p>
                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">Название *</span>
                    <input
                      value={pickupForm.name}
                      onChange={(event) => setPickupForm((prev) => ({ ...prev, name: event.target.value.slice(0, 90) }))}
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-cyan-400 focus:ring dark:border-slate-700 dark:bg-slate-900"
                      placeholder="Например: ПВЗ Центр"
                      required
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">Адрес *</span>
                    <input
                      value={pickupForm.address}
                      onChange={(event) => setPickupForm((prev) => ({ ...prev, address: event.target.value.slice(0, 220) }))}
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-cyan-400 focus:ring dark:border-slate-700 dark:bg-slate-900"
                      placeholder="Город, улица, дом"
                      required
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">Город</span>
                    <input
                      value={pickupForm.city}
                      onChange={(event) => setPickupForm((prev) => ({ ...prev, city: event.target.value.slice(0, 90) }))}
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-cyan-400 focus:ring dark:border-slate-700 dark:bg-slate-900"
                      placeholder="Москва"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">Дополнительно</span>
                    <textarea
                      value={pickupForm.details}
                      onChange={(event) => setPickupForm((prev) => ({ ...prev, details: event.target.value.slice(0, 320) }))}
                      rows={3}
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-cyan-400 focus:ring dark:border-slate-700 dark:bg-slate-900"
                      placeholder="Часы работы, ориентир, телефон"
                    />
                  </label>

                  <button
                    type="submit"
                    disabled={creatingPickupPoint}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-cyan-600 disabled:opacity-70"
                  >
                    <MapPinPlus size={15} />
                    {creatingPickupPoint ? "Сохранение..." : "Добавить пункт"}
                  </button>
                </form>

                <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4 dark:border-slate-700/80 dark:bg-slate-800/40">
                  <p className="text-sm font-bold text-slate-900 dark:text-slate-100">Ваши пункты</p>
                  <div className="mt-3 space-y-2">
                    {loadingPickupPoints ? (
                      <div className="space-y-2">
                        {Array.from({ length: 3 }).map((_, index) => (
                          <div key={index} className="h-16 animate-pulse rounded-xl bg-slate-200 dark:bg-slate-700" />
                        ))}
                      </div>
                    ) : pickupPoints.length ? (
                      pickupPoints.map((point) => (
                        <div
                          key={point.id}
                          className="rounded-xl border border-slate-200/80 bg-white p-3 dark:border-slate-700/80 dark:bg-slate-900"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{point.name}</p>
                              <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-300">
                                {point.city ? `${point.city}, ` : ""}
                                {point.address}
                              </p>
                              {point.details ? (
                                <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">{point.details}</p>
                              ) : null}
                            </div>
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                point.isActive
                                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                                  : "bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300"
                              }`}
                            >
                              {point.isActive ? "Активен" : "Выключен"}
                            </span>
                          </div>
                          <div className="mt-2 flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => onTogglePickupPoint(point)}
                              disabled={togglingPickupId === point.id}
                              className="rounded-lg border border-cyan-300 px-2 py-1 text-xs font-semibold text-cyan-700 transition hover:bg-cyan-50 disabled:opacity-70 dark:border-cyan-700 dark:text-cyan-300 dark:hover:bg-cyan-900/20"
                            >
                              {togglingPickupId === point.id ? "..." : point.isActive ? "Выключить" : "Включить"}
                            </button>
                            <button
                              type="button"
                              onClick={() => onDeletePickupPoint(point)}
                              disabled={deletingPickupId === point.id}
                              className="inline-flex items-center gap-1 rounded-lg border border-rose-300 px-2 py-1 text-xs font-semibold text-rose-600 transition hover:bg-rose-50 disabled:opacity-70 dark:border-rose-800 dark:text-rose-300 dark:hover:bg-rose-900/20"
                            >
                              <Trash2 size={12} />
                              {deletingPickupId === point.id ? "..." : "Удалить"}
                            </button>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-xl border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500 dark:border-slate-600 dark:text-slate-400">
                        Пока нет пунктов выдачи. Добавьте первый пункт слева.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </motion.section>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </AnimatedPage>
  );
}
