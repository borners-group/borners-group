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
    "Расчёт реального пика собственных денег с учётом возврата выручки с Wildberries и помесячный календарь кэшфлоу (12 мес.)",
    "Сводная таблица инвестиций, закупок и прибыли по всем 5 брендам холдинга (BORNERS, FUKAI, НА ТЕЛЕ, Акуша, Liskani) и ИТОГО ГРУППА без двойного счёта",
    "Выгрузка полной спецификации заказа фабрике в Excel/CSV с размерами S–XXL, авансами 30%, доплатами 70% и датами поставки в 1 клик",
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
