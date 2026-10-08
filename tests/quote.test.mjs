// ทดสอบใบเสนอราคา (assets/quote.js): ราคาตรงกับหน้าเว็บ การคำนวณยอด และข้อมูลบนเอกสาร
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const win = {};
const ctx = { window: win, alert() {} };
vm.runInNewContext(read('assets/receipt.js'), ctx);
ctx.ESIM_RECEIPT = win.ESIM_RECEIPT;
vm.runInNewContext(read('assets/quote.js'), ctx);
const Q = win.ESIM_QUOTE;

// ดึงตาราง TIERS จากไฟล์อื่น (รูปแบบ {min:1, max:10, price:0, prem:590})
function tiersFrom(src, name) {
  const body = src.match(new RegExp(`const ${name}\\s*=\\s*\\[([\\s\\S]*?)\\];`))[1];
  return [...body.matchAll(/\{([^}]*)\}/g)].map(([, s]) => Object.fromEntries([...s.matchAll(/(\w+):\s*([\w.]+)/g)].map(([, k, v]) => [k, v === 'null' || v === 'Infinity' ? null : v === 'true' ? true : +v])))
    .filter((t) => t.price != null).map(({ hot, ...t }) => t);
}

test('ตารางราคาในใบเสนอราคาตรงกับหน้าราคาและ Edge Function ที่เก็บเงินจริง', () => {
  const mine = JSON.parse(JSON.stringify(Q.TIERS));
  assert.deepEqual(mine, tiersFrom(read('pricing.html'), 'TIERS'));
  assert.deepEqual(mine, tiersFrom(read('supabase/functions/omise-charge/index.ts'), 'TIERS'));
  assert.deepEqual(JSON.parse(JSON.stringify(Q.FIRM_TIERS)), tiersFrom(read('pricing.html'), 'FIRM_TIERS'));
});

test('รายการแพ็กเกจ: รายปีคิด 10 เดือน, รายเดือนคูณจำนวนเดือน, เกินตารางให้กรอกเอง', () => {
  let l = Q.planLine({ count: 50, ptype: 'premium', cycle: 'yearly' });
  assert.equal(l.price, 14900); assert.equal(l.unit, 'ปี'); assert.match(l.desc, /พรีเมียม.*31-50 คน.*รายปี/);
  l = Q.planLine({ count: 25, ptype: 'standard', cycle: 'monthly', periods: 6 });
  assert.equal(l.price, 590); assert.equal(l.qty, 6); assert.equal(l.unit, 'เดือน');
  l = Q.planLine({ edition: 'firm', count: 20, cycle: 'yearly' });
  assert.equal(l.price, 69900); assert.match(l.desc, /สำนักงานบัญชี.*16-40 บริษัท/);
  assert.equal(Q.planLine({ count: 300 }).price, null);
  assert.equal(Q.planLine({ edition: 'firm', count: 60 }).price, null);
});

test('ยอดรวม: ส่วนลดไม่ติดลบ และปัดเศษสตางค์', () => {
  assert.deepEqual({ ...Q.totals([{ qty: 1, price: 14900 }, { qty: 3, price: 33.333 }], 900) }, { sub: 15000, disc: 900, total: 14100, options: 0 }); // 99.999 → 100.00
  assert.deepEqual({ ...Q.totals([{ qty: 1, price: 500 }], 9999) }, { sub: 500, disc: 500, total: 0, options: 0 });
  assert.deepEqual({ ...Q.totals([{ qty: 1, price: 500 }], -50) }, { sub: 500, disc: 0, total: 500, options: 0 });
});

