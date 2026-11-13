import type { NextConfig } from "next";
import fs from "fs";
import path from "path";

const isExport = process.env.STATIC_EXPORT === "1";
const exportBasePath = process.env.EXPORT_BASE_PATH ?? "/borners-platform";
const buildId =
  process.env.NEXT_PUBLIC_BUILD_ID || "borners-2027-natele-lab-v8";

const versionPayload = {
  buildId,
  updatedAt: new Date().toISOString(),
  title:
    "BORNERS GROUP 2027 — Тотальная ревизия всех 47 модулей: ядро, контуры 01–04, Лаборатория R&D, Miro, RBAC и экспорты (v8)",
  subtitle:
    "Глубокий сквозной аудит и устранение 40+ тонких багов: защита инвариантов 500 млн ₽ / 686,28 млн ₽ / 105,79 млн ₽, синхронизация кэшфлоу, обувные сетки 39–45, строгая ролевая изоляция RBAC, контрастность Dark Mode и 110+ автотестов.",
  changes: [
    "Ядро расчётов, хранилище и облачный синк: устранение гонок pullPortfolioFromSupabase/IDB, защита инварианта 500 млн ₽ при правке метаданных вариантов LISKANI, по-годовая изоляция PO в 2028 году, фильтрация неподтверждённых PO, профили мужской обуви 39–45 и RFC-4180 CSV/PDF/Excel экспорты с UTF-8 BOM",
    "Контуры 01–04, верстак закупок и паспорт SKU: сквозная синхронизация параметров кэшфлоу между Главной, 03 и 04, динамические единицы («пар», «компл. штор», «компл.») без суммирования разнородных единиц во «Всех брендах», живой режим «Годовой план» и пересчёт помесячной цены в паспорте SKU",
    "Оболочка, Лаборатория R&D, PDF-конструктор, Miro и RBAC: починка 404 путей изображений/PDF, сохранение правок из PDF-конструктора без искажения валюты CNY/RUB, отбор версий образцов в 03 Образец, читаемость стикеров Miro и бежевых плашек в Dark Mode, рабочие шаги Spotlight-тура и полная защита себестоимости/финансов по ролям",
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
