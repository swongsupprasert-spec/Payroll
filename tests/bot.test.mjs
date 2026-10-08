// ทดสอบบอท LINE: ตอบตรงเรื่อง ราคาคิดจากตาราง TIERS จริง และไม่ตอบมั่วเมื่อถามนอกเรื่อง
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import { answer, answerMedia, shorten } from '../api/_bot.mjs';

// ข้อความทั้งหมดที่ลูกค้าเห็น — รวมตัวหนังสือในการ์ด Flex ด้วย
const flat = (x) => (Array.isArray(x) ? x.map(flat).join('\n') : x && typeof x === 'object'
  ? [x.type === 'text' || x.type === 'flex' ? (x.text ?? '') : '', x.action?.label ?? '', ...Object.entries(x).filter(([k]) => !['text', 'action', 'quickReply'].includes(k)).map(([, v]) => flat(v))].filter(Boolean).join('\n') : '');
const say = (q, ctx) => flat(answer(q, ctx));

test('ราคาตามจำนวนพนักงาน คิดจากตารางในหน้าราคา', () => {
  assert.match(say('พนักงาน 25 คน ราคาเท่าไหร่'), /11-30 คน[\s\S]*มาตรฐาน[\s\S]*590[\s\S]*พรีเมียม[\s\S]*790/);
  assert.match(say('มี 8 คน ใช้ฟรีไหม'), /มาตรฐาน[\s\S]*\nฟรี\nตลอดไป/);
  assert.match(say('40 คนครับ'), /31-50 คน/);
  assert.match(say('มีพนักงาน 200 คน ราคา'), /ใบเสนอราคา/);
  assert.match(say('💰 ราคา'), /101-150 คน\n2,990\n4,490/);
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
  assert.match(say('📅 จ่ายรายปีล่ะ', { mem }), /25 คน[\s\S]*รายปี[\s\S]*5,900[\s\S]*7,900\nบาท \/ ปี/);
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
    for (const m of msgs) {
      if (m.type === 'text') assert.ok(m.text.length > 0 && m.text.length <= 5000, q);
      else { assert.equal(m.type, 'flex'); assert.ok(m.altText.length > 0 && m.altText.length <= 400, q); assert.ok(JSON.stringify(m.contents).length < 30000); }
    }
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

test('webhook: จำจำนวนพนักงานข้ามรอบผ่านตาราง Supabase (line_bot_memory)', async () => {
  process.env.LINE_CHANNEL_SECRET = 'test-secret';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
  const table = new Map(), replies = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (u, o = {}) => {
    u = String(u);
    if (u.includes('/rest/v1/line_bot_memory') && (o.method || 'GET') === 'GET') {
      assert.equal(o.headers.apikey, 'test-service-key');
      const uid = decodeURIComponent(u.match(/user_id=eq\.([^&]+)/)[1]);
      return { ok: true, json: async () => (table.has(uid) ? [table.get(uid)] : []) };
    }
    if (u.endsWith('/rest/v1/line_bot_memory')) { const row = JSON.parse(o.body); table.set(row.user_id, row); return { ok: true }; }
    if (u.endsWith('/message/reply')) replies.push(JSON.parse(o.body));
    return { ok: true, json: async () => ({}) };
  };
  try {
    const { default: handler } = await import('../api/line-webhook.mjs?mem');
    const send = async (text) => {
      const raw = Buffer.from(JSON.stringify({ events: [{ type: 'message', replyToken: 'r', source: { type: 'user', userId: 'U9' }, message: { type: 'text', text } }] }));
      const req = Readable.from([raw]);
      req.method = 'POST';
      req.headers = { 'x-line-signature': crypto.createHmac('sha256', 'test-secret').update(raw).digest('base64') };
      await handler(req, { status() { return this; }, send() { return this; } });
      return replies.at(-1).messages.map((m) => m.text ?? m.altText).join('\n');
    };
    await send('พนักงาน 25 คน ราคาเท่าไหร่');
    assert.equal(table.get('U9').mem.n, 25);
    // จำลองเซิร์ฟเวอร์รีสตาร์ต: โหลดโมดูลใหม่ ความจำในเครื่องหาย แต่ยังอ่านจากตารางได้
    const { default: fresh } = await import('../api/line-webhook.mjs?restart');
    const raw = Buffer.from(JSON.stringify({ events: [{ type: 'message', replyToken: 'r2', source: { type: 'user', userId: 'U9' }, message: { type: 'text', text: '📅 จ่ายรายปีล่ะ' } }] }));
    const req = Readable.from([raw]);
    req.method = 'POST';
    req.headers = { 'x-line-signature': crypto.createHmac('sha256', 'test-secret').update(raw).digest('base64') };
    await fresh(req, { status() { return this; }, send() { return this; } });
    assert.match(replies.at(-1).messages.map((m) => m.text ?? m.altText).join('\n'), /25 คน[\s\S]*5,900 บาท/);
  } finally { globalThis.fetch = realFetch; delete process.env.SUPABASE_SERVICE_ROLE_KEY; }
});

test('ส่งต่อแอดมิน: บอทเงียบ 2 ชม. จนกว่าจะพิมพ์ "เมนู" หรือหมดเวลา', async () => {
  const { silenced, HANDOFF_MS } = await import('../api/_bot.mjs');
  const mem = {};
  assert.match(say('👩‍💼 คุยกับแอดมิน', { mem }), /เงียบ/);
  assert.ok(mem.handoff > Date.now());
  assert.equal(silenced('ราคาเท่าไหร่', mem), true);
  assert.equal(silenced('📋 เมนู', mem), false);
  assert.equal(mem.handoff, undefined);
  mem.handoff = Date.now() + HANDOFF_MS;
  assert.equal(silenced('สวัสดี', mem, Date.now() + HANDOFF_MS + 1), false); // หมดเวลาแล้วกลับมาตอบ
});

test('บอกว่าคำถามไหนตอบไม่ได้ (ไว้บันทึกเพื่อเพิ่มคำตอบ)', () => {
  const c1 = {}; answer('ราคาทองวันนี้', c1); assert.equal(c1.miss, 'none');
  const c2 = {}; answer('ราคาเท่าไหร่', c2); assert.equal(c2.miss, undefined);
});

test('webhook: เงียบระหว่างส่งต่อแอดมิน และบันทึกคำถามที่ตอบไม่ได้ลง Supabase', async () => {
  process.env.LINE_CHANNEL_SECRET = 'test-secret';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
  const table = new Map(), misses = [], replies = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (u, o = {}) => {
    u = String(u);
    if (u.includes('/rest/v1/line_bot_memory?')) { const uid = decodeURIComponent(u.match(/user_id=eq\.([^&]+)/)[1]); return { ok: true, json: async () => (table.has(uid) ? [table.get(uid)] : []) }; }
    if (u.endsWith('/rest/v1/line_bot_memory')) { const row = JSON.parse(o.body); table.set(row.user_id, row); return { ok: true }; }
    if (u.endsWith('/rest/v1/line_bot_unanswered')) { misses.push(JSON.parse(o.body)); return { ok: true }; }
    if (u.endsWith('/message/reply')) replies.push(JSON.parse(o.body));
    return { ok: true, json: async () => ({}) };
  };
  try {
    const { default: handler } = await import('../api/line-webhook.mjs?handoff');
    const send = async (text) => {
      const raw = Buffer.from(JSON.stringify({ events: [{ type: 'message', replyToken: 'r', source: { type: 'user', userId: 'U7' }, message: { type: 'text', text } }] }));
      const req = Readable.from([raw]);
      req.method = 'POST';
      req.headers = { 'x-line-signature': crypto.createHmac('sha256', 'test-secret').update(raw).digest('base64') };
      await handler(req, { status() { return this; }, send() { return this; } });
    };
    await send('ราคาทองวันนี้');
    assert.deepEqual(misses.map((m) => [m.question, m.kind]), [['ราคาทองวันนี้', 'none']]);
    await send('คุยกับแอดมิน');
    const n = replies.length;
    await send('สนใจแพ็กเกจพรีเมียมครับ');
    assert.equal(replies.length, n, 'บอทต้องไม่ตอบแทรกแอดมิน');
    await send('เมนู');
    assert.equal(replies.length, n + 1);
  } finally { globalThis.fetch = realFetch; delete process.env.SUPABASE_SERVICE_ROLE_KEY; }
});

test('webhook: ถ้า LINE ไม่รับการ์ด Flex ส่งซ้ำเป็นข้อความธรรมดา', async () => {
  process.env.LINE_CHANNEL_SECRET = 'test-secret';
  const calls = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (u, o = {}) => {
    if (String(u).endsWith('/message/reply')) {
      const body = JSON.parse(o.body);
      calls.push(body);
      const hasFlex = body.messages.some((m) => m.type === 'flex');
      return { ok: !hasFlex, status: hasFlex ? 400 : 200, text: async () => 'invalid flex' };
    }
    return { ok: true, json: async () => ({}) };
  };
  const realErr = console.error; console.error = () => {};
  try {
    const { default: handler } = await import('../api/line-webhook.mjs?fallback');
    const raw = Buffer.from(JSON.stringify({ events: [{ type: 'message', replyToken: 'r', source: { type: 'user', userId: 'U5' }, message: { type: 'text', text: '25 คน' } }] }));
    const req = Readable.from([raw]);
    req.method = 'POST';
    req.headers = { 'x-line-signature': crypto.createHmac('sha256', 'test-secret').update(raw).digest('base64') };
    await handler(req, { status() { return this; }, send() { return this; } });
    assert.equal(calls.length, 2);
    assert.ok(calls[1].messages.every((m) => m.type === 'text'));
    assert.match(calls[1].messages.map((m) => m.text).join('\n'), /25 คน.*590/);
    assert.ok(calls[1].messages.at(-1).quickReply);
  } finally { globalThis.fetch = realFetch; console.error = realErr; }
});
