const A4 = Object.freeze({ width: 595.28, height: 841.89 });
const MARGIN = 42;
const BODY_TOP = 704;
const BODY_BOTTOM = 58;
const TABLE_COLUMNS = Object.freeze({ item: 78, value: 76 });

function requiredText(value, label) {
  const text = String(value ?? '').trim();
  if (!text) throw new Error(`${label} is missing from the approved Millum export snapshot.`);
  return text;
}

export function millumExportFilename(exportData) {
  const date = /^\d{4}-\d{2}-\d{2}$/u.test(String(exportData?.countDate || ''))
    ? exportData.countDate
    : 'approved-count';
  return `mesh-stock-count-${date}-millum.pdf`;
}

export function validateMillumExportData(exportData) {
  if (!exportData || typeof exportData !== 'object') throw new Error('The Millum export snapshot is unavailable.');
  if (exportData.ready !== true || (exportData.diagnostics || []).length > 0) {
    throw new Error('Resolve every Millum export diagnostic before generating the clean PDF.');
  }
  requiredText(exportData.organizationName, 'Organization name');
  requiredText(exportData.countDate, 'Count date');
  requiredText(exportData.approvedAt, 'Approval timestamp');
  requiredText(exportData.sessionShortRef, 'Session reference');
  if (!Number.isInteger(Number(exportData.profileVersion)) || Number(exportData.profileVersion) < 1) {
    throw new Error('The Millum export profile version is invalid.');
  }
  if (!Array.isArray(exportData.groups) || exportData.groups.length !== 7) {
    throw new Error('The Millum export snapshot must contain all seven ordered groups.');
  }
  const rows = exportData.groups.flatMap((group) => group.rows || []);
  if (rows.length !== 89) throw new Error('The published Millum export profile must contain 89 enabled rows.');
  for (const row of rows) {
    requiredText(row.itemNumber, 'Millum item number');
    requiredText(row.productName, 'Millum product name');
    if (row.state !== 'ready' || row.finalValue === null || row.finalValue === undefined || row.finalValue === '') {
      throw new Error(`Millum item ${row.itemNumber} has no final entry value.`);
    }
    if (!/^(?:0|\d+(?:,\d+)?)$/u.test(String(row.finalValue))) {
      throw new Error(`Millum item ${row.itemNumber} has an invalid final entry value.`);
    }
  }
  return exportData;
}

