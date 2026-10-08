// สมองของบอท LINE @esimpayroll — ตอบจากคลังความรู้ที่สร้างจากเว็บ (api/_kb.json)
// ฟรี 100%: ไม่เรียก AI ภายนอก จับคู่คำถามด้วยการตัดคำภาษาไทย (Intl.Segmenter) ในตัว Node
// ตอบแบบคนคุย: แบ่งเป็นบับเบิลสั้น ๆ สลับคำขึ้นต้น รับมุกคุยเล่น และจำบริบทล่าสุด (ctx.mem)
import fs from 'node:fs';

const KB = JSON.parse(fs.readFileSync(new URL('./_kb.json', import.meta.url), 'utf8'));
const SITE = 'https://esimpayroll.com';
const MAX_TEXT = 4800; // LINE จำกัด 5,000 ตัวอักษรต่อข้อความ
const SHORT = 170;     // ตัดคำตอบยาวจากเว็บให้เหลือราวนี้ แล้วให้ลิงก์อ่านต่อ
const baht = (n) => n.toLocaleString('en-US');
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// ---------- ตัดคำ + คำพ้อง ----------
const seg = new Intl.Segmenter('th', { granularity: 'word' });
const SYN = [
  [/ปกส\.?|sso/gi, ' ประกันสังคม '], [/โอที|ค่าล่วงเวลา|ทำงานล่วงเวลา/gi, ' ot '],
  [/ภงด\.?\s*1|ภ\.ง\.ด\.\s*1/gi, ' ภงด1 '], [/50\s*ทวิ|ห้าสิบทวิ/gi, ' 50ทวิ '],
  [/สลิป|payslip/gi, ' สลิป '], [/ทดลองใช้|ทดลอง|trial/gi, ' ทดลอง '],
  [/ราคา|ค่าบริการ|price/gi, ' ราคา '], [/เท่าไร|เท่าไหร่|กี่บาท/gi, ' เท่าไหร่ '],
  [/สแกนหน้า|สแกนใบหน้า|face/gi, ' สแกนใบหน้า '], [/เช็คอิน|check-?in|ตอกบัตร/gi, ' ลงเวลา '],
];
const STOP = new Set(['เท่าไหร่', 'ไหร่', 'กี่', 'ที่', 'และ', 'หรือ', 'ได้', 'มี', 'เป็น', 'การ', 'ให้', 'ของ', 'ครับ', 'ค่ะ', 'คะ', 'นะ', 'จ้า', 'ช่วย', 'หน่อย', 'อยู่', 'แล้ว', 'เลย', 'ไหม', 'มั้ย', 'ยังไง', 'อย่างไร', 'อะไร', 'บ้าง', 'คือ', 'จะ', 'ต้อง', 'ใน', 'กับ', 'ก็', 'นี้', 'ไป', 'มา', 'ล่ะ', 'ยัง', 'ไง', 'esimpayroll', 'esim', 'payroll', 'โปรแกรม', 'ระบบ']);
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
// แต่ละ FAQ จับคู่ได้ทั้งคำถามบนเว็บและคำถามแบบอื่น (alias คั่นด้วย |) — ให้คะแนนแยกแต่ละแบบ แล้วเอาแบบที่ตรงที่สุด
const FAQ = KB.faq.map((f) => ({ ...f, wqs: [f.q, ...(f.alias ? f.alias.split('|') : [])].map(words), wa: words(f.a) }));
const ART = KB.articles.map((a) => ({ ...a, wt: words(a.t), wd: words(a.d) }));

