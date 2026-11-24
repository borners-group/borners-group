import type { NextConfig } from "next";
import fs from "fs";
import path from "path";

const isExport = process.env.STATIC_EXPORT === "1";
const exportBasePath = process.env.EXPORT_BASE_PATH ?? "/borners-platform";
const buildId =
  process.env.NEXT_PUBLIC_BUILD_ID || "borners-2027-finance-simplification-v14-tz-v1-bulk-excel-plan-v5";

const defaultSupabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://ocdmyldosplufhhwrrwq.supabase.co";
const defaultSupabasePublishableKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "sb_publishable_O2S9Pi4aswxjD5ShAhHQ_w_CnUvmZlR";

const releaseNotesSummary =
  "Добавлено массовое обновление через Excel (.xlsx) и CSV для всех брендов и всех 269 размерных SKU LISKANI: скачивание шаблона с ценами, себестоимостью и помесячным планом продаж (Янв–Дек, выкупы или заказы), предпросмотр «Было → Стало» до сохранения и автопересчёт карточек, закупок и P&L. Обновлены цены и себестоимость всех 269 SKU LISKANI по файлу 2027.";

const versionPayload = {
  buildId,
  updatedAt: new Date().toISOString(),
  title:
    "BORNERS GROUP 2027–2028 — ТЗ v1.0: Единая система продаж, закупок и инвестиций",
  subtitle: releaseNotesSummary,
  changes: [
    "Защищённый вход по email и паролю (Supabase Auth + RLS для участников BORNERS GROUP) и защита от потери правок при одновременной работе с двух устройств",
    "Единый расчётный движок: честный цикл возвратов обуви AKUSHA в пути, запрет фиктивного реинвеста при нулевой себестоимости, постатейная экономика без двойной логистики, автопересчёт доплаты при смене аванса, дата возврата капитала и сквозной перенос 2026→2027→2028",
    "Фотографии товаров из карточки SKU внутри раскрытых платежей, живой предпросмотр «Было → Стало» до сохранения, прямой переход из платежа в партию, 2 режима капитала группы («Общий котёл» / «Каждый бренд сам»), объединённый BORNERS / FUKAI и правильное написание LISKANI",
  ],
};

try {
  const publicDir = path.join(process.cwd(), "public");
  if (fs.existsSync(publicDir)) {
    fs.writeFileSync(
      path.join(publicDir, "version.json"),
      JSON.stringify(versionPayload, null, 2),
      "utf8"
    );
  }
} catch {
  // ignore in read-only environments
}

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_BUILD_ID: buildId,
    NEXT_PUBLIC_RELEASE_NOTES: releaseNotesSummary,
    NEXT_PUBLIC_BASE_PATH: isExport ? exportBasePath : "",
    NEXT_PUBLIC_SUPABASE_URL: defaultSupabaseUrl,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: defaultSupabasePublishableKey,
  },
  ...(isExport
    ? {
        output: "export",
        distDir: "out-gh-pages",
        ...(exportBasePath
          ? {
              basePath: exportBasePath,
              assetPrefix: `${exportBasePath}/`,
            }
          : {}),
        trailingSlash: true,
        images: { unoptimized: true },
      }
    : {}),
  allowedDevOrigins: [
    "*.serveousercontent.com",
    "*.serveo.net",
    "*.lhr.life",
    "*.localhost.run",
    "localhost:3000",
  ],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
