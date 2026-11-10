import type { NextConfig } from "next";
import fs from "fs";
import path from "path";

const isExport = process.env.STATIC_EXPORT === "1";
const exportBasePath = process.env.EXPORT_BASE_PATH ?? "/borners-platform";
const buildId = process.env.NEXT_PUBLIC_BUILD_ID || `borners-2027-${Date.now()}`;

const versionPayload = {
  buildId,
  updatedAt: new Date().toISOString(),
  title: "AKUSHA 2027 (31 модель · 105,8 млн ₽) и LISKANI 2027 (269 SKU · 500 млн ₽)",
  subtitle:
    "Подгружены утверждённые планы AKUSHA 2027 (20 377 пар выкупов · 47 808 заказов · 26 фото) и LISKANI 2027 (500 млн ₽ выкупов · 269 SKU), 57/57 автотестов зелёные.",
  changes: [
    "Загружен официальный план продаж AKUSHA 2027 из PDF (31 модель · 24 карточки в 9 группах, включая общую карточку замшевых лоферов №09–16 на 8 цветов · 20 377 выкупленных пар · 47 808 заказов · 105 793 210 ₽ выручки · 37 448 200 ₽ себестоимость)",
    "Для Топсайдеров (№17–20) и Дыхабельных мокасин (№28–31) сохранены точные пометки «уточнить» без искусственных допущений, с мгновенным пересчётом заказов, выручки, закупок и P&L при вводе цены/себестоимости/% выкупа",
    "Полная синхронизация сценариев брендов (AKUSHA 202706, LISKANI 202705) и защита карточек при работе на всех адресах GitHub Pages (57/57 автотестов пройдено)",
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
    NEXT_PUBLIC_BASE_PATH: isExport ? exportBasePath : "",
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