function wrapText(text, font, size, width) {
  const words = String(text).split(/\s+/u).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (!line || font.widthOfTextAtSize(candidate, size) <= width) {
      line = candidate;
      continue;
    }
    lines.push(line);
    line = word;
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

function pdfTimestamp(exportData) {
  const date = new Date(exportData.approvedAt);
  return Number.isNaN(date.getTime()) ? new Date(`${exportData.countDate}T00:00:00Z`) : date;
}

function sourceSummary(exportData) {
  const sources = Array.isArray(exportData?.sourceSessions) ? exportData.sourceSessions : [];
  if (!sources.length) return `Source count ${exportData.sessionShortRef}`;
  return `${sources.length === 1 ? 'Source count' : 'Source counts'} ${sources.map((source) => `${source.countDate} ${source.sessionShortRef}`).join(' + ')}`;
}

export async function createMillumExportPdf(exportData) {
  validateMillumExportData(exportData);
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const fixedDate = pdfTimestamp(exportData);
  pdf.setTitle(`Millum Stock Count ${exportData.countDate}`);
  pdf.setAuthor(exportData.organizationName);
  pdf.setSubject('Approved Stock Count values for manual entry in Millum');
  pdf.setCreator('Mesh Shift Log');
  pdf.setProducer('Mesh Shift Log');
  pdf.setCreationDate(fixedDate);
  pdf.setModificationDate(fixedDate);

  const pages = [];
  const pagePlans = [];
  let current;
  const contentWidth = A4.width - MARGIN * 2;
  const productWidth = contentWidth - TABLE_COLUMNS.item - TABLE_COLUMNS.value - 16;

  const addPage = () => {
    const page = pdf.addPage([A4.width, A4.height]);
    pages.push(page);
    const plan = { tableHeader: true, rowCount: 0, groupNames: [] };
    pagePlans.push(plan);
    page.drawText(exportData.organizationName, { x: MARGIN, y: 795, size: 15, font: bold, color: rgb(0.08, 0.12, 0.18) });
    page.drawText('Millum Stock Count', { x: MARGIN, y: 774, size: 11, font: bold, color: rgb(0.15, 0.2, 0.28) });
    page.drawText(`Count date ${exportData.countDate}  |  Approved ${new Date(exportData.approvedAt).toLocaleString('nb-NO', { timeZone: 'Europe/Oslo' })}`, { x: MARGIN, y: 757, size: 8.5, font: regular, color: rgb(0.28, 0.32, 0.38) });
    page.drawText(`Session ${exportData.sessionShortRef}  |  Export profile v${exportData.profileVersion}`, { x: MARGIN, y: 743, size: 8.5, font: regular, color: rgb(0.28, 0.32, 0.38) });
    page.drawText(sourceSummary(exportData), { x: MARGIN, y: 730, size: 8, font: regular, color: rgb(0.28, 0.32, 0.38) });
    page.drawRectangle({ x: MARGIN, y: BODY_TOP + 1, width: contentWidth, height: 22, color: rgb(0.9, 0.92, 0.95) });
    page.drawText('Item', { x: MARGIN + 5, y: BODY_TOP + 8, size: 8.5, font: bold });
    page.drawText('Product', { x: MARGIN + TABLE_COLUMNS.item + 5, y: BODY_TOP + 8, size: 8.5, font: bold });
    page.drawText('Counted break bulk', { x: A4.width - MARGIN - TABLE_COLUMNS.value + 3, y: BODY_TOP + 8, size: 7.2, font: bold });
    current = { page, plan, y: BODY_TOP - 5, rowIndex: 0 };
  };

  const ensureSpace = (height) => {
    if (!current || current.y - height < BODY_BOTTOM) addPage();
  };

  addPage();
  for (const group of exportData.groups) {
    const firstRow = group.rows[0];
    const firstLines = wrapText(firstRow.productName, regular, 9, productWidth);
    const firstHeight = Math.max(24, firstLines.length * 11 + 9);
    ensureSpace(25 + firstHeight);
    current.plan.groupNames.push(group.name);
    current.page.drawRectangle({ x: MARGIN, y: current.y - 18, width: contentWidth, height: 20, color: rgb(0.2, 0.25, 0.33) });
    current.page.drawText(group.name, { x: MARGIN + 5, y: current.y - 12, size: 9, font: bold, color: rgb(1, 1, 1) });
    current.y -= 23;
    for (const row of group.rows) {
      const lines = wrapText(row.productName, regular, 9, productWidth);
      const rowHeight = Math.max(24, lines.length * 11 + 9);
      ensureSpace(rowHeight);
      if (current.rowIndex % 2 === 1) {
        current.page.drawRectangle({ x: MARGIN, y: current.y - rowHeight + 3, width: contentWidth, height: rowHeight, color: rgb(0.965, 0.97, 0.98) });
      }
      current.page.drawLine({ start: { x: MARGIN, y: current.y - rowHeight + 3 }, end: { x: A4.width - MARGIN, y: current.y - rowHeight + 3 }, thickness: 0.35, color: rgb(0.72, 0.75, 0.79) });
      current.page.drawText(String(row.itemNumber), { x: MARGIN + 5, y: current.y - 14, size: 8.5, font: regular });
      lines.forEach((line, index) => current.page.drawText(line, { x: MARGIN + TABLE_COLUMNS.item + 5, y: current.y - 14 - index * 11, size: 9, font: regular }));
      const value = String(row.finalValue);
      const valueWidth = bold.widthOfTextAtSize(value, 12);
      current.page.drawText(value, { x: A4.width - MARGIN - 7 - valueWidth, y: current.y - 16, size: 12, font: bold, color: rgb(0.05, 0.18, 0.32) });
      current.y -= rowHeight;
      current.rowIndex += 1;
      current.plan.rowCount += 1;
    }
  }

  pages.forEach((page, index) => {
    const label = `Page ${index + 1} of ${pages.length}`;
    const width = regular.widthOfTextAtSize(label, 8);
    page.drawText(label, { x: A4.width - MARGIN - width, y: 33, size: 8, font: regular, color: rgb(0.35, 0.38, 0.43) });
    page.drawText('Enter each final value in Millum: Counted break bulk', { x: MARGIN, y: 33, size: 8, font: regular, color: rgb(0.35, 0.38, 0.43) });
  });

  return { bytes: await pdf.save({ useObjectStreams: false, addDefaultPage: false }), pageCount: pages.length, layout: pagePlans };
}

export async function createMillumExportFile(exportData) {
  const { bytes, pageCount } = await createMillumExportPdf(exportData);
  const file = new File([bytes], millumExportFilename(exportData), { type: 'application/pdf', lastModified: pdfTimestamp(exportData).getTime() });
  return { file, bytes, pageCount };
}

export function downloadMillumExportFile(file, documentApi = globalThis.document, urlApi = globalThis.URL, schedule = globalThis.setTimeout) {
  if (!file || !documentApi?.createElement || !urlApi?.createObjectURL) throw new Error('PDF download is unavailable in this browser.');
  const href = urlApi.createObjectURL(file);
  const anchor = documentApi.createElement('a');
  anchor.href = href;
  anchor.download = file.name;
  anchor.rel = 'noopener';
  documentApi.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  schedule(() => urlApi.revokeObjectURL(href), 60_000);
  return file.name;
}

export function canShareMillumExportFile(file, navigatorApi = globalThis.navigator) {
  if (!file || typeof navigatorApi?.share !== 'function' || typeof navigatorApi?.canShare !== 'function') return false;
  try { return navigatorApi.canShare({ files: [file] }) === true; } catch { return false; }
}

export async function shareMillumExportFile(file, options = {}) {
  const navigatorApi = options.navigatorApi || globalThis.navigator;
  const download = options.download || ((target) => downloadMillumExportFile(target));
  if (!canShareMillumExportFile(file, navigatorApi)) {
    download(file);
    return { status: 'downloaded', message: 'PDF downloaded. Attach the downloaded file in your preferred manager message.' };
  }
  try {
    await navigatorApi.share({ title: 'Millum Stock Count', text: 'Approved Mesh Shift Log Stock Count for manual Millum entry.', files: [file] });
    return { status: 'shared', message: 'The PDF was handed to the device share menu.' };
  } catch (error) {
    if (error?.name === 'AbortError') return { status: 'cancelled', message: 'Sharing was cancelled. No data was changed.' };
    throw new Error(`The PDF could not be shared: ${error?.message || 'try download instead.'}`);
  }
}

export function createMillumExportActionGuard() {
  let pending = null;
  return {
    run(operation) {
      if (pending) return pending;
      pending = Promise.resolve().then(operation).finally(() => { pending = null; });
      return pending;
    },
    isPending() { return Boolean(pending); },
  };
}
