import * as XLSX from 'xlsx';

function escapeCsv(value) {
  const text = String(value ?? '');
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function downloadUserCsv(fileName, rows) {
  const csv = rows.map((row) => row.map(escapeCsv).join(',')).join('\r\n');
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(link.href);
}

export function downloadImportTemplate(format = 'csv') {
  const rows = [
    ['email', 'password'],
    ['alice@example.com', 'Password123'],
  ];
  if (format === 'xlsx') {
    const worksheet = XLSX.utils.aoa_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Users');
    XLSX.writeFile(workbook, 'cloud-mail-user-import-template.xlsx');
    return;
  }
  downloadUserCsv('cloud-mail-user-import-template.csv', rows);
}

function normalizeHeader(value) {
  return String(value || '').trim().toLowerCase();
}

export async function parseUserImportFile(file) {
  const isCsv = file.name.toLowerCase().endsWith('.csv') || file.type === 'text/csv';
  let table;
  if (isCsv) {
    table = XLSX.utils.sheet_to_json(XLSX.read(await file.arrayBuffer(), { type: 'array' }).Sheets.Sheet1, { header: 1, defval: '' });
  } else {
    const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    table = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: '' });
  }
  if (!table.length) return [];
  const headers = table[0].map(normalizeHeader);
  const emailIndex = headers.indexOf('email');
  const passwordIndex = headers.indexOf('password');
  if (emailIndex < 0) {
    throw new Error('Import file must include an email column.');
  }
  return table.slice(1).map((row) => ({
    email: String(row[emailIndex] || '').trim(),
    password: passwordIndex >= 0 ? String(row[passwordIndex] || '') : '',
  })).filter((row) => row.email || row.password);
}
