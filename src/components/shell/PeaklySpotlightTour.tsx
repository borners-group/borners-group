'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
  Layers,
  TrendingUp,
  FileText,
  Sparkles,
  Compass,
  ArrowLeft,
  ArrowRight,
  X,
} from 'lucide-react';
import { NavSectionId } from '@/types/platform';

export interface SpotlightStep {
  targetSelector: string;
  section?: NavSectionId;
  eyebrow: string;
  title: string;
  description: string;
  icon: 'brands' | 'scenarios' | 'passport' | 'studio' | 'sidebar';
  preferredPlacement?: 'bottom' | 'top' | 'right';
}

const SPOTLIGHT_STEPS: SpotlightStep[] = [
  {
    targetSelector: '[data-tour="brand-switcher"]',
    eyebrow: 'ВАШИ БРЕНДЫ',
    title: 'Все бренды — в одном переключателе',
    description:
      'Меняйте бренд здесь (BORNERS, НА ТЕЛЕ или весь портфель). Вся платформа мгновенно перестроит сценарии, модели и отчёты под выбранный бренд.',
    icon: 'brands',
    preferredPlacement: 'bottom',
  },
  {
    targetSelector: '[data-tour="growth-scenarios"]',
    section: 'dashboard',
    eyebrow: 'ГЛАВНОЕ ЧИСЛО И СЦЕНАРИИ',
    title: 'Начинайте со сценария выручки (100 / 150 / 200 млн ₽)',
    description:
      'Переключайте 3 стратегических плана развития в один клик — годовой оборот, объём продаж в штуках и инвестиции пересчитываются автоматически.',
    icon: 'scenarios',
    preferredPlacement: 'bottom',
  },
  {
    targetSelector: '[data-tour="model-passport"]',
    section: 'dashboard',
    eyebrow: 'ПАСПОРТ МОДЕЛИ И PDF',
    title: 'Карточка модели, план продаж и Конструктор PDF',
    description:
      'Нажмите на карточку модели, чтобы открыть её паспорт (Экран №2), цветовую палитру Pantone, Конструктор PDF и помесячный план продаж (Экран №3).',
    icon: 'passport',
    preferredPlacement: 'right',
  },
  {
    targetSelector: '[data-tour="studio-canvas"]',
    section: 'dashboard',
    eyebrow: 'СТУДИЯ ИДЕЙ · БЕСКОНЕЧНЫЙ ХОЛСТ',
    title: 'Прикрепляйте стикеры стрелочками, фото и голос',
    description:
      'Зажмите пустое место для бесконечного перемещения по холсту, тяните стрелочки от кружка ● на краю одного стикера к другому и записывайте голосовые заметки.',
    icon: 'studio',
    preferredPlacement: 'bottom',
  },
  {
    targetSelector: '[data-tour="sidebar-nav"]',
    eyebrow: 'ЦЕПОЧКА ПОТОКА И БЕНТО-АТЛАС',
    title: 'Навигация без боковой колонки: 4 контура и «Все разделы»',
    description:
      'Переключайтесь по цепочке 01 Продукт → 02 Продажи → 03 Закупки → 04 Финансы прямо в шапке или открывайте полный 4-колоночный Бенто-Атлас кнопкой «Все разделы» (⌘J).',
    icon: 'sidebar',
    preferredPlacement: 'bottom',
  },
];

interface PeaklySpotlightTourProps {
  open: boolean;
  stepIdx: number;
  setStepIdx: React.Dispatch<React.SetStateAction<number>>;
  onClose: () => void;
  activeSection: NavSectionId;
  onNavigateSection: (section: NavSectionId) => void;
}

