import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { BadgePercent, Check, Copy, ExternalLink, Link2, PencilLine, PlusCircle, ReceiptText, Save, Search, ShieldCheck, Store, Trash2, Unlink, WalletCards, X } from "lucide-react";
import toast from "react-hot-toast";
import { api } from "../lib/api";
import { LIVE_UI_EVENTS, onLiveUIEvent } from "../lib/liveEvents";
import { formatCoins, relativeDate, shorten } from "../lib/format";
import { useAuthStore } from "../store/authStore";
import AnimatedPage from "../components/AnimatedPage";
import EmptyState from "../components/EmptyState";
import OrderStatusBadge from "../components/OrderStatusBadge";

function roleLabel(role) {
  if (role === "admin") return "Админ";
  if (role === "seller") return "Продавец";
  return "Покупатель";
}

const HISTORY_TABS = [
  { id: "listings", label: "Лоты" },
  { id: "purchases", label: "Покупки" },
  { id: "sales", label: "Продажи" },
  { id: "transactions", label: "Транзакции" },
];

function historyTabLabel(tabId) {
  return HISTORY_TABS.find((item) => item.id === tabId)?.label || "Лоты";
}

function OrderMiniCard({ order, title }) {
  return (
    <article className="rounded-2xl border border-slate-200/80 bg-white/85 p-4 dark:border-slate-700/70 dark:bg-slate-900/75">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</h4>
        <OrderStatusBadge status={order.status} />
      </div>

      <div className="mt-2 space-y-2">
        {order.items.slice(0, 3).map((item) => (
          <div key={item.id} className="flex items-center justify-between gap-3 text-sm">
            <p className="line-clamp-1 text-slate-700 dark:text-slate-200">{item.titleSnapshot}</p>
            <p className="font-semibold text-cyan-600 dark:text-cyan-300">{formatCoins(item.priceSnapshot * item.quantity)}</p>
          </div>
        ))}
      </div>

      <div className="mt-3 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
        <span>{relativeDate(order.createdAt)}</span>
        <span className="font-semibold">Итого: {formatCoins(order.total)}</span>
      </div>
    </article>
  );
}

