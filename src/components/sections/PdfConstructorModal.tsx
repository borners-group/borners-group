'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { X, Upload, FileText, Plus, Trash2, Check } from 'lucide-react';
import { ProductConcept } from '@/types/platform';
import {
  compressImageFileToDataUrl,
  downloadEditorialPdfDocument,
} from '@/lib/document-export';
import { resolvePublicAssetUrl } from '@/lib/scenarioData';
import { formatLabBrandLabel } from '@/lib/rndCatalogSync';
import {
  cleanTechPackText,
  getBrandProductionProfile,
} from '@/lib/brandProductionConfig';

interface PdfConstructorModalProps {
  concept: ProductConcept;
  onClose: () => void;
  onSaveToConcept?: (patch: Partial<ProductConcept>) => void;
}

export function PdfConstructorModal({
  concept,
  onClose,
  onSaveToConcept,
}: PdfConstructorModalProps) {
  const existingOrder = concept.productionOrders?.[0];
  const prodProfile = useMemo(
    () => getBrandProductionProfile(concept.brandId, concept.name),
    [concept.brandId, concept.name]
  );

  const brandLabel = prodProfile.brandLabel;
  const defaultZhProductLabel =
    prodProfile.brandCode === 'NA_TELE'
      ? 'НА ТЕЛЕ 女士无痕亲肤内衣套装'
      : prodProfile.brandCode === 'AKUSHA'
      ? prodProfile.sizes[0] === '36'
        ? 'AKUSHA 女士真皮舒适鞋履'
        : 'AKUSHA 儿童真皮学步鞋'
      : prodProfile.brandCode === 'LISKANI'
      ? 'LISKANI 家居窗帘纺织系列'
      : `${brandLabel} 男士莫代尔平角内裤`;

  const defaultFactoryZh =
    prodProfile.brandCode === 'NA_TELE'
      ? '汕头无痕针织内衣制造有限公司 (汕头, 中国)'
      : prodProfile.brandCode === 'AKUSHA'
      ? '温州阿库莎鞋业制造有限公司 (温州, 中国)'
      : prodProfile.brandCode === 'LISKANI'
      ? '绍兴柯桥利斯卡尼家纺制品有限公司 (绍兴, 中国)'
      : '广东奥佩克内衣有限公司 (佛山, 中国)';

  const defaultFactoryRu =
    prodProfile.brandCode === 'NA_TELE'
      ? 'Shantou Seamless Intimate Co. (Шаньтоу, КНР)'
      : prodProfile.brandCode === 'AKUSHA'
      ? 'Wenzhou Akusha Footwear Co. (Вэньчжоу, КНР)'
      : prodProfile.brandCode === 'LISKANI'
      ? 'Shaoxing Keqiao Home Textile (Шаосин, КНР)'
      : 'Guangdong Apex Intimate (Фошань, КНР)';

  const defaultPackUnits =
    existingOrder?.unitsPerPack ||
    concept.packUnitsCount ||
    prodProfile.defaultPackUnits;

  const [docTitleZh, setDocTitleZh] = useState(
    `生产工艺单及大货采购订单：${cleanTechPackText(
      concept.techPack?.zh?.modelName,
      defaultZhProductLabel
    )} (${concept.code})`
  );
  const [docTitle, setDocTitle] = useState(
    `Спецификация и заказ на производство: ${concept.name} (${concept.code})`
  );
  const [factoryNameZh, setFactoryNameZh] = useState(defaultFactoryZh);
  const [factoryName, setFactoryName] = useState(
    existingOrder?.factoryName ||
      concept.samples?.[0]?.factoryName ||
      concept.supplierName ||
      defaultFactoryRu
  );
  const [plannedReadyDate, setPlannedReadyDate] = useState(
    existingOrder?.plannedReadyDate || concept.targetLaunchDate || '2027-02-15'
  );
  const [paymentTerms, setPaymentTerms] = useState(
    existingOrder?.paymentTerms || '30% депозит / 70% перед отгрузкой после QC'
  );

  const defaultHeroPhoto =
    prodProfile.brandCode === 'NA_TELE'
      ? 'images/products/natele-editorial-hero.jpg'
      : 'images/products/rnd-soft-boxers.jpg';

  // Фотографии товара: Лицевая (вид спереди) + Вторая (вид сзади / детали)
  const [frontPhotoUrl, setFrontPhotoUrl] = useState<string>(
    concept.imageUrl || defaultHeroPhoto
  );
  const [backPhotoUrl, setBackPhotoUrl] = useState<string>(
    concept.galleryPhotos?.[1]?.url ||
      concept.samples?.[0]?.photos?.[0] ||
      concept.imageUrl ||
      'images/products/rnd-seamless-base.jpg'
  );
  const [frontCaption, setFrontCaption] = useState(
    `Лицевая фотография товара · ${concept.name} (${concept.code})`
  );
  const [backCaption, setBackCaption] = useState(prodProfile.defaultDetailCaptionRu);

  // Валюты: CNY (¥), USD ($), RUB (₽) + живой курс конвертации
  const [primaryCurrency, setPrimaryCurrency] = useState<'CNY' | 'USD' | 'RUB'>(
    existingOrder?.currency || 'CNY'
  );
  const [rateCnyToRub, setRateCnyToRub] = useState<number>(13.2);
  const [rateUsdToRub, setRateUsdToRub] = useState<number>(93.5);
  const [unitPriceInPrimary, setUnitPriceInPrimary] = useState<number>(() => {
    if (existingOrder?.unitPrice) return existingOrder.unitPrice;
    if (concept.plannedUnitCost > 0) {
      // Пересчёт из рублей в CNY по умолчанию
      return Number((concept.plannedUnitCost / 13.2).toFixed(2));
    }
    return 18.5;
  });

  // Комплектация и размерная сетка (с учётом профиля бренда + сохранённых ключей)
  const [unitsPerPack, setUnitsPerPack] = useState<number>(defaultPackUnits);
  const [packsBySize, setPacksBySize] = useState<Record<string, number>>(() => {
    const existingMap = existingOrder?.packsBySize;
    const hasExistingNonZero =
      existingMap &&
      Object.keys(existingMap).length > 0 &&
      Object.values(existingMap).some((v) => Number(v) > 0);

    if (hasExistingNonZero && existingMap) {
      const merged: Record<string, number> = {};
      for (const sz of prodProfile.sizes) {
        merged[sz] = Math.max(0, Number(existingMap[sz]) || 0);
      }
      for (const [k, v] of Object.entries(existingMap)) {
        if (!(k in merged) && Number(v) > 0) {
          merged[k] = Math.max(0, Number(v) || 0);
        }
      }
      return merged;
    }

    const starterTotalPacks =
      prodProfile.brandCode === 'AKUSHA'
        ? 600
        : prodProfile.brandCode === 'LISKANI'
        ? 500
        : prodProfile.brandCode === 'NA_TELE'
        ? 1000
        : 1500;
    const fresh: Record<string, number> = {};
    for (const sz of prodProfile.sizes) {
      const share =
        prodProfile.sizeSharesPct[sz] ??
        Math.round(100 / Math.max(1, prodProfile.sizes.length));
      fresh[sz] = Math.max(10, Math.round((starterTotalPacks * share) / 100));
    }
    return fresh;
  });

  const orderedSizes = useMemo(() => {
    const extraKeys = Object.keys(packsBySize).filter(
      (k) => !prodProfile.sizes.includes(k)
    );
    return [...prodProfile.sizes, ...extraKeys];
  }, [prodProfile.sizes, packsBySize]);

  // Переключатели блоков: что именно отобразить в PDF перед скачиванием
  const [includePhotos, setIncludePhotos] = useState<boolean>(true);
  const [includeBilingualSpecs, setIncludeBilingualSpecs] = useState<boolean>(true);
  const [includePricing, setIncludePricing] = useState<boolean>(true);
  const [showRubInPdf, setShowRubInPdf] = useState<boolean>(false);
  const [includeTotalSumColumn, setIncludeTotalSumColumn] = useState<boolean>(true);
  const [includeSizeMatrix, setIncludeSizeMatrix] = useState<boolean>(true);
  const [includeFactoryTerms, setIncludeFactoryTerms] = useState<boolean>(true);

  // Двуязычные строки: Крупный китайский (中文) сверху + мелкий русский снизу
  const [bilingualRows, setBilingualRows] = useState<
    {
      id: string;
      labelZh: string;
      labelRu: string;
      zhLarge: string;
      ruSmall: string;
      highlight?: boolean;
    }[]
  >([
    {
      id: 'row-1',
      labelZh: '款式名称与版型工艺',
      labelRu: 'Модель и конструкция',
      zhLarge: cleanTechPackText(
        concept.techPack?.zh?.construction,
        prodProfile.defaultConstructionZh
      ),
      ruSmall: `${concept.name} (${concept.code}) · ${cleanTechPackText(
        concept.techPack?.ru?.construction,
        prodProfile.defaultConstructionRu
      )}`,
      highlight: true,
    },
    {
      id: 'row-2',
      labelZh: '面料成分与克重标准',
      labelRu: 'Состав ткани и плотность',
      zhLarge: cleanTechPackText(
        concept.techPack?.zh?.compositionAndDensity,
        prodProfile.defaultMaterialZh
      ),
      ruSmall: cleanTechPackText(
        existingOrder?.materialAndColors || concept.techPack?.ru?.compositionAndDensity,
        prodProfile.defaultMaterialRu
      ),
      highlight: true,
    },
    {
      id: 'row-3',
      labelZh: '辅料细节与包装配比',
      labelRu: 'Фурнитура / пояс и комплектация',
      zhLarge: `${cleanTechPackText(
        concept.techPack?.zh?.waistbandSpec,
        prodProfile.defaultWaistbandOrTrimZh
      )} · 每组 ${defaultPackUnits} 件 (${prodProfile.sizeGridLabelZh})`,
      ruSmall: `${cleanTechPackText(
        concept.techPack?.ru?.waistbandSpec,
        prodProfile.defaultWaistbandOrTrimRu
      )} · В комплекте ${defaultPackUnits} ед. (${
        existingOrder?.packColorComposition ||
        concept.colorCombinations?.join(', ') ||
        (prodProfile.brandCode === 'NA_TELE'
          ? 'телесный беж, молочный, графит'
          : 'базовая палитра паспорта SKU')
      })`,
      highlight: false,
    },
    {
      id: 'row-4',
      labelZh: '品控标准与水洗测试',
      labelRu: 'Контроль качества и стирка',
      zhLarge: '执行 AQL 1.5 验货标准 · 大货严格按确认产前样生产',
      ruSmall:
        'Инспекция AQL 1.5 перед отгрузкой · Строго по утверждённому эталонному образцу · Маркировка Честный ЗНАК',
      highlight: false,
    },
  ]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  // Вычисление мультивалютных цен (за 1 шт. и за всю партию в CNY, USD, RUB)
  const currencyMetrics = useMemo(() => {
    const safeCnyRate = rateCnyToRub > 0 ? rateCnyToRub : 13.2;
    const safeUsdRate = rateUsdToRub > 0 ? rateUsdToRub : 93.5;

    let unitRub = 0;
    if (primaryCurrency === 'RUB') {
      unitRub = unitPriceInPrimary;
    } else if (primaryCurrency === 'CNY') {
      unitRub = unitPriceInPrimary * safeCnyRate;
    } else {
      unitRub = unitPriceInPrimary * safeUsdRate;
    }

    const unitCny = unitRub / safeCnyRate;
    const unitUsd = unitRub / safeUsdRate;

    const totalPacks = orderedSizes.reduce((acc, sz) => acc + (packsBySize[sz] || 0), 0);
    const totalUnits = totalPacks * Math.max(1, unitsPerPack);

    const totalRub = Math.round(unitRub * totalUnits);
    const totalCny = Math.round(unitCny * totalUnits);
    const totalUsd = Math.round(unitUsd * totalUnits);

    return {
      unitRub: Math.round(unitRub),
      unitCny: Number(unitCny.toFixed(2)),
      unitUsd: Number(unitUsd.toFixed(2)),
      totalPacks,
      totalUnits,
      totalRub,
      totalCny,
      totalUsd,
    };
  }, [primaryCurrency, rateCnyToRub, rateUsdToRub, unitPriceInPrimary, packsBySize, unitsPerPack, orderedSizes]);

  const handleCurrencySwitch = (nextCur: 'CNY' | 'USD' | 'RUB') => {
    if (nextCur === primaryCurrency) return;
    if (nextCur === 'RUB') setUnitPriceInPrimary(currencyMetrics.unitRub);
    if (nextCur === 'CNY') setUnitPriceInPrimary(currencyMetrics.unitCny);
    if (nextCur === 'USD') setUnitPriceInPrimary(currencyMetrics.unitUsd);
    setPrimaryCurrency(nextCur);
  };

  const handleUploadPhoto = async (
    target: 'front' | 'back',
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const compressedUrl = await compressImageFileToDataUrl(file, 720, 0.8);
    if (compressedUrl) {
      if (target === 'front') setFrontPhotoUrl(compressedUrl);
      else setBackPhotoUrl(compressedUrl);
    }
    e.target.value = '';
  };

  const handleDownloadPdf = () => {
    const brandLabel = formatLabBrandLabel(concept.brandId);

    const sizeRows = orderedSizes.map((sz) => {
      const packs = packsBySize[sz] || 0;
      const pcs = packs * unitsPerPack;
      const sumCny = Math.round(pcs * currencyMetrics.unitCny);
      const sumUsd = Math.round(pcs * currencyMetrics.unitUsd);
      const sumRub = Math.round(pcs * currencyMetrics.unitRub);

      const unitPriceCell = showRubInPdf
        ? `¥${currencyMetrics.unitCny} / $${currencyMetrics.unitUsd} (${currencyMetrics.unitRub}₽)`
        : `¥${currencyMetrics.unitCny} / $${currencyMetrics.unitUsd}`;

      const sumCell = showRubInPdf
        ? `¥${sumCny.toLocaleString('ru-RU')} / $${sumUsd.toLocaleString('ru-RU')} (${sumRub.toLocaleString('ru-RU')} ₽)`
        : `¥${sumCny.toLocaleString('ru-RU')} ($${sumUsd.toLocaleString('ru-RU')})`;

      const baseRow = [
        sz,
        `${packs.toLocaleString('ru-RU')} 组 (${prodProfile.packUnitLabelRu})`,
        `${pcs.toLocaleString('ru-RU')} 件 (${prodProfile.itemsUnitLabelRu})`,
      ];

      if (!includePricing) return baseRow;
      if (!includeTotalSumColumn) return [...baseRow, unitPriceCell];
      return [...baseRow, unitPriceCell, sumCell];
    });

    const totalSumCell = showRubInPdf
      ? `¥${currencyMetrics.totalCny.toLocaleString('ru-RU')} / $${currencyMetrics.totalUsd.toLocaleString('ru-RU')} (${currencyMetrics.totalRub.toLocaleString('ru-RU')} ₽)`
      : `¥${currencyMetrics.totalCny.toLocaleString('ru-RU')} ($${currencyMetrics.totalUsd.toLocaleString('ru-RU')})`;

    const sectionsToRender: NonNullable<Parameters<typeof downloadEditorialPdfDocument>[0]>['sections'] = [];

    if (includeBilingualSpecs) {
      sectionsToRender.push({
        badge: '01 · 工艺标准',
        titleZh: '一、产品工艺规格与面辅料标准',
        title: 'Спецификация изделия: Крупный китайский (中文) + перевод на русский внизу',
        subtitle: includeFactoryTerms
          ? `交货期 / Готовность: ${plannedReadyDate}`
          : undefined,
        bilingualSpecs: bilingualRows.map((r) => ({
          labelZh: r.labelZh,
          labelRu: r.labelRu,
          zhLarge: r.zhLarge,
          ruSmall: r.ruSmall,
          highlight: r.highlight,
        })),
      });
    }

    if (includeSizeMatrix || includePricing) {
      const tableHeadersBase = [
        '尺码 (Размер)',
        `组数 (${prodProfile.packUnitLabelRu})`,
        `总数量 (${prodProfile.itemsUnitLabelRu} ×${unitsPerPack})`,
      ];
      const tableHeaders = !includePricing
        ? tableHeadersBase
        : !includeTotalSumColumn
        ? [
            ...tableHeadersBase,
            showRubInPdf
              ? '单价 (Цена 1 ед. CNY/USD/RUB)'
              : '单价 (Цена 1 ед. CNY / USD)',
          ]
        : [
            ...tableHeadersBase,
            showRubInPdf
              ? '单价 (Цена 1 ед. CNY/USD/RUB)'
              : '单价 (Цена 1 ед. CNY / USD)',
            showRubInPdf
              ? '合计金额 (Сумма CNY/USD + RUB)'
              : '合计金额 (Сумма CNY / USD)',
          ];

      const tableFooterBase = [
        '合计总订单 (ИТОГО)',
        `${currencyMetrics.totalPacks.toLocaleString('ru-RU')} 组 (${prodProfile.packUnitLabelRu})`,
        `${currencyMetrics.totalUnits.toLocaleString('ru-RU')} 件 (${prodProfile.itemsUnitLabelRu})`,
      ];
      const unitFooterCell = showRubInPdf
        ? `¥${currencyMetrics.unitCny} / $${currencyMetrics.unitUsd} (${currencyMetrics.unitRub}₽)`
        : `¥${currencyMetrics.unitCny} / $${currencyMetrics.unitUsd}`;

      const tableFooter = !includePricing
        ? tableFooterBase
        : !includeTotalSumColumn
        ? [...tableFooterBase, unitFooterCell]
        : [...tableFooterBase, unitFooterCell, totalSumCell];

      sectionsToRender.push({
        badge: '02 · 尺码及金额',
        titleZh: includePricing
          ? `二、大货尺码配比及订单金额明细 (${prodProfile.sizeGridLabelZh})`
          : `二、大货尺码及数量配比明细表 (${prodProfile.sizeGridLabelZh})`,
        title: includePricing
          ? `${prodProfile.sizeGridLabelRu} и расчёт заказа (${
              showRubInPdf ? 'CNY / USD / RUB' : 'CNY ¥ / USD $ — без рублей'
            })`
          : `${prodProfile.sizeGridLabelRu} без отображения цен`,
        subtitle: `每组 ${unitsPerPack} 件 (${prodProfile.packUnitLabelRu} · ×${unitsPerPack} — ${prodProfile.itemsUnitLabelRu.toLowerCase()})`,
        table: includeSizeMatrix
          ? {
              headers: tableHeaders,
              rows: sizeRows,
              footer: tableFooter,
            }
          : undefined,
        noteZh: includeFactoryTerms
          ? `付款及交货条款：30% 定金，70% 尾款验货合格(AQL 1.5)发货前付清 · 交货期：${plannedReadyDate}${
              includePricing
                ? ` · 合同总金额：¥${currencyMetrics.totalCny.toLocaleString('ru-RU')} CNY / $${currencyMetrics.totalUsd.toLocaleString('ru-RU')} USD${
                    showRubInPdf
                      ? ` (${currencyMetrics.totalRub.toLocaleString('ru-RU')} RUB)`
                      : ''
                  }`
                : ''
            }`
          : undefined,
        note: includeFactoryTerms
          ? `Условия оплаты: ${paymentTerms} · Готовность: ${plannedReadyDate}.${
              includePricing
                ? ` Итого партия: ¥${currencyMetrics.totalCny.toLocaleString('ru-RU')} CNY | $${currencyMetrics.totalUsd.toLocaleString('ru-RU')} USD${
                    showRubInPdf
                      ? ` | ${currencyMetrics.totalRub.toLocaleString('ru-RU')} ₽`
                      : ''
                  }.`
                : ''
            }`
          : undefined,
      });
    }

    downloadEditorialPdfDocument({
      fileName: `PDF_Спецификация_${concept.code}_${primaryCurrency}.pdf`,
      docCode: `${concept.code} · ${showRubInPdf ? primaryCurrency : 'CNY/USD'}`,
      categoryLabel: '生产工艺单及采购订单 (ПРОИЗВОДСТВЕННЫЙ ЛИСТ)',
      brandLabel,
      titleZh: docTitleZh,
      title: docTitle,
      subtitleZh: includeFactoryTerms
        ? `生产工厂：${factoryNameZh} · 交货日期：${plannedReadyDate}${
            includePricing
              ? ` · 订单总额：¥ ${currencyMetrics.totalCny.toLocaleString('ru-RU')} / $ ${currencyMetrics.totalUsd.toLocaleString('ru-RU')}`
              : ''
          }`
        : `款号：${concept.code} · 标准：AQL 1.5`,
      subtitle: includePricing
        ? `Фабрика: ${factoryName} · Сумма партии: ¥ ${currencyMetrics.totalCny.toLocaleString(
            'ru-RU'
          )} / $ ${currencyMetrics.totalUsd.toLocaleString('ru-RU')}${
            showRubInPdf
              ? ` / ${currencyMetrics.totalRub.toLocaleString('ru-RU')} ₽`
              : ''
          }`
        : `Фабрика: ${factoryName} · Готовность: ${plannedReadyDate}`,
      metaGrid: [
        {
          label: '款号 · Артикул',
          value: concept.code,
          subValueRu: `Код модели ${concept.code}`,
        },
        {
          label: '生产工厂 · Фабрика',
          value: includeFactoryTerms ? factoryNameZh : '—',
          subValueRu: includeFactoryTerms ? factoryName : 'Скрыто',
        },
        {
          label: '单价 · Цена 1 ед.',
          value: includePricing
            ? `¥${currencyMetrics.unitCny} · $${currencyMetrics.unitUsd}`
            : '隐藏价格',
          subValueRu: includePricing
            ? showRubInPdf
              ? `${currencyMetrics.unitRub} ₽ / ед.`
              : 'За 1 ед. (CNY / USD)'
            : 'Скрыто настройками PDF',
        },
        {
          label: '总数量及金额 · Тираж и сумма',
          value: includePricing
            ? `${currencyMetrics.totalUnits.toLocaleString('ru-RU')} 件 · ¥${currencyMetrics.totalCny.toLocaleString('ru-RU')}`
            : `${currencyMetrics.totalUnits.toLocaleString('ru-RU')} 件 (${currencyMetrics.totalPacks.toLocaleString('ru-RU')} 组)`,
          subValueRu: includePricing
            ? showRubInPdf
              ? `$${currencyMetrics.totalUsd.toLocaleString('ru-RU')} · ${currencyMetrics.totalRub.toLocaleString('ru-RU')} ₽`
              : `${currencyMetrics.totalPacks.toLocaleString('ru-RU')} (${prodProfile.packUnitLabelRu.toLowerCase()}) · $${currencyMetrics.totalUsd.toLocaleString('ru-RU')}`
            : `${currencyMetrics.totalPacks.toLocaleString('ru-RU')} (${prodProfile.packUnitLabelRu.toLowerCase()}) · ${currencyMetrics.totalUnits.toLocaleString('ru-RU')} (${prodProfile.itemsUnitLabelRu.toLowerCase()})`,
        },
      ],
      frontPhotoUrl: includePhotos ? resolvePublicAssetUrl(frontPhotoUrl) : undefined,
      backPhotoUrl: includePhotos ? resolvePublicAssetUrl(backPhotoUrl) : undefined,
      frontPhotoCaption: frontCaption,
      backPhotoCaption: backCaption,
      sections: sectionsToRender,
      footerRight: `${concept.code}${
        includePricing
          ? ` · ¥${currencyMetrics.totalCny.toLocaleString('ru-RU')} / $${currencyMetrics.totalUsd.toLocaleString('ru-RU')}${
              showRubInPdf
                ? ` / ${currencyMetrics.totalRub.toLocaleString('ru-RU')}₽`
                : ''
            }`
          : ''
      }`,
    });

    if (onSaveToConcept) {
      const todayIso = new Date().toISOString().slice(0, 10);
      const updatedOrder = {
        ...(existingOrder || {
          id: `po-pdf-${Date.now()}`,
          orderNumber: 'PO-2027-01',
          contactPerson: 'Менеджер производства',
          approvedSampleVersion: concept.samples?.[0]?.versionCode || 'Версия 1',
          internalStatus: 'order_placed' as const,
          sizeBreakdown: packsBySize,
          packColorComposition:
            concept.colorCombinations?.join(', ') || 'Базовая палитра паспорта SKU',
          packConfiguration: `${unitsPerPack} ед. в комплекте`,
          packagingDetails:
            'Фирменная упаковка со штрихкодом EAN-13 / Честный ЗНАК',
          orderVersion: 1,
          approvedAt: todayIso,
          chineseVerified: true,
          qcNotes: 'AQL 1.5',
          logisticsTracking: '',
        }),
        factoryName,
        materialAndColors: cleanTechPackText(
          bilingualRows[1]?.ruSmall || existingOrder?.materialAndColors,
          prodProfile.defaultMaterialRu
        ),
        packsBySize,
        unitsPerPack,
        totalUnits: currencyMetrics.totalUnits,
        unitPrice:
          primaryCurrency === 'RUB'
            ? currencyMetrics.unitRub
            : primaryCurrency === 'CNY'
            ? currencyMetrics.unitCny
            : currencyMetrics.unitUsd,
        currency: primaryCurrency,
        plannedReadyDate,
        paymentTerms,
      };

      onSaveToConcept({
        imageUrl: frontPhotoUrl,
        plannedUnitCost: currencyMetrics.unitRub,
        packUnitsCount: unitsPerPack,
        supplierName: factoryName,
        currency: primaryCurrency,
        productionOrders: [updatedOrder, ...(concept.productionOrders?.slice(1) || [])],
        techPack: {
          ...concept.techPack,
          zh: {
            ...concept.techPack.zh,
            construction: cleanTechPackText(
              bilingualRows[0]?.zhLarge || concept.techPack.zh.construction,
              prodProfile.defaultConstructionZh
            ),
            compositionAndDensity: cleanTechPackText(
              bilingualRows[1]?.zhLarge || concept.techPack.zh.compositionAndDensity,
              prodProfile.defaultMaterialZh
            ),
          },
          ru: {
            ...concept.techPack.ru,
            construction: cleanTechPackText(
              bilingualRows[0]?.ruSmall || concept.techPack.ru.construction,
              prodProfile.defaultConstructionRu
            ),
            compositionAndDensity: cleanTechPackText(
              bilingualRows[1]?.ruSmall || concept.techPack.ru.compositionAndDensity,
              prodProfile.defaultMaterialRu
            ),
          },
        },
      });
    }
  };

  const allCardPhotos = useMemo(() => {
    const urls = new Set<string>();
    if (concept.imageUrl) urls.add(concept.imageUrl);
    concept.galleryPhotos?.forEach((g) => {
      if (g.url) urls.add(g.url);
    });
    concept.samples?.forEach((s) => {
      s.photos?.forEach((p) => {
        if (p) urls.add(p);
      });
    });
    urls.add('images/products/rnd-soft-boxers.jpg');
    urls.add('images/products/rnd-seamless-base.jpg');
    urls.add('images/products/rnd-print-family.jpg');
    urls.add('images/products/borners-editorial-hero.jpg');
    urls.add('images/products/natele-editorial-hero.jpg');
    return Array.from(urls);
  }, [concept]);

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[70] bg-black/55 backdrop-blur-[2px] flex items-center justify-center p-3 md:p-6 overflow-y-auto"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[1440px] max-h-[92vh] bg-[#FAF8F5] rounded-[18px] border-2 border-[#181715] shadow-2xl flex flex-col overflow-hidden"
      >
        {/* ШАПКА КОНСТРУКТОРА PDF */}
        <div className="px-6 py-4 bg-white border-b-2 border-[#181715] flex flex-wrap items-center justify-between gap-4 shrink-0">
          <div>
            <div className="flex items-center gap-2 text-[11.5px] font-mono uppercase tracking-wider text-[#B85D35] font-semibold">
              <span>КОНСТРУКТОР PDF ПЕРЕД ОТПРАВКОЙ НА ФАБРИКУ</span>
              <span>·</span>
              <span>中文 КРУПНО + РУССКИЙ МЕЛКО</span>
              <span>·</span>
              <span>CNY ¥ / USD $ / RUB ₽</span>
            </div>
            <h2 className="font-serif-editorial text-[24px] font-semibold text-[#181715] leading-tight mt-0.5">
              Настройка и выгрузка карточки «{concept.name}» в PDF (А4)
            </h2>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={handleDownloadPdf}
              className="inline-flex items-center gap-2 rounded-[10px] bg-[#181715] hover:bg-[#B85D35] text-white px-5 py-2.5 text-[13.5px] font-semibold transition cursor-pointer shadow-xs"
            >
              <FileText className="h-4 w-4" />
              <span>Скачать готовый PDF (А4)</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              title="Закрыть (или кликните на пустое место вокруг окна)"
              className="h-10 w-10 rounded-[10px] border-[1.5px] border-[#D4CDC2] hover:border-[#181715] bg-white flex items-center justify-center text-[#181715] cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* ОСНОВНАЯ ЧАСТЬ: СЛЕВА КОНСТРУКТОР, СПРАВА ЖИВОЙ ПРЕДПРОСМОТР ЛИСТА PDF */}
        <div className="flex-1 overflow-y-auto grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x-2 divide-[#D4CDC2]">
          {/* ЛЕВАЯ КОЛОНКА: НАСТРОЙКИ КОНСТРУКТОРА (7 колонок) */}
          <div className="lg:col-span-7 p-6 space-y-6 overflow-y-auto">
            {/* БЛОК 0: ВЫБОР БЛОКОВ ДЛЯ ОТОБРАЖЕНИЯ В PDF ПЕРЕД СКАЧИВАНИЕМ */}
            <div className="rounded-[16px] bg-white border border-[#E5E0D5] p-5 space-y-4 shadow-xs">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#EFECE6] pb-3">
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[#B85D35]">
                    ШАГ 00 · ЧТО ВКЛЮЧИТЬ В PDF ПЕРЕД СКАЧИВАНИЕМ
                  </span>
                  <h3 className="text-[16px] font-bold text-[#1D1D1F]">
                    Отметьте блоки, которые должны попасть в итоговый PDF-файл
                  </h3>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setIncludePhotos(true);
                      setIncludeBilingualSpecs(true);
                      setIncludePricing(true);
                      setIncludeSizeMatrix(true);
                      setIncludeFactoryTerms(true);
                      setIncludeTotalSumColumn(true);
                    }}
                    className="px-2.5 py-1 rounded-lg bg-[#1D1D1F] text-white text-[11px] font-semibold cursor-pointer"
                  >
                    Все блоки
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIncludePhotos(true);
                      setIncludeBilingualSpecs(true);
                      setIncludePricing(true);
                      setIncludeSizeMatrix(true);
                      setIncludeFactoryTerms(true);
                      setShowRubInPdf(false);
                    }}
                    className="px-2.5 py-1 rounded-lg bg-[#E6F4EE] hover:bg-[#D2ECDF] text-[#1F6E50] text-[11px] font-semibold cursor-pointer"
                  >
                    Для фабрики КНР (без ₽)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIncludePhotos(true);
                      setIncludeBilingualSpecs(true);
                      setIncludePricing(false);
                      setIncludeSizeMatrix(true);
                      setIncludeFactoryTerms(false);
                    }}
                    className="px-2.5 py-1 rounded-lg bg-[#F2EFE9] hover:bg-[#E5E0D5] text-[#1D1D1F] text-[11px] font-semibold cursor-pointer"
                  >
                    ТЗ без цен
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {[
                  {
                    label: 'Фото товара (正面图 + 背面图)',
                    sub: 'Лицевая и оборотная фотографии',
                    checked: includePhotos,
                    onChange: setIncludePhotos,
                  },
                  {
                    label: 'Китайский крупно + Русский мелко',
                    sub: 'Двуязычная спецификация (中文 вверху / RU внизу)',
                    checked: includeBilingualSpecs,
                    onChange: setIncludeBilingualSpecs,
                  },
                  {
                    label: 'Валюты и цены (单价 / 金额)',
                    sub: 'Себестоимость 1 шт. и бюджет заказа',
                    checked: includePricing,
                    onChange: setIncludePricing,
                  },
                  {
                    label: 'Столбец «Сумма» (合计金额)',
                    sub: 'Итоговая сумма по каждому размеру в таблице',
                    checked: includeTotalSumColumn,
                    onChange: setIncludeTotalSumColumn,
                  },
                  {
                    label: 'Сумма в рублях (RUB ₽)',
                    sub: 'Включить или отключить показ рублей ₽ в столбцах',
                    checked: showRubInPdf,
                    onChange: setShowRubInPdf,
                  },
                  {
                    label: `Размерная сетка (${prodProfile.sizes[0]}–${prodProfile.sizes[prodProfile.sizes.length - 1]})`,
                    sub: `${prodProfile.packUnitLabelRu} и ${prodProfile.itemsUnitLabelRu.toLowerCase()} по размерам`,
                    checked: includeSizeMatrix,
                    onChange: setIncludeSizeMatrix,
                  },
                  {
                    label: 'Условия фабрики и сроки',
                    sub: 'Поставщик, дата готовности и оплата',
                    checked: includeFactoryTerms,
                    onChange: setIncludeFactoryTerms,
                  },
                ].map((opt) => (
                  <label
                    key={opt.label}
                    className={`flex items-start gap-2.5 p-3 rounded-[12px] border transition cursor-pointer ${
                      opt.checked
                        ? 'bg-[#FDFBF7] border-[#C8A97E] shadow-2xs'
                        : 'bg-[#FAF8F5] border-[#E5E0D5] opacity-65'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={opt.checked}
                      onChange={(e) => opt.onChange(e.target.checked)}
                      className="mt-0.5 h-4 w-4 accent-[#1E3A5F] rounded cursor-pointer"
                    />
                    <div className="min-w-0">
                      <div className="text-[12.5px] font-semibold text-[#1D1D1F] leading-snug">
                        {opt.label}
                      </div>
                      <div className="text-[11px] text-[#6E6E73] leading-tight mt-0.5">
                        {opt.sub}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* БЛОК 1: ФОТОГРАФИИ ТОВАРА (ЛИЦЕВАЯ + ВИД СЗАДИ/ДЕТАЛИ) */}
            <div className="rounded-[14px] bg-white border-[1.5px] border-[#CFC8BC] p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-[#EAE6DF] pb-3">
                <div>
                  <span className="text-[11px] font-mono uppercase tracking-wider text-[#B85D35] font-semibold">
                    ШАГ 01 · ФОТОГРАФИИ В PDF
                  </span>
                  <h3 className="text-[16px] font-semibold text-[#181715]">
                    Лицевая фотография товара и вид сзади / детали
                  </h3>
                </div>
                <span className="text-[12px] text-[#1F6E50] font-medium bg-[#E6F4EE] px-2.5 py-1 rounded-[6px]">
                  ✓ Встраиваются прямо в PDF
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Лицевая фотография */}
                <div className="rounded-[12px] border-[1.5px] border-[#D4CDC2] bg-[#FAF8F5] p-3.5 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[12.5px] font-semibold text-[#181715]">
                      1. Лицевая фотография (正面图)
                    </span>
                    <label className="inline-flex items-center gap-1.5 rounded-[7px] bg-[#181715] text-white px-2.5 py-1 text-[11.5px] font-medium cursor-pointer hover:bg-[#B85D35] transition">
                      <Upload className="h-3.5 w-3.5" />
                      <span>Загрузить фото</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => handleUploadPhoto('front', e)}
                        className="hidden"
                      />
                    </label>
                  </div>

                  <div className="h-40 rounded-[8px] bg-white border border-[#E5E0D8] flex items-center justify-center overflow-hidden p-2">
                    <img
                      src={resolvePublicAssetUrl(frontPhotoUrl)}
                      alt="Лицевая фотография"
                      decoding="async"
                      className="max-h-full max-w-full object-contain rounded-[6px]"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] text-[#7A756D] mb-1">
                      Подпись к лицевой фотографии:
                    </label>
                    <input
                      value={frontCaption}
                      onChange={(e) => setFrontCaption(e.target.value)}
                      className="w-full rounded-[7px] border border-[#D4CDC2] bg-white px-2.5 py-1.5 text-[12.5px] text-[#181715]"
                    />
                  </div>

                  <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                    {allCardPhotos.map((u, idx) => (
                      <button
                        key={`f-${idx}`}
                        type="button"
                        onClick={() => setFrontPhotoUrl(u)}
                        className={`h-10 w-10 rounded-[6px] border-2 overflow-hidden shrink-0 cursor-pointer ${
                          frontPhotoUrl === u ? 'border-[#B85D35]' : 'border-transparent opacity-70 hover:opacity-100'
                        }`}
                      >
                        <img src={resolvePublicAssetUrl(u)} alt="" className="h-full w-full object-cover" />
                      </button>
                    ))}
                  </div>
                </div>

                {/* Вторая фотография (вид сзади / детали) */}
                <div className="rounded-[12px] border-[1.5px] border-[#D4CDC2] bg-[#FAF8F5] p-3.5 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[12.5px] font-semibold text-[#181715]">
                      2. Вид сзади / детали (背面图)
                    </span>
                    <label className="inline-flex items-center gap-1.5 rounded-[7px] bg-[#181715] text-white px-2.5 py-1 text-[11.5px] font-medium cursor-pointer hover:bg-[#B85D35] transition">
                      <Upload className="h-3.5 w-3.5" />
                      <span>Загрузить фото</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => handleUploadPhoto('back', e)}
                        className="hidden"
                      />
                    </label>
                  </div>

                  <div className="h-40 rounded-[8px] bg-white border border-[#E5E0D8] flex items-center justify-center overflow-hidden p-2">
                    <img
                      src={resolvePublicAssetUrl(backPhotoUrl)}
                      alt="Вид сзади"
                      decoding="async"
                      className="max-h-full max-w-full object-contain rounded-[6px]"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] text-[#7A756D] mb-1">
                      Подпись ко второй фотографии:
                    </label>
                    <input
                      value={backCaption}
                      onChange={(e) => setBackCaption(e.target.value)}
                      className="w-full rounded-[7px] border border-[#D4CDC2] bg-white px-2.5 py-1.5 text-[12.5px] text-[#181715]"
                    />
                  </div>

                  <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                    {allCardPhotos.map((u, idx) => (
                      <button
                        key={`b-${idx}`}
                        type="button"
                        onClick={() => setBackPhotoUrl(u)}
                        className={`h-10 w-10 rounded-[6px] border-2 overflow-hidden shrink-0 cursor-pointer ${
                          backPhotoUrl === u ? 'border-[#B85D35]' : 'border-transparent opacity-70 hover:opacity-100'
                        }`}
                      >
                        <img src={resolvePublicAssetUrl(u)} alt="" className="h-full w-full object-cover" />
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* БЛОК 2: МУЛЬТИВАЛЮТНЫЙ КАЛЬКУЛЯТОР (CNY ¥ / USD $ / RUB ₽) */}
            <div className="rounded-[14px] bg-white border-[1.5px] border-[#CFC8BC] p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#EAE6DF] pb-3">
                <div>
                  <span className="text-[11px] font-mono uppercase tracking-wider text-[#B85D35] font-semibold">
                    ШАГ 02 · УЧЁТ ВАЛЮТ (ЮАНИ / ДОЛЛАРЫ / РУБЛИ)
                  </span>
                  <h3 className="text-[16px] font-semibold text-[#181715]">
                    Валюта контракта и автоматический пересчёт CNY ¥ · USD $ · RUB ₽
                  </h3>
                </div>

                <div className="inline-flex rounded-[8px] bg-[#F2EFE9] p-1 border border-[#D4CDC2]">
                  {(
                    [
                      { code: 'CNY', label: '¥ Юани (CNY)' },
                      { code: 'USD', label: '$ Доллары (USD)' },
                      { code: 'RUB', label: '₽ Рубли (RUB)' },
                    ] as const
                  ).map((c) => (
                    <button
                      key={c.code}
                      type="button"
                      onClick={() => handleCurrencySwitch(c.code)}
                      className={`px-3 py-1.5 rounded-[6px] text-[12.5px] font-semibold transition cursor-pointer ${
                        primaryCurrency === c.code
                          ? 'bg-[#181715] text-white shadow-2xs'
                          : 'text-[#5C5852] hover:text-[#181715]'
                      }`}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11.5px] font-medium text-[#5C5852] mb-1">
                    Цена за 1 шт. в {primaryCurrency}:
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={unitPriceInPrimary}
                    onChange={(e) => setUnitPriceInPrimary(Number(e.target.value) || 0)}
                    className="w-full rounded-[8px] border-[1.5px] border-[#181715] bg-[#FAF8F5] px-3 py-2 text-[15px] font-semibold text-[#181715]"
                  />
                </div>
                <div>
                  <label className="block text-[11.5px] font-medium text-[#5C5852] mb-1">
                    Курс юаня (1 CNY ¥ = ₽):
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={rateCnyToRub}
                    onChange={(e) => setRateCnyToRub(Number(e.target.value) || 1)}
                    className="w-full rounded-[8px] border border-[#D4CDC2] bg-white px-3 py-2 text-[14px] text-[#181715]"
                  />
                </div>
                <div>
                  <label className="block text-[11.5px] font-medium text-[#5C5852] mb-1">
                    Курс доллара (1 USD $ = ₽):
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    value={rateUsdToRub}
                    onChange={(e) => setRateUsdToRub(Number(e.target.value) || 1)}
                    className="w-full rounded-[8px] border border-[#D4CDC2] bg-white px-3 py-2 text-[14px] text-[#181715]"
                  />
                </div>
              </div>

              {/* Сводная плашка в 3 валютах */}
              <div className="grid grid-cols-3 gap-3 pt-1">
                <div
                  className={`rounded-[10px] p-3 border-[1.5px] ${
                    primaryCurrency === 'CNY'
                      ? 'bg-[#FBF3EE] border-[#B85D35]'
                      : 'bg-[#FAF8F5] border-[#E5E0D8]'
                  }`}
                >
                  <div className="text-[11px] font-mono uppercase text-[#7A756D]">
                    ЮАНИ · CNY (¥)
                  </div>
                  <div className="text-[18px] font-bold text-[#181715] mt-0.5">
                    ¥ {currencyMetrics.unitCny} <span className="text-[12px] font-normal">/ шт.</span>
                  </div>
                  <div className="text-[12px] text-[#B85D35] font-semibold mt-0.5">
                    Партия: ¥ {currencyMetrics.totalCny.toLocaleString('ru-RU')}
                  </div>
                </div>

                <div
                  className={`rounded-[10px] p-3 border-[1.5px] ${
                    primaryCurrency === 'USD'
                      ? 'bg-[#FBF3EE] border-[#B85D35]'
                      : 'bg-[#FAF8F5] border-[#E5E0D8]'
                  }`}
                >
                  <div className="text-[11px] font-mono uppercase text-[#7A756D]">
                    ДОЛЛАРЫ · USD ($)
                  </div>
                  <div className="text-[18px] font-bold text-[#181715] mt-0.5">
                    $ {currencyMetrics.unitUsd} <span className="text-[12px] font-normal">/ шт.</span>
                  </div>
                  <div className="text-[12px] text-[#B85D35] font-semibold mt-0.5">
                    Партия: $ {currencyMetrics.totalUsd.toLocaleString('ru-RU')}
                  </div>
                </div>

                <div
                  className={`rounded-[10px] p-3 border-[1.5px] transition ${
                    !showRubInPdf
                      ? 'bg-[#F5F3EE] border-dashed border-[#CFC8BC] opacity-65'
                      : primaryCurrency === 'RUB'
                      ? 'bg-[#FBF3EE] border-[#B85D35]'
                      : 'bg-[#FAF8F5] border-[#E5E0D8]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[11px] font-mono uppercase text-[#7A756D]">
                      РУБЛИ · RUB (₽)
                    </span>
                    <span
                      className={`text-[9.5px] font-semibold px-1.5 py-0.5 rounded ${
                        showRubInPdf
                          ? 'bg-[#E6F4EE] text-[#1F6E50]'
                          : 'bg-[#EFECE6] text-[#7A756D]'
                      }`}
                    >
                      {showRubInPdf ? 'В PDF ВКЛ.' : 'СКРЫТО В PDF'}
                    </span>
                  </div>
                  <div className="text-[18px] font-bold text-[#181715] mt-0.5">
                    {currencyMetrics.unitRub} ₽ <span className="text-[12px] font-normal">/ шт.</span>
                  </div>
                  <div className="text-[12px] text-[#B85D35] font-semibold mt-0.5">
                    Партия: {currencyMetrics.totalRub.toLocaleString('ru-RU')} ₽
                  </div>
                </div>
              </div>

              {/* Переключатели столбца суммы и рублей в таблице PDF */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                <label
                  className={`flex items-start gap-2.5 p-3 rounded-[10px] border cursor-pointer transition ${
                    showRubInPdf
                      ? 'bg-[#FDFBF7] border-[#B85D35]'
                      : 'bg-[#FAF8F5] border-[#D4CDC2]'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={showRubInPdf}
                    onChange={(e) => setShowRubInPdf(e.target.checked)}
                    className="mt-0.5 h-4 w-4 accent-[#181715] rounded cursor-pointer"
                  />
                  <div>
                    <div className="text-[12.5px] font-semibold text-[#181715]">
                      Показывать сумму в рублях (RUB ₽) в столбце таблицы
                    </div>
                    <div className="text-[11px] text-[#6E6A63] mt-0.5">
                      {showRubInPdf
                        ? 'Сейчас рубли ₽ включены в столбцах «Цена» и «Сумма»'
                        : 'Рубли ₽ скрыты для китайской фабрики (в PDF только ¥ CNY / $ USD)'}
                    </div>
                  </div>
                </label>

                <label
                  className={`flex items-start gap-2.5 p-3 rounded-[10px] border cursor-pointer transition ${
                    includeTotalSumColumn
                      ? 'bg-[#FDFBF7] border-[#B85D35]'
                      : 'bg-[#FAF8F5] border-[#D4CDC2]'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={includeTotalSumColumn}
                    onChange={(e) => setIncludeTotalSumColumn(e.target.checked)}
                    className="mt-0.5 h-4 w-4 accent-[#181715] rounded cursor-pointer"
                  />
                  <div>
                    <div className="text-[12.5px] font-semibold text-[#181715]">
                      Показывать столбец «合计金额 / Сумма» в таблице
                    </div>
                    <div className="text-[11px] text-[#6E6A63] mt-0.5">
                      {includeTotalSumColumn
                        ? 'Столбец итоговой суммы по каждому размеру включён'
                        : 'Столбец суммы отключён (остаются только размеры, короба и штуки)'}
                    </div>
                  </div>
                </label>
              </div>
            </div>

            {/* БЛОК 3: КРУПНЫЙ КИТАЙСКИЙ + МАЛЕНЬКИЙ РУССКИЙ (РЕДАКТОР СТРОК) */}
            <div className="rounded-[14px] bg-white border-[1.5px] border-[#CFC8BC] p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-[#EAE6DF] pb-3">
                <div>
                  <span className="text-[11px] font-mono uppercase tracking-wider text-[#B85D35] font-semibold">
                    ШАГ 03 · КИТАЙСКИЙ КРУПНО + РУССКИЙ ПОДСТРОЧНО
                  </span>
                  <h3 className="text-[16px] font-semibold text-[#181715]">
                    Техническое описание для фабрики (редактируемые блоки)
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setBilingualRows((prev) => [
                      ...prev,
                      {
                        id: `row-${Date.now()}`,
                        labelZh: '补充工艺要求',
                        labelRu: 'Дополнительное требование',
                        zhLarge: '请严格按照确认样衣尺寸及色卡生产',
                        ruSmall: 'Строго соблюдать табель мер и утверждённый выкрас образца',
                        highlight: false,
                      },
                    ])
                  }
                  className="inline-flex items-center gap-1.5 rounded-[8px] border-[1.5px] border-[#181715] bg-[#FAF8F5] hover:bg-[#181715] hover:text-white px-3 py-1.5 text-[12px] font-semibold transition cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Добавить блок</span>
                </button>
              </div>

              <div className="space-y-3">
                {bilingualRows.map((row, idx) => (
                  <div
                    key={row.id}
                    className="rounded-[10px] border border-[#D4CDC2] bg-[#FAF8F5] p-3.5 space-y-2.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 flex-1">
                        <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded bg-[#181715] text-white">
                          0{idx + 1}
                        </span>
                        <input
                          value={row.labelZh}
                          onChange={(e) =>
                            setBilingualRows((prev) =>
                              prev.map((r) =>
                                r.id === row.id ? { ...r, labelZh: e.target.value } : r
                              )
                            )
                          }
                          className="rounded border border-[#D4CDC2] bg-white px-2 py-1 text-[12px] font-semibold text-[#181715] w-40"
                          placeholder="Заголовок ZH"
                        />
                        <input
                          value={row.labelRu}
                          onChange={(e) =>
                            setBilingualRows((prev) =>
                              prev.map((r) =>
                                r.id === row.id ? { ...r, labelRu: e.target.value } : r
                              )
                            )
                          }
                          className="rounded border border-[#D4CDC2] bg-white px-2 py-1 text-[12px] text-[#5C5852] flex-1"
                          placeholder="Заголовок RU"
                        />
                      </div>
                      {bilingualRows.length > 1 && (
                        <button
                          type="button"
                          onClick={() =>
                            setBilingualRows((prev) => prev.filter((r) => r.id !== row.id))
                          }
                          className="text-[#8C867E] hover:text-[#B93829] p-1 cursor-pointer"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-[#B85D35] mb-0.5">
                        КРУПНЫЙ КИТАЙСКИЙ ТЕКСТ (大号中文 — главный для фабрики):
                      </label>
                      <input
                        value={row.zhLarge}
                        onChange={(e) =>
                          setBilingualRows((prev) =>
                            prev.map((r) =>
                              r.id === row.id ? { ...r, zhLarge: e.target.value } : r
                            )
                          )
                        }
                        className="w-full rounded-[7px] border-[1.5px] border-[#CFC8BC] bg-white px-3 py-2 text-[17px] font-bold text-[#181715]"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] text-[#6E6A63] mb-0.5">
                        Подстрочный русский текст (мелким шрифтом под китайским):
                      </label>
                      <input
                        value={row.ruSmall}
                        onChange={(e) =>
                          setBilingualRows((prev) =>
                            prev.map((r) =>
                              r.id === row.id ? { ...r, ruSmall: e.target.value } : r
                            )
                          )
                        }
                        className="w-full rounded-[7px] border border-[#D4CDC2] bg-white px-3 py-1.5 text-[12.5px] text-[#4A4742]"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* БЛОК 4: РАЗМЕРНАЯ СЕТКА И РЕКВИЗИТЫ КОНТРАКТА */}
            <div className="rounded-[14px] bg-white border-[1.5px] border-[#CFC8BC] p-5 space-y-4">
              <div className="border-b border-[#EAE6DF] pb-3">
                <span className="text-[11px] font-mono uppercase tracking-wider text-[#B85D35] font-semibold">
                  ШАГ 04 · РАЗМЕРНАЯ СЕТКА И УСЛОВИЯ
                </span>
                <h3 className="text-[16px] font-semibold text-[#181715]">
                  {prodProfile.packUnitLabelRu} по размерам ({prodProfile.sizeGridLabelRu}) и фабрика
                </h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11.5px] font-semibold text-[#B85D35] mb-1">
                    Заголовок PDF на китайском (крупно сверху):
                  </label>
                  <input
                    value={docTitleZh}
                    onChange={(e) => setDocTitleZh(e.target.value)}
                    className="w-full rounded-[8px] border-[1.5px] border-[#CFC8BC] px-3 py-1.5 text-[14px] font-bold text-[#181715]"
                  />
                </div>
                <div>
                  <label className="block text-[11.5px] text-[#5C5852] mb-1">
                    Заголовок на русском (мелко внизу под китайским):
                  </label>
                  <input
                    value={docTitle}
                    onChange={(e) => setDocTitle(e.target.value)}
                    className="w-full rounded-[8px] border border-[#D4CDC2] px-3 py-1.5 text-[13px]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div>
                  <label className="block text-[11.5px] font-semibold text-[#B85D35] mb-1">
                    Фабрика (中文 крупно):
                  </label>
                  <input
                    value={factoryNameZh}
                    onChange={(e) => setFactoryNameZh(e.target.value)}
                    className="w-full rounded-[8px] border border-[#D4CDC2] px-3 py-1.5 text-[13px] font-semibold"
                  />
                </div>
                <div>
                  <label className="block text-[11.5px] text-[#5C5852] mb-1">
                    Фабрика (RU мелко внизу):
                  </label>
                  <input
                    value={factoryName}
                    onChange={(e) => setFactoryName(e.target.value)}
                    className="w-full rounded-[8px] border border-[#D4CDC2] px-3 py-1.5 text-[13px]"
                  />
                </div>
                <div>
                  <label className="block text-[11.5px] text-[#5C5852] mb-1">Дата готовности:</label>
                  <input
                    type="date"
                    value={plannedReadyDate}
                    onChange={(e) => setPlannedReadyDate(e.target.value)}
                    className="w-full rounded-[8px] border border-[#D4CDC2] px-3 py-1.5 text-[13px]"
                  />
                </div>
                <div>
                  <label className="block text-[11.5px] text-[#5C5852] mb-1">
                    {prodProfile.itemsUnitLabelRu} в 1 уп.:
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={24}
                    value={unitsPerPack}
                    onChange={(e) => setUnitsPerPack(Math.max(1, Number(e.target.value) || 1))}
                    className="w-full rounded-[8px] border border-[#D4CDC2] px-3 py-1.5 text-[13px]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-7 gap-2 pt-1">
                {orderedSizes.map((sz) => (
                  <div
                    key={sz}
                    className="rounded-[8px] border border-[#D4CDC2] bg-[#FAF8F5] p-2 text-center"
                  >
                    <div className="font-mono text-[12px] font-bold text-[#181715]">{sz}</div>
                    <input
                      type="number"
                      min={0}
                      value={packsBySize[sz] || 0}
                      onChange={(e) =>
                        setPacksBySize((prev) => ({
                          ...prev,
                          [sz]: Math.max(0, Number(e.target.value) || 0),
                        }))
                      }
                      className="mt-1 w-full rounded border border-[#D4CDC2] bg-white px-1.5 py-1 text-center text-[13px] font-semibold"
                    />
                    <div className="text-[10px] text-[#7A756D] mt-0.5 truncate" title={prodProfile.itemsUnitLabelRu}>
                      {((packsBySize[sz] || 0) * unitsPerPack).toLocaleString('ru-RU')} ед.
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ПРАВАЯ КОЛОНКА: ЖИВОЙ ПРЕДПРОСМОТР ЛИСТА PDF (5 колонок) */}
          <div className="lg:col-span-5 bg-[#EFECE6] p-6 flex flex-col justify-between space-y-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-mono uppercase tracking-wider font-semibold text-[#5C5852]">
                  Живой макет листа А4 (Предпросмотр PDF)
                </span>
                <span className="text-[11.5px] font-medium text-[#1F6E50] bg-[#E6F4EE] px-2.5 py-0.5 rounded">
                  Готов к выгрузке
                </span>
              </div>

              {/* ВИЗУАЛЬНЫЙ ЛИСТ A4 */}
              <div className="bg-[#FAF8F5] rounded-[12px] border-2 border-[#181715] shadow-lg p-5 space-y-4">
                <div className="border-b-2 border-[#181715] pb-3 flex items-start justify-between gap-2">
                  <div>
                    <div className="font-mono text-[10px] uppercase tracking-widest text-[#7A756D]">
                      BORNERS GROUP · 工厂生产技术工艺单 · {concept.code}
                    </div>
                    <div className="text-[20px] font-extrabold text-[#181715] leading-snug mt-0.5">
                      {docTitleZh}
                    </div>
                    <div className="text-[11.5px] text-[#6E6A63] leading-snug mt-0.5">
                      {docTitle}
                    </div>
                  </div>
                  <span className="px-2.5 py-1 rounded bg-[#181715] text-white font-mono text-[10.5px] font-semibold shrink-0">
                    {formatLabBrandLabel(concept.brandId)}
                  </span>
                </div>

                {/* Превью 2 фотографий: Лицевая + Вид сзади */}
                {includePhotos && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-[8px] bg-white border-[1.5px] border-[#CFC8BC] p-2.5 flex items-center gap-2.5">
                      <img
                        src={resolvePublicAssetUrl(frontPhotoUrl)}
                        alt="Лицевая"
                        className="h-16 w-16 rounded object-contain bg-[#F3EFE8] shrink-0"
                      />
                      <div className="min-w-0">
                        <div className="font-mono text-[9.5px] font-bold text-[#B85D35]">
                          01 · 正面实物图
                        </div>
                        <div className="text-[13px] font-bold text-[#181715] truncate">
                          请按正面图生产
                        </div>
                        <div className="text-[10.5px] text-[#6E6A63] line-clamp-2 leading-tight">
                          {frontCaption}
                        </div>
                      </div>
                    </div>

                    <div className="rounded-[8px] bg-white border-[1.5px] border-[#CFC8BC] p-2.5 flex items-center gap-2.5">
                      <img
                        src={resolvePublicAssetUrl(backPhotoUrl)}
                        alt="Вид сзади"
                        className="h-16 w-16 rounded object-contain bg-[#F3EFE8] shrink-0"
                      />
                      <div className="min-w-0">
                        <div className="font-mono text-[9.5px] font-bold text-[#B85D35]">
                          02 · 背面及细节
                        </div>
                        <div className="text-[13px] font-bold text-[#181715] truncate">
                          {prodProfile.defaultDetailCaptionZh}
                        </div>
                        <div className="text-[10.5px] text-[#6E6A63] line-clamp-2 leading-tight">
                          {backCaption}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Превью: Крупный китайский + маленький русский */}
                {includeBilingualSpecs && (
                  <div className="space-y-2">
                    <div className="text-[10.5px] font-mono uppercase tracking-wider text-[#B85D35] font-bold">
                      中文大字 + 俄文小字 · Спецификация для фабрики КНР
                    </div>
                    <div className="grid grid-cols-1 gap-2">
                      {bilingualRows.map((r) => (
                        <div
                          key={r.id}
                          className="rounded-[8px] bg-white border-[1.5px] border-[#D4CDC2] px-3 py-2"
                        >
                          <div className="text-[10px] font-mono text-[#8C867E]">
                            {r.labelZh} · {r.labelRu}
                          </div>
                          <div className="text-[17px] font-bold text-[#181715] leading-snug mt-0.5">
                            {r.zhLarge}
                          </div>
                          <div className="text-[11.5px] text-[#5C5852] leading-snug mt-0.5">
                            {r.ruSmall}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Превью мультивалютного итога */}
                {(includePricing || includeSizeMatrix) && (
                  <div className="rounded-[8px] bg-[#181715] text-white p-3.5 space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] font-mono text-[#D4CDC2]">
                      <span>
                        合计总量 · ИТОГО ({currencyMetrics.totalPacks.toLocaleString('ru-RU')} 盒 /{' '}
                        {currencyMetrics.totalUnits.toLocaleString('ru-RU')} 件)
                      </span>
                      <span>
                        {includePricing
                          ? `${showRubInPdf ? 'CNY / USD / RUB ₽' : 'CNY ¥ / USD $ (без ₽)'}`
                          : 'БЕЗ ЦЕН'}
                      </span>
                    </div>
                    {includePricing && (
                      <div
                        className={`grid ${
                          showRubInPdf ? 'grid-cols-3' : 'grid-cols-2'
                        } gap-2 pt-1 border-t border-white/15 text-center`}
                      >
                        <div>
                          <div className="text-[10px] text-[#D4CDC2]">人民币 · CNY</div>
                          <div className="text-[14px] font-bold text-[#F5B895]">
                            ¥ {currencyMetrics.totalCny.toLocaleString('ru-RU')}
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] text-[#D4CDC2]">美元 · USD</div>
                          <div className="text-[14px] font-bold text-white">
                            $ {currencyMetrics.totalUsd.toLocaleString('ru-RU')}
                          </div>
                        </div>
                        {showRubInPdf && (
                          <div>
                            <div className="text-[10px] text-[#D4CDC2]">卢布 · RUB</div>
                            <div className="text-[14px] font-bold text-white">
                              {currencyMetrics.totalRub.toLocaleString('ru-RU')} ₽
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="pt-2 flex flex-col gap-2">
              <button
                type="button"
                onClick={handleDownloadPdf}
                className="w-full inline-flex items-center justify-center gap-2 rounded-[10px] bg-[#181715] hover:bg-[#B85D35] text-white py-3.5 px-5 text-[14.5px] font-semibold transition cursor-pointer shadow-md"
              >
                <Check className="h-4 w-4" />
                <span>Сформировать и скачать PDF-спецификацию (А4)</span>
              </button>
              <div className="text-center text-[11.5px] text-[#6E6A63]">
                Кликните в любое пустое место за пределами окна, чтобы закрыть конструктор
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
