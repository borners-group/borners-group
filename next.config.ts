import type { NextConfig } from "next";
import fs from "fs";
import path from "path";

const isExport = process.env.STATIC_EXPORT === "1";
const exportBasePath = process.env.EXPORT_BASE_PATH ?? "/borners-platform";
const buildId =
  process.env.NEXT_PUBLIC_BUILD_ID || "borners-2027-editorial-ui-v10";

const releaseNotesSummary =
  "Архитектурный редизайн BORNERS GROUP (COS / Acne + Ramp): тёплый камень #F6F5F2 и антрацит #141413 без больничного синего налёта, настоящий технический моноширинный шрифт JetBrains Mono для артикулов и рублей, каталожный fashion-лукбук SKU, 0 мультяшных эмодзи и переключатель мгновенного отката к классическому виду v9 в 1 клик.";

const versionPayload = {
  buildId,
  updatedAt: new Date().toISOString(),
  title:
    "BORNERS GROUP 2027 — Релиз v10: Архитектурная эстетика COS / Ramp, JetBrains Mono и откат дизайна в 1 клик",
  subtitle: releaseNotesSummary,
  changes: [
    "Тёплый архитектурный камень (#F6F5F2 + #FFFFFF + антрацит #141413) и тёплый графит в тёмной теме (#0E0E0D + #151514) с мгновенным переключателем отката к классическому стилю v9 прямо в меню Профиля",
    "Настоящая швейцарская табличная типографика: подключён моноширинный шрифт JetBrains Mono (tabular-nums) для артикулов SKU, кодов партий PO, размерных сеток и рублёвых колонок",
    "Чистый редакционный интерфейс без «ИИ-шума»: убраны мультяшные эмодзи, неоновые градиенты и вращающиеся подложки; карточки каталога оформлены в духе fashion-лайншита COS / SSENSE с тонкими 1px линиями",
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
