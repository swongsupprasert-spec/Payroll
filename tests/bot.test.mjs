// ทดสอบบอท LINE: ตอบตรงเรื่อง ราคาคิดจากตาราง TIERS จริง และไม่ตอบมั่วเมื่อถามนอกเรื่อง
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import { answer, answerMedia, shorten } from '../api/_bot.mjs';

const say = (q, ctx) => answer(q, ctx).map((m) => m.text).join('\n');

test('ราคาตามจำนวนพนักงาน คิดจากตารางในหน้าราคา', () => {
  assert.match(say('พนักงาน 25 คน ราคาเท่าไหร่'), /11-30 คน[\s\S]*มาตรฐาน 590[\s\S]*พรีเมียม 790/);
  assert.match(say('มี 8 คน ใช้ฟรีไหม'), /ฟรีตลอด/);
  assert.match(say('40 คนครับ'), /31-50 คน/);
  assert.match(say('มีพนักงาน 200 คน ราคา'), /ใบเสนอราคา/);
  assert.match(say('💰 ราคา'), /101-150 คน: 2,990 \/ 4,490/);
});

test('ตอบจากคำถามที่พบบ่อยบนเว็บ', () => {
  assert.match(say('ทดลองใช้ฟรีได้ไหม'), /30 วัน/);
  assert.match(say('ปกส หักเท่าไหร่'), /875/);
  assert.match(say('ประกันสังคมคิดยังไง'), /875/);
  assert.doesNotMatch(say('ประกันสังคมคิดยังไง'), /\d …/); // ไม่ตัดกลางตัวอย่างตัวเลข
  assert.match(say('ต้องติดตั้งโปรแกรมไหม'), /\nไม่ต้อง/);
  assert.match(say('ยกเลิกได้ไหม'), /ไม่มีสัญญาผูกมัด/);
  assert.match(say('อยากได้ใบกำกับภาษี'), /hello@esimpayroll\.com/);
  assert.match(say('OT วันหยุดกี่เท่า'), /3 เท่า/);
});

test('ไม่ตอบมั่วเมื่อถามนอกเรื่อง', () => {
  for (const q of ['ราคาทองวันนี้', 'วันนี้อากาศดี']) assert.match(say(q), /ยังตอบไม่ได้/, q);
});

test('ตอบแบบคนคุย: เรียกชื่อ คุยเล่น จำจำนวนพนักงาน ตัดคำตอบยาว', () => {
  assert.match(say('สวัสดีครับ', { name: 'สมชาย' }), /คุณสมชาย/);
  assert.match(say('ขอบคุณครับ'), /ยินดี/);
  assert.match(say('โอเค'), /ครับ/);
  assert.match(say('เป็นบอทหรือคน'), /อัตโนมัติ/);
  assert.match(say('แพงจัง'), /1-10 คน.*ฟรีตลอด/);
  const mem = {};
  say('พนักงาน 25 คน ราคาเท่าไหร่', { mem });
  assert.equal(mem.n, 25);
  assert.match(say('📅 จ่ายรายปีล่ะ', { mem }), /25 คน[\s\S]*5,900 บาท\/ปี[\s\S]*7,900 บาท\/ปี/);
  assert.match(say('💎 พรีเมียมมีอะไร', { mem }), /สแกนหน้า/);
  const long = 'ก'.repeat(40) + ' ' + 'ข'.repeat(60) + ' ' + 'ค'.repeat(90) + ' ' + 'ง'.repeat(50);
  assert.equal(shorten(long), 'ก'.repeat(40) + ' ' + 'ข'.repeat(60) + ' …');
  assert.match(answerMedia('sticker')[0].text, /\S/);
  assert.match(answerMedia('image')[0].text, /แอดมิน/);
});

test('ทุกคำตอบอยู่ในขอบเขตที่ LINE รับ (≤5 บับเบิล ปุ่ม ≤13 ป้าย ≤20 ตัว)', () => {
  for (const q of ['สวัสดี', 'ราคา', 'พนักงาน 25 คน', '200 คน', 'ประกันสังคมคิดยังไง', 'OT คิดยังไง', 'คุยกับแอดมิน', 'ขอบคุณ', 'แพงจัง', 'ทำอะไรได้บ้าง', 'xyz']) {
    const msgs = answer(q);
    assert.ok(msgs.length >= 1 && msgs.length <= 5, q);
    for (const m of msgs) assert.ok(m.text.length > 0 && m.text.length <= 5000, q);
    const qr = msgs.at(-1).quickReply;
    assert.ok(qr.items.length <= 13);
    for (const it of qr.items) assert.ok(it.action.label.length <= 20, it.action.label);
  }
});

test('webhook: ตรวจลายเซ็น และตอบเฉพาะแชตส่วนตัว', async () => {
  process.env.LINE_CHANNEL_SECRET = 'test-secret';
  process.env.LINE_CHANNEL_ACCESS_TOKEN = 'test-token';
  const sent = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (u, o) => { if (String(u).endsWith('/message/reply')) sent.push(JSON.parse(o.body)); return { ok: true, json: async () => ({ displayName: 'ทดสอบ' }) }; };
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
