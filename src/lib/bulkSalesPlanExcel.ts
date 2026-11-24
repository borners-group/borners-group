// Массовый экспорт и импорт Excel (.xlsx) и CSV (.csv):
// цены реализации, себестоимость и помесячный план продаж (Янв–Дек)
// для всех брендов холдинга и отдельно для всех 269 размерных SKU LISKANI.

import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
import {
  LISKANI_2027_SCENARIO_ID,
  applyLiskaniSizeVariantsBulkPatch,
  type LiskaniSizeSkuSpec,
  type LiskaniSizeVariantBulkPatch,
} from './liskaniAssortment2027.ts';
import type { ScenarioModelSpec } from './scenarioData.ts';
import {
  detectModelBrandPortfolioLabel,
  ensureModelUnifiedV11,
  getEffectiveModelBuyoutRatePct,
  matchesBrandFilter,
  normalizePortfolioBrandCode,
} from './unifiedBusinessEngine.ts';

export type BulkTemplateMode = 'liskani_269' | 'brand_models';
export type BulkVolumeMetric = 'buyouts' | 'orders';

export const MONTHS_SHORT_RU_EXCEL = [
  'Янв',
  'Фев',
  'Мар',
  'Апр',
  'Май',
  'Июн',
  'Июл',
  'Авг',
  'Сен',
  'Окт',
  'Ноя',
  'Дек',
] as const;

export interface XlsxCellSpec {
  value: string | number | null | undefined;
  style?: 'header' | 'text' | 'int' | 'dec' | 'note';
}

export interface XlsxSheetSpec {
  name: string;
  colWidths?: number[];
  freezeTopRow?: boolean;
  autoFilter?: boolean;
  rows: XlsxCellSpec[][];
}

export interface ParsedSpreadsheet {
  fileName: string;
  format: 'xlsx' | 'csv';
  sheetName: string;
  rows: string[][];
  metadata: Record<string, string>;
}

export interface DetectedSpreadsheetColumns {
  headerRowIdx: number;
  skuIndexCol: number;
  modelCodeCol: number;
  sellerSkuCol: number;
  wbNmIdCol: number;
  barcodeCol: number;
  titleCol: number;
  priceCol: number;
  costCol: number;
  monthCols: Map<number, number>;
  detectedMetricHint: BulkVolumeMetric | null;
  metadataModeHint: BulkTemplateMode | null;
}

export interface BulkImportTotals {
  annualBuyoutsRub: number;
  annualOrdersRub: number;
  annualBuyoutsUnits: number;
  annualOrdersUnits: number;
  annualCogsRub: number;
  weightedAvgCostRub: number;
  weightedAvgPriceRub: number;
}

export interface BulkImportDiffRow {
  key: string;
  skuLabel: string;
  parentCode: string;
  subLabel: string;
  priceBefore: number;
  priceAfter: number;
  costBefore: number;
  costAfter: number;
  annualUnitsBefore: number;
  annualUnitsAfter: number;
  changedMonthsCount: number;
  sellerSkuFixed?: boolean;
}

export interface BulkImportUnmatchedRow {
  rowNumber: number;
  label: string;
  reason: string;
}

export interface BulkImportOptions {
  volumeMetric: BulkVolumeMetric;
  applyPrice: boolean;
  applyCost: boolean;
  applyMonths: boolean;
  canEditCost: boolean;
  canEditModel?: (model: ScenarioModelSpec) => boolean;
}

export interface BulkImportPreviewResult {
  mode: BulkTemplateMode;
  recommendedMode: BulkTemplateMode;
  detectedColumns: DetectedSpreadsheetColumns;
  totalDataRows: number;
  matchedRowsCount: number;
  changedSkusCount: number;
  priceChangedCount: number;
  costChangedCount: number;
  monthsChangedCount: number;
  metaFixedCount: number;
  duplicateRowsSkipped: number;
  skippedNoPermissionCount: number;
  unmatchedRows: BulkImportUnmatchedRow[];
  totalsBefore: BulkImportTotals;
  totalsAfter: BulkImportTotals;
  previewDiffRows: BulkImportDiffRow[];
  changedModelIds: string[];
  updatedModels: ScenarioModelSpec[];
}

// =============================================================================
// 1. ЧИСТЫЕ УТИЛИТЫ ДЛЯ XML, ЧИСЕЛ, ИДЕНТИФИКАТОРОВ И XLSX/CSV
// =============================================================================

function escapeXml(raw: string): string {
  return raw
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function unescapeXml(raw: string): string {
  return raw
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
      const cp = parseInt(hex, 16);
      return Number.isInteger(cp) && cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : '';
    })
    .replace(/&#(\d+);/g, (_, dec) => {
      const cp = parseInt(dec, 10);
      return Number.isInteger(cp) && cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : '';
    })
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function colIndexToLetter(idx: number): string {
  let n = idx + 1;
  let s = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function colLetterToIndex(letters: string): number {
  let n = 0;
  const up = letters.toUpperCase();
  for (let i = 0; i < up.length; i++) {
    n = n * 26 + (up.charCodeAt(i) - 64);
  }
  return n - 1;
}

export function parseRuNumber(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? raw : null;
  }
  const cleaned = String(raw)
    .replace(/(?:₽|руб\.?|р\.?)\s*\/\s*(?:шт|компл|пар|ед|уп)\.?/gi, '')
    .replace(/(?:₽|руб\.?|р\.?(?=\s|$)|шт\.?|компл\.?|пар\.?(?=\s|$)|ед\.?|уп\.?)/gi, '')
    .replace(/[\u00A0\u202F\s]/g, '')
    .trim();
  if (!cleaned || cleaned === '—' || cleaned === '-' || cleaned === '–') return null;

  let normalized = cleaned;
  const hasComma = normalized.includes(',');
  const hasDot = normalized.includes('.');

  if (hasComma && hasDot) {
    // Определяем, что является десятичным разделителем (последний из них)
    if (normalized.lastIndexOf(',') > normalized.lastIndexOf('.')) {
      normalized = normalized.replace(/\./g, '').replace(',', '.');
    } else {
      normalized = normalized.replace(/,/g, '');
    }
  } else if (hasComma) {
    // Поддерживаем как русскую десятичную запятую («2800,00», «1093,1», «0,500»),
    // так и англоязычный разделитель тысяч («2,800», «1,250,000»)
    const commaCount = (normalized.match(/,/g) || []).length;
    if (commaCount > 1 || /^[+-]?[1-9]\d{0,2},\d{3}$/.test(normalized)) {
      normalized = normalized.replace(/,/g, '');
    } else {
      normalized = normalized.replace(',', '.');
    }
  }

  const num = Number(normalized);
  return Number.isFinite(num) ? num : null;
}

export function normalizeExcelIntegerId(raw: string | number | null | undefined): string {
  if (raw === null || raw === undefined) return '';
  const trimmed = String(raw).trim();
  if (!trimmed || trimmed === '—' || trimmed === '-') return '';
  // Поддержка научной нотации Excel вроде «2.78887893E8» или «2.041688666155E12» и «278887893.0»
  if (/^[+-]?\d+(?:\.\d+)?[eE][+-]?\d+$/.test(trimmed) || /^\d+\.0+$/.test(trimmed)) {
    const n = Number(trimmed);
    if (Number.isFinite(n) && n >= 0) {
      return Math.round(n).toFixed(0);
    }
  }
  const digits = trimmed.replace(/[\u00A0\u202F\s]/g, '');
  if (/^\d+$/.test(digits)) return digits;
  return trimmed;
}

function normalizeLookupText(raw: string): string {
  return String(raw || '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[\u00A0\u202F]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function styleIdFor(style?: XlsxCellSpec['style']): number {
  switch (style) {
    case 'header':
      return 1;
    case 'int':
      return 2;
    case 'dec':
      return 3;
    case 'note':
      return 4;
    default:
      return 0;
  }
}

export function buildXlsxBytes(sheets: XlsxSheetSpec[]): Uint8Array {
  const safeSheets = sheets.length > 0 ? sheets : [{ name: 'Лист1', rows: [] }];

  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="2">
    <numFmt numFmtId="164" formatCode="#,##0"/>
    <numFmt numFmtId="165" formatCode="#,##0.00"/>
  </numFmts>
  <fonts count="3">
    <font><sz val="11"/><color rgb="FF141413"/><name val="Calibri"/></font>
    <font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
    <font><sz val="10"/><color rgb="FF5C5953"/><name val="Calibri"/></font>
  </fonts>
  <fills count="4">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF141413"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFFAF9F6"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border>
      <left style="thin"><color rgb="FFE4E1DA"/></left>
      <right style="thin"><color rgb="FFE4E1DA"/></right>
      <top style="thin"><color rgb="FFE4E1DA"/></top>
      <bottom style="thin"><color rgb="FFE4E1DA"/></bottom>
      <diagonal/>
    </border>
  </borders>
  <cellStyleXfs count="1">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
  </cellStyleXfs>
  <cellXfs count="5">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>
    <xf numFmtId="165" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>
    <xf numFmtId="0" fontId="2" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
  </cellXfs>
</styleSheet>`;

  const files: Record<string, Uint8Array> = {};

  const sheetOverrides: string[] = [];
  const workbookSheets: string[] = [];
  const workbookRels: string[] = [];

  safeSheets.forEach((sheet, idx) => {
    const sheetNum = idx + 1;
    const cleanName = escapeXml(sheet.name.replace(/[:\\/?*\[\]]/g, '').slice(0, 31) || `Лист${sheetNum}`);
    sheetOverrides.push(
      `<Override PartName="/xl/worksheets/sheet${sheetNum}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
    );
    workbookSheets.push(
      `<sheet name="${cleanName}" sheetId="${sheetNum}" r:id="rId${sheetNum}"/>`
    );
    workbookRels.push(
      `<Relationship Id="rId${sheetNum}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${sheetNum}.xml"/>`
    );

    const maxCols = sheet.rows.reduce((m, r) => Math.max(m, r.length), 1);
    const colsXml =
      sheet.colWidths && sheet.colWidths.length > 0
        ? `<cols>${sheet.colWidths
            .map(
              (w, cIdx) =>
                `<col min="${cIdx + 1}" max="${cIdx + 1}" width="${w}" customWidth="1"/>`
            )
            .join('')}</cols>`
        : '';

    const viewsXml = sheet.freezeTopRow
      ? `<sheetViews><sheetView${idx === 0 ? ' tabSelected="1"' : ''} workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`
      : `<sheetViews><sheetView${idx === 0 ? ' tabSelected="1"' : ''} workbookViewId="0"/></sheetViews>`;

    const rowsXml = sheet.rows
      .map((row, rIdx) => {
        const rowNum = rIdx + 1;
        const heightAttr = rIdx === 0 && sheet.freezeTopRow ? ' ht="24" customHeight="1"' : '';
        const cellsXml = row
          .map((cell, cIdx) => {
            const ref = `${colIndexToLetter(cIdx)}${rowNum}`;
            const sId = styleIdFor(cell.style);
            const v = cell.value;
            if (v === null || v === undefined || v === '') {
              return `<c r="${ref}" s="${sId}"/>`;
            }
            if (typeof v === 'number' && Number.isFinite(v)) {
              return `<c r="${ref}" s="${sId}"><v>${v}</v></c>`;
            }
            return `<c r="${ref}" s="${sId}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(
              String(v)
            )}</t></is></c>`;
          })
          .join('');
        return `<row r="${rowNum}"${heightAttr}>${cellsXml}</row>`;
      })
      .join('');

    const autoFilterXml =
      sheet.autoFilter && sheet.rows.length > 0
        ? `<autoFilter ref="A1:${colIndexToLetter(maxCols - 1)}${sheet.rows.length}"/>`
        : '';

    const worksheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  ${viewsXml}
  ${colsXml}
  <sheetData>${rowsXml}</sheetData>
  ${autoFilterXml}
</worksheet>`;

    files[`xl/worksheets/sheet${sheetNum}.xml`] = strToU8(worksheetXml);
  });

  const stylesRelId = `rId${safeSheets.length + 1}`;
  workbookRels.push(
    `<Relationship Id="${stylesRelId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`
  );

  files['[Content_Types].xml'] = strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  ${sheetOverrides.join('\n  ')}