// ---------- ข้อความ ----------
const B = {
  price: ['💰 ราคา'], trial: ['🎁 ทดลองฟรี'], feat: ['✨ ทำอะไรได้บ้าง'], face: ['📱 สแกนหน้าลงเวลา'],
  tax: ['🧮 คำนวณภาษี'], admin: ['👩‍💼 คุยกับแอดมิน'], prem: ['💎 พรีเมียมมีอะไร'], year: ['📅 จ่ายรายปีล่ะ'],
  sso: ['🏥 ประกันสังคม'], ot: ['⏰ คิด OT ยังไง'],
};
const MENU = [B.price, B.trial, B.feat, B.face, B.tax, B.admin];
const quick = (items) => ({
  items: items.map(([label, text]) => ({ type: 'action', action: { type: 'message', label, text: text || label } })),
});
const clip = (s) => (s.length > MAX_TEXT ? s.slice(0, MAX_TEXT - 1) + '…' : s);
// ชุดบับเบิล (สูงสุด 5) — ปุ่มลัดติดที่บับเบิลสุดท้ายเท่านั้น (LINE แสดงเฉพาะอันสุดท้าย)
// แต่ละรายการเป็นข้อความ (string) หรือ LINE message ที่สร้างไว้แล้ว (เช่น การ์ด Flex)
function reply(texts, buttons = MENU) {
  const msgs = texts.filter(Boolean).slice(0, 5).map((x) => (typeof x === 'string' ? { type: 'text', text: clip(x) } : x));
  msgs[msgs.length - 1].quickReply = quick(buttons);
  return msgs;
}
// ตัดย่อหน้ายาวให้เหลือ 1-2 ประโยคแรก (ภาษาไทยเว้นวรรคระหว่างประโยค) ไม่ตัดกลางคำ
// ไม่จบท่อนด้วยคำเชื่อมที่ทำให้ประโยคค้าง (เช่น "จะหัก …")
const DANGLING = /(\d[\d,.]*|เงินเดือน|ลา|คือ|จะ\S*|เท่ากับ|ได้|หัก|=|เช่น|และ|แต่|โดย|ดังนั้น|ส่วน|ถ้า|หาก|ซึ่ง|ที่|กับ|ของ|ใน)$/;
export function shorten(s, max = SHORT) {
  if (s.length <= max) return s;
  // มีตัวอย่าง ("เช่น") ช่วงต้น → เอาเฉพาะใจความก่อนตัวอย่าง
  const ex = s.indexOf(' เช่น ');
  if (ex >= 60 && ex <= max + 40) return s.slice(0, ex) + ' …';
  const parts = [];
  for (const part of s.split(' ')) {
    if (parts.length && (parts.join(' ') + ' ' + part).length > max) break;
    parts.push(part);
  }
  while (parts.length > 1 && DANGLING.test(parts.at(-1))) parts.pop();
  return parts.join(' ').replace(/[,،\s]+$/, '') + ' …';
}

const OPEN = ['ได้เลยครับ 😊', 'ตอบให้ตามนี้ครับ', 'เรื่องนี้น้อง eSim ช่วยได้ครับ 👍', 'สรุปสั้น ๆ ให้นะครับ', 'ตามนี้เลยครับ'];
const MORE = ['อ่านรายละเอียดเต็มได้ที่นี่ครับ 👇', 'ถ้าอยากอ่านละเอียด กดลิงก์นี้ได้เลยครับ 👇', 'มีตัวอย่างคำนวณเต็ม ๆ ในบทความนี้ครับ 👇'];
const HOURS = 'จ.–ศ. 09.00–18.00 น.';

function tierFor(n, list) { return list.find((t) => n >= t.min && (t.max == null || n <= t.max)); }

// ---------- การ์ด Flex (สีแบรนด์: กรมท่า #0e3a5c · เขียว #10b981) ----------
const C = { navy: '#0e3a5c', green: '#10b981', mint: '#eaf6f1', gray: '#64748b', line: '#e2e8f0' };
const T = (text, o = {}) => ({ type: 'text', text, wrap: true, ...o });
const msgBtn = (label, text, o = {}) => ({ type: 'button', height: 'sm', action: { type: 'message', label, text: text || label }, ...o });
const uriBtn = (label, uri, o = {}) => ({ type: 'button', height: 'sm', style: 'primary', color: C.green, action: { type: 'uri', label, uri }, ...o });
const flex = (altText, contents) => ({ type: 'flex', altText, contents });
const header = (title, sub) => ({
  type: 'box', layout: 'vertical', backgroundColor: C.navy, paddingAll: '16px', spacing: '2px',
  contents: [T(title, { color: '#ffffff', weight: 'bold', size: 'lg' }), ...(sub ? [T(sub, { color: '#a7f3d0', size: 'sm' })] : [])],
});
const TRIAL_URL = `${SITE}/pricing`;

