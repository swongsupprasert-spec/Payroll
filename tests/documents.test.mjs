// ทดสอบตัวเลขในเอกสารราชการ (กท.20 ก / สปส.1-10 / 50 ทวิ / ภ.ง.ด.1) ให้ตรงกับเงินเดือนในสลิป
// บริษัทตัวอย่าง 5 คน ครอบคลุม: รายเดือน, เงินเดือนสูง (มีภาษี + เกินเพดาน), รายวัน, กรรมการ (ยกเว้น ปกส.), คนลาออกแล้ว
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeApp, CORE } from './load-app.mjs';

const EMP = [
  { id: 'e1', name: 'สมชาย', payType: 'monthly', salary: 25000, startDate: '2020-01-01' },
  { id: 'e2', name: 'สุดา', payType: 'monthly', salary: 50000, startDate: '2020-01-01' },
  { id: 'e3', name: 'มาลี', payType: 'daily', salary: 400, startDate: '2020-01-01' },
  { id: 'e4', name: 'กรรมการ', payType: 'monthly', salary: 80000, startDate: '2020-01-01', position: 'กรรมการผู้จัดการ' },
  { id: 'e5', name: 'ลาออกแล้ว', payType: 'monthly', salary: 20000, startDate: '2020-01-01', resignDate: '2026-08-15' },
];
const rec = (earn = {}, ded = {}, extra = {}) => ({
  earn: { ot: 0, commission: 0, diligence: 0, travel: 0, position: 0, bonus: 0, other: 0, ...earn },
  ded: { tax: 0, sso: 0, pvd: 0, wf: 0, loan: 0, studentloan: 0, absent: 0, advance: 0, other: 0, ...ded }, ...extra });
const PAYROLL = {
  '2026-09': { e1: rec({}, { sso: 875 }), e2: rec({}, { sso: 875, tax: 1704.17 }), e3: rec({}, { sso: 400 }, { days: 20 }) },
  '2026-10': {
    e1: rec({ ot: 937.5 }, { sso: 875 }),
    e2: rec({ commission: 2000, bonus: 5000 }, { sso: 875, tax: 1704.17 }),
    e3: rec({}, { sso: 440 }, { days: 22 }),
    e4: rec({}, { tax: 5000 }),
  },
};
const A = makeApp([...CORE, 'activeInMonth', 'KT20_CAP', 'kt20Month', 'kt20Year', 'yearAgg', 'pndPayDate', 'pnd1List'],
  { employees: EMP, payroll: PAYROLL });

test('กท.20 ก รายเดือน: ค่าจ้างตามนิยาม ปกส. ไม่รวม OT/โบนัส ตัดกรรมการและคนลาออก', () => {
  const k = A.kt20Month(2026, 10);
  assert.equal(k.count, 3);              // e1 e2 e3 (ไม่นับกรรมการ และคนที่ลาออก ส.ค.)
  assert.equal(k.salary, 75000);         // 25,000 + 50,000
  assert.equal(k.daily, 8800);           // 400 × 22 วัน
  assert.equal(k.other, 2000);           // ค่าคอมมิชชั่น (นับเป็นค่าจ้าง)
  assert.equal(k.total, 85800);
  assert.equal(k.excess, 37000);         // ส่วนเกินเพดาน 20,000 รายคน: 5,000 + 32,000
  assert.equal(k.net, 48800);
  assert.equal(k.ot, 937.5);             // แยกแสดง ไม่รวมในค่าจ้าง
  assert.equal(k.bonus, 5000);
  assert.equal(k.sso, 2190);             // 875 + 875 + 440
});

test('สปส.1-10 ตรงกับ กท.20 ก ของเดือนเดียวกัน (ค่าจ้างรวม และเงินสมทบ)', () => {
  // สปส.1-10 ใช้ ssoWage ของคนที่ทำงานเดือนนั้นและไม่ได้รับยกเว้น — แบบเดียวกับที่หน้าแบบฟอร์มคิด
  const list = EMP.filter(e => A.activeInMonth(e, 2026, 10) && !A.ssoExempt(e));
  const wage = list.reduce((s, e) => s + A.ssoWage(e, A.readRec('2026-10', e.id), '2026-10'), 0);
  const sso = list.reduce((s, e) => s + A.readRec('2026-10', e.id).ded.sso, 0);
  const k = A.kt20Month(2026, 10);
  assert.equal(wage, k.total);
  assert.equal(sso, k.sso);
  assert.equal(sso * 2, 4380);           // ลูกจ้าง + นายจ้าง
});

