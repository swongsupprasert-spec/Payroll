// ดึงฟังก์ชันของจริงจาก assets/app/*.js มารันใน sandbox พร้อม DB จำลอง (ไม่แก้โค้ดแอป)
// APP_DIR=โฟลเดอร์อื่น ใช้ทดสอบกับสำเนาโค้ดที่แก้ไว้ชั่วคราว (เช่น ลองทำสูตรผิดดูว่า test จับได้ไหม)
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const APP_DIR = process.env.APP_DIR || fileURLToPath(new URL('../assets/app/', import.meta.url));
const SRC = fs.readdirSync(APP_DIR).filter(f => f.endsWith('.js')).sort()
  .map(f => fs.readFileSync(path.join(APP_DIR, f), 'utf8')).join('\n');

/* ตัดฟังก์ชัน/ค่าคงที่ระดับบนสุดตามชื่อ (นับวงเล็บ ข้ามสตริงและคอมเมนต์) */
export function grab(name) {
  const m = new RegExp(`^(function ${name}\\(|const ${name}\\s*=)`, 'm').exec(SRC);
  if (!m) throw new Error(`ไม่พบ ${name} ในโค้ดแอป — ถูกเปลี่ยนชื่อหรือลบไปหรือไม่`);
  const isFn = m[0].startsWith('function');
  let depth = 0, started = false;
  for (let i = m.index; i < SRC.length; i++) {
    const c = SRC[i], n = SRC[i + 1];
    if (c === '/' && n === '/') { i = SRC.indexOf('\n', i); continue; }
    if (c === '/' && n === '*') { i = SRC.indexOf('*/', i) + 1; continue; }
    if (c === "'" || c === '"' || c === '`') {
      for (i++; i < SRC.length && SRC[i] !== c; i++) if (SRC[i] === '\\') i++;
      continue;
    }
    if (c === '{' || c === '[') { depth++; started = true; }
    else if (c === '}' || c === ']') { depth--; if (isFn && started && depth === 0) return SRC.slice(m.index, i + 1); }
    else if (c === ';' && depth === 0 && !isFn) return SRC.slice(m.index, i + 1);
  }
  throw new Error(`ตัด ${name} ไม่สำเร็จ`);
}

/* โหลดชุดฟังก์ชันตามชื่อ → คืน object ของฟังก์ชัน + DB ที่ใช้ */
export function makeApp(names, dbOver = {}, period = '2026-10') {
  const ctx = {
    DB: { ssoRate: 5, ssoMaxBase: 17500, otDays: 30, otHours: 8, cutoffDay: 0, workDaysDefault: 26,
      payroll: {}, employees: [], ...dbOver },
    PERIOD: period,
    pad2: n => String(n).padStart(2, '0'),
  };
  vm.createContext(ctx);
  const fns = names.filter(n => !/^[A-Z0-9_]+$/.test(n));
  vm.runInContext(names.map(grab).join('\n') + '\n;this.F={' + fns.join(',') + '};', ctx);
  return { ...ctx.F, DB: ctx.DB };
}

/* ชุดฟังก์ชันคำนวณเงินเดือนพื้นฐาน */
export const CORE = ['EARN_FIELDS', 'DED_FIELDS', 'SSO_WAGE_KEYS', 'TAX_BRACKETS', 'periodRange', 'isoOf', 'blankRec',
  'readRec', 'autoSSO', 'salHistOf', 'salaryOnDate', 'salaryFor', 'prorate', 'basePay', 'resignedBefore',
  'ssoWage', 'ssoExempt', 'monthlyWage', 'otRate', 'otAmount', 'progressiveTax', 'monthsEmployedInYear',
  'estTax', 'calc', 'daysInMonth'];
