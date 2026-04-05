import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Gem, Rocket, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { LIVE_UI_EVENTS, onLiveUIEvent } from "../lib/liveEvents";
import ProductCard from "../components/ProductCard";
import SkeletonCard from "../components/SkeletonCard";
import AnimatedPage from "../components/AnimatedPage";
import { useUiStore } from "../store/uiStore";
import CurrencyIcon from "../components/CurrencyIcon";

const COPY = {
  ru: {
    heroBadge: "Игровой маркетплейс сообщества",
    heroTitle: "Торгуй цифровым лутом в живой рыночной экономике.",
    heroDescription:
      "МДМ — это игровой маркетплейс: выставляй товары, управляй предложением и увеличивай баланс во внутриигровой валюте.",
    cardOneTitle: "Игровая экономика",
    cardOneText: "Каждая покупка переносит баланс между игроками с полной историей операций.",
    cardTwoTitle: "Безопасные правила",
    cardTwoText: "Проверка остатков, владельца и запрет покупки собственного товара.",
    cardThreeTitle: "Быстрый цикл торговли",
    cardThreeText: "Выставляй, продавай, пополняй склад и оптимизируй редкость.",
    freshListings: "Новые лоты",
    viewAll: "Смотреть все",
  },
  en: {
    heroBadge: "Community-driven game marketplace",
    heroTitle: "Trade digital loot in a living market economy.",
    heroDescription:
      "MDM is a playable marketplace: list items, negotiate supply, and grow your balance using in-game currency only.",
    cardOneTitle: "In-game economy",
    cardOneText: "Every purchase moves balance between players with transaction logs.",
    cardTwoTitle: "Safe trading rules",
    cardTwoText: "Stock checks, ownership checks, and no self-purchases.",
    cardThreeTitle: "Fast market loop",
    cardThreeText: "List, sell, restock, and optimize for rarity and demand.",
    freshListings: "Fresh listings",
    viewAll: "View all",
  },
};

