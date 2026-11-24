import * as XLSX from 'xlsx';

let inMemoryToken: string | null = null;

export function setSessionToken(token: string | null) {
  inMemoryToken = token;
}

export function getSessionToken(): string | null {
  return inMemoryToken;
}

export async function apiFetch<T = any>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (inMemoryToken) {
    headers.set('Authorization', `Bearer ${inMemoryToken}`);
  }
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(url, { ...options, headers });
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(res.ok ? 'Invalid JSON response' : text || 'Server error');
  }
  if (!res.ok) {
    throw new Error(json?.error || `Request failed (${res.status})`);
  }
  return json as T;
}

export function fmtInr(val: number | string | undefined | null): string {
  const n = Number(val) || 0;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

export function fmtNum(val: number | string | undefined | null, decimals = 2): string {
  const n = Number(val) || 0;
  return new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(n);
}

export function exportRowsToExcel(
  filename: string,
  sheets: Array<{ name: string; headers: string[]; rows: Array<Array<string | number | boolean>> }>
) {
  const wb = XLSX.utils.book_new();
  for (const s of sheets) {
    const aoa = [s.headers, ...s.rows];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = s.headers.map((h) => ({ wch: Math.max(14, Math.min(34, h.length + 6)) }));
    XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 31));
  }
  XLSX.writeFile(wb, filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`);
}

export function exportRowsToCsv(filename: string, headers: string[], rows: Array<Array<string | number | boolean>>) {
  const esc = (v: unknown) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [headers.map(esc).join(','), ...rows.map((r) => r.map(esc).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  downloadBlob(blob, filename.endsWith('.csv') ? filename : `${filename}.csv`);
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function parseSpreadsheetFile(file: File): Promise<Array<Record<string, any>>> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array', cellDates: true });
  const firstSheet = wb.SheetNames[0];
  if (!firstSheet) return [];
  const ws = wb.Sheets[firstSheet];
  const raw = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: '' });
  return raw.map((row) => {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(row)) {
      if (v instanceof Date) {
        out[k.trim()] = v.toISOString().slice(0, 10);
      } else {
        out[k.trim()] = typeof v === 'string' ? v.trim() : v;
      }
    }
    return out;
  });
}

export function numberToIndianWords(numInput: number): string {
  const num = Math.round(Number(numInput) || 0);
  if (num === 0) return 'Zero Rupees Only';
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const twoDigits = (n: number): string => {
    if (n < 20) return ones[n];
    return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '');
  };
  const threeDigits = (n: number): string => {
    if (n < 100) return twoDigits(n);
    return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' + twoDigits(n % 100) : '');
  };

  let rem = Math.abs(num);
  const crore = Math.floor(rem / 10000000);
  rem %= 10000000;
  const lakh = Math.floor(rem / 100000);
  rem %= 100000;
  const thousand = Math.floor(rem / 1000);
  rem %= 1000;

  const parts: string[] = [];
  if (crore) parts.push(`${twoDigits(crore)} Crore`);
  if (lakh) parts.push(`${twoDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${twoDigits(thousand)} Thousand`);
  if (rem) parts.push(threeDigits(rem));
  return `${num < 0 ? 'Minus ' : ''}${parts.join(' ')} Rupees Only`;
}
