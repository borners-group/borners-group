import type { NextConfig } from "next";
import fs from "fs";
import path from "path";

const isExport = process.env.STATIC_EXPORT === "1";
const exportBasePath = process.env.EXPORT_BASE_PATH ?? "/borners-platform";
const buildId = process.env.NEXT_PUBLIC_BUILD_ID || `borners-2027-${Date.now()}`;

const versionPayload = {
  buildId,
  updatedAt: new Date().toISOString(),
  title: "BORNERS обновился",
  subtitle:
    "Выпустили техническое обновление. Обновите страницу, чтобы применить свежую версию.",
  changes: [
    "Чистая упаковка раздела «03 · Закупки» и «Сводки» в стиле Peakly: убраны дублирующиеся карточки, рамки в рамках и лишний визуальный шум",
    "Сводка сценария (инвестиции, 12-месячный кэшфлоу WB, 5 брендов и все SKU) и параметры модели упакованы в удобные раскрывающиеся панели в 1 клик",
    "Спокойные чистые строки квартальных партий: выбор дат, периода и размерной сетки S–XXL аккуратно сгруппированы внутри «Размеры и расчёт ▾»",
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
