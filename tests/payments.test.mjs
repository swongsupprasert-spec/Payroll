// ทดสอบการต่ออายุหลังชำระเงินใน Edge Functions (omise-charge / omise-webhook) ด้วย admin client จำลอง
// สำคัญ: บัตรที่จ่ายจบทันทีต้องได้เปิดใช้งาน และต่ออายุได้ครั้งเดียวแม้ทั้งสองทางเรียกพร้อมกัน
import fs from 'node:fs'; import assert from 'node:assert/strict'; import { test } from 'node:test';
test('ต่ออายุหลังชำระเงิน: ครั้งเดียว และคืนสถานะเมื่อพลาด', async () => {
for (const f of ['omise-charge', 'omise-webhook']) {
  const src = fs.readFileSync(new URL('../supabase/functions/'+f+'/index.ts', import.meta.url), 'utf8').split(String.fromCharCode(13)).join('');
  const body = src.slice(src.indexOf('async function activatePayment'));
  const fnSrc = body.slice(0, body.indexOf('\n}\n') + 2).replace('(admin: any, chargeId: string)', '(admin, chargeId)');
  const activatePayment = new Function(`return (${fnSrc})`)();
  // ตาราง payments จำลอง + rpc
  const mk = (failRpc) => {
    const rows = { c1: { charge_id: 'c1', status: 'pending', amount: 790, user_id: 'u' } }; let rpcCalls = 0;
    const admin = {
      rows, get rpcCalls() { return rpcCalls; },
      from() { let patch, conds = []; const q = {
        update(p) { patch = p; return q; }, eq(k, v) { conds.push([k, v]); return q; },
        select() { return q; },
        async maybeSingle() { const r = Object.values(rows).find((x) => conds.every(([k, v]) => x[k] === v)); if (!r) return { data: null }; Object.assign(r, patch); return { data: { ...r } }; },
        then(res) { const r = Object.values(rows).find((x) => conds.every(([k, v]) => x[k] === v)); if (r) Object.assign(r, patch); res({}); },
      }; return q; },
      async rpc() { rpcCalls++; return failRpc ? { error: { message: 'boom' } } : { data: '2027-10-08T00:00:00Z' }; },
    };
    return admin;
  };
  let a = mk(false);
  const [r1, r2] = await Promise.all([activatePayment(a, 'c1'), activatePayment(a, 'c1')]);
  assert.equal(a.rpcCalls, 1, f + ': ต่ออายุได้ครั้งเดียวแม้เรียกพร้อมกัน');
  assert.equal([r1, r2].filter((r) => r.done).length, 1);
  assert.equal(a.rows.c1.status, 'successful');
  assert.ok(a.rows.c1.paid_until);
  a = mk(true);
  const r3 = await activatePayment(a, 'c1');
  assert.ok(r3.error); assert.equal(a.rows.c1.status, 'pending', f + ': พลาดแล้วคืนเป็น pending ให้ลองใหม่');
}
});
