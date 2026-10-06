// เทมเพลตกลาง: เมนูบน (partials/header.html) + ส่วนท้าย (partials/footer.html)
// ใส่ลงทุกหน้าเว็บสาธารณะ ระหว่างเครื่องหมาย <!--#header ...--> … <!--/header--> และ <!--#footer--> … <!--/footer-->
// หน้าเว็บยังเป็น HTML สมบูรณ์ทุกหน้า (ไม่ต้องโหลดด้วย JS) — Google เห็นเหมือนเดิม
//
// ใช้:  npm run build:partials        แก้ partials/*.html แล้วรันคำสั่งนี้ก่อน deploy
//       npm run build:partials -- --check   ตรวจว่าทุกหน้าตรงกับเทมเพลต (ไม่เขียนไฟล์)
//
// หน้าใหม่: ใส่  <!--#header active="/articles"--><!--/header-->  และ  <!--#footer--><!--/footer-->
//          แล้วรันสคริปต์ เมนูกับส่วนท้ายจะถูกเติมให้เอง (active = ลิงก์เมนูที่ไฮไลต์ หรือเว้นว่าง)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = process.argv.includes('--check');
const HEADER = fs.readFileSync(path.join(ROOT, 'partials/header.html'), 'utf8').trim();
const FOOTER = fs.readFileSync(path.join(ROOT, 'partials/footer.html'), 'utf8').trim();

// หน้าที่ไม่ใช้เทมเพลต: ตัวแอป, หน้าลงเวลา, หน้าทำวิดีโอ/ภาพโปรโมต, หน้าแรก (เมนูต่างจากหน้าอื่น — ใช้แค่ส่วนท้าย)
const SKIP = /^(app|checkin|richmenu-maker|cover14|campaign-free|motion.*)\.html$/;
const NO_HEADER = new Set(['index.html']);

function renderHeader(active) {
  if (!active) return HEADER;
  const out = HEADER.replace(`href="${active}" class="link"`, `href="${active}" class="link active"`);
  if (out === HEADER) throw new Error(`ไม่มีลิงก์เมนู ${active} ใน partials/header.html`);
  return out;
}

let changed = 0, stale = [];
for (const f of fs.readdirSync(ROOT).filter(f => f.endsWith('.html') && !SKIP.test(f)).sort()) {
  const file = path.join(ROOT, f);
  const src = fs.readFileSync(file, 'utf8');
  let html = src;

  // ---- เมนูบน ----
  if (!NO_HEADER.has(f)) {
    if (html.includes('<!--#header')) {
      html = html.replace(/<!--#header(?: active="([^"]*)")?-->[\s\S]*?<!--\/header-->/,
        (m, act) => `<!--#header${act ? ` active="${act}"` : ''}-->\n${renderHeader(act)}\n<!--/header-->`);
    } else if (/<header[\s>]/.test(html)) {          // ครั้งแรก: แปลงเมนูเดิมเป็นเทมเพลต (เก็บลิงก์ที่ไฮไลต์อยู่ไว้)
      html = html.replace(/<header[\s\S]*?<\/header>/, m => {
        const act = (m.match(/href="([^"]+)" class="link active"/) || [])[1] || '';
        return `<!--#header${act ? ` active="${act}"` : ''}-->\n${renderHeader(act)}\n<!--/header-->`;
      });
    }
  }
  // ---- ส่วนท้าย ----
  if (html.includes('<!--#footer-->')) {
    html = html.replace(/<!--#footer-->[\s\S]*?<!--\/footer-->/, `<!--#footer-->\n${FOOTER}\n<!--/footer-->`);
  } else if (/<footer[\s>]/.test(html)) {
    html = html.replace(/<footer[\s\S]*?<\/footer>/, `<!--#footer-->\n${FOOTER}\n<!--/footer-->`);
  }

  if (html !== src) {
    if (CHECK) stale.push(f);
    else { fs.writeFileSync(file, html); changed++; console.log('อัปเดต', f); }
  }
}
if (CHECK) {
  if (stale.length) { console.error('หน้าเหล่านี้ยังไม่ตรงกับเทมเพลต — รัน npm run build:partials:\n  ' + stale.join('\n  ')); process.exit(1); }
  console.log('ทุกหน้าตรงกับเทมเพลตแล้ว');
} else console.log(changed ? `อัปเดต ${changed} หน้า` : 'ทุกหน้าตรงกับเทมเพลตอยู่แล้ว');