export default function HomePage() {
  const [loading, setLoading] = useState(true);
  const [featured, setFeatured] = useState([]);
  const MotionDiv = motion.div;
  const language = useUiStore((state) => state.language);
  const t = useMemo(() => COPY[language] || COPY.ru, [language]);
  const spotlight = useMemo(() => featured.slice(0, 2), [featured]);

  const loadFeatured = useCallback(async (withLoader = true) => {
    try {
      if (withLoader) {
        setLoading(true);
      }
      const data = await api.get("/products?pageSize=4&sort=newest");
      setFeatured(data.products || []);
    } finally {
      if (withLoader) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    loadFeatured(true);
  }, [loadFeatured]);

  useEffect(() => {
    return onLiveUIEvent(LIVE_UI_EVENTS.CATALOG_CHANGED, () => {
      loadFeatured(false);
    });
  }, [loadFeatured]);

  return (
    <AnimatedPage>
      <section className="relative isolate overflow-hidden rounded-[2rem] border border-slate-200/80 bg-gradient-to-br from-cyan-500 via-sky-500 to-indigo-500 p-6 text-white shadow-2xl sm:p-8 dark:border-slate-700/70">
        <div className="absolute inset-0 opacity-35 [background:radial-gradient(circle_at_15%_20%,rgba(255,255,255,0.45)_0%,transparent_45%),radial-gradient(circle_at_80%_75%,rgba(30,41,59,0.35)_0%,transparent_46%)]" />
        <div className="absolute inset-0 [background:linear-gradient(120deg,rgba(255,255,255,0.12)_0%,transparent_35%,rgba(255,255,255,0.06)_70%,transparent_100%)]" />
        <div className="absolute -right-16 top-0 h-56 w-56 rounded-full bg-white/15 blur-2xl" />
        <div className="absolute -bottom-20 left-16 h-64 w-64 rounded-full bg-indigo-900/25 blur-2xl" />

        <div className="relative z-10 grid items-end gap-8 lg:grid-cols-[minmax(0,1.06fr)_minmax(0,0.94fr)]">
          <MotionDiv initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
            <p className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/20 px-3 py-1 text-xs font-semibold uppercase tracking-wider backdrop-blur">
              <Gem size={14} />
              {t.heroBadge}
            </p>

            <h1 className="mt-4 max-w-2xl text-4xl font-black leading-tight sm:text-5xl">{t.heroTitle}</h1>
            <p className="mt-4 max-w-xl text-white/90">{t.heroDescription}</p>

            <div className="mt-7 flex flex-wrap items-stretch gap-3">
              <div className="rounded-2xl border border-white/25 bg-white/15 px-4 py-3 backdrop-blur">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-white/75">{t.freshListings}</p>
                <p className="mt-1 text-2xl font-black leading-none">{loading ? "..." : featured.length}</p>
              </div>
              <div className="rounded-2xl border border-white/25 bg-slate-950/20 px-4 py-3 backdrop-blur">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-white/75">MDM</p>
                <p className="mt-1 text-sm font-semibold text-white/95">{t.viewAll}</p>
              </div>
            </div>
          </MotionDiv>

          <MotionDiv
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.08 }}
            className="hidden min-h-[260px] md:block"
          >
            <div className="grid gap-3 sm:grid-cols-2">
              {(loading ? Array.from({ length: 2 }).map((_, index) => ({ id: `skeleton-${index}` })) : spotlight).map((item) => (
                <div
                  key={item.id}
                  className={`relative overflow-hidden rounded-2xl border ${
                    loading ? "border-white/20 bg-white/10" : "border-white/25 bg-slate-950/25"
                  } p-2 backdrop-blur`}
                >
                  {loading ? (
                    <div className="soft-pulse h-full min-h-[210px] w-full rounded-xl bg-white/25" />
                  ) : (
                    <>
                      <img
                        src={item.image}
                        alt={item.title}
                        className="h-[210px] w-full rounded-xl object-cover"
                        loading="lazy"
                      />
                      <div className="absolute inset-x-2 bottom-2 rounded-xl border border-white/20 bg-slate-950/65 p-3 backdrop-blur">
                        <p className="line-clamp-1 text-sm font-semibold">{item.title}</p>
                        <p className="mt-1 inline-flex items-center gap-1 text-sm font-bold text-cyan-200">
                          <CurrencyIcon size={14} />
                          {item.price}
                        </p>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </MotionDiv>
        </div>
      </section>

      <section className="mt-8 grid gap-4 lg:grid-cols-3">
        {[
          { icon: CurrencyIcon, title: t.cardOneTitle, text: t.cardOneText },
          { icon: ShieldCheck, title: t.cardTwoTitle, text: t.cardTwoText },
          { icon: Rocket, title: t.cardThreeTitle, text: t.cardThreeText },
        ].map((item, index) => (
          <MotionDiv
            key={item.title}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: index * 0.06 }}
            className="group relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white/80 p-5 shadow-sm transition hover:-translate-y-1 hover:shadow-xl dark:border-slate-700/80 dark:bg-slate-900/70"
          >
            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-cyan-500/0 via-cyan-500 to-indigo-500/0 opacity-80" />
            <div className="inline-flex rounded-xl border border-cyan-200/80 bg-cyan-50/80 p-2 text-cyan-600 dark:border-cyan-800/80 dark:bg-cyan-900/20 dark:text-cyan-300">
              <item.icon size={22} />
            </div>
            <h3 className="mt-3 text-lg font-semibold text-slate-900 dark:text-slate-100">{item.title}</h3>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{item.text}</p>
          </MotionDiv>
        ))}
      </section>

      <section className="mt-10 rounded-3xl border border-slate-200/80 bg-white/60 p-4 shadow-lg backdrop-blur sm:p-6 dark:border-slate-700/70 dark:bg-slate-900/45">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{t.freshListings}</h2>
          <Link
            className="rounded-xl border border-cyan-200 bg-cyan-50 px-3 py-1.5 text-sm font-semibold text-cyan-700 transition hover:-translate-y-0.5 hover:bg-cyan-100 dark:border-cyan-700/60 dark:bg-cyan-900/25 dark:text-cyan-200 dark:hover:bg-cyan-900/35"
            to="/catalog"
          >
            {t.viewAll}
          </Link>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {loading && Array.from({ length: 4 }).map((_, index) => <SkeletonCard key={index} />)}
          {!loading && featured.map((product) => <ProductCard key={product.id} product={product} />)}
          {!loading && featured.length === 0 && (
            <div className="col-span-full rounded-2xl border border-slate-200/80 bg-white/70 p-8 text-center text-sm text-slate-600 dark:border-slate-700/70 dark:bg-slate-900/70 dark:text-slate-300">
              {t.freshListings}: 0
            </div>
          )}
        </div>
      </section>
    </AnimatedPage>
  );
}
