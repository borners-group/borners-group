import type { NextConfig } from "next";
import fs from "fs";
import path from "path";

const isExport = process.env.STATIC_EXPORT === "1";
const exportBasePath = process.env.EXPORT_BASE_PATH ?? "/borners-platform";
const buildId = process.env.NEXT_PUBLIC_BUILD_ID || `borners-2027-${Date.now()}`;

const versionPayload = {
  buildId,
  updatedAt: new Date().toISOString(),
  title: "LISKANI 2027 · 269 SKU и 33 фото WB загружены",
  subtitle:
    "Подгружен утверждённый план LISKANI на 500 млн ₽ выкупов (877,2 млн ₽ заказов · 269 SKU) и реальные фото карточек с Wildberries.",
  changes: [
    "Загружены все 33 цветовые карточки LISKANI (LSC-001..LSC-033) с реальными студийными фотографиями с Wildberries и полным реестром 269 размерных SKU (Блэкаут, Мрамор, Рогожка, Тюль Вуаль)",
    "Помесячный план 2027 сверен рубль-в-рубль: 500 000 000 ₽ выкупов (при 57% выкупа) и 877 192 982 ₽ заказов (289 889 комплектов штор и тюля)",
    "В каждой карточке LISKANI и в разделе «01 · Продукт» доступна интерактивная матрица всех размеров (300×240..600×270 см) со штрихкодами, артикулами WB, себестоимостью и редактированием",
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