</Types>`);

  files['_rels/.rels'] = strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`);

  files['xl/workbook.xml'] = strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>${workbookSheets.join('')}</sheets>
</workbook>`);

  files['xl/_rels/workbook.xml.rels'] = strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${workbookRels.join('\n  ')}
</Relationships>`);

  files['xl/styles.xml'] = strToU8(stylesXml);

  return zipSync(files, { level: 6 });
}

function parseSharedStringsXml(xml: string): string[] {
  const out: string[] = [];
  // Исключаем самозакрывающиеся <si/> и <t/>, чтобы они никогда не поглощали соседние теги
  const siRe =
    /<(?:[a-zA-Z0-9_]+:)?si(?:\s(?:[^/>]|\/(?!>))*)?>([\s\S]*?)<\/(?:[a-zA-Z0-9_]+:)?si>/g;
  let m: RegExpExecArray | null;
  while ((m = siRe.exec(xml)) !== null) {
    // Удаляем фонетические подсказки <rPh>...</rPh> (встречаются в Excel с азиатской локалью)
    const inner = m[1].replace(/<(?:[a-zA-Z0-9_]+:)?rPh\b[\s\S]*?<\/(?:[a-zA-Z0-9_]+:)?rPh>/g, '');
    const tRe =
      /<(?:[a-zA-Z0-9_]+:)?t(?:\s(?:[^/>]|\/(?!>))*)?>([\s\S]*?)<\/(?:[a-zA-Z0-9_]+:)?t>/g;
    let tm: RegExpExecArray | null;
    let combined = '';
    while ((tm = tRe.exec(inner)) !== null) {
      combined += unescapeXml(tm[1]);
    }
    out.push(combined);
  }
  return out;
}

function parseWorksheetXml(xml: string, sharedStrings: string[]): string[][] {
  const rows: string[][] = [];
  // Исключаем самозакрывающиеся пустые строки <row r="5"/>, чтобы не склеивать их со следующей строкой
  const rowRe =
    /<(?:[a-zA-Z0-9_]+:)?row\b(?:[^/>]|\/(?!>))*>([\s\S]*?)<\/(?:[a-zA-Z0-9_]+:)?row>/g;
  let rm: RegExpExecArray | null;
  while ((rm = rowRe.exec(xml)) !== null) {
    const rowInner = rm[1];
    const cells: string[] = [];
    let autoColIdx = 0;

    // Поддерживаем как <c .../>, так и <c ...>...</c>, включая namespace-префиксы (x:c)
    const cellRe =
      /<(?:[a-zA-Z0-9_]+:)?c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:[a-zA-Z0-9_]+:)?c>)/g;
    let cm: RegExpExecArray | null;
    while ((cm = cellRe.exec(rowInner)) !== null) {
      const attrs = cm[1] || '';
      const body = cm[2] || '';
      const refMatch = attrs.match(/\br="([A-Za-z]+)\d+"/);
      const colIdx = refMatch ? colLetterToIndex(refMatch[1]) : autoColIdx;
      autoColIdx = colIdx + 1;

      const typeMatch = attrs.match(/\bt=["']([^"']+)["']/);
      const cellType = typeMatch ? typeMatch[1] : '';

      let value = '';
      if (cellType === 'e') {
        // Ошибка формулы Excel (#DIV/0!, #REF!, #VALUE!, #N/A) — игнорируем, не превращаем в текст/артикул
        value = '';
      } else if (cellType === 'b') {
        const vMatch = body.match(
          /<(?:[a-zA-Z0-9_]+:)?v(?:\s(?:[^/>]|\/(?!>))*)?>([\s\S]*?)<\/(?:[a-zA-Z0-9_]+:)?v>/
        );
        value = vMatch && vMatch[1].trim() === '1' ? 'TRUE' : 'FALSE';
      } else if (cellType === 's') {
        const vMatch = body.match(
          /<(?:[a-zA-Z0-9_]+:)?v(?:\s(?:[^/>]|\/(?!>))*)?>([\s\S]*?)<\/(?:[a-zA-Z0-9_]+:)?v>/
        );
        if (vMatch) {
          const idx = Number(vMatch[1].trim());
          value = Number.isInteger(idx) && sharedStrings[idx] !== undefined ? sharedStrings[idx] : '';
        }
      } else if (cellType === 'inlineStr') {
        const cleanBody = body.replace(
          /<(?:[a-zA-Z0-9_]+:)?rPh\b[\s\S]*?<\/(?:[a-zA-Z0-9_]+:)?rPh>/g,
          ''
        );
        const tRe =
          /<(?:[a-zA-Z0-9_]+:)?t(?:\s(?:[^/>]|\/(?!>))*)?>([\s\S]*?)<\/(?:[a-zA-Z0-9_]+:)?t>/g;
        let tm: RegExpExecArray | null;
        while ((tm = tRe.exec(cleanBody)) !== null) {
          value += unescapeXml(tm[1]);
        }
      } else {
        const vMatch = body.match(
          /<(?:[a-zA-Z0-9_]+:)?v(?:\s(?:[^/>]|\/(?!>))*)?>([\s\S]*?)<\/(?:[a-zA-Z0-9_]+:)?v>/
        );
        if (vMatch) {
          value = unescapeXml(vMatch[1]);
        }
      }

      while (cells.length <= colIdx) cells.push('');
      cells[colIdx] = value;
    }

    if (cells.some((c) => c.trim().length > 0)) {
      rows.push(cells);
    }
  }
  return rows;
}

export function parseXlsxBytes(bytes: Uint8Array, fileName = 'upload.xlsx'): ParsedSpreadsheet {
  const entries = unzipSync(bytes);
  const entriesLower = new Map<string, Uint8Array>();
  for (const [k, v] of Object.entries(entries)) {
    entriesLower.set(k.replace(/^\/+/, '').toLowerCase(), v);
  }
  const readEntry = (path: string): string | null => {
    const clean = path.replace(/^\/+/, '');
    const buf = entries[clean] || entriesLower.get(clean.toLowerCase());
    return buf ? strFromU8(buf) : null;
  };

  const sharedXml = readEntry('xl/sharedStrings.xml');
  const sharedStrings = sharedXml ? parseSharedStringsXml(sharedXml) : [];

  const relMap = new Map<string, string>();
  const relsXml = readEntry('xl/_rels/workbook.xml.rels');
  if (relsXml) {
    const relRe = /<(?:[a-zA-Z0-9_]+:)?Relationship\b[^>]*>/g;
    let m: RegExpExecArray | null;
    while ((m = relRe.exec(relsXml)) !== null) {
      const tag = m[0];
      const idM = tag.match(/\bId=["']([^"']+)["']/);
      const targetM = tag.match(/\bTarget=["']([^"']+)["']/);
      if (idM && targetM) {
        let decodedTarget = targetM[1].replace(/\\/g, '/');
        try {
          decodedTarget = decodeURIComponent(decodedTarget);
        } catch {
          // оставляем исходный путь при некорректной %XX-последовательности
        }
        const target = decodedTarget.replace(/^(?:\.\.\/|\.\/|\/)+/, '');
        relMap.set(idM[1], target.startsWith('xl/') ? target : `xl/${target}`);
      }
    }
  }

  const sheetsOrder: Array<{ name: string; path: string; isHidden: boolean }> = [];
  const wbXml = readEntry('xl/workbook.xml');
  if (wbXml) {
    const sheetRe = /<(?:[a-zA-Z0-9_]+:)?sheet\b[^>]*>/g;
    let m: RegExpExecArray | null;
    let fallbackIdx = 1;
    while ((m = sheetRe.exec(wbXml)) !== null) {
      const tag = m[0];
      const nameM = tag.match(/\bname=["']([^"']+)["']/);
      const rIdM = tag.match(/(?:\s|:)id=["']([^"']+)["']/);
      const isHidden = /\bstate=["'](?:hidden|veryHidden)["']/i.test(tag);
      const name = nameM ? unescapeXml(nameM[1]) : `Лист${fallbackIdx}`;
      const path = (rIdM && relMap.get(rIdM[1])) || `xl/worksheets/sheet${fallbackIdx}.xml`;
      sheetsOrder.push({ name, path, isHidden });
      fallbackIdx += 1;
    }
  }
  if (sheetsOrder.length === 0) {
    sheetsOrder.push({ name: 'Лист1', path: 'xl/worksheets/sheet1.xml', isHidden: false });
  }

  const parsedSheets = sheetsOrder
    .map((s) => {
      const xml = readEntry(s.path);
      return {
        name: s.name,
        isHidden: s.isHidden,
        rows: xml ? parseWorksheetXml(xml, sharedStrings) : [],
      };
    })
    .filter((s) => s.rows.length > 0);

  // Извлекаем служебные метаданные с листа «Инструкция» (если он есть)
  const metadata: Record<string, string> = {};
  for (const s of parsedSheets) {
    for (const row of s.rows) {
      const k = (row[0] || '').trim();
      if (k.startsWith('borners_')) {
        metadata[k] = (row[1] || '').trim();
      }
    }
  }

  // Выбираем основной ВИДИМЫЙ лист данных (не «Инструкция» и не скрытый служебный лист, с распознанными колонками)
  const visibleSheets = parsedSheets.filter((s) => !s.isHidden);
  const candidateSheets = visibleSheets.length > 0 ? visibleSheets : parsedSheets;
  const primarySheet =
    candidateSheets.find(
      (s) =>
        !normalizeLookupText(s.name).includes('инструкц') &&
        detectSpreadsheetColumns(s.rows, metadata).headerRowIdx >= 0
    ) ||
    parsedSheets.find(
      (s) =>
        !normalizeLookupText(s.name).includes('инструкц') &&
        detectSpreadsheetColumns(s.rows, metadata).headerRowIdx >= 0
    ) ||
    candidateSheets.find((s) => !normalizeLookupText(s.name).includes('инструкц')) ||
    candidateSheets[0] ||
    parsedSheets[0] || { name: 'Лист1', rows: [] };

  return {
    fileName,
    format: 'xlsx',
    sheetName: primarySheet.name,
    rows: primarySheet.rows,
    metadata,
  };
}

function detectCsvDelimiter(sampleLines: string[]): ',' | ';' | '\t' {
  let commas = 0;
  let semis = 0;
  let tabs = 0;
  for (const line of sampleLines) {
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (!inQuotes) {
        if (ch === ',') commas += 1;
        else if (ch === ';') semis += 1;
        else if (ch === '\t') tabs += 1;
      }
    }
  }
  if (tabs >= semis && tabs >= commas && tabs > 0) return '\t';
  if (semis >= commas && semis > 0) return ';';
  return ',';
}