test('เงินสมทบในสลิปไม่เกินเพดาน 875 และกรรมการไม่ถูกหัก', () => {
  for (const e of EMP) {
    const r = A.readRec('2026-10', e.id);
    assert.ok(r.ded.sso <= 875, `${e.name} หัก ปกส. ${r.ded.sso}`);
    if (A.ssoExempt(e)) assert.equal(r.ded.sso, 0);
  }
});

test('กท.20 ก รายปี: รวม 12 เดือนครบ และจำนวนลูกจ้างสูงสุด', () => {
  const { months, sum } = A.kt20Year(2026);
  assert.equal(months.length, 12);
  assert.equal(sum.sso, months.reduce((s, m) => s + m.sso, 0));
  assert.equal(sum.total, months.reduce((s, m) => s + m.total, 0));
  assert.equal(sum.count, Math.max(...months.map(m => m.count)));
  assert.equal(sum.minMonthly, 20000);   // ค่าจ้างรายเดือนต่ำสุดในบริษัท
  assert.equal(sum.minDaily, 400);
});

test('50 ทวิ: ยอดทั้งปีเท่ากับผลรวมสลิปทุกเดือน (เงินได้ ภาษี ปกส.)', () => {
  const y = A.yearAgg(EMP[1], 2026);     // สุดา: ก.ย. + ต.ค.
  const sep = A.calc(EMP[1], '2026-09'), oct = A.calc(EMP[1], '2026-10');
  assert.equal(y.income, sep.gross + oct.gross);
  assert.equal(y.income, 50000 + 57000);  // ต.ค. รวมคอมมิชชั่น + โบนัส
  assert.equal(y.tax, 1704.17 * 2);
  assert.equal(y.sso, 1750);
  // คนที่ไม่มีข้อมูลเงินเดือนในปีนั้น = 0 ทุกช่อง
  assert.deepEqual({ ...A.yearAgg(EMP[4], 2026) }, { income: 0, tax: 0, sso: 0, pvd: 0 });
});

test('ภ.ง.ด.1: เงินได้ในแบบ = รายได้รวมในสลิป และภาษีรวมตรงกับที่หักจริง', () => {
  const c = EMP.map(e => A.calc(e, '2026-10'));
  assert.equal(c[0].gross, 25937.5);     // สมชาย: เงินเดือน + OT
  assert.equal(c[1].gross, 57000);       // สุดา: + คอมมิชชั่น + โบนัส (เงินได้ภาษี รวมโบนัส)
  assert.equal(c.reduce((s, x) => s + x.r.ded.tax, 0), 6704.17);
});

test('ภ.ง.ด.1: วันที่จ่ายเริ่มต้น = สิ้นเดือน (แก้เองได้)', () => {
  assert.equal(A.pndPayDate('2026-10'), '2026-10-31');
  assert.equal(A.pndPayDate('2028-02'), '2028-02-29');
  A.DB.payDates = { '2026-10': '2026-10-25' };
  assert.equal(A.pndPayDate('2026-10'), '2026-10-25');
  delete A.DB.payDates;
});

test('ภ.ง.ด.1 มีเฉพาะคนที่ทำงานในเดือนนั้น (ไม่นับคนลาออก/ยังไม่เริ่มงาน)', () => {
  const ids = m => A.pnd1List(m).map(e => e.id);
  assert.deepEqual(ids('2026-10'), ['e1', 'e2', 'e3', 'e4']);  // ลาออก ส.ค. ไม่อยู่ใน ต.ค.
  assert.deepEqual(ids('2026-08'), ['e1', 'e2', 'e3', 'e4', 'e5']); // เดือนที่ลาออกยังต้องยื่น
  A.DB.employees.push({ id: 'e6', name: 'เริ่มงาน พ.ย.', payType: 'monthly', salary: 18000, startDate: '2026-11-03' });
  assert.equal(ids('2026-10').includes('e6'), false);
  assert.equal(ids('2026-11').includes('e6'), true);
  A.DB.employees.pop();
  // ยอดรวมในแบบไม่เปลี่ยน (คนที่ตัดออกมีเงินได้ 0 อยู่แล้ว) แต่จำนวนรายถูกต้อง
  const all = A.DB.employees.reduce((s, e) => s + A.calc(e, '2026-10').gross, 0);
  const listed = A.pnd1List('2026-10').reduce((s, e) => s + A.calc(e, '2026-10').gross, 0);
  assert.equal(listed, all);
  assert.equal(A.pnd1List('2026-10').length, 4);
});
