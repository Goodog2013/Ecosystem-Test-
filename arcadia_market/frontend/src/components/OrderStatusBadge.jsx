const statusClassMap = {
  PAID: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-200",
  PREPARING: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200",
  DELIVERED: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200",
};

const statusTextMap = {
  PAID: "Оплачен",
  PREPARING: "Готовится",
  DELIVERED: "Доставлен",
};

export default function OrderStatusBadge({ status }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
        statusClassMap[status] || "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200"
      }`}
    >
      {statusTextMap[status] || "Неизвестно"}
    </span>
  );
}