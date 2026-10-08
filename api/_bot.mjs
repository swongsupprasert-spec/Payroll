// สมองของบอท LINE @esimpayroll — ตอบจากคลังความรู้ที่สร้างจากเว็บ (api/_kb.json)
// ฟรี 100%: ไม่เรียก AI ภายนอก จับคู่คำถามด้วยการตัดคำภาษาไทย (Intl.Segmenter) ในตัว Node
import fs from 'node:fs';

const KB = JSON.parse(fs.readFileSync(new URL('./_kb.json', import.meta.url), 'utf8'));
const SITE = 'https://esimpayroll.com';
const MAX_TEXT = 4800; // LINE จำกัด 5,000 ตัวอักษรต่อข้อความ
const baht = (n) => n.toLocaleString('en-US');

// ---------- ตัดคำ + คำพ้อง ----------
const seg = new Intl.Segmenter('th', { granularity: 'word' });
const SYN = [
  [/ปกส\.?|sso/gi, ' ประกันสังคม '], [/โอที|ค่าล่วงเวลา|ทำงานล่วงเวลา/gi, ' ot '],
  [/ภงด\.?\s*1|ภ\.ง\.ด\.\s*1/gi, ' ภงด1 '], [/50\s*ทวิ|ห้าสิบทวิ/gi, ' 50ทวิ '],
  [/สลิป|payslip/gi, ' สลิป '], [/ทดลองใช้|ทดลอง|trial/gi, ' ทดลอง '],
  [/ราคา|ค่าบริการ|price/gi, ' ราคา '], [/เท่าไร|เท่าไหร่|กี่บาท/gi, ' เท่าไหร่ '],
  [/สแกนหน้า|สแกนใบหน้า|face/gi, ' สแกนใบหน้า '], [/เช็คอิน|check-?in|ตอกบัตร/gi, ' ลงเวลา '],
];
const STOP = new Set(['เท่าไหร่', 'ไหร่', 'กี่', 'ที่', 'และ', 'หรือ', 'ได้', 'มี', 'เป็น', 'การ', 'ให้', 'ของ', 'ครับ', 'ค่ะ', 'คะ', 'นะ', 'จ้า', 'ช่วย', 'หน่อย', 'อยู่', 'แล้ว', 'เลย', 'ไหม', 'มั้ย', 'ยังไง', 'อย่างไร', 'อะไร', 'บ้าง', 'คือ', 'จะ', 'ต้อง', 'ใน', 'กับ', 'ก็', 'นี้', 'ไป', 'มา', 'esimpayroll', 'esim', 'payroll', 'โปรแกรม', 'ระบบ']);
export function words(s) {
  let x = ' ' + (s || '').toLowerCase() + ' ';
  for (const [re, to] of SYN) x = x.replace(re, to);
  const out = new Set();
  for (const { segment, isWordLike } of seg.segment(x)) {
    const w = segment.trim();
    if (isWordLike && w.length > 1 && !STOP.has(w)) out.add(w);
  }
  return out;
}
const hit = (q, set) => { let s = 0; for (const w of q) if (set.has(w)) s += w.length; return s; };
const len = (set) => { let s = 0; for (const w of set) s += w.length; return s; };

// ดัชนีล่วงหน้า (ตัดคำครั้งเดียวตอนโหลด)
const FAQ = KB.faq.map((f) => ({ ...f, wq: words(f.q), wa: words(f.a) }));
const ART = KB.articles.map((a) => ({ ...a, wt: words(a.t), wd: words(a.d) }));

// ---------- ข้อความตอบ ----------
const quick = (items) => ({
  items: items.map(([label, text]) => ({ type: 'action', action: { type: 'message', label, text: text || label } })),
});
const MENU = quick([['💰 ราคา'], ['🎁 ทดลองฟรี'], ['✨ ทำอะไรได้บ้าง'], ['📱 สแกนหน้าลงเวลา'], ['🧮 คำนวณภาษี'], ['👩‍💼 คุยกับแอดมิน']]);
const msg = (text) => ({ type: 'text', text: text.length > MAX_TEXT ? text.slice(0, MAX_TEXT - 1) + '…' : text, quickReply: MENU });

const HELLO = [
  'สวัสดีครับ ผมน้อง eSim 🤖 ผู้ช่วยตอบคำถามอัตโนมัติของ eSimPayroll',
  'โปรแกรมเงินเดือนออนไลน์ คำนวณภาษี ประกันสังคม ออกสลิป 50 ทวิ ภ.ง.ด.1 ครบ',
  '',
  'พิมพ์ถามได้เลย เช่น',
  '• พนักงาน 25 คน ราคาเท่าไหร่',
  '• ทดลองใช้ฟรีได้ไหม',
  '• ประกันสังคมคิดยังไง',
  '• OT 1.5 เท่า คิดยังไง',
  '',
  'หรือกดปุ่มด้านล่างครับ 👇',
].join('\n');