// การ์ดเมนูหลัก (ทักทาย / เพิ่มเพื่อน)
const MENU_CARD = () => flex('เมนูน้อง eSim: ราคา · ทดลองฟรี · ฟีเจอร์ · คุยกับแอดมิน', {
  type: 'bubble', size: 'kilo',
  header: {
    type: 'box', layout: 'horizontal', backgroundColor: C.navy, paddingAll: '14px', alignItems: 'center',
    contents: [
      { type: 'box', layout: 'vertical', flex: 3, spacing: '2px', contents: [
        T('น้อง eSim', { color: '#ffffff', weight: 'bold', size: 'xl' }),
        T('ผู้ช่วยตอบคำถาม eSimPayroll', { color: '#a7f3d0', size: 'xs' }),
        T('ตอบได้ 24 ชม. 🤖', { color: '#cbd5e1', size: 'xxs' })] },
      { type: 'image', url: `${SITE}/media/esim/e2c.png`, flex: 2, size: 'full', aspectMode: 'fit', aspectRatio: '1:1' },
    ],
  },
  body: { type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: '12px', contents: [
    T('อยากรู้อะไร กดได้เลยครับ 👇', { size: 'sm', color: C.gray }),
    msgBtn('💰 ดูราคา', 'ราคา', { style: 'secondary' }),
    msgBtn('✨ ทำอะไรได้บ้าง', 'ทำอะไรได้บ้าง', { style: 'secondary' }),
    msgBtn('📱 สแกนหน้าลงเวลา', 'สแกนหน้าลงเวลา', { style: 'secondary' }),
    msgBtn('👩‍💼 คุยกับแอดมิน', 'คุยกับแอดมิน', { style: 'secondary' }),
  ] },
  footer: { type: 'box', layout: 'vertical', paddingAll: '12px', contents: [uriBtn('🎁 ทดลองฟรี 30 วัน', TRIAL_URL)] },
});

const planRow = (name, sub, price, unit, hl) => ({
  type: 'box', layout: 'horizontal', paddingAll: '12px', cornerRadius: '10px', alignItems: 'center',
  backgroundColor: hl ? C.mint : '#f8fafc', borderColor: hl ? C.green : C.line, borderWidth: '1px',
  contents: [
    { type: 'box', layout: 'vertical', flex: 3, contents: [T(name, { weight: 'bold', color: C.navy }), T(sub, { size: 'xxs', color: C.gray })] },
    { type: 'box', layout: 'vertical', flex: 2, contents: [T(price, { weight: 'bold', size: 'lg', align: 'end', color: hl ? C.green : C.navy }), T(unit, { size: 'xxs', align: 'end', color: C.gray })] },
  ],
});

