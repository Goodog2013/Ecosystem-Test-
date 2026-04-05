import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  Home,
  ShoppingCart,
  Heart,
  Sparkles,
  UserCircle2,
  Store,
  ChartNoAxesCombined,
  PlusSquare,
  Settings,
} from "lucide-react";
import { API_URL } from "../lib/api";
import { emitLiveUIEvent, LIVE_UI_EVENTS, onLiveUIEvent } from "../lib/liveEvents";
import { COOKIE_SESSION_TOKEN, useAuthStore } from "../store/authStore";
import { useCartStore } from "../store/cartStore";
import { useUiStore } from "../store/uiStore";
import { useWishlistStore } from "../store/wishlistStore";

const navClass = ({ isActive }) =>
  `rounded-xl px-3 py-2 text-sm font-medium transition ${
    isActive
      ? "bg-cyan-500 text-white shadow"
      : "text-slate-700 hover:bg-white/70 dark:text-slate-200 dark:hover:bg-slate-800/70"
  }`;

const ACCENT_PRESETS = ["#06b6d4", "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"];

const COPY = {
  ru: {
    appName: "МДМ",
    appSubtitle: "Торгуй. Собирай. Прокачивайся.",
    home: "Главная",
    catalog: "Каталог",
    sell: "Продать",
    orders: "Заказы",
    wishlist: "Вишлист",
    profile: "Профиль",
    signIn: "Войти",
    logOut: "Выйти",
    settings: "Настройки",
    theme: "Тема",
    language: "Язык",
    themeDark: "Тёмная",
    themeLight: "Светлая",
    languageRu: "Русский",
    languageEn: "Английский",
    roleAdmin: "Админ",
    roleSeller: "Продавец",
    roleBuyer: "Покупатель",
  },
  en: {
    appName: "MDM",
    appSubtitle: "Trade. Collect. Level up.",
    home: "Home",
    catalog: "Catalog",
    sell: "Sell",
    orders: "Orders",
    wishlist: "Wishlist",
    profile: "Profile",
    signIn: "Sign in",
    logOut: "Log out",
    settings: "Settings",
    theme: "Theme",
    language: "Language",
    themeDark: "Dark",
    themeLight: "Light",
    languageRu: "Русский",
    languageEn: "English",
    roleAdmin: "Admin",
    roleSeller: "Seller",
    roleBuyer: "Buyer",
  },
};

function roleLabel(role, t) {
  if (role === "admin") return t.roleAdmin;
  if (role === "seller") return t.roleSeller;
  return t.roleBuyer;
}

function safeJsonParse(raw) {
  try {
    return JSON.parse(raw || "{}");
  } catch {
    return {};
  }
}

