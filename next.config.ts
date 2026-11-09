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
    "Исправлены карточки товаров, загрузка/удаление фото и каталог 01 · Продукт. Обновите страницу.",
  changes: [
    "Загрузка и удаление фото в карточках товаров: загруженные фото больше не подменяются дефолтным макетом боксеров, а единственную фотографию можно удалить в 1 клик",
    "Чистые карточки по каждому бренду (LISKANI — шторы/тюль, AKUSHA — обувь, НА ТЕЛЕ, FUKAI, BORNERS) без чужих артикулов WB 244995893 и чужих характеристик",
    "Единый каталог «01 · Продукт» без дублирования витрин + прямое редактирование состава ткани, конструкции, размеров и цветовых палитр прямо внутри карточки",
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