const ADMIN = [
  '👩‍💼 รับทราบครับ แอดมินจะเข้ามาตอบในแชตนี้',
  'เวลาทำการ จันทร์–ศุกร์ 09.00–18.00 น. ตอบภายใน 1 วันทำการ',
  '',
  'ระหว่างรอ พิมพ์คำถามทิ้งไว้ได้เลยครับ',
  'อีเมล: hello@esimpayroll.com',
].join('\n');

function tierFor(n, list) { return list.find((t) => n >= t.min && (t.max == null || n <= t.max)); }

function priceText(n) {
  const ym = KB.yearMonths;
  const lines = ['💰 ราคา eSimPayroll (คิดตามจำนวนพนักงาน)'];
  if (n) {
    const t = tierFor(n, KB.tiers);
    if (!t || t.price == null) {
      lines.push('', `พนักงาน ${n} คน → ขอใบเสนอราคาพิเศษ พร้อมบริการช่วยตั้งค่าเริ่มต้น`, 'พิมพ์ "คุยกับแอดมิน" ได้เลยครับ');
    } else {
      const range = `${t.min}-${t.max} คน`;
      lines.push('', `พนักงาน ${n} คน อยู่ช่วง ${range}`,
        `• มาตรฐาน: ${t.price ? baht(t.price) + ' บาท/เดือน' : 'ฟรีตลอด 🎉'}`,
        `• พรีเมียม (ลงเวลา/ลา/กะ/OT): ${baht(t.prem)} บาท/เดือน`);
      if (t.price) lines.push(`• จ่ายรายปี: มาตรฐาน ${baht(t.price * ym)} / พรีเมียม ${baht(t.prem * ym)} บาท (ฟรี ${12 - ym} เดือน)`);
      else lines.push(`• พรีเมียมรายปี: ${baht(t.prem * ym)} บาท (ฟรี ${12 - ym} เดือน)`);
    }
  } else {
    lines.push('', 'มาตรฐาน / พรีเมียม ต่อเดือน');
    for (const t of KB.tiers) {
      if (t.price == null) { lines.push(`• ${t.min}+ คน: ขอใบเสนอราคา`); continue; }
      lines.push(`• ${t.min}-${t.max} คน: ${t.price ? baht(t.price) : 'ฟรี'} / ${baht(t.prem)} บาท`);
    }
    const f = KB.firm.filter((x) => x.price != null);
    if (f.length) lines.push('', `🏦 สำนักงานบัญชี (หลายบริษัท พนักงานไม่จำกัด): เริ่ม ${baht(f[0].price)} บาท/เดือน`);
    lines.push('', `จ่ายรายปีคิด ${ym} เดือน (ฟรี ${12 - ym} เดือน)`, 'บอกจำนวนพนักงานมาได้ เช่น "พนักงาน 25 คน" จะคิดให้ครับ');
  }
  lines.push('', '🎁 ทดลองฟรี 30 วัน ครบทุกฟีเจอร์ ไม่ต้องใช้บัตรเครดิต', `${SITE}/pricing`);
  return lines.join('\n');
}

// เลือก FAQ ที่ตรงที่สุด: ต้องครอบคลุมคำในคำถามผู้ใช้ไม่น้อยกว่าครึ่ง (กันตอบมั่วเมื่อถามนอกเรื่อง)
// และให้คะแนนคำถาม FAQ ที่สั้นและตรงสูงกว่าคำถามยาวที่มีคำเดียวกันบังเอิญ
function bestFaq(q) {
  const ql = len(q);
  if (!ql) return null;
  let best = null;
  for (const f of FAQ) {
    const sq = hit(q, f.wq);
    if (sq < 3) continue;
    const used = new Set([...q].filter((w) => f.wq.has(w) || f.wa.has(w)));
    const cover = len(used) / ql;
    if (cover < 0.5 || sq / ql < 0.35) continue;
    const s = sq * 3 * (0.5 + sq / len(f.wq)) + hit(q, f.wa) * 0.5 + cover * 10;
    if (!best || s > best.s) best = { f, s };
  }
  return best && best.s >= 12 ? best.f : null;
}
function topArticles(q, n = 3) {
  const ql = len(q);
  return ART.map((a) => ({ a, s: hit(q, a.wt) * 2 + hit(q, a.wd), c: len(new Set([...q].filter((w) => a.wt.has(w) || a.wd.has(w)))) / (ql || 1) }))
    .filter((x) => x.s >= 6 && x.c >= 0.5).sort((x, y) => y.s - x.s).slice(0, n).map((x) => x.a);
}

