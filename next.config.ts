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
    "Единая мультибрендовая платформа BORNERS GROUP (2027–2028): независимые сценарии по каждому бренду (BORNERS, FUKAI, AKUSHA, LISCANI, НА ТЕЛЕ) с выбором сценария в Глобальной сводке",
    "Учёт категорийных единиц измерения (комплекты белья, пары обуви AKUSHA, комплекты штор и метры ткани LISCANI) без смешивания разнородных штук в общую цифру",
    "Автоматический перенос конечного остатка склада с 31 декабря 2027 на 1 января 2028 года, эталонная размерная матрица 12/26/30/20/12% и экспорт документа каждого заказа фабрике",
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