export function parseCsvText(rawText: string, fileName = 'upload.csv'): ParsedSpreadsheet {
  const stripped = rawText.replace(/^\uFEFF/, '');
  const sampleLines = stripped
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0)
    .slice(0, 10);
  const delimiter = detectCsvDelimiter(sampleLines);

  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < stripped.length; i++) {
    const ch = stripped[i];
    if (inQuotes) {
      if (ch === '"') {
        if (stripped[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(field.trim());
      field = '';
    } else if (ch === '\r') {
      if (stripped[i + 1] === '\n') i += 1;
      row.push(field.trim());
      field = '';
      if (row.some((c) => c.length > 0)) rows.push(row);
      row = [];
    } else if (ch === '\n') {
      row.push(field.trim());
      field = '';
      if (row.some((c) => c.length > 0)) rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field.trim());
    if (row.some((c) => c.length > 0)) rows.push(row);
  }

  return {
    fileName,
    format: 'csv',
    sheetName: 'CSV',
    rows,
    metadata: {},
  };
}

export function parseSpreadsheetBuffer(
  bytes: Uint8Array,
  fileName: string
): ParsedSpreadsheet {
  if (bytes.length === 0) {
    throw new Error('Файл пустой.');
  }
  if (bytes.length > 25 * 1024 * 1024) {
    throw new Error('Файл слишком большой (лимит 25 МБ). Удалите лишние листы или сохраните в CSV.');
  }

  // Старый бинарный формат Microsoft Excel 97–2003 (.xls / OLE2 Compound File)
  const isLegacyOle2Xls =
    bytes.length >= 4 &&
    bytes[0] === 0xd0 &&
    bytes[1] === 0xcf &&
    bytes[2] === 0x11 &&
    bytes[3] === 0xe0;
  if (isLegacyOle2Xls) {
    throw new Error(
      'Старый формат .xls (Excel 97–2003) не поддерживается. Откройте файл в Excel и выберите «Сохранить как» → .xlsx (Книга Excel) или .csv.'
    );
  }

  const isZipMagic =
    bytes.length >= 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    (bytes[2] === 0x03 || bytes[2] === 0x05 || bytes[2] === 0x07);

  if (isZipMagic || fileName.toLowerCase().endsWith('.xlsx')) {
    if (!isZipMagic) {
      throw new Error(
        'Файл с расширением .xlsx повреждён или не является книгой Excel. Пересохраните его в Excel как .xlsx или .csv.'
      );
    }
    return parseXlsxBytes(bytes, fileName);
  }

  // Поддержка UTF-16 LE / UTF-16 BE («Юникод текст» из Excel), UTF-8 и Windows-1251 CSV
  let text = '';
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    text = new TextDecoder('utf-16le', { fatal: false }).decode(bytes.subarray(2));
  } else if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    text = new TextDecoder('utf-16be', { fatal: false }).decode(bytes.subarray(2));
  } else {
    text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    if (text.includes('\uFFFD')) {
      try {
        const win1251 = new TextDecoder('windows-1251', { fatal: false }).decode(bytes);
        if (!win1251.includes('\uFFFD')) {
          text = win1251;
        }
      } catch {
        // Оставляем UTF-8
      }
    }
  }
  return parseCsvText(text, fileName);
}

// =============================================================================
// 2. РАСПОЗНАВАНИЕ КОЛОНОК (ГИБКОЕ: РУССКИЕ / АНГЛИЙСКИЕ ЗАГОЛОВКИ И 12 МЕСЯЦЕВ)
// =============================================================================

const MONTH_HEADER_PATTERNS: RegExp[] = [
  /(?:^|[\s._(\-/])(янв|январь|января|jan|january|202\d-01|01[./]202\d)(?:$|[\s._)\-/,0-9])/i,
  /(?:^|[\s._(\-/])(фев|февраль|февраля|feb|february|202\d-02|02[./]202\d)(?:$|[\s._)\-/,0-9])/i,
  /(?:^|[\s._(\-/])(мар|март|марта|mar|march|202\d-03|03[./]202\d)(?:$|[\s._)\-/,0-9])/i,
  /(?:^|[\s._(\-/])(апр|апрель|апреля|apr|april|202\d-04|04[./]202\d)(?:$|[\s._)\-/,0-9])/i,
  /(?:^|[\s._(\-/])(май|мая|may|202\d-05|05[./]202\d)(?:$|[\s._)\-/,0-9])/i,
  /(?:^|[\s._(\-/])(июн|июнь|июня|jun|june|202\d-06|06[./]202\d)(?:$|[\s._)\-/,0-9])/i,
  /(?:^|[\s._(\-/])(июл|июль|июля|jul|july|202\d-07|07[./]202\d)(?:$|[\s._)\-/,0-9])/i,
  /(?:^|[\s._(\-/])(авг|август|августа|aug|august|202\d-08|08[./]202\d)(?:$|[\s._)\-/,0-9])/i,
  /(?:^|[\s._(\-/])(сен|сент|сентябрь|сентября|sep|sept|september|202\d-09|09[./]202\d)(?:$|[\s._)\-/,0-9])/i,
  /(?:^|[\s._(\-/])(окт|октябрь|октября|oct|october|202\d-10|10[./]202\d)(?:$|[\s._)\-/,0-9])/i,
  /(?:^|[\s._(\-/])(ноя|ноябрь|ноября|nov|november|202\d-11|11[./]202\d)(?:$|[\s._)\-/,0-9])/i,
  /(?:^|[\s._(\-/])(дек|декабрь|декабря|dec|december|202\d-12|12[./]202\d)(?:$|[\s._)\-/,0-9])/i,
];

const NON_QUANTITY_MONTH_COLUMN_RE =
  /(выручк|сумм|руб|₽|цен|себест|марж|прибыл|налог|расход|остат|мрамор|маркетинг|revenue|price|cost|margin|stock|amount)/i;

function detectMonthIndexFromHeader(header: string): number {
  const norm = normalizeLookupText(header);
  if (!norm) return -1;
  // Никогда не путаем денежные/ценовые/остаточные колонки («Выручка Янв, ₽», «Цена Янв», «Остаток Янв») с планом штук
  if (NON_QUANTITY_MONTH_COLUMN_RE.test(norm)) {
    return -1;
  }
  for (let m = 0; m < 12; m++) {
    if (MONTH_HEADER_PATTERNS[m].test(norm)) {
      return m;
    }
  }
  return -1;
}

export function detectSpreadsheetColumns(
  rows: string[][],
  metadata: Record<string, string> = {}
): DetectedSpreadsheetColumns {
  const metadataMetric =
    metadata.borners_metric === 'orders'
      ? 'orders'
      : metadata.borners_metric === 'buyouts'
      ? 'buyouts'
      : null;
  const metadataModeHint =
    metadata.borners_mode === 'liskani_269'
      ? 'liskani_269'
      : metadata.borners_mode === 'brand_models'
      ? 'brand_models'
      : null;

  let bestScore = -1;
  let bestResult: DetectedSpreadsheetColumns = {
    headerRowIdx: -1,
    skuIndexCol: -1,
    modelCodeCol: -1,
    sellerSkuCol: -1,
    wbNmIdCol: -1,
    barcodeCol: -1,
    titleCol: -1,
    priceCol: -1,
    costCol: -1,
    monthCols: new Map(),
    detectedMetricHint: metadataMetric,
    metadataModeHint,
  };

  const scanLimit = Math.min(rows.length, 10);
  for (let rIdx = 0; rIdx < scanLimit; rIdx++) {
    const cols = rows[rIdx];
    let skuIndexCol = -1;
    let modelCodeCol = -1;
    let sellerSkuCol = -1;
    let wbNmIdCol = -1;
    let barcodeCol = -1;
    let titleCol = -1;
    let priceCol = -1;
    let pricePriority = 0;
    let costCol = -1;
    let costPriority = 0;
    const monthCols = new Map<number, number>();
    let buyoutsHeaderVotes = 0;
    let ordersHeaderVotes = 0;

    for (let c = 0; c < cols.length; c++) {
      const h = normalizeLookupText(cols[c] || '');
      if (!h) continue;

      const mIdx = detectMonthIndexFromHeader(h);
      if (mIdx >= 0 && !monthCols.has(mIdx)) {
        monthCols.set(mIdx, c);
        if (h.includes('выкуп')) buyoutsHeaderVotes += 1;
        if (h.includes('заказ')) ordersHeaderVotes += 1;
        continue;
      }

      const isTotalAggregateHeader =
        /(итого|всего|сумм|годов|общая|total|annual)/i.test(h);
      const isPurchaseCostHeader =
        h.includes('цена закуп') || h.includes('закупочн');
      const isExplicitCostHeader =
        h.includes('себестоим') ||
        h.includes('себест') ||
        h === 'cogs' ||
        h.includes('unit_cost');
      const isNonRetailPriceHeader =
        /(до скидк|старая|зачерк|закуп|оптов|себест|базов|спп)/i.test(h);

      if (
        skuIndexCol < 0 &&
        (h === '№' || h === 'sku №' || h === 'sku_index' || h === 'индекс sku')
      ) {
        skuIndexCol = c;
      } else if (
        wbNmIdCol < 0 &&
        (h.includes('артикул wb') ||
          h.includes('код wb') ||
          h === 'wb' ||
          h === 'wb_nm_id' ||
          h === 'nmid' ||
          h === 'nm_id')
      ) {
        wbNmIdCol = c;
      } else if (
        barcodeCol < 0 &&
        (h.includes('баркод') || h.includes('штрихкод') || h.includes('barcode') || h === 'ean')
      ) {
        barcodeCol = c;
      } else if (
        modelCodeCol < 0 &&
        (h.includes('код модели') ||
          h === 'sku_code' ||
          h === 'model_code' ||
          h === 'код' ||
          h === 'код карточки')
      ) {
        modelCodeCol = c;
      } else if (
        sellerSkuCol < 0 &&
        (h.includes('артикул продавца') ||
          h === 'seller_sku' ||
          h === 'артикул' ||
          h.includes('артикул (действующий)'))
      ) {
        sellerSkuCol = c;
      } else if (
        titleCol < 0 &&
        (h.includes('название') || h.includes('наименование') || h === 'title' || h === 'модель')
      ) {
        titleCol = c;
      } else if (!isTotalAggregateHeader && (isExplicitCostHeader || isPurchaseCostHeader)) {
        const prio = isExplicitCostHeader ? 2 : 1;
        if (prio > costPriority) {
          costCol = c;
          costPriority = prio;
        }
      } else if (!isTotalAggregateHeader && !isNonRetailPriceHeader) {
        const isExplicitRetailPrice =
          h.includes('цена реализации') ||
          h.includes('ррц') ||
          h.includes('retail_price') ||
          h.includes('planned_price');
        const isGenericPrice =
          h === 'цена' ||
          h.startsWith('цена,') ||
          h.startsWith('цена ') ||
          h === 'price';
        if (isExplicitRetailPrice || isGenericPrice) {
          const prio = isExplicitRetailPrice ? 2 : 1;
          if (prio > pricePriority) {
            priceCol = c;
            pricePriority = prio;
          }
        }
      }
    }

    const idHits =
      (skuIndexCol >= 0 ? 1 : 0) +
      (modelCodeCol >= 0 ? 2 : 0) +
      (sellerSkuCol >= 0 ? 2 : 0) +
      (wbNmIdCol >= 0 ? 2 : 0) +
      (barcodeCol >= 0 ? 1 : 0) +
      (titleCol >= 0 ? 1 : 0);
    const dataHits =
      (priceCol >= 0 ? 2 : 0) +
      (costCol >= 0 ? 2 : 0) +
      Math.min(6, monthCols.size);
    const score = idHits > 0 && dataHits > 0 ? idHits * 10 + dataHits : -1;

    if (score > bestScore) {
      bestScore = score;
      const headerMetricHint: BulkVolumeMetric | null =
        ordersHeaderVotes > buyoutsHeaderVotes
          ? 'orders'
          : buyoutsHeaderVotes > 0
          ? 'buyouts'
          : metadataMetric;
      bestResult = {
        headerRowIdx: rIdx,
        skuIndexCol,
        modelCodeCol,
        sellerSkuCol,
        wbNmIdCol,
        barcodeCol,
        titleCol,
        priceCol,
        costCol,
        monthCols,
        detectedMetricHint: headerMetricHint,
        metadataModeHint,
      };
    }
  }

  return bestResult;
}

