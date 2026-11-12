'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
  Check,
  Plus,
  Image as ImageIcon,
  Mic,
  Square,
  Trash2,
  Move,
  Sparkles,
  ZoomIn,
  ZoomOut,
  Volume2,
  Upload,
  GitCommitHorizontal,
  Compass,
  X,
} from 'lucide-react';
import { usePlatform } from '@/context/PlatformContext';
import { MiroBoardItem } from '@/types/platform';
import { compressImageFileToDataUrl } from '@/lib/document-export';
import { resolvePublicAssetUrl } from '@/lib/scenarioData';
import { formatLabBrandLabel, normalizeLabBrandCode } from '@/lib/rndCatalogSync';

const STICKY_COLORS = [
  { hex: '#FFF8D6', label: 'Тёплый жёлтый' },
  { hex: '#FCE8DF', label: 'Терракота' },
  { hex: '#E6F4EE', label: 'Мятный зелёный' },
  { hex: '#EBF2FA', label: 'Небесный' },
  { hex: '#FAF8F5', label: 'Слоновая кость' },
];

// Компактный WAV-сигнал для демо-голосового сообщения, если микрофон недоступен
function createDemoVoiceWavDataUrl(): string {
  const sampleRate = 8000;
  const durationSec = 2;
  const numSamples = sampleRate * durationSec;
  const buffer = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(buffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + numSamples * 2, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, numSamples * 2, true);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const freq = t < 0.6 ? 440 : t < 1.2 ? 523.25 : 659.25;
    const env = Math.sin((Math.PI * (i % (sampleRate * 0.6))) / (sampleRate * 0.6));
    const sample = Math.sin(2 * Math.PI * freq * t) * env * 0.25;
    view.setInt16(44 + i * 2, sample * 32767, true);
  }

  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return `data:audio/wav;base64,${btoa(binary)}`;
}

function estimateCardHeight(item: MiroBoardItem): number {
  if (item.imageUrl) return 285;
  if (item.type === 'voice') return 215;
  if (item.linkedConceptId) return 225;
  return 195;
}

// Вычисляет оптимальные точки соединения между двумя карточками и кривую Безье
function computeArrowGeometry(source: MiroBoardItem, target: MiroBoardItem) {
  const sw = source.width || 290;
  const sh = estimateCardHeight(source);
  const tw = target.width || 290;
  const th = estimateCardHeight(target);

  const scx = source.x + sw / 2;
  const scy = source.y + sh / 2;
  const tcx = target.x + tw / 2;
  const tcy = target.y + th / 2;

  const dx = tcx - scx;
  const dy = tcy - scy;

  let x1 = scx;
  let y1 = scy;
  let x2 = tcx;
  let y2 = tcy;
  let cx1 = scx;
  let cy1 = scy;
  let cx2 = tcx;
  let cy2 = tcy;

  if (Math.abs(dx) >= Math.abs(dy) * 0.85) {
    // Горизонтальное соединение (справа -> слева или слева -> справа)
    if (dx >= 0) {
      x1 = source.x + sw;
      y1 = scy;
      x2 = target.x - 6;
      y2 = tcy;
    } else {
      x1 = source.x;
      y1 = scy;
      x2 = target.x + tw + 6;
      y2 = tcy;
    }
    const tension = Math.max(55, Math.min(180, Math.abs(x2 - x1) * 0.45));
    cx1 = dx >= 0 ? x1 + tension : x1 - tension;
    cy1 = y1;
    cx2 = dx >= 0 ? x2 - tension : x2 + tension;
    cy2 = y2;
  } else {
    // Вертикальное соединение (снизу -> сверху или сверху -> снизу)
    if (dy >= 0) {
      x1 = scx;
      y1 = source.y + sh;
      x2 = tcx;
      y2 = target.y - 6;
    } else {
      x1 = scx;
      y1 = source.y;
      x2 = tcx;
      y2 = target.y + th + 6;
    }
    const tension = Math.max(55, Math.min(180, Math.abs(y2 - y1) * 0.45));
    cx1 = x1;
    cy1 = dy >= 0 ? y1 + tension : y1 - tension;
    cx2 = x2;
    cy2 = dy >= 0 ? y2 - tension : y2 + tension;
  }

  const path = `M ${x1} ${y1} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${x2} ${y2}`;
  // Точка середины кривой Безье (t = 0.5) для кнопки удаления связи
  const midX = 0.125 * x1 + 0.375 * cx1 + 0.375 * cx2 + 0.125 * x2;
  const midY = 0.125 * y1 + 0.375 * cy1 + 0.375 * cy2 + 0.125 * y2;

  return { path, midX, midY, x1, y1, x2, y2 };
}

