import type { NextConfig } from "next";
import fs from "fs";
import path from "path";

const isExport = process.env.STATIC_EXPORT === "1";
const exportBasePath = process.env.EXPORT_BASE_PATH ?? "/borners-platform";
const buildId =
  process.env.NEXT_PUBLIC_BUILD_ID || "borners-2027-cloud-sync-v12";

const defaultSupabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://ocdmyldosplufhhwrrwq.supabase.co";
const defaultSupabasePublishableKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "sb_publishable_O2S9Pi4aswxjD5ShAhHQ_w_CnUvmZlR";

const releaseNotesSummary =
  "Релиз v12: Подключено единое облако Supabase (Frankfurt) — все цены, продажи, закупки, R&D и стратегия синхронизируются между всеми ноутбуками, телефонами и Telegram в реальном времени.";

const versionPayload = {
  buildId,
  updatedAt: new Date().toISOString(),
  title:
    "BORNERS GROUP 2027 — Релиз v12: Единая облачная база Supabase (Real-Time Sync)",
  subtitle: releaseNotesSummary,
  changes: [
    "Подключена живая облачная база Supabase (eu-central-1) с Realtime-подпиской: правки с любого ноутбука мгновенно появляются на других устройствах и в браузере Telegram без ручного переноса файлов",
    "Умное слияние карточек без потери цен: заполненные цены AKUSHA (Топсайдеры, Мокасины и др.) защищены от затирания пустыми вкладками и сохраняются в неизменяемый серверный журнал истории Postgres",
    "Облачная синхронизация охватывает не только Каталог, Продажи, Закупки и Финансы по всем 5 брендам, но и Лабораторию R&D, Miro-доску и 14 блоков стратегии",
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