function priceReply(n, focus) {
  const ym = KB.yearMonths, free = 12 - ym;
  if (!n) {
    const row = (t) => ({ type: 'box', layout: 'horizontal', contents: [
      T(t.max == null ? `${t.min}+ คน` : `${t.min}-${t.max} คน`, { size: 'sm', flex: 3, color: C.navy }),
      T(t.price == null ? 'ขอใบเสนอราคา' : t.price ? baht(t.price) : 'ฟรี', { size: 'sm', flex: t.price == null ? 6 : 3, align: 'end', weight: 'bold', color: t.price === 0 ? C.green : C.navy }),
      ...(t.price == null ? [] : [T(baht(t.prem), { size: 'sm', flex: 3, align: 'end', color: C.gray })]),
    ] });
    const firm = KB.firm.find((x) => x.price != null);
    const card = flex('ราคา eSimPayroll คิดตามจำนวนพนักงาน 1-10 คนฟรี', {
      type: 'bubble', header: header('💰 ราคาตามจำนวนพนักงาน', 'บาท / เดือน'),
      body: { type: 'box', layout: 'vertical', spacing: 'sm', contents: [
        { type: 'box', layout: 'horizontal', contents: [T('พนักงาน', { size: 'xs', flex: 3, color: C.gray }), T('มาตรฐาน', { size: 'xs', flex: 3, align: 'end', color: C.gray }), T('พรีเมียม', { size: 'xs', flex: 3, align: 'end', color: C.gray })] },
        { type: 'separator', color: C.line },
        ...KB.tiers.map(row),
        { type: 'separator', color: C.line, margin: 'md' },
        ...(firm ? [T(`🏦 สำนักงานบัญชี (หลายบริษัท) เริ่ม ${baht(firm.price)} บาท/เดือน`, { size: 'xs', color: C.gray })] : []),
        T(`📅 จ่ายรายปีคิดแค่ ${ym} เดือน (ฟรี ${free} เดือน)`, { size: 'xs', color: C.gray }),
      ] },
      footer: { type: 'box', layout: 'vertical', spacing: 'sm', contents: [uriBtn('🎁 ทดลองฟรี 30 วัน', TRIAL_URL), msgBtn('💎 พรีเมียมมีอะไร', 'พรีเมียมมีอะไร')] },
    });
    return reply([card, 'บริษัทมีพนักงานกี่คนครับ? พิมพ์มาได้เลย เช่น "25 คน" เดี๋ยวคิดให้ 😊'], [B.prem, B.trial, B.admin]);
  }
  const t = tierFor(n, KB.tiers);
  if (!t || t.price == null) {
    return reply([`${n} คน เป็นองค์กรขนาดใหญ่ เราทำใบเสนอราคาพิเศษให้ พร้อมช่วยตั้งค่าเริ่มต้นครับ 🙌`,
      `กด "คุยกับแอดมิน" ได้เลย แอดมินจะติดต่อกลับใน${HOURS}`], [B.admin, B.trial]);
  }
  const year = focus === 'year';
  const mul = year ? ym : 1, unit = year ? 'บาท / ปี' : 'บาท / เดือน';
  const std = t.price ? baht(t.price * mul) : 'ฟรี';
  const card = flex(`พนักงาน ${n} คน: มาตรฐาน ${std}${t.price ? ' บาท' : ''} · พรีเมียม ${baht(t.prem * mul)} บาท${year ? '/ปี' : '/เดือน'}`, {
    type: 'bubble',
    header: header(`พนักงาน ${n} คน`, `ช่วง ${t.min}-${t.max} คน · ${year ? `จ่ายรายปี (ฟรี ${free} เดือน)` : 'จ่ายรายเดือน'}`),
    body: { type: 'box', layout: 'vertical', spacing: 'md', contents: [
      planRow('มาตรฐาน', 'เงินเดือน ภาษี ปกส. เอกสารราชการครบ', std, t.price ? unit : 'ตลอดไป', !t.price),
      planRow('💎 พรีเมียม', 'เพิ่มสแกนหน้าลงเวลา ลางาน กะ OT', baht(t.prem * mul), unit, !!t.price),
      T(year ? `เทียบรายเดือน: ${t.price ? baht(t.price) + ' / ' : ''}${baht(t.prem)} บาท/เดือน`
        : `จ่ายรายปีเหลือ ${t.price ? baht(t.price * ym) + ' / ' : ''}${baht(t.prem * ym)} บาท (ฟรี ${free} เดือน)`, { size: 'xs', color: C.gray }),
    ] },
    footer: { type: 'box', layout: 'vertical', spacing: 'sm', contents: [
      uriBtn('🎁 ทดลองฟรี 30 วัน', TRIAL_URL),
      T('ครบทุกฟีเจอร์ ไม่ต้องใช้บัตรเครดิต', { size: 'xxs', color: C.gray, align: 'center' }),
    ] },
  });
  return reply([`ได้เลยครับ คิดให้แล้ว 👇`, card], year ? [B.prem, B.trial, B.admin] : [B.prem, B.year, B.trial, B.admin]);
}

