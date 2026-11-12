import type { NextConfig } from "next";
import fs from "fs";
import path from "path";

const isExport = process.env.STATIC_EXPORT === "1";
const exportBasePath = process.env.EXPORT_BASE_PATH ?? "/borners-platform";
const buildId =
  process.env.NEXT_PUBLIC_BUILD_ID || "borners-2027-natele-lab-v2";

const versionPayload = {
  buildId,
  updatedAt: new Date().toISOString(),
  title:
    "НА ТЕЛЕ + Лаборатория R&D + Холст идей (Miro) и двусторонняя синхронизация SKU",
  subtitle:
    "Полный сквозной контур НА ТЕЛЕ без сбоев сценариев, Лаборатория R&D в 1 клик, защита медиа в IndexedDB и полный JSON Импорт/Экспорт (64/64 автотеста зелёные).",
  changes: [
    "Возрождена Лаборатория R&D в верхней панели навигации и в 01 · Продукт со встроенным Холстом идей (Miro) и двусторонней синхронизацией карточек со всеми 5 брендами (BORNERS, НА ТЕЛЕ, FUKAI, AKUSHA, LISKANI) без затирания каталога",
    "Усилен контур НА ТЕЛЕ: полная изоляция сценариев (переключение НА ТЕЛЕ больше никогда не сбрасывает фильтр на «Все бренды» и не затрагивает BORNERS 686,28 млн ₽), перенос концептов из R&D в 1 клик",
    "Тройная защита данных («чтобы ничего не слетало»): авто-сохранение тяжёлых фото и аудио R&D / Miro в IndexedDB при перезагрузке F5 + полный JSON Экспорт и Импорт резервной копии в верхнем меню",
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