// ตอบ 1 ข้อความ — คืน array ของ LINE message (สูงสุด 5)
export function answer(raw) {
  const text = (raw || '').trim();
  const t = text.replace(/^[^\p{L}\p{N}]+/u, ''); // ตัดอีโมจิหน้าปุ่ม quick reply
  if (!t || /^(สวัสดี|หวัดดี|ดีครับ|ดีค่ะ|hello|hi|เมนู|menu|เริ่ม|start)/i.test(t)) return [msg(HELLO)];
  if (/แอดมิน|admin|เจ้าหน้าที่|คุยกับคน|ติดต่อ(คน|พนักงาน)|ขอคุย|โทรหา/i.test(t)) return [msg(ADMIN)];

  const q = words(t);
  const n = Number((t.match(/(\d{1,5})\s*(คน|ท่าน|ตำแหน่ง)/) || [])[1] || 0);
  // ถามราคา: มีคำว่าราคา/แพ็กเกจ และไม่มีหัวข้ออื่นปน (กัน "ราคาทอง" หรือ "ปกส หักเท่าไหร่")
  const PRICE_OK = new Set(['ราคา', 'แพ็กเกจ', 'แพคเกจ', 'package', 'เดือน', 'ปี', 'รายปี', 'รายเดือน', 'ต่อ', 'คน', 'พนักงาน', 'บริษัท', 'ใช้', 'งาน', 'มาตรฐาน', 'พรีเมียม', 'พรีเมี่ยม', 'premium', 'ตอนนี้', 'ถ้า', 'สำหรับ', 'ประมาณ', 'ตัว', 'จ่าย', 'ค่า', 'เท่า', 'ฟรี', 'มี', 'แพ็ก', 'แพค', 'เกจ']);
  const onlyPrice = [...q].every((w) => PRICE_OK.has(w) || /^\d+$/.test(w));
  if (onlyPrice && (q.has('ราคา') || /แพ็กเกจ|แพคเกจ|package|ค่าบริการ|กี่บาท/i.test(t) || (n && /พนักงาน|ฟรี/.test(t)))) return [msg(priceText(n))];
  if (/^ทำอะไรได้บ้าง|ฟีเจอร์|feature|มีอะไรบ้าง/i.test(t)) {
    const f = bestFaq(words('ออกเอกสารอะไรได้บ้าง'));
    return [msg(['✨ eSimPayroll ทำอะไรได้บ้าง',
      '• คำนวณเงินเดือน รายเดือน/รายวัน OT เงินเพิ่ม เงินหัก',
      '• ภาษีหัก ณ ที่จ่าย ประกันสังคม กองทุนสำรองเลี้ยงชีพ กองทุนสงเคราะห์ลูกจ้าง',
      '• ' + (f ? f.a : 'สลิป 50 ทวิ ภ.ง.ด.1 สปส.1-10 กท.20ก'),
      '• พรีเมียม: สแกนหน้า + GPS ลงเวลา, ลางานผ่านมือถือ, กะ/OT, ปฏิทินวันหยุด',
      '', `${SITE}/features`].join('\n'))];
  }
  if (/คำนวณภาษี|เครื่องคิดภาษี/.test(t) && t.length <= 20) {
    return [msg(`🧮 เครื่องคำนวณภาษีเงินเดือน ฟรี ไม่ต้องสมัคร\nใส่เงินเดือน โบนัส ค่าลดหย่อน รู้ทันทีว่าโดนหักเดือนละเท่าไหร่\n${SITE}/tax-calculator`)];
  }

  const f = bestFaq(q);
  if (f) {
    const more = topArticles(q, 2).filter((a) => a.url !== f.url);
    let out = `${f.a}\n\n📖 อ่านเพิ่ม: ${f.url}`;
    if (more.length) out += '\n\nบทความที่เกี่ยวข้อง:\n' + more.map((a) => `• ${a.t}\n  ${a.url}`).join('\n');
    return [msg(out)];
  }
  const arts = topArticles(q);
  if (arts.length) return [msg('📚 บทความที่น่าจะตอบคำถามนี้ได้:\n\n' + arts.map((a) => `• ${a.t}\n  ${a.url}`).join('\n\n') + '\n\nถ้ายังไม่ตรง พิมพ์ "คุยกับแอดมิน" ได้เลยครับ')];
  return [msg('ขอโทษครับ น้อง eSim ยังตอบคำถามนี้ไม่ได้ 🙏\nแอดมินจะเข้ามาตอบในเวลาทำการ (จ.–ศ. 09.00–18.00 น.)\n\nหรือลองถามเรื่อง ราคา, ทดลองฟรี, ภาษี, ประกันสังคม, OT, สลิป ดูครับ')];
}