const PREMIUM_ITEMS = [['📱', 'สแกนหน้า + GPS ลงเวลาผ่านมือถือ'], ['⏰', 'เวลาเข้างาน สรุปมาสาย/ขาด'], ['🌴', 'ลางานผ่านมือถือ + สายอนุมัติ'],
  ['🔄', 'ระบบกะ หมุนกะอัตโนมัติ'], ['⚡', 'อนุมัติ OT รายวัน'], ['📅', 'ปฏิทินวันหยุดบริษัท'], ['💸', 'เบิกจ่ายล่วงหน้า']];
const PREMIUM = () => reply([flex('แพ็กเกจพรีเมียม: ' + PREMIUM_ITEMS.map((x) => x[1]).join(' · '), {
  type: 'bubble', header: header('💎 แพ็กเกจพรีเมียม', 'ได้ทุกอย่างของมาตรฐาน + เพิ่มอีก 7 ระบบ'),
  body: { type: 'box', layout: 'vertical', spacing: 'sm', contents: PREMIUM_ITEMS.map(([i, s]) => ({
    type: 'box', layout: 'horizontal', spacing: 'md', contents: [T(i, { flex: 0, size: 'sm' }), T(s, { size: 'sm', color: C.navy })] })) },
  footer: { type: 'box', layout: 'vertical', spacing: 'sm', contents: [uriBtn('🎁 ทดลองฟรี 30 วัน', TRIAL_URL), msgBtn('💰 ดูราคา', 'ราคา'), {
    type: 'button', height: 'sm', action: { type: 'uri', label: 'ดูฟีเจอร์ทั้งหมด', uri: `${SITE}/features` } }] },
})], [B.price, B.face, B.trial, B.admin]);

// ---------- คุยเล่น / มารยาท ----------
const SMALL = [
  [/ขอบคุณ|ขอบใจ|ขอบคุน|thank|thx|ty\b/i, (c) => [pick([`ยินดีครับ${c.name ? 'คุณ' + c.name : ''} 😊`, 'ด้วยความยินดีครับ 🙏', 'ยินดีเสมอครับ 😊']) + ' มีอะไรสงสัยเพิ่มพิมพ์มาได้ตลอดเลยนะครับ']],
  [/^(ok|okay|โอเค|โอเคร|โอเช|ได้ครับ|ได้ค่ะ|ครับ+|ค่ะ|คับ|จ้า|อืม+|เข้าใจแล้ว|รับทราบ|เค|👍|🙏)[!.\s]*$/i, () => [pick(['รับทราบครับ 👍', 'ได้เลยครับ 😊', 'โอเคครับ 👌']) + ' ถ้าสงสัยตรงไหนพิมพ์มาได้เลยนะครับ']],
  [/^(5{3,}|ฮ่า+|haha|lol|😂|🤣|😆)/i, () => [pick(['😄', 'ฮ่า ๆ 😆', '😁'])]],
  [/บาย|ไว้คุยกันใหม่|ไปก่อน|ฝันดี|bye/i, () => ['ขอบคุณที่ทักมานะครับ 🙏 มีอะไรทักน้อง eSim ได้ตลอด 24 ชม. เลยครับ']],
  [/(เป็น|คุณ|นี่)?\s*(บอท|bot|ai|เอไอ|หุ่นยนต์)|คนจริง|คนตอบ/i, () => ['ผมเป็นผู้ช่วยตอบอัตโนมัติชื่อน้อง eSim ครับ 🤖', `ถ้าอยากคุยกับคน กด "คุยกับแอดมิน" ได้เลย แอดมินตอบใน${HOURS}`]],
  [/แพง|แพงไป|แพงจัง|ลดได้ไหม|ส่วนลด|โปรโมชั่น|โปร\b/i, () => [
    'เข้าใจเลยครับ 🙏 บอกไว้ก่อนว่าพนักงาน 1-10 คนใช้แพ็กเกจมาตรฐานได้ฟรีตลอด และจ่ายรายปีได้ฟรีอีก 2 เดือน',
    `ลองใช้ฟรี 30 วันก่อนตัดสินใจได้นะครับ ถ้าอยากคุยเรื่องราคาพิเศษ กด "คุยกับแอดมิน" ได้เลย 😊`]],
];

