'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  X,
  ZoomIn,
  ZoomOut,
  Maximize2,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  Move,
} from 'lucide-react';
import type { GalleryMediaItem } from '@/lib/scenarioData';

interface FullscreenPhotoLightboxProps {
  open: boolean;
  items: GalleryMediaItem[];
  activeId: string;
  modelCode: string;
  modelTitle: string;
  onSelectId: (id: string) => void;
  onClose: () => void;
}

function normalizePublicAssetUrl(url?: string): string {
  if (!url) return '';
  return url.replace(/^\/(images|docs)\//, '$1/');
}

export function FullscreenPhotoLightbox({
  open,
  items,
  activeId,
  modelCode,
  modelTitle,
  onSelectId,
  onClose,
}: FullscreenPhotoLightboxProps) {
  const [scale, setScale] = useState<number>(1);
  const [mode, setMode] = useState<'fit' | '100%' | 'custom'>('fit');
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [naturalDims, setNaturalDims] = useState<{ w: number; h: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const stageRef = useRef<HTMLDivElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const dragStartRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(
    null
  );
  const pinchStartRef = useRef<{ dist: number; startScale: number } | null>(null);

  const filteredItems = useMemo(
    () => items.filter((it) => Boolean(it.originalUrl || it.url)),
    [items]
  );

  const currentIndex = useMemo(() => {
    const idx = filteredItems.findIndex((it) => it.id === activeId);
    return idx >= 0 ? idx : 0;
  }, [filteredItems, activeId]);

  const currentItem = filteredItems[currentIndex] || filteredItems[0];
  const currentOriginalSrc = normalizePublicAssetUrl(
    currentItem?.originalUrl || currentItem?.url || ''
  );

  const resetToFit = useCallback(() => {
    setScale(1);
    setPan({ x: 0, y: 0 });
    setMode('fit');
  }, []);

  const setActual100Pct = useCallback(() => {
    const stage = stageRef.current;
    if (stage && naturalDims && naturalDims.w > 0 && naturalDims.h > 0) {
      const stageW = Math.max(320, stage.clientWidth - 48);
      const stageH = Math.max(240, stage.clientHeight - 48);
      const fitRatio = Math.min(stageW / naturalDims.w, stageH / naturalDims.h, 1);
      const targetScale = fitRatio > 0 ? Math.max(1, 1 / fitRatio) : 2;
      setScale(Math.round(targetScale * 100) / 100);
    } else {
      setScale(2);
    }
    setPan({ x: 0, y: 0 });
    setMode('100%');
  }, [naturalDims]);

  const adjustZoom = useCallback((delta: number) => {
    setScale((prev) => {
      const next = Math.min(6, Math.max(1, Math.round((prev + delta) * 100) / 100));
      if (next === 1) {
        setPan({ x: 0, y: 0 });
        setMode('fit');
      } else {
        setMode('custom');
      }
      return next;
    });
  }, []);

  const goPrev = useCallback(() => {
    if (filteredItems.length <= 1) return;
    const prevIdx = (currentIndex - 1 + filteredItems.length) % filteredItems.length;
    onSelectId(filteredItems[prevIdx].id);
    resetToFit();
  }, [filteredItems, currentIndex, onSelectId, resetToFit]);

  const goNext = useCallback(() => {
    if (filteredItems.length <= 1) return;
    const nextIdx = (currentIndex + 1) % filteredItems.length;
    onSelectId(filteredItems[nextIdx].id);
    resetToFit();
  }, [filteredItems, currentIndex, onSelectId, resetToFit]);

  // Закрытие по Esc и переключение стрелками на клавиатуре
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goPrev();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        goNext();
      } else if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        adjustZoom(0.35);
      } else if (e.key === '-') {
        e.preventDefault();
        adjustZoom(-0.35);
      } else if (e.key === '0') {
        e.preventDefault();
        resetToFit();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose, goPrev, goNext, adjustZoom, resetToFit]);

  if (!open || !currentItem) return null;

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const step = e.deltaY < 0 ? 0.25 : -0.25;
    adjustZoom(step);
  };

  const handleDoubleClick = () => {
    if (scale > 1.05) {
      resetToFit();
    } else {
      setScale(2.5);
      setPan({ x: 0, y: 0 });
      setMode('custom');
    }
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (scale <= 1) return;
    e.preventDefault();
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      panX: pan.x,
      panY: pan.y,
    };
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDragging || !dragStartRef.current) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    setPan({
      x: dragStartRef.current.panX + dx,
      y: dragStartRef.current.panY + dy,
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    dragStartRef.current = null;
  };

  // Поддержка iPad и телефонов: pinch-to-zoom двумя пальцами и перемещение одним пальцем
  const getTouchDist = (touches: React.TouchList) => {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.hypot(dx, dy);
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 2) {
      pinchStartRef.current = {
        dist: getTouchDist(e.touches),
        startScale: scale,
      };
      dragStartRef.current = null;
    } else if (e.touches.length === 1 && scale > 1) {
      dragStartRef.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
        panX: pan.x,
        panY: pan.y,
      };
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 2 && pinchStartRef.current) {
      e.preventDefault();
      const dist = getTouchDist(e.touches);
      const ratio = dist / Math.max(1, pinchStartRef.current.dist);
      const next = Math.min(
        6,
        Math.max(1, Math.round(pinchStartRef.current.startScale * ratio * 100) / 100)
      );
      setScale(next);
      setMode(next === 1 ? 'fit' : 'custom');
      if (next === 1) setPan({ x: 0, y: 0 });
    } else if (e.touches.length === 1 && dragStartRef.current && scale > 1) {
      e.preventDefault();
      const dx = e.touches[0].clientX - dragStartRef.current.x;
      const dy = e.touches[0].clientY - dragStartRef.current.y;
      setPan({
        x: dragStartRef.current.panX + dx,
        y: dragStartRef.current.panY + dy,
      });
    }
  };

  const handleTouchEnd = () => {
    pinchStartRef.current = null;
    dragStartRef.current = null;
  };

  const downloadFilename = `${modelCode.replace(/\s+/g, '_')}_${
    currentItem.category
  }_original.${currentOriginalSrc.split('.').pop()?.split('?')[0] || 'jpg'}`;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Просмотр оригинала фото ${modelCode} ${modelTitle}`}
      className="fixed inset-0 z-100 bg-[#111214]/95 backdrop-blur-md flex flex-col select-none"
    >
      {/* ВЕРХНЯЯ ПАНЕЛЬ УПРАВЛЕНИЯ */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 md:px-6 py-3 border-b border-white/10 bg-[#16171A]/90 text-white">
        <div className="min-w-0 flex items-center gap-2.5 text-[13px] text-white">
          <span className="font-mono font-semibold text-white">{modelCode}</span>
          <span className="text-white/40">·</span>
          <span className="truncate font-semibold">{modelTitle}</span>
          <span className="text-white/40">·</span>
          <span className="font-mono text-[12px] text-white/75">
            {currentIndex + 1} / {filteredItems.length}
            {naturalDims ? ` (${naturalDims.w}×${naturalDims.h})` : ''}
          </span>
        </div>

        {/* Инструменты масштаба + Оригинал + Закрытие */}
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => adjustZoom(-0.35)}
            disabled={scale <= 1}
            title="Уменьшить (-)"
            className="h-8 w-8 rounded-[9px] bg-white/10 hover:bg-white/20 disabled:opacity-40 flex items-center justify-center transition cursor-pointer"
          >
            <ZoomOut className="h-4 w-4" />
          </button>

          <span className="min-w-[54px] text-center text-[12px] font-mono font-semibold text-white">
            {Math.round(scale * 100)}%
          </span>

          <button
            type="button"
            onClick={() => adjustZoom(0.35)}
            disabled={scale >= 6}
            title="Увеличить (+)"
            className="h-8 w-8 rounded-[9px] bg-white/10 hover:bg-white/20 disabled:opacity-40 flex items-center justify-center transition cursor-pointer"
          >
            <ZoomIn className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={resetToFit}
            className={`h-8 px-2.5 rounded-[9px] text-[11.5px] font-semibold inline-flex items-center gap-1.5 transition cursor-pointer ${
              mode === 'fit'
                ? 'bg-white text-[#141413]'
                : 'bg-white/10 hover:bg-white/20 text-white'
            }`}
          >
            <Maximize2 className="h-3.5 w-3.5" />
            <span>По размеру экрана</span>
          </button>

          <button
            type="button"
            onClick={setActual100Pct}
            className={`h-8 px-2.5 rounded-[9px] text-[11.5px] font-semibold transition cursor-pointer ${
              mode === '100%'
                ? 'bg-white text-[#141413]'
                : 'bg-white/10 hover:bg-white/20 text-white'
            }`}
          >
            100%
          </button>

          <a
            href={currentOriginalSrc}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setActual100Pct()}
            className="h-8 px-2.5 rounded-[9px] bg-white/10 hover:bg-white/20 text-white text-[11.5px] font-semibold inline-flex items-center gap-1.5 transition"
            title="Показать исходное изображение без ограничения размера превью"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            <span>Открыть оригинал</span>
          </a>

          <a
            href={currentOriginalSrc}
            download={downloadFilename}
            className="h-8 px-2.5 rounded-[9px] bg-white/10 hover:bg-white/20 text-white text-[11.5px] font-semibold inline-flex items-center gap-1.5 transition"
            title="Скачать оригинальный файл без потери разрешения"
          >
            <Download className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Скачать</span>
          </a>

          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть просмотр (Esc)"
            className="h-8 px-3 rounded-[9px] bg-white/15 hover:bg-white/25 text-white text-[12px] font-semibold inline-flex items-center gap-1 ml-1 transition cursor-pointer"
          >
            <X className="h-4 w-4" />
            <span>Esc</span>
          </button>
        </div>
      </div>

      {/* ОСНОВНАЯ СЦЕНА ПРОСМОТРА ФОТО ЦЕЛИКОМ БЕЗ ОБРЕЗКИ */}
      <div
        ref={stageRef}
        onWheel={handleWheel}
        onDoubleClick={handleDoubleClick}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClick={(e) => {
          if (e.target === stageRef.current && scale === 1) {
            onClose();
          }
        }}
        className={`relative flex-1 overflow-hidden flex items-center justify-center p-4 md:p-8 touch-none ${
          scale > 1
            ? isDragging
              ? 'cursor-grabbing'
              : 'cursor-grab'
            : 'cursor-zoom-in'
        }`}
      >
        {filteredItems.length > 1 && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              goPrev();
            }}
            aria-label="Предыдущий кадр"
            className="absolute left-3 md:left-6 z-20 h-11 w-11 rounded-full bg-black/55 hover:bg-black/80 border border-white/15 text-white flex items-center justify-center transition cursor-pointer"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
        )}

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={imgRef}
          src={currentOriginalSrc}
          alt={currentItem.label}
          draggable={false}
          onLoad={(e) => {
            const el = e.currentTarget;
            setNaturalDims({ w: el.naturalWidth, h: el.naturalHeight });
          }}
          style={{
            transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${scale})`,
            transition: isDragging ? 'none' : 'transform 140ms ease-out',
          }}
          className="max-w-full max-h-full w-auto h-auto object-contain rounded-[8px] shadow-2xl pointer-events-auto"
        />

        {filteredItems.length > 1 && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              goNext();
            }}
            aria-label="Следующий кадр"
            className="absolute right-3 md:right-6 z-20 h-11 w-11 rounded-full bg-black/55 hover:bg-black/80 border border-white/15 text-white flex items-center justify-center transition cursor-pointer"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        )}

        {scale > 1 && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-black/65 text-white/85 text-[11px] inline-flex items-center gap-1.5 pointer-events-none">
            <Move className="h-3.5 w-3.5" />
            <span>Перетаскивайте изображение мышью или пальцем · двойной клик — сброс</span>
          </div>
        )}
      </div>

      {/* НИЖНЯЯ ЛЕНТА ЧИСТЫХ ФОТО-МИНИАТЮР */}
      {filteredItems.length > 1 && (
        <div className="px-4 md:px-6 py-2.5 border-t border-white/10 bg-[#16171A]/95 flex items-center justify-center gap-2 overflow-x-auto">
          {filteredItems.map((it, idx) => {
            const isAct = it.id === currentItem.id;
            const thumbSrc = normalizePublicAssetUrl(it.url || it.originalUrl || '');
            return (
              <button
                key={it.id}
                type="button"
                onClick={() => {
                  onSelectId(it.id);
                  resetToFit();
                }}
                aria-label={`Фото ${idx + 1}`}
                className={`shrink-0 rounded-[9px] p-1 border-[1.5px] transition cursor-pointer ${
                  isAct
                    ? 'bg-white/20 border-white'
                    : 'bg-white/5 border-white/15 opacity-70 hover:opacity-100 hover:bg-white/10'
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={thumbSrc}
                  alt={`${modelTitle} — фото ${idx + 1}`}
                  className="h-12 w-14 rounded-[6px] object-contain bg-[#F6F6F4]"
                />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