test('เอกสาร: เลขที่ วันยืนราคา ยอดตัวอักษร ไม่มี VAT และกันโค้ดแทรก', () => {
  const h = Q.html({
    quote_no: 'QT2569-0007', date: '2026-10-08T03:00:00Z', valid_until: '2026-11-07',
    seller: { name: 'บริษัท อีซิม จำกัด', taxId: '0105500000001', addr: '1 ถนนพระราม 9' },
    customer: { name: 'บริษัท <ลูกค้า> จำกัด', contact: 'คุณสมชาย', taxId: '0105555000000' },
    items: [Q.planLine({ count: 200, cycle: 'yearly' }), { desc: 'ค่าตั้งค่าระบบและอบรม', qty: 1, unit: 'ครั้ง', price: 5000 }].map((i) => ({ ...i, price: i.price ?? 40000 })),
    discount: 1000, notes: 'ยืนราคา 30 วัน',
  });
  assert.match(h, /ใบเสนอราคา/);
  assert.match(h, /QT2569-0007/);
  assert.match(h, /08\/10\/2569/);
  assert.match(h, /07\/11\/2569/);
  assert.match(h, /44,000\.00/);                       // 40,000 + 5,000 − 1,000
  assert.match(h, /สี่หมื่นสี่พันบาทถ้วน/);
  assert.match(h, /ไม่ได้จดทะเบียนภาษีมูลค่าเพิ่ม/);
  assert.match(h, /บริษัท อีซิม จำกัด/);
  assert.match(h, /&lt;ลูกค้า&gt;/);
  assert.doesNotMatch(h, /<ลูกค้า>/);
});

test('ตัวเลือกแพ็กเกจ: มาตรฐาน/พรีเมียมให้ลูกค้าเลือก ไม่นำราคามารวมกัน', () => {
  const std = { ...Q.planLine({ count: 120, cycle: 'monthly' }), option: true };
  const prem = { ...Q.planLine({ count: 120, ptype: 'premium', cycle: 'monthly' }), option: true };
  assert.equal(std.price, 2990); assert.equal(prem.price, 4490);
  assert.deepEqual({ ...Q.totals([std, prem], 0) }, { sub: 0, disc: 0, total: 0, options: 2 });
  const h = Q.html({ quote_no: 'QT2569-0003', date: '2026-10-08T03:00:00Z', customer: { name: 'ลูกค้า' }, items: [std, prem] });
  assert.match(h, /ตัวเลือกที่ 1/); assert.match(h, /ตัวเลือกที่ 2/);
  assert.match(h, /ไม่นำมารวมกัน/);
  assert.doesNotMatch(h, /7,480/);                        // ห้ามบวก 2,990 + 4,490
  assert.doesNotMatch(h, /ยอดรวมทั้งสิ้น/);
  // มีค่าตั้งค่าระบบด้วย → ยอดรวมเฉพาะรายการอื่น และบอกว่าไม่รวมตัวเลือก
  const h2 = Q.html({ quote_no: 'QT2569-0004', date: '2026-10-08T03:00:00Z', customer: { name: 'ลูกค้า' },
    items: [std, prem, { desc: 'ค่าตั้งค่าระบบ', qty: 1, unit: 'ครั้ง', price: 5000 }] });
  assert.match(h2, /ไม่รวมตัวเลือก/); assert.match(h2, /5,000\.00/); assert.doesNotMatch(h2, /12,480/);
});

test('ใบเสนอราคาบอกสิ่งที่ได้รับ ระยะเวลาบริการ และยอดต่อเดือนให้ชัด', () => {
  const m = Q.planLine({ count: 120, ptype: 'premium', cycle: 'monthly' });
  assert.match(m.desc, /รองรับพนักงาน 101-150 คน/);
  assert.match(m.desc, /ลงเวลาสแกนหน้า/);
  assert.match(m.desc, /รายเดือน/);
  assert.match(Q.planLine({ count: 40 }).desc, /ระยะเวลาบริการ 12 เดือน/);
  assert.equal(Q.totalLabel([m]), 'ยอดรวมต่อเดือน (บาท)');
  assert.equal(Q.totalLabel([Q.planLine({ count: 40 })]), 'ยอดรวมต่อปี (บาท)');
  const h = Q.html({ quote_no: 'QT2569-0005', date: '2026-10-08T03:00:00Z', customer: { name: 'ลูกค้า' },
    seller: { name: 'eSimPayroll', line: '@esimpayroll', contact: 'คุณเอ' }, items: [m] });
  assert.match(h, /ยอดรวมต่อเดือน/); assert.match(h, /LINE @esimpayroll/); assert.match(h, /ผู้ติดต่อฝ่ายขาย <b>คุณเอ<\/b>/);
});
