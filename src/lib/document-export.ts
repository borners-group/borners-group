// =============================================================================
// BORNERS GROUP — ГЕНЕРАТОР КРАСИВЫХ PDF И EXCEL (.XLSX) ДОКУМЕНТОВ
// Формирует настоящие брендированные файлы .pdf (высокого разрешения A4 с
// поддержкой RU / EN / 中文) и настоящие многостраничные таблицы .xlsx (OpenXML
// со стилями, шапками, рамками, шириной колонок и финансовыми форматами).
// =============================================================================

import type {
  DocumentItem,
  FinancialPlanRow,
  Product,
  ProductConcept,
} from '@/types/platform';
import { resolvePublicAssetUrl } from './scenarioData.ts';
import { formatLabBrandLabel, normalizeLabBrandCode } from './rndCatalogSync.ts';
import { cleanTechPackText, getBrandProductionProfile } from './brandProductionConfig.ts';

// -----------------------------------------------------------------------------
// 1. НИЗКОУРОВНЕВЫЙ СБОРЩИК НАСТОЯЩЕГО .XLSX (OpenXML ZIP БЕЗ ЗАВИСИМОСТЕЙ)
// -----------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function createZipArchive(files: { name: string; content: string }[]): Uint8Array {
  const encoder = new TextEncoder();
  const encodedFiles = files.map((f) => ({
    nameBytes: encoder.encode(f.name),
    dataBytes: encoder.encode(f.content),
  }));

  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const file of encodedFiles) {
    const crc = crc32(file.dataBytes);
    const size = file.dataBytes.length;
    const nameLen = file.nameBytes.length;

    // Local file header (30 bytes + name)
    const localHeader = new Uint8Array(30 + nameLen);
    const lv = new DataView(localHeader.buffer);
    lv.setUint32(0, 0x04034b50, true); // signature
    lv.setUint16(4, 20, true); // version needed
    lv.setUint16(6, 0x0800, true); // UTF-8 flag
    lv.setUint16(8, 0, true); // store (no compression)
    lv.setUint16(10, 0, true); // mod time
    lv.setUint16(12, 0x5621, true); // mod date
    lv.setUint32(14, crc, true);
    lv.setUint32(18, size, true);
    lv.setUint32(22, size, true);
    lv.setUint16(26, nameLen, true);
    lv.setUint16(28, 0, true);
    localHeader.set(file.nameBytes, 30);

    localParts.push(localHeader, file.dataBytes);

    // Central directory header (46 bytes + name)
    const centralHeader = new Uint8Array(46 + nameLen);
    const cv = new DataView(centralHeader.buffer);
    cv.setUint32(0, 0x02014b50, true); // signature
    cv.setUint16(4, 20, true); // version made by
    cv.setUint16(6, 20, true); // version needed
    cv.setUint16(8, 0x0800, true); // UTF-8 flag
    cv.setUint16(10, 0, true); // method: store
    cv.setUint16(12, 0, true);
    cv.setUint16(14, 0x5621, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, nameLen, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true);
    cv.setUint32(38, 0, true);
    cv.setUint32(42, offset, true);
    centralHeader.set(file.nameBytes, 46);

    centralParts.push(centralHeader);
    offset += localHeader.length + size;
  }

  const centralSize = centralParts.reduce((s, p) => s + p.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, encodedFiles.length, true);
  ev.setUint16(10, encodedFiles.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  ev.setUint16(20, 0, true);

  const totalLength = offset + centralSize + eocd.length;
  const result = new Uint8Array(totalLength);
  let pos = 0;
  for (const p of localParts) {
    result.set(p, pos);
    pos += p.length;
  }
  for (const p of centralParts) {
    result.set(p, pos);
    pos += p.length;
  }
  result.set(eocd, pos);
  return result;
}

function escapeXml(str: string): string {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function colIndexToLetter(colIdx: number): string {
  let n = colIdx + 1;
  let s = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

export type XlsxStyleId =
  | 0 // Default
  | 1 // Hero Title Banner (Dark charcoal #181715, White 14pt bold)
  | 2 // Subtitle Banner (Warm stone #F3EFE8, Muted #5C5852 10pt)
  | 3 // Section Header (Terracotta tint #FBF3EE, #B85D35 11pt bold)
  | 4 // Table Header (Warm sand #EFECE6, #181715 10pt bold, border)
  | 5 // Data Text Even (#FFFFFF, #181715 10pt, border)
  | 6 // Data Text Odd (#FAF8F5, #181715 10pt, border)
  | 7 // Data Number Even (#,##0, right align, border)
  | 8 // Data Number Odd (#,##0, right align, border)
  | 9 // Data Currency Even (#,##0 ₽, right align, bold, border)
  | 10 // Data Currency Odd (#,##0 ₽, right align, bold, border)
  | 11 // Total Row Label (#EFECE6, #181715 11pt bold, top/bottom border)
  | 12; // Total Row Value (#EFECE6, #B85D35 11pt bold, currency/number)

export interface XlsxCell {
  value: string | number;
  style?: XlsxStyleId;
  type?: 'string' | 'number';
}

export interface XlsxRow {
  height?: number;
  cells: XlsxCell[];
  mergeAcross?: number; // If set on row with 1 cell, merges A..N
}

export interface XlsxSheetSpec {
  name: string;
  colWidths: number[];
  rows: XlsxRow[];
}

const XLSX_STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="2">
    <numFmt numFmtId="164" formatCode="#,##0"/>
    <numFmt numFmtId="165" formatCode="#,##0 &quot;₽&quot;"/>
  </numFmts>
  <fonts count="7">
    <font><sz val="10"/><color rgb="FF181715"/><name val="Calibri"/></font>
    <font><b/><sz val="14"/><color rgb="FFFAF8F5"/><name val="Calibri"/></font>
    <font><sz val="10"/><color rgb="FF5C5852"/><name val="Calibri"/></font>
    <font><b/><sz val="11"/><color rgb="FFB85D35"/><name val="Calibri"/></font>
    <font><b/><sz val="10"/><color rgb="FF181715"/><name val="Calibri"/></font>
    <font><b/><sz val="11"/><color rgb="FF181715"/><name val="Calibri"/></font>
    <font><b/><sz val="11"/><color rgb="FFB85D35"/><name val="Calibri"/></font>
  </fonts>
  <fills count="8">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF181715"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFF3EFE8"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFFBF3EE"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFEFECE6"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFFFFFFF"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFFAF8F5"/></patternFill></fill>
  </fills>
  <borders count="4">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border>
      <left style="thin"><color rgb="FFE5E0D8"/></left>
      <right style="thin"><color rgb="FFE5E0D8"/></right>
      <top style="thin"><color rgb="FFE5E0D8"/></top>
      <bottom style="thin"><color rgb="FFE5E0D8"/></bottom>
      <diagonal/>
    </border>
    <border>
      <left style="thin"><color rgb="FFD5CFC4"/></left>
      <right style="thin"><color rgb="FFD5CFC4"/></right>
      <top style="medium"><color rgb="FF181715"/></top>
      <bottom style="thin"><color rgb="FFD5CFC4"/></bottom>
      <diagonal/>
    </border>
    <border>
      <left style="thin"><color rgb="FFD5CFC4"/></left>
      <right style="thin"><color rgb="FFD5CFC4"/></right>
      <top style="medium"><color rgb="FF181715"/></top>
      <bottom style="double"><color rgb="FF181715"/></bottom>
      <diagonal/>
    </border>
  </borders>
  <cellStyleXfs count="1">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
  </cellStyleXfs>
  <cellXfs count="13">
    <!-- 0: Default -->
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <!-- 1: Hero Title Banner -->
    <xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1">
      <alignment vertical="center" indent="1"/>
    </xf>
    <!-- 2: Subtitle Banner -->
    <xf numFmtId="0" fontId="2" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment vertical="center" indent="1"/>
    </xf>
    <!-- 3: Section Header -->
    <xf numFmtId="0" fontId="3" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment vertical="center" indent="1"/>
    </xf>
    <!-- 4: Table Header -->
    <xf numFmtId="0" fontId="4" fillId="5" borderId="2" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment vertical="center" wrapText="1"/>
    </xf>
    <!-- 5: Data Text Even -->
    <xf numFmtId="0" fontId="0" fillId="6" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment vertical="center" wrapText="1"/>
    </xf>
    <!-- 6: Data Text Odd -->
    <xf numFmtId="0" fontId="0" fillId="7" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment vertical="center" wrapText="1"/>
    </xf>
    <!-- 7: Data Number Even -->
    <xf numFmtId="164" fontId="0" fillId="6" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="right" vertical="center"/>
    </xf>
    <!-- 8: Data Number Odd -->
    <xf numFmtId="164" fontId="0" fillId="7" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="right" vertical="center"/>
    </xf>
    <!-- 9: Data Currency Even -->
    <xf numFmtId="165" fontId="4" fillId="6" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="right" vertical="center"/>
    </xf>
    <!-- 10: Data Currency Odd -->
    <xf numFmtId="165" fontId="4" fillId="7" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="right" vertical="center"/>
    </xf>
    <!-- 11: Total Row Label -->
    <xf numFmtId="0" fontId="5" fillId="5" borderId="3" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment vertical="center"/>
    </xf>
    <!-- 12: Total Row Value -->
    <xf numFmtId="165" fontId="6" fillId="5" borderId="3" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="right" vertical="center"/>
    </xf>
  </cellXfs>
</styleSheet>`;

export function buildXlsxBytes(sheets: XlsxSheetSpec[]): Uint8Array {
  const safeSheets = sheets.length > 0 ? sheets : [{ name: 'BORNERS', colWidths: [25, 45], rows: [] }];

  const files: { name: string; content: string }[] = [
    {
      name: '[Content_Types].xml',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  ${safeSheets
    .map(
      (_, i) =>
        `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
    )
    .join('\n  ')}
