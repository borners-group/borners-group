import type { NextConfig } from "next";
import fs from "fs";
import path from "path";

const isExport = process.env.STATIC_EXPORT === "1";
const exportBasePath = process.env.EXPORT_BASE_PATH ?? "/borners-platform";
const buildId =
  process.env.NEXT_PUBLIC_BUILD_ID || "borners-2027-investment-schedule-v13";

const defaultSupabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://ocdmyldosplufhhwrrwq.supabase.co";
const defaultSupabasePublishableKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "sb_publishable_O2S9Pi4aswxjD5ShAhHQ_w_CnUvmZlR";

const releaseNotesSummary =
  "Релиз v13: Хронологический график инвестиций, реинвестирование поступлений Wildberries и календарь движения денег по датам с полным ручным управлением и синхронизацией в Supabase.";

const versionPayload = {
  buildId,
  updatedAt: new Date().toISOString(),
  title:
    "BORNERS GROUP 2027 — Релиз v13: График инвестиций, реинвестирование WB и календарь платежей",
  subtitle: releaseNotesSummary,
  changes: [
    "Главный экран («Сводка»): 3 ключевых показателя — Общая стоимость закупок, Максимальная потребность в собственных деньгах и Реинвестирование с продаж WB + кнопка «График инвестиций» и ближайший платёж",
    "Интерактивный календарь движения денег (месяцы → точные даты): Поступления, Платежи, Реинвестирование, Нужно вложить и Остаток со сквозной привязкой к закупочным партиям",
    "Полноценное ручное управление: перенос и разбивка платежей на транши, аванс/доплата, сроки выплат WB, неснижаемый резерв, собственные инвестиции, контроль дефицита товара, «Вернуть расчёт по плану» с предпросмотром и синхронизация в облаке Supabase",
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