// =============================================================================
// 3. ГЕНЕРАЦИЯ ШАБЛОНОВ EXCEL (.XLSX) И CSV (.CSV)
// =============================================================================

function resolveTargetScenarioIdForModel(
  model: ScenarioModelSpec,
  fallbackScenarioId: number,
  selectedScenarioByBrand?: Partial<Record<string, number | null>>
): number {
  const brandCode = normalizePortfolioBrandCode(detectModelBrandPortfolioLabel(model));
  const mapped =
    brandCode !== 'ALL' && selectedScenarioByBrand
      ? selectedScenarioByBrand[brandCode]
      : undefined;
  if (typeof mapped === 'number' && model.plansByScenario[mapped]) {
    return mapped;
  }
  if (brandCode === 'LISKANI' && model.plansByScenario[LISKANI_2027_SCENARIO_ID]) {
    return LISKANI_2027_SCENARIO_ID;
  }
  if (brandCode === 'AKUSHA' && model.plansByScenario[202706]) {
    return 202706;
  }
  if (model.plansByScenario[fallbackScenarioId]) {
    return fallbackScenarioId;
  }
  if (model.plansByScenario[LISKANI_2027_SCENARIO_ID]) return LISKANI_2027_SCENARIO_ID;
  if (model.plansByScenario[202706]) return 202706;
  if (model.plansByScenario[1]) return 1;
  const firstKey = Object.keys(model.plansByScenario)[0];
  return firstKey ? Number(firstKey) : fallbackScenarioId;
}

function resolveModelPlanForScenario(
  model: ScenarioModelSpec,
  scenarioId: number,
  selectedScenarioByBrand?: Partial<Record<string, number | null>>
) {
  const targetId = resolveTargetScenarioIdForModel(model, scenarioId, selectedScenarioByBrand);
  return (
    model.plansByScenario[targetId] ||
    model.plansByScenario[scenarioId] ||
    model.plansByScenario[LISKANI_2027_SCENARIO_ID] ||
    model.plansByScenario[202706] ||
    model.plansByScenario[1]
  );
}

export interface GenerateTemplateParams {
  models: ScenarioModelSpec[];
  scenarioId: number;
  selectedScenarioByBrand?: Partial<Record<string, number | null>>;
  mode: BulkTemplateMode;
  brandScope: string;
  volumeMetric: BulkVolumeMetric;
  includeCost: boolean;
  scenarioTitle?: string;
}

