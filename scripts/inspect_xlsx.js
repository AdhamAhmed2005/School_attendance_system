import XLSX from 'xlsx';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const filePath = path.resolve(__dirname, '..', 'EL_StudentsNameReport (8).xlsx');
if (!fs.existsSync(filePath)) {
  console.error('File not found:', filePath);
  process.exit(2);
}

const wb = XLSX.readFile(filePath, { cellDates: true });
const sheetName = wb.SheetNames[0];
const sheet = wb.Sheets[sheetName];

// Try object parsing
let rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
if (!rows || rows.length === 0) rows = [];

// find matching header key
const normalize = (k) => (k === null || k === undefined ? '' : String(k).trim().replace(/\s+/g, '').toLowerCase());
const keys = Object.keys(rows[0] || {});
let foundKey = keys.find(k => /^(name|الاسم|اسم|اسمالطالبة|اسمالطالب)$/i.test(normalize(k)));
if (!foundKey) foundKey = keys.find(k => /(name|اسم)/i.test(k));

let extracted = [];
if (foundKey) {
  extracted = rows.map(r => String(r[foundKey] || '').trim()).filter(Boolean);
} else {
  // fallback: analyze columns with heuristics (similar to the app's logic)
  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  const rowCount = matrix.length;
  const colCount = matrix.reduce((m, r) => Math.max(m, (r || []).length), 0);

  // Print header and sample for each column to help identify correct column
  console.log('Column overview (header -> sample values):');
  for (let ci = 0; ci < colCount; ci++) {
    const header = (matrix[0] && matrix[0][ci]) ? String(matrix[0][ci]).trim() : '';
    const samples = [];
    for (let ri = 0; ri < Math.min(matrix.length, 30); ri++) {
      const cell = (matrix[ri] && matrix[ri][ci]) || '';
      const v = cell == null ? '' : String(cell).trim();
      if (v) samples.push(v);
      if (samples.length >= 6) break;
    }
    console.log(`  [${ci}] header: '${header}' -> samples: ${JSON.stringify(samples.slice(0,6))}`);
  }

  const nameCharRx = /[A-Za-z\u0600-\u06FF]/; // Latin or Arabic letters
  const badPhrasesRx = /(ISBN|McGraw|Hill|We can|page|class|الفصل|منهج|كتاب|مادة|عام بنات|قسم|subject)/i;

  const scoreColumn = (ci) => {
    let score = 0;
    let validRows = 0;
    for (let ri = 0; ri < rowCount; ri++) {
      const cell = (matrix[ri] && matrix[ri][ci]) || '';
      const v = cell == null ? '' : String(cell).trim();
      if (!v) continue;
      validRows += 1;
      if (nameCharRx.test(v)) score += 2;
      const words = v.split(/\s+/).filter(Boolean).length;
      if (words <= 4) score += 1;
      if (v.length <= 60) score += 1;
      if (/\d/.test(v)) score -= 2;
      if (badPhrasesRx.test(v)) score -= 3;
      const punctCount = (v.match(/[.,:;\-/()]/g) || []).length;
      if (punctCount > 2) score -= 1;
    }
    return validRows > 0 ? score / validRows : -Infinity;
  };

  let bestIdx = -1;
  let bestScore = -Infinity;
  for (let ci = 0; ci < colCount; ci++) {
    const s = scoreColumn(ci);
    if (s > bestScore) {
      bestScore = s;
      bestIdx = ci;
    }
  }

  if (bestIdx === -1 || bestScore === -Infinity) {
    extracted = [];
  } else {
    // Determine if first row is header-like (contains words like 'اسم' or 'name' or 'قسم')
    const firstRow = matrix[0] || [];
    const headerLikeRx = /(name|الاسم|اسم|قسم|subject|title)/i;
    const firstCell = firstRow[bestIdx] || firstRow[0] || '';
    const startIndex = headerLikeRx.test(String(firstCell)) ? 1 : 0;

    const vals = [];
    for (let ri = startIndex; ri < matrix.length; ri++) {
      const cell = (matrix[ri] && matrix[ri][bestIdx]) || '';
      const v = cell == null ? '' : String(cell).trim();
      if (v) vals.push(v);
    }
    extracted = vals.filter(Boolean);
    console.warn('Chosen column:', bestIdx, 'score:', bestScore, 'startIndex:', startIndex);
  }
}

console.log('Detected key:', foundKey);
console.log('Sample names:', extracted.slice(0, 30));
console.log('Total names:', extracted.length);
