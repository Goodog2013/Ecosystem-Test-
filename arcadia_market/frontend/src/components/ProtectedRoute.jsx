import { Navigate, useLocation } from "react-router-dom";
import { useAuthStore } from "../store/authStore";

export default function ProtectedRoute({ children }) {
  const { user, bootstrapped } = useAuthStore();
  const location = useLocation();

  if (!bootstrapped) {
    return (
      <div className="mx-auto mt-20 w-full max-w-md rounded-2xl border border-slate-200 bg-white/80 p-8 text-center dark:border-slate-700 dark:bg-slate-900/80">
        Загрузка профиля...
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace state={{ from: location.pathname }} />;
  }

  return children;
}
