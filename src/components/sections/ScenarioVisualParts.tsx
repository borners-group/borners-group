'use client';

import React from 'react';
import { PackColor, resolvePublicAssetUrl } from '@/lib/scenarioData';

export function BoxerPackStackSvg({
  colors,
  large = false,
  brandLabel = 'BORNERS',
  category = 'pack',
  customPhotoUrl,
}: {
  colors: PackColor[];
  large?: boolean;
  brandLabel?: string;
  category?: 'pack' | 'single' | 'waistband' | 'fabric' | 'fit' | 'video';
  customPhotoUrl?: string;
}) {
  const upperBrand = (brandLabel || 'BORNERS').toUpperCase();
  const isLiskani =
    upperBrand.includes('LISK') ||
    upperBrand.includes('LISCAN') ||
    upperBrand.includes('ЛИСК');
  const isAkusha = upperBrand.includes('AKU') || upperBrand.includes('АКУ');

  const safePhotoUrl =
    customPhotoUrl &&
    !(
      (isLiskani || isAkusha) &&
      (customPhotoUrl.includes('borners-core-modal.svg') ||
        customPhotoUrl.includes('244995893_main.webp'))
    )
      ? customPhotoUrl
      : '';

  if (safePhotoUrl) {
    return (
      <div
        className={`relative w-full flex items-center justify-center overflow-hidden rounded-[14px] ${
          large ? 'h-[260px]' : 'h-[155px]'
        }`}
      >
        <img
          src={resolvePublicAssetUrl(safePhotoUrl)}
          alt={brandLabel}
          className="h-full w-full object-contain"
        />
      </div>
    );
  }

  const primary = colors[0] || {
    nameRu: 'Основной тон',
    pantone: 'PANTONE',
    hex: isLiskani ? '#D6CFC2' : isAkusha ? '#1F2937' : '#D48B92',
    bandHex: isLiskani ? '#C5BDB0' : isAkusha ? '#111827' : '#C67A82',
    textHex: isLiskani ? '#2E2B26' : isAkusha ? '#F9FAFB' : '#9E545D',
  };

  if (isLiskani && category === 'pack') {
    const c1 = colors[0]?.hex || '#D6CFC2';
    const c2 = colors[1]?.hex || '#4B5563';
    const c3 = colors[2]?.hex || '#F3EFEA';
    return (
      <div
        className={`relative w-full flex flex-col items-center justify-center select-none ${
          large ? 'h-[260px]' : 'h-[155px]'
        }`}
      >
        <svg viewBox="0 0 320 200" className="w-full h-full">
          {/* Карниз */}
          <rect x="34" y="18" width="252" height="6" rx="3" fill="#475569" />
          <circle cx="34" cy="21" r="5" fill="#334155" />
          <circle cx="286" cy="21" r="5" fill="#334155" />
          {/* Тюль по центру */}
          <path
            d="M 96 24 L 224 24 L 230 168 L 90 168 Z"
            fill={c3}
            fillOpacity="0.85"
            stroke="#CBD5E1"
            strokeWidth="1"
          />
          <line x1="125" y1="24" x2="122" y2="168" stroke="#CBD5E1" strokeWidth="1" strokeDasharray="3 3" />
          <line x1="160" y1="24" x2="160" y2="168" stroke="#CBD5E1" strokeWidth="1" strokeDasharray="3 3" />
          <line x1="195" y1="24" x2="198" y2="168" stroke="#CBD5E1" strokeWidth="1" strokeDasharray="3 3" />
          {/* Левая портьера */}
          <path
            d="M 48 24 L 122 24 C 116 74, 110 120, 118 172 L 42 172 Z"
            fill={c1}
            stroke="rgba(15,23,42,0.14)"
            strokeWidth="1.2"
          />
          <path d="M 68 24 C 65 75, 63 125, 66 172" fill="none" stroke="rgba(15,23,42,0.12)" strokeWidth="1.2" />
          <path d="M 92 24 C 89 75, 86 125, 90 172" fill="none" stroke="rgba(15,23,42,0.12)" strokeWidth="1.2" />
          {/* Правая портьера */}
          <path
            d="M 198 24 L 272 24 L 278 172 L 202 172 C 210 120, 204 74, 198 24 Z"
            fill={c2}
            stroke="rgba(15,23,42,0.14)"
            strokeWidth="1.2"
          />
          <path d="M 226 24 C 229 75, 232 125, 228 172" fill="none" stroke="rgba(255,255,255,0.16)" strokeWidth="1.2" />
          <path d="M 252 24 C 255 75, 257 125, 254 172" fill="none" stroke="rgba(255,255,255,0.16)" strokeWidth="1.2" />
          {/* Бейдж бренда */}
          <rect x="110" y="142" width="100" height="22" rx="6" fill="#0F172A" fillOpacity="0.88" />
          <text
            x="160"
            y="156.5"
            textAnchor="middle"
            fill="#FFFFFF"
            fontSize="10"
            fontWeight="700"
            letterSpacing="1.6"
          >
            LISKANI
          </text>
        </svg>
      </div>
    );
  }

  if (isAkusha && category === 'pack') {
    const mainCol = colors[0]?.hex || '#1F2937';
    const accentCol = colors[1]?.hex || '#E5E0D8';
    return (
      <div
        className={`relative w-full flex flex-col items-center justify-center select-none ${
          large ? 'h-[260px]' : 'h-[155px]'
        }`}
      >
        <svg viewBox="0 0 320 200" className="w-full h-full">
          {/* Силуэт кроссовка / обуви */}
          <path
            d="M 56 128 C 56 96, 78 68, 102 64 L 138 64 C 148 82, 168 94, 198 98 L 244 104 C 262 107, 270 118, 270 132 L 56 132 Z"
            fill={mainCol}
            stroke="rgba(15,23,42,0.15)"
            strokeWidth="1.5"
          />
          <path
            d="M 92 88 L 166 108 L 162 122 L 86 104 Z"
            fill={accentCol}
            fillOpacity="0.85"
          />
          {/* Подошва */}
          <rect
            x="50"
            y="130"
            width="224"
            height="18"
            rx="7"
            fill="#F8FAFC"
            stroke="#CBD5E1"
            strokeWidth="1.5"
          />
          <text
            x="160"
            y="172"
            textAnchor="middle"
            fill="#334155"
            fontSize="10.5"
            fontWeight="700"
            letterSpacing="1.8"
          >
            AKUSHA · FOOTWEAR
          </text>
        </svg>
      </div>
    );
  }

  if (category === 'waistband') {
    return (
      <div
        className={`relative w-full flex flex-col items-center justify-center gap-3 p-4 select-none ${
          large ? 'h-[260px]' : 'h-[155px]'
        }`}
      >
        <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7A756C]">
          Макро-деталь · Жаккардовая резинка 38 мм в тон ткани
        </div>
        {colors.slice(0, 3).map((c, idx) => (
          <div
            key={`${c.nameRu}-${idx}`}
            className="w-full max-w-[320px] h-11 rounded-[10px] border border-black/10 shadow-xs flex items-center justify-around px-4 font-extrabold text-[12px] tracking-[0.22em]"
            style={{ backgroundColor: c.bandHex, color: c.textHex }}
          >
            <span>{brandLabel}</span>
            <span>{brandLabel}</span>
            <span>{brandLabel}</span>
          </div>
        ))}
      </div>
    );
  }

  if (category === 'fabric') {
    return (
      <div
        className={`relative w-full flex flex-col items-center justify-center gap-3 p-4 select-none ${
          large ? 'h-[260px]' : 'h-[155px]'
        }`}
      >
        <div className="grid grid-cols-4 gap-2.5 w-full max-w-[320px]">
          {colors.map((c, idx) => (
            <div key={`${c.nameRu}-${idx}`} className="space-y-1 text-center">
              <div
                className="h-24 rounded-[12px] border border-black/10 shadow-inner"
                style={{
                  backgroundColor: c.hex,
                  backgroundImage:
                    'radial-gradient(rgba(255,255,255,0.18) 1px, transparent 0)',
                  backgroundSize: '5px 5px',
                }}
              />
              <div className="text-[10px] font-bold text-[#1D1D1F] truncate">
                {c.nameRu}
              </div>
              <div className="text-[9px] text-[#7A756C] font-mono truncate">
                {(c.pantone || '').replace('PANTONE ', '')}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (category === 'fit') {
    return (
      <div
        className={`relative w-full flex flex-col items-center justify-center p-3 select-none ${
          large ? 'h-[260px]' : 'h-[155px]'
        }`}
      >
        <TechnicalFlatDrawingSvg />
      </div>
    );
  }

  if (category === 'video') {
    return (
      <div
        className={`relative w-full flex flex-col items-center justify-center gap-2 rounded-[14px] bg-[#1D1D1F] text-white p-4 select-none ${
          large ? 'h-[260px]' : 'h-[155px]'
        }`}
      >
        <div className="h-12 w-12 rounded-full bg-white/15 border border-white/30 flex items-center justify-center text-[18px]">
          ▶
        </div>
        <div className="text-[13px] font-bold">Видео-обзор посадки и растяжения</div>
        <div className="text-[11px] text-white/65">
          Тест эластичности пояса 38 мм и швов Flatlock · 00:42
        </div>
      </div>
    );
  }

  const renderColors = category === 'single' || colors.length === 0 ? [primary] : colors;
  const count = renderColors.length;

  return (
    <div
      className={`relative w-full flex items-center justify-center select-none ${
        large ? 'h-[260px]' : 'h-[155px]'
      }`}
    >
      <svg
        viewBox="0 0 320 230"
        className="w-full h-full drop-shadow-[0_10px_18px_rgba(24,23,21,0.10)]"
      >
        {renderColors
          .slice()
          .reverse()
          .map((col, revIdx) => {
            const idx = count - 1 - revIdx;
            const offsetY = count === 1 ? 38 : idx * (count === 4 ? 22 : 27);
            const offsetX = count === 1 ? 12 : (count - 1 - idx) * 6;
            const rot = count === 1 ? 0 : -3.5 + idx * 1.1;
            return (
              <g
                key={`${col.nameRu}-${idx}`}
                transform={`translate(${18 + offsetX}, ${14 + offsetY}) rotate(${rot}, 135, 70)`}
              >
                <path
                  d="M 22 24 L 248 24 L 264 128 C 240 133, 195 132, 172 126 L 154 96 C 145 106, 125 106, 116 96 L 98 126 C 75 132, 30 133, 6 128 Z"
                  fill={col.hex}
                  stroke="rgba(0,0,0,0.08)"
                  strokeWidth="1.2"
                />
                {idx === count - 1 && (
                  <>
                    <path
                      d="M 106 26 C 102 68, 112 96, 135 102 C 158 96, 168 68, 164 26"
                      fill="none"
                      stroke="rgba(0,0,0,0.13)"
                      strokeWidth="1.6"
                    />
                    <path
                      d="M 135 26 L 135 100"
                      fill="none"
                      stroke="rgba(0,0,0,0.07)"
                      strokeWidth="1.2"
                    />
                  </>
                )}
                <rect
                  x="22"
                  y="6"
                  width="226"
                  height="21"
                  rx="3"
                  fill={col.bandHex}
                  stroke="rgba(0,0,0,0.10)"
                  strokeWidth="1"
                />
                <text
                  x="56"
                  y="20"
                  fill={col.textHex}
                  fontSize="9.5"
                  fontWeight="700"
                  letterSpacing="1.2"
                >
                  {brandLabel}
                </text>
                <text
                  x="135"
                  y="20"
                  textAnchor="middle"
                  fill={col.textHex}
                  fontSize="9.5"
                  fontWeight="700"
                  letterSpacing="1.2"
                >
                  {brandLabel}
                </text>
                <text
                  x="214"
                  y="20"
                  textAnchor="end"
                  fill={col.textHex}
                  fontSize="9.5"
                  fontWeight="700"
                  letterSpacing="1.2"
                >
                  {brandLabel}
                </text>
              </g>
            );
          })}
      </svg>
    </div>
  );
}

export function TechnicalFlatDrawingSvg() {
  return (
    <svg viewBox="0 0 420 155" className="w-full h-[145px]">
      <g transform="translate(12, 10)">
        <path
          d="M 18 18 L 166 18 L 178 116 L 114 122 L 99 96 L 85 96 L 70 122 L 6 116 Z"
          fill="#FFFFFF"
          stroke="#2C2C2E"
          strokeWidth="1.6"
        />
        <line x1="17" y1="33" x2="167" y2="33" stroke="#2C2C2E" strokeWidth="1.4" />
        <path
          d="M 68 33 C 66 68, 74 92, 92 96 C 110 92, 118 68, 116 33"
          fill="none"
          stroke="#2C2C2E"
          strokeWidth="1.3"
        />
        <line
          x1="92"
          y1="33"
          x2="92"
          y2="96"
          stroke="#8E8E93"
          strokeWidth="1"
          strokeDasharray="3 2"
        />
        <line
          x1="8"
          y1="109"
          x2="71"
          y2="115"
          stroke="#8E8E93"
          strokeWidth="1"
          strokeDasharray="3 2"
        />
        <line
          x1="113"
          y1="115"
          x2="176"
          y2="109"
          stroke="#8E8E93"
          strokeWidth="1"
          strokeDasharray="3 2"
        />
        <text x="92" y="138" textAnchor="middle" fontSize="10" fill="#6E6E73">
          Вид спереди (3D панель, ≈25 см)
        </text>
      </g>

      <g transform="translate(222, 10)">
        <path
          d="M 18 18 L 166 18 L 178 116 L 114 122 L 99 96 L 85 96 L 70 122 L 6 116 Z"
          fill="#FFFFFF"
          stroke="#2C2C2E"
          strokeWidth="1.6"
        />
        <line x1="17" y1="33" x2="167" y2="33" stroke="#2C2C2E" strokeWidth="1.4" />
        <path
          d="M 74 96 Q 92 84 110 96"
          fill="none"
          stroke="#2C2C2E"
          strokeWidth="1.2"
        />
        <line
          x1="8"
          y1="109"
          x2="71"
          y2="115"
          stroke="#8E8E93"
          strokeWidth="1"
          strokeDasharray="3 2"
        />
        <line
          x1="113"
          y1="115"
          x2="176"
          y2="109"
          stroke="#8E8E93"
          strokeWidth="1"
          strokeDasharray="3 2"
        />
        <text x="92" y="138" textAnchor="middle" fontSize="10" fill="#6E6E73">
          Вид сзади (без среднего шва)
        </text>
      </g>
    </svg>
  );
}