export function MiroBoardView() {
  const {
    miroItems,
    createMiroItem,
    updateMiroItem,
    deleteMiroItem,
    concepts,
    brandFilter,
    navigateTo,
    notify,
  } = usePlatform();

  // Состояние бесконечного холста (панорамирование pan + зум)
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 20, y: 16 });
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const [panStart, setPanStart] = useState<{
    clientX: number;
    clientY: number;
    panX: number;
    panY: number;
  }>({ clientX: 0, clientY: 0, panX: 0, panY: 0 });

  // Перетаскивание карточек по бесконечному холсту
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState<{ dx: number; dy: number }>({ dx: 0, dy: 0 });
  const [selectedConceptToPin, setSelectedConceptToPin] = useState<string>('');

  // Связи стрелочками (клик-режим + перетаскивание стрелки от точки к карточке)
  const [connectingSourceId, setConnectingSourceId] = useState<string | null>(null);
  const [draggingArrowFromId, setDraggingArrowFromId] = useState<string | null>(null);
  const [arrowCursorWorld, setArrowCursorWorld] = useState<{ x: number; y: number } | null>(null);

  // Запись голосового сообщения (MediaRecorder)
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSec, setRecordingSec] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);

  const visibleItems = (miroItems || []).filter(
    (item) =>
      brandFilter === 'ALL' ||
      item.brandId === 'ALL' ||
      normalizeLabBrandCode(item.brandId) === normalizeLabBrandCode(brandFilter)
  );

  // Перевод экранных координат мыши в мировые координаты бесконечного холста
  const screenToWorld = (clientX: number, clientY: number) => {
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: (clientX - rect.left - pan.x) / zoom,
      y: (clientY - rect.top - pan.y) / zoom,
    };
  };

  // Вычисление свободной позиции для новой карточки в текущей видимой области бесконечного холста
  const getNextCoordinates = () => {
    const count = visibleItems.length;
    const col = count % 3;
    const row = Math.floor(count / 3);
    const baseWorldX = Math.round(-pan.x / zoom);
    const baseWorldY = Math.round(-pan.y / zoom);
    return {
      x: baseWorldX + 40 + col * 330 + ((count * 19) % 35),
      y: baseWorldY + 40 + row * 250 + ((count * 15) % 30),
    };
  };

  // Создание или удаление стрелки между двумя карточками
  const toggleArrowConnection = (sourceId: string, targetId: string) => {
    if (!sourceId || !targetId || sourceId === targetId) return;
    const sourceItem = (miroItems || []).find((m) => m.id === sourceId);
    const targetItem = (miroItems || []).find((m) => m.id === targetId);
    if (!sourceItem || !targetItem) return;

    const currentLinks = sourceItem.connectedToIds || [];
    const exists = currentLinks.includes(targetId);
    const nextLinks = exists
      ? currentLinks.filter((id) => id !== targetId)
      : [...currentLinks, targetId];

    updateMiroItem(sourceId, { connectedToIds: nextLinks });
    notify(
      'success',
      exists
        ? `Стрелка между «${sourceItem.title}» и «${targetItem.title}» удалена`
        : `Прикреплена стрелка: «${sourceItem.title}» ➔ «${targetItem.title}»`
    );
  };

  const removeArrowConnection = (sourceId: string, targetId: string) => {
    const sourceItem = (miroItems || []).find((m) => m.id === sourceId);
    if (!sourceItem) return;
    updateMiroItem(sourceId, {
      connectedToIds: (sourceItem.connectedToIds || []).filter((id) => id !== targetId),
    });
    notify('warning', 'Связь-стрелка удалена');
  };

  const handleAddSticky = (color = '#FFF8D6') => {
    const pos = getNextCoordinates();
    createMiroItem({
      type: 'sticky',
      title: 'Новая заметка в Студии',
      content: 'Запишите идею, комментарий по образцу или свяжите стрелочкой с соседней карточкой...',
      brandId: brandFilter === 'ALL' ? 'ALL' : brandFilter,
      color,
      x: pos.x,
      y: pos.y,
      width: 290,
      connectedToIds: [],
    });
    notify('success', 'Стикер добавлен на бесконечный холст Студии');
  };

  const handleUploadPhotos = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const compressedUrls: string[] = [];
    for (const file of files) {
      const url = await compressImageFileToDataUrl(file, 680, 0.78);
      if (url) compressedUrls.push(url);
    }

    if (compressedUrls.length > 0) {
      const pos = getNextCoordinates();
      createMiroItem({
        type: 'photo',
        title:
          files.length === 1
            ? files[0].name.replace(/\.[^/.]+$/, '')
            : `Подборка фото (${files.length} шт.)`,
        content: 'Визуальный референс / фотография образца на холсте',
        brandId: brandFilter === 'ALL' ? 'ALL' : brandFilter,
        color: '#FAF8F5',
        x: pos.x,
        y: pos.y,
        width: 310,
        imageUrl: compressedUrls[0],
        galleryUrls: compressedUrls,
        connectedToIds: [],
      });
      notify(
        'success',
        `Добавлено фотографий в Студию идей: ${compressedUrls.length}`
      );
    }
    e.target.value = '';
  };

  const startVoiceRecording = async () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const recorder = new MediaRecorder(stream);
        audioChunksRef.current = [];

        recorder.ondataavailable = (ev) => {
          if (ev.data.size > 0) audioChunksRef.current.push(ev.data);
        };

        recorder.onstop = () => {
          stream.getTracks().forEach((t) => t.stop());
          const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          const reader = new FileReader();
          reader.onload = () => {
            const dataUrl = typeof reader.result === 'string' ? reader.result : '';
            const pos = getNextCoordinates();
            createMiroItem({
              type: 'voice',
              title: `Голосовая заметка (${recordingSec || 3} сек.)`,
              content: 'Аудиокомментарий по продукту / правкам лекала и образца',
              brandId: brandFilter === 'ALL' ? 'ALL' : brandFilter,
              color: '#EBF2FA',
              x: pos.x,
              y: pos.y,
              width: 300,
              audioDataUrl: dataUrl || createDemoVoiceWavDataUrl(),
              audioDurationSec: recordingSec || 3,
              connectedToIds: [],
            });
            notify('success', 'Голосовое сообщение сохранено в Студии идей');
          };
          reader.readAsDataURL(blob);
        };

        mediaRecorderRef.current = recorder;
        recorder.start();
        setIsRecording(true);
        setRecordingSec(0);
        timerRef.current = window.setInterval(() => {
          setRecordingSec((s) => s + 1);
        }, 1000);
        return;
      }
    } catch {
      // Fallback: если доступ к микрофону запрещён в браузере, создаём демо-голосовое
    }

    const pos = getNextCoordinates();
    createMiroItem({
      type: 'voice',
      title: 'Голосовое сообщение (Демо-запись 00:02)',
      content: 'Комментарий руководителя по посадке пояса и отбору фабрики',
      brandId: brandFilter === 'ALL' ? 'ALL' : brandFilter,
      color: '#EBF2FA',
      x: pos.x,
      y: pos.y,
      width: 300,
      audioDataUrl: createDemoVoiceWavDataUrl(),
      audioDurationSec: 2,
      connectedToIds: [],
    });
    notify(
      'success',
      'Голосовая карточка добавлена на холст',
      'Можно прослушать прямо на доске и связать стрелочкой с карточкой модели'
    );
  };

  const stopVoiceRecording = () => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  };

  const handleUploadAudioFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : '';
      if (!dataUrl) return;
      const pos = getNextCoordinates();
      createMiroItem({
        type: 'voice',
        title: `Аудио: ${file.name.replace(/\.[^/.]+$/, '')}`,
        content: 'Прикреплённое голосовое сообщение / аудиозапись обсуждения',
        brandId: brandFilter === 'ALL' ? 'ALL' : brandFilter,
        color: '#EBF2FA',
        x: pos.x,
        y: pos.y,
        width: 300,
        audioDataUrl: dataUrl,
        connectedToIds: [],
      });
      notify('success', `Голосовой файл «${file.name}» добавлен в Студию идей`);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handlePinConcept = (conceptId: string) => {
    const c = concepts.find((x) => x.id === conceptId);
    if (!c) return;
    const pos = getNextCoordinates();
    createMiroItem({
      type: 'concept_link',
      title: `${c.code} · ${c.name}`,
      content: c.whatAttracted || c.ideaDescription || 'Карточка разработки R&D',
      brandId: c.brandId,
      color: '#E6F4EE',
      x: pos.x,
      y: pos.y,
      width: 300,
      imageUrl: c.imageUrl,
      linkedConceptId: c.id,
      connectedToIds: [],
    });
    setSelectedConceptToPin('');
    notify('success', `Карточка ${c.code} закреплена в Студии идей`);
  };

  // Нажатие на пустое место бесконечного холста -> панорамирование
  const handleMouseDownViewport = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget && !(e.target as HTMLElement).dataset.canvasBg) {
      return;
    }
    if (connectingSourceId) {
      setConnectingSourceId(null);
    }
    setIsPanning(true);
    setPanStart({
      clientX: e.clientX,
      clientY: e.clientY,
      panX: pan.x,
      panY: pan.y,
    });
  };

  // Колесо мыши / тачпад: с Ctrl/Cmd масштабирует, без — свободно двигает бесконечный холст
  // и блокирует случайный жест Назад/Вперёд в браузере или между этапами
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onNativeWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.ctrlKey || e.metaKey) {
        const delta = e.deltaY < 0 ? 0.08 : -0.08;
        setZoom((z) => Math.max(0.5, Math.min(1.5, Number((z + delta).toFixed(2)))));
      } else {
        setPan((prev) => ({
          x: prev.x - e.deltaX,
          y: prev.y - e.deltaY,
        }));
      }
    };
    el.addEventListener('wheel', onNativeWheel, { passive: false });
    return () => el.removeEventListener('wheel', onNativeWheel);
  }, []);

  // Нажатие на карточку: либо завершает проведение стрелки, либо начинает перетаскивание карточки
  const handleMouseDownCard = (e: React.MouseEvent, item: MiroBoardItem) => {
    e.stopPropagation();

    // Если активен режим связывания стрелкой — клик по другой карточке соединяет их!
    if (connectingSourceId && connectingSourceId !== item.id) {
      toggleArrowConnection(connectingSourceId, item.id);
      setConnectingSourceId(null);
      return;
    }

    const tag = (e.target as HTMLElement).tagName;
    if (
      tag === 'INPUT' ||
      tag === 'TEXTAREA' ||
      tag === 'BUTTON' ||
      tag === 'AUDIO' ||
      (e.target as HTMLElement).closest('button')
    ) {
      return;
    }

    const worldPos = screenToWorld(e.clientX, e.clientY);
    setDraggingId(item.id);
    setDragOffset({ dx: worldPos.x - item.x, dy: worldPos.y - item.y });
  };

  // Начало перетаскивания стрелки от узловой точки карточки
  const handleStartDragArrow = (e: React.MouseEvent, sourceId: string) => {
    e.stopPropagation();
    e.preventDefault();
    const worldPos = screenToWorld(e.clientX, e.clientY);
    setDraggingArrowFromId(sourceId);
    setArrowCursorWorld(worldPos);
  };

  // Завершение перетаскивания стрелки на целевой карточке
  const handleMouseUpOnCard = (e: React.MouseEvent, targetItem: MiroBoardItem) => {
    if (draggingArrowFromId && draggingArrowFromId !== targetItem.id) {
      e.stopPropagation();
      toggleArrowConnection(draggingArrowFromId, targetItem.id);
      setDraggingArrowFromId(null);
      setArrowCursorWorld(null);
    }
  };

  const handleMouseMoveViewport = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isPanning) {
      const dx = e.clientX - panStart.clientX;
      const dy = e.clientY - panStart.clientY;
      setPan({
        x: Math.round(panStart.panX + dx),
        y: Math.round(panStart.panY + dy),
      });
      return;
    }

    if (draggingArrowFromId) {
      setArrowCursorWorld(screenToWorld(e.clientX, e.clientY));
      return;
    }

    if (draggingId) {
      const worldPos = screenToWorld(e.clientX, e.clientY);
      // Бесконечные координаты без жёстких границ
      const nextX = Math.round(worldPos.x - dragOffset.dx);
      const nextY = Math.round(worldPos.y - dragOffset.dy);
      updateMiroItem(draggingId, { x: nextX, y: nextY });
    }
  };

  const handleMouseUpViewport = () => {
    if (isPanning) setIsPanning(false);
    if (draggingId) setDraggingId(null);
    if (draggingArrowFromId) {
      setDraggingArrowFromId(null);
      setArrowCursorWorld(null);
    }
  };

  // Центрирование бесконечного холста по всем карточкам
  const handleCenterCanvas = () => {
    if (visibleItems.length === 0) {
      setPan({ x: 20, y: 16 });
      setZoom(1);
      return;
    }
    const minX = Math.min(...visibleItems.map((i) => i.x));
    const minY = Math.min(...visibleItems.map((i) => i.y));
    setPan({ x: Math.round(40 - minX), y: Math.round(36 - minY) });
    setZoom(1);
  };

  // Список всех пар соединённых стрелками карточек
  const arrowLinks: Array<{
    source: MiroBoardItem;
    target: MiroBoardItem;
    geometry: ReturnType<typeof computeArrowGeometry>;
  }> = [];

  for (const source of visibleItems) {
    for (const targetId of source.connectedToIds || []) {
      const target = visibleItems.find((x) => x.id === targetId);
      if (target && target.id !== source.id) {
        arrowLinks.push({
          source,
          target,
          geometry: computeArrowGeometry(source, target),
        });
      }
    }
  }

  // Геометрия живой тянущейся стрелки при перетаскивании мышью
  const activeDragSource = draggingArrowFromId
    ? visibleItems.find((x) => x.id === draggingArrowFromId)
    : null;

  return (
    <div
      data-no-swipe-nav="true"
      className="rounded-[16px] bg-white border-2 border-[#181715] overflow-hidden shadow-xs overscroll-contain"
    >
      {/* ПАНЕЛЬ ИНСТРУМЕНТОВ СТУДИИ ИДЕЙ (БЕСКОНЕЧНЫЙ ХОЛСТ) */}
      <div
        data-tour="studio-canvas"
        className="px-5 py-4 bg-[#FAF8F5] border-b-2 border-[#181715] flex flex-wrap items-center justify-between gap-3"
      >
        <div>
          <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-wider text-[#B85D35] font-semibold">
            <span>КРЕАТИВНАЯ СТУДИЯ · БЕСКОНЕЧНЫЙ ХОЛСТ И СВЯЗИ</span>
          </div>
          <h2 className="font-serif-editorial text-[24px] font-semibold text-[#181715] leading-tight">
            Студия идей: бесконечная доска со стрелочками, фото и голосом
          </h2>
        </div>

        {/* Кнопки инструментов холста */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => handleAddSticky('#FFF8D6')}
            className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-[8px] bg-[#181715] hover:bg-[#2C2B29] text-white text-[12.5px] font-semibold transition cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>+ Стикер</span>
          </button>

          <label className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-[8px] bg-white hover:bg-[#F3EFE8] text-[#181715] border-[1.5px] border-[#181715] text-[12.5px] font-semibold transition cursor-pointer">
            <ImageIcon className="h-3.5 w-3.5 text-[#B85D35]" />
            <span>+ Фото (1–10)</span>
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={handleUploadPhotos}
              className="hidden"
            />
          </label>

          {/* Кнопка записи голосового сообщения */}
          {!isRecording ? (
            <button
              type="button"
              onClick={startVoiceRecording}
              className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-[8px] bg-[#B85D35] hover:bg-[#9E4B27] text-white text-[12.5px] font-semibold transition cursor-pointer"
            >
              <Mic className="h-3.5 w-3.5" />
              <span>+ Записать голос</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={stopVoiceRecording}
              className="inline-flex items-center gap-2 h-9 px-3.5 rounded-[8px] bg-[#C94B4B] text-white text-[12.5px] font-bold animate-pulse cursor-pointer"
            >
              <Square className="h-3.5 w-3.5 fill-current" />
              <span>Стоп ({recordingSec} сек.) — сохранить</span>
            </button>
          )}

          {/* Загрузка готового голосового файла */}
          <label
            title="Загрузить голосовое из Telegram / телефона (.ogg, .mp3, .wav, .m4a)"
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-[8px] bg-white hover:bg-[#F3EFE8] text-[#181715] border-[1.5px] border-[#CFC8BC] hover:border-[#181715] text-[12px] font-medium transition cursor-pointer"
          >
            <Upload className="h-3.5 w-3.5 text-[#5C5852]" />
            <span>Аудиофайл</span>
            <input
              type="file"
              accept="audio/*"
              onChange={handleUploadAudioFile}
              className="hidden"
            />
          </label>

          {/* Закрепить карточку R&D */}
          <select
            value={selectedConceptToPin}
            onChange={(e) => {
              if (e.target.value) handlePinConcept(e.target.value);
            }}
            className="h-9 rounded-[8px] bg-white border-[1.5px] border-[#CFC8BC] hover:border-[#181715] px-2.5 text-[12px] font-medium text-[#181715] cursor-pointer max-w-[195px]"
          >
            <option value="">+ Карточка R&amp;D...</option>
            {concepts
              .filter(
                (c) =>
                  !c.isArchived &&
                  (brandFilter === 'ALL' ||
                    normalizeLabBrandCode(c.brandId) === normalizeLabBrandCode(brandFilter))
              )
              .map((c) => (
                <option key={c.id} value={c.id}>
                  [{formatLabBrandLabel(c.brandId)}] {c.code} · {c.name}
                </option>
              ))}
          </select>

          {/* Управление бесконечным холстом и масштабом */}
          <div className="inline-flex items-center rounded-[8px] border-[1.5px] border-[#CFC8BC] bg-white p-0.5">
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(0.5, Number((z - 0.1).toFixed(2))))}
              className="p-1.5 text-[#5C5852] hover:text-[#181715] cursor-pointer"
              title="Отдалить холст"
            >
              <ZoomOut className="h-3.5 w-3.5" />
            </button>
            <span className="px-2 font-mono text-[11px] font-semibold text-[#181715]">
              {Math.round(zoom * 100)}%
            </span>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(1.5, Number((z + 0.1).toFixed(2))))}
              className="p-1.5 text-[#5C5852] hover:text-[#181715] cursor-pointer"
              title="Приблизить холст"
            >
              <ZoomIn className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={handleCenterCanvas}
              className="px-2 py-1 text-[11px] font-semibold text-[#5C5852] hover:text-[#181715] border-l border-[#E5E0D8] inline-flex items-center gap-1 cursor-pointer"
              title="Вернуться к центру карточек на бесконечном холсте"
            >
              <Compass className="h-3.5 w-3.5 text-[#B85D35]" />
              <span>Центр</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() =>
              notify(
                'success',
                '✓ Все карточки и связи на доске сохранены',
                `Карточек на холсте: ${visibleItems.length} · Связей: ${arrowLinks.length}`
              )
            }
            className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-[8px] bg-[#16805D] hover:bg-[#116649] text-white text-[12.5px] font-semibold transition cursor-pointer shadow-2xs"
          >
            <Check className="h-3.5 w-3.5" />
            <span>Сохранить доску</span>
          </button>
        </div>
      </div>

      {/* ПОДСКАЗКА ПО БЕСКОНЕЧНОМУ ХОЛСТУ И СТРЕЛОЧКАМ */}
      <div className="px-5 py-2 bg-[#F3EFE8] border-b border-[#D8D1C5] flex flex-wrap items-center justify-between gap-2 text-[12px] text-[#4A4742]">
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-1.5 font-medium text-[#181715]">
            <GitCommitHorizontal className="h-4 w-4 text-[#B85D35]" />
            <span>
              <strong>Как прикрепить стрелочку:</strong> потяните за кружок{' '}
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#B85D35] align-middle mx-0.5" />{' '}
              на краю любой карточки к другой карточке или нажмите <strong>«↗ Стрелка»</strong> в шапке стикера.
            </span>
          </span>
          {connectingSourceId && (
            <span className="inline-flex items-center gap-2 rounded-full bg-[#B85D35] text-white px-3 py-0.5 text-[11.5px] font-semibold animate-pulse">
              <span>Выберите карточку, к которой прикрепить стрелку...</span>
              <button
                type="button"
                onClick={() => setConnectingSourceId(null)}
                className="underline cursor-pointer"
              >
                Отмена
              </button>
            </span>
          )}
        </div>
        <div className="font-mono text-[11px] text-[#6E6A63]">
          Бесконечный холст (зажмите пустое место для перемещения) · X:{Math.round(-pan.x)} Y:{Math.round(-pan.y)} · Связей: {arrowLinks.length}
        </div>
      </div>

      {/* БЕСКОНЕЧНЫЙ ХОЛСТ С ТОЧЕЧНОЙ СЕТКОЙ, СТРЕЛКАМИ SVG И КАРТОЧКАМИ */}
      <div
        ref={viewportRef}
        data-canvas-bg="true"
        data-no-swipe-nav="true"
        onMouseDown={handleMouseDownViewport}
        onMouseMove={handleMouseMoveViewport}
        onMouseUp={handleMouseUpViewport}
        onMouseLeave={handleMouseUpViewport}
        style={{
          backgroundImage:
            'radial-gradient(circle, #BDB5A6 1.35px, transparent 1.35px)',
          backgroundSize: `${24 * zoom}px ${24 * zoom}px`,
          backgroundPosition: `${pan.x}px ${pan.y}px`,
        }}
        className={`relative w-full h-[680px] overflow-hidden overscroll-contain bg-[#F4F1EA] select-none ${
          isPanning
            ? 'cursor-grabbing'
            : connectingSourceId || draggingArrowFromId
            ? 'cursor-crosshair'
            : 'cursor-grab'
        }`}
      >
        {/* Мировой трансформируемый слой бесконечного холста */}
        <div
          data-canvas-bg="true"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: '0 0',
          }}
          className="absolute inset-0 pointer-events-none"
        >
          {/* SVG-СЛОЙ СОЕДИНИТЕЛЬНЫХ СТРЕЛОЧЕК МЕЖДУ КАРТОЧКАМИ */}
          <svg
            className="overflow-visible absolute top-0 left-0 pointer-events-none"
            width={1}
            height={1}
            style={{ zIndex: 25 }}
          >
            <defs>
              <marker
                id="studio-arrowhead"
                markerWidth="10"
                markerHeight="8"
                refX="8"
                refY="4"
                orient="auto"
              >
                <path d="M 0 0 L 10 4 L 0 8 z" fill="#B85D35" />
              </marker>
              <marker
                id="studio-arrowhead-active"
                markerWidth="10"
                markerHeight="8"
                refX="8"
                refY="4"
                orient="auto"
              >
                <path d="M 0 0 L 10 4 L 0 8 z" fill="#181715" />
              </marker>
            </defs>

            {/* Постоянные стрелки между карточками */}
            {arrowLinks.map(({ source, target, geometry }) => (
              <g key={`${source.id}->${target.id}`} className="group pointer-events-auto">
                {/* Широкая прозрачная дорожка для удобного наведения */}
                <path
                  d={geometry.path}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={16}
                  className="cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeArrowConnection(source.id, target.id);
                  }}
                />
                {/* Видимая кривая стрелка */}
                <path
                  d={geometry.path}
                  fill="none"
                  stroke="#B85D35"
                  strokeWidth={2.75}
                  markerEnd="url(#studio-arrowhead)"
                  className="transition-all group-hover:stroke-[#181715]"
                />
                {/* Начальная точка стрелки */}
                <circle
                  cx={geometry.x1}
                  cy={geometry.y1}
                  r={4.5}
                  fill="#FAF8F5"
                  stroke="#B85D35"
                  strokeWidth={2.5}
                />
                {/* Кнопка удаления стрелки посередине дуги */}
                <g
                  transform={`translate(${geometry.midX}, ${geometry.midY})`}
                  className="cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeArrowConnection(source.id, target.id);
                  }}
                >
                  <title>Удалить эту стрелку</title>
                  <circle
                    r={10}
                    fill="#FAF8F5"
                    stroke="#B85D35"
                    strokeWidth={1.75}
                    className="group-hover:fill-[#B93829] group-hover:stroke-[#B93829] transition-colors"
                  />
                  <text
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize="10"
                    fontWeight="bold"
                    fill="#B85D35"
                    className="group-hover:fill-white select-none"
                  >
                    ✕
                  </text>
                </g>
              </g>
            ))}

            {/* Живая пунктирная стрелка во время перетаскивания от точки карточки */}
            {activeDragSource && arrowCursorWorld && (
              <path
                d={`M ${activeDragSource.x + (activeDragSource.width || 290) / 2} ${
                  activeDragSource.y + estimateCardHeight(activeDragSource) / 2
                } L ${arrowCursorWorld.x} ${arrowCursorWorld.y}`}
                fill="none"
                stroke="#181715"
                strokeWidth={2.5}
                strokeDasharray="6 4"
                markerEnd="url(#studio-arrowhead-active)"
              />
            )}
          </svg>

          {/* КАРТОЧКИ НА БЕСКОНЕЧНОМ ХОЛСТЕ */}
          {visibleItems.map((item) => {
            const isConnectSource = connectingSourceId === item.id;
            const isConnectTargetCandidate =
              Boolean(connectingSourceId && connectingSourceId !== item.id) ||
              Boolean(draggingArrowFromId && draggingArrowFromId !== item.id);

            return (
              <div
                key={item.id}
                onMouseDown={(e) => handleMouseDownCard(e, item)}
                onMouseUp={(e) => handleMouseUpOnCard(e, item)}
                style={{
                  left: `${item.x}px`,
                  top: `${item.y}px`,
                  width: `${item.width || 290}px`,
                  backgroundColor: item.color || '#FFF8D6',
                }}
                className={`group/card pointer-events-auto absolute rounded-[14px] border-2 p-4 space-y-2.5 transition-shadow ${
                  draggingId === item.id
                    ? 'border-[#181715] shadow-2xl z-30 cursor-grabbing'
                    : isConnectSource
                    ? 'border-[#B85D35] ring-4 ring-[#B85D35]/30 shadow-xl z-30'
                    : isConnectTargetCandidate
                    ? 'border-[#B85D35] hover:ring-4 hover:ring-[#B85D35]/40 shadow-lg z-20 cursor-pointer'
                    : 'border-[#181715]/85 hover:border-[#181715] shadow-md z-10 cursor-grab'
                }`}
              >
                {/* 4 УЗЛОВЫЕ ТОЧКИ ПО КРАЯМ КАРТОЧКИ ДЛЯ ПЕРЕТАСКИВАНИЯ СТРЕЛОЧЕК */}
                <button
                  type="button"
                  onMouseDown={(e) => handleStartDragArrow(e, item.id)}
                  title="Потяните отсюда стрелку к другой карточке"
                  className=" -top-2.5 left-1/2 -translate-x-1/2 absolute h-5 w-5 rounded-full bg-white border-2 border-[#B85D35] hover:bg-[#B85D35] hover:scale-125 transition flex items-center justify-center shadow-xs z-30 cursor-crosshair"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-[#B85D35]" />
                </button>
                <button
                  type="button"
                  onMouseDown={(e) => handleStartDragArrow(e, item.id)}
                  title="Потяните отсюда стрелку к другой карточке"
                  className="-right-2.5 top-1/2 -translate-y-1/2 absolute h-5 w-5 rounded-full bg-white border-2 border-[#B85D35] hover:bg-[#B85D35] hover:scale-125 transition flex items-center justify-center shadow-xs z-30 cursor-crosshair"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-[#B85D35]" />
                </button>
                <button
                  type="button"
                  onMouseDown={(e) => handleStartDragArrow(e, item.id)}
                  title="Потяните отсюда стрелку к другой карточке"
                  className="-bottom-2.5 left-1/2 -translate-x-1/2 absolute h-5 w-5 rounded-full bg-white border-2 border-[#B85D35] hover:bg-[#B85D35] hover:scale-125 transition flex items-center justify-center shadow-xs z-30 cursor-crosshair"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-[#B85D35]" />
                </button>
                <button
                  type="button"
                  onMouseDown={(e) => handleStartDragArrow(e, item.id)}
                  title="Потяните отсюда стрелку к другой карточке"
                  className="-left-2.5 top-1/2 -translate-y-1/2 absolute h-5 w-5 rounded-full bg-white border-2 border-[#B85D35] hover:bg-[#B85D35] hover:scale-125 transition flex items-center justify-center shadow-xs z-30 cursor-crosshair"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-[#B85D35]" />
                </button>

                {/* Верхняя полоска карточки */}
                <div className="flex items-center justify-between gap-1.5 border-b border-black/10 pb-2">
                  <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider font-bold text-[#4A4742]">
                    <Move className="h-3 w-3" />
                    <span>
                      {item.type === 'sticky'
                        ? 'СТИКЕР'
                        : item.type === 'photo'
                        ? 'ФОТО / МУДБОРД'
                        : item.type === 'voice'
                        ? 'ГОЛОСОВОЕ'
                        : 'КАРТОЧКА R&D'}
                    </span>
                  </span>

                  <div className="flex items-center gap-1">
                    {/* Кнопка быстрого прикрепления стрелки в 1 клик */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setConnectingSourceId((prev) =>
                          prev === item.id ? null : item.id
                        );
                      }}
                      className={`px-2 py-0.5 rounded-[5px] text-[10.5px] font-bold transition cursor-pointer inline-flex items-center gap-1 ${
                        isConnectSource
                          ? 'bg-[#B85D35] text-white'
                          : 'bg-white/80 hover:bg-[#181715] text-[#181715] hover:text-white border border-black/20'
                      }`}
                      title="Прикрепить стрелочкой к другой карточке"
                    >
                      <span>↗ Стрелка</span>
                    </button>

                    {item.type === 'sticky' &&
                      STICKY_COLORS.map((c) => (
                        <button
                          key={c.hex}
                          type="button"
                          onClick={() => updateMiroItem(item.id, { color: c.hex })}
                          style={{ backgroundColor: c.hex }}
                          className="h-3.5 w-3.5 rounded-full border border-black/30 cursor-pointer"
                          title={c.label}
                        />
                      ))}
                    <button
                      type="button"
                      onClick={() => deleteMiroItem(item.id)}
                      className="p-1 text-[#6E6A63] hover:text-[#B93829] cursor-pointer"
                      title="Удалить с холста"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {/* Заголовок карточки (редактируемый) */}
                <input
                  value={item.title}
                  onChange={(e) => updateMiroItem(item.id, { title: e.target.value })}
                  className="w-full bg-transparent text-[14.5px] font-bold text-[#181715] outline-none border-b border-transparent focus:border-black/25 pb-0.5"
                />

                {/* Фотография или галерея, если это фото-карточка */}
                {item.imageUrl && (
                  <div className="rounded-[10px] bg-white border border-black/15 p-2 space-y-2">
                    <img
                      src={resolvePublicAssetUrl(item.imageUrl)}
                      alt={item.title}
                      loading="lazy"
                      decoding="async"
                      className="w-full h-36 object-contain rounded-[6px] bg-[#FAF8F5]"
                    />
                    {item.galleryUrls && item.galleryUrls.length > 1 && (
                      <div className="flex items-center gap-1.5 overflow-x-auto pt-1">
                        {item.galleryUrls.map((u, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => updateMiroItem(item.id, { imageUrl: u })}
                            className={`h-9 w-9 rounded border overflow-hidden shrink-0 cursor-pointer ${
                              item.imageUrl === u
                                ? 'border-[#B85D35] border-2'
                                : 'border-black/15'
                            }`}
                          >
                            <img
                              src={resolvePublicAssetUrl(u)}
                              alt=""
                              className="h-full w-full object-cover"
                            />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Плеер голосового сообщения */}
                {item.type === 'voice' && (
                  <div className="rounded-[10px] bg-white border-[1.5px] border-[#181715]/20 p-2.5 space-y-2">
                    <div className="flex items-center gap-2 text-[11.5px] font-semibold text-[#B85D35]">
                      <Volume2 className="h-4 w-4 shrink-0" />
                      <span>Голосовая заметка · Прослушать</span>
                    </div>
                    <audio
                      controls
                      src={item.audioDataUrl || createDemoVoiceWavDataUrl()}
                      className="w-full h-8"
                    />
                  </div>
                )}

                {/* Текст / описание */}
                <textarea
                  rows={item.imageUrl || item.type === 'voice' ? 2 : 4}
                  value={item.content}
                  onChange={(e) => updateMiroItem(item.id, { content: e.target.value })}
                  className="w-full bg-transparent text-[12.5px] text-[#3D3A36] leading-snug outline-none resize-none"
                />

                {/* Список прикреплённых связей, если есть */}
                {(item.connectedToIds || []).length > 0 && (
                  <div className="flex flex-wrap items-center gap-1 pt-1">
                    {(item.connectedToIds || []).map((targetId) => {
                      const targetObj = visibleItems.find((t) => t.id === targetId);
                      if (!targetObj) return null;
                      return (
                        <span
                          key={targetId}
                          className="inline-flex items-center gap-1 rounded-[5px] bg-white/85 border border-black/15 px-1.5 py-0.5 text-[10px] font-medium text-[#181715]"
                        >
                          <span className="text-[#B85D35] font-bold">➔</span>
                          <span className="truncate max-w-[130px]">{targetObj.title}</span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              removeArrowConnection(item.id, targetId);
                            }}
                            className="text-[#8C867B] hover:text-[#B93829] cursor-pointer"
                            title="Открепить стрелку"
                          >
                            <X className="h-2.5 w-2.5" />
                          </button>
                        </span>
                      );
                    })}
                  </div>
                )}

                {/* Переход в привязанную карточку R&D */}
                {item.linkedConceptId && (
                  <button
                    type="button"
                    onClick={() =>
                      navigateTo('product-lab', { conceptId: item.linkedConceptId })
                    }
                    className="w-full rounded-[8px] bg-[#181715] hover:bg-[#B85D35] text-white py-1.5 px-3 text-[11.5px] font-semibold transition cursor-pointer flex items-center justify-between"
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <Sparkles className="h-3 w-3" />
                      <span>Открыть карточку R&amp;D</span>
                    </span>
                    <span>→</span>
                  </button>
                )}

                <div className="flex items-center justify-between text-[10.5px] text-[#6E6A63] pt-1.5 border-t border-black/10">
                  <span>
                    {item.authorName} · {item.createdAt}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      updateMiroItem(item.id, {
                        title: item.title,
                        content: item.content,
                      });
                      notify('success', `✓ Карточка «${item.title}» сохранена`);
                    }}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[5px] bg-[#16805D] hover:bg-[#116649] text-white text-[10.5px] font-semibold transition cursor-pointer"
                  >
                    <Check className="h-2.5 w-2.5" />
                    <span>Сохранить</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