</Types>`,
    },
    {
      name: '_rels/.rels',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`,
    },
    {
      name: 'xl/workbook.xml',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    ${safeSheets
      .map(
        (s, i) =>
          `<sheet name="${escapeXml(s.name.slice(0, 31))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`
      )
      .join('\n    ')}
  </sheets>
</workbook>`,
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${safeSheets
    .map(
      (_, i) =>
        `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`
    )
    .join('\n  ')}
  <Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`,
    },
    {
      name: 'xl/styles.xml',
      content: XLSX_STYLES_XML,
    },
  ];

  safeSheets.forEach((sheet, idx) => {
    const colsXml =
      sheet.colWidths.length > 0
        ? `<cols>${sheet.colWidths
            .map(
              (w, cIdx) =>
                `<col min="${cIdx + 1}" max="${cIdx + 1}" width="${w}" customWidth="1"/>`
            )
            .join('')}</cols>`
        : '';

    const merges: string[] = [];
    const rowsXml = sheet.rows
      .map((row, rIdx) => {
        const rowNum = rIdx + 1;
        const htAttr = row.height ? ` ht="${row.height}" customHeight="1"` : ' ht="22" customHeight="1"';

        if (row.mergeAcross && row.mergeAcross > 0 && row.cells.length > 0) {
          const endCol = colIndexToLetter(row.mergeAcross);
          merges.push(`<mergeCell ref="A${rowNum}:${endCol}${rowNum}"/>`);
        }

        const cellsXml = row.cells
          .map((cell, cIdx) => {
            const ref = `${colIndexToLetter(cIdx)}${rowNum}`;
            const styleAttr = cell.style !== undefined ? ` s="${cell.style}"` : '';
            const isNum =
              cell.type === 'number' ||
              (typeof cell.value === 'number' && Number.isFinite(cell.value));
            if (isNum) {
              return `<c r="${ref}"${styleAttr}><v>${cell.value}</v></c>`;
            }
            return `<c r="${ref}" t="inlineStr"${styleAttr}><is><t xml:space="preserve">${escapeXml(
              String(cell.value ?? '')
            )}</t></is></c>`;
          })
          .join('');

        return `<row r="${rowNum}"${htAttr}>${cellsXml}</row>`;
      })
      .join('\n    ');

    const mergeXml =
      merges.length > 0
        ? `<mergeCells count="${merges.length}">${merges.join('')}</mergeCells>`
        : '';

    files.push({
      name: `xl/worksheets/sheet${idx + 1}.xml`,
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetViews><sheetView workbookViewId="0" showGridLines="1"/></sheetViews>
  ${colsXml}
  <sheetData>
    ${rowsXml}
  </sheetData>
  ${mergeXml}
</worksheet>`,
    });
  });

  return createZipArchive(files);
}

// -----------------------------------------------------------------------------
// 2. СБОРЩИК НАСТОЯЩЕГО МНОГОСТРАНИЧНОГО .PDF ИЗ RETINA-CANVAS (A4 1654×2339)
// -----------------------------------------------------------------------------

function dataUrlToUint8Array(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(',')[1] || '';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function buildPdfFromJpegPages(
  pages: { jpegBytes: Uint8Array; widthPx: number; heightPx: number }[]
): Uint8Array {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [0]; // object 0
  let currentOffset = 0;

  const pushStr = (s: string) => {
    const b = encoder.encode(s);
    chunks.push(b);
    currentOffset += b.length;
  };

  const pushBytes = (b: Uint8Array) => {
    chunks.push(b);
    currentOffset += b.length;
  };

  const startObj = (id: number) => {
    offsets[id] = currentOffset;
    pushStr(`${id} 0 obj\n`);
  };

  const endObj = () => {
    pushStr(`\nendobj\n`);
  };

  pushStr(`%PDF-1.4\n%\xFF\xFF\xFF\xFF\n`);

  // Object 1: Catalog
  startObj(1);
  pushStr(`<< /Type /Catalog /Pages 2 0 R >>`);
  endObj();

  // Each page uses 3 objects: Page (3 + i*3), ContentStream (4 + i*3), ImageXObject (5 + i*3)
  const pageObjIds = pages.map((_, i) => 3 + i * 3);

  // Object 2: Pages
  startObj(2);
  pushStr(
    `<< /Type /Pages /Kids [${pageObjIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${
      pages.length
    } >>`
  );
  endObj();

  const pagePtW = 595.28; // A4 width in pt
  const pagePtH = 841.89; // A4 height in pt

  pages.forEach((p, i) => {
    const pageId = 3 + i * 3;
    const contentId = 4 + i * 3;
    const imgId = 5 + i * 3;

    startObj(pageId);
    pushStr(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pagePtW} ${pagePtH}] /Resources << /XObject << /Im${i} ${imgId} 0 R >> >> /Contents ${contentId} 0 R >>`
    );
    endObj();

    const contentStream = `q\n${pagePtW} 0 0 ${pagePtH} 0 0 cm\n/Im${i} Do\nQ\n`;
    const contentBytes = encoder.encode(contentStream);
    startObj(contentId);
    pushStr(`<< /Length ${contentBytes.length} >>\nstream\n`);
    pushBytes(contentBytes);
    pushStr(`\nendstream`);
    endObj();

    startObj(imgId);
    pushStr(
      `<< /Type /XObject /Subtype /Image /Width ${p.widthPx} /Height ${p.heightPx} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpegBytes.length} >>\nstream\n`
    );
    pushBytes(p.jpegBytes);
    pushStr(`\nendstream`);
    endObj();
  });

  const totalObjs = 3 + pages.length * 3;
  const xrefOffset = currentOffset;
  pushStr(`xref\n0 ${totalObjs}\n`);
  pushStr(`0000000000 65535 f \n`);
  for (let id = 1; id < totalObjs; id++) {
    const off = String(offsets[id] || 0).padStart(10, '0');
    pushStr(`${off} 00000 n \n`);
  }
  pushStr(
    `trailer\n<< /Size ${totalObjs} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`
  );

  const output = new Uint8Array(currentOffset);
  let pos = 0;
  for (const c of chunks) {
    output.set(c, pos);
    pos += c.length;
  }
  return output;
}

// -----------------------------------------------------------------------------
// 3. РЕДАКЦИОННЫЙ ОТРИСОВЩИК A4 PDF-ЛИСТОВ (ТЕХЗАДАНИЯ, ЗАКАЗЫ RU/EN/ZH, ПАСПОРТА)
// -----------------------------------------------------------------------------

export interface EditorialPdfSection {
  badge?: string;
  titleZh?: string;
  title: string;
  subtitle?: string;
  rows?: { label: string; value: string; highlight?: boolean }[];
  bilingualSpecs?: {
    labelZh: string;
    labelRu: string;
    zhLarge: string;
    ruSmall: string;
    highlight?: boolean;
  }[];
  table?: {
    headers: string[];
    rows: string[][];
    footer?: string[];
  };
  swatches?: { name: string; code: string; hex: string; note: string }[];
  noteZh?: string;
  note?: string;
}

export interface EditorialPdfDocumentSpec {
  fileName: string;
  docCode: string;
  categoryLabel: string;
  brandLabel: string;
  titleZh?: string;
  title: string;
  subtitleZh?: string;
  subtitle: string;
  metaGrid: { label: string; value: string; subValueRu?: string }[];
  frontPhotoUrl?: string;
  backPhotoUrl?: string;
  frontPhotoCaption?: string;
  backPhotoCaption?: string;
  sections: EditorialPdfSection[];
  footerRight: string;
}

export async function compressImageFileToDataUrl(
  file: File,
  maxDim = 760,
  quality = 0.76
): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      const rawUrl = typeof reader.result === 'string' ? reader.result : '';
      if (!rawUrl || typeof document === 'undefined') {
        resolve(rawUrl);
        return;
      }
      const img = new Image();
      img.onload = () => {
        const renderAt = (dim: number, q: number): string => {
          const scale = Math.min(1, dim / Math.max(img.width || 1, img.height || 1));
          const w = Math.max(1, Math.round((img.width || 1) * scale));
          const h = Math.max(1, Math.round((img.height || 1) * scale));
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (!ctx) return rawUrl;
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);
          return canvas.toDataURL('image/jpeg', q);
        };

        let encoded = renderAt(maxDim, quality);
        if (encoded.length > 64_000) {
          encoded = renderAt(560, 0.68);
        }
        if (encoded.length > 64_000) {
          encoded = renderAt(460, 0.6);
        }
        if (encoded.length > 64_000) {
          encoded = renderAt(380, 0.54);
        }
        resolve(encoded);
      };
      img.onerror = () => resolve(rawUrl);
      img.src = rawUrl;
    };
    reader.onerror = () => resolve('');
    reader.readAsDataURL(file);
  });
}

function loadImageForPdf(url?: string): Promise<HTMLImageElement | null> {
  if (!url || typeof Image === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const timer = window.setTimeout(() => resolve(null), 2500);
    img.onload = () => {
      window.clearTimeout(timer);
      resolve(img);
    };
    img.onerror = () => {
      window.clearTimeout(timer);
      resolve(null);
    };
    img.src = resolvePublicAssetUrl(url);
  });
}

function wrapCanvasText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const words = String(text || '').split(/\s+/);
  const lines: string[] = [];
  let current = '';

  for (const w of words) {
    const candidate = current ? `${current} ${w}` : w;
    if (ctx.measureText(candidate).width <= maxWidth) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      current = w;
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : ['—'];
}

