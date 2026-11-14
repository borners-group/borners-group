import type { NextConfig } from "next";
import fs from "fs";
import path from "path";

const isExport = process.env.STATIC_EXPORT === "1";
const exportBasePath = process.env.EXPORT_BASE_PATH ?? "/borners-platform";
const buildId =
  process.env.NEXT_PUBLIC_BUILD_ID || "borners-2027-natele-lab-v9";

const releaseNotesSummary =
  "Лаборатория R&D + НА ТЕЛЕ (восстановление архивных карточек и точная комплектация без сброса графика), корзина удалённых SKU с полным откатом и защита квоты localStorage 5 МБ для тяжёлых PDF/DOCX/XLSX через IndexedDB, посимвольный перенос CJK (中文) и длинных токенов в PDF, мобильное управление Miro / надёжное скачивание файлов на iOS Safari и сквозная ролевая маскировка себестоимости и финансов (RBAC) во всех PDF/Excel/CSV экспортах.";

const versionPayload = {
  buildId,
  updatedAt: new Date().toISOString(),
  title:
    "BORNERS GROUP 2027 — Релиз v9: Лаборатория R&D + НА ТЕЛЕ, корзина SKU, защита квоты 5 МБ, CJK PDF, мобильный Miro и RBAC",
  subtitle: releaseNotesSummary,
  changes: [
    "Лаборатория R&D + НА ТЕЛЕ и синхронизация каталога: бесшовное восстановление архивных R&D-концептов без дублирования SKU, сохранение комплектации бренда (unitsInPack), расписания продаж и ручных PO (version > 1)",
    "Корзина удалённых SKU, бэкапы и защита квоты 5 МБ: снимки удалённых моделей с мгновенным восстановлением, защита от гонок облачных tombstone-списков, очистка всех тяжёлых data:-вложений (PDF/DOCX/XLSX/видео/аудио) в localStorage и полная регидратация Документов, Анализа и Протоколов тестов из IndexedDB",
    "Экспорты PDF/Excel/CSV, 2028 PO и мобильный UX: посимвольный CJK-перенос (中文) без выхода за поля в PDF, безопасное скачивание на iOS Safari / Mobile Chrome, мобильное управление Miro, по-годовая точность PO 2027/2028 с учётом объёма заказов AKUSHA и строгая ролевая защита RBAC (себестоимость / финансы / курсы CNY·USD)",
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
    NEXT_PUBLIC_RELEASE_NOTES: releaseNotesSummary,
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
