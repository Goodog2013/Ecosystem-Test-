import { Box, Sparkles } from "lucide-react";

export default function EmptyState({ title, description, action }) {
  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-900/70 p-8 text-center">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-400 to-indigo-500 text-white">
        <Sparkles size={22} />
      </div>
      <h3 className="text-xl font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{description}</p>
      {action ? <div className="mt-6">{action}</div> : <Box className="mx-auto mt-4 text-slate-400" />}
    </div>
  );
}
