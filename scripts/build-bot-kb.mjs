// สร้างคลังความรู้ให้บอท LINE (api/_kb.json) จากเนื้อหาบนเว็บเอง
// - คำถามที่พบบ่อย: FAQPage (JSON-LD) ของทุกหน้า
// - บทความ: title + description + ลิงก์
// - ราคา: ตาราง TIERS / FIRM_TIERS ใน pricing.html
// รันใหม่ทุกครั้งที่แก้ FAQ / บทความ / ราคา:  npm run build:bot
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://esimpayroll.com';
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const strip = (s) => s.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
const meta = (h, name) => (h.match(new RegExp(`<meta name="${name}" content="([^"]*)"`)) || [])[1] || '';
const urlOf = (f) => SITE + (f === 'index.html' ? '/' : '/' + f.replace(/\.html$/, ''));

// หน้าหลักก่อน เพื่อให้คำตอบเรื่องสินค้ามาจากหน้าขาย ไม่ใช่จากบทความ
const PRIORITY = ['index.html', 'pricing.html', 'features.html', 'tax-calculator.html'];
const pages = fs.readdirSync(ROOT)
  .filter((f) => f.endsWith('.html') && (PRIORITY.includes(f) || f.startsWith('article-')))
  .sort((a, b) => (PRIORITY.indexOf(a) + 1 || 99) - (PRIORITY.indexOf(b) + 1 || 99) || a.localeCompare(b));

