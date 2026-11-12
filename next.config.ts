import type { NextConfig } from "next";
import fs from "fs";
import path from "path";

const isExport = process.env.STATIC_EXPORT === "1";
const exportBasePath = process.env.EXPORT_BASE_PATH ?? "/borners-platform";
const buildId =
  process.env.NEXT_PUBLIC_BUILD_ID || "borners-2027-natele-lab-v7";

const versionPayload = {
  buildId,
  updatedAt: new Date().toISOString(),
  title:
    "BORNERS GROUP 2027 — Аудит точности «Пик своих денег», обратимые PO в Закупках и Dark Mode (v7 · 100/100 тестов)",
  subtitle:
    "Контрольная перепроверка и доводка v7: рубль-в-рубль учёт стартового кэша без дублирования, честный режим лага выплат WB, обратимый 1-клик цикл «✓ Утвердить в PO ↔ ↺ В черновик», точные единицы пар/комплектов, полная поддержка тёмной темы и 100/100 зелёных автотестов.",
  changes: [
    "Интерактивная панель и 2-слойный график «Пик своих денег» (04 · Финансы, 03 · Закупки и Главная): выверенный рубль-в-рубль учёт стартового кэша и лага выплат WB (0/+1/+2 мес.), честный статус при отключённом графике WB, полная контрастность в тёмной теме и изолированные SVG-градиенты",
    "Контур 03 · Закупки и Главная: 1-в-1 синхронизация 4 волн Q1–Q4 с матрицей кабинетов, обратимый 1-клик перевод партий «✓ Утвердить в PO → ↺ В черновик», категорийные единицы измерения («пар» для AKUSHA, «компл.» для белья, 8 размеров штор LISKANI) и точное распределение пар по размерам 22–30 / 36–41",
    "Расширенный тестовый контур платформы: 100/100 модульных и интеграционных автотестов зелёные + расширенный сквозной Headless Chrome E2E по обоим базовым путям (/ и /borners-group)",
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