export function PeaklySpotlightTour({
  open,
  stepIdx,
  setStepIdx,
  onClose,
  activeSection,
  onNavigateSection,
}: PeaklySpotlightTourProps) {
  const [rect, setRect] = useState<{
    top: number;
    left: number;
    width: number;
    height: number;
  } | null>(null);

  const currentStep = SPOTLIGHT_STEPS[stepIdx] || SPOTLIGHT_STEPS[0];
  const totalSteps = SPOTLIGHT_STEPS.length;

  const measureTarget = useCallback(() => {
    if (!open) return;
    const el = document.querySelector(currentStep.targetSelector) as HTMLElement | null;
    if (!el) {
      setRect(null);
      return;
    }
    const r = el.getBoundingClientRect();
    setRect({
      top: Math.round(r.top),
      left: Math.round(r.left),
      width: Math.round(r.width),
      height: Math.round(r.height),
    });
  }, [open, currentStep.targetSelector]);

  // При смене шага: при необходимости переключаем раздел и плавно скроллим к подсвечиваемому блоку
  useEffect(() => {
    if (!open) return;
    if (currentStep.section && activeSection !== currentStep.section) {
      onNavigateSection(currentStep.section);
    }

    if (typeof window !== 'undefined') {
      if (currentStep.icon === 'scenarios' || currentStep.icon === 'passport') {
        window.dispatchEvent(new Event('borners-reset-to-home-summary'));
        window.dispatchEvent(
          new CustomEvent('borners-set-home-subview', {
            detail: { subView: 'summary' },
          })
        );
      } else if (currentStep.icon === 'studio') {
        window.dispatchEvent(
          new CustomEvent('borners-set-home-subview', {
            detail: { subView: 'summary' },
          })
        );
      }
    }

    const timer0 = window.setTimeout(() => {
      if (currentStep.icon === 'studio') {
        const triggerBtn = document.querySelector(
          'button[data-tour="studio-canvas"]'
        ) as HTMLButtonElement | null;
        if (triggerBtn) {
          triggerBtn.click();
        }
      }
    }, 40);

    const timer1 = window.setTimeout(() => {
      const el = document.querySelector(currentStep.targetSelector) as HTMLElement | null;
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
      }
      measureTarget();
    }, 120);

    const timer2 = window.setTimeout(() => {
      measureTarget();
    }, 420);

    return () => {
      window.clearTimeout(timer0);
      window.clearTimeout(timer1);
      window.clearTimeout(timer2);
    };
  }, [open, stepIdx, currentStep, activeSection, onNavigateSection, measureTarget]);

  // Живое обновление координат рамки при скролле или ресайзе окна
  useEffect(() => {
    if (!open) return;
    const handleUpdate = () => {
      measureTarget();
    };
    window.addEventListener('scroll', handleUpdate, true);
    window.addEventListener('resize', handleUpdate);
    return () => {
      window.removeEventListener('scroll', handleUpdate, true);
      window.removeEventListener('resize', handleUpdate);
    };
  }, [open, measureTarget]);

  // Клавиатурная навигация (Escape, Стрелки Влево/Вправо)
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') {
        if (stepIdx < totalSteps - 1) setStepIdx((i) => i + 1);
        else onClose();
      }
      if (e.key === 'ArrowLeft' && stepIdx > 0) {
        setStepIdx((i) => i - 1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, stepIdx, totalSteps, setStepIdx, onClose]);

  if (!open) return null;

  // Отступ вокруг подсвечиваемого блока
  const pad = 8;
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800;

  const boxTop = rect ? Math.max(8, rect.top - pad) : 120;
  const boxLeft = rect ? Math.max(8, rect.left - pad) : 80;
  const boxWidth = rect ? Math.min(vw - boxLeft - 12, rect.width + pad * 2) : 280;
  const boxHeight = rect
    ? Math.min(vh - 48, rect.height + pad * 2)
    : 120;

  // Вычисляем позицию всплывающей карточки Peakly строго СНАРУЖИ подсвеченного элемента (без наложения!)
  const cardWidth = Math.min(384, vw - 32);
  const cardHeightEst = 256;
  const gap = 20;

  const clampX = (x: number) => Math.max(16, Math.min(vw - cardWidth - 16, x));
  const clampY = (y: number) => Math.max(16, Math.min(vh - cardHeightEst - 16, y));

  const canFitRight = boxLeft + boxWidth + gap + cardWidth <= vw - 12;
  const canFitBottom = boxTop + boxHeight + gap + cardHeightEst <= vh - 12;
  const canFitTop = boxTop - gap - cardHeightEst >= 12;
  const canFitLeft = boxLeft - gap - cardWidth >= 12;

  let cardTop = clampY(boxTop + boxHeight + gap);
  let cardLeft = clampX(boxLeft);

  if (currentStep.preferredPlacement === 'right' && canFitRight) {
    cardLeft = boxLeft + boxWidth + gap;
    cardTop = clampY(boxTop);
  } else if (currentStep.preferredPlacement === 'bottom' && canFitBottom) {
    cardTop = boxTop + boxHeight + gap;
    cardLeft = clampX(boxLeft);
  } else if (currentStep.preferredPlacement === 'top' && canFitTop) {
    cardTop = boxTop - cardHeightEst - gap;
    cardLeft = clampX(boxLeft);
  } else if (canFitRight) {
    cardLeft = boxLeft + boxWidth + gap;
    cardTop = clampY(boxTop);
  } else if (canFitBottom) {
    cardTop = boxTop + boxHeight + gap;
    cardLeft = clampX(boxLeft);
  } else if (canFitTop) {
    cardTop = boxTop - cardHeightEst - gap;
    cardLeft = clampX(boxLeft);
  } else if (canFitLeft) {
    cardLeft = boxLeft - cardWidth - gap;
    cardTop = clampY(boxTop);
  } else {
    // Если блок широкий и высокий — ставим карточку в правый нижний угол экрана с отступом
    cardLeft = vw - cardWidth - 24;
    cardTop = vh - cardHeightEst - 24;
  }

  const StepIcon =
    currentStep.icon === 'brands'
      ? Layers
      : currentStep.icon === 'scenarios'
      ? TrendingUp
      : currentStep.icon === 'passport'
      ? FileText
      : currentStep.icon === 'studio'
      ? Sparkles
      : Compass;

  return (
    <div className="fixed inset-0 z-[95] pointer-events-auto">
      {/* Кликабельный затемнённый фон вокруг подсвеченной области (клик в пустое место закрывает тур) */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-transparent cursor-pointer"
        aria-label="Закрыть обучение"
      />

      {/* ПОДСВЕЧЕННОЕ ОКНО-ВЫРЕЗ ПОВЕРХ РЕАЛЬНОГО ЭЛЕМЕНТА СТРАНИЦЫ (ТОЧНО КАК В PEAKLY) */}
      <div
        style={{
          top: `${boxTop}px`,
          left: `${boxLeft}px`,
          width: `${boxWidth}px`,
          height: `${boxHeight}px`,
          boxShadow:
            '0 0 0 9999px rgba(8, 10, 18, 0.78), 0 0 32px rgba(16, 185, 129, 0.55), inset 0 0 14px rgba(16, 185, 129, 0.22)',
        }}
        className="fixed rounded-[18px] border-2 border-[#10B981] pointer-events-none transition-all duration-300 ease-out"
      >
        {/* Светящаяся изумрудная точка в правом верхнем углу рамки */}
        <span className="absolute -top-1.5 -right-1.5 h-3 w-3 rounded-full bg-[#10B981] shadow-[0_0_12px_#10B981] ring-2 ring-[#0F172A]" />
      </div>

      {/* ВСПЛЫВАЮЩАЯ КАРТОЧКА ОБУЧЕНИЯ РЯДОМ С ПОДСВЕЧЕННЫМ ЭЛЕМЕНТОМ */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          top: `${cardTop}px`,
          left: `${cardLeft}px`,
          width: `${cardWidth}px`,
        }}
        className="fixed z-[100] rounded-[22px] bg-[#141824] border border-white/12 p-5 text-white shadow-[0_24px_64px_rgba(0,0,0,0.7),0_0_42px_rgba(16,185,129,0.20)] transition-all duration-300 ease-out space-y-4"
      >
        {/* Верхняя часть: Иконка в кружке + Изумрудный бейдж + Заголовок + Кнопка закрытия */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-full bg-emerald-500/15 border border-emerald-500/35 flex items-center justify-center text-emerald-400 shrink-0 mt-0.5">
              <StepIcon className="h-4 w-4" />
            </div>
            <div>
              <div className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.08em] text-emerald-400">
                <span>✦</span>
                <span>{currentStep.eyebrow}</span>
              </div>
              <h3 className="text-[16.5px] font-bold text-white leading-snug mt-0.5">
                {currentStep.title}
              </h3>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="h-7 w-7 rounded-lg text-[#64748B] hover:text-white hover:bg-white/10 flex items-center justify-center transition cursor-pointer shrink-0"
            title="Закрыть обучение"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Текст описания шага */}
        <p className="text-[13.5px] text-[#94A3B8] leading-relaxed">
          {currentStep.description}
        </p>

        {/* Сегментированная изумрудная полоса прогресса */}
        <div className="flex items-center gap-1.5 pt-0.5">
          {SPOTLIGHT_STEPS.map((_, idx) => {
            const isActive = idx === stepIdx;
            const isPassed = idx < stepIdx;
            return (
              <button
                key={idx}
                type="button"
                onClick={() => setStepIdx(idx)}
                className={`h-1.5 rounded-full transition-all cursor-pointer ${
                  isActive
                    ? 'w-11 bg-[#10B981] shadow-[0_0_10px_rgba(16,185,129,0.7)]'
                    : isPassed
                    ? 'w-8 bg-[#10B981]/55'
                    : 'w-8 bg-white/12 hover:bg-white/25'
                }`}
                aria-label={`Шаг ${idx + 1}`}
              />
            );
          })}
        </div>

        {/* Нижняя строка: Счётчик «1 из 5» + Кнопки «Назад» и «Далее →» */}
        <div className="flex items-center justify-between pt-1">
          <span className="text-[12.5px] font-medium text-[#94A3B8]">
            {stepIdx + 1} из {totalSteps}
          </span>

          <div className="flex items-center gap-2">
            {stepIdx > 0 && (
              <button
                type="button"
                onClick={() => setStepIdx((i) => Math.max(0, i - 1))}
                className="inline-flex items-center gap-1.5 h-9 px-4 rounded-full bg-[#1E2536] hover:bg-[#283147] border border-white/10 text-white text-[13px] font-semibold transition cursor-pointer"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                <span>Назад</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                if (stepIdx < totalSteps - 1) {
                  setStepIdx((i) => i + 1);
                } else {
                  onClose();
                }
              }}
              className="inline-flex items-center gap-1.5 h-9 px-5 rounded-full bg-white hover:bg-[#F8FAFC] text-[#0F172A] text-[13px] font-bold ring-2 ring-[#10B981] shadow-[0_0_18px_rgba(16,185,129,0.45)] transition cursor-pointer"
            >
              <span>{stepIdx < totalSteps - 1 ? 'Далее' : 'Готово'}</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
