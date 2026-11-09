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
    "Единый воздушный дизайн-код во всех вкладках (Главная, Сводка, 01 Продукт, 02 Продажи, 03 Закупки, 04 Финансы) + убрано дублирование прибыли 312,80 млн ₽ на Главной",
    "Автозаполнение отраслевых нормативов WB в карточках SKU (без «Не заполнено») и 1-клик запуск стартовых матриц всех 5 кабинетов холдинга (BORNERS, FUKAI, AKUSHA, LISKANI, НА ТЕЛЕ)",
    "Интерактивный симулятор «Что если?» (ползунки цены WB, себестоимости фабрик и ДРР/комиссии) + Платёжный календарь 4 волн закупок с источниками финансирования",
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