const faq = [], seen = new Set(), articles = [];
for (const f of pages) {
  const h = read(f);
  for (const m of h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    let j; try { j = JSON.parse(m[1]); } catch { continue; }
    for (const x of [].concat(j['@graph'] || j)) {
      if (x['@type'] !== 'FAQPage') continue;
      for (const q of x.mainEntity || []) {
        const key = strip(q.name);
        if (seen.has(key)) continue;
        seen.add(key);
        faq.push({ q: key, a: strip(q.acceptedAnswer?.text || ''), url: urlOf(f) });
      }
    }
  }
  // FAQ ที่เป็น <details><summary> บนหน้า (เช่น หน้าราคา) ซึ่งไม่ได้อยู่ใน JSON-LD
  for (const [, q, a] of h.matchAll(/<details[^>]*>\s*<summary[^>]*>([\s\S]*?)<\/summary>\s*<p[^>]*>([\s\S]*?)<\/p>/g)) {
    const key = strip(q);
    if (seen.has(key)) continue;
    seen.add(key);
    faq.push({ q: key, a: strip(a), url: urlOf(f) });
  }
  if (f.startsWith('article-')) {
    const title = strip((h.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '').replace(/\s*[—|-]\s*eSimPayroll$/, '');
    articles.push({ t: title, d: meta(h, 'description'), url: urlOf(f) });
  }
}

// คำถามบริการลูกค้า — สรุปจากหน้าติดต่อเรา / การยกเลิกและคืนเงิน / นโยบายความเป็นส่วนตัว
// (หน้าเหล่านี้ไม่มี FAQ ในตัว แก้ข้อความตรงนี้เมื่อเงื่อนไขบนหน้าเว็บเปลี่ยน)
faq.push(
  { q: 'ขอใบเสร็จ ใบกำกับภาษี การชำระเงิน', a: 'เรื่องการชำระเงิน ใบเสร็จ และใบกำกับภาษี ส่งอีเมลมาที่ hello@esimpayroll.com พร้อมระบุชื่อบริษัทและวันที่ทำรายการครับ', url: SITE + '/contact' },
  { q: 'จ่ายเงินช่องทางไหน ชำระเงินยังไง พร้อมเพย์ บัตรเครดิต', a: 'ชำระได้ทั้งพร้อมเพย์ QR และบัตร ระบบเปิดแพ็กเกจให้อัตโนมัติทันทีที่จ่ายสำเร็จ ต่ออายุออนไลน์ได้ที่หน้าแพ็กเกจและราคา', url: SITE + '/pricing' },
  { q: 'ขอคืนเงิน ยกเลิกบริการ', a: 'ยกเลิกได้ทุกเมื่อ ไม่มีสัญญาผูกมัด ใช้งานได้จนครบรอบบิลที่ชำระไว้ เรื่องยกเลิกหรือขอคืนเงินให้ส่งอีเมลมาที่ hello@esimpayroll.com และดูเงื่อนไขได้ที่หน้าการยกเลิกและคืนเงิน', url: SITE + '/refund' },
  { q: 'ข้อมูลปลอดภัยไหม PDPA ข้อมูลส่วนบุคคล', a: 'ข้อมูลเก็บบนคลาวด์ แยกตามบัญชีผู้ใช้ เห็นได้เฉพาะของบริษัทตัวเอง และปฏิบัติตาม พ.ร.บ. คุ้มครองข้อมูลส่วนบุคคล (PDPA) ใช้สิทธิเจ้าของข้อมูลได้ทางอีเมล hello@esimpayroll.com', url: SITE + '/privacy' },
  { q: 'แจ้งปัญหาการใช้งาน ระบบมีปัญหา เจอข้อผิดพลาด', a: 'แจ้งปัญหาการใช้งานทาง LINE นี้หรืออีเมล hello@esimpayroll.com แนบภาพหน้าจอมาด้วยจะช่วยให้แก้ได้เร็วขึ้นครับ ตอบภายใน 1 วันทำการ (จ.–ศ. 09.00–18.00 น.)', url: SITE + '/contact' },
  { q: 'สมัครใช้งาน เริ่มใช้งาน สมัครยังไง', a: 'สมัครและเริ่มทดลองฟรี 30 วันได้ที่เว็บ ใช้ได้ครบทุกฟีเจอร์ ไม่ต้องใช้บัตรเครดิต และมีโหมดตัวอย่างให้ลองกดดูก่อนกรอกข้อมูลจริง', url: SITE + '/app' },
);

// คำถามแบบอื่นที่ลูกค้าพิมพ์บ่อย (คั่นด้วย |) → ผูกกับ FAQ บนเว็บที่ตอบตรงกว่า (ช่วยให้บอทเลือกคำตอบถูก)
const ALIAS = {
  'ประกันสังคมหักเดือนละเท่าไหร่': 'ประกันสังคม|ประกันสังคมคิดยังไง|ปกส หักเท่าไหร่|คำนวณประกันสังคม',
};
for (const f of faq) if (ALIAS[f.q]) f.alias = ALIAS[f.q];

// ตารางราคาจาก pricing.html (แหล่งเดียวกับหน้าเว็บ)
const pr = read('pricing.html');
const tiers = (name) => {
  const body = (pr.match(new RegExp(`const ${name}=\\[([\\s\\S]*?)\\];`)) || [])[1];
  if (!body) throw new Error('ไม่พบ ' + name + ' ใน pricing.html');
  return [...body.matchAll(/\{([^}]*)\}/g)].map(([, s]) => {
    const o = {};
    for (const [, k, v] of s.matchAll(/(\w+):\s*([\w.]+)/g)) o[k] = v === 'null' ? null : v === 'Infinity' ? null : v === 'true' ? true : Number(v);
    return o;
  });
};
const yearMonths = Number((pr.match(/const YEAR_MONTHS=(\d+)/) || [])[1] || 10);

const kb = { built: new Date().toISOString().slice(0, 10), faq, articles, tiers: tiers('TIERS'), firm: tiers('FIRM_TIERS'), yearMonths };
fs.writeFileSync(path.join(ROOT, 'api', '_kb.json'), JSON.stringify(kb));
console.log(`api/_kb.json: FAQ ${faq.length} ข้อ · บทความ ${articles.length} · ราคา ${kb.tiers.length} ระดับ`);
