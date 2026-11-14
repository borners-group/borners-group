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
import { MiroBoardItem, ProductConcept } from '@/types/platform';
import { canUserEditBrand, canUserViewBrandConcept } from '@/lib/finance';
import { compressImageFileToDataUrl } from '@/lib/document-export';
import { resolvePublicAssetUrl } from '@/lib/scenarioData';
import { saveModelGalleryToIdb } from '@/lib/safeStorage';
import { useLiveScenarioPortfolio } from '@/lib/useLiveScenarioPortfolio';
import {
  formatLabBrandLabel,
  normalizeLabBrandCode,
  syncConceptToScenarioPortfolio,
} from '@/lib/rndCatalogSync';

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
    createConcept,
    updateConcept,
    setSelectedConceptId,
    currentUser,
    platformMode,
    brandFilter,
    navigateTo,
    notify,
  } = usePlatform();

  const canEdit =
    platformMode === 'management' &&
    (currentUser.role === 'Owner' ||
      currentUser.role === 'Admin' ||
      (currentUser.role === 'Manager' &&
        (brandFilter === 'ALL'
          ? currentUser.assignedBrandIds.length > 0
          : canUserEditBrand(currentUser, normalizeLabBrandCode(brandFilter)))));

  const canEditItem = (item: MiroBoardItem) =>
    canEdit &&
    (item.brandId === 'ALL' ||
      canUserEditBrand(currentUser, normalizeLabBrandCode(item.brandId)));

  const {
    models: liveScenarioModels,
    scenarios: liveScenarios,
    updateModelsBatch,
  } = useLiveScenarioPortfolio();

  const handlePromoteMiroItemToRnD = (item: MiroBoardItem) => {
    if (!canEditItem(item)) return;
    const rawBrand =
      item.brandId && item.brandId !== 'ALL'
        ? item.brandId
        : brandFilter && brandFilter !== 'ALL'
        ? brandFilter
        : currentUser.role === 'Manager' && currentUser.assignedBrandIds.length > 0
        ? currentUser.assignedBrandIds[0]
        : 'NA_TELE';
    const targetBrand = normalizeLabBrandCode(rawBrand);
    if (!canUserEditBrand(currentUser, targetBrand)) {
      notify('warning', 'Недостаточно прав для создания разработки этого бренда');
      return;
    }
    const conceptName =
      item.title?.trim() ||
      item.content?.trim().slice(0, 48) ||
      'Новая идея с доски Miro';

    const collectedUrls = Array.from(
      new Set(
        [item.imageUrl, ...(item.galleryUrls || [])]
          .map((u) => (u || '').trim())
          .filter((u) => u.length > 0)
      )
    );
    const primaryPhoto = collectedUrls[0] || undefined;
    const galleryPhotos =
      collectedUrls.length > 0
        ? collectedUrls.map((u, idx) => ({
            id: `gp-miro-${Date.now()}-${idx}`,
            url: u,
            caption: `Референс Miro #${idx + 1}`,
          }))
        : undefined;

    const categoryLabel =
      targetBrand === 'NA_TELE'
        ? 'Женское бесшовное бельё'
        : targetBrand === 'AKUSHA'
        ? 'Детская и женская обувь'
        : targetBrand === 'LISKANI'
        ? 'Интерьерные шторы'
        : 'Базовое бельё';

    const voiceTranscript = (item as MiroBoardItem & { voiceTranscript?: string })
      .voiceTranscript;
    const rawDescription = (item.content || voiceTranscript || item.title || '').trim();

    const created = createConcept({
      name: conceptName,
      brandId: targetBrand,
      collectionName: categoryLabel,
      stage: 'IDEA',
      developmentType: 'new_construction',
      imageUrl: primaryPhoto,
      whatAttracted: rawDescription
        ? `${rawDescription} · Перенесено с визуальной доски Miro R&D`
        : 'Перенесено с визуальной доски Miro R&D',
      ideaDescription: rawDescription || conceptName,
      ownerId: currentUser.id,
      targetLaunchDate: '2027-02-15',
      galleryPhotos,
    });

    if (galleryPhotos && galleryPhotos.length > 0) {
      updateConcept(created.id, {
        ...(primaryPhoto ? { imageUrl: primaryPhoto } : {}),
        galleryPhotos,
      });
    }

    updateMiroItem(item.id, { linkedConceptId: created.id });

    const conceptWithMedia: ProductConcept = {
      ...created,
      brandId: targetBrand,
      collectionName: categoryLabel,
      ...(primaryPhoto ? { imageUrl: primaryPhoto } : {}),
      ...(galleryPhotos ? { galleryPhotos } : {}),
    };

    const synced = syncConceptToScenarioPortfolio(
      conceptWithMedia,
      liveScenarioModels,
      liveScenarios
    );
    updateModelsBatch(() => synced.models);
    if (synced.model.gallery?.length) {
      void saveModelGalleryToIdb(synced.model.id, synced.model.gallery);
    }
    updateConcept(created.id, { linkedScenarioModelId: synced.model.id });

    setSelectedConceptId(created.id);
    navigateTo('product-lab', { conceptId: created.id });
    notify(
      'success',
      `✓ Передано в разработку R&D: ${created.code}`,
      `${formatLabBrandLabel(targetBrand)} · «${conceptName}» синхронизировано с Каталогом (${synced.model.code})`
    );
  };

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
  const recordingSecRef = useRef(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
      const rec = mediaRecorderRef.current;
      if (rec) {
        try {
          if (rec.state !== 'inactive') {
            rec.stop();
          }
        } catch {
          // ignore
        }
        rec.stream?.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  const visibleItems = (miroItems || []).filter(
    (item) =>
      (brandFilter === 'ALL' ||
        item.brandId === 'ALL' ||
        normalizeLabBrandCode(item.brandId) === normalizeLabBrandCode(brandFilter)) &&
      (item.brandId === 'ALL' ||
        canUserViewBrandConcept(currentUser, normalizeLabBrandCode(item.brandId)))
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
    if (!canEdit || !sourceId || !targetId || sourceId === targetId) return;
    const sourceItem = (miroItems || []).find((m) => m.id === sourceId);
    const targetItem = (miroItems || []).find((m) => m.id === targetId);
    if (!sourceItem || !targetItem || !canEditItem(sourceItem)) return;

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
    if (!sourceItem || !canEditItem(sourceItem)) return;
    updateMiroItem(sourceId, {
      connectedToIds: (sourceItem.connectedToIds || []).filter((id) => id !== targetId),
    });
    notify('warning', 'Связь-стрелка удалена');
  };

  const resolveCanvasBrandId = () => {
    if (brandFilter !== 'ALL') return normalizeLabBrandCode(brandFilter);
    if (currentUser.role === 'Manager' && currentUser.assignedBrandIds.length > 0) {
      return normalizeLabBrandCode(currentUser.assignedBrandIds[0]);
    }
    return 'ALL';
  };

  const handleAddSticky = (color = '#FFF8D6') => {
    const pos = getNextCoordinates();
    createMiroItem({
      type: 'sticky',
      title: 'Новая заметка в Студии',
      content: 'Запишите идею, комментарий по образцу или свяжите стрелочкой с соседней карточкой...',
      brandId: resolveCanvasBrandId(),
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
        brandId: resolveCanvasBrandId(),
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
        recordingSecRef.current = 0;

        recorder.ondataavailable = (ev) => {
          if (ev.data.size > 0) audioChunksRef.current.push(ev.data);
        };

        recorder.onstop = () => {
          stream.getTracks().forEach((t) => t.stop());
          const duration = Math.max(1, recordingSecRef.current || 1);
          const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          const reader = new FileReader();
          reader.onload = () => {
            const dataUrl = typeof reader.result === 'string' ? reader.result : '';
            const pos = getNextCoordinates();
            createMiroItem({
              type: 'voice',
              title: `Голосовая заметка (${duration} сек.)`,
              content: 'Аудиокомментарий по продукту / правкам лекала и образца',
              brandId: resolveCanvasBrandId(),
              color: '#EBF2FA',
              x: pos.x,
              y: pos.y,
              width: 300,
              audioDataUrl: dataUrl || createDemoVoiceWavDataUrl(),
              audioDurationSec: duration,
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
          recordingSecRef.current += 1;
          setRecordingSec(recordingSecRef.current);
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
      brandId: resolveCanvasBrandId(),
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
        brandId: resolveCanvasBrandId(),
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

  const activeInteractionModeRef = useRef<'pointer' | 'touch' | 'mouse' | null>(null);
  const activePointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchStateRef = useRef<{ dist: number; startZoom: number } | null>(null);

  const isInteractiveBoardElement = (target: EventTarget | null): boolean => {
    const el = target as HTMLElement | null;
    if (!el) return false;
    const tag = el.tagName;
    if (
      tag === 'INPUT' ||
      tag === 'TEXTAREA' ||
      tag === 'BUTTON' ||
      tag === 'SELECT' ||
      tag === 'A' ||
      tag === 'LABEL' ||
      tag === 'AUDIO'
    ) {
      return true;
    }
    return Boolean(el.closest('button, input, textarea, select, a, label, audio'));
  };

  const startViewportPanAt = (clientX: number, clientY: number) => {
    if (connectingSourceId) {
      setConnectingSourceId(null);
    }
    setIsPanning(true);
    setPanStart({
      clientX,
      clientY,
      panX: pan.x,
      panY: pan.y,
    });
  };

  // Нажатие на пустое место бесконечного холста -> панорамирование (Мышь + Тач / Pointer)
  const handlePointerDownViewport = (e: React.PointerEvent<HTMLDivElement>) => {
    activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (activePointersRef.current.size === 2) {
      const pts = Array.from(activePointersRef.current.values());
      const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
      pinchStateRef.current = { dist: Math.max(10, dist), startZoom: zoom };
      setIsPanning(false);
      setDraggingId(null);
      return;
    }
    if (e.target !== e.currentTarget && !(e.target as HTMLElement).dataset.canvasBg) {
      return;
    }
    activeInteractionModeRef.current = 'pointer';
    startViewportPanAt(e.clientX, e.clientY);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore synthetic pointer events
    }
  };

  const handleMouseDownViewport = (e: React.MouseEvent<HTMLDivElement>) => {
    if (activeInteractionModeRef.current === 'pointer') return;
    if (e.target !== e.currentTarget && !(e.target as HTMLElement).dataset.canvasBg) {
      return;
    }
    activeInteractionModeRef.current = 'mouse';
    startViewportPanAt(e.clientX, e.clientY);
  };

  const handleTouchStartViewport = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 2) {
      const dist = Math.hypot(
        e.touches[1].clientX - e.touches[0].clientX,
        e.touches[1].clientY - e.touches[0].clientY
      );
      pinchStateRef.current = { dist: Math.max(10, dist), startZoom: zoom };
      setIsPanning(false);
      setDraggingId(null);
      return;
    }
    if (activeInteractionModeRef.current === 'pointer' || e.touches.length !== 1) return;
    if (e.target !== e.currentTarget && !(e.target as HTMLElement).dataset.canvasBg) {
      return;
    }
    activeInteractionModeRef.current = 'touch';
    startViewportPanAt(e.touches[0].clientX, e.touches[0].clientY);
  };

  // Колесо мыши / тачпад: с Ctrl/Cmd масштабирует, без — свободно двигает бесконечный холст
  // и блокирует случайный жест Назад/Вперёд в браузере или между этапами
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onNativeWheel = (e: WheelEvent) => {
      if (
        !e.ctrlKey &&
        !e.metaKey &&
        e.target instanceof HTMLTextAreaElement &&
        document.activeElement === e.target &&
        e.target.scrollHeight > e.target.clientHeight
      ) {
        return;
      }
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

  const startCardDragOrConnect = (
    target: EventTarget | null,
    clientX: number,
    clientY: number,
    item: MiroBoardItem
  ): boolean => {
    // Если активен режим связывания стрелкой — клик/тап по другой карточке соединяет их!
    if (connectingSourceId && connectingSourceId !== item.id) {
      toggleArrowConnection(connectingSourceId, item.id);
      setConnectingSourceId(null);
      return false;
    }

    if (!canEditItem(item)) {
      return false;
    }

    if (isInteractiveBoardElement(target)) {
      return false;
    }

    const worldPos = screenToWorld(clientX, clientY);
    setDraggingId(item.id);
    setDragOffset({ dx: worldPos.x - item.x, dy: worldPos.y - item.y });
    return true;
  };

  // Нажатие на карточку: либо завершает проведение стрелки, либо начинает перетаскивание карточки
  const handlePointerDownCard = (e: React.PointerEvent, item: MiroBoardItem) => {
    if (isInteractiveBoardElement(e.target)) {
      return;
    }
    e.stopPropagation();
    activeInteractionModeRef.current = 'pointer';
    const started = startCardDragOrConnect(e.target, e.clientX, e.clientY, item);
    if (started && viewportRef.current) {
      try {
        viewportRef.current.setPointerCapture(e.pointerId);
      } catch {
        // ignore synthetic pointer events
      }
    }
  };

  const handleMouseDownCard = (e: React.MouseEvent, item: MiroBoardItem) => {
    if (activeInteractionModeRef.current === 'pointer') return;
    if (isInteractiveBoardElement(e.target)) return;
    e.stopPropagation();
    activeInteractionModeRef.current = 'mouse';
    startCardDragOrConnect(e.target, e.clientX, e.clientY, item);
  };

  const handleTouchStartCard = (e: React.TouchEvent, item: MiroBoardItem) => {
    if (activeInteractionModeRef.current === 'pointer' || e.touches.length !== 1) return;
    if (isInteractiveBoardElement(e.target)) return;
    e.stopPropagation();
    activeInteractionModeRef.current = 'touch';
    startCardDragOrConnect(e.target, e.touches[0].clientX, e.touches[0].clientY, item);
  };

  // Начало перетаскивания стрелки от узловой точки карточки
  const startArrowDragAt = (clientX: number, clientY: number, sourceId: string): boolean => {
    const src = (miroItems || []).find((m) => m.id === sourceId);
    if (!src || !canEditItem(src)) return false;
    const worldPos = screenToWorld(clientX, clientY);
    setDraggingArrowFromId(sourceId);
    setArrowCursorWorld(worldPos);
    return true;
  };

  const handlePointerDownArrow = (e: React.PointerEvent, sourceId: string) => {
    e.stopPropagation();
    e.preventDefault();
    activeInteractionModeRef.current = 'pointer';
    if (startArrowDragAt(e.clientX, e.clientY, sourceId) && viewportRef.current) {
      try {
        viewportRef.current.setPointerCapture(e.pointerId);
      } catch {
        // ignore synthetic pointer events
      }
    }
  };

  const handleStartDragArrow = (e: React.MouseEvent, sourceId: string) => {
    if (activeInteractionModeRef.current === 'pointer') return;
    e.stopPropagation();
    e.preventDefault();
    activeInteractionModeRef.current = 'mouse';
    startArrowDragAt(e.clientX, e.clientY, sourceId);
  };

  const handleTouchStartArrow = (e: React.TouchEvent, sourceId: string) => {
    if (activeInteractionModeRef.current === 'pointer' || e.touches.length !== 1) return;
    e.stopPropagation();
    activeInteractionModeRef.current = 'touch';
    startArrowDragAt(e.touches[0].clientX, e.touches[0].clientY, sourceId);
  };

  // Завершение перетаскивания стрелки на целевой карточке
  const handleMouseUpOnCard = (e: React.MouseEvent, targetItem: MiroBoardItem) => {
    if (draggingArrowFromId && draggingArrowFromId !== targetItem.id) {
      e.stopPropagation();
      toggleArrowConnection(draggingArrowFromId, targetItem.id);
      setDraggingArrowFromId(null);
      setArrowCursorWorld(null);
      activeInteractionModeRef.current = null;
    }
  };

  const moveViewportInteractionAt = (clientX: number, clientY: number) => {
    if (isPanning) {
      const dx = clientX - panStart.clientX;
      const dy = clientY - panStart.clientY;
      setPan({
        x: Math.round(panStart.panX + dx),
        y: Math.round(panStart.panY + dy),
      });
      return;
    }

    if (draggingArrowFromId) {
      setArrowCursorWorld(screenToWorld(clientX, clientY));
      return;
    }

    if (draggingId) {
      const worldPos = screenToWorld(clientX, clientY);
      // Бесконечные координаты без жёстких границ
      const nextX = Math.round(worldPos.x - dragOffset.dx);
      const nextY = Math.round(worldPos.y - dragOffset.dy);
      updateMiroItem(draggingId, { x: nextX, y: nextY });
    }
  };

  const handlePointerMoveViewport = (e: React.PointerEvent<HTMLDivElement>) => {
    if (activePointersRef.current.has(e.pointerId)) {
      activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }
    if (pinchStateRef.current && activePointersRef.current.size === 2) {
      const pts = Array.from(activePointersRef.current.values());
      const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
      const scaleRatio = dist / Math.max(10, pinchStateRef.current.dist);
      const nextZ = Math.max(0.5, Math.min(1.5, Number((pinchStateRef.current.startZoom * scaleRatio).toFixed(2))));
      setZoom(nextZ);
      return;
    }
    moveViewportInteractionAt(e.clientX, e.clientY);
  };

  const handleMouseMoveViewport = (e: React.MouseEvent<HTMLDivElement>) => {
    if (activeInteractionModeRef.current === 'pointer') return;
    moveViewportInteractionAt(e.clientX, e.clientY);
  };

  const handleTouchMoveViewport = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 2 && pinchStateRef.current) {
      const dist = Math.hypot(
        e.touches[1].clientX - e.touches[0].clientX,
        e.touches[1].clientY - e.touches[0].clientY
      );
      const scaleRatio = dist / Math.max(10, pinchStateRef.current.dist);
      const nextZ = Math.max(0.5, Math.min(1.5, Number((pinchStateRef.current.startZoom * scaleRatio).toFixed(2))));
      setZoom(nextZ);
      return;
    }
    if (activeInteractionModeRef.current === 'pointer' || e.touches.length !== 1) return;
    moveViewportInteractionAt(e.touches[0].clientX, e.touches[0].clientY);
  };

  const finishViewportInteractionAt = (clientX?: number, clientY?: number) => {
    if (
      draggingArrowFromId &&
      typeof clientX === 'number' &&
      typeof clientY === 'number' &&
      typeof document !== 'undefined'
    ) {
      const hitEl = document.elementFromPoint(clientX, clientY);
      const cardEl = hitEl?.closest?.('[data-miro-card-id]') as HTMLElement | null;
      const targetCardId = cardEl?.dataset?.miroCardId;
      if (targetCardId && targetCardId !== draggingArrowFromId) {
        toggleArrowConnection(draggingArrowFromId, targetCardId);
      }
    }
    if (isPanning) setIsPanning(false);
    if (draggingId) setDraggingId(null);
    if (draggingArrowFromId) {
      setDraggingArrowFromId(null);
      setArrowCursorWorld(null);
    }
    pinchStateRef.current = null;
    activeInteractionModeRef.current = null;
  };

  const handlePointerUpViewport = (e: React.PointerEvent<HTMLDivElement>) => {
    activePointersRef.current.delete(e.pointerId);
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      // ignore
    }
    finishViewportInteractionAt(e.clientX, e.clientY);
  };

  const handleMouseUpViewport = (e?: React.MouseEvent<HTMLDivElement>) => {
    if (activeInteractionModeRef.current === 'pointer') return;
    finishViewportInteractionAt(e?.clientX, e?.clientY);
  };

  const handleTouchEndViewport = (e: React.TouchEvent<HTMLDivElement>) => {
    if (activeInteractionModeRef.current === 'pointer') return;
    const t = e.changedTouches?.[0];
    finishViewportInteractionAt(t?.clientX, t?.clientY);
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
          {canEdit && (
            <>
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
                      canUserViewBrandConcept(currentUser, normalizeLabBrandCode(c.brandId)) &&
                      (brandFilter === 'ALL' ||
                        normalizeLabBrandCode(c.brandId) === normalizeLabBrandCode(brandFilter))
                  )
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      [{formatLabBrandLabel(c.brandId)}] {c.code} · {c.name}
                    </option>
                  ))}
              </select>
            </>
          )}

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

          {canEdit && (
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
          )}
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
        onPointerDown={handlePointerDownViewport}
        onPointerMove={handlePointerMoveViewport}
        onPointerUp={handlePointerUpViewport}
        onPointerCancel={handlePointerUpViewport}
        onMouseDown={handleMouseDownViewport}
        onMouseMove={handleMouseMoveViewport}
        onMouseUp={handleMouseUpViewport}
        onMouseLeave={handleMouseUpViewport}
        onTouchStart={handleTouchStartViewport}
        onTouchMove={handleTouchMoveViewport}
        onTouchEnd={handleTouchEndViewport}
        onTouchCancel={handleTouchEndViewport}
        style={{
          backgroundImage:
            'radial-gradient(circle, #BDB5A6 1.35px, transparent 1.35px)',
          backgroundSize: `${24 * zoom}px ${24 * zoom}px`,
          backgroundPosition: `${pan.x}px ${pan.y}px`,
        }}
        className={`relative w-full h-[680px] overflow-hidden overscroll-contain touch-none bg-[#F4F1EA] select-none ${
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
                <path d="M 0 0 L 10 4 L 0 8 z" fill="#E07A4F" />
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
                  className={canEditItem(source) ? 'cursor-pointer' : 'cursor-default'}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (canEditItem(source)) {
                      removeArrowConnection(source.id, target.id);
                    }
                  }}
                />
                {/* Видимая кривая стрелка */}
                <path
                  d={geometry.path}
                  fill="none"
                  stroke="#B85D35"
                  strokeWidth={2.75}
                  markerEnd="url(#studio-arrowhead)"
                  className="transition-all group-hover:stroke-[#E07A4F]"
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
                {canEditItem(source) && (
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
                )}
              </g>
            ))}

            {/* Живая пунктирная стрелка во время перетаскивания от точки карточки */}
            {activeDragSource && arrowCursorWorld && (
              <path
                d={`M ${activeDragSource.x + (activeDragSource.width || 290) / 2} ${
                  activeDragSource.y + estimateCardHeight(activeDragSource) / 2
                } L ${arrowCursorWorld.x} ${arrowCursorWorld.y}`}
                fill="none"
                stroke="#E07A4F"
                strokeWidth={2.5}
                strokeDasharray="6 4"
                markerEnd="url(#studio-arrowhead-active)"
              />
            )}
          </svg>

          {/* КАРТОЧКИ НА БЕСКОНЕЧНОМ ХОЛСТЕ */}
          {visibleItems.map((item) => {
            const itemEditable = canEditItem(item);
            const isConnectSource = connectingSourceId === item.id;
            const isConnectTargetCandidate =
              Boolean(connectingSourceId && connectingSourceId !== item.id) ||
              Boolean(draggingArrowFromId && draggingArrowFromId !== item.id);
            const linkedConcept = item.linkedConceptId
              ? concepts.find((c) => c.id === item.linkedConceptId) || null
              : null;
            const hasActiveLinkedConcept = Boolean(
              linkedConcept && !linkedConcept.isArchived
            );
            const hasArchivedOrMissingConcept =
              Boolean(item.linkedConceptId) && !hasActiveLinkedConcept;

            return (
              <div
                key={item.id}
                data-miro-card-id={item.id}
                onPointerDown={(e) => handlePointerDownCard(e, item)}
                onMouseDown={(e) => handleMouseDownCard(e, item)}
                onMouseUp={(e) => handleMouseUpOnCard(e, item)}
                onTouchStart={(e) => handleTouchStartCard(e, item)}
                style={{
                  left: `${item.x}px`,
                  top: `${item.y}px`,
                  width: `${item.width || 290}px`,
                  backgroundColor: item.color || '#FFF8D6',
                }}
                className={`miro-pastel-card group/card pointer-events-auto touch-none absolute rounded-[14px] border-2 p-4 space-y-2.5 transition-shadow ${
                  draggingId === item.id
                    ? 'border-[#181715] shadow-2xl z-30 cursor-grabbing'
                    : isConnectSource
                    ? 'border-[#B85D35] ring-4 ring-[#B85D35]/30 shadow-xl z-30'
                    : isConnectTargetCandidate
                    ? 'border-[#B85D35] hover:ring-4 hover:ring-[#B85D35]/40 shadow-lg z-20 cursor-pointer'
                    : `border-[#181715]/85 hover:border-[#181715] shadow-md z-10 ${
                        itemEditable ? 'cursor-grab' : 'cursor-default'
                      }`
                }`}
              >
                {/* 4 УЗЛОВЫЕ ТОЧКИ ПО КРАЯМ КАРТОЧКИ ДЛЯ ПЕРЕТАСКИВАНИЯ СТРЕЛОЧЕК */}
                {itemEditable && (
                  <>
                    <button
                      type="button"
                      onPointerDown={(e) => handlePointerDownArrow(e, item.id)}
                      onMouseDown={(e) => handleStartDragArrow(e, item.id)}
                      onTouchStart={(e) => handleTouchStartArrow(e, item.id)}
                      title="Потяните отсюда стрелку к другой карточке"
                      className=" -top-2.5 left-1/2 -translate-x-1/2 absolute h-5 w-5 rounded-full bg-white border-2 border-[#B85D35] hover:bg-[#B85D35] hover:scale-125 transition flex items-center justify-center shadow-xs z-30 cursor-crosshair touch-none"
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-[#B85D35]" />
                    </button>
                    <button
                      type="button"
                      onPointerDown={(e) => handlePointerDownArrow(e, item.id)}
                      onMouseDown={(e) => handleStartDragArrow(e, item.id)}
                      onTouchStart={(e) => handleTouchStartArrow(e, item.id)}
                      title="Потяните отсюда стрелку к другой карточке"
                      className="-right-2.5 top-1/2 -translate-y-1/2 absolute h-5 w-5 rounded-full bg-white border-2 border-[#B85D35] hover:bg-[#B85D35] hover:scale-125 transition flex items-center justify-center shadow-xs z-30 cursor-crosshair touch-none"
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-[#B85D35]" />
                    </button>
                    <button
                      type="button"
                      onPointerDown={(e) => handlePointerDownArrow(e, item.id)}
                      onMouseDown={(e) => handleStartDragArrow(e, item.id)}
                      onTouchStart={(e) => handleTouchStartArrow(e, item.id)}
                      title="Потяните отсюда стрелку к другой карточке"
                      className="-bottom-2.5 left-1/2 -translate-x-1/2 absolute h-5 w-5 rounded-full bg-white border-2 border-[#B85D35] hover:bg-[#B85D35] hover:scale-125 transition flex items-center justify-center shadow-xs z-30 cursor-crosshair touch-none"
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-[#B85D35]" />
                    </button>
                    <button
                      type="button"
                      onPointerDown={(e) => handlePointerDownArrow(e, item.id)}
                      onMouseDown={(e) => handleStartDragArrow(e, item.id)}
                      onTouchStart={(e) => handleTouchStartArrow(e, item.id)}
                      title="Потяните отсюда стрелку к другой карточке"
                      className="-left-2.5 top-1/2 -translate-y-1/2 absolute h-5 w-5 rounded-full bg-white border-2 border-[#B85D35] hover:bg-[#B85D35] hover:scale-125 transition flex items-center justify-center shadow-xs z-30 cursor-crosshair touch-none"
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-[#B85D35]" />
                    </button>
                  </>
                )}

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

                  {itemEditable && (
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
                  )}
                </div>

                {/* Заголовок карточки (редактируемый) */}
                <input
                  value={item.title}
                  readOnly={!itemEditable}
                  onChange={(e) => {
                    if (itemEditable) updateMiroItem(item.id, { title: e.target.value });
                  }}
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
                            onClick={() => {
                              if (itemEditable) updateMiroItem(item.id, { imageUrl: u });
                            }}
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
                  readOnly={!itemEditable}
                  onChange={(e) => {
                    if (itemEditable) updateMiroItem(item.id, { content: e.target.value });
                  }}
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
                          {itemEditable && (
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
                          )}
                        </span>
                      );
                    })}
                  </div>
                )}

                {/* Переход в привязанную карточку R&D или создание новой разработки */}
                {hasActiveLinkedConcept && linkedConcept && (
                  <button
                    type="button"
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedConceptId(linkedConcept.id);
                      navigateTo('product-lab', { conceptId: linkedConcept.id });
                    }}
                    className="w-full rounded-[8px] bg-[#181715] hover:bg-[#B85D35] text-white py-1.5 px-3 text-[11.5px] font-semibold transition cursor-pointer flex items-center justify-between"
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <Sparkles className="h-3 w-3" />
                      <span>Открыть карточку R&amp;D</span>
                    </span>
                    <span>→</span>
                  </button>
                )}

                {hasArchivedOrMissingConcept && (
                  <button
                    type="button"
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      notify(
                        'warning',
                        'Карточка R&D находится в архиве',
                        'Создайте новую разработку или восстановите карточку из Корзины'
                      );
                    }}
                    className="w-full rounded-[8px] bg-[#FAF8F5] hover:bg-[#FCE8DF] border border-[#D4CDC2] text-[#7A756D] hover:text-[#9E4622] py-1.5 px-3 text-[11px] font-semibold transition cursor-pointer flex items-center justify-between"
                  >
                    <span>Карточка R&amp;D в архиве</span>
                    <span>!</span>
                  </button>
                )}

                {itemEditable &&
                  !hasActiveLinkedConcept &&
                  (item.type === 'sticky' ||
                    item.type === 'photo' ||
                    item.type === 'voice' ||
                    hasArchivedOrMissingConcept) && (
                    <button
                      type="button"
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        handlePromoteMiroItemToRnD(item);
                      }}
                      className="w-full rounded-[8px] bg-[#181715] hover:bg-[#B85D35] text-white py-1.5 px-3 text-[11.5px] font-semibold transition cursor-pointer flex items-center justify-between"
                    >
                      <span className="inline-flex items-center gap-1.5">
                        <Sparkles className="h-3 w-3" />
                        <span>В разработку R&amp;D →</span>
                      </span>
                    </button>
                  )}

                <div className="flex items-center justify-between text-[10.5px] text-[#6E6A63] pt-1.5 border-t border-black/10">
                  <span>
                    {item.authorName} · {item.createdAt}
                  </span>
                  {itemEditable && (
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
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
