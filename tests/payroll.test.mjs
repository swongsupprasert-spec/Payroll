// ทดสอบสูตรเงินเดือนของจริงใน app.html โดยไม่แก้โค้ดแอป
// ดึงฟังก์ชันตามชื่อออกมารันใน sandbox พร้อม DB จำลอง แล้วเทียบกับคำตอบที่คิดมือไว้
// รัน: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const SRC = fs.readFileSync(process.env.APP_HTML || new URL('../app.html', import.meta.url), 'utf8');

/* ตัดฟังก์ชัน/ค่าคงที่ระดับบนสุดตามชื่อ (นับวงเล็บปีกกา ข้ามสตริงและคอมเมนต์) */
function grab(name) {
  const m = new RegExp(`^(function ${name}\\(|const ${name}\\s*=)`, 'm').exec(SRC);
  if (!m) throw new Error(`ไม่พบ ${name} ใน app.html — ถูกเปลี่ยนชื่อหรือลบไปหรือไม่`);
  let i = m.index, depth = 0, started = false;
  for (; i < SRC.length; i++) {
    const c = SRC[i], n = SRC[i + 1];
    if (c === '/' && n === '/') { i = SRC.indexOf('\n', i); continue; }
    if (c === '/' && n === '*') { i = SRC.indexOf('*/', i) + 1; continue; }
    if (c === "'" || c === '"' || c === '`') {
      for (i++; i < SRC.length && SRC[i] !== c; i++) if (SRC[i] === '\\') i++;
      continue;
    }
    if (c === '{' || c === '[') { depth++; started = true; }
    else if (c === '}' || c === ']') { depth--; if (started && depth === 0 && m[0].startsWith('function')) return SRC.slice(m.index, i + 1); }
    else if (c === ';' && depth === 0 && m[0].startsWith('const')) return SRC.slice(m.index, i + 1);
  }
  throw new Error(`ตัด ${name} ไม่สำเร็จ`);
}

const NAMES = ['EARN_FIELDS', 'DED_FIELDS', 'SSO_WAGE_KEYS', 'TAX_BRACKETS', 'periodRange', 'isoOf', 'blankRec',
  'readRec', 'autoSSO', 'salHistOf', 'salaryOnDate', 'salaryFor', 'prorate', 'basePay', 'resignedBefore',
  'ssoWage', 'ssoExempt', 'monthlyWage', 'otRate', 'otAmount', 'progressiveTax', 'monthsEmployedInYear',
  'estTax', 'calc'];

function makeApp(dbOver = {}) {
  const ctx = {
    DB: { ssoRate: 5, ssoMaxBase: 17500, otDays: 30, otHours: 8, cutoffDay: 0, workDaysDefault: 26, payroll: {}, ...dbOver },
    PERIOD: '2026-10',
    pad2: n => String(n).padStart(2, '0'),
  };
  vm.createContext(ctx);
  vm.runInContext(NAMES.map(grab).join('\n') + '\n;this.F={' + NAMES.filter(n => !/^[A-Z_]+$/.test(n)).join(',') + '};', ctx);
  return { ...ctx.F, DB: ctx.DB };
}
const A = makeApp();
const M = (salary, extra = {}) => ({ id: 'e1', payType: 'monthly', salary, startDate: '2020-01-01', ...extra });

test('ประกันสังคม 5% เพดานฐาน 17,500 (สูงสุด 875)', () => {
  assert.equal(A.autoSSO(10000), 500);
  assert.equal(A.autoSSO(15000), 750);
  assert.equal(A.autoSSO(17500), 875);
  assert.equal(A.autoSSO(25000), 875);
  assert.equal(A.autoSSO(100000), 875);
  assert.equal(A.autoSSO(1650), 83); // ปัดเป็นบาท
});

test('ยกเว้นประกันสังคม: กรรมการ / ติ๊กยกเว้นเอง', () => {
  assert.equal(A.ssoExempt({ position: 'กรรมการผู้จัดการ' }), true);
  assert.equal(A.ssoExempt({ position: 'Managing Director' }), true);
  assert.equal(A.ssoExempt({ noSSO: true, position: 'พนักงาน' }), true);
  assert.equal(A.ssoExempt({ position: 'พนักงานบัญชี' }), false);
});

test('ภาษีอัตราก้าวหน้า', () => {
  assert.equal(A.progressiveTax(0), 0);
  assert.equal(A.progressiveTax(150000), 0);
  assert.equal(A.progressiveTax(300000), 7500);
  assert.equal(A.progressiveTax(400000), 17500);
  assert.equal(A.progressiveTax(500000), 27500);
  assert.equal(A.progressiveTax(1000000), 115000);
  assert.equal(A.progressiveTax(5000000), 1265000);
});

