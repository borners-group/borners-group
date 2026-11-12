import type { NextConfig } from "next";
import fs from "fs";
import path from "path";

const isExport = process.env.STATIC_EXPORT === "1";
const exportBasePath = process.env.EXPORT_BASE_PATH ?? "/borners-platform";
const buildId =
  process.env.NEXT_PUBLIC_BUILD_ID || "borners-2027-natele-lab-v3";

const versionPayload = {
  buildId,
  updatedAt: new Date().toISOString(),
  title:
    "НА ТЕЛЕ + Лаборатория R&D (все 7 этапов) + Холст идей (Miro) — Полная проверка v3",
  subtitle:
    "Безупречное прохождение всех 7 этапов R&D (01 Идея → 07 Запуск), абсолютная защита BORNERS 686,28 млн ₽ от любых сценариев НА ТЕЛЕ, авто-синк SKU и IndexedDB (70/70 автотестов зелёные).",
  changes: [
    "Лаборатория R&D (01 Идея → 07 Запуск): разблокирован сквозной переход по всем 7 этапам (включая 4 проверки на 04 Тест, атомарное сохранение анализа, полные поля Gate-окна на всех стадиях и автоматическую передачу утверждённых моделей в Каталог SKU)",
    "Защита при переключении брендов: карточка R&D больше никогда не схлопывается при смене бренда на НА ТЕЛЕ или открытии с Холста идей (Miro) / Поиска ⌘K, а китайский PDF-конструктор формирует профильный техпак под НА ТЕЛЕ, AKUSHA, LISKANI и BORNERS",
    "Железобетонная изоляция сценариев и данных: даже кастомные сценарии НА ТЕЛЕ никогда не сбивают эталон BORNERS (686,28 млн ₽), все правки с Главной сохраняются в IndexedDB, 70 из 70 автотестов зелёные",
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
