// Webhook ของ LINE OA @esimpayroll — https://esimpayroll.com/api/line-webhook
// ตอบด้วย reply message เท่านั้น (ฟรี ไม่นับโควตาข้อความรายเดือนของ LINE OA)
// ตั้งค่าใน Vercel → Settings → Environment Variables:
//   LINE_CHANNEL_SECRET        — ใช้ตรวจลายเซ็นว่าคำขอมาจาก LINE จริง
//   LINE_CHANNEL_ACCESS_TOKEN  — ใช้ส่งข้อความตอบกลับ
import crypto from 'node:crypto';
import { answer, answerMedia, isGreeting, silenced } from './_bot.mjs';

const API = 'https://api.line.me/v2/bot';
const auth = () => ({ Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}` });

// ---------- ความจำบทสนทนา ----------
// มี SUPABASE_SERVICE_ROLE_KEY → เก็บในตาราง line_bot_memory (sql/29) จำได้แน่นอนข้ามการรีสตาร์ต
// ไม่มี → เก็บในหน่วยความจำของฟังก์ชัน (หายเมื่อเซิร์ฟเวอร์เริ่มใหม่)
const SB_URL = process.env.SUPABASE_URL || 'https://sfzzswzyoqshlppsturd.supabase.co';
const SB_KEY = () => process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const MEM_TTL = 24 * 60 * 60 * 1000;
const sb = (path, init = {}) => fetch(`${SB_URL}/rest/v1/${path}`, {
  ...init, headers: { apikey: SB_KEY(), Authorization: `Bearer ${SB_KEY()}`, 'Content-Type': 'application/json', ...init.headers },
});
const LOCAL = new Map();
async function loadMem(uid) {
  if (SB_KEY()) {
    try {
      const r = await sb(`line_bot_memory?user_id=eq.${encodeURIComponent(uid)}&select=mem,updated_at`);
      const [row] = r.ok ? await r.json() : [];
      if (row && Date.now() - Date.parse(row.updated_at) < MEM_TTL) return { ...row.mem };
      return {};
    } catch { /* ใช้ความจำในเครื่องแทน */ }
  }
  const m = LOCAL.get(uid);
  return m && Date.now() - m.at < MEM_TTL ? { ...m.mem } : {};
}
async function saveMem(uid, mem) {
  LOCAL.set(uid, { mem, at: Date.now() });
  if (!SB_KEY()) return;
  try {
    await sb('line_bot_memory', {
      method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ user_id: uid, mem, updated_at: new Date().toISOString() }),
    });
    if (Math.random() < 0.02) await sb('rpc/line_bot_memory_cleanup', { method: 'POST', body: '{}' }); // เก็บกวาดเป็นครั้งคราว
  } catch (e) { console.error('memory', e.message); }
}
// บันทึกคำถามที่บอทตอบไม่ได้ (none) หรือได้แค่แนะนำบทความ (weak) → ดูใน Supabase เพื่อเพิ่มคำตอบ
async function logMiss(uid, text, kind) {
  console.log('bot-miss', kind, text.slice(0, 200)); // เห็นใน Vercel Logs ด้วย
  if (!SB_KEY()) return;
  try {
    await sb('line_bot_unanswered', {
      method: 'POST', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ user_id: uid || null, question: text.slice(0, 500), kind }),
    });
  } catch (e) { console.error('miss-log', e.message); }
}

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

async function post(path, body) {
  const r = await fetch(API + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...auth() }, body: JSON.stringify(body) });
  if (!r.ok) console.error('LINE', path, r.status, await r.text());
  return r.ok;
}
// ส่งคำตอบ — ถ้า LINE ไม่รับการ์ด Flex (เช่นรูปแบบผิด) ให้ส่งซ้ำเป็นข้อความธรรมดาแทน ลูกค้าจะไม่เจอบอทเงียบ
// (replyToken ที่ถูกปฏิเสธยังไม่ถูกใช้ จึงส่งซ้ำได้)
async function sendReply(replyToken, messages) {
  if (await post('/message/reply', { replyToken, messages })) return;
  if (!messages.some((m) => m.type === 'flex')) return;
  const plain = messages.map((m) => (m.type === 'flex' ? { type: 'text', text: m.altText, quickReply: m.quickReply } : m));
  await post('/message/reply', { replyToken, messages: plain });
}
// ชื่อในโปรไฟล์ LINE (ฟรี) — ใช้ทักทายด้วยชื่อ
async function displayName(uid) {
  try {
    const r = await fetch(`${API}/profile/${uid}`, { headers: auth() });
    return r.ok ? (await r.json()).displayName || '' : '';
  } catch { return ''; }
}
// จุด ๆ ๆ "กำลังพิมพ์" (ฟรี ใช้ได้เฉพาะแชตส่วนตัว) แล้วรอสั้น ๆ ให้จังหวะเหมือนคนพิมพ์
const typing = (uid) => post('/chat/loading/start', { chatId: uid, loadingSeconds: 5 }).catch(() => {});
const pause = (msgs) => new Promise((r) => setTimeout(r, Math.min(1600, 500 + msgs.reduce((n, m) => n + (m.text || '').length, 0) * 2)));

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
    const uid = ev.source?.userId;
    try {
      let msgs;
      if (ev.type === 'follow') {
        msgs = answer('สวัสดี', { name: uid ? await displayName(uid) : '' });
      } else if (ev.type === 'message') {
        const text = ev.message?.type === 'text' ? ev.message.text : '';
        const mem = uid ? await loadMem(uid) : {};
        const before = JSON.stringify(mem);
        // ลูกค้าขอคุยกับแอดมินอยู่ → บอทเงียบ ไม่ตอบแทรก (แอดมินตอบเองในหน้าแชต)
        if (silenced(text, mem)) return;
        if (uid) await typing(uid);
        if (ev.message?.type === 'text') {
          const name = uid && isGreeting(text) ? await displayName(uid) : '';
          const ctx = { name, mem };
          msgs = answer(text, ctx);
          if (ctx.miss) await logMiss(uid, text, ctx.miss);
        } else {
          msgs = answerMedia(ev.message?.type);
        }
        if (uid && JSON.stringify(mem) !== before) await saveMem(uid, mem);
        await pause(msgs);
      }
      if (msgs) await sendReply(ev.replyToken, msgs);
    } catch (e) { console.error('bot', e); }
  }));
  res.status(200).send('ok');
}
