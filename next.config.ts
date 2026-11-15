import type { NextConfig } from "next";
import fs from "fs";
import path from "path";

const isExport = process.env.STATIC_EXPORT === "1";
const exportBasePath = process.env.EXPORT_BASE_PATH ?? "/borners-platform";
const buildId =
  process.env.NEXT_PUBLIC_BUILD_ID || "borners-2027-finance-simplification-v14";

const defaultSupabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://ocdmyldosplufhhwrrwq.supabase.co";
const defaultSupabasePublishableKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "sb_publishable_O2S9Pi4aswxjD5ShAhHQ_w_CnUvmZlR";

const releaseNotesSummary =
  "Релиз v14: Упрощённый финансовый интерфейс и управление инвестициями — 4 главных показателя, «Когда и сколько вложить» с партиями, рекомендации «Что нужно сделать», график «Свободные деньги бизнеса» и сравнение с исходным планом.";

const versionPayload = {
  buildId,
  updatedAt: new Date().toISOString(),
  title:
    "BORNERS GROUP 2027–2028 — Релиз v14: Упрощение финансов и управление инвестициями",
  subtitle: releaseNotesSummary,
  changes: [
    "Верхняя панель (Бренд / Сценарий / Год 2027–2028 + статус сохранения) и только 4 главных показателя: План продаж, Стоимость закупок, Максимальная потребность в своих деньгах (с месяцем пика) и Реинвестирование",
    "Главный рабочий блок «Когда и сколько вложить» с раскрытием конкретных партий (7 полей), редактированием условий оплаты и объёмов, предупреждением о дефиците и компактным блоком «Что нужно сделать» (до 3 рекомендаций)",
    "Раздельный учёт расчётной потребности и внесённых средств (без искусственного занижения пика), «Сравнить с исходным планом», сводка группы по 5 брендам, график «Свободные деньги бизнеса» и раздел «Подробная аналитика»",
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
