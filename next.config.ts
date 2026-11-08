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
    "Закупки напрямую связаны с планом продаж: меняйте сценарий или годовой план выкупов — партии и бюджет пересчитываются мгновенно",
    "Наглядно выделена сумма инвестиций сразу на старт (Партия №1 · Q1 и аванс 30% фабрике) отдельно от оборотного бюджета на год",
    "Очищен интерфейс партий от визуального перегруза, исправлен пустой экран при фильтре бренда и настроен возврат на главную сводку по клику на логотип",
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