export function buildBulkTemplateSheets(params: GenerateTemplateParams): {
  sheets: XlsxSheetSpec[];
  csvText: string;
  fileBaseName: string;
  rowsCount: number;
} {
  const {
    models,
    scenarioId,
    selectedScenarioByBrand,
    mode,
    brandScope,
    volumeMetric,
    includeCost,
    scenarioTitle,
  } = params;
  const metricLabel = volumeMetric === 'orders' ? 'заказы' : 'выкупы';
  const metricTitle =
    volumeMetric === 'orders'
      ? 'Заказы (шт./компл.)'
      : 'Выкупы — план продаж (шт./компл.)';

  const dataRows: XlsxCellSpec[][] = [];
  const csvLines: string[][] = [];
  let colWidths: number[] = [];

  if (mode === 'liskani_269') {
    const headerTexts = [
      'SKU №',
      'Артикул продавца (действующий)',
      'Артикул WB',
      'Баркод',
      'Ткань',
      'Цвет',
      'Размер',
      'Цена реализации, ₽',
      ...(includeCost ? ['Себестоимость, ₽'] : []),
      ...MONTHS_SHORT_RU_EXCEL.map((m) => `${m} (${metricLabel})`),
    ];
    dataRows.push(headerTexts.map((v) => ({ value: v, style: 'header' })));
    csvLines.push(headerTexts);
    colWidths = [
      8,
      30,
      15,
      18,
      14,
      24,
      11,
      18,
      ...(includeCost ? [17] : []),
      ...Array(12).fill(12),
    ];

    const liskaniVariants: Array<{ model: ScenarioModelSpec; sv: LiskaniSizeSkuSpec }> = [];
    for (const raw of models) {
      const m = ensureModelUnifiedV11(raw);
      if (Array.isArray(m.liskaniSizeVariants) && m.liskaniSizeVariants.length > 0) {
        for (const sv of m.liskaniSizeVariants) {
          liskaniVariants.push({ model: m, sv });
        }
      }
    }
    liskaniVariants.sort((a, b) => a.sv.skuIndex - b.sv.skuIndex);

    for (const { sv } of liskaniVariants) {
      const monthVals =
        volumeMetric === 'orders' ? sv.monthlyOrdersUnits : sv.monthlyBuyoutsUnits;
      const rowCells: XlsxCellSpec[] = [
        { value: sv.skuIndex, style: 'int' },
        { value: sv.sellerSku === 'None' ? '' : sv.sellerSku, style: 'text' },
        { value: sv.wbNmId || '', style: 'text' },
        { value: sv.barcode || '', style: 'text' },
        { value: sv.fabric || '', style: 'text' },
        { value: sv.color || '', style: 'text' },
        { value: sv.sizeCm || '', style: 'text' },
        { value: sv.retailPriceRub, style: 'dec' },
        ...(includeCost ? [{ value: sv.unitCostRub, style: 'dec' as const }] : []),
        ...Array.from({ length: 12 }, (_, mIdx) => ({
          value: Math.round(monthVals[mIdx] || 0),
          style: 'int' as const,
        })),
      ];
      dataRows.push(rowCells);
      csvLines.push(rowCells.map((c) => (c.value === null || c.value === undefined ? '' : String(c.value))));
    }
  } else {
    const headerTexts = [
      'Код модели',
      'Название',
      'Бренд',
      'Артикул WB',
      'РРЦ (Цена реализации), ₽',
      ...(includeCost ? ['Себестоимость, ₽'] : []),
      ...MONTHS_SHORT_RU_EXCEL.map((m) => `${m} (${metricLabel})`),
    ];
    dataRows.push(headerTexts.map((v) => ({ value: v, style: 'header' })));
    csvLines.push(headerTexts);
    colWidths = [
      15,
      36,
      16,
      16,
      22,
      ...(includeCost ? [17] : []),
      ...Array(12).fill(12),
    ];

    const scopedModels = models
      .map((raw) => ensureModelUnifiedV11(raw))
      .filter((m) => brandScope === 'ALL' || matchesBrandFilter(m, brandScope));

    for (const m of scopedModels) {
      const targetScenId = resolveTargetScenarioIdForModel(
        m,
        scenarioId,
        selectedScenarioByBrand
      );
      const plan = resolveModelPlanForScenario(m, targetScenId, selectedScenarioByBrand);
      const effBuyoutPct = getEffectiveModelBuyoutRatePct(m, targetScenId);
      const isAkusha =
        normalizePortfolioBrandCode(detectModelBrandPortfolioLabel(m)) === 'AKUSHA';
      const brandLabel = detectModelBrandPortfolioLabel(m);
      const monthVals = Array.from({ length: 12 }, (_, mIdx) => {
        const buyouts = Math.round(plan?.monthlyPacks?.[mIdx] || 0);
        if (volumeMetric === 'buyouts') return buyouts;
        if (plan?.monthlyOrdersPacks && plan.monthlyOrdersPacks[mIdx] !== undefined) {
          return Math.round(plan.monthlyOrdersPacks[mIdx] || 0);
        }
        if (effBuyoutPct <= 0 || effBuyoutPct >= 100) return buyouts;
        return isAkusha
          ? Math.ceil((buyouts * 100) / effBuyoutPct)
          : Math.round((buyouts * 100) / effBuyoutPct);
      });

      const rowCells: XlsxCellSpec[] = [
        { value: m.code, style: 'text' },
        { value: m.title, style: 'text' },
        { value: brandLabel, style: 'text' },
        { value: m.wbArticle || '', style: 'text' },
        { value: m.retailPriceRub, style: 'dec' },
        ...(includeCost ? [{ value: m.unitCostRub, style: 'dec' as const }] : []),
        ...monthVals.map((v) => ({ value: v, style: 'int' as const })),
      ];
      dataRows.push(rowCells);
      csvLines.push(rowCells.map((c) => (c.value === null || c.value === undefined ? '' : String(c.value))));
    }
  }

  const instructionRows: XlsxCellSpec[][] = [
    [
      { value: 'Параметр', style: 'header' },
      { value: 'Значение / Пояснение', style: 'header' },
    ],
    [
      { value: 'Назначение файла', style: 'note' },
      {
        value:
          'Массовое обновление цен реализации, себестоимости и помесячного плана продаж (Янв–Дек) в BORNERS Group Platform',
        style: 'text',
      },
    ],
    [
      { value: 'Режим выгрузки', style: 'note' },
      {
        value:
          mode === 'liskani_269'
            ? 'LISKANI — полный реестр 269 размерных SKU'
            : `Карточки моделей (${brandScope === 'ALL' ? 'Все бренды' : brandScope})`,
        style: 'text',
      },
    ],
    [
      { value: 'Сценарий', style: 'note' },
      { value: scenarioTitle || `Сценарий #${scenarioId}`, style: 'text' },
    ],
    [
      { value: 'Колонки Янв–Дек означают', style: 'note' },
      { value: metricTitle, style: 'text' },
    ],
    [
      { value: 'Как редактировать', style: 'note' },
      {
        value:
          'Меняйте только нужные ячейки на листе «План_продаж_2027». Пустые ячейки не затирают существующие данные. После правки загрузите файл обратно через кнопку «Excel: цены и план».',
        style: 'text',
      },
    ],
    [{ value: '', style: 'text' }, { value: '', style: 'text' }],
    [{ value: 'borners_template_version', style: 'note' }, { value: '1', style: 'text' }],
    [{ value: 'borners_mode', style: 'note' }, { value: mode, style: 'text' }],
    [{ value: 'borners_metric', style: 'note' }, { value: volumeMetric, style: 'text' }],
    [{ value: 'borners_brand', style: 'note' }, { value: brandScope, style: 'text' }],
    [
      { value: 'borners_scenario_id', style: 'note' },
      { value: String(scenarioId), style: 'text' },
    ],
  ];

  const sheets: XlsxSheetSpec[] = [
    {
      name: 'План_продаж_2027',
      colWidths,
      freezeTopRow: true,
      autoFilter: true,
      rows: dataRows,
    },
    {
      name: 'Инструкция',
      colWidths: [28, 72],
      freezeTopRow: true,
      autoFilter: false,
      rows: instructionRows,
    },
  ];

  const escapeCsvField = (s: string) => {
    if (s.includes(';') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  const csvText = `\uFEFF${csvLines
    .map((line) => line.map(escapeCsvField).join(';'))
    .join('\n')}`;

  const scopeSlug =
    mode === 'liskani_269'
      ? 'LISKANI_269_SKU'
      : brandScope === 'ALL'
      ? 'ALL_BRANDS'
      : brandScope.replace(/[^A-Za-z0-9_]+/g, '_');

  return {
    sheets,
    csvText,
    fileBaseName: `BORNERS_${scopeSlug}_plan_2027_${metricLabel}`,
    rowsCount: Math.max(0, dataRows.length - 1),
  };
}

// =============================================================================
// 4. СОПОСТАВЛЕНИЕ СТРОК И ПРЕДПРОСМОТР «БЫЛО → СТАЛО»
// =============================================================================

interface LiskaniLookupIndex {
  bySkuIndex: Map<number, { modelId: string; sv: LiskaniSizeSkuSpec }>;
  bySellerSku: Map<string, { modelId: string; sv: LiskaniSizeSkuSpec }>;
  byWbNmId: Map<string, { modelId: string; sv: LiskaniSizeSkuSpec }>;
  byBarcode: Map<string, { modelId: string; sv: LiskaniSizeSkuSpec }>;
  all: Array<{ modelId: string; sv: LiskaniSizeSkuSpec }>;
}

function buildLiskaniLookupIndex(models: ScenarioModelSpec[]): LiskaniLookupIndex {
  const bySkuIndex = new Map<number, { modelId: string; sv: LiskaniSizeSkuSpec }>();
  const bySellerSku = new Map<string, { modelId: string; sv: LiskaniSizeSkuSpec }>();
  const byWbNmId = new Map<string, { modelId: string; sv: LiskaniSizeSkuSpec }>();
  const byBarcode = new Map<string, { modelId: string; sv: LiskaniSizeSkuSpec }>();
  const all: Array<{ modelId: string; sv: LiskaniSizeSkuSpec }> = [];

  for (const m of models) {
    if (!Array.isArray(m.liskaniSizeVariants) || m.liskaniSizeVariants.length === 0) continue;
    for (const sv of m.liskaniSizeVariants) {
      const entry = { modelId: m.id, sv };
      all.push(entry);
      bySkuIndex.set(sv.skuIndex, entry);
      const normSku = normalizeLookupText(sv.sellerSku);
      if (normSku && normSku !== 'none') {
        bySellerSku.set(normSku, entry);
      }
      const normWb = normalizeExcelIntegerId(sv.wbNmId);
      if (normWb) byWbNmId.set(normWb, entry);
      const normBc = normalizeExcelIntegerId(sv.barcode);
      if (normBc) byBarcode.set(normBc, entry);
    }
  }

  return { bySkuIndex, bySellerSku, byWbNmId, byBarcode, all };
}

function matchLiskaniByCodePattern(
  sellerSkuRaw: string,
  index: LiskaniLookupIndex
): { modelId: string; sv: LiskaniSizeSkuSpec } | null {
  const norm = normalizeLookupText(sellerSkuRaw);
  // Формат артикулов LISKANI: Б3240 Молочный, М4240 Розово-коричневый, Р3250 Серый, Т5250/Т6270 Белый
  const match = norm.match(/^([бмрт])\s*([3456])\s*(240|250|260|270)\s+(.+)$/i);
  if (!match) return null;
  const prefix = match[1].toLowerCase();
  const widthDigit = match[2];
  const height = match[3];
  const colorPart = match[4].trim();

  const fabricPrefix =
    prefix === 'б'
      ? 'блэкаут'
      : prefix === 'м'
      ? 'мрамор'
      : prefix === 'р'
      ? 'рогожка'
      : 'тюль';
  const expectedSize = `${widthDigit}00×${height}`;

  for (const item of index.all) {
    const fNorm = normalizeLookupText(item.sv.fabric);
    const szNorm = item.sv.sizeCm.replace(/[xх*]/gi, '×').trim();
    const cNorm = normalizeLookupText(item.sv.color);
    if (
      fNorm.startsWith(fabricPrefix) &&
      szNorm === expectedSize &&
      (cNorm === colorPart || cNorm.startsWith(colorPart) || colorPart.startsWith(cNorm))
    ) {
      return item;
    }
  }
  return null;
}

function matchLiskaniRow(
  row: string[],
  cols: DetectedSpreadsheetColumns,
  index: LiskaniLookupIndex
): { modelId: string; sv: LiskaniSizeSkuSpec } | null {
  const sellerSkuRaw = cols.sellerSkuCol >= 0 ? (row[cols.sellerSkuCol] || '').trim() : '';
  const wbRaw = cols.wbNmIdCol >= 0 ? normalizeExcelIntegerId(row[cols.wbNmIdCol]) : '';
  const bcRaw = cols.barcodeCol >= 0 ? normalizeExcelIntegerId(row[cols.barcodeCol]) : '';
  const idxRaw = cols.skuIndexCol >= 0 ? parseRuNumber(row[cols.skuIndexCol]) : null;

  const normSeller = normalizeLookupText(sellerSkuRaw);
  if (normSeller && normSeller !== 'none') {
    const hit = index.bySellerSku.get(normSeller);
    if (hit) return hit;
  }
  if (wbRaw) {
    const hit = index.byWbNmId.get(wbRaw);
    if (hit) return hit;
  }
  if (bcRaw) {
    const hit = index.byBarcode.get(bcRaw);
    if (hit) return hit;
  }
  if (idxRaw !== null && Number.isInteger(idxRaw)) {
    const hit = index.bySkuIndex.get(idxRaw);
    if (hit) return hit;
  }
  if (sellerSkuRaw) {
    const hit = matchLiskaniByCodePattern(sellerSkuRaw, index);
    if (hit) return hit;
  }
  return null;
}

function computeLiskaniTotals(models: ScenarioModelSpec[]): BulkImportTotals {
  let annualBuyoutsRub = 0;
  let annualOrdersRub = 0;
  let annualBuyoutsUnits = 0;
  let annualOrdersUnits = 0;
  let annualCogsRub = 0;

  for (const m of models) {
    if (!Array.isArray(m.liskaniSizeVariants) || m.liskaniSizeVariants.length === 0) continue;
    for (const sv of m.liskaniSizeVariants) {
      annualBuyoutsRub += sv.annualBuyoutsRub || 0;
      annualOrdersRub += sv.annualOrdersRub || 0;
      annualBuyoutsUnits += sv.annualBuyoutsUnits || 0;
      annualOrdersUnits += sv.annualOrdersUnits || 0;
      annualCogsRub += (sv.annualBuyoutsUnits || 0) * (sv.unitCostRub || 0);
    }
  }

  return {
    annualBuyoutsRub: Math.round(annualBuyoutsRub),
    annualOrdersRub: Math.round(annualOrdersRub),
    annualBuyoutsUnits: Math.round(annualBuyoutsUnits),
    annualOrdersUnits: Math.round(annualOrdersUnits),
    annualCogsRub: Math.round(annualCogsRub),
    weightedAvgCostRub:
      annualBuyoutsUnits > 0 ? Math.round((annualCogsRub / annualBuyoutsUnits) * 100) / 100 : 0,
    weightedAvgPriceRub:
      annualBuyoutsUnits > 0 ? Math.round((annualBuyoutsRub / annualBuyoutsUnits) * 100) / 100 : 0,
  };
}

function computeBrandModelsTotals(
  models: ScenarioModelSpec[],
  scenarioId: number,
  brandScope: string,
  selectedScenarioByBrand?: Partial<Record<string, number | null>>
): BulkImportTotals {
  let annualBuyoutsRub = 0;
  let annualOrdersRub = 0;
  let annualBuyoutsUnits = 0;
  let annualOrdersUnits = 0;
  let annualCogsRub = 0;

  for (const raw of models) {
    const m = ensureModelUnifiedV11(raw);
    if (brandScope !== 'ALL' && !matchesBrandFilter(m, brandScope)) continue;
    const targetScenId = resolveTargetScenarioIdForModel(m, scenarioId, selectedScenarioByBrand);
    const plan = resolveModelPlanForScenario(m, targetScenId, selectedScenarioByBrand);
    if (!plan) continue;
    const effBuyoutPct = getEffectiveModelBuyoutRatePct(m, targetScenId);
    const isAkusha =
      normalizePortfolioBrandCode(detectModelBrandPortfolioLabel(m)) === 'AKUSHA';

    for (let mIdx = 0; mIdx < 12; mIdx++) {
      const buyouts = Math.max(0, Math.round(plan.monthlyPacks?.[mIdx] || 0));
      const price = plan.monthlyPricesRub?.[mIdx] ?? m.retailPriceRub ?? 0;
      const rev =
        plan.monthlyRevenuesRubOverride?.[mIdx] !== undefined
          ? plan.monthlyRevenuesRubOverride[mIdx]
          : Math.round(buyouts * price);
      const orders =
        plan.monthlyOrdersPacks?.[mIdx] !== undefined
          ? plan.monthlyOrdersPacks[mIdx]
          : effBuyoutPct <= 0 || effBuyoutPct >= 100
          ? buyouts
          : isAkusha
          ? Math.ceil((buyouts * 100) / effBuyoutPct)
          : Math.round((buyouts * 100) / effBuyoutPct);
      const ordRub =
        plan.monthlyOrdersRub?.[mIdx] !== undefined
          ? plan.monthlyOrdersRub[mIdx]
          : Math.round(orders * price);

      annualBuyoutsUnits += buyouts;
      annualBuyoutsRub += rev;
      annualOrdersUnits += orders;
      annualOrdersRub += ordRub;
      annualCogsRub += buyouts * (m.unitCostRub || 0);
    }
  }

  return {
    annualBuyoutsRub: Math.round(annualBuyoutsRub),
    annualOrdersRub: Math.round(annualOrdersRub),
    annualBuyoutsUnits: Math.round(annualBuyoutsUnits),
    annualOrdersUnits: Math.round(annualOrdersUnits),
    annualCogsRub: Math.round(annualCogsRub),
    weightedAvgCostRub:
      annualBuyoutsUnits > 0 ? Math.round((annualCogsRub / annualBuyoutsUnits) * 100) / 100 : 0,
    weightedAvgPriceRub:
      annualBuyoutsUnits > 0 ? Math.round((annualBuyoutsRub / annualBuyoutsUnits) * 100) / 100 : 0,
  };
}

export function detectRecommendedImportMode(
  models: ScenarioModelSpec[],
  parsed: ParsedSpreadsheet,
  fallbackMode: BulkTemplateMode
): BulkTemplateMode {
  const cols = detectSpreadsheetColumns(parsed.rows, parsed.metadata);
  if (cols.metadataModeHint) return cols.metadataModeHint;
  if (cols.headerRowIdx < 0) return fallbackMode;

  const dataRows = parsed.rows.slice(cols.headerRowIdx + 1);
  if (dataRows.length === 0) return fallbackMode;

  const liskaniIndex = buildLiskaniLookupIndex(models);
  if (liskaniIndex.all.length === 0) return 'brand_models';

  let liskaniHits = 0;
  let modelHits = 0;
  const codeSet = new Set(models.map((m) => normalizeLookupText(m.code)));
  const wbSet = new Set(
    models.map((m) => normalizeExcelIntegerId(m.wbArticle)).filter(Boolean)
  );

  for (const row of dataRows.slice(0, 50)) {
    if (matchLiskaniRow(row, cols, liskaniIndex)) liskaniHits += 1;
    const codeVal = cols.modelCodeCol >= 0 ? normalizeLookupText(row[cols.modelCodeCol] || '') : '';
    const wbVal = cols.wbNmIdCol >= 0 ? normalizeExcelIntegerId(row[cols.wbNmIdCol]) : '';
    if ((codeVal && codeSet.has(codeVal)) || (wbVal && wbSet.has(wbVal))) {
      modelHits += 1;
    }
  }

  if (liskaniHits > modelHits && liskaniHits > 0) return 'liskani_269';
  if (modelHits > liskaniHits && modelHits > 0) return 'brand_models';
  return fallbackMode;
}

function distributeIntByWeights(total: number, weights: number[]): number[] {
  const n = weights.length;
  if (n === 0) return [];
  const safeTotal = Math.max(0, Math.round(total));
  if (safeTotal === 0) return Array(n).fill(0);
  const cleanWeights = weights.map((w) => (Number.isFinite(w) && w > 0 ? w : 0));
  const sumW = cleanWeights.reduce((a, b) => a + b, 0);
  const effWeights = sumW > 0 ? cleanWeights : Array(n).fill(1);
  const effSum = sumW > 0 ? sumW : n;

  const exact = effWeights.map((w) => (safeTotal * w) / effSum);
  const floored = exact.map((x) => Math.floor(x));
  const remainder = safeTotal - floored.reduce((a, b) => a + b, 0);
  const order = exact
    .map((x, idx) => ({ idx, frac: x - floored[idx] }))
    .sort((a, b) => b.frac - a.frac || a.idx - b.idx);
  for (let i = 0; i < remainder && i < order.length; i++) {
    floored[order[i].idx] += 1;
  }
  return floored;
}

function scaleLiskaniVariantsFromParentUpdate(params: {
  baseModel: ScenarioModelSpec;
  nextPrice: number;
  priceDidChange: boolean;
  nextCost: number;
  costDidChange: boolean;
  nextPacks: number[];
  nextOrdersPacks: number[] | undefined;
  changedMonthIndices: Set<number>;
  effBuyoutPct: number;
}): LiskaniSizeSkuSpec[] | undefined {
  const {
    baseModel,
    nextPrice,
    priceDidChange,
    nextCost,
    costDidChange,
    nextPacks,
    nextOrdersPacks,
    changedMonthIndices,
    effBuyoutPct,
  } = params;
  const variants = baseModel.liskaniSizeVariants;
  if (!Array.isArray(variants) || variants.length === 0) return variants;

  const prevPrice = Math.max(0, baseModel.retailPriceRub || 0);
  const prevCost = Math.max(0, baseModel.unitCostRub || 0);
  const buyoutRatio = Math.max(0, effBuyoutPct) / 100;

  const working: LiskaniSizeSkuSpec[] = variants.map((sv) => {
    const scaledPrice = !priceDidChange
      ? sv.retailPriceRub
      : nextPrice === 0
      ? 0
      : prevPrice > 0 && sv.retailPriceRub > 0
      ? Math.round(((sv.retailPriceRub * nextPrice) / prevPrice) * 100) / 100
      : Math.round(nextPrice * 100) / 100;
    const scaledCost = !costDidChange
      ? sv.unitCostRub
      : nextCost === 0
      ? 0
      : prevCost > 0 && sv.unitCostRub > 0
      ? Math.round(((sv.unitCostRub * nextCost) / prevCost) * 100) / 100
      : Math.round(nextCost * 100) / 100;
    return {
      ...sv,
      retailPriceRub: scaledPrice,
      unitCostRub: scaledCost,
      monthlyBuyoutsUnits: [...sv.monthlyBuyoutsUnits],
      monthlyOrdersUnits: [...sv.monthlyOrdersUnits],
      monthlyBuyoutsRub: [...sv.monthlyBuyoutsRub],
      monthlyOrdersRub: [...sv.monthlyOrdersRub],
    };
  });

  // Распределяем изменённые месяцы пропорционально текущим весам размеров (метод наибольших остатков)
  for (const mIdx of changedMonthIndices) {
    const monthWeights = working.map(
      (sv) => sv.monthlyBuyoutsUnits[mIdx] || sv.annualBuyoutsUnits || 1
    );
    const buyTarget = Math.max(0, Math.round(nextPacks[mIdx] || 0));
    const ordTarget =
      nextOrdersPacks && nextOrdersPacks[mIdx] !== undefined
        ? Math.max(0, Math.round(nextOrdersPacks[mIdx] || 0))
        : buyoutRatio > 0
        ? Math.round(buyTarget / buyoutRatio)
        : buyTarget;
    const buyShares = distributeIntByWeights(buyTarget, monthWeights);
    const ordShares = distributeIntByWeights(ordTarget, monthWeights);
    for (let vIdx = 0; vIdx < working.length; vIdx++) {
      working[vIdx].monthlyBuyoutsUnits[mIdx] = buyShares[vIdx];
      working[vIdx].monthlyOrdersUnits[mIdx] = ordShares[vIdx];
    }
  }

  return working.map((sv) => {
    const nextBuyRub = sv.monthlyBuyoutsUnits.map((q, mIdx) =>
      priceDidChange || changedMonthIndices.has(mIdx)
        ? Math.round(q * sv.retailPriceRub)
        : sv.monthlyBuyoutsRub[mIdx]
    );
    const nextOrdRub = sv.monthlyOrdersUnits.map((q, mIdx) =>
      priceDidChange || changedMonthIndices.has(mIdx)
        ? Math.round(q * sv.retailPriceRub)
        : sv.monthlyOrdersRub[mIdx]
    );
    return {
      ...sv,
      monthlyBuyoutsRub: nextBuyRub,
      monthlyOrdersRub: nextOrdRub,
      annualBuyoutsUnits: sv.monthlyBuyoutsUnits.reduce((a, b) => a + b, 0),
      annualOrdersUnits: sv.monthlyOrdersUnits.reduce((a, b) => a + b, 0),
      annualBuyoutsRub: nextBuyRub.reduce((a, b) => a + b, 0),
      annualOrdersRub: nextOrdRub.reduce((a, b) => a + b, 0),
    };
  });
}

export function previewBulkSpreadsheetImport(params: {
  models: ScenarioModelSpec[];
  scenarioId: number;
  selectedScenarioByBrand?: Partial<Record<string, number | null>>;
  mode: BulkTemplateMode;
  brandScope: string;
  parsed: ParsedSpreadsheet;
  options: BulkImportOptions;
}): BulkImportPreviewResult {
  const {
    models: rawModels,
    scenarioId,
    selectedScenarioByBrand,
    mode,
    brandScope,
    parsed,
    options,
  } = params;
  const models = rawModels.map((m) => ensureModelUnifiedV11(m));
  const cols = detectSpreadsheetColumns(parsed.rows, parsed.metadata);
  const recommendedMode = detectRecommendedImportMode(models, parsed, mode);
  const canEditModelFn = options.canEditModel || (() => true);

  const emptyTotals: BulkImportTotals =
    mode === 'liskani_269'
      ? computeLiskaniTotals(models)
      : computeBrandModelsTotals(models, scenarioId, brandScope, selectedScenarioByBrand);

  if (cols.headerRowIdx < 0) {
    return {
      mode,
      recommendedMode,
      detectedColumns: cols,
      totalDataRows: 0,
      matchedRowsCount: 0,
      changedSkusCount: 0,
      priceChangedCount: 0,
      costChangedCount: 0,
      monthsChangedCount: 0,
      metaFixedCount: 0,
      duplicateRowsSkipped: 0,
      skippedNoPermissionCount: 0,
      unmatchedRows: [
        {
          rowNumber: 1,
          label: parsed.fileName,
          reason:
            'Не найдена строка заголовков с колонками идентификатора (Артикул / Код модели / WB) и данных (Цена / Себестоимость / Янв–Дек).',
        },
      ],
      totalsBefore: emptyTotals,
      totalsAfter: emptyTotals,
      previewDiffRows: [],
      changedModelIds: [],
      updatedModels: rawModels,
    };
  }

  const dataRows = parsed.rows.slice(cols.headerRowIdx + 1);
  const unmatchedRows: BulkImportUnmatchedRow[] = [];
  const diffByKey = new Map<string, BulkImportDiffRow>();
  const changedPriceKeys = new Set<string>();
  const changedCostKeys = new Set<string>();
  const changedMonthsKeys = new Set<string>();
  const fixedMetaKeys = new Set<string>();

  let totalDataRows = 0;
  let matchedRowsCount = 0;
  let duplicateRowsSkipped = 0;
  let skippedNoPermissionCount = 0;

  if (mode === 'liskani_269') {
    const index = buildLiskaniLookupIndex(models);
    const modelById = new Map(models.map((m) => [m.id, m]));
    const patchesByModelId = new Map<string, Map<number, LiskaniSizeVariantBulkPatch>>();

    // Сначала дедуплицируем строки по уникальному SKU (при дубле в одном файле побеждает последняя строка)
    const latestRowBySkuKey = new Map<
      string,
      {
        row: string[];
        hit: { modelId: string; sv: LiskaniSizeSkuSpec };
        sellerSkuRaw: string;
        wbRaw: string;
        bcRaw: string;
      }
    >();

    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];
      const excelRowNum = cols.headerRowIdx + 2 + i;

      // Пропускаем полностью пустые и итоговые строки
      const sellerSkuRaw = cols.sellerSkuCol >= 0 ? (row[cols.sellerSkuCol] || '').trim() : '';
      const wbRaw = cols.wbNmIdCol >= 0 ? normalizeExcelIntegerId(row[cols.wbNmIdCol]) : '';
      const bcRaw = cols.barcodeCol >= 0 ? normalizeExcelIntegerId(row[cols.barcodeCol]) : '';
      const idxRaw = cols.skuIndexCol >= 0 ? (row[cols.skuIndexCol] || '').trim() : '';

      if (!sellerSkuRaw && !wbRaw && !bcRaw && !idxRaw) continue;
      if (/^(итого|всего|total)/i.test(sellerSkuRaw)) continue;

      totalDataRows += 1;

      const hit = matchLiskaniRow(row, cols, index);
      if (!hit) {
        unmatchedRows.push({
          rowNumber: excelRowNum,
          label: sellerSkuRaw || wbRaw || bcRaw || `Строка ${excelRowNum}`,
          reason: 'SKU не найден среди 269 размеров LISKANI',
        });
        continue;
      }

      const parentModel = modelById.get(hit.modelId);
      if (!parentModel || !canEditModelFn(parentModel)) {
        skippedNoPermissionCount += 1;
        continue;
      }

      const skuKey = `${hit.modelId}-${hit.sv.skuIndex}`;
      if (latestRowBySkuKey.has(skuKey)) {
        duplicateRowsSkipped += 1;
      }
      latestRowBySkuKey.set(skuKey, { row, hit, sellerSkuRaw, wbRaw, bcRaw });
    }

    for (const [diffKey, entry] of latestRowBySkuKey.entries()) {
      const { row, hit, sellerSkuRaw, wbRaw, bcRaw } = entry;
      matchedRowsCount += 1;
      const sv = hit.sv;
      const patch: LiskaniSizeVariantBulkPatch = {};

      // Авто-исправление пустых или «None» артикулов / WB / баркодов
      let sellerSkuFixed = false;
      if (
        sellerSkuRaw &&
        (!sv.sellerSku || sv.sellerSku === 'None')
      ) {
        patch.sellerSku = sellerSkuRaw;
        sellerSkuFixed = true;
      }
      if (wbRaw && !sv.wbNmId) {
        patch.wbNmId = wbRaw;
      }
      if (bcRaw && !sv.barcode) {
        patch.barcode = bcRaw;
      }

      const priceBefore = sv.retailPriceRub;
      let priceAfter = sv.retailPriceRub;
      let priceDidChange = false;
      if (options.applyPrice && cols.priceCol >= 0) {
        const parsedPrice = parseRuNumber(row[cols.priceCol]);
        if (parsedPrice !== null && parsedPrice >= 0) {
          const rounded = Math.round(parsedPrice * 100) / 100;
          if (Math.abs(rounded - sv.retailPriceRub) > 0.005) {
            patch.retailPriceRub = rounded;
            priceAfter = rounded;
            priceDidChange = true;
          }
        }
      }

      const costBefore = sv.unitCostRub;
      let costAfter = sv.unitCostRub;
      let costDidChange = false;
      if (options.applyCost && options.canEditCost && cols.costCol >= 0) {
        const parsedCost = parseRuNumber(row[cols.costCol]);
        if (parsedCost !== null && parsedCost >= 0) {
          const rounded = Math.round(parsedCost * 100) / 100;
          if (Math.abs(rounded - sv.unitCostRub) > 0.005) {
            patch.unitCostRub = rounded;
            costAfter = rounded;
            costDidChange = true;
          }
        }
      }

      let rowChangedMonths = 0;
      const currentMonthUnits =
        options.volumeMetric === 'orders' ? sv.monthlyOrdersUnits : sv.monthlyBuyoutsUnits;
      const annualUnitsBefore = currentMonthUnits.reduce((a, b) => a + (b || 0), 0);
      let annualUnitsAfter = annualUnitsBefore;

      if (options.applyMonths && cols.monthCols.size > 0) {
        const sparseMonths: Array<number | null> = Array(12).fill(null);
        let nextAnnualSum = 0;
        for (let mIdx = 0; mIdx < 12; mIdx++) {
          const colIdx = cols.monthCols.get(mIdx);
          const prevVal = Math.round(currentMonthUnits[mIdx] || 0);
          if (colIdx !== undefined) {
            const parsedQty = parseRuNumber(row[colIdx]);
            if (parsedQty !== null && parsedQty >= 0) {
              const nextVal = Math.max(0, Math.round(parsedQty));
              sparseMonths[mIdx] = nextVal;
              nextAnnualSum += nextVal;
              if (nextVal !== prevVal) {
                rowChangedMonths += 1;
              }
              continue;
            }
          }
          nextAnnualSum += prevVal;
        }
        if (rowChangedMonths > 0) {
          if (options.volumeMetric === 'orders') {
            patch.monthlyOrdersUnits = sparseMonths;
          } else {
            patch.monthlyBuyoutsUnits = sparseMonths;
          }
          annualUnitsAfter = nextAnnualSum;
        }
      }

      const hasAnyPatch =
        priceDidChange ||
        costDidChange ||
        rowChangedMonths > 0 ||
        sellerSkuFixed ||
        patch.wbNmId !== undefined ||
        patch.barcode !== undefined;

      if (hasAnyPatch) {
        if (!patchesByModelId.has(hit.modelId)) {
          patchesByModelId.set(hit.modelId, new Map());
        }
        patchesByModelId.get(hit.modelId)!.set(sv.skuIndex, patch);

        if (priceDidChange) changedPriceKeys.add(diffKey);
        if (costDidChange) changedCostKeys.add(diffKey);
        if (rowChangedMonths > 0) changedMonthsKeys.add(diffKey);
        if (sellerSkuFixed) fixedMetaKeys.add(diffKey);

        diffByKey.set(diffKey, {
          key: diffKey,
          skuLabel: patch.sellerSku || (sv.sellerSku !== 'None' ? sv.sellerSku : sv.skuDesc),
          parentCode: sv.parentCode,
          subLabel: `${sv.fabric} · ${sv.color} · ${sv.sizeCm}`,
          priceBefore,
          priceAfter,
          costBefore,
          costAfter,
          annualUnitsBefore,
          annualUnitsAfter,
          changedMonthsCount: rowChangedMonths,
          sellerSkuFixed,
        });
      }
    }

    const liskaniTargetScenarioId =
      scenarioId === 1 || scenarioId === LISKANI_2027_SCENARIO_ID
        ? LISKANI_2027_SCENARIO_ID
        : scenarioId;
    const changedModelIds: string[] = [];
    // Сохраняем точные ссылки rawModels для всех незатронутых моделей,
    // чтобы не штамповать updatedAtIso и не перетирать чужие правки при облачном слиянии
    const updatedModels = rawModels.map((raw, idx) => {
      const modelPatches = patchesByModelId.get(raw.id);
      if (!modelPatches || modelPatches.size === 0) return raw;
      const next = applyLiskaniSizeVariantsBulkPatch(
        models[idx],
        modelPatches,
        liskaniTargetScenarioId
      );
      if (next === models[idx]) return raw;
      changedModelIds.push(raw.id);
      return next;
    });

    const totalsBefore = computeLiskaniTotals(models);
    const totalsAfter = computeLiskaniTotals(updatedModels);
    const previewDiffRows = Array.from(diffByKey.values());

    return {
      mode,
      recommendedMode,
      detectedColumns: cols,
      totalDataRows,
      matchedRowsCount,
      changedSkusCount: previewDiffRows.length,
      priceChangedCount: changedPriceKeys.size,
      costChangedCount: changedCostKeys.size,
      monthsChangedCount: changedMonthsKeys.size,
      metaFixedCount: fixedMetaKeys.size,
      duplicateRowsSkipped,
      skippedNoPermissionCount,
      unmatchedRows,
      totalsBefore,
      totalsAfter,
      previewDiffRows,
      changedModelIds,
      updatedModels,
    };
  }

  // РЕЖИМ «КАРТОЧКИ МОДЕЛЕЙ» (ВСЕ БРЕНДЫ ХОЛДИНГА)
  const scopedModels = models.filter(
    (m) => brandScope === 'ALL' || matchesBrandFilter(m, brandScope)
  );
  const byCode = new Map<string, ScenarioModelSpec>();
  const byId = new Map<string, ScenarioModelSpec>();
  const byWb = new Map<string, ScenarioModelSpec>();
  const byTitle = new Map<string, ScenarioModelSpec>();

  const allByCode = new Map<string, ScenarioModelSpec>();
  const allByWb = new Map<string, ScenarioModelSpec>();
  for (const m of models) {
    allByCode.set(normalizeLookupText(m.code), m);
    const wb = normalizeExcelIntegerId(m.wbArticle);
    if (wb) allByWb.set(wb, m);
  }

  for (const m of scopedModels) {
    byCode.set(normalizeLookupText(m.code), m);
    byId.set(normalizeLookupText(m.id), m);
    const wb = normalizeExcelIntegerId(m.wbArticle);
    if (wb) byWb.set(wb, m);
    byTitle.set(normalizeLookupText(m.title), m);
  }

  // Дедуплицируем строки по уникальной модели (при дубле побеждает последняя строка)
  const latestRowByModelId = new Map<
    string,
    { row: string[]; target: ScenarioModelSpec }
  >();

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    const excelRowNum = cols.headerRowIdx + 2 + i;

    const codeRaw =
      cols.modelCodeCol >= 0
        ? (row[cols.modelCodeCol] || '').trim()
        : cols.sellerSkuCol >= 0
        ? (row[cols.sellerSkuCol] || '').trim()
        : '';
    const wbRaw = cols.wbNmIdCol >= 0 ? normalizeExcelIntegerId(row[cols.wbNmIdCol]) : '';
    const titleRaw = cols.titleCol >= 0 ? (row[cols.titleCol] || '').trim() : '';

    if (!codeRaw && !wbRaw && !titleRaw) continue;
    if (/^(итого|всего|total)/i.test(codeRaw || titleRaw)) continue;

    totalDataRows += 1;

    const target =
      (codeRaw ? byCode.get(normalizeLookupText(codeRaw)) || byId.get(normalizeLookupText(codeRaw)) : undefined) ||
      (wbRaw ? byWb.get(wbRaw) : undefined) ||
      (titleRaw ? byTitle.get(normalizeLookupText(titleRaw)) : undefined);

    if (!target) {
      const otherBrandMatch =
        (codeRaw ? allByCode.get(normalizeLookupText(codeRaw)) : undefined) ||
        (wbRaw ? allByWb.get(wbRaw) : undefined);
      const otherBrandLabel = otherBrandMatch
        ? detectModelBrandPortfolioLabel(otherBrandMatch)
        : null;
      unmatchedRows.push({
        rowNumber: excelRowNum,
        label: codeRaw || titleRaw || wbRaw || `Строка ${excelRowNum}`,
        reason: otherBrandLabel
          ? `Модель относится к бренду ${otherBrandLabel} — переключите фильтр бренда на ${otherBrandLabel} или «Все бренды»`
          : 'Карточка модели не найдена в выбранном бренде',
      });
      continue;
    }

    if (!canEditModelFn(target)) {
      skippedNoPermissionCount += 1;
      continue;
    }

    if (latestRowByModelId.has(target.id)) {
      duplicateRowsSkipped += 1;
    }
    latestRowByModelId.set(target.id, { row, target });
  }

  const updatedById = new Map<string, ScenarioModelSpec>();

  for (const { row, target } of latestRowByModelId.values()) {
    matchedRowsCount += 1;
    const baseModel = target;
    const targetScenId = resolveTargetScenarioIdForModel(
      baseModel,
      scenarioId,
      selectedScenarioByBrand
    );
    const basePlan = resolveModelPlanForScenario(
      baseModel,
      targetScenId,
      selectedScenarioByBrand
    );
    if (!basePlan) continue;

    const effBuyoutPct = getEffectiveModelBuyoutRatePct(baseModel, targetScenId);
    const isAkusha =
      normalizePortfolioBrandCode(detectModelBrandPortfolioLabel(baseModel)) === 'AKUSHA';

    let nextPrice = baseModel.retailPriceRub;
    let priceDidChange = false;
    if (options.applyPrice && cols.priceCol >= 0) {
      const parsedPrice = parseRuNumber(row[cols.priceCol]);
      if (parsedPrice !== null && parsedPrice >= 0) {
        const rounded = Math.round(parsedPrice * 100) / 100;
        if (Math.abs(rounded - baseModel.retailPriceRub) > 0.005) {
          nextPrice = rounded;
          priceDidChange = true;
        }
      }
    }

    let nextCost = baseModel.unitCostRub;
    let costDidChange = false;
    if (options.applyCost && options.canEditCost && cols.costCol >= 0) {
      const parsedCost = parseRuNumber(row[cols.costCol]);
      if (parsedCost !== null && parsedCost >= 0) {
        const rounded = Math.round(parsedCost * 100) / 100;
        if (Math.abs(rounded - baseModel.unitCostRub) > 0.005) {
          nextCost = rounded;
          costDidChange = true;
        }
      }
    }

    const nextPacks = [...basePlan.monthlyPacks];
    // Никогда не придумываем фиктивные поступления на склад при импорте плана продаж (сохраняем честный дефицит закупок)
    const nextReceipts =
      Array.isArray(basePlan.monthlyReceiptsPacks) && basePlan.monthlyReceiptsPacks.length === 12
        ? [...basePlan.monthlyReceiptsPacks]
        : Array(12).fill(0);
    const nextPrices = priceDidChange
      ? Array(12).fill(Math.round(nextPrice * 100) / 100)
      : [...basePlan.monthlyPricesRub];
    const hasRevOverride =
      Array.isArray(basePlan.monthlyRevenuesRubOverride) &&
      basePlan.monthlyRevenuesRubOverride.length === 12;
    const nextRevOverride = hasRevOverride
      ? [...basePlan.monthlyRevenuesRubOverride!]
      : undefined;
    const hasOrdersPacks =
      Array.isArray(basePlan.monthlyOrdersPacks) &&
      basePlan.monthlyOrdersPacks.length === 12;
    const nextOrdersPacks: number[] | undefined = hasOrdersPacks
      ? [...basePlan.monthlyOrdersPacks!]
      : options.applyMonths && options.volumeMetric === 'orders' && cols.monthCols.size > 0
      ? basePlan.monthlyPacks.map((bRaw) => {
          const b = Math.round(bRaw || 0);
          if (effBuyoutPct <= 0 || effBuyoutPct >= 100) return b;
          return isAkusha
            ? Math.ceil((b * 100) / effBuyoutPct)
            : Math.round((b * 100) / effBuyoutPct);
        })
      : undefined;
    const nextOrdersRub =
      Array.isArray(basePlan.monthlyOrdersRub) && basePlan.monthlyOrdersRub.length === 12
        ? [...basePlan.monthlyOrdersRub!]
        : nextOrdersPacks
        ? nextOrdersPacks.map((o, idx) => Math.round(o * (nextPrices[idx] ?? nextPrice)))
        : undefined;

    const currentAnnualUnits = Array.from({ length: 12 }, (_, mIdx) => {
      if (options.volumeMetric === 'buyouts') {
        return Math.round(basePlan.monthlyPacks[mIdx] || 0);
      }
      if (basePlan.monthlyOrdersPacks && basePlan.monthlyOrdersPacks[mIdx] !== undefined) {
        return Math.round(basePlan.monthlyOrdersPacks[mIdx] || 0);
      }
      const b = Math.round(basePlan.monthlyPacks[mIdx] || 0);
      return effBuyoutPct <= 0 || effBuyoutPct >= 100
        ? b
        : isAkusha
        ? Math.ceil((b * 100) / effBuyoutPct)
        : Math.round((b * 100) / effBuyoutPct);
    }).reduce((a, b) => a + b, 0);

    let rowChangedMonths = 0;
    const changedMonthIndices = new Set<number>();
    let nextAnnualUnits = 0;

    if (options.applyMonths && cols.monthCols.size > 0) {
      for (let mIdx = 0; mIdx < 12; mIdx++) {
        const colIdx = cols.monthCols.get(mIdx);
        const prevBuyouts = Math.round(basePlan.monthlyPacks[mIdx] || 0);
        const prevOrders =
          nextOrdersPacks?.[mIdx] ??
          (effBuyoutPct <= 0 || effBuyoutPct >= 100
            ? prevBuyouts
            : isAkusha
            ? Math.ceil((prevBuyouts * 100) / effBuyoutPct)
            : Math.round((prevBuyouts * 100) / effBuyoutPct));

        if (colIdx !== undefined) {
          const parsedQty = parseRuNumber(row[colIdx]);
          if (parsedQty !== null && parsedQty >= 0) {
            const val = Math.max(0, Math.round(parsedQty));
            if (options.volumeMetric === 'buyouts') {
              if (val !== prevBuyouts) {
                rowChangedMonths += 1;
                changedMonthIndices.add(mIdx);
              }
              nextPacks[mIdx] = val;
              const ord =
                effBuyoutPct <= 0 || effBuyoutPct >= 100
                  ? val
                  : isAkusha
                  ? Math.ceil((val * 100) / effBuyoutPct)
                  : Math.round((val * 100) / effBuyoutPct);
              if (nextOrdersPacks) nextOrdersPacks[mIdx] = ord;
              if (nextOrdersRub) nextOrdersRub[mIdx] = Math.round(ord * nextPrices[mIdx]);
              if (nextRevOverride) nextRevOverride[mIdx] = Math.round(val * nextPrices[mIdx]);
              nextAnnualUnits += val;
              continue;
            } else {
              if (val !== prevOrders) {
                rowChangedMonths += 1;
                changedMonthIndices.add(mIdx);
              }
              const buy =
                effBuyoutPct <= 0 || effBuyoutPct >= 100
                  ? val
                  : Math.round((val * effBuyoutPct) / 100);
              nextPacks[mIdx] = buy;
              if (nextOrdersPacks) nextOrdersPacks[mIdx] = val;
              if (nextOrdersRub) nextOrdersRub[mIdx] = Math.round(val * nextPrices[mIdx]);
              if (nextRevOverride) nextRevOverride[mIdx] = Math.round(buy * nextPrices[mIdx]);
              nextAnnualUnits += val;
              continue;
            }
          }
        }
        nextAnnualUnits += options.volumeMetric === 'buyouts' ? prevBuyouts : prevOrders;
      }
    } else {
      nextAnnualUnits = currentAnnualUnits;
    }

    if (priceDidChange) {
      for (let mIdx = 0; mIdx < 12; mIdx++) {
        if (nextRevOverride) {
          nextRevOverride[mIdx] = Math.round(nextPacks[mIdx] * nextPrices[mIdx]);
        }
        if (nextOrdersRub && nextOrdersPacks) {
          nextOrdersRub[mIdx] = Math.round(nextOrdersPacks[mIdx] * nextPrices[mIdx]);
        }
      }
    }

    if (!priceDidChange && !costDidChange && rowChangedMonths === 0) {
      continue;
    }

    if (priceDidChange) changedPriceKeys.add(target.id);
    if (costDidChange) changedCostKeys.add(target.id);
    if (rowChangedMonths > 0) changedMonthsKeys.add(target.id);

    const roundedNextPrice = Math.round(nextPrice * 100) / 100;
    const roundedNextCost = Math.round(nextCost * 100) / 100;
    const shared = baseModel.sharedSupplyAndFact;
    const hasExplicitWbRates =
      (baseModel.marketplaceFeePct || 0) > 0 ||
      (baseModel.logisticsRub || 0) > 0 ||
      (baseModel.adsPct || 0) > 0;
    const nextShared =
      shared && costDidChange
        ? {
            ...shared,
            costStatus:
              roundedNextCost > 0
                ? shared.costStatus === 'not_filled'
                  ? ('plan' as const)
                  : shared.costStatus
                : ('not_filled' as const),
            expensesFilled:
              roundedNextCost > 0 && hasExplicitWbRates ? true : shared.expensesFilled,
          }
        : shared;

    // Если в режиме карточек редактируется родительская карточка LISKANI — синхронно масштабируем её liskaniSizeVariants
    // и выравниваем рубли родительского плана строго до суммы размерных вариантов (0 ₽ расхождения)
    const nextLiskaniVariants = scaleLiskaniVariantsFromParentUpdate({
      baseModel,
      nextPrice: roundedNextPrice,
      priceDidChange,
      nextCost: roundedNextCost,
      costDidChange,
      nextPacks,
      nextOrdersPacks,
      changedMonthIndices,
      effBuyoutPct,
    });
    if (Array.isArray(nextLiskaniVariants) && nextLiskaniVariants.length > 0) {
      for (let mIdx = 0; mIdx < 12; mIdx++) {
        if (nextRevOverride) {
          nextRevOverride[mIdx] = nextLiskaniVariants.reduce(
            (s, sv) => s + (sv.monthlyBuyoutsRub[mIdx] || 0),
            0
          );
        }
        if (nextOrdersRub) {
          nextOrdersRub[mIdx] = nextLiskaniVariants.reduce(
            (s, sv) => s + (sv.monthlyOrdersRub[mIdx] || 0),
            0
          );
        }
      }
    }

    const updatedPlanCore = {
      monthlyPacks: nextPacks,
      monthlyReceiptsPacks: nextReceipts,
      monthlyPricesRub: nextPrices,
      ...(nextRevOverride ? { monthlyRevenuesRubOverride: nextRevOverride } : {}),
      ...(nextOrdersPacks ? { monthlyOrdersPacks: nextOrdersPacks } : {}),
      ...(nextOrdersRub ? { monthlyOrdersRub: nextOrdersRub } : {}),
    };
    const isLiskaniModel =
      normalizePortfolioBrandCode(detectModelBrandPortfolioLabel(baseModel)) === 'LISKANI' ||
      (Array.isArray(baseModel.liskaniSizeVariants) && baseModel.liskaniSizeVariants.length > 0);
    const nextPlansByScenario: ScenarioModelSpec['plansByScenario'] = {
      ...baseModel.plansByScenario,
      [targetScenId]: {
        ...basePlan,
        ...updatedPlanCore,
        scenarioId: targetScenId,
      },
    };
    // Синхронизируем основные сценарии брендов с холдинговым Сценарием №1 аналогично unifiedBusinessEngine
    if (isAkusha && (targetScenId === 202706 || targetScenId === 1)) {
      for (const syncScId of [202706, 1]) {
        const prevSc = baseModel.plansByScenario[syncScId] || basePlan;
        nextPlansByScenario[syncScId] = {
          ...prevSc,
          ...updatedPlanCore,
          monthlyReceiptsPacks:
            Array.isArray(prevSc.monthlyReceiptsPacks) && prevSc.monthlyReceiptsPacks.length === 12
              ? [...prevSc.monthlyReceiptsPacks]
              : Array(12).fill(0),
          scenarioId: syncScId,
        };
      }
    } else if (isLiskaniModel && (targetScenId === LISKANI_2027_SCENARIO_ID || targetScenId === 1)) {
      for (const syncScId of [LISKANI_2027_SCENARIO_ID, 1]) {
        const prevSc = baseModel.plansByScenario[syncScId] || basePlan;
        nextPlansByScenario[syncScId] = {
          ...prevSc,
          ...updatedPlanCore,
          monthlyReceiptsPacks:
            Array.isArray(prevSc.monthlyReceiptsPacks) && prevSc.monthlyReceiptsPacks.length === 12
              ? [...prevSc.monthlyReceiptsPacks]
              : Array(12).fill(0),
          scenarioId: syncScId,
        };
      }
    }

    const updatedModel: ScenarioModelSpec = {
      ...baseModel,
      retailPriceRub: roundedNextPrice,
      unitCostRub: roundedNextCost,
      ...(nextShared ? { sharedSupplyAndFact: nextShared } : {}),
      ...(nextLiskaniVariants !== undefined
        ? { liskaniSizeVariants: nextLiskaniVariants }
        : {}),
      plansByScenario: nextPlansByScenario,
    };
    updatedById.set(target.id, updatedModel);

    diffByKey.set(target.id, {
      key: target.id,
      skuLabel: target.code,
      parentCode: detectModelBrandPortfolioLabel(target),
      subLabel: target.title,
      priceBefore: target.retailPriceRub,
      priceAfter: roundedNextPrice,
      costBefore: target.unitCostRub,
      costAfter: roundedNextCost,
      annualUnitsBefore: currentAnnualUnits,
      annualUnitsAfter: nextAnnualUnits,
      changedMonthsCount: rowChangedMonths,
    });
  }

  // Сохраняем исходные ссылки rawModels для всех незатронутых карточек
  const changedModelIds = Array.from(updatedById.keys());
  const updatedModels = rawModels.map((raw) => updatedById.get(raw.id) || raw);
  const totalsBefore = computeBrandModelsTotals(
    models,
    scenarioId,
    brandScope,
    selectedScenarioByBrand
  );
  const totalsAfter = computeBrandModelsTotals(
    updatedModels,
    scenarioId,
    brandScope,
    selectedScenarioByBrand
  );
  const previewDiffRows = Array.from(diffByKey.values());

  return {
    mode,
    recommendedMode,
    detectedColumns: cols,
    totalDataRows,
    matchedRowsCount,
    changedSkusCount: previewDiffRows.length,
    priceChangedCount: changedPriceKeys.size,
    costChangedCount: changedCostKeys.size,
    monthsChangedCount: changedMonthsKeys.size,
    metaFixedCount: fixedMetaKeys.size,
    duplicateRowsSkipped,
    skippedNoPermissionCount,
    unmatchedRows,
    totalsBefore,
    totalsAfter,
    previewDiffRows,
    changedModelIds,
    updatedModels,
  };
}
