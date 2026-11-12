import type { NextConfig } from "next";
import fs from "fs";
import path from "path";

const isExport = process.env.STATIC_EXPORT === "1";
const exportBasePath = process.env.EXPORT_BASE_PATH ?? "/borners-platform";
const buildId =
  process.env.NEXT_PUBLIC_BUILD_ID || "borners-2027-natele-lab-v5";

const versionPayload = {
  buildId,
  updatedAt: new Date().toISOString(),
  title:
    "BORNERS GROUP 2027 — Полная синхронизация R&D ↔ Каталог ↔ Сценарии, Miro → Лаборатория и защита данных (v5)",
  subtitle:
    "Безупречная сохранность эталонов BORNERS (686,28 млн ₽), LISKANI (500 млн ₽), AKUSHA (105,79 млн ₽), FUKAI и НА ТЕЛЕ, прямой перевод идей с доски Miro в R&D и производство (XS–XL / 22–30 / 300×240..400×270), многостраничный PDF-конструктор на китайском и сквозная сводка по всем 5 брендам (90/90 автотестов зелёные).",
  changes: [
    "Железобетонная сохранность фото и планов (IndexedDB + localStorage + Supabase): устранено дублирование base64 в резервном ключе, защищены галереи от затирания при кросс-хуковых событиях и импорте JSON-бэкапов, добавлена монотонная защита облачных пушей с сохранением кастомных сценариев",
    "Живая сквозная цепочка Miro → Лаборатория R&D → 06 Производство → 01–04 Контуры: кнопка «В разработку R&D →» на карточках Miro, автоматическая передача партий из R&D в Закупки и стартовый план Продаж, брендовые размерные сетки (НА ТЕЛЕ XS–XL, AKUSHA 22–30/36–41, LISKANI шторы) и многостраничный PDF ТЗ на китайском без обрезки строк",
    "Единая мультибрендовая аналитика холдинга: точный поиск ⌘K с реальной выручкой по сценарию бренда, сводный режим «Все 5 брендов холдинга» в Продажах (02), Закупках (03), Финансах (04), Стратегии и Презентации без расхождений цифр",
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
