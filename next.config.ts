import type { NextConfig } from "next";
import fs from "fs";
import path from "path";

const isExport = process.env.STATIC_EXPORT === "1";
const exportBasePath = process.env.EXPORT_BASE_PATH ?? "/borners-platform";
const buildId =
  process.env.NEXT_PUBLIC_BUILD_ID || "borners-2027-natele-lab-v4";

const versionPayload = {
  buildId,
  updatedAt: new Date().toISOString(),
  title:
    "BORNERS GROUP 2027 — Полный аудит всех 5 брендов, Лаборатории R&D, PDF ТЗ и облачного синка (v4)",
  subtitle:
    "Абсолютная сохранность эталонов BORNERS (686,28 млн ₽), LISKANI (500 млн ₽), AKUSHA (105,79 млн ₽) и НА ТЕЛЕ при любых перезагрузках и облачном синке Supabase, бесшовная связка Лаборатории R&D ↔ Каталога SKU ↔ PDF-конструктора на китайском и 14 блоков стратегии для всех 5 брендов (80/80 автотестов зелёные).",
  changes: [
    "Защита локальных и облачных данных (Supabase + IndexedDB + localStorage): умное слияние слепков по метке времени больше никогда не затирает созданные модели НА ТЕЛЕ и пользовательские правки, не воскрешает удалённые фото и не даёт устаревшим облачным строкам сбить эталон BORNERS 686,28 млн ₽",
    "Бесшовная связка Лаборатории R&D → 01 · Продукт → PDF-техпак для фабрики: прямой переход сразу в паспорт SKU, генерация точного двуязычного ТЗ (RU/中文) с реальными фото и спецификациями под НА ТЕЛЕ, AKUSHA, LISKANI, FUKAI и BORNERS без подмены на мужские боксеры",
    "Точная финансовая и сценарная математика всех 5 брендов: сводка инвестиций холдинга по всем брендам в «04 · Деньги», изоляция кастомных сценариев от официальных планов 202705/202706, буферизированный ввод без сброса цифр и все 70 стратегических блоков (5 × 14) в Презентации стратегии",
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
