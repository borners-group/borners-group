import type { NextConfig } from "next";
import fs from "fs";
import path from "path";

const isExport = process.env.STATIC_EXPORT === "1";
const exportBasePath = process.env.EXPORT_BASE_PATH ?? "/borners-platform";
const buildId =
  process.env.NEXT_PUBLIC_BUILD_ID || "borners-2027-sales-integrity-v11";

const releaseNotesSummary =
  "Релиз v11: Полная защита цифр и планов продаж 2027 по всем 5 брендам (AKUSHA, BORNERS, LISKANI, FUKAI, НА ТЕЛЕ), плашки продаж прямо над каждой карточкой, авто-точки отката и защита от перезаписи цен.";

const versionPayload = {
  buildId,
  updatedAt: new Date().toISOString(),
  title:
    "BORNERS GROUP 2027 — Релиз v11: Защита планов продаж AKUSHA и всех карточек 2027",
  subtitle: releaseNotesSummary,
  changes: [
    "Над каждой карточкой товара на Главной, в «01 · Продукт» и в «Лаборатории R&D» выведена наглядная плашка годовых продаж 2027 (в млн ₽ и в парах/комплектах) — ни одна сезонная или бесценовая позиция AKUSHA больше не показывает ложный 0 ₽",
    "Устранён баг блокировки выручки нулевым оверрайдом (monthlyRevenuesRubOverride) и перезаписи цен при синхронизации R&D → Каталог",
    "В меню Профиля добавлены авто-точки быстрого локального отката и индикатор режима хранения данных",
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