export default function ProfilePage() {
  const { token, user, updateProfile, refreshMe } = useAuthStore();
  const isAdmin = user?.role === "admin";
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [tab, setTab] = useState("listings");
  const [adminUsers, setAdminUsers] = useState([]);
  const [loadingAdminUsers, setLoadingAdminUsers] = useState(false);
  const [bans, setBans] = useState([]);
  const [loadingBans, setLoadingBans] = useState(false);
  const [creatingBan, setCreatingBan] = useState(false);
  const [removingBanId, setRemovingBanId] = useState("");
  const [banForm, setBanForm] = useState({ mode: "username", value: "", reason: "" });
  const [promoCodes, setPromoCodes] = useState([]);
  const [loadingPromoCodes, setLoadingPromoCodes] = useState(false);
  const [creatingPromoCode, setCreatingPromoCode] = useState(false);
  const [updatingPromoCodeId, setUpdatingPromoCodeId] = useState("");
  const [deletingPromoCodeId, setDeletingPromoCodeId] = useState("");
  const [promoPickerOpen, setPromoPickerOpen] = useState(false);
  const [promoPickerQuery, setPromoPickerQuery] = useState("");
  const [promoSelectedProductIds, setPromoSelectedProductIds] = useState([]);
  const [promoCatalogProducts, setPromoCatalogProducts] = useState([]);
  const [loadingPromoCatalogProducts, setLoadingPromoCatalogProducts] = useState(false);
  const [adminUserDrafts, setAdminUserDrafts] = useState({});
  const [changingRoleUserId, setChangingRoleUserId] = useState("");
  const [savingAdminUserId, setSavingAdminUserId] = useState("");
  const [deletingListingId, setDeletingListingId] = useState("");
  const [deleteDialog, setDeleteDialog] = useState(null);
  const [unlinkBankDialogOpen, setUnlinkBankDialogOpen] = useState(false);
  const [clearingHistory, setClearingHistory] = useState("");
  const [historyPopupOpen, setHistoryPopupOpen] = useState(false);
  const [historyPopupTab, setHistoryPopupTab] = useState("listings");
  const [historyUserQuery, setHistoryUserQuery] = useState("");
  const [historyPopupUsername, setHistoryPopupUsername] = useState("");
  const [selectedHistoryUsername, setSelectedHistoryUsername] = useState("");

  const [dashboard, setDashboard] = useState({
    user: null,
    target: null,
    listings: [],
    purchases: [],
    sales: [],
    transactions: [],
  });

  const [profileForm, setProfileForm] = useState({ avatar: "", bio: "", hideAvatarInMarket: false });
  const [listingDrafts, setListingDrafts] = useState({});
  const [bankForm, setBankForm] = useState({ username: "", password: "" });
  const [promoForm, setPromoForm] = useState({ code: "", percent: "10", isActive: true });
  const [linkingBank, setLinkingBank] = useState(false);
  const [unlinkingBank, setUnlinkingBank] = useState(false);
  const [linkingTelegram, setLinkingTelegram] = useState(false);
  const [unlinkingTelegram, setUnlinkingTelegram] = useState(false);
  const [telegramLinkData, setTelegramLinkData] = useState({ deepLink: "", tokenExpiresAt: "" });
  const profileUser = useMemo(
    () => ({
      ...(dashboard.user || {}),
      ...(user || {}),
      bank: user?.bank || dashboard.user?.bank || { linked: false },
    }),
    [dashboard.user, user]
  );
  const bankState = profileUser?.bank || { linked: false };
  const telegramState = profileUser?.telegram || { linked: false };

  const loadDashboard = useCallback(
    async (showLoader = true, showError = true) => {
      if (!token) return;

      try {
        if (showLoader) {
          setLoading(true);
        }
        const hasAdminScope = isAdmin && String(selectedHistoryUsername || "").trim();
        const path = hasAdminScope
          ? `/users/me/dashboard?username=${encodeURIComponent(String(selectedHistoryUsername || "").trim())}`
          : "/users/me/dashboard";
        const data = await api.get(path, token);
        setDashboard({
          user: data.user || null,
          target: data.dashboardTarget || null,
          listings: data.listings || [],
          purchases: data.purchases || [],
          sales: data.sales || [],
          transactions: data.transactions || [],
        });
        const dashboardIsSelf = !data?.dashboardTarget || Boolean(data.dashboardTarget.self);
        if (dashboardIsSelf) {
          setProfileForm({
            avatar: data.user?.avatar || "",
            bio: data.user?.bio || "",
            hideAvatarInMarket: Boolean(data.user?.hideAvatarInMarket),
          });
        }
        const drafts = {};
        (data.listings || []).forEach((item) => {
          drafts[item.id] = { price: item.price, stock: item.stock };
        });
        setListingDrafts(drafts);
      } catch (err) {
        if (showError) {
          toast.error(err.message || "Не удалось загрузить профиль");
        }
      } finally {
        if (showLoader) {
          setLoading(false);
        }
      }
    },
    [isAdmin, selectedHistoryUsername, token]
  );

  const loadAdminUsers = useCallback(async () => {
    if (!token || !isAdmin) {
      setAdminUsers([]);
      setAdminUserDrafts({});
      return;
    }
    try {
      setLoadingAdminUsers(true);
      const data = await api.get("/admin/users", token);
      const users = Array.isArray(data?.users) ? data.users : [];
      setAdminUsers(users);
      setAdminUserDrafts((prev) => {
        const next = {};
        users.forEach((account) => {
          const id = String(account?.id || "");
          if (!id) {
            return;
          }
          const prevDraft = prev[id] || {};
          next[id] = {
            login: String(prevDraft.login ?? account.login ?? account.username ?? "").trim(),
            email: String(prevDraft.email ?? account.email ?? "").trim(),
            password: String(prevDraft.password ?? account.password ?? ""),
          };
        });
        return next;
      });
    } catch (err) {
      toast.error(err.message || "Не удалось загрузить пользователей");
    } finally {
      setLoadingAdminUsers(false);
    }
  }, [isAdmin, token]);

  const loadBans = useCallback(async () => {
    if (!token || !isAdmin) {
      setBans([]);
      return;
    }
    try {
      setLoadingBans(true);
      const data = await api.get("/admin/bans", token);
      setBans(Array.isArray(data?.bans) ? data.bans : []);
    } catch (err) {
      toast.error(err.message || "Не удалось загрузить баны");
    } finally {
      setLoadingBans(false);
    }
  }, [isAdmin, token]);

  const loadPromoCodes = useCallback(async () => {
    if (!token || !isAdmin) {
      setPromoCodes([]);
      return;
    }
    try {
      setLoadingPromoCodes(true);
      const data = await api.get("/admin/promo-codes", token);
      const list = Array.isArray(data?.promoCodes) ? data.promoCodes : [];
      setPromoCodes(list);
    } catch (err) {
      toast.error(err.message || "Не удалось загрузить промокоды");
    } finally {
      setLoadingPromoCodes(false);
    }
  }, [isAdmin, token]);

  const loadPromoCatalogProducts = useCallback(async () => {
    if (!isAdmin) {
      setPromoCatalogProducts([]);
      return;
    }
    try {
      setLoadingPromoCatalogProducts(true);
      const maxPages = 8;
      const perPage = 48;
      const unique = new Map();
      for (let page = 1; page <= maxPages; page += 1) {
        const data = await api.get(`/products?page=${page}&pageSize=${perPage}&sort=newest`, token);
        const items = Array.isArray(data?.products) ? data.products : [];
        items.forEach((item) => {
          const id = String(item?.id || "").trim();
          if (!id || unique.has(id)) {
            return;
          }
          unique.set(id, {
            id,
            title: String(item?.title || "").trim() || `#${id}`,
            seller: String(item?.seller?.username || "").trim(),
            deleted: Boolean(item?.deletedAt),
            isListed: Boolean(item?.isListed),
          });
        });
        const pages = Number(data?.pagination?.pages || page);
        if (page >= pages) {
          break;
        }
      }
      setPromoCatalogProducts(Array.from(unique.values()));
    } catch (err) {
      toast.error(err.message || "Не удалось загрузить товары для промокодов");
    } finally {
      setLoadingPromoCatalogProducts(false);
    }
  }, [isAdmin, token]);

  useEffect(() => {
    loadDashboard(true, true);
  }, [loadDashboard]);

  useEffect(() => {
    loadAdminUsers();
  }, [loadAdminUsers]);

  useEffect(() => {
    if (!isAdmin) {
      if (selectedHistoryUsername) {
        setSelectedHistoryUsername("");
      }
      return;
    }
    if (!selectedHistoryUsername && user?.username) {
      setSelectedHistoryUsername(user.username);
    }
  }, [isAdmin, selectedHistoryUsername, user?.username]);

  useEffect(() => {
    loadBans();
  }, [loadBans]);

  useEffect(() => {
    loadPromoCodes();
  }, [loadPromoCodes]);

  useEffect(() => {
    loadPromoCatalogProducts();
  }, [loadPromoCatalogProducts]);

  useEffect(() => {
    const update = () => loadDashboard(false, false);
    const stopProfile = onLiveUIEvent(LIVE_UI_EVENTS.PROFILE_CHANGED, update);
    const stopOrders = onLiveUIEvent(LIVE_UI_EVENTS.ORDERS_CHANGED, update);
    const stopBalance = onLiveUIEvent(LIVE_UI_EVENTS.BALANCE_CHANGED, update);
    const stopCatalog = onLiveUIEvent(LIVE_UI_EVENTS.CATALOG_CHANGED, update);

    return () => {
      stopProfile();
      stopOrders();
      stopBalance();
      stopCatalog();
    };
  }, [loadDashboard]);

  useEffect(() => {
    if (!token || !user?.bank?.linked) {
      return undefined;
    }
    const timer = setInterval(() => {
      refreshMe().catch(() => {});
    }, 1000);
    return () => clearInterval(timer);
  }, [token, user?.bank?.linked, refreshMe]);

  useEffect(() => {
    if (telegramState?.linked) {
      setTelegramLinkData({ deepLink: "", tokenExpiresAt: "" });
    }
  }, [telegramState?.chatId, telegramState?.linked]);

  const stats = useMemo(
    () => [
      { label: "Лоты", value: dashboard.listings.length, icon: Store },
      { label: "Покупки", value: dashboard.purchases.length, icon: WalletCards },
      { label: "Продажи", value: dashboard.sales.length, icon: ReceiptText },
    ],
    [dashboard]
  );
  const historyTarget = dashboard.target || null;
  const viewingForeignDashboard = Boolean(isAdmin && historyTarget && !historyTarget.self);
  const activeHistoryTabLabel = historyTabLabel(tab);
  const adminHistoryUserOptions = useMemo(() => {
    if (!isAdmin) {
      return [];
    }
    const values = new Set();
    if (user?.username) {
      values.add(String(user.username).trim());
    }
    (adminUsers || []).forEach((account) => {
      const value = String(account?.username || "").trim();
      if (value) {
        values.add(value);
      }
    });
    return Array.from(values).sort((a, b) => a.localeCompare(b));
  }, [adminUsers, isAdmin, user?.username]);
  const filteredAdminHistoryUsers = useMemo(() => {
    const query = String(historyUserQuery || "")
      .trim()
      .toLowerCase();
    if (!query) {
      return adminHistoryUserOptions;
    }
    return adminHistoryUserOptions.filter((name) => name.toLowerCase().includes(query));
  }, [adminHistoryUserOptions, historyUserQuery]);
  const promoProductOptions = useMemo(() => {
    const map = new Map();

    const upsert = (raw) => {
      const id = String(raw?.id || "").trim();
      if (!id) {
        return;
      }
      const prev = map.get(id);
      map.set(id, {
        id,
        title: String(raw?.title || prev?.title || "").trim() || `#${id}`,
        seller: String(raw?.seller || raw?.sellerUsername || prev?.seller || "").trim(),
        deleted: Boolean(raw?.deleted || prev?.deleted),
        isListed: raw?.isListed !== undefined ? Boolean(raw.isListed) : prev?.isListed ?? true,
      });
    };

    (dashboard.listings || []).forEach((item) =>
      upsert({
        id: item?.id,
        title: item?.title,
        seller: item?.seller?.username || profileUser?.username || "",
        deleted: Boolean(item?.deletedAt),
        isListed: item?.isListed !== undefined ? Boolean(item.isListed) : true,
      })
    );
    promoCatalogProducts.forEach((item) => upsert(item));
    promoCodes.forEach((promo) => {
      (promo?.products || []).forEach((product) => upsert(product));
    });

    return Array.from(map.values()).sort((a, b) => a.title.localeCompare(b.title));
  }, [dashboard.listings, profileUser?.username, promoCatalogProducts, promoCodes]);

  const promoProductById = useMemo(() => {
    const map = new Map();
    promoProductOptions.forEach((item) => map.set(item.id, item));
    return map;
  }, [promoProductOptions]);

  const promoSelectedProducts = useMemo(
    () => promoSelectedProductIds.map((id) => promoProductById.get(id)).filter(Boolean),
    [promoProductById, promoSelectedProductIds]
  );

  const promoFilteredProductOptions = useMemo(() => {
    const q = String(promoPickerQuery || "").trim().toLowerCase();
    if (!q) {
      return promoProductOptions;
    }
    return promoProductOptions.filter((item) => {
      const haystack = `${item.title} ${item.seller} ${item.id}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [promoPickerQuery, promoProductOptions]);
  const onSaveProfile = async (event) => {
    event.preventDefault();
    try {
      setSavingProfile(true);
      await updateProfile(profileForm);
      await refreshMe();
      await loadDashboard(false, false);
      toast.success("Профиль обновлён");
    } catch (err) {
      toast.error(err.message || "Не удалось обновить профиль");
    } finally {
      setSavingProfile(false);
    }
  };

  const onAvatarFileChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file || !token) {
      return;
    }
    try {
      setUploadingAvatar(true);
      const data = await api.uploadImage(file, token);
      setProfileForm((prev) => ({ ...prev, avatar: data.url || "" }));
      toast.success("Изображение аватара загружено");
    } catch (err) {
      toast.error(err.message || "Не удалось загрузить изображение");
    } finally {
      setUploadingAvatar(false);
      event.target.value = "";
    }
  };

  const onLinkBank = async () => {
    const username = bankForm.username.trim();
    const password = bankForm.password;
    if (!username || !password) {
      toast.error("Введите логин и пароль MB Банка");
      return;
    }
    try {
      setLinkingBank(true);
      const data = await api.post("/users/me/bank/link", { username, password }, token);
      setBankForm({ username: "", password: "" });
      await refreshMe();
      await loadDashboard(false, false);
      toast.success(`Счет ${data?.bank?.username || username} привязан`);
    } catch (err) {
      toast.error(err.message || "Не удалось привязать MB Банк");
    } finally {
      setLinkingBank(false);
    }
  };

  const onUnlinkBank = () => {
    if (!bankState?.linked) {
      return;
    }
    setUnlinkBankDialogOpen(true);
  };

  const onConfirmUnlinkBank = async () => {
    try {
      setUnlinkingBank(true);
      await api.delete("/users/me/bank/link", token);
      await refreshMe();
      await loadDashboard(false, false);
      toast.success("Привязка MB Банка снята");
      setUnlinkBankDialogOpen(false);
    } catch (err) {
      toast.error(err.message || "Не удалось снять привязку MB Банка");
    } finally {
      setUnlinkingBank(false);
    }
  };

  const onCreateTelegramLink = async () => {
    if (!token) {
      return;
    }
    try {
      setLinkingTelegram(true);
      const data = await api.post("/users/me/telegram/link-token", {}, token);
      const deepLink = String(data?.deepLink || "");
      const tokenExpiresAt = String(data?.tokenExpiresAt || "");
      setTelegramLinkData({ deepLink, tokenExpiresAt });
      if (deepLink) {
        window.open(deepLink, "_blank", "noopener,noreferrer");
      }
      toast.success("Откройте Telegram и нажмите Start у бота.");
    } catch (err) {
      toast.error(err.message || "Не удалось получить ссылку для Telegram.");
    } finally {
      setLinkingTelegram(false);
    }
  };

  const onCopyTelegramLink = async () => {
    const value = String(telegramLinkData.deepLink || "").trim();
    if (!value) {
      return;
    }
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = value;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand("copy");
        document.body.removeChild(textArea);
      }
      toast.success("Ссылка скопирована.");
    } catch (_err) {
      toast.error("Не удалось скопировать ссылку.");
    }
  };

  const onUnlinkTelegram = async () => {
    if (!telegramState?.linked) {
      return;
    }
    try {
      setUnlinkingTelegram(true);
      await api.delete("/users/me/telegram/link", token);
      await refreshMe();
      await loadDashboard(false, false);
      setTelegramLinkData({ deepLink: "", tokenExpiresAt: "" });
      toast.success("Telegram отвязан.");
    } catch (err) {
      toast.error(err.message || "Не удалось отвязать Telegram.");
    } finally {
      setUnlinkingTelegram(false);
    }
  };

  const onUpdateListing = async (listing) => {
    try {
      const draft = listingDrafts[listing.id] || { price: listing.price, stock: listing.stock };
      const payload = {
        price: Number(draft.price),
        stock: Number(draft.stock),
      };
      await api.put(`/products/${listing.id}`, payload, token);
      await loadDashboard(false, false);
      toast.success("Лот обновлён");
    } catch (err) {
      toast.error(err.message || "Не удалось обновить лот");
    }
  };

  const onToggleListing = async (listing) => {
    try {
      await api.patch(`/products/${listing.id}/listing`, { listed: !listing.isListed }, token);
      await loadDashboard(false, false);
      toast.success(listing.isListed ? "Лот скрыт" : "Лот снова в продаже");
    } catch (err) {
      toast.error(err.message || "Не удалось поменять статус лота");
    }
  };

  const onDeleteListing = async (listing) => {
    if (!listing?.id) {
      return;
    }
    setDeleteDialog({ id: listing.id, title: listing.title || "Лот" });
  };

  const onConfirmDeleteListing = async () => {
    if (!deleteDialog?.id) {
      return;
    }
    try {
      setDeletingListingId(deleteDialog.id);
      try {
        await api.delete(`/products/${deleteDialog.id}`, token);
      } catch (err) {
        if (err?.status === 404) {
          await api.post(`/products/${deleteDialog.id}/delete`, {}, token);
        } else {
          throw err;
        }
      }
      await loadDashboard(false, false);
      toast.success("Лот удалён");
      setDeleteDialog(null);
    } catch (err) {
      const message = err.message || "Не удалось удалить лот";
      if (String(message).toLowerCase().includes("route not found")) {
        toast.error("Маршрут удаления не найден на сервере. Перезапусти start_game.bat.");
      } else {
        toast.error(message);
      }
    } finally {
      setDeletingListingId("");
    }
  };

  const onChangeUserRole = async (targetUser, role) => {
    try {
      setChangingRoleUserId(targetUser.id);
      const data = await api.patch(`/admin/users/${targetUser.id}/role`, { role }, token);
      setAdminUsers((prev) => prev.map((item) => (item.id === targetUser.id ? data.user : item)));
      setAdminUserDrafts((prev) => ({
        ...prev,
        [targetUser.id]: {
          login: String(data?.user?.login ?? data?.user?.username ?? targetUser.login ?? targetUser.username ?? "").trim(),
          email: String(data?.user?.email ?? targetUser.email ?? "").trim(),
          password: String(data?.user?.password ?? targetUser.password ?? ""),
        },
      }));
      await refreshMe();
      await loadDashboard(false, false);
      toast.success(`Роль для ${targetUser.username} обновлена`);
    } catch (err) {
      toast.error(err.message || "Не удалось сменить роль");
    } finally {
      setChangingRoleUserId("");
    }
  };

  const onAdminUserDraftChange = (userId, field, value) => {
    const id = String(userId || "").trim();
    if (!id || !field) {
      return;
    }
    setAdminUserDrafts((prev) => ({
      ...prev,
      [id]: {
        login: String(prev?.[id]?.login ?? ""),
        email: String(prev?.[id]?.email ?? ""),
        password: String(prev?.[id]?.password ?? ""),
        [field]: value,
      },
    }));
  };

  const onSaveAdminUserCredentials = async (account) => {
    const userId = String(account?.id || "").trim();
    if (!userId) {
      return;
    }
    const draft = adminUserDrafts[userId] || {};
    const currentLogin = String(account?.login ?? account?.username ?? "").trim();
    const currentEmail = String(account?.email ?? "").trim();
    const currentPassword = String(account?.password ?? "");
    const nextLogin = String(draft?.login ?? currentLogin).trim();
    const nextEmail = String(draft?.email ?? currentEmail).trim();
    const nextPassword = String(draft?.password ?? currentPassword);

    const payload = {};
    if (nextLogin !== currentLogin) {
      payload.login = nextLogin;
    }
    if (nextEmail.toLowerCase() !== currentEmail.toLowerCase()) {
      payload.email = nextEmail;
    }
    if (nextPassword !== currentPassword) {
      payload.password = nextPassword;
    }

    if (!Object.keys(payload).length) {
      toast("Нет изменений");
      return;
    }

    try {
      setSavingAdminUserId(userId);
      const data = await api.patch(`/admin/users/${userId}`, payload, token);
      const updated = data?.user || null;
      if (!updated) {
        throw new Error("Сервер не вернул обновлённого пользователя");
      }
      setAdminUsers((prev) => prev.map((item) => (item.id === userId ? updated : item)));
      setAdminUserDrafts((prev) => ({
        ...prev,
        [userId]: {
          login: String(updated.login ?? updated.username ?? "").trim(),
          email: String(updated.email ?? "").trim(),
          password: String(updated.password ?? ""),
        },
      }));
      if (user?.id === userId) {
        await refreshMe();
      }
      toast.success(`Данные ${updated.username || account.username} обновлены`);
    } catch (err) {
      toast.error(err.message || "Не удалось обновить данные пользователя");
    } finally {
      setSavingAdminUserId("");
    }
  };

  const onCreateBan = async () => {
    const mode = banForm.mode === "ip" ? "ip" : "username";
    const value = String(banForm.value || "").trim();
    const reason = String(banForm.reason || "").trim();
    if (!value) {
      toast.error(mode === "ip" ? "Введите IP-адрес" : "Введите ник");
      return;
    }

    try {
      setCreatingBan(true);
      await api.post(
        "/admin/bans",
        {
          mode,
          value,
          reason,
        },
        token
      );
      setBanForm((prev) => ({ ...prev, value: "", reason: "" }));
      await loadBans();
      toast.success(mode === "ip" ? "IP заблокирован" : "Пользователь заблокирован");
    } catch (err) {
      toast.error(err.message || "Не удалось выдать бан");
    } finally {
      setCreatingBan(false);
    }
  };

  const onUnban = async (banItem) => {
    const id = String(banItem?.id || "").trim();
    if (!id) {
      return;
    }
    try {
      setRemovingBanId(id);
      await api.delete(`/admin/bans/${id}`, token);
      await loadBans();
      toast.success("Бан снят");
    } catch (err) {
      toast.error(err.message || "Не удалось снять бан");
    } finally {
      setRemovingBanId("");
    }
  };

  const onTogglePromoProduct = (productId) => {
    const id = String(productId || "").trim();
    if (!id) {
      return;
    }
    setPromoSelectedProductIds((prev) =>
      prev.includes(id) ? prev.filter((itemId) => itemId !== id) : [...prev, id]
    );
  };

  const onCreatePromoCode = async () => {
    const code = String(promoForm.code || "")
      .trim()
      .toUpperCase();
    const productIds = Array.from(
      new Set(
        promoSelectedProductIds
          .map((id) => String(id || "").trim())
          .filter(Boolean)
      )
    );
    const percent = Number(promoForm.percent);
    if (!code || !productIds.length || !Number.isInteger(percent) || percent < 1 || percent > 100) {
      toast.error("Заполните код, выберите товары и укажите скидку от 1 до 100%");
      return;
    }
    try {
      setCreatingPromoCode(true);
      await api.post(
        "/admin/promo-codes",
        {
          code,
          productIds,
          percent,
          isActive: Boolean(promoForm.isActive),
        },
        token
      );
      setPromoForm((prev) => ({ ...prev, code: "", percent: "10" }));
      setPromoSelectedProductIds([]);
      setPromoPickerQuery("");
      setPromoPickerOpen(false);
      await loadPromoCodes();
      toast.success("Промокод создан");
    } catch (err) {
      toast.error(err.message || "Не удалось создать промокод");
    } finally {
      setCreatingPromoCode(false);
    }
  };

  const onTogglePromoCode = async (promo) => {
    if (!promo?.id) {
      return;
    }
    try {
      setUpdatingPromoCodeId(promo.id);
      const data = await api.patch(
        `/admin/promo-codes/${promo.id}`,
        {
          isActive: !promo.isActive,
        },
        token
      );
      setPromoCodes((prev) => prev.map((item) => (item.id === promo.id ? data.promoCode : item)));
    } catch (err) {
      toast.error(err.message || "Не удалось обновить промокод");
    } finally {
      setUpdatingPromoCodeId("");
    }
  };

  const onDeletePromoCode = async (promo) => {
    if (!promo?.id) {
      return;
    }
    try {
      setDeletingPromoCodeId(promo.id);
      await api.delete(`/admin/promo-codes/${promo.id}`, token);
      setPromoCodes((prev) => prev.filter((item) => item.id !== promo.id));
      toast.success("Промокод удален");
    } catch (err) {
      toast.error(err.message || "Не удалось удалить промокод");
    } finally {
      setDeletingPromoCodeId("");
    }
  };

  const onClearHistory = async (scope) => {
    if (!token || !["purchases", "sales", "transactions"].includes(scope)) {
      return;
    }
    try {
      setClearingHistory(scope);
      if (scope === "transactions") {
        await api.post("/transactions/clear", {}, token);
        setDashboard((prev) => ({ ...prev, transactions: [] }));
        toast.success("Транзакции очищены");
      } else if (scope === "purchases") {
        await api.post("/orders/clear", { scope: "purchases" }, token);
        setDashboard((prev) => ({ ...prev, purchases: [] }));
        toast.success("Покупки очищены");
      } else {
        await api.post("/orders/clear", { scope: "sales" }, token);
        setDashboard((prev) => ({ ...prev, sales: [] }));
        toast.success("Продажи очищены");
      }
      await loadDashboard(false, false);
    } catch (err) {
      toast.error(err.message || "Не удалось очистить историю");
    } finally {
      setClearingHistory("");
    }
  };

  const onOpenHistoryPopup = () => {
    setHistoryPopupTab(tab);
    setHistoryPopupUsername(selectedHistoryUsername || user?.username || "");
    setHistoryUserQuery("");
    setHistoryPopupOpen(true);
  };

  const onApplyHistoryPopup = () => {
    const nextTab = HISTORY_TABS.some((item) => item.id === historyPopupTab) ? historyPopupTab : "listings";
    setTab(nextTab);

    if (isAdmin) {
      const nextUsername = String(historyPopupUsername || "")
        .trim()
        .slice(0, 20);
      if (!nextUsername) {
        toast.error("Выберите ник пользователя.");
        return;
      }
      setSelectedHistoryUsername(nextUsername);
    }

    setHistoryPopupOpen(false);
  };

  return (
    <AnimatedPage>
      <section className="rounded-3xl border border-slate-200/80 bg-white/85 p-5 dark:border-slate-700/70 dark:bg-slate-900/75">
        <div className="flex flex-wrap items-center gap-4">
          <img
            src={profileUser?.avatar || "https://api.dicebear.com/9.x/shapes/svg?seed=MDM"}
            alt={profileUser?.username || "Аватар профиля"}
            className="h-20 w-20 rounded-2xl object-cover"
          />

          <div>
            <h1 className="text-3xl font-black text-slate-900 dark:text-slate-100">{profileUser?.username || user?.username}</h1>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Рейтинг: {Number(profileUser?.rating || 0).toFixed(1)} • Роль: {roleLabel(profileUser?.role || user?.role)}
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{shorten(profileUser?.bio || "Нет описания.", 120)}</p>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((item) => (
            <div
              key={item.label}
              className="rounded-2xl border border-slate-200/70 bg-gradient-to-br from-white to-slate-50 p-4 dark:border-slate-700/70 dark:from-slate-900 dark:to-slate-800"
            >
              <item.icon className="text-cyan-500" size={18} />
              <p className="mt-2 text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">{item.label}</p>
              <p className="text-lg font-bold text-slate-900 dark:text-slate-100">{item.value}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-6 grid gap-5 lg:grid-cols-3">
        <form
          onSubmit={onSaveProfile}
          className="rounded-2xl border border-slate-200/80 bg-white/85 p-4 dark:border-slate-700/70 dark:bg-slate-900/75"
        >
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Настройки профиля</h2>

          <label className="mt-4 block">
            <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">Ссылка на аватар</span>
            <input
              value={profileForm.avatar}
              onChange={(event) => setProfileForm((prev) => ({ ...prev, avatar: event.target.value }))}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-cyan-400 focus:ring dark:border-slate-700 dark:bg-slate-900"
              placeholder="https://..."
            />
          </label>

          <label className="mt-3 block">
            <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">Загрузить файл аватара</span>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
              onChange={onAvatarFileChange}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-cyan-400 focus:ring dark:border-slate-700 dark:bg-slate-900"
            />
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {uploadingAvatar ? "Загрузка файла..." : "Можно загрузить JPG, PNG, WEBP, GIF, AVIF до 5 МБ."}
            </p>
            <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
              Совет: не используйте личные фото, если будете показывать проект другим.
            </p>
          </label>

          <label className="mt-3 flex items-start gap-3 rounded-xl border border-slate-200/80 bg-slate-50/70 p-3 dark:border-slate-700/70 dark:bg-slate-800/40">
            <input
              type="checkbox"
              checked={Boolean(profileForm.hideAvatarInMarket)}
              onChange={(event) =>
                setProfileForm((prev) => ({
                  ...prev,
                  hideAvatarInMarket: Boolean(event.target.checked),
                }))
              }
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-cyan-500 focus:ring-cyan-400 dark:border-slate-600"
            />
            <span>
              <span className="block text-sm font-medium text-slate-700 dark:text-slate-200">Скрывать аватар в лотах/заказах</span>
              <span className="block text-xs text-slate-500 dark:text-slate-400">
                Аватар останется в профиле, но в карточках лотов и заказах будет скрыт.
              </span>
            </span>
          </label>

          <label className="mt-3 block">
            <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">О себе</span>
            <textarea
              value={profileForm.bio}
              onChange={(event) => setProfileForm((prev) => ({ ...prev, bio: event.target.value.slice(0, 280) }))}
              rows={4}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-cyan-400 focus:ring dark:border-slate-700 dark:bg-slate-900"
              placeholder="Расскажите, чем торгуете..."
            />
          </label>

          <button
            type="submit"
            disabled={savingProfile || uploadingAvatar}
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-cyan-600 disabled:opacity-70"
          >
            <Save size={16} />
            {savingProfile ? "Сохранение..." : "Сохранить профиль"}
          </button>

          <div className="mt-5 rounded-2xl border border-slate-200/80 bg-slate-50/70 p-3 dark:border-slate-700/70 dark:bg-slate-800/40">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Связка с MB Банком</p>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                  bankState.linked
                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                    : "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300"
                }`}
              >
                {bankState.linked ? "Привязан" : "Не привязан"}
              </span>
            </div>

            {bankState.linked ? (
              <div className="mt-2 space-y-2 text-xs text-slate-600 dark:text-slate-300">
                <p>
                  Логин MB: <span className="font-semibold text-slate-900 dark:text-slate-100">{bankState.username}</span>
                </p>
                {bankState.exists === true && (
                  <p>
                    Баланс MB:{" "}
                    <span className="font-semibold text-emerald-600 dark:text-emerald-300">{formatCoins(bankState.balance)} ₽</span>
                  </p>
                )}
                {bankState.exists === false && (
                  <p className="text-rose-600 dark:text-rose-300">
                    Этот счет не найден в MB Банке. Перепривяжите аккаунт.
                  </p>
                )}
                {bankState.exists === null && (
                  <p className="text-amber-600 dark:text-amber-300">Нет связи с MB Банком. Данные могут быть временно недоступны.</p>
                )}
                <button
                  type="button"
                  onClick={onUnlinkBank}
                  disabled={unlinkingBank || linkingBank}
                  className="inline-flex items-center gap-2 rounded-xl bg-rose-500 px-3 py-2 text-xs font-semibold text-white transition hover:bg-rose-600 disabled:opacity-70"
                >
                  <Unlink size={14} />
                  {unlinkingBank ? "Отвязка..." : "Отвязать MB Банк"}
                </button>
              </div>
            ) : (
              <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">
                Без привязки MB Банка нельзя продавать и платить по привязанной карте. Покупка доступна через QR или ID карты + пароль.
              </p>
            )}

            <div className="mt-3 grid gap-2">
              <input
                value={bankForm.username}
                onChange={(event) => setBankForm((prev) => ({ ...prev, username: event.target.value }))}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-cyan-400 focus:ring dark:border-slate-700 dark:bg-slate-900"
                placeholder="Логин MB Банка"
              />
              <input
                type="password"
                value={bankForm.password}
                onChange={(event) => setBankForm((prev) => ({ ...prev, password: event.target.value }))}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-cyan-400 focus:ring dark:border-slate-700 dark:bg-slate-900"
                placeholder="Пароль MB Банка"
              />
              <button
                type="button"
                onClick={onLinkBank}
                disabled={linkingBank || unlinkingBank}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-600 disabled:opacity-70"
              >
                <Link2 size={15} />
                {linkingBank ? "Связка..." : "Связать с банком"}
              </button>
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-slate-200/80 bg-slate-50/70 p-3 dark:border-slate-700/70 dark:bg-slate-800/40">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Связка с Telegram</p>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                  telegramState.linked
                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                    : "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300"
                }`}
              >
                {telegramState.linked ? "Привязан" : "Не привязан"}
              </span>
            </div>

            {telegramState.linked ? (
              <div className="mt-2 space-y-2 text-xs text-slate-600 dark:text-slate-300">
                <p>
                  Telegram:{" "}
                  <span className="font-semibold text-slate-900 dark:text-slate-100">
                    {telegramState.username ? `@${telegramState.username}` : "без username"}
                  </span>
                </p>
                <p>
                  Chat ID: <span className="font-semibold text-slate-900 dark:text-slate-100">{telegramState.chatId || "-"}</span>
                </p>
                <button
                  type="button"
                  onClick={onUnlinkTelegram}
                  disabled={unlinkingTelegram || linkingTelegram}
                  className="inline-flex items-center gap-2 rounded-xl bg-rose-500 px-3 py-2 text-xs font-semibold text-white transition hover:bg-rose-600 disabled:opacity-70"
                >
                  <Unlink size={14} />
                  {unlinkingTelegram ? "Отвязка..." : "Отвязать Telegram"}
                </button>
              </div>
            ) : (
              <div className="mt-2 space-y-2 text-xs text-slate-600 dark:text-slate-300">
                <p>Нажмите кнопку, откройте Telegram и нажмите Start у бота.</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={onCreateTelegramLink}
                    disabled={linkingTelegram || unlinkingTelegram}
                    className="inline-flex items-center gap-2 rounded-xl bg-sky-500 px-3 py-2 text-xs font-semibold text-white transition hover:bg-sky-600 disabled:opacity-70"
                  >
                    <Link2 size={14} />
                    {linkingTelegram ? "Создание ссылки..." : "Получить ссылку"}
                  </button>
                  {telegramLinkData.deepLink ? (
                    <>
                      <button
                        type="button"
                        onClick={onCopyTelegramLink}
                        className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
                      >
                        <Copy size={13} />
                        Копировать
                      </button>
                      <a
                        href={telegramLinkData.deepLink}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
                      >
                        <ExternalLink size={13} />
                        Открыть
                      </a>
                    </>
                  ) : null}
                </div>
                {telegramLinkData.deepLink ? (
                  <p className="break-all rounded-xl border border-slate-200 bg-white/70 px-2 py-1 text-[11px] dark:border-slate-700 dark:bg-slate-900/70">
                    {telegramLinkData.deepLink}
                  </p>
                ) : null}
                {telegramLinkData.tokenExpiresAt ? (
                  <p className="text-[11px] text-amber-600 dark:text-amber-300">
                    Ссылка действует до: {relativeDate(telegramLinkData.tokenExpiresAt)}
                  </p>
                ) : null}
              </div>
            )}
          </div>
        </form>

        <div className="rounded-2xl border border-slate-200/80 bg-white/85 p-4 dark:border-slate-700/70 dark:bg-slate-900/75 lg:col-span-2">
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-700 dark:bg-slate-800/60">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Раздел: {activeHistoryTabLabel}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {isAdmin
                    ? `Профиль: ${historyTarget?.username || selectedHistoryUsername || user?.username || "-"}`
                    : "Профиль: ваш аккаунт"}
                </p>
              </div>
              <button
                type="button"
                onClick={onOpenHistoryPopup}
                className="inline-flex items-center gap-2 rounded-xl bg-indigo-500 px-3 py-2 text-xs font-semibold text-white transition hover:bg-indigo-600"
              >
                <Search size={14} />
                Открыть меню
              </button>
            </div>
          </div>

          {!loading && tab !== "listings" && (
            <div className="mt-3 flex justify-end">
              <button
                type="button"
                onClick={() => onClearHistory(tab)}
                disabled={
                  viewingForeignDashboard ||
                  clearingHistory === tab ||
                  (tab === "purchases" && !dashboard.purchases.length) ||
                  (tab === "sales" && !dashboard.sales.length) ||
                  (tab === "transactions" && !dashboard.transactions.length)
                }
                className="inline-flex items-center gap-2 rounded-xl bg-slate-700 px-3 py-2 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:opacity-70 dark:bg-slate-600 dark:hover:bg-slate-500"
              >
                <Trash2 size={13} />
                {clearingHistory === tab
                  ? "Очистка..."
                  : tab === "purchases"
                    ? "Очистить покупки"
                    : tab === "sales"
                      ? "Очистить продажи"
                      : "Очистить транзакции"}
              </button>
              {viewingForeignDashboard ? (
                <p className="ml-3 self-center text-[11px] text-amber-600 dark:text-amber-300">
                  Историю можно очищать только в своем профиле.
                </p>
              ) : null}
            </div>
          )}

          <div className="mt-4">
            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, index) => (
                  <div key={index} className="h-20 rounded-xl bg-slate-100 animate-pulse dark:bg-slate-800" />
                ))}
              </div>
            ) : null}

            {!loading && tab === "listings" && (
              <div className="space-y-3">
                {dashboard.listings.length ? (
                  dashboard.listings.map((listing) => {
                    const draft = listingDrafts[listing.id] || { price: listing.price, stock: listing.stock };
                    return (
                      <motion.article
                        key={listing.id}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.2 }}
                        className="rounded-2xl border border-slate-200/80 bg-white p-3 dark:border-slate-700/70 dark:bg-slate-900"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <img src={listing.image} alt={listing.title} className="h-14 w-14 rounded-xl object-cover" />
                            <div>
                              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{listing.title}</p>
                              <p className="text-xs text-slate-500 dark:text-slate-400">
                                {listing.isListed ? "В продаже" : "Скрыт"} • остаток {listing.stock}
                              </p>
                              {isAdmin && listing.seller?.username && (
                                <p className="text-[11px] text-cyan-600 dark:text-cyan-300">Владелец: {listing.seller.username}</p>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => onToggleListing(listing)}
                              className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                                listing.isListed ? "bg-rose-500 text-white hover:bg-rose-600" : "bg-emerald-500 text-white hover:bg-emerald-600"
                              }`}
                            >
                              {listing.isListed ? "Снять с продажи" : "Вернуть в продажу"}
                            </button>
                            <button
                              type="button"
                              onClick={() => onDeleteListing(listing)}
                              disabled={deletingListingId === listing.id}
                              className="inline-flex items-center gap-1 rounded-xl bg-slate-700 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:opacity-70 dark:bg-slate-600 dark:hover:bg-slate-500"
                            >
                              <Trash2 size={12} />
                              {deletingListingId === listing.id ? "Удаление..." : "Удалить"}
                            </button>
                          </div>
                        </div>

                        <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                          <input
                            type="number"
                            min={1}
                            value={draft.price}
                            onChange={(event) =>
                              setListingDrafts((prev) => ({
                                ...prev,
                                [listing.id]: { ...draft, price: event.target.value },
                              }))
                            }
                            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-cyan-400 focus:ring dark:border-slate-700 dark:bg-slate-900"
                            placeholder="Цена"
                          />

                          <input
                            type="number"
                            min={0}
                            value={draft.stock}
                            onChange={(event) =>
                              setListingDrafts((prev) => ({
                                ...prev,
                                [listing.id]: { ...draft, stock: event.target.value },
                              }))
                            }
                            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-cyan-400 focus:ring dark:border-slate-700 dark:bg-slate-900"
                            placeholder="Остаток"
                          />

                          <button
                            type="button"
                            onClick={() => onUpdateListing(listing)}
                            className="inline-flex items-center justify-center gap-1 rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-cyan-600"
                          >
                            <PencilLine size={14} />
                            Сохранить
                          </button>
                        </div>
                      </motion.article>
                    );
                  })
                ) : (
                  <EmptyState title="Пока нет лотов" description="Создайте первый товар на странице продажи." />
                )}
              </div>
            )}

            {!loading && tab === "purchases" && (
              <div className="space-y-3">
                {dashboard.purchases.length ? (
                  dashboard.purchases.map((order) => <OrderMiniCard key={order.id} order={order} title={`Покупка #${order.id.slice(0, 8)}`} />)
                ) : (
                  <EmptyState title="Пока нет покупок" description="Купите что-нибудь в каталоге, чтобы увидеть историю." />
                )}
              </div>
            )}

            {!loading && tab === "sales" && (
              <div className="space-y-3">
                {dashboard.sales.length ? (
                  dashboard.sales.map((order) => <OrderMiniCard key={order.id} order={order} title={`Продажа #${order.id.slice(0, 8)}`} />)
                ) : (
                  <EmptyState title="Пока нет продаж" description="Когда ваши лоты купят, они появятся здесь." />
                )}
              </div>
            )}

            {!loading && tab === "transactions" && (
              <div className="space-y-2">
                {dashboard.transactions.length ? (
                  dashboard.transactions.slice(0, 20).map((tx) => {
                    const incoming = tx.toUserId === user?.id;
                    return (
                      <div
                        key={tx.id}
                        className="flex items-center justify-between rounded-xl border border-slate-200/80 bg-white/90 px-3 py-2 dark:border-slate-700/70 dark:bg-slate-900"
                      >
                        <div>
                          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{tx.type}</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">{relativeDate(tx.createdAt)}</p>
                        </div>
                        <p className={`text-sm font-bold ${incoming ? "text-emerald-500" : "text-rose-500"}`}>
                          {incoming ? "+" : "-"}
                          {formatCoins(tx.amount)}
                        </p>
                      </div>
                    );
                  })
                ) : (
                  <EmptyState title="Пока нет транзакций" description="Финансовая активность появится после покупок и продаж." />
                )}
              </div>
            )}
          </div>
        </div>
      </section>

      <AnimatePresence>
        {deleteDialog && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4"
            onClick={() => (deletingListingId ? null : setDeleteDialog(null))}
          >
            <motion.div
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.98 }}
              transition={{ duration: 0.18 }}
              onClick={(event) => event.stopPropagation()}
              className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-slate-900"
            >
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">Удалить лот?</h3>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                Лот <span className="font-semibold text-slate-900 dark:text-slate-100">"{deleteDialog.title}"</span> будет удален без
                возможности восстановления.
              </p>
              <div className="mt-4 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setDeleteDialog(null)}
                  disabled={Boolean(deletingListingId)}
                  className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:opacity-60 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  Отмена
                </button>
                <button
                  type="button"
                  onClick={onConfirmDeleteListing}
                  disabled={Boolean(deletingListingId)}
                  className="inline-flex items-center gap-2 rounded-xl bg-rose-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-600 disabled:opacity-70"
                >
                  <Trash2 size={14} />
                  {deletingListingId ? "Удаление..." : "Удалить"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {historyPopupOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[65] grid place-items-center bg-slate-950/65 p-4"
            onClick={() => setHistoryPopupOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.98 }}
              transition={{ duration: 0.18 }}
              onClick={(event) => event.stopPropagation()}
              className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-slate-900"
            >
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">Меню профиля</h3>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Выберите раздел истории
                {isAdmin ? " и пользователя по нику" : ""}.
              </p>

              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {HISTORY_TABS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setHistoryPopupTab(item.id)}
                    className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${
                      historyPopupTab === item.id
                        ? "bg-indigo-500 text-white"
                        : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              {isAdmin ? (
                <div className="mt-4">
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Ник пользователя</p>
                  <div className="relative">
                    <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      value={historyUserQuery}
                      onChange={(event) => setHistoryUserQuery(event.target.value)}
                      className="w-full rounded-xl border border-slate-300 bg-white py-2 pl-8 pr-3 text-sm outline-none ring-cyan-400 focus:ring dark:border-slate-700 dark:bg-slate-900"
                      placeholder="Поиск по нику"
                    />
                  </div>
                  <div className="mt-2 max-h-44 space-y-1 overflow-auto rounded-xl border border-slate-200 bg-slate-50 p-2 dark:border-slate-700 dark:bg-slate-800/60">
                    {filteredAdminHistoryUsers.length ? (
                      filteredAdminHistoryUsers.map((name) => (
                        <button
                          key={name}
                          type="button"
                          onClick={() => setHistoryPopupUsername(name)}
                          className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-sm transition ${
                            historyPopupUsername === name
                              ? "bg-indigo-500 text-white"
                              : "bg-white text-slate-700 hover:bg-slate-100 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-700"
                          }`}
                        >
                          <span className="truncate">{name}</span>
                          {historyPopupUsername === name ? <Check size={14} /> : null}
                        </button>
                      ))
                    ) : (
                      <p className="px-1 py-2 text-xs text-slate-500 dark:text-slate-400">Ник не найден.</p>
                    )}
                  </div>
                </div>
              ) : null}

              <div className="mt-4 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setHistoryPopupOpen(false)}
                  className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  Отмена
                </button>
                <button
                  type="button"
                  onClick={onApplyHistoryPopup}
                  className="rounded-xl bg-indigo-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-600"
                >
                  Применить
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {unlinkBankDialogOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4"
            onClick={() => (unlinkingBank ? null : setUnlinkBankDialogOpen(false))}
          >
            <motion.div
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.98 }}
              transition={{ duration: 0.18 }}
              onClick={(event) => event.stopPropagation()}
              className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-slate-900"
            >
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">Отвязать MB Банк?</h3>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                Покупки и продажи в МДМ будут недоступны, пока вы не привяжете счет снова.
              </p>
              <div className="mt-4 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setUnlinkBankDialogOpen(false)}
                  disabled={unlinkingBank}
                  className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:opacity-60 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  Отмена
                </button>
                <button
                  type="button"
                  onClick={onConfirmUnlinkBank}
                  disabled={unlinkingBank}
                  className="inline-flex items-center gap-2 rounded-xl bg-rose-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-600 disabled:opacity-70"
                >
                  <Unlink size={14} />
                  {unlinkingBank ? "Отвязка..." : "Отвязать"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {isAdmin && (
        <>
          <motion.section
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="mt-6 rounded-2xl border border-indigo-300/60 bg-gradient-to-br from-indigo-50 to-cyan-50 p-4 shadow-sm dark:border-indigo-700/50 dark:from-slate-900 dark:to-slate-800"
          >
            <div className="mb-3 flex items-center gap-2">
              <ShieldCheck className="text-indigo-600 dark:text-indigo-300" size={18} />
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Админ-панель ролей</h2>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Админ может переключать роли: <strong>админ</strong>, <strong>продавец</strong>, <strong>покупатель</strong>.
            </p>

            {loadingAdminUsers ? (
              <div className="mt-3 space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-12 animate-pulse rounded-xl bg-white/70 dark:bg-slate-800/80" />
                ))}
              </div>
            ) : (
              <div className="mt-3 space-y-2">
                {adminUsers.map((account) => {
                  const accountId = String(account?.id || "");
                  const draft = adminUserDrafts[accountId] || {
                    login: String(account?.login ?? account?.username ?? "").trim(),
                    email: String(account?.email ?? "").trim(),
                    password: String(account?.password ?? ""),
                  };
                  const isRootAdmin = account.username === "Goodog2013";
                  const roleUpdating = changingRoleUserId === account.id;
                  const credentialsSaving = savingAdminUserId === account.id;
                  const inputsDisabled = credentialsSaving || isRootAdmin;
                  const passwordForCopy = String(draft.password || account.password || "");

                  return (
                    <motion.div
                      key={account.id}
                      className="rounded-xl border border-slate-200/80 bg-white/85 px-3 py-2 dark:border-slate-700/70 dark:bg-slate-900/70"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{account.username}</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">Логин: {account.login || account.username}</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">Почта: {account.email || "-"}</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            Роль: {roleLabel(account.role)}
                          </p>
                        </div>

                        <select
                          value={account.role || "buyer"}
                          disabled={roleUpdating || isRootAdmin}
                          onChange={(event) => onChangeUserRole(account, event.target.value)}
                          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm outline-none ring-cyan-400 focus:ring disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900"
                        >
                          <option value="admin">Админ</option>
                          <option value="seller">Продавец</option>
                          <option value="buyer">Покупатель</option>
                        </select>
                      </div>

                      <div className="mt-2 grid gap-2 md:grid-cols-3">
                        <input
                          value={draft.login}
                          onChange={(event) => onAdminUserDraftChange(accountId, "login", event.target.value)}
                          disabled={inputsDisabled}
                          className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-cyan-400 focus:ring disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900"
                          placeholder="Логин"
                        />
                        <input
                          value={draft.email}
                          onChange={(event) => onAdminUserDraftChange(accountId, "email", event.target.value)}
                          disabled={inputsDisabled}
                          className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-cyan-400 focus:ring disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900"
                          placeholder="Почта"
                        />
                        <input
                          value={draft.password}
                          onChange={(event) => onAdminUserDraftChange(accountId, "password", event.target.value)}
                          disabled={inputsDisabled}
                          className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-cyan-400 focus:ring disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900"
                          placeholder="Пароль"
                        />
                      </div>

                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => onSaveAdminUserCredentials(account)}
                          disabled={inputsDisabled}
                          className="inline-flex items-center gap-1 rounded-xl bg-cyan-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-cyan-600 disabled:opacity-60"
                        >
                          <Save size={12} />
                          {credentialsSaving ? "Сохранение..." : "Сохранить данные"}
                        </button>

                        {passwordForCopy ? (
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard
                                .writeText(passwordForCopy)
                                .then(() => toast.success(`Пароль ${account.username} скопирован`))
                                .catch(() => toast.error("Не удалось скопировать пароль"));
                            }}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                          >
                            <Copy size={11} />
                            Копировать
                          </button>
                        ) : (
                          <span className="text-xs text-slate-500 dark:text-slate-400">Пароль неизвестен (появится после входа пользователя)</span>
                        )}

                        {isRootAdmin ? (
                          <span className="text-xs text-amber-600 dark:text-amber-300">Root admin защищен от изменения данных</span>
                        ) : null}
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}

            <div className="mt-5 rounded-2xl border border-slate-200/80 bg-white/80 p-4 dark:border-slate-700/70 dark:bg-slate-900/70">
              <div className="mb-3 flex items-center gap-2">
                <ShieldCheck className="text-rose-500 dark:text-rose-300" size={18} />
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">Блокировка доступа</h3>
              </div>

              <div className="grid gap-2 md:grid-cols-[130px_1fr_1fr_auto]">
                <select
                  value={banForm.mode}
                  onChange={(event) => setBanForm((prev) => ({ ...prev, mode: event.target.value === "ip" ? "ip" : "username" }))}
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-cyan-400 focus:ring dark:border-slate-700 dark:bg-slate-900"
                >
                  <option value="username">Ник</option>
                  <option value="ip">IP</option>
                </select>
                <input
                  value={banForm.value}
                  onChange={(event) => setBanForm((prev) => ({ ...prev, value: event.target.value }))}
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-cyan-400 focus:ring dark:border-slate-700 dark:bg-slate-900"
                  placeholder={banForm.mode === "ip" ? "Например 192.168.1.65" : "Ник пользователя"}
                />
                <input
                  value={banForm.reason}
                  onChange={(event) => setBanForm((prev) => ({ ...prev, reason: event.target.value.slice(0, 240) }))}
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-cyan-400 focus:ring dark:border-slate-700 dark:bg-slate-900"
                  placeholder="Причина (необязательно)"
                />
                <button
                  type="button"
                  onClick={onCreateBan}
                  disabled={creatingBan}
                  className="inline-flex items-center justify-center rounded-xl bg-rose-500 px-3 py-2 text-sm font-semibold text-white transition hover:bg-rose-600 disabled:opacity-70"
                >
                  {creatingBan ? "..." : "Забанить"}
                </button>
              </div>

              {loadingBans ? (
                <div className="mt-3 space-y-2">
                  {Array.from({ length: 2 }).map((_, index) => (
                    <div key={index} className="h-12 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
                  ))}
                </div>
              ) : bans.length ? (
                <div className="mt-3 space-y-2">
                  {bans.map((banItem) => (
                    <div
                      key={banItem.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200/80 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {banItem.targetType === "ip" ? "IP" : "Ник"}: {banItem.targetValue}
                        </p>
                        <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                          {banItem.reason ? `${banItem.reason} • ` : ""}
                          {relativeDate(banItem.createdAt)}
                        </p>
                      </div>

                      {banItem.active ? (
                        <button
                          type="button"
                          onClick={() => onUnban(banItem)}
                          disabled={removingBanId === banItem.id}
                          className="inline-flex items-center gap-1 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-600 disabled:opacity-70"
                        >
                          {removingBanId === banItem.id ? "..." : "Разбанить"}
                        </button>
                      ) : (
                        <span className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-500 dark:border-slate-700 dark:text-slate-300">
                          Снят
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">Блокировок пока нет.</p>
              )}
            </div>

            <div className="mt-5 rounded-2xl border border-slate-200/80 bg-white/80 p-4 dark:border-slate-700/70 dark:bg-slate-900/70">
              <div className="mb-3 flex items-center gap-2">
                <BadgePercent className="text-indigo-600 dark:text-indigo-300" size={18} />
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">Промокоды</h3>
              </div>

              <div className="grid gap-2 md:grid-cols-[1fr_minmax(0,1.3fr)_130px_auto_auto]">
                <input
                  value={promoForm.code}
                  onChange={(event) =>
                    setPromoForm((prev) => ({
                      ...prev,
                      code: event.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 32),
                    }))
                  }
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-cyan-400 focus:ring dark:border-slate-700 dark:bg-slate-900"
                  placeholder="Код, например SKIN20"
                />

                <button
                  type="button"
                  onClick={() => setPromoPickerOpen(true)}
                  className="flex min-w-0 flex-col rounded-xl border border-slate-300 bg-white px-3 py-2 text-left outline-none transition hover:border-cyan-400 hover:shadow-sm dark:border-slate-700 dark:bg-slate-900"
                >
                  <span className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {promoSelectedProducts.length
                      ? `Выбрано товаров: ${promoSelectedProducts.length}`
                      : loadingPromoCatalogProducts
                        ? "Загрузка товаров..."
                        : "Выбрать товары для промокода"}
                  </span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">Поиск и множественный выбор</span>
                </button>

                <input
                  type="number"
                  min={1}
                  max={100}
                  value={promoForm.percent}
                  onChange={(event) =>
                    setPromoForm((prev) => ({
                      ...prev,
                      percent: event.target.value.replace(/[^0-9]/g, "").slice(0, 3),
                    }))
                  }
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-cyan-400 focus:ring dark:border-slate-700 dark:bg-slate-900"
                  placeholder="%"
                />

                <select
                  value={promoForm.isActive ? "1" : "0"}
                  onChange={(event) => setPromoForm((prev) => ({ ...prev, isActive: event.target.value === "1" }))}
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-cyan-400 focus:ring dark:border-slate-700 dark:bg-slate-900"
                >
                  <option value="1">Активен</option>
                  <option value="0">Выключен</option>
                </select>

                <button
                  type="button"
                  onClick={onCreatePromoCode}
                  disabled={creatingPromoCode || !promoSelectedProductIds.length}
                  className="inline-flex items-center justify-center gap-1 rounded-xl bg-indigo-500 px-3 py-2 text-sm font-semibold text-white transition hover:bg-indigo-600 disabled:opacity-70"
                >
                  <PlusCircle size={14} />
                  {creatingPromoCode ? "..." : "Создать"}
                </button>
              </div>

              {promoSelectedProducts.length ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {promoSelectedProducts.slice(0, 6).map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => onTogglePromoProduct(item.id)}
                      className="inline-flex max-w-full items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700 transition hover:bg-indigo-100 dark:border-indigo-600/60 dark:bg-indigo-500/15 dark:text-indigo-200"
                    >
                      <span className="truncate">{item.title}</span>
                      <X size={12} />
                    </button>
                  ))}
                  {promoSelectedProducts.length > 6 ? (
                    <span className="inline-flex items-center rounded-full border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-600 dark:border-slate-700 dark:text-slate-300">
                      +{promoSelectedProducts.length - 6}
                    </span>
                  ) : null}
                </div>
              ) : null}

              {loadingPromoCodes ? (
                <div className="mt-3 space-y-2">
                  {Array.from({ length: 2 }).map((_, i) => (
                    <div key={i} className="h-12 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
                  ))}
                </div>
              ) : promoCodes.length ? (
                <div className="mt-3 space-y-2">
                  {promoCodes.map((promo) => {
                    const products = Array.isArray(promo.products) ? promo.products : [];
                    const preview = products.slice(0, 3);
                    const moreCount = Math.max(0, products.length - preview.length);

                    return (
                      <div
                        key={promo.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200/80 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                            {promo.code} • -{promo.percent}%
                          </p>
                          <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                            {preview.length
                              ? preview
                                  .map((item) => `${item.title || "Товар без названия"}${item?.sellerUsername ? ` • ${item.sellerUsername}` : ""}`)
                                  .join(", ")
                              : promo.productTitle || "Товар удален"}
                            {moreCount > 0 ? ` +${moreCount}` : ""}
                          </p>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => onTogglePromoCode(promo)}
                            disabled={updatingPromoCodeId === promo.id}
                            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                              promo.isActive
                                ? "bg-emerald-500 text-white hover:bg-emerald-600"
                                : "bg-slate-500 text-white hover:bg-slate-600"
                            } disabled:opacity-70`}
                          >
                            {updatingPromoCodeId === promo.id ? "..." : promo.isActive ? "Активен" : "Выключен"}
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeletePromoCode(promo)}
                            disabled={deletingPromoCodeId === promo.id}
                            className="inline-flex items-center gap-1 rounded-lg bg-rose-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-rose-600 disabled:opacity-70"
                          >
                            <Trash2 size={12} />
                            {deletingPromoCodeId === promo.id ? "..." : "Удалить"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">Промокоды еще не созданы.</p>
              )}
            </div>
          </motion.section>

          <AnimatePresence>
            {promoPickerOpen && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-sm"
                onClick={() => setPromoPickerOpen(false)}
              >
                <motion.div
                  initial={{ opacity: 0, y: 16, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 14, scale: 0.97 }}
                  transition={{ duration: 0.2 }}
                  onClick={(event) => event.stopPropagation()}
                  className="w-full max-w-2xl rounded-2xl border border-indigo-300/70 bg-white/95 p-4 shadow-2xl dark:border-indigo-600/50 dark:bg-slate-900/95"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">Выбор товаров для промокода</h3>
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        Отметьте один или несколько товаров. Сейчас выбрано: {promoSelectedProductIds.length}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setPromoPickerOpen(false)}
                      className="rounded-lg border border-slate-300 p-1.5 text-slate-500 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                    >
                      <X size={16} />
                    </button>
                  </div>

                  <div className="relative mt-3">
                    <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      value={promoPickerQuery}
                      onChange={(event) => setPromoPickerQuery(event.target.value)}
                      className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-9 pr-3 text-sm outline-none ring-cyan-400 focus:ring dark:border-slate-700 dark:bg-slate-950"
                      placeholder="Поиск по названию, продавцу или ID"
                    />
                  </div>

                  <div className="mt-2 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                    <span>Найдено: {promoFilteredProductOptions.length}</span>
                    <span>Выбрано: {promoSelectedProductIds.length}</span>
                  </div>

                  <div className="mt-3 max-h-[55vh] space-y-2 overflow-auto pr-1">
                    {loadingPromoCatalogProducts ? (
                      Array.from({ length: 6 }).map((_, index) => (
                        <div key={index} className="h-14 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
                      ))
                    ) : promoFilteredProductOptions.length ? (
                      promoFilteredProductOptions.map((item) => {
                        const selected = promoSelectedProductIds.includes(item.id);
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => onTogglePromoProduct(item.id)}
                            className={`flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left transition ${
                              selected
                                ? "border-indigo-300 bg-indigo-50 dark:border-indigo-500/60 dark:bg-indigo-500/15"
                                : "border-slate-200 bg-white hover:border-cyan-300 dark:border-slate-700 dark:bg-slate-900"
                            }`}
                          >
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{item.title}</p>
                              <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                                {item.seller ? `Продавец: ${item.seller}` : "Продавец не указан"}
                              </p>
                            </div>
                            <span
                              className={`inline-flex h-6 w-6 items-center justify-center rounded-full border transition ${
                                selected
                                  ? "border-indigo-500 bg-indigo-500 text-white"
                                  : "border-slate-300 text-transparent dark:border-slate-600"
                              }`}
                            >
                              <Check size={14} />
                            </span>
                          </button>
                        );
                      })
                    ) : (
                      <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
                        По вашему запросу ничего не найдено.
                      </div>
                    )}
                  </div>

                  <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => setPromoSelectedProductIds([])}
                      className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      Сбросить выбор
                    </button>
                    <button
                      type="button"
                      onClick={() => setPromoPickerOpen(false)}
                      className="inline-flex items-center gap-2 rounded-xl bg-indigo-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-600"
                    >
                      Применить
                      <span className="rounded-full bg-white/25 px-2 py-0.5 text-xs">{promoSelectedProductIds.length}</span>
                    </button>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}
    </AnimatedPage>
  );
}