// ---------- ค้นคำตอบ ----------
// เลือก FAQ ที่ตรงที่สุด: ต้องครอบคลุมคำในคำถามผู้ใช้ไม่น้อยกว่าครึ่ง (กันตอบมั่วเมื่อถามนอกเรื่อง)
// และให้คะแนนคำถาม FAQ ที่สั้นและตรงสูงกว่าคำถามยาวที่มีคำเดียวกันบังเอิญ
function bestFaq(q) {
  const ql = len(q);
  if (!ql) return null;
  let best = null;
  for (const f of FAQ) for (const wq of f.wqs) {
    const sq = hit(q, wq);
    if (sq < 3) continue;
    const used = new Set([...q].filter((w) => wq.has(w) || f.wa.has(w)));
    const cover = len(used) / ql;
    if (cover < 0.5 || sq / ql < 0.35) continue;
    const s = sq * 3 * (0.5 + sq / len(wq)) + hit(q, f.wa) * 0.5 + cover * 10;
    if (!best || s > best.s) best = { f, s };
  }
  return best && best.s >= 12 ? best.f : null;
}
function topArticles(q, n = 3) {
  const ql = len(q);
  return ART.map((a) => ({ a, s: hit(q, a.wt) * 2 + hit(q, a.wd), c: len(new Set([...q].filter((w) => a.wt.has(w) || a.wd.has(w)))) / (ql || 1) }))
    .filter((x) => x.s >= 6 && x.c >= 0.5).sort((x, y) => y.s - x.s).slice(0, n).map((x) => x.a);
}
// ปุ่มถามต่อตามหัวข้อ
function topicButtons(q) {
  if (q.has('ประกันสังคม')) return [B.ot, B.tax, B.price, B.admin];
  if (q.has('ot')) return [B.sso, B.tax, B.price, B.admin];
  if (q.has('ภาษี') || q.has('ภงด1') || q.has('50ทวิ')) return [B.tax, B.sso, B.price, B.admin];
  return [B.price, B.trial, B.feat, B.admin];
}

// ---------- ส่งต่อแอดมิน ----------
// หลังลูกค้าขอคุยกับแอดมิน บอทเงียบ 2 ชม. ไม่ตอบแทรกระหว่างแอดมินคุย — พิมพ์ "เมนู" เพื่อกลับมาคุยกับบอท
export const HANDOFF_MS = 2 * 60 * 60 * 1000;
const RESUME = /^[^\p{L}\p{N}]*(เมนู|menu|คุยกับบอท|บอท|น้อง ?esim|เริ่มใหม่|start)/iu;
export function silenced(raw, mem = {}, now = Date.now()) {
  if (!mem.handoff) return false;
  if (mem.handoff <= now || RESUME.test(raw || '')) { delete mem.handoff; return false; }
  return true;
}

export const isGreeting = (s) => /^[^\p{L}\p{N}]*(สวัสดี|หวัดดี|ดีครับ|ดีค่ะ|ดีจ้า|hello|hi\b|เมนู|menu|เริ่ม|start)/iu.test(s || '');

/**
 * ตอบ 1 ข้อความ — คืน array ของ LINE message (สูงสุด 5)
 * ctx.name = ชื่อในโปรไฟล์ LINE (ถ้ามี) · ctx.mem = ความจำของแชตนี้ (บอทอ่าน/เขียนเอง เช่นจำนวนพนักงานล่าสุด)
 */
