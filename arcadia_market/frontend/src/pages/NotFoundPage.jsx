import { Link } from "react-router-dom";
import AnimatedPage from "../components/AnimatedPage";

export default function NotFoundPage() {
  return (
    <AnimatedPage>
      <div className="grid min-h-[55vh] place-items-center">
        <div className="w-full max-w-xl rounded-3xl border border-slate-200/80 bg-white/85 p-8 text-center shadow-sm dark:border-slate-700/70 dark:bg-slate-900/75">
          <p className="text-sm font-semibold uppercase tracking-widest text-cyan-500">404</p>
          <h1 className="mt-2 text-3xl font-black text-slate-900 dark:text-slate-100">Страница не найдена</h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            Страница, которую вы открыли, не существует или была перемещена.
          </p>
          <Link
            to="/"
            className="mt-5 inline-flex rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-cyan-600"
          >
            Вернуться на главную
          </Link>
        </div>
      </div>
    </AnimatedPage>
  );
}
