// Webhook ของ LINE OA @esimpayroll — https://esimpayroll.com/api/line-webhook
// ตอบด้วย reply message เท่านั้น (ฟรี ไม่นับโควตาข้อความรายเดือนของ LINE OA)
// ตั้งค่าใน Vercel → Settings → Environment Variables:
//   LINE_CHANNEL_SECRET        — ใช้ตรวจลายเซ็นว่าคำขอมาจาก LINE จริง
//   LINE_CHANNEL_ACCESS_TOKEN  — ใช้ส่งข้อความตอบกลับ
import crypto from 'node:crypto';
import { answer } from './_bot.mjs';

const readRaw = (req) => new Promise((resolve, reject) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => resolve(Buffer.concat(chunks)));
  req.on('error', reject);
});

function validSignature(raw, sig, secret) {
  if (!sig || !secret) return false;
  const mac = crypto.createHmac('sha256', secret).update(raw).digest();
  const got = Buffer.from(sig, 'base64');
  return got.length === mac.length && crypto.timingSafeEqual(got, mac);
}

async function reply(replyToken, messages) {
  const r = await fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}` },
    body: JSON.stringify({ replyToken, messages }),
  });
  if (!r.ok) console.error('LINE reply', r.status, await r.text());
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(200).send('ok'); // ให้ปุ่ม Verify ใน LINE Console ผ่าน
  const raw = await readRaw(req);
  if (!validSignature(raw, req.headers['x-line-signature'], process.env.LINE_CHANNEL_SECRET)) return res.status(401).send('bad signature');
  let body;
  try { body = JSON.parse(raw.toString('utf8')); } catch { return res.status(400).send('bad json'); }
  // serverless: ต้องตอบ LINE ให้เสร็จก่อนจบ request
  await Promise.all((body.events || []).map(async (ev) => {
    if (!ev.replyToken) return;
    // ตอบเฉพาะแชตส่วนตัว — ในกลุ่มเงียบ ไม่รบกวนบทสนทนา
    if (ev.source?.type && ev.source.type !== 'user') return;
    try {
      if (ev.type === 'follow') return await reply(ev.replyToken, answer('สวัสดี'));
      if (ev.type === 'message' && ev.message?.type === 'text') return await reply(ev.replyToken, answer(ev.message.text));
    } catch (e) { console.error('bot', e); }
  }));
  res.status(200).send('ok');
}
