import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useLocation, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { useAuthStore } from "../store/authStore";
import AnimatedPage from "../components/AnimatedPage";

export default function AuthPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from || "/catalog";

  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ username: "", login: "", email: "", password: "" });
  const [submitting, setSubmitting] = useState(false);

  const { user, login, signup } = useAuthStore();

  useEffect(() => {
    if (user) {
      navigate(from, { replace: true });
    }
  }, [user, from, navigate]);

  const onSubmit = async (event) => {
    event.preventDefault();

    try {
      setSubmitting(true);
      if (mode === "login") {
        await login(form.login, form.password);
        toast.success("Вход выполнен");
      } else {
        await signup(form.username, form.email, form.password);
        toast.success("Аккаунт создан (роль: покупатель)");
      }
      navigate(from, { replace: true });
    } catch (err) {
      toast.error(err.message || "Ошибка авторизации");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AnimatedPage>
      <div className="mx-auto max-w-md rounded-3xl border border-slate-200/80 bg-white/80 p-6 shadow-xl backdrop-blur dark:border-slate-700/80 dark:bg-slate-900/80">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
          {mode === "login" ? "Вход в МДМ" : "Регистрация"}
        </h1>

        <div className="relative mt-4 grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
          <motion.div
            layout
            transition={{ type: "spring", stiffness: 420, damping: 30 }}
            className={`absolute top-1 bottom-1 w-[calc(50%-0.25rem)] rounded-lg bg-white shadow dark:bg-slate-700 ${
              mode === "login" ? "left-1" : "left-[calc(50%+0.25rem)]"
            }`}
          />
          <button
            type="button"
            className={`relative z-10 rounded-lg py-2 text-sm font-semibold transition ${
              mode === "login" ? "text-slate-900 dark:text-white" : "text-slate-500"
            }`}
            onClick={() => setMode("login")}
          >
            Вход
          </button>
          <button
            type="button"
            className={`relative z-10 rounded-lg py-2 text-sm font-semibold transition ${
              mode === "signup" ? "text-slate-900 dark:text-white" : "text-slate-500"
            }`}
            onClick={() => setMode("signup")}
          >
            Регистрация
          </button>
        </div>

        <form className="mt-5 space-y-3" onSubmit={onSubmit}>
          {mode === "signup" && (
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">Логин</span>
              <input
                value={form.username}
                onChange={(event) => setForm((prev) => ({ ...prev, username: event.target.value }))}
                required
                minLength={3}
                maxLength={20}
                pattern="[A-Za-z0-9_]{3,20}"
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-cyan-400 transition focus:ring dark:border-slate-700 dark:bg-slate-900"
                placeholder="Игрок_01"
              />
            </label>
          )}

          {mode === "login" ? (
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">Логин или эл. почта</span>
              <input
                value={form.login}
                onChange={(event) => setForm((prev) => ({ ...prev, login: event.target.value }))}
                required
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-cyan-400 transition focus:ring dark:border-slate-700 dark:bg-slate-900"
                placeholder="Логин"
              />
            </label>
          ) : (
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">Эл. почта</span>
              <input
                type="email"
                value={form.email}
                onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
                required
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-cyan-400 transition focus:ring dark:border-slate-700 dark:bg-slate-900"
                placeholder="почта@пример.рф"
              />
            </label>
          )}

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">Пароль</span>
            <input
              type="password"
              value={form.password}
              onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
              required
              minLength={6}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-cyan-400 transition focus:ring dark:border-slate-700 dark:bg-slate-900"
              placeholder="Минимум 6 символов"
            />
          </label>

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-xl bg-cyan-500 py-2.5 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-cyan-600 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {submitting ? "Подождите..." : mode === "login" ? "Войти" : "Создать аккаунт"}
          </button>
        </form>
      </div>
    </AnimatedPage>
  );
}
