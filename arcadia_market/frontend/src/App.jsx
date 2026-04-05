import { useEffect, useState } from "react";
import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import toast, { Toaster } from "react-hot-toast";
import Layout from "./components/Layout";
import ProtectedRoute from "./components/ProtectedRoute";
import HomePage from "./pages/HomePage";
import CatalogPage from "./pages/CatalogPage";
import ProductDetailsPage from "./pages/ProductDetailsPage";
import CartPage from "./pages/CartPage";
import SellPage from "./pages/SellPage";
import ProfilePage from "./pages/ProfilePage";
import OrdersPage from "./pages/OrdersPage";
import WishlistPage from "./pages/WishlistPage";
import ChatsPage from "./pages/ChatsPage";
import AuthPage from "./pages/AuthPage";
import NotFoundPage from "./pages/NotFoundPage";
import { useAuthStore } from "./store/authStore";
import { useUiStore } from "./store/uiStore";
import { configureSfx, installGlobalClickSfx, playSfx, primeSfxOnInteraction } from "./lib/sfx";
import { API_BANNED_EVENT } from "./lib/api";

function SoundBootstrap() {
  const sfxEnabled = useUiStore((state) => state.sfxEnabled);
  const sfxVolume = useUiStore((state) => state.sfxVolume);

  useEffect(() => {
    configureSfx({ enabled: sfxEnabled, volume: sfxVolume });
  }, [sfxEnabled, sfxVolume]);

  useEffect(() => {
    const stopClickSfx = installGlobalClickSfx();
    const stopPrime = primeSfxOnInteraction();

    return () => {
      stopClickSfx();
      stopPrime();
    };
  }, []);

  useEffect(() => {
    const originalSuccess = toast.success.bind(toast);
    const originalError = toast.error.bind(toast);
    const originalLoading = toast.loading ? toast.loading.bind(toast) : null;

    toast.success = (...args) => {
      playSfx("success");
      return originalSuccess(...args);
    };

    toast.error = (...args) => {
      playSfx("error");
      return originalError(...args);
    };

    if (originalLoading) {
      toast.loading = (...args) => {
        playSfx("notify");
        return originalLoading(...args);
      };
    }

    return () => {
      toast.success = originalSuccess;
      toast.error = originalError;
      if (originalLoading) {
        toast.loading = originalLoading;
      }
    };
  }, []);

  return null;
}

function AppBootstrap() {
  const { hydrate, bootstrapped } = useAuthStore();

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  if (!bootstrapped) {
    return (
      <div className="grid min-h-screen place-items-center bg-slate-950 text-slate-100">
        <div className="w-full max-w-sm rounded-3xl border border-slate-700/80 bg-slate-900/85 p-8 text-center shadow-2xl">
          <p className="text-lg font-semibold">МДМ</p>
          <p className="mt-2 text-sm text-slate-300">Синхронизация профиля и состояния маркета...</p>
        </div>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="catalog" element={<CatalogPage />} />
        <Route path="product/:id" element={<ProductDetailsPage />} />
        <Route path="auth" element={<AuthPage />} />
        <Route
          path="cart"
          element={
            <ProtectedRoute>
              <CartPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="sell"
          element={
            <ProtectedRoute>
              <SellPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="profile"
          element={
            <ProtectedRoute>
              <ProfilePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="orders"
          element={
            <ProtectedRoute>
              <OrdersPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="chats"
          element={
            <ProtectedRoute>
              <ChatsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="wishlist"
          element={
            <ProtectedRoute>
              <WishlistPage />
            </ProtectedRoute>
          }
        />
        <Route path="404" element={<NotFoundPage />} />
        <Route path="*" element={<Navigate to="/404" replace />} />
      </Route>
    </Routes>
  );
}

function BannedScreen({ detail, onRetry, onLogout }) {
  const reason = String(detail?.ban?.reason || detail?.reason || "").trim();
  return (
    <div className="grid min-h-screen place-items-center bg-slate-950 px-4 text-slate-100">
      <div className="w-full max-w-lg rounded-3xl border border-rose-500/40 bg-slate-900/90 p-8 shadow-2xl">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-rose-300">Access blocked</p>
        <h1 className="mt-2 text-3xl font-black text-rose-200">Вы забанены</h1>
        <p className="mt-3 text-sm text-slate-300">{detail?.message || "Доступ к МДМ ограничен администратором."}</p>
        {reason ? (
          <p className="mt-2 rounded-xl border border-rose-400/40 bg-rose-900/20 px-3 py-2 text-sm text-rose-100">Причина: {reason}</p>
        ) : null}
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onRetry}
            className="rounded-xl bg-rose-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-600"
          >
            Проверить снова
          </button>
          <button
            type="button"
            onClick={onLogout}
            className="rounded-xl border border-slate-600 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:bg-slate-800"
          >
            Выйти
          </button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [banDetail, setBanDetail] = useState(null);
  const logout = useAuthStore((state) => state.logout);

  useEffect(() => {
    const handler = (event) => {
      setBanDetail(event?.detail || { message: "Вы забанены", code: "BANNED" });
    };
    window.addEventListener(API_BANNED_EVENT, handler);
    return () => window.removeEventListener(API_BANNED_EVENT, handler);
  }, []);

  return (
    <HashRouter>
      <SoundBootstrap />
      <Toaster
        position="bottom-right"
        toastOptions={{
          duration: 2800,
          style: {
            background: "#0f172a",
            color: "#e2e8f0",
            border: "1px solid rgba(148,163,184,0.25)",
          },
        }}
      />
      {banDetail ? (
        <BannedScreen
          detail={banDetail}
          onRetry={() => {
            setBanDetail(null);
            window.location.reload();
          }}
          onLogout={() => {
            logout();
            setBanDetail(null);
            window.location.hash = "#/auth";
          }}
        />
      ) : (
        <AppBootstrap />
      )}
    </HashRouter>
  );
}
