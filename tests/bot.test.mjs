// ทดสอบบอท LINE: ตอบตรงเรื่อง ราคาคิดจากตาราง TIERS จริง และไม่ตอบมั่วเมื่อถามนอกเรื่อง
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import { answer } from '../api/_bot.mjs';

const say = (q) => answer(q)[0].text;

test('ราคาตามจำนวนพนักงาน คิดจากตารางในหน้าราคา', () => {
  assert.match(say('พนักงาน 25 คน ราคาเท่าไหร่'), /11-30 คน[\s\S]*มาตรฐาน: 590[\s\S]*พรีเมียม .*790/);
  assert.match(say('มี 8 คน ใช้ฟรีไหม'), /ฟรีตลอด/);
  assert.match(say('มีพนักงาน 200 คน ราคา'), /ใบเสนอราคา/);
  assert.match(say('💰 ราคา'), /101-150 คน: 2,990 \/ 4,490/);
});

test('ตอบจากคำถามที่พบบ่อยบนเว็บ', () => {
  assert.match(say('ทดลองใช้ฟรีได้ไหม'), /30 วัน/);
  assert.match(say('ปกส หักเท่าไหร่'), /875/);
  assert.match(say('ต้องติดตั้งโปรแกรมไหม'), /^ไม่ต้อง/);
  assert.match(say('ยกเลิกได้ไหม'), /ไม่มีสัญญาผูกมัด/);
  assert.match(say('อยากได้ใบกำกับภาษี'), /hello@esimpayroll\.com/);
  assert.match(say('OT วันหยุดกี่เท่า'), /3 เท่า/);
});

test('ไม่ตอบมั่วเมื่อถามนอกเรื่อง', () => {
  for (const q of ['ราคาทองวันนี้', 'วันนี้อากาศดี']) assert.match(say(q), /ยังตอบคำถามนี้ไม่ได้/, q);
});

test('ทุกคำตอบมีปุ่มเมนู และไม่เกินขนาดที่ LINE รับ', () => {
  for (const q of ['สวัสดี', 'ราคา', 'ประกันสังคมคิดยังไง', 'คุยกับแอดมิน', 'xyz']) {
    const [m] = answer(q);
    assert.ok(m.text.length <= 5000);
    assert.ok(m.quickReply.items.length <= 13);
    for (const it of m.quickReply.items) assert.ok(it.action.label.length <= 20, it.action.label);
  }
});

test('webhook: ตรวจลายเซ็น และตอบเฉพาะแชตส่วนตัว', async () => {
  process.env.LINE_CHANNEL_SECRET = 'test-secret';
  process.env.LINE_CHANNEL_ACCESS_TOKEN = 'test-token';
  const sent = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (u, o) => { sent.push(JSON.parse(o.body)); return { ok: true }; };
  try {
    const { default: handler } = await import('../api/line-webhook.mjs');
    const call = async (events, sig) => {
      const raw = Buffer.from(JSON.stringify({ events }));
      const req = Readable.from([raw]);
      req.method = 'POST';
      req.headers = { 'x-line-signature': sig ?? crypto.createHmac('sha256', 'test-secret').update(raw).digest('base64') };
      let code;
      await handler(req, { status(c) { code = c; return this; }, send() { return this; } });
      return code;
    };
    const ev = (text, source = { type: 'user', userId: 'U1' }) => ({ type: 'message', replyToken: 'r-' + text, source, message: { type: 'text', text } });
    assert.equal(await call([ev('ราคา')], 'AAAA'), 401);
    assert.equal(sent.length, 0);
    assert.equal(await call([ev('ราคา', { type: 'group', groupId: 'G' })]), 200);
    assert.equal(sent.length, 0);
    assert.equal(await call([ev('ราคา')]), 200);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].replyToken, 'r-ราคา');
  } finally { globalThis.fetch = realFetch; }
});
