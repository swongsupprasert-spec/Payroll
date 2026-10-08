// ทดสอบใบเสร็จรับเงิน (assets/receipt.js): จำนวนเงินตัวอักษรไทย และข้อมูลบนเอกสาร
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const win = {};
vm.runInNewContext(fs.readFileSync(new URL('../assets/receipt.js', import.meta.url), 'utf8'), { window: win, alert() {} });
const R = win.ESIM_RECEIPT;

test('จำนวนเงินเป็นตัวอักษรไทย', () => {
  const cases = {
    1: 'หนึ่งบาทถ้วน', 11: 'สิบเอ็ดบาทถ้วน', 21: 'ยี่สิบเอ็ดบาทถ้วน', 101: 'หนึ่งร้อยเอ็ดบาทถ้วน',
    590: 'ห้าร้อยเก้าสิบบาทถ้วน', 5900: 'ห้าพันเก้าร้อยบาทถ้วน', 14900: 'หนึ่งหมื่นสี่พันเก้าร้อยบาทถ้วน',
    44900: 'สี่หมื่นสี่พันเก้าร้อยบาทถ้วน', 1000000: 'หนึ่งล้านบาทถ้วน', 100.5: 'หนึ่งร้อยบาทห้าสิบสตางค์',
  };
  for (const [n, s] of Object.entries(cases)) assert.equal(R.bahtText(+n), s, n);
});

test('ใบเสร็จ: เลขที่จากฐานข้อมูล วันที่ตามเวลาไทย ระบุว่าไม่มี VAT และกันโค้ดแทรกในชื่อ', () => {
  const h = R.html({
    docNo: 'RC2569-000123', date: '2026-10-08T17:30:00Z',   // = 9 ต.ค. 2569 00:30 น. เวลาไทย
    name: 'บริษัท <ตัวอย่าง> จำกัด', email: 'a@b.co', btype: 'juristic', taxId: '0105555000000', branch: 'สำนักงานใหญ่',
    addr: '1 ถนนสุขุมวิท', plan: '11-30 คน · พรีเมี่ยม', employees: 25, cycle: 'yearly', amount: 7900,
    transRef: 'chrg_test_1', method: 'card',
  }, false);
  assert.match(h, /ใบเสร็จรับเงิน/);
  assert.match(h, /RC2569-000123/);
  assert.match(h, /09\/10\/2569/);
  assert.match(h, /ไม่ได้จดทะเบียนภาษีมูลค่าเพิ่ม/);
  assert.match(h, /เจ็ดพันเก้าร้อยบาทถ้วน/);
  assert.match(h, /7,900\.00/);
  assert.match(h, /รายปี/);
  assert.match(h, /0105555000000/);
  assert.match(h, /&lt;ตัวอย่าง&gt;/);
  assert.doesNotMatch(h, /<ตัวอย่าง>/);
});

test('ใบเสร็จสำนักงานบัญชีนับเป็นจำนวนบริษัท', () => {
  const h = R.html({ docNo: 'RC2569-000001', date: '2026-10-08T03:00:00Z', name: 'สำนักงาน', email: 'x@y.z', plan: '1-15 บริษัท · สำนักงานบัญชี', employees: 8, cycle: 'monthly', amount: 3990, edition: 'firm' }, false);
  assert.match(h, /8 บริษัท/);
  assert.match(h, /รายเดือน/);
});
