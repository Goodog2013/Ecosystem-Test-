import { useState } from "react";
import { motion } from "framer-motion";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Heart, Images, PackageCheck } from "lucide-react";
import toast from "react-hot-toast";
import { formatCoins, shorten } from "../lib/format";
import { getCategoryLabel, getConditionLabel, getRarityLabel } from "../constants/marketOptions";
import CurrencyIcon from "./CurrencyIcon";
import { useAuthStore } from "../store/authStore";
import { useWishlistStore } from "../store/wishlistStore";

const rarityClass = {
  Common: "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200",
  Rare: "bg-blue-100 text-blue-700 dark:bg-blue-900/60 dark:text-blue-200",
  Epic: "bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900/60 dark:text-fuchsia-200",
  Legendary: "bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-200",
};

export default function ProductCard({ product }) {
  const MotionArticle = motion.article;
  const navigate = useNavigate();
  const location = useLocation();
  const user = useAuthStore((state) => state.user);
  const wishlistIds = useWishlistStore((state) => state.ids);
  const toggleWishlist = useWishlistStore((state) => state.toggleWishlist);
  const [togglingWishlist, setTogglingWishlist] = useState(false);

  const wished = (wishlistIds || []).includes(product.id);
  const imageCount = Array.isArray(product.images) ? product.images.length : product.image ? 1 : 0;

  const onToggleWishlist = async (event) => {
    event.preventDefault();
    event.stopPropagation();

    if (!user) {
      navigate("/auth", { state: { from: location.pathname } });
      return;
    }
    try {
      setTogglingWishlist(true);
      const nowWished = await toggleWishlist(product.id);
      toast.success(nowWished ? "Добавлено в вишлист" : "Удалено из вишлиста");
    } catch (err) {
      toast.error(err.message || "Не удалось обновить вишлист");
    } finally {
      setTogglingWishlist(false);
    }
  };

  return (
    <MotionArticle
      whileHover={{ y: -4 }}
      transition={{ type: "spring", stiffness: 260, damping: 22 }}
      className="group overflow-hidden rounded-2xl border border-slate-200/80 bg-white/80 backdrop-blur dark:border-slate-700/80 dark:bg-slate-900/80"
    >
      <div className="relative">
        <Link to={`/product/${product.id}`} className="block">
          <img
            src={product.image}
            alt={product.title}
            className="h-44 w-full object-cover transition duration-500 group-hover:scale-[1.04]"
            loading="lazy"
          />
        </Link>

        <button
          type="button"
          onClick={onToggleWishlist}
          disabled={togglingWishlist}
          className={`absolute left-3 top-3 rounded-full border px-2 py-1 text-xs font-semibold backdrop-blur transition ${
            wished
              ? "border-rose-200 bg-rose-500 text-white hover:bg-rose-600 dark:border-rose-700"
              : "border-slate-200 bg-white/85 text-slate-700 hover:bg-white dark:border-slate-700 dark:bg-slate-900/85 dark:text-slate-200"
          }`}
          aria-label={wished ? "Убрать из вишлиста" : "Добавить в вишлист"}
        >
          <Heart size={14} className={wished ? "fill-current" : ""} />
        </button>

        <div className="absolute bottom-3 left-3 rounded-full bg-black/55 px-2 py-1 text-xs font-semibold text-white">
          {getCategoryLabel(product.category)}
        </div>

        <div
          className={`absolute right-3 top-3 rounded-full px-2 py-1 text-xs font-semibold ${
            rarityClass[product.rarity] || rarityClass.Common
          }`}
        >
          {getRarityLabel(product.rarity)}
        </div>

        {imageCount > 1 ? (
          <div className="absolute bottom-3 right-3 inline-flex items-center gap-1 rounded-full bg-slate-900/70 px-2 py-1 text-xs font-semibold text-white">
            <Images size={12} />
            {imageCount}
          </div>
        ) : null}
      </div>

      <div className="space-y-3 p-4">
        <Link to={`/product/${product.id}`} className="block">
          <h3 className="line-clamp-1 text-base font-semibold text-slate-900 dark:text-slate-100">{product.title}</h3>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{shorten(product.description, 92)}</p>
        </Link>

        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-300">
          <span className="inline-flex items-center gap-1">
            <PackageCheck size={14} />
            {getConditionLabel(product.condition)}
          </span>
          <span>Остаток: {product.stock}</span>
        </div>

        <div className="flex items-center justify-between">
          <p className="inline-flex items-center gap-1 text-lg font-bold text-cyan-700 dark:text-cyan-300">
            <CurrencyIcon size={16} />
            {formatCoins(product.price)}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">продавец: {product.seller?.username}</p>
        </div>
      </div>
    </MotionArticle>
  );
}