export function answer(raw, ctx = {}) {
  const mem = ctx.mem || {};
  const text = (raw || '').trim();
  const t = text.replace(/^[^\p{L}\p{N}]+/u, ''); // ตัดอีโมจิหน้าปุ่ม quick reply
  const hi = ctx.name ? `สวัสดีครับคุณ${ctx.name} 😊` : 'สวัสดีครับ 😊';

  if (!t || isGreeting(text)) {
    return reply([`${hi} ผมน้อง eSim ผู้ช่วยของ eSimPayroll เองครับ\nพิมพ์ถามได้เลย เช่น "พนักงาน 25 คน ราคาเท่าไหร่" หรือกดจากการ์ดนี้ก็ได้ 👇`, MENU_CARD()]);
  }
  if (/แอดมิน|admin|เจ้าหน้าที่|คุยกับคน|ติดต่อ(คน|พนักงาน)|ขอคุย|โทรหา/i.test(t)) {
    mem.handoff = Date.now() + HANDOFF_MS;
    return reply(['ได้เลยครับ 🙌 ส่งเรื่องให้แอดมินแล้ว เดี๋ยวแอดมินเข้ามาตอบในแชตนี้นะครับ',
      `แอดมินตอบใน${HOURS} ภายใน 1 วันทำการ พิมพ์รายละเอียดทิ้งไว้ได้เลย น้อง eSim จะเงียบไว้ไม่ตอบแทรกครับ\nถ้าอยากกลับมาคุยกับน้อง eSim พิมพ์ "เมนู" ได้ตลอด`], [['📋 เมนู']]);
  }
  for (const [re, fn] of SMALL) if (re.test(t)) return reply(fn(ctx), topicButtons(new Set()));

  const q = words(t);
  const n = Number((t.match(/(\d{1,5})\s*(คน|ท่าน|ตำแหน่ง)/) || [])[1] || 0);
  if (n) mem.n = n;

  // ถามต่อจากเรื่องราคา: "แล้วพรีเมียมล่ะ" "รายปีล่ะ"
  const short = t.length <= 25;
  if (/พรีเมียม|พรีเมี่ยม|premium/i.test(t) && /ได้อะไร|มีอะไร|ต่างกัน|เพิ่ม/.test(t)) { mem.topic = 'price'; return PREMIUM(); }
  if (short && /รายปี|ทั้งปี|จ่ายปี/.test(t) && (mem.topic === 'price' || n)) { mem.topic = 'price'; return priceReply(n || mem.n || 0, (n || mem.n) ? 'year' : undefined); }
  if (short && /^(แล้ว)?\s*(พรีเมียม|พรีเมี่ยม|มาตรฐาน)/.test(t) && mem.topic === 'price' && mem.n) return priceReply(mem.n);

  // ถามราคา: มีคำว่าราคา/แพ็กเกจ และไม่มีหัวข้ออื่นปน (กัน "ราคาทอง" หรือ "ปกส หักเท่าไหร่")
  const PRICE_OK = new Set(['ราคา', 'แพ็กเกจ', 'แพคเกจ', 'package', 'เดือน', 'ปี', 'รายปี', 'รายเดือน', 'ต่อ', 'คน', 'พนักงาน', 'บริษัท', 'ใช้', 'งาน', 'มาตรฐาน', 'พรีเมียม', 'พรีเมี่ยม', 'premium', 'ตอนนี้', 'ถ้า', 'สำหรับ', 'ประมาณ', 'ตัว', 'จ่าย', 'ค่า', 'เท่า', 'ฟรี', 'มี', 'แพ็ก', 'แพค', 'เกจ']);
  const onlyPrice = [...q].every((w) => PRICE_OK.has(w) || /^\d+$/.test(w));
  const bareCount = /^\d{1,5}\s*(คน|ท่าน)\s*(ครับ|ค่ะ|คะ)?$/.test(t);
  if (onlyPrice && (bareCount || q.has('ราคา') || /แพ็กเกจ|แพคเกจ|package|ค่าบริการ|กี่บาท/i.test(t) || (n && /พนักงาน|ฟรี/.test(t)))) {
    mem.topic = 'price';
    return priceReply(n || (q.has('ราคา') && short ? 0 : mem.n || 0));
  }
  if (/^ทำอะไรได้บ้าง|ฟีเจอร์|feature|มีอะไรบ้าง/i.test(t)) {
    mem.topic = 'feat';
    return reply(['eSimPayroll ทำงานเงินเดือนได้ครบจบในที่เดียวครับ ✨\n' +
      '• คำนวณเงินเดือน รายเดือน/รายวัน OT เงินเพิ่ม เงินหัก\n• ภาษีหัก ณ ที่จ่าย ประกันสังคม กองทุนสำรองเลี้ยงชีพ กองทุนสงเคราะห์ลูกจ้าง\n' +
      '• ออกสลิป 50 ทวิ ภ.ง.ด.1 ภ.ง.ด.1ก สปส.1-10 กท.20ก + ส่งออก CSV',
      `ถ้าอยากได้ลงเวลาด้วยสแกนหน้า ลางานผ่านมือถือ หรือระบบกะ จะอยู่ในแพ็กเกจพรีเมียมครับ 👉 ${SITE}/features`], [B.prem, B.price, B.trial, B.admin]);
  }
  if (/คำนวณภาษี|เครื่องคิดภาษี/.test(t) && short) {
    return reply(['มีเครื่องคำนวณภาษีเงินเดือนให้ใช้ฟรีครับ ไม่ต้องสมัคร 🧮',
      `ใส่เงินเดือน โบนัส ค่าลดหย่อน รู้เลยว่าโดนหักเดือนละเท่าไหร่ 👉 ${SITE}/tax-calculator`], [B.sso, B.ot, B.price, B.admin]);
  }

  const f = bestFaq(q);
  if (f) {
    mem.topic = 'faq';
    const a = shorten(f.a);
    const more = topArticles(q, 2).filter((x) => x.url !== f.url);
    const link = (a.endsWith('…') || more.length) ? `${pick(MORE)}\n${f.url}` + (more.length ? '\n\nเรื่องที่เกี่ยวข้อง:\n' + more.map((x) => `• ${x.t}\n${x.url}`).join('\n') : '') : '';
    return reply([`${pick(OPEN)}\n${a}`, link], topicButtons(q));
  }
  const arts = topArticles(q);
  ctx.miss = arts.length ? 'weak' : 'none'; // ให้ webhook บันทึกคำถามที่บอทตอบไม่ได้ / ตอบได้ไม่ตรง
  if (arts.length) {
    return reply(['เรื่องนี้มีบทความอธิบายไว้ละเอียดเลยครับ 📚\n\n' + arts.map((x) => `• ${x.t}\n${x.url}`).join('\n\n'),
      'ถ้ายังไม่ตรงกับที่ถาม กด "คุยกับแอดมิน" ได้เลยนะครับ'], topicButtons(q));
  }
  return reply(['อันนี้น้อง eSim ยังตอบไม่ได้ครับ 🙏 เดี๋ยวแอดมินมาช่วยตอบให้นะครับ' + ` (${HOURS})`,
    'ระหว่างนี้ลองถามเรื่อง ราคา ทดลองฟรี ภาษี ประกันสังคม OT หรือสลิป ได้เลยครับ']);
}

// ข้อความที่ไม่ใช่ตัวอักษร (สติกเกอร์ / รูป / ไฟล์)
export function answerMedia(type) {
  if (type === 'sticker') return reply([pick(['😊', '😄 มีอะไรให้น้อง eSim ช่วยไหมครับ', '🙏'])]);
  if (type === 'image' || type === 'file' || type === 'video') {
    return reply([`ได้รับไฟล์แล้วครับ 📎 แอดมินจะเปิดดูแล้วตอบกลับใน${HOURS}นะครับ`], [B.admin, B.price]);
  }
  return reply(['ตอนนี้น้อง eSim อ่านได้แค่ข้อความตัวอักษรครับ 🙏 พิมพ์ถามมาได้เลยนะครับ']);
}