function hexToRgb(hex) {
  const raw = String(hex || "")
    .trim()
    .replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(raw)) {
    return null;
  }
  const num = Number.parseInt(raw, 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

function rgbToHex(r, g, b) {
  const to = (value) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}

function mixHex(hex, target, weight) {
  const rgb = hexToRgb(hex);
  if (!rgb) {
    return "#06b6d4";
  }
  const w = Math.max(0, Math.min(1, Number(weight) || 0));
  return rgbToHex(rgb.r + (target.r - rgb.r) * w, rgb.g + (target.g - rgb.g) * w, rgb.b + (target.b - rgb.b) * w);
}

function buildAccentPalette(accentHex) {
  const white = { r: 255, g: 255, b: 255 };
  const black = { r: 0, g: 0, b: 0 };
  return {
    "--color-cyan-50": mixHex(accentHex, white, 0.92),
    "--color-cyan-100": mixHex(accentHex, white, 0.82),
    "--color-cyan-200": mixHex(accentHex, white, 0.68),
    "--color-cyan-300": mixHex(accentHex, white, 0.48),
    "--color-cyan-400": mixHex(accentHex, white, 0.24),
    "--color-cyan-500": accentHex,
    "--color-cyan-600": mixHex(accentHex, black, 0.12),
    "--color-cyan-700": mixHex(accentHex, black, 0.24),
    "--color-cyan-800": mixHex(accentHex, black, 0.36),
    "--color-cyan-900": mixHex(accentHex, black, 0.5),
  };
}

export default function Layout() {
  const navigate = useNavigate();
  const { user, token, logout, refreshMe } = useAuthStore();
  const { items, fetchCart, reset } = useCartStore();
  const wishlistIds = useWishlistStore((state) => state.ids);
  const fetchWishlistIds = useWishlistStore((state) => state.fetchWishlistIds);
  const resetWishlist = useWishlistStore((state) => state.reset);
  const theme = useUiStore((state) => state.theme);
  const language = useUiStore((state) => state.language);
  const sfxEnabled = useUiStore((state) => state.sfxEnabled);
  const sfxVolume = useUiStore((state) => state.sfxVolume);
  const accent = useUiStore((state) => state.accent);
  const setTheme = useUiStore((state) => state.setTheme);
  const setLanguage = useUiStore((state) => state.setLanguage);
  const setSfxEnabled = useUiStore((state) => state.setSfxEnabled);
  const setSfxVolume = useUiStore((state) => state.setSfxVolume);
  const setAccent = useUiStore((state) => state.setAccent);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsRef = useRef(null);
  const MotionDiv = motion.div;
  const t = useMemo(() => COPY[language] || COPY.ru, [language]);
  const soundLabel = language === "en" ? "Sound" : "Звук";
  const soundOnLabel = language === "en" ? "On" : "Вкл";
  const soundOffLabel = language === "en" ? "Off" : "Выкл";
  const volumeLabel = language === "en" ? "Volume" : "Громкость";
  const canSell = !user || ((user.role === "admin" || user.role === "seller") && Boolean(user.bank?.linked));
  const accentLabel = language === "en" ? "Accent" : "Акцент";

  useEffect(() => {
    const isDark = theme === "dark";
    document.documentElement.classList.toggle("dark", isDark);
  }, [theme]);

  useEffect(() => {
    document.documentElement.lang = language === "en" ? "en" : "ru";
  }, [language]);

  useEffect(() => {
    const root = document.documentElement;
    const palette = buildAccentPalette(accent);
    for (const [name, value] of Object.entries(palette)) {
      root.style.setProperty(name, value);
    }
    const rgb = hexToRgb(accent);
    if (rgb) {
      root.style.setProperty("--mdm-accent", accent);
      root.style.setProperty("--mdm-accent-rgb", `${rgb.r} ${rgb.g} ${rgb.b}`);
    }
  }, [accent]);

  useEffect(() => {
    if (!settingsOpen) {
      return undefined;
    }

    const onClickOutside = (event) => {
      if (!settingsRef.current || settingsRef.current.contains(event.target)) {
        return;
      }
      setSettingsOpen(false);
    };

    const onEscape = (event) => {
      if (event.key === "Escape") {
        setSettingsOpen(false);
      }
    };

    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onEscape);

    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onEscape);
    };
  }, [settingsOpen]);

  useEffect(() => {
    if (user) {
      fetchCart();
      fetchWishlistIds();
    } else {
      reset();
      resetWishlist();
    }
  }, [user, fetchCart, reset, fetchWishlistIds, resetWishlist]);

  useEffect(() => {
    if (!user) {
      return undefined;
    }

    const stopCart = onLiveUIEvent(LIVE_UI_EVENTS.CART_CHANGED, () => {
      fetchCart();
    });
    const stopBalance = onLiveUIEvent(LIVE_UI_EVENTS.BALANCE_CHANGED, () => {
      refreshMe();
    });
    const stopProfile = onLiveUIEvent(LIVE_UI_EVENTS.PROFILE_CHANGED, () => {
      refreshMe();
    });
    const stopWishlist = onLiveUIEvent(LIVE_UI_EVENTS.WISHLIST_CHANGED, () => {
      fetchWishlistIds();
    });

    return () => {
      stopCart();
      stopBalance();
      stopProfile();
      stopWishlist();
    };
  }, [user, fetchCart, refreshMe, fetchWishlistIds]);

  useEffect(() => {
    if (typeof EventSource === "undefined") {
      return undefined;
    }

    const streamToken = token && token !== COOKIE_SESSION_TOKEN ? token : "";
    const streamUrl = streamToken ? `${API_URL}/live?token=${encodeURIComponent(streamToken)}` : `${API_URL}/live`;
    const stream = new EventSource(streamUrl);

    const bind = (serverEvent, uiEvent) => {
      stream.addEventListener(serverEvent, (event) => {
        emitLiveUIEvent(uiEvent, safeJsonParse(event.data));
      });
    };

    bind("catalog_changed", LIVE_UI_EVENTS.CATALOG_CHANGED);
    bind("cart_changed", LIVE_UI_EVENTS.CART_CHANGED);
    bind("orders_changed", LIVE_UI_EVENTS.ORDERS_CHANGED);
    bind("profile_changed", LIVE_UI_EVENTS.PROFILE_CHANGED);
    bind("balance_changed", LIVE_UI_EVENTS.BALANCE_CHANGED);
    bind("wishlist_changed", LIVE_UI_EVENTS.WISHLIST_CHANGED);
    bind("reviews_changed", LIVE_UI_EVENTS.REVIEWS_CHANGED);
    bind("chats_changed", LIVE_UI_EVENTS.CHATS_CHANGED);
    bind("chat_typing", LIVE_UI_EVENTS.CHAT_TYPING);
    bind("presence_changed", LIVE_UI_EVENTS.PRESENCE_CHANGED);

    return () => {
      stream.close();
    };
  }, [token]);

  const cartCount = useMemo(() => items.reduce((sum, item) => sum + Number(item.quantity || 0), 0), [items]);
  const wishlistCount = useMemo(() => (wishlistIds || []).length, [wishlistIds]);
  const avatarSrc = user?.avatar || `https://api.dicebear.com/9.x/shapes/svg?seed=${encodeURIComponent(user?.username || "MDM")}`;

  const onLogout = () => {
    logout();
    reset();
    navigate("/");
  };

  return (
    <div className="flex min-h-[100dvh] flex-col overflow-x-hidden text-slate-900 transition-colors dark:text-slate-100">
      <header className="sticky top-0 z-30 border-b border-white/30 bg-white/75 backdrop-blur dark:border-slate-800/70 dark:bg-slate-950/70">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3 px-4 py-3">
          <Link to="/" className="inline-flex items-center gap-2">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-cyan-500 to-indigo-500 text-white shadow-lg">
              <Sparkles size={19} />
            </span>
            <div>
              <p className="text-base font-bold tracking-wide">{t.appName}</p>
              <p className="text-xs text-slate-600 dark:text-slate-400">{t.appSubtitle}</p>
            </div>
          </Link>

          <nav className="hidden items-center gap-2 md:flex">
            <NavLink to="/" className={navClass} end>
              {t.home}
            </NavLink>
            <NavLink to="/catalog" className={navClass}>
              {t.catalog}
            </NavLink>
            {canSell && (
              <NavLink to="/sell" className={navClass}>
                {t.sell}
              </NavLink>
            )}
            <NavLink to="/orders" className={navClass}>
              {t.orders}
            </NavLink>
          </nav>

          <div className="flex items-center gap-2">
            <div className="relative" ref={settingsRef}>
              <button
                type="button"
                onClick={() => setSettingsOpen((prev) => !prev)}
                className="rounded-xl border border-slate-200 bg-white p-2 text-slate-700 transition hover:-translate-y-0.5 hover:shadow dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                aria-label={t.settings}
                aria-expanded={settingsOpen}
              >
                <Settings size={18} />
              </button>

              <AnimatePresence>
                {settingsOpen && (
                  <MotionDiv
                    initial={{ opacity: 0, y: 8, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 8, scale: 0.98 }}
                    transition={{ duration: 0.18 }}
                    className="absolute right-0 top-12 z-40 w-64 rounded-2xl border border-slate-200/90 bg-white/95 p-3 shadow-xl dark:border-slate-700/80 dark:bg-slate-900/95"
                  >
                    <p className="text-sm font-bold text-slate-900 dark:text-slate-100">{t.settings}</p>

                    <label className="mt-3 block">
                      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        {t.theme}
                      </span>
                      <select
                        value={theme}
                        onChange={(event) => setTheme(event.target.value)}
                        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-cyan-400 focus:ring dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                      >
                        <option value="dark">{t.themeDark}</option>
                        <option value="light">{t.themeLight}</option>
                      </select>
                    </label>

                    <label className="mt-3 block">
                      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        {t.language}
                      </span>
                      <select
                        value={language}
                        onChange={(event) => setLanguage(event.target.value)}
                        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-cyan-400 focus:ring dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                      >
                        <option value="ru">{t.languageRu}</option>
                        <option value="en">{t.languageEn}</option>
                      </select>
                    </label>

                    <label className="mt-3 block">
                      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        {accentLabel}
                      </span>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={accent}
                          onChange={(event) => setAccent(event.target.value)}
                          className="h-10 w-12 cursor-pointer rounded-xl border border-slate-300 bg-white p-1 dark:border-slate-700 dark:bg-slate-900"
                          aria-label={accentLabel}
                        />
                        <input
                          type="text"
                          value={accent}
                          readOnly
                          className="min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm lowercase text-slate-900 outline-none ring-cyan-400 focus:ring dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                        />
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {ACCENT_PRESETS.map((value) => (
                          <button
                            key={value}
                            type="button"
                            onClick={() => setAccent(value)}
                            className={`h-6 w-6 rounded-full border transition ${
                              value === accent ? "border-slate-900 dark:border-white" : "border-slate-300 dark:border-slate-700"
                            }`}
                            style={{ backgroundColor: value }}
                            aria-label={`${accentLabel} ${value}`}
                            title={value}
                          />
                        ))}
                      </div>
                    </label>

                    <label className="mt-3 block">
                      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        {soundLabel}
                      </span>
                      <select
                        value={sfxEnabled ? "on" : "off"}
                        onChange={(event) => setSfxEnabled(event.target.value === "on")}
                        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-cyan-400 focus:ring dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                      >
                        <option value="on">{soundOnLabel}</option>
                        <option value="off">{soundOffLabel}</option>
                      </select>
                    </label>

                    <label className={`mt-3 block ${sfxEnabled ? "" : "opacity-60"}`}>
                      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        {volumeLabel}: {Math.round((sfxVolume || 0) * 100)}%
                      </span>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={sfxVolume}
                        onChange={(event) => setSfxVolume(Number(event.target.value))}
                        disabled={!sfxEnabled}
                        className="w-full accent-cyan-500 disabled:cursor-not-allowed"
                      />
                    </label>
                  </MotionDiv>
                )}
              </AnimatePresence>
            </div>

            {user && (
              <Link
                to="/wishlist"
                className="relative rounded-xl border border-slate-200 bg-white p-2 text-slate-700 transition hover:-translate-y-0.5 hover:shadow dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                aria-label={t.wishlist}
              >
                <Heart size={18} />
                {wishlistCount > 0 && (
                  <span className="absolute -right-1 -top-1 rounded-full bg-rose-500 px-1.5 py-0.5 text-xs font-bold text-white">
                    {wishlistCount}
                  </span>
                )}
              </Link>
            )}

            <Link
              to="/cart"
              className="relative rounded-xl border border-slate-200 bg-white p-2 text-slate-700 transition hover:-translate-y-0.5 hover:shadow dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            >
              <ShoppingCart size={18} />
              {cartCount > 0 && (
                <span className="absolute -right-1 -top-1 rounded-full bg-cyan-500 px-1.5 py-0.5 text-xs font-bold text-white">
                  {cartCount}
                </span>
              )}
            </Link>

            {user ? (
              <div className="flex items-center gap-2">
                <Link
                  to="/profile"
                  className="hidden items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:-translate-y-0.5 hover:shadow dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 sm:inline-flex"
                >
                  <img
                    src={avatarSrc}
                    alt={user.username || "Аватар"}
                    className="h-6 w-6 rounded-full border border-slate-300 object-cover dark:border-slate-600"
                  />
                  <span>{user.username}</span>
                  <span className="rounded-full bg-cyan-500/15 px-2 py-0.5 text-xs font-semibold text-cyan-700 dark:text-cyan-300">
                    {roleLabel(user.role, t)}
                  </span>
                </Link>
                <button
                  type="button"
                  onClick={onLogout}
                  className="rounded-xl bg-rose-500 px-3 py-2 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-rose-600"
                >
                  {t.logOut}
                </button>
              </div>
            ) : (
              <Link
                to="/auth"
                className="inline-flex items-center gap-2 rounded-xl bg-cyan-500 px-3 py-2 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-cyan-600"
              >
                <Store size={16} />
                {t.signIn}
              </Link>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 pb-24 md:pb-6">
        <Outlet />
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200/80 bg-white/90 backdrop-blur md:hidden dark:border-slate-700/70 dark:bg-slate-900/90">
        <div
          className={`mx-auto grid w-full max-w-7xl ${
            canSell ? (user ? "grid-cols-6" : "grid-cols-5") : user ? "grid-cols-5" : "grid-cols-4"
          } px-2 py-2`}
        >
          {[
            { to: "/", icon: Home, label: t.home },
            { to: "/catalog", icon: ChartNoAxesCombined, label: t.catalog },
            ...(canSell ? [{ to: "/sell", icon: PlusSquare, label: t.sell }] : []),
            { to: "/orders", icon: Store, label: t.orders },
            ...(user ? [{ to: "/wishlist", icon: Heart, label: t.wishlist }] : []),
            { to: user ? "/profile" : "/auth", icon: UserCircle2, label: user ? t.profile : t.signIn },
          ].map((item) => (
            <NavLink
              key={item.to + item.label}
              to={item.to}
              className={({ isActive }) =>
                `flex flex-col items-center gap-1 rounded-lg px-1 py-1 text-[11px] font-medium transition ${
                  isActive
                    ? "bg-cyan-500 text-white"
                    : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                }`
              }
            >
              <item.icon size={16} />
              {item.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