test('ภาษีหัก ณ ที่จ่ายต่อเดือน (ทำงานทั้งปี ไม่มีลดหย่อนอื่น)', () => {
  // 25,000×12 = 300,000 − ค่าใช้จ่าย 100,000 − ส่วนตัว 60,000 − ปกส. 10,500 = 129,500 → ไม่ถึงเกณฑ์
  assert.equal(A.estTax(M(25000), 2026, null).monthly, 0);
  // 50,000×12 = 600,000 − 170,500 = 429,500 → 7,500 + 12,950 = 20,450/ปี → 1,704.17/เดือน
  const t = A.estTax(M(50000), 2026, null);
  assert.equal(t.net, 429500);
  assert.equal(t.annual, 20450);
  assert.equal(t.monthly, 1704.17);
  // คู่สมรส + บุตร 2 คน ลดเพิ่ม 120,000 → 309,500 → 7,500 + 950 = 8,450
  assert.equal(A.estTax(M(50000, { spouse: 1, children: 2 }), 2026, null).annual, 8450);
});

test('ภาษีคนเข้างานกลางปี คิดจากเดือนที่ทำงานจริง', () => {
  const t = A.estTax(M(50000, { startDate: '2026-07-01' }), 2026, null);
  assert.equal(t.months, 6);
  // 300,000 − 100,000 − 60,000 − 5,250 = 134,750 → 0
  assert.equal(t.annual, 0);
});

test('อัตรา OT และค่า OT', () => {
  assert.equal(A.otRate(M(30000)), 125); // 30,000 ÷ 30 ÷ 8
  assert.equal(A.otAmount(M(30000), 6, 1.5), 1125);
  assert.equal(A.otAmount(M(25000), 6, 1.5), 937.5);
  assert.equal(A.otAmount(M(25000), 4, 3), 1250);
  assert.equal(A.otAmount({ payType: 'daily', salary: 400 }, 3, 1.5), 225); // 400 ÷ 8 × 3 × 1.5
});

test('ค่าจ้างฐาน: รายเดือน / เข้างานกลางเดือน / รายวัน', () => {
  assert.equal(A.basePay(M(25000), null, '2026-10'), 25000);
  // เริ่ม 16 ต.ค. → ทำงาน 16 จาก 31 วัน
  assert.equal(A.basePay(M(25000, { startDate: '2026-10-16' }), null, '2026-10'), 12903.23);
  // ลาออก 31 ต.ค. แต่เริ่ม 1 ต.ค. = เต็มเดือน
  assert.equal(A.basePay(M(25000, { startDate: '2026-10-01', resignDate: '2026-10-31' }), null, '2026-10'), 25000);
  assert.equal(A.basePay({ payType: 'daily', salary: 400 }, { days: 22 }, '2026-10'), 8800);
});

test('ขึ้นเงินเดือนกลางเดือน คิดเฉลี่ยตามวัน', () => {
  const e = M(20000, { salHist: [{ from: '0000-01-01', salary: 20000 }, { from: '2026-10-16', salary: 31000 }] });
  // 15 วัน × 20,000 + 16 วัน × 31,000 = 796,000 ÷ 31 = 25,677.42
  assert.equal(A.basePay(e, null, '2026-10'), 25677.42);
});

test('งวดตามวันตัดรอบ', () => {
  const B = makeApp({ cutoffDay: 25 });
  const { from, to } = B.periodRange('2026-10');
  assert.equal(B.isoOf(from), '2026-09-26');
  assert.equal(B.isoOf(to), '2026-10-25');
  assert.equal(A.isoOf(A.periodRange('2026-02').to), '2026-02-28');
});

test('ค่าจ้างตามนิยามประกันสังคม ไม่รวม OT และโบนัส', () => {
  const rec = { earn: { ot: 5000, bonus: 10000, commission: 2000, diligence: 500, travel: 0, position: 0, other: 0 }, ded: {} };
  assert.equal(A.ssoWage(M(12000), rec, '2026-10'), 14500);
});

test('สรุปเงินสุทธิของสลิป (เงินเดือน 25,000 + OT 6 ชม. − ปกส.)', () => {
  const B = makeApp({ payroll: { '2026-10': { e1: { earn: { ot: 937.5 }, ded: { sso: 875, tax: 0 } } } } });
  const c = B.calc(M(25000), '2026-10');
  assert.equal(c.gross, 25937.5);
  assert.equal(c.dedTotal, 875);
  assert.equal(c.net, 25062.5);
});