export function downloadEditorialPdfDocument(spec: EditorialPdfDocumentSpec): void {
  if (typeof document === 'undefined') return;

  const runRender = (frontImg: HTMLImageElement | null, backImg: HTMLImageElement | null) => {
    const W = 1654; // A4 @ 200 DPI
    const H = 2339;
    const PAD = 104;
    const CONTENT_W = W - PAD * 2;
    const MAX_CONTENT_Y = H - 150;

    const sansFont =
      '-apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", "PingFang SC", "Heiti SC", sans-serif';
    const serifFont = 'Georgia, "Cormorant Garamond", "Times New Roman", serif';
    const monoFont = 'ui-monospace, "SF Mono", Menlo, monospace';

    const pageCanvases: HTMLCanvasElement[] = [];
    let ctx!: CanvasRenderingContext2D;
    let y = 108;

    const startPage = (isContinuation: boolean): boolean => {
      const pageCanvas = document.createElement('canvas');
      pageCanvas.width = W;
      pageCanvas.height = H;
      const nextCtx = pageCanvas.getContext('2d');
      if (!nextCtx) return false;
      ctx = nextCtx;
      pageCanvases.push(pageCanvas);

      // Background: warm paper #FAF8F5
      ctx.fillStyle = '#FAF8F5';
      ctx.fillRect(0, 0, W, H);

      // Top dark editorial accent bar
      ctx.fillStyle = '#181715';
      ctx.fillRect(0, 0, W, 14);

      // Outer architectural frame
      ctx.strokeStyle = '#CFC8BC';
      ctx.lineWidth = 2.5;
      ctx.strokeRect(56, 56, W - 112, H - 112);

      y = 108;

      // Header row: Brand & Doc Code
      ctx.fillStyle = '#8C867E';
      ctx.font = `600 18px ${monoFont}`;
      const headerCodeSuffix = isContinuation
        ? `${spec.docCode}  ·  续页 / ПРОДОЛЖЕНИЕ`
        : spec.docCode;
      ctx.fillText(
        `BORNERS GROUP  ·  ${spec.categoryLabel.toUpperCase()}  ·  ${headerCodeSuffix}`,
        PAD,
        y
      );

      // Right pill: Brand
      const brandPillText = spec.titleZh
        ? `品牌 / БРЕНД: ${spec.brandLabel}`
        : `БРЕНД: ${spec.brandLabel}`;
      ctx.font = `600 17px ${sansFont}`;
      const pillW = ctx.measureText(brandPillText).width + 36;
      ctx.fillStyle = spec.brandLabel.includes('НА ТЕЛЕ') ? '#8C7A6B' : '#181715';
      ctx.beginPath();
      ctx.roundRect(W - PAD - pillW, y - 24, pillW, 34, 6);
      ctx.fill();
      ctx.fillStyle = '#FAF8F5';
      ctx.fillText(brandPillText, W - PAD - pillW + 18, y - 1);

      y += 48;
      return true;
    };

    if (!startPage(false)) return;

    const ensureVerticalSpace = (neededH: number, onNewPage?: () => void) => {
      if (y + neededH > MAX_CONTENT_Y) {
        startPage(true);
        if (onNewPage) onNewPage();
      }
    };

    // Main Document Title (If titleZh is provided: LARGE CHINESE on top + small Russian title underneath)
    if (spec.titleZh) {
      ctx.fillStyle = '#181715';
      ctx.font = `700 38px ${sansFont}`;
      const zhTitleLines = wrapCanvasText(ctx, spec.titleZh, CONTENT_W);
      for (const line of zhTitleLines.slice(0, 2)) {
        ctx.fillText(line, PAD, y);
        y += 44;
      }

      ctx.fillStyle = '#5C5852';
      ctx.font = `500 17.5px ${sansFont}`;
      const ruTitleLines = wrapCanvasText(ctx, spec.title, CONTENT_W);
      for (const line of ruTitleLines.slice(0, 1)) {
        ctx.fillText(line, PAD, y - 6);
        y += 24;
      }

      if (spec.subtitleZh) {
        ctx.fillStyle = '#B85D35';
        ctx.font = `600 17.5px ${sansFont}`;
        const zhSubLines = wrapCanvasText(ctx, spec.subtitleZh, CONTENT_W);
        for (const line of zhSubLines.slice(0, 1)) {
          ctx.fillText(line, PAD, y - 4);
          y += 22;
        }
      }

      ctx.fillStyle = '#7A756D';
      ctx.font = `400 14.5px ${sansFont}`;
      const subLines = wrapCanvasText(ctx, spec.subtitle, CONTENT_W);
      for (const line of subLines.slice(0, 1)) {
        ctx.fillText(line, PAD, y - 4);
        y += 20;
      }
    } else {
      ctx.fillStyle = '#181715';
      ctx.font = `600 42px ${serifFont}`;
      const titleLines = wrapCanvasText(ctx, spec.title, CONTENT_W);
      for (const line of titleLines.slice(0, 2)) {
        ctx.fillText(line, PAD, y);
        y += 48;
      }

      ctx.fillStyle = '#6E6A63';
      ctx.font = `400 20px ${sansFont}`;
      const subLines = wrapCanvasText(ctx, spec.subtitle, CONTENT_W);
      for (const line of subLines.slice(0, 2)) {
        ctx.fillText(line, PAD, y);
        y += 28;
      }
    }

    y += 10;

    // 4-Column Architectural Meta Ledger (supports Chinese value + small Russian subValueRu underneath)
    const hasSubValues = spec.metaGrid.some((m) => Boolean(m.subValueRu));
    const metaH = hasSubValues ? 104 : 88;
    ctx.fillStyle = '#FFFFFF';
    ctx.strokeStyle = '#D4CDC2';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(PAD, y, CONTENT_W, metaH, 10);
    ctx.fill();
    ctx.stroke();

    const metaCols = spec.metaGrid.slice(0, 4);
    const colW = CONTENT_W / (metaCols.length || 1);
    metaCols.forEach((m, idx) => {
      const cx = PAD + idx * colW;
      if (idx > 0) {
        ctx.beginPath();
        ctx.moveTo(cx, y + 14);
        ctx.lineTo(cx, y + metaH - 14);
        ctx.strokeStyle = '#D4CDC2';
        ctx.stroke();
      }
      ctx.fillStyle = '#8C867E';
      ctx.font = `500 13.5px ${sansFont}`;
      ctx.fillText(m.label, cx + 18, y + 26);

      ctx.fillStyle = '#181715';
      ctx.font = `700 18.5px ${sansFont}`;
      const valLines = wrapCanvasText(ctx, m.value, colW - 28);
      ctx.fillText(valLines[0] || '—', cx + 18, y + 55);

      if (m.subValueRu) {
        ctx.fillStyle = '#6E6A63';
        ctx.font = `400 13px ${sansFont}`;
        const ruSubLines = wrapCanvasText(ctx, m.subValueRu, colW - 28);
        ctx.fillText(ruSubLines[0] || '', cx + 18, y + 81);
      }
    });

    y += metaH + 22;

    // Optional Product Photos Row (Лицевая фотография + Вид сзади / Детали)
    if (frontImg || backImg) {
      const photoBoxH = 290;
      const boxW = (CONTENT_W - 24) / 2;
      const cards = [
        {
          img: frontImg,
          labelZh: '01 · 正面实物图 (FRONT VIEW)',
          labelRu: spec.frontPhotoCaption || 'Лицевая фотография товара (Вид спереди)',
        },
        {
          img: backImg || frontImg,
          labelZh: '02 · 背面及工艺细节 (BACK / DETAILS)',
          labelRu: spec.backPhotoCaption || 'Вид сзади, посадка пояса и детали швов',
        },
      ];

      cards.forEach((c, idx) => {
        const bx = PAD + idx * (boxW + 24);
        ctx.fillStyle = '#FFFFFF';
        ctx.strokeStyle = '#CFC8BC';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(bx, y, boxW, photoBoxH, 10);
        ctx.fill();
        ctx.stroke();

        // Photo frame inside left side of box
        const imgAreaW = 240;
        const imgAreaH = photoBoxH - 28;
        ctx.fillStyle = '#F3EFE8';
        ctx.beginPath();
        ctx.roundRect(bx + 14, y + 14, imgAreaW, imgAreaH, 8);
        ctx.fill();

        if (c.img) {
          const iw = c.img.width || 1;
          const ih = c.img.height || 1;
          const scale = Math.min((imgAreaW - 12) / iw, (imgAreaH - 12) / ih);
          const dw = iw * scale;
          const dh = ih * scale;
          const dx = bx + 14 + (imgAreaW - dw) / 2;
          const dy = y + 14 + (imgAreaH - dh) / 2;
          ctx.drawImage(c.img, dx, dy, dw, dh);
        }

        // Caption right of photo: LARGE CHINESE on top, small Russian underneath
        const tx = bx + imgAreaW + 34;
        const tw = boxW - imgAreaW - 50;
        ctx.fillStyle = '#B85D35';
        ctx.font = `700 15px ${monoFont}`;
        ctx.fillText(c.labelZh, tx, y + 52);

        const secondPhotoHeadingZh =
          spec.brandLabel === 'AKUSHA'
            ? '真皮鞋面、防滑大底及车缝细节'
            : spec.brandLabel === 'LISKANI'
            ? '窗帘面料垂感、帘头及底边工艺细节'
            : spec.brandLabel === 'НА ТЕЛЕ'
            ? '无痕激光切边及亲肤内里细节'
            : '38mm超柔腰头及四针六线平缝细节';
        ctx.fillStyle = '#181715';
        ctx.font = `700 23px ${sansFont}`;
        ctx.fillText(
          idx === 0 ? '请按正面确认样衣版型及色卡生产' : secondPhotoHeadingZh,
          tx,
          y + 92
        );

        ctx.fillStyle = '#6E6A63';
        ctx.font = `400 14px ${sansFont}`;
        const capLines = wrapCanvasText(ctx, c.labelRu, tw);
        capLines.slice(0, 3).forEach((cl, lIdx) => {
          ctx.fillText(cl, tx, y + 128 + lIdx * 21);
        });

        ctx.fillStyle = '#1F6E50';
        ctx.font = `700 15px ${sansFont}`;
        ctx.fillText('✓ 已确认投产 (Утверждено в заказ)', tx, y + photoBoxH - 26);
      });

      y += photoBoxH + 22;
    }

    // Sections
    for (const sec of spec.sections) {
      const secHeaderH = sec.titleZh ? 56 : 42;
      ensureVerticalSpace(secHeaderH + 110);

      // Section card calculation & header (supports titleZh large + small Russian title underneath)
      ctx.fillStyle = '#EFECE6';
      ctx.beginPath();
      ctx.roundRect(PAD, y, CONTENT_W, secHeaderH, 8);
      ctx.fill();

      let secTitleX = PAD + 18;
      if (sec.badge) {
        ctx.fillStyle = '#B85D35';
        ctx.font = `700 14px ${monoFont}`;
        ctx.fillText(sec.badge, secTitleX, y + (sec.titleZh ? 23 : 27));
        secTitleX += ctx.measureText(sec.badge).width + 16;
      }

      if (sec.titleZh) {
        ctx.fillStyle = '#181715';
        ctx.font = `700 20px ${sansFont}`;
        ctx.fillText(sec.titleZh, secTitleX, y + 24);

        ctx.fillStyle = '#6E6A63';
        ctx.font = `400 13px ${sansFont}`;
        ctx.fillText(sec.title, secTitleX, y + 44);
      } else {
        ctx.fillStyle = '#181715';
        ctx.font = `600 19.5px ${sansFont}`;
        ctx.fillText(sec.title, secTitleX, y + 27);
      }

      if (sec.subtitle) {
        ctx.fillStyle = '#7A756D';
        ctx.font = `500 14.5px ${sansFont}`;
        const sw = ctx.measureText(sec.subtitle).width;
        ctx.fillText(sec.subtitle, W - PAD - sw - 18, y + (sec.titleZh ? 33 : 27));
      }

      y += secHeaderH + 10;

      // Bilingual Chinese-First Rows (Крупный китайский 中文 + подстрочный русский)
      if (sec.bilingualSpecs && sec.bilingualSpecs.length > 0) {
        const colWidth = (CONTENT_W - 24) / 2;
        for (let i = 0; i < sec.bilingualSpecs.length; i += 2) {
          const boxH = 104;
          ensureVerticalSpace(boxH + 12);
          const pair = [sec.bilingualSpecs[i], sec.bilingualSpecs[i + 1]].filter(Boolean);

          pair.forEach((item, pIdx) => {
            const rx = PAD + pIdx * (colWidth + 24);
            ctx.fillStyle = item.highlight ? '#FBF3EE' : '#FFFFFF';
            ctx.strokeStyle = item.highlight ? '#B85D35' : '#D4CDC2';
            ctx.lineWidth = 1.75;

            ctx.beginPath();
            ctx.roundRect(rx, y, colWidth, boxH, 8);
            ctx.fill();
            ctx.stroke();

            // Header label: Chinese + Russian small tag
            ctx.fillStyle = '#8C867E';
            ctx.font = `600 13.5px ${sansFont}`;
            ctx.fillText(`${item.labelZh}  ·  ${item.labelRu}`, rx + 16, y + 24);

            // LARGE BOLD CHINESE (25px bold)
            ctx.fillStyle = item.highlight ? '#B85D35' : '#181715';
            ctx.font = `700 24.5px ${sansFont}`;
            const zhLines = wrapCanvasText(ctx, item.zhLarge, colWidth - 32);
            ctx.fillText(zhLines[0] || '—', rx + 16, y + 58);

            // SMALLER RUSSIAN SUBTITLE (14.5px)
            ctx.fillStyle = '#5C5852';
            ctx.font = `500 14.5px ${sansFont}`;
            const ruLines = wrapCanvasText(ctx, item.ruSmall, colWidth - 32);
            ctx.fillText(ruLines[0] || '—', rx + 16, y + 86);
          });

          y += boxH + 12;
        }
        y += 8;
      }

      // Key-Value rows (2-column grid)
      if (sec.rows && sec.rows.length > 0) {
        const colWidth = (CONTENT_W - 24) / 2;
        for (let i = 0; i < sec.rows.length; i += 2) {
          ensureVerticalSpace(98);
          const pair = [sec.rows[i], sec.rows[i + 1]].filter(Boolean);
          let maxRowH = 66;

          pair.forEach((item, pIdx) => {
            const rx = PAD + pIdx * (colWidth + 24);
            ctx.fillStyle = item.highlight ? '#FBF3EE' : '#FFFFFF';
            ctx.strokeStyle = item.highlight ? '#E8C9B5' : '#EAE6DF';
            ctx.lineWidth = 1.5;

            ctx.font = `500 18px ${sansFont}`;
            const vLines = wrapCanvasText(ctx, item.value, colWidth - 32).slice(0, 2);
            const boxH = vLines.length > 1 ? 86 : 66;
            if (boxH > maxRowH) maxRowH = boxH;

            ctx.beginPath();
            ctx.roundRect(rx, y, colWidth, boxH, 8);
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = '#8C867E';
            ctx.font = `500 14px ${sansFont}`;
            ctx.fillText(item.label, rx + 16, y + 23);

            ctx.fillStyle = item.highlight ? '#B85D35' : '#181715';
            ctx.font = `600 17.5px ${sansFont}`;
            vLines.forEach((vl, vlIdx) => {
              ctx.fillText(vl, rx + 16, y + 48 + vlIdx * 22);
            });
          });

          y += maxRowH + 12;
        }
        y += 10;
      }

      // Swatches (for Pantone / Design specs)
      if (sec.swatches && sec.swatches.length > 0) {
        const swW = (CONTENT_W - (sec.swatches.length - 1) * 16) / sec.swatches.length;
        const swH = 128;
        ensureVerticalSpace(swH + 22);
        sec.swatches.forEach((sw, idx) => {
          const sx = PAD + idx * (swW + 16);
          ctx.fillStyle = '#FFFFFF';
          ctx.strokeStyle = '#EAE6DF';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.roundRect(sx, y, swW, swH, 8);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = sw.hex;
          ctx.beginPath();
          ctx.roundRect(sx + 10, y + 10, swW - 20, 52, 5);
          ctx.fill();

          ctx.fillStyle = '#181715';
          ctx.font = `600 15px ${sansFont}`;
          ctx.fillText(sw.name, sx + 12, y + 84);

          ctx.fillStyle = '#7A756D';
          ctx.font = `500 13px ${monoFont}`;
          ctx.fillText(sw.code, sx + 12, y + 104);

          ctx.fillStyle = '#8C867E';
          ctx.font = `400 12px ${sansFont}`;
          ctx.fillText(sw.note, sx + 12, y + 120);
        });
        y += swH + 22;
      }

      // Table
      if (sec.table) {
        const tableSpec = sec.table;
        const colsCount = tableSpec.headers.length;
        const cellW = CONTENT_W / colsCount;
        const headerH = 40;

        const drawTableHeader = () => {
          ctx.fillStyle = '#181715';
          ctx.beginPath();
          ctx.roundRect(PAD, y, CONTENT_W, headerH, 6);
          ctx.fill();

          ctx.fillStyle = '#FAF8F5';
          ctx.font = `600 15px ${sansFont}`;
          tableSpec.headers.forEach((h, cIdx) => {
            ctx.fillText(h, PAD + cIdx * cellW + 16, y + 26);
          });
          y += headerH;
        };

        ensureVerticalSpace(headerH + 40);
        drawTableHeader();

        // Table Rows
        tableSpec.rows.forEach((r, rIdx) => {
          const rowH = 36;
          ensureVerticalSpace(rowH, drawTableHeader);
          ctx.fillStyle = rIdx % 2 === 0 ? '#FFFFFF' : '#F4F1EA';
          ctx.fillRect(PAD, y, CONTENT_W, rowH);
          ctx.strokeStyle = '#EAE6DF';
          ctx.lineWidth = 1;
          ctx.strokeRect(PAD, y, CONTENT_W, rowH);

          r.forEach((val, cIdx) => {
            ctx.fillStyle = cIdx === 0 ? '#181715' : '#4A4742';
            ctx.font = cIdx === 0 ? `600 15.5px ${sansFont}` : `500 15.5px ${sansFont}`;
            const lines = wrapCanvasText(ctx, val, cellW - 24);
            ctx.fillText(lines[0] || '', PAD + cIdx * cellW + 16, y + 24);
          });
          y += rowH;
        });

        if (tableSpec.footer) {
          const footH = 40;
          ensureVerticalSpace(footH, drawTableHeader);
          ctx.fillStyle = '#FBF3EE';
          ctx.fillRect(PAD, y, CONTENT_W, footH);
          ctx.strokeStyle = '#B85D35';
          ctx.lineWidth = 1.5;
          ctx.strokeRect(PAD, y, CONTENT_W, footH);

          tableSpec.footer.forEach((val, cIdx) => {
            ctx.fillStyle = cIdx === tableSpec.footer!.length - 1 ? '#B85D35' : '#181715';
            ctx.font = `700 16px ${sansFont}`;
            ctx.fillText(val, PAD + cIdx * cellW + 16, y + 26);
          });
          y += footH;
        }

        y += 20;
      }

      if (sec.noteZh || sec.note) {
        ensureVerticalSpace(96);
        if (sec.noteZh) {
          ctx.fillStyle = '#181715';
          ctx.font = `700 16px ${sansFont}`;
          const zhLines = wrapCanvasText(ctx, sec.noteZh, CONTENT_W);
          zhLines.slice(0, 2).forEach((zl) => {
            ctx.fillText(zl, PAD, y + 16);
            y += 22;
          });
        }
        if (sec.note) {
          ctx.fillStyle = '#6E6A63';
          ctx.font = `400 13.5px ${sansFont}`;
          const nLines = wrapCanvasText(ctx, sec.note, CONTENT_W);
          nLines.slice(0, 2).forEach((nl) => {
            ctx.fillText(nl, PAD, y + 14);
            y += 19;
          });
        }
        y += 6;
      }
    }

    // Draw Footer on every page & collect JPEG pages
    const totalPages = pageCanvases.length;
    const pdfPages = pageCanvases.map((pageCanvas, pageIdx) => {
      const pCtx = pageCanvas.getContext('2d')!;
      const footerY = H - 94;
      pCtx.strokeStyle = '#DCD6CC';
      pCtx.lineWidth = 1.5;
      pCtx.beginPath();
      pCtx.moveTo(PAD, footerY - 24);
      pCtx.lineTo(W - PAD, footerY - 24);
      pCtx.stroke();

      pCtx.fillStyle = '#8C867E';
      pCtx.font = `500 14.5px ${sansFont}`;
      pCtx.fillText(
        spec.titleZh
          ? 'BORNERS GROUP (borners-group.ru) · 生产工艺及大货采购确认单 (Официальная производственная спецификация)'
          : 'BORNERS GROUP (borners-group.ru)  ·  Официальный документ рабочей платформы (2026–2027)',
        PAD,
        footerY + 6
      );

      const pageTag = totalPages > 1 ? `  ·  Стр. ${pageIdx + 1} / ${totalPages}` : '';
      const footerRightText = `${spec.footerRight}${pageTag}`;
      pCtx.fillStyle = '#181715';
      pCtx.font = `600 15.5px ${monoFont}`;
      const rightW = pCtx.measureText(footerRightText).width;
      pCtx.fillText(footerRightText, W - PAD - rightW, footerY + 6);

      const jpegDataUrl = pageCanvas.toDataURL('image/jpeg', 0.92);
      return {
        jpegBytes: dataUrlToUint8Array(jpegDataUrl),
        widthPx: W,
        heightPx: H,
      };
    });

    const pdfBytes = buildPdfFromJpegPages(pdfPages);

    const blob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = spec.fileName.endsWith('.pdf') ? spec.fileName : `${spec.fileName}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (spec.frontPhotoUrl || spec.backPhotoUrl) {
    Promise.all([
      loadImageForPdf(spec.frontPhotoUrl),
      loadImageForPdf(spec.backPhotoUrl || spec.frontPhotoUrl),
    ]).then(([fImg, bImg]) => {
      runRender(fImg, bImg);
    });
  } else {
    runRender(null, null);
  }
}

export function downloadXlsxWorkbook(fileName: string, sheets: XlsxSheetSpec[]): void {
  if (typeof document === 'undefined') return;
  const bytes = buildXlsxBytes(sheets);
  const blob = new Blob([bytes.buffer as ArrayBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const cleanName = fileName.replace(/\.[^/.]+$/, '');
  a.download = `${cleanName}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

// -----------------------------------------------------------------------------
// 4. ГОТОВЫЕ ГЕНЕРАТОРЫ PDF И EXCEL ДЛЯ ВСЕХ ДОКУМЕНТОВ И РАЗДЕЛОВ ПЛАТФОРМЫ
// -----------------------------------------------------------------------------

export function exportDocumentAsPdf(
  doc: DocumentItem,
  opts?: {
    products?: Product[];
    concepts?: ProductConcept[];
    financialPlans?: FinancialPlanRow[];
  }
): void {
  const brandLabel =
    doc.brandId === 'ALL'
      ? 'BORNERS GROUP'
      : formatLabBrandLabel(doc.brandId);

  const linkedConcept = opts?.concepts?.find((c) => c.id === doc.conceptId);
  const linkedProduct = opts?.products?.find((p) => p.id === doc.productId);

  // 1. Техническое задание для фабрики (Кит/Англ/Рус)
  if (doc.id === 'doc-1' || doc.category === 'производство' || linkedConcept) {
    const c = linkedConcept;
    downloadEditorialPdfDocument({
      fileName: doc.fileName.replace(/\.[^/.]+$/, '') + '.pdf',
      docCode: c?.code || 'BRN-BL-2027',
      categoryLabel: 'Производственное ТЗ (RU / EN / ZH)',
      brandLabel,
      title: doc.title,
      subtitle:
        'Трёхъязычная производственная спецификация для швейной фабрики: материалы, конструкция, табель мер и размерная сетка заказа',
      metaGrid: [
        { label: 'Артикул / Код', value: c?.code || linkedProduct?.sku || 'BRN-BL-2027' },
        { label: 'Фабрика-исполнитель', value: c?.supplierName || 'Guangdong Apex Intimate' },
        { label: 'Стандарт качества', value: 'AQL 1.5 · Стирка 40°C' },
        { label: 'Автор и дата', value: `${doc.uploadedBy} · ${doc.uploadedAt}` },
      ],
      sections: [
        {
          badge: 'RU · РУССКИЙ',
          title: 'Спецификация модели и требования к пошиву',
          subtitle: 'Раздел 01',
          rows: [
            {
              label: 'Наименование модели',
              value: c?.techPack?.ru?.modelName || 'Боксеры BORNERS BIG LOVE (Лимитированная капсула)',
            },
            {
              label: 'Основное полотно и плотность',
              value: c?.techPack?.ru?.compositionAndDensity || '92% Австрийский микромодал Lenzing, 8% Эластан · 190 г/м²',
              highlight: true,
            },
            {
              label: 'Конструкция и лекало',
              value: c?.techPack?.ru?.construction || 'Анатомический 3D-гульфик без среднего заднего шва',
            },
            {
              label: 'Поясная резинка и швы',
              value: c?.techPack?.ru?.waistbandSpec || 'Мягкая жаккардовая резинка 38 мм с изнанкой микрофибра · Плоские швы 4 иглы / 6 нитей',
            },
          ],
        },
        {
          badge: 'EN / ZH · INTERNATIONAL FACTORY SPEC',
          title: 'Production Specification (English & 中文对照)',
          subtitle: 'Section 02',
          rows: [
            {
              label: 'Style & Construction (EN)',
              value: c?.techPack?.en?.construction || '3D Anatomical Pouch Boxer Brief, Seamless Back Panel, Flatlock 4-Needle 6-Thread',
            },
            {
              label: '款式与工艺结构 (ZH 中文)',
              value: c?.techPack?.zh?.construction || '3D立体囊袋平角内裤，后档无中缝设计，四针六线无骨平缝工艺',
            },
            {
              label: 'Fabric & GSM (EN)',
              value: c?.techPack?.en?.compositionAndDensity || '92% Lenzing MicroModal + 8% Elastane, 190 GSM, Pre-shrunk ≤ 2.5%',
            },
            {
              label: '面料成分与克重 (ZH 中文)',
              value: c?.techPack?.zh?.compositionAndDensity || '92% 兰精超细莫代尔 + 8% 氨纶，克重 190g/m²，水洗缩水率 ≤ 2.5%',
              highlight: true,
            },
          ],
        },
        {
          badge: 'SIZE MATRIX',
          title: 'Размерная сетка и распределение тиража партии (S – 4XL)',
          subtitle: 'Комплектация: 3 шт. в наборе',
          table: {
            headers: ['Размер (Size / 尺码)', 'Обхват талии (см)', 'Наборов (Packs / 盒)', 'Штук белья (Pcs / 件)', 'Статус лекала'],
            rows: [
              ['S (44–46)', '74–79 см', '150 наб.', '450 шт.', 'Эталон утверждён'],
              ['M (46–48)', '80–85 см', '450 наб.', '1 350 шт.', 'Эталон утверждён'],
              ['L (48–50)', '86–91 см', '750 наб.', '2 250 шт.', 'Эталон утверждён'],
              ['XL (50–52)', '92–97 см', '600 наб.', '1 800 шт.', 'Эталон утверждён'],
              ['2XL (52–54)', '98–104 см', '450 наб.', '1 350 шт.', 'Эталон утверждён'],
              ['3XL (54–56)', '105–111 см', '300 наб.', '900 шт.', 'Эталон утверждён'],
              ['4XL (56–58)', '112–118 см', '300 наб.', '900 шт.', 'Эталон утверждён'],
            ],
            footer: ['ИТОГО ПАРТИЯ (TOTAL)', 'S – 4XL', '3 000 наборов', '9 000 штук белья', 'AQL 1.5 PASS'],
          },
          note: 'Упаковка: индивидуальный матовый тубус / зип-пакет 180 мкм с маркировкой Честный ЗНАК (DataMatrix) и EAN-13.',
        },
      ],
      footerRight: `УТВЕРЖДЕНО · ${doc.uploadedAt} · v2.4`,
    });
    return;
  }

  // 2. Спецификация выкрасов Pantone — НА ТЕЛЕ «Оттенки кожи»
  if (doc.id === 'doc-2') {
    downloadEditorialPdfDocument({
      fileName: doc.fileName.replace(/\.[^/.]+$/, '') + '.pdf',
      docCode: 'NTL-SKIN-2027',
      categoryLabel: 'Дизайн и палитра Pantone',
      brandLabel: 'НА ТЕЛЕ',
      title: doc.title,
      subtitle:
        'Спецификация 6 телесных оттенков микрофибры Sensitive® Free-Cut и допусков спектрофотометрии Delta-E ≤ 0.8',
      metaGrid: [
        { label: 'Коллекция', value: 'Оттенки кожи (Вторая кожа)' },
        { label: 'Полотно', value: 'Микрофибра Free-Cut 155 г/м²' },
        { label: 'Обработка края', value: 'Лазерный срез + термосклейка' },
        { label: 'Автор и дата', value: `${doc.uploadedBy} · ${doc.uploadedAt}` },
      ],
      sections: [
        {
          badge: 'PALETTE · 06 SHADES',
          title: 'Утверждённая палитра оттенков кожи НА ТЕЛЕ',
          subtitle: 'Контроль при освещении D65',
          swatches: [
            { name: 'Тон 01 · Фарфор', code: 'PANTONE 12-0704', hex: '#F3E5DC', note: 'Светлый тёплый' },
            { name: 'Тон 02 · Миндаль', code: 'PANTONE 14-1118', hex: '#E3C6B4', note: 'Нейтральный беж' },
            { name: 'Тон 03 · Янтарь', code: 'PANTONE 16-1328', hex: '#CCA187', note: 'Тёплый золотистый' },
            { name: 'Тон 04 · Карамель', code: 'PANTONE 17-1336', hex: '#B38268', note: 'Средний загар' },
            { name: 'Тон 05 · Какао', code: 'PANTONE 18-1230', hex: '#8C624C', note: 'Глубокий тёплый' },
            { name: 'Тон 06 · Эспрессо', code: 'PANTONE 19-1118', hex: '#593D30', note: 'Тёмный шоколад' },
          ],
        },
        {
          badge: 'FREE-CUT TECH',
          title: 'Технологические параметры бесшовного кроя и упаковки',
          rows: [
            {
              label: 'Лазерная резка краёв (Free-Cut)',
              value: 'Полное отсутствие подгибки и ниточных швов по контуру бедра и талии — 0% рельефа под одеждой',
              highlight: true,
            },
            {
              label: 'Клеевая сборка боковых швов',
              value: 'Ультразвуковая плоская термосклейка эластичной лентой 6 мм (выдерживает 60+ циклов стирки)',
            },
            {
              label: 'Гигиеническая ластовица',
              value: '100% органический гребенной хлопок в тон основного полотна (вклеенный контур)',
            },
            {
              label: 'Тактильная упаковка',
              value: 'Матовый пенал софт-тач + папиросная бумага с пломбой-стикером номера тона (01–06)',
            },
          ],
        },
      ],
      footerRight: `ПАЛИТРА УТВЕРЖДЕНА · ${doc.uploadedAt}`,
    });
    return;
  }

  // 3. Финансовая модель или аналитика
  if (doc.id === 'doc-3' || doc.category === 'финансы') {
    downloadEditorialPdfDocument({
      fileName: doc.fileName.replace(/\.[^/.]+$/, '') + '.pdf',
      docCode: 'FIN-MODEL-2027',
      categoryLabel: 'Финансовая модель и P&L',
      brandLabel: 'BORNERS GROUP',
      title: doc.title,
      subtitle:
        'Сводный управленческий план выручки, валовой маржи, юнит-экономики SKU и сценариев развития холдинга на 2027 год',
      metaGrid: [
        { label: 'Годовой план выручки', value: '142,8 млн ₽ (Базовый)' },
        { label: 'Целевая валовая маржа', value: '52% BORNERS / 56% НА ТЕЛЕ' },
        { label: 'Формула выручки', value: 'Выкупы (шт.) × Ср. чек (₽)' },
        { label: 'Финансовый контролёр', value: `${doc.uploadedBy} · ${doc.uploadedAt}` },
      ],
      sections: [
        {
          badge: 'SCENARIOS 2027',
          title: 'Сравнение 3 финансовых сценариев холдинга BORNERS GROUP',
          table: {
            headers: ['Сценарий', 'Объём выкупов (год)', 'Средний чек', 'Годовая выручка', 'Опер. прибыль (EBITDA)'],
            rows: [
              ['Консервативный', '54 200 шт.', '2 050 ₽', '111 110 000 ₽', '28 400 000 ₽ (25,5%)'],
              ['Базовый (Основной)', '64 800 шт.', '2 203 ₽', '142 800 000 ₽', '41 900 000 ₽ (29,3%)'],
              ['Оптимистичный', '78 500 шт.', '2 340 ₽', '183 690 000 ₽', '58 700 000 ₽ (31,9%)'],
            ],
          },
        },
        {
          badge: 'UNIT ECONOMICS',
          title: 'Эталонная юнит-экономика флагманских артикулов (на 1 ед.)',
          table: {
            headers: ['Артикул и модель', 'Бренд', 'РРЦ (со скидкой)', 'Себестоимость (COGS)', 'Чистая прибыль / Маржа'],
            rows: [
              ['BRN-MOD-01 · Боксеры Modal Core', 'BORNERS', '1 790 ₽', '360 ₽', '+584 ₽ (32,6%)'],
              ['BRN-BL-2027 · Капсула BIG LOVE', 'BORNERS', '2 490 ₽', '460 ₽', '+892 ₽ (35,8%)'],
              ['NTL-SKN-01 · Бралетт Оттенки кожи', 'НА ТЕЛЕ', '2 890 ₽', '510 ₽', '+1 065 ₽ (36,8%)'],
              ['NTL-BS-02 · Слипы Невидимый край', 'НА ТЕЛЕ', '1 690 ₽', '290 ₽', '+590 ₽ (34,9%)'],
            ],
          },
        },
      ],
      footerRight: `КОНФИДЕНЦИАЛЬНО · ${doc.uploadedAt}`,
    });
    return;
  }

  // 4. Универсальный красивый PDF (Стратегия / Поставщики / Прочие документы)
  downloadEditorialPdfDocument({
    fileName: doc.fileName.replace(/\.[^/.]+$/, '') + '.pdf',
    docCode: doc.id.toUpperCase(),
    categoryLabel: doc.category.toUpperCase(),
    brandLabel,
    title: doc.title,
    subtitle:
      'Официальный регламент и спецификация рабочей системы управления продуктом и стратегией BORNERS GROUP (2026–2027)',
    metaGrid: [
      { label: 'Категория', value: doc.category },
      { label: 'Контур бренда', value: brandLabel },
      { label: 'Ответственный автор', value: doc.uploadedBy },
      { label: 'Дата публикации', value: doc.uploadedAt },
    ],
    sections: [
      {
        badge: 'EXECUTIVE SUMMARY',
        title: 'Ключевые положения документа и архитектура портфеля',
        rows: [
          {
            label: 'BORNERS (Мужской и унисекс базовый слой)',
            value: 'Инженерная посадка, плотный микромодал 190 г/м² и пима-хлопок, ресурс 80+ стирок, целевая маржа 52%',
            highlight: true,
          },
          {
            label: 'НА ТЕЛЕ (Женская «вторая кожа»)',
            value: 'Бесшовная лазерная обработка края Free-Cut, 6 телесных оттенков Pantone, целевая маржа 56%',
          },
          {
            label: 'Новые бренды в разработке (2026–2027)',
            value: 'Акуша и Liskani — формирование позиционирования, ДНК и ассортиментной матрицы',
          },
          {
            label: 'Формула продуктовой матрицы 70 / 30',
            value: '70% — регулярная высокомаржинальная база круглогодичного спроса / 30% — сезонные и подарочные капсулы',
          },
        ],
      },
      {
        badge: 'R&D PIPELINE',
        title: 'Регламент 7 этапов отбора продукта в Лаборатории R&D',
        table: {
          headers: ['Этап R&D', 'Контрольный критерий перехода (Stage Gate)', 'Ответственный контур'],
          rows: [
            ['01 · Идея', 'Фотореференс, бренд, тип разработки и краткая суть идеи', 'Продакт-менеджер'],
            ['02 · Анализ', 'Минимум 1 конкурент с ценой/выручкой + расчёт экономики за 1 пару', 'Аналитик / Менеджер'],
            ['03 · Образец', 'Фабрика из справочника + состав ткани ровно 100% + фото образца', 'Технолог / R&D'],
            ['04 · Тест', 'Баллы 1–5 по 5 критериям + замеры ДО и ПОСЛЕ стирки', 'Контроль качества'],
            ['05 · Решение', 'Вердикт руководителя: Утвердить / Доработать / Отклонить', 'Владелец / Руководитель'],
            ['06 · Производство', 'Табель размеров S–4XL и трёхъязычный заказ RU / EN / ZH', 'Отдел закупок и ВЭД'],
            ['07 · Запуск', 'Ссылка на карточку WB/Ozon, дата старта и связь с Каталогом SKU', 'Маркетинг и коммерция'],
          ],
        },
      },
    ],
    footerRight: `BORNERS GROUP · ${doc.uploadedAt}`,
  });
}

export function exportDocumentAsExcel(
  doc: DocumentItem,
  opts?: {
    products?: Product[];
    concepts?: ProductConcept[];
    financialPlans?: FinancialPlanRow[];
  }
): void {
  const brandLabel =
    doc.brandId === 'ALL'
      ? 'BORNERS GROUP'
      : formatLabBrandLabel(doc.brandId);

  const linkedConcept = opts?.concepts?.find((c) => c.id === doc.conceptId);

  // Если это финансовая модель или категория "финансы" — строим многолистную финмодель
  if (doc.id === 'doc-3' || doc.category === 'финансы') {
    const plans = opts?.financialPlans || [];
    const products = opts?.products || [];

    const planRows: XlsxRow[] = [
      {
        height: 36,
        mergeAcross: 6,
        cells: [{ value: `BORNERS GROUP — ФИНАНСОВАЯ МОДЕЛЬ И P&L (2026–2027)`, style: 1 }],
      },
      {
        height: 24,
        mergeAcross: 6,
        cells: [
          {
            value: `Документ: ${doc.title}  |  Автор: ${doc.uploadedBy}  |  Дата: ${doc.uploadedAt}`,
            style: 2,
          },
        ],
      },
      { height: 14, cells: [] },
      {
        height: 28,
        cells: [
          { value: 'Период', style: 4 },
          { value: 'Бренд', style: 4 },
          { value: 'Сценарий', style: 4 },
          { value: 'План выкупов (шт.)', style: 4 },
          { value: 'Средний чек (₽)', style: 4 },
          { value: 'План выручки (₽)', style: 4 },
          { value: 'План опер. прибыли (₽)', style: 4 },
        ],
      },
    ];

    let sumUnits = 0;
    let sumRev = 0;
    let sumProfit = 0;

    const basePlans = plans.filter((p) => p.scenario === 'Base');
    const rowsToRender = basePlans.length > 0 ? basePlans : plans;

    rowsToRender.forEach((r, idx) => {
      const even = idx % 2 === 0;
      sumUnits += r.plannedBuyoutUnits;
      sumRev += r.plannedRevenueRub;
      sumProfit += r.plannedOperatingProfitRub;

      planRows.push({
        height: 22,
        cells: [
          { value: r.periodLabel, style: even ? 5 : 6 },
          { value: r.brandId === 'NA_TELE' ? 'НА ТЕЛЕ' : 'BORNERS', style: even ? 5 : 6 },
          { value: 'Базовый', style: even ? 5 : 6 },
          { value: r.plannedBuyoutUnits, type: 'number', style: even ? 7 : 8 },
          { value: r.avgSellingPriceRub, type: 'number', style: even ? 9 : 10 },
          { value: r.plannedRevenueRub, type: 'number', style: even ? 9 : 10 },
          { value: r.plannedOperatingProfitRub, type: 'number', style: even ? 9 : 10 },
        ],
      });
    });

    planRows.push({
      height: 28,
      cells: [
        { value: 'ИТОГО ГОДОВОЙ ПЛАН', style: 11 },
        { value: 'ВСЕ БРЕНДЫ', style: 11 },
        { value: 'Базовый сценарий', style: 11 },
        { value: sumUnits, type: 'number', style: 11 },
        { value: sumUnits > 0 ? Math.round(sumRev / sumUnits) : 2190, type: 'number', style: 12 },
        { value: sumRev, type: 'number', style: 12 },
        { value: sumProfit, type: 'number', style: 12 },
      ],
    });

    const skuRows: XlsxRow[] = [
      {
        height: 36,
        mergeAcross: 6,
        cells: [{ value: 'BORNERS GROUP — ЮНИТ-ЭКОНОМИКА КАТАЛОГА SKU (2027)', style: 1 }],
      },
      {
        height: 24,
        mergeAcross: 6,
        cells: [
          {
            value: 'Чистая выручка = РРЦ со скидкой − НДС − Резерв на возвраты  |  Прибыль = Чистая выручка − COGS − МП − Логистика − Реклама',
            style: 2,
          },
        ],
      },
      { height: 14, cells: [] },
      {
        height: 28,
        cells: [
          { value: 'Артикул (SKU)', style: 4 },
          { value: 'Наименование модели', style: 4 },
          { value: 'Бренд', style: 4 },
          { value: 'Коллекция', style: 4 },
          { value: 'РРЦ (₽)', style: 4 },
          { value: 'Себестоимость COGS (₽)', style: 4 },
          { value: 'Логистика и МП (₽)', style: 4 },
        ],
      },
    ];

    products.forEach((p, idx) => {
      const even = idx % 2 === 0;
      skuRows.push({
        height: 22,
        cells: [
          { value: p.sku, style: even ? 5 : 6 },
          { value: p.name, style: even ? 5 : 6 },
          { value: p.brandId === 'NA_TELE' ? 'НА ТЕЛЕ' : 'BORNERS', style: even ? 5 : 6 },
          { value: p.collection, style: even ? 5 : 6 },
          { value: p.economics.actualRetailPrice, type: 'number', style: even ? 9 : 10 },
          { value: p.economics.unitCostPrice, type: 'number', style: even ? 9 : 10 },
          {
            value: p.economics.marketplaceCommissionRub + p.economics.logisticsRub,
            type: 'number',
            style: even ? 9 : 10,
          },
        ],
      });
    });

    downloadXlsxWorkbook(doc.fileName, [
      {
        name: 'План-Факт P&L 2027',
        colWidths: [20, 16, 18, 22, 18, 24, 26],
        rows: planRows,
      },
      {
        name: 'Юнит-экономика SKU',
        colWidths: [18, 36, 16, 24, 16, 24, 22],
        rows: skuRows,
      },
    ]);
    return;
  }

  // Для производственного ТЗ / Заказа фабрике — строим красивую двухлистную Excel-спецификацию (Лист 1: ТЗ RU/EN/ZH, Лист 2: Табель размеров и заказ S–4XL)
  const c = linkedConcept;
  const specRows: XlsxRow[] = [
    {
      height: 36,
      mergeAcross: 3,
      cells: [{ value: `BORNERS GROUP — ТЕХНИЧЕСКОЕ ЗАДАНИЕ И СПЕЦИФИКАЦИЯ (RU / EN / ZH)`, style: 1 }],
    },
    {
      height: 24,
      mergeAcross: 3,
      cells: [
        {
          value: `${doc.title}  |  Бренд: ${brandLabel}  |  Дата: ${doc.uploadedAt}  |  Автор: ${doc.uploadedBy}`,
          style: 2,
        },
      ],
    },
    { height: 14, cells: [] },
    {
      height: 28,
      cells: [
        { value: 'Параметр спецификации', style: 4 },
        { value: 'Русский (RU)', style: 4 },
        { value: 'English (EN)', style: 4 },
        { value: '中文 (ZH — Для фабрики)', style: 4 },
      ],
    },
    {
      height: 26,
      cells: [
        { value: 'Наименование и код модели', style: 5 },
        { value: c?.techPack?.ru?.modelName || 'Боксеры BORNERS BIG LOVE (BRN-BL-2027)', style: 5 },
        { value: c?.techPack?.en?.modelName || 'BORNERS BIG LOVE Boxer Brief (BRN-BL-2027)', style: 5 },
        { value: c?.techPack?.zh?.modelName || 'BORNERS BIG LOVE 男士莫代尔平角内裤 (BRN-BL-2027)', style: 5 },
      ],
    },
    {
      height: 28,
      cells: [
        { value: 'Конструкция и посадка', style: 6 },
        { value: c?.techPack?.ru?.construction || 'Анатомический 3D-гульфик без среднего заднего шва', style: 6 },
        { value: c?.techPack?.en?.construction || '3D Anatomical Pouch, Seamless Back Panel', style: 6 },
        { value: c?.techPack?.zh?.construction || '3D立体囊袋剪裁，后片无中缝防夹臀设计', style: 6 },
      ],
    },
    {
      height: 26,
      cells: [
        { value: 'Основной материал и состав', style: 5 },
        { value: c?.techPack?.ru?.compositionAndDensity || '92% микромодал Lenzing + 8% эластан, 190 г/м²', style: 5 },
        { value: c?.techPack?.en?.compositionAndDensity || '92% Lenzing MicroModal + 8% Elastane, 190 GSM', style: 5 },
        { value: c?.techPack?.zh?.compositionAndDensity || '92% 兰精超细莫代尔 + 8% 氨纶，克重 190g/m²', style: 5 },
      ],
    },
    {
      height: 26,
      cells: [
        { value: 'Поясная резинка', style: 6 },
        { value: c?.techPack?.ru?.waistbandSpec || 'Жаккардовая резинка 38 мм с микрофиброй на изнанке', style: 6 },
        { value: c?.techPack?.en?.waistbandSpec || '38mm Soft Brushed Jacquard Elastic Waistband', style: 6 },
        { value: c?.techPack?.zh?.waistbandSpec || '38mm 超柔磨毛提花松紧腰带，不起卷不勒腰', style: 6 },
      ],
    },
    {
      height: 26,
      cells: [
        { value: 'Швы и обработка', style: 5 },
        { value: c?.techPack?.ru?.seamsSpec || 'Плоские бельевые швы (4 иглы, 6 нитей)', style: 5 },
        { value: c?.techPack?.en?.seamsSpec || 'Flatlock 4-Needle 6-Thread Seamless Stitching', style: 5 },
        { value: c?.techPack?.zh?.seamsSpec || '四针六线无骨平缝工艺，每英寸14针', style: 5 },
      ],
    },
    {
      height: 26,
      cells: [
        { value: 'Цвета и Pantone', style: 6 },
        { value: c?.techPack?.ru?.colorAndPantone || 'Терракотовый + Тёмно-синий + Графит', style: 6 },
        { value: c?.techPack?.en?.colorAndPantone || 'Terracotta + Deep Navy + Graphite', style: 6 },
        { value: c?.techPack?.zh?.colorAndPantone || '赤陶色 + 深藏青 + 石墨灰 (色牢度 ≥ 4.5级)', style: 6 },
      ],
    },
    {
      height: 26,
      cells: [
        { value: 'Упаковка и маркировка', style: 5 },
        { value: c?.techPack?.ru?.packagingSpec || 'Матовый тубус / зип-пакет 180 мкм + Честный ЗНАК', style: 5 },
        { value: c?.techPack?.en?.packagingSpec || 'Matte Pouch 180um + EAN-13 & DataMatrix Barcode', style: 5 },
        { value: c?.techPack?.zh?.packagingSpec || '180微米磨砂拉链袋/礼盒 + EAN-13及俄罗斯诚实标签', style: 5 },
      ],
    },
    {
      height: 26,
      cells: [
        { value: 'Контроль качества (QC)', style: 6 },
        { value: c?.techPack?.ru?.qualityRequirements || 'AQL 1.5, усадка после стирки 40°C не более 2,5%', style: 6 },
        { value: c?.techPack?.en?.qualityRequirements || 'AQL 1.5 Inspection, Wash Shrinkage ≤ 2.5%', style: 6 },
        { value: c?.techPack?.zh?.qualityRequirements || 'AQL 1.5 验货标准，40°C水洗缩水率 ≤ 2.5%', style: 6 },
      ],
    },
  ];

  const sizeRows: XlsxRow[] = [
    {
      height: 36,
      mergeAcross: 5,
      cells: [{ value: `РАЗМЕРНАЯ МАТРИЦА И РАСЧЁТ ЗАКАЗА ПАРТИИ (S – 4XL)`, style: 1 }],
    },
    {
      height: 24,
      mergeAcross: 5,
      cells: [
        {
          value: `Комплектация: 3 шт. в наборе  |  Стандарт приёмки: AQL 1.5  |  Валюта расчёта: RUB (₽)`,
          style: 2,
        },
      ],
    },
    { height: 14, cells: [] },
    {
      height: 28,
      cells: [
        { value: 'Размер (Size)', style: 4 },
        { value: 'Российский размер', style: 4 },
        { value: 'Количество наборов (Packs)', style: 4 },
        { value: 'Штук белья (Pcs)', style: 4 },
        { value: 'Себестоимость 1 шт. (₽)', style: 4 },
        { value: 'Сумма по размеру (₽)', style: 4 },
      ],
    },
  ];

  const sizeSpec = [
    { sz: 'S', ru: '44–46', packs: 150, unitPrice: 360 },
    { sz: 'M', ru: '46–48', packs: 450, unitPrice: 360 },
    { sz: 'L', ru: '48–50', packs: 750, unitPrice: 360 },
    { sz: 'XL', ru: '50–52', packs: 600, unitPrice: 360 },
    { sz: '2XL', ru: '52–54', packs: 450, unitPrice: 375 },
    { sz: '3XL', ru: '54–56', packs: 300, unitPrice: 390 },
    { sz: '4XL', ru: '56–58', packs: 300, unitPrice: 390 },
  ];

  let totalPacks = 0;
  let totalPcs = 0;
  let totalRub = 0;

  sizeSpec.forEach((row, idx) => {
    const even = idx % 2 === 0;
    const pcs = row.packs * 3;
    const sum = pcs * row.unitPrice;
    totalPacks += row.packs;
    totalPcs += pcs;
    totalRub += sum;

    sizeRows.push({
      height: 22,
      cells: [
        { value: row.sz, style: even ? 5 : 6 },
        { value: row.ru, style: even ? 5 : 6 },
        { value: row.packs, type: 'number', style: even ? 7 : 8 },
        { value: pcs, type: 'number', style: even ? 7 : 8 },
        { value: row.unitPrice, type: 'number', style: even ? 9 : 10 },
        { value: sum, type: 'number', style: even ? 9 : 10 },
      ],
    });
  });

  sizeRows.push({
    height: 28,
    cells: [
      { value: 'ИТОГО ПО ЗАКАЗУ', style: 11 },
      { value: 'S – 4XL', style: 11 },
      { value: totalPacks, type: 'number', style: 11 },
      { value: totalPcs, type: 'number', style: 11 },
      { value: Math.round(totalRub / totalPcs), type: 'number', style: 12 },
      { value: totalRub, type: 'number', style: 12 },
    ],
  });

  downloadXlsxWorkbook(doc.fileName, [
    {
      name: 'ТЗ Спецификация RU-EN-ZH',
      colWidths: [28, 42, 42, 42],
      rows: specRows,
    },
    {
      name: 'Размерная сетка и Тираж',
      colWidths: [16, 20, 26, 22, 24, 26],
      rows: sizeRows,
    },
  ]);
}

export function exportConceptProductionPdf(
  concept: ProductConcept,
  orderInfo: {
    factoryName: string;
    approvedSampleVersion: string;
    materialAndColors: string;
    packColorComposition: string;
    unitsPerPack: number;
    packsBySize: Record<string, number>;
    unitPrice: number;
    currency: string;
    plannedReadyDate: string;
    paymentTerms: string;
    orderVersion: number;
  }
): void {
  const normBrand = normalizeLabBrandCode(concept.brandId);
  const brandLabel = formatLabBrandLabel(concept.brandId);
  const profile = getBrandProductionProfile(concept.brandId, concept.name);
  const factoryZh =
    normBrand === 'AKUSHA'
      ? '温州阿库莎童鞋制造厂 (温州)'
      : normBrand === 'LISKANI'
      ? '绍兴柯桥家纺窗帘定制工坊 (绍兴)'
      : normBrand === 'NA_TELE'
      ? '汕头无痕贴身内衣制造厂 (广东)'
      : '广东奥佩克内衣有限公司 (佛山)';
  const defaultTitleZh =
    normBrand === 'AKUSHA'
      ? `AKUSHA 儿童鞋履 · ${concept.name}`
      : normBrand === 'LISKANI'
      ? `LISKANI 家居窗帘套装 · ${concept.name}`
      : normBrand === 'NA_TELE'
      ? `НА ТЕЛЕ 无痕贴身内衣 · ${concept.name}`
      : `${brandLabel} 男士莫代尔内裤 · ${concept.name}`;
  const defaultBackCaption = `${profile.defaultDetailCaptionRu} (${orderInfo.approvedSampleVersion})`;

  const extraSizeKeys = Object.keys(orderInfo.packsBySize || {}).filter(
    (k) => !profile.sizes.includes(k) && (orderInfo.packsBySize[k] || 0) > 0
  );
  const sizes = [...profile.sizes, ...extraSizeKeys];
  const sizeRangeShort =
    sizes.length > 0 ? `${sizes[0]} – ${sizes[sizes.length - 1]}` : profile.sizeGridLabelRu;
  const packShortRu =
    normBrand === 'AKUSHA' ? 'пар' : normBrand === 'LISKANI' ? 'компл.' : 'наб.';
  const pcsShortRu =
    normBrand === 'AKUSHA' ? 'пар' : normBrand === 'LISKANI' ? 'полот.' : 'шт.';

  let totalPacks = 0;
  let totalPcs = 0;

  const sizeRows = sizes.map((sz) => {
    const packs = orderInfo.packsBySize[sz] || 0;
    const pcs = packs * orderInfo.unitsPerPack;
    totalPacks += packs;
    totalPcs += pcs;
    const sum = pcs * (orderInfo.unitPrice || 0);
    return [
      sz,
      `${packs.toLocaleString('ru-RU')} ${packShortRu}`,
      `${pcs.toLocaleString('ru-RU')} ${pcsShortRu}`,
      `${orderInfo.unitPrice} ${orderInfo.currency}`,
      `${sum.toLocaleString('ru-RU')} ${orderInfo.currency}`,
    ];
  });

  const totalSum = totalPcs * (orderInfo.unitPrice || 0);
  const frontPhoto = concept.imageUrl;
  const backPhoto =
    concept.galleryPhotos?.[1]?.url ||
    concept.samples?.[0]?.photos?.[0] ||
    concept.imageUrl;

  const resolvedTitleZh = cleanTechPackText(concept.techPack?.zh?.modelName, defaultTitleZh);
  const resolvedConstructionZh = cleanTechPackText(
    concept.techPack?.zh?.construction,
    profile.defaultConstructionZh
  );
  const resolvedConstructionRu = cleanTechPackText(
    concept.techPack?.ru?.construction,
    profile.defaultConstructionRu
  );
  const resolvedCompZh = cleanTechPackText(
    concept.techPack?.zh?.compositionAndDensity,
    profile.defaultMaterialZh
  );
  const resolvedCompRu = cleanTechPackText(
    orderInfo.materialAndColors || concept.techPack?.ru?.compositionAndDensity,
    profile.defaultMaterialRu
  );

  downloadEditorialPdfDocument({
    fileName: `ТЗ_Заказ_Фабрика_${concept.code}_v${orderInfo.orderVersion}.pdf`,
    docCode: `${concept.code} · v${orderInfo.orderVersion}`,
    categoryLabel: '生产工艺及采购单 (PRODUCTION ORDER)',
    brandLabel,
    titleZh: `生产工艺单及大货采购订单：${resolvedTitleZh} (${concept.code})`,
    title: `Спецификация и заказ на производство: ${concept.name} (${concept.code})`,
    subtitleZh: `承接生产工厂：${factoryZh} · 交货期：${orderInfo.plannedReadyDate}`,
    subtitle: `Фабрика: ${orderInfo.factoryName} · Срок готовности партии: ${orderInfo.plannedReadyDate}`,
    metaGrid: [
      { label: '款号 · Код модели', value: concept.code, subValueRu: `Артикул ${concept.code}` },
      { label: '生产工厂 · Фабрика', value: factoryZh, subValueRu: orderInfo.factoryName },
      { label: '交货日期 · Готовность', value: orderInfo.plannedReadyDate, subValueRu: 'Срок сдачи партии' },
      { label: '结算货币 · Валюта', value: `${orderInfo.currency} · 30%定金/70%尾款`, subValueRu: orderInfo.paymentTerms },
    ],
    frontPhotoUrl: frontPhoto,
    backPhotoUrl: backPhoto,
    frontPhotoCaption: `${concept.name} (${concept.code}) — лицевая фотография товара`,
    backPhotoCaption: defaultBackCaption,
    sections: [
      {
        badge: '01 · 工艺标准',
        titleZh: '一、产品工艺规格与面辅料标准',
        title: 'Спецификация изделия, материалы и стандарты пошива (перевод на русский)',
        subtitle: `Утверждено · ${orderInfo.approvedSampleVersion}`,
        bilingualSpecs: [
          {
            labelZh: '款式名称与版型',
            labelRu: 'Модель и конструкция',
            zhLarge: resolvedConstructionZh,
            ruSmall: `${concept.name} · ${resolvedConstructionRu}`,
            highlight: true,
          },
          {
            labelZh: '面料成分与克重',
            labelRu: 'Состав материала и плотность',
            zhLarge: resolvedCompZh,
            ruSmall: resolvedCompRu,
            highlight: true,
          },
          {
            labelZh: '礼盒颜色配比',
            labelRu: 'Комплектация и палитра',
            zhLarge: `每组 ${orderInfo.unitsPerPack} 件装 · 颜色按确认色卡配比`,
            ruSmall: `${orderInfo.unitsPerPack} ед. в упаковке: ${orderInfo.packColorComposition}`,
          },
          {
            labelZh: '品控标准与检验',
            labelRu: 'Контроль качества и маркировка',
            zhLarge: '执行 AQL 1.5 验货标准 · 每件粘贴俄罗斯诚实标签 (DataMatrix)',
            ruSmall: 'Приёмка AQL 1.5 перед отгрузкой · Маркировка Честный ЗНАК (DataMatrix) и EAN-13',
          },
        ],
      },
      {
        badge: '02 · 尺码明细',
        titleZh: `二、大货尺码配比及订单金额明细 (${profile.sizeGridLabelZh})`,
        title: `${profile.sizeGridLabelRu} (${sizeRangeShort}) и расчёт стоимости партии`,
        subtitle: `每组 ${orderInfo.unitsPerPack} 件 (В 1 упаковке: ${orderInfo.unitsPerPack} ед.)`,
        table: {
          headers: [
            '尺码 (Размер)',
            `包装数 (${profile.packUnitLabelRu})`,
            `总数量 (${profile.itemsUnitLabelRu})`,
            `单价 (Цена 1 ед. ${orderInfo.currency})`,
            `合计金额 (Сумма ${orderInfo.currency})`,
          ],
          rows: sizeRows,
          footer: [
            '合计总订单 (ИТОГО)',
            `${totalPacks.toLocaleString('ru-RU')} ${packShortRu}`,
            `${totalPcs.toLocaleString('ru-RU')} ${pcsShortRu}`,
            `${orderInfo.unitPrice} ${orderInfo.currency}`,
            `${totalSum.toLocaleString('ru-RU')} ${orderInfo.currency}`,
          ],
        },
        noteZh: '验货标准：出货前执行 AQL 1.5 抽检 · 包装粘贴 EAN-13 及俄罗斯诚实标签 (DataMatrix)',
        note: 'Контроль качества AQL 1.5 перед отгрузкой. Маркировка Честный ЗНАК и EAN-13 на каждой индивидуальной упаковке.',
      },
    ],
    footerRight: `ORDER v${orderInfo.orderVersion} · ${brandLabel}`,
  });
}

export function exportConceptProductionExcel(
  concept: ProductConcept,
  orderInfo: {
    factoryName: string;
    approvedSampleVersion: string;
    materialAndColors: string;
    packColorComposition: string;
    unitsPerPack: number;
    packsBySize: Record<string, number>;
    unitPrice: number;
    currency: string;
    plannedReadyDate: string;
    paymentTerms: string;
    orderVersion: number;
  }
): void {
  const brandLabel = formatLabBrandLabel(concept.brandId);
  const profile = getBrandProductionProfile(concept.brandId, concept.name);
  const extraSizeKeys = Object.keys(orderInfo.packsBySize || {}).filter(
    (k) => !profile.sizes.includes(k) && (orderInfo.packsBySize[k] || 0) > 0
  );
  const sizes = [...profile.sizes, ...extraSizeKeys];
  let totalPacks = 0;
  let totalPcs = 0;
  let totalSum = 0;

  const rows: XlsxRow[] = [
    {
      height: 36,
      mergeAcross: 4,
      cells: [
        {
          value: `BORNERS GROUP — ЗАКАЗ НА ПРОИЗВОДСТВО ${concept.code} (v${orderInfo.orderVersion})`,
          style: 1,
        },
      ],
    },
    {
      height: 24,
      mergeAcross: 4,
      cells: [
        {
          value: `Модель: ${concept.name} (${brandLabel})  |  Фабрика: ${orderInfo.factoryName}  |  Готовность: ${orderInfo.plannedReadyDate}`,
          style: 2,
        },
      ],
    },
    { height: 14, cells: [] },
    {
      height: 28,
      cells: [
        { value: `Размер (${profile.sizeGridLabelEn})`, style: 4 },
        { value: `${profile.packUnitLabelRu} (Packs / 盒)`, style: 4 },
        { value: `${profile.itemsUnitLabelRu} (× ${orderInfo.unitsPerPack})`, style: 4 },
        { value: `Цена за 1 ед. (${orderInfo.currency})`, style: 4 },
        { value: `Сумма (${orderInfo.currency})`, style: 4 },
      ],
    },
  ];

  sizes.forEach((sz, idx) => {
    const even = idx % 2 === 0;
    const packs = orderInfo.packsBySize[sz] || 0;
    const pcs = packs * orderInfo.unitsPerPack;
    const sum = pcs * (orderInfo.unitPrice || 0);
    totalPacks += packs;
    totalPcs += pcs;
    totalSum += sum;

    rows.push({
      height: 22,
      cells: [
        { value: sz, style: even ? 5 : 6 },
        { value: packs, type: 'number', style: even ? 7 : 8 },
        { value: pcs, type: 'number', style: even ? 7 : 8 },
        { value: orderInfo.unitPrice || 0, type: 'number', style: even ? 9 : 10 },
        { value: sum, type: 'number', style: even ? 9 : 10 },
      ],
    });
  });

  rows.push({
    height: 28,
    cells: [
      { value: 'ИТОГО ПО ЗАКАЗУ', style: 11 },
      { value: totalPacks, type: 'number', style: 11 },
      { value: totalPcs, type: 'number', style: 11 },
      { value: orderInfo.unitPrice || 0, type: 'number', style: 12 },
      { value: totalSum, type: 'number', style: 12 },
    ],
  });

  downloadXlsxWorkbook(`Заказ_Фабрика_${concept.code}_v${orderInfo.orderVersion}.xlsx`, [
    {
      name: 'Размерная сетка заказа',
      colWidths: [22, 24, 26, 22, 26],
      rows,
    },
  ]);
}

