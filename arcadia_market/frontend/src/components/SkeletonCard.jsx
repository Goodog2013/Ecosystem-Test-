export default function SkeletonCard() {
  return (
    <div className="animate-pulse rounded-2xl border border-slate-200/70 dark:border-slate-700/70 bg-white/70 dark:bg-slate-900/70 p-3">
      <div className="h-40 rounded-xl bg-slate-200 dark:bg-slate-700" />
      <div className="mt-3 h-4 w-3/4 rounded bg-slate-200 dark:bg-slate-700" />
      <div className="mt-2 h-3 w-full rounded bg-slate-200 dark:bg-slate-700" />
      <div className="mt-2 h-3 w-2/3 rounded bg-slate-200 dark:bg-slate-700" />
      <div className="mt-4 h-10 rounded-xl bg-slate-200 dark:bg-slate-700" />
    </div>
  );
}
