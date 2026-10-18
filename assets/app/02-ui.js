/* app.html · ตัวช่วย UI, ถอดรหัสไฟล์, router — ลำดับไฟล์มีผล (โหลดตามเลข) */
/* ---------- UI helpers ---------- */
let PERIOD = curPeriod();
const PAGE_KEY = 'payroll_page';
/* จำหน้าที่เปิดอยู่ไว้ — รีเฟรชแล้วกลับมาหน้าเดิม ไม่เด้งไปแดชบอร์ด */
function savePage(id){ try{ localStorage.setItem(PAGE_KEY, id); }catch(e){} }
function restorePage(){
  let id; try{ id=localStorage.getItem(PAGE_KEY); }catch(e){}
  if(!id) return 'dashboard';
  const isNormal = pagesForEdition().some(p=>p[0]===id);
  const isAdminOnly = ['orders','quotes','linechats','feedback','admin'].includes(id);
  if(!isNormal && !isAdminOnly) return 'dashboard';      // ชื่อหน้าไม่รู้จัก / ไม่มีในบัญชีประเภทนี้
  if(isAdminOnly && !IS_ADMIN) return 'dashboard';        // ไม่ใช่แอดมินแล้ว
  if(pageLocked(id)) return 'dashboard';                  // หมดสิทธิ์พรีเมี่ยมแล้ว
  return id;
}
let PAGE = 'dashboard';
const $ = s => document.querySelector(s);
const el = (h)=>{ const t=document.createElement('template'); t.innerHTML=h.trim(); return t.content.firstChild; };
/* ---------- ถอดรหัสอักขระไฟล์ที่นำเข้า ----------
   ไฟล์จากโปรแกรม HR เก่าหรือ Excel ภาษาไทยมักเป็น TIS-620 / Windows-874
   ถ้าถอดเป็น UTF-8 ตรง ๆ ตัวหนังสือไทยจะกลายเป็น ??? ทั้งหมด
   วิธีเดา: ดู BOM ก่อน ไม่มีก็ลองถอดเป็น UTF-8 แบบเข้มงวด พังเมื่อไหร่ค่อยใช้ Windows-874
   (ข้อความไทย TIS-620 เกือบทุกไบต์ผิดกฎ UTF-8 จึงตกมาทางนี้เสมอ ส่วนไฟล์ UTF-8 จริงจะผ่านด่านแรก) */
function decodeTextBytes(buf){
  if(typeof buf==='string') return buf.replace(/^\uFEFF/,'');
  const b=new Uint8Array(buf);
  const cut=(enc,skip)=>new TextDecoder(enc).decode(b.subarray(skip));
  if(b.length>=3 && b[0]===0xEF && b[1]===0xBB && b[2]===0xBF) return cut('utf-8',3);
  if(b.length>=2 && b[0]===0xFF && b[1]===0xFE) return cut('utf-16le',2);
  if(b.length>=2 && b[0]===0xFE && b[1]===0xFF) return cut('utf-16be',2);
  let txt;
  try{ txt=new TextDecoder('utf-8',{fatal:true}).decode(b); }        // ไฟล์ UTF-8 ปกติ
  catch(e){
    try{ txt=new TextDecoder('windows-874').decode(b); }             // ไทยแบบเก่า
    catch(e2){ txt=new TextDecoder('utf-8').decode(b); }
  }
  if(txt.indexOf('\uFFFD')>=0) toast('⚠️ ไฟล์มีตัวอักษรที่อ่านไม่ออก — ลองบันทึกใหม่เป็น CSV UTF-8');
  return txt.replace(/^\uFEFF/,'');
}
function toast(msg){ const t=$('#toast'); t.textContent=msg; t.classList.add('on'); clearTimeout(t._t); t._t=setTimeout(()=>t.classList.remove('on'),2200); }
function esc(s){ return String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

const PAGES = [
  ['dashboard','แดชบอร์ด','📊'],
  ['employees','ข้อมูลพนักงาน','👥'],
  ['checkin','ลงเวลาผ่านมือถือ','📱'],
  ['attend','เวลาเข้างาน','⏰'],
  ['leave','ระบบลางาน','🌴'],
  ['resign','การลาออก','🚪'],
  ['advance','เบิกจ่ายล่วงหน้า','💸'],
  ['payroll','คำนวณเงินได้ / เงินหัก','🧮'],
  ['summary','สรุปเงินเดือน','📋'],
  ['dept','สรุปตามแผนก','🏢'],
  ['detail','สรุปรายละเอียดทั้งหมด','📑'],
  ['slip','สลิปเงินเดือน','🧾'],
  ['wht','หนังสือรับรองหัก ณ ที่จ่าย (50 ทวิ)','📄'],
  ['pnd1','แบบ ภ.ง.ด.1','🗂️'],
  ['sso','แบบประกันสังคม (สปส.1-10)','🛡️'],
  ['pvd','แบบสรุปกองทุนสำรองเลี้ยงชีพ','🏦'],
  ['wf','แบบสรุปกองทุนสงเคราะห์ลูกจ้าง','🤝'],
  ['settings','ตั้งค่า','⚙️'],
];

/* ไอคอนเมนู — วาดเป็น SVG ไม่ใช่อีโมจิ เครื่องที่ไม่มีฟอนต์อีโมจิจะได้ไม่ขึ้นเป็นกรอบสี่เหลี่ยม */
const ICO=(d)=>'<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+d+'</svg>';
const NAV_ICONS={
  dashboard: ICO('<path d="M3.5 20.5h17"/><rect x="4.5" y="11" width="3.6" height="7"/><rect x="10.2" y="6.5" width="3.6" height="11.5"/><rect x="15.9" y="14" width="3.6" height="4"/>'),
  employees: ICO('<circle cx="9" cy="8" r="3.2"/><path d="M2.8 20a6.2 6.2 0 0 1 12.4 0"/><path d="M16.2 5.4a3.2 3.2 0 0 1 0 6.2"/><path d="M17.4 14.3A6.2 6.2 0 0 1 21.2 20"/>'),
  attend:    ICO('<circle cx="12" cy="12" r="8.6"/><path d="M12 7.2V12l3.2 2"/>'),
  checkin:   ICO('<rect x="6.5" y="2.8" width="11" height="18.4" rx="2.4"/><circle cx="12" cy="10" r="2.6"/><path d="M8.8 15.6a3.4 3.4 0 0 1 6.4 0"/>'),
  leave:     ICO('<rect x="3.4" y="5" width="17.2" height="15.6" rx="2.4"/><path d="M3.4 9.6h17.2M8.2 3v4M15.8 3v4"/><path d="m9 14.6 2.1 2.1 3.9-4"/>'),
  resign:    ICO('<path d="M14.5 3.5h3.6a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2h-3.6"/><path d="M10 8 6 12l4 4"/><path d="M6 12h9"/>'),
  rounds:    ICO('<rect x="3.4" y="5" width="17.2" height="15.6" rx="2.4"/><path d="M3.4 9.6h17.2M8.2 3v4M15.8 3v4"/><path d="M7.6 13.6h2.4M10.8 13.6h2.4M14 13.6h2.4M7.6 17h2.4M10.8 17h2.4"/>'),
  advance:   ICO('<rect x="2.6" y="5.6" width="18.8" height="12.8" rx="2.4"/><circle cx="12" cy="12" r="2.8"/><path d="M6.2 9.4h.01M17.8 14.6h.01"/>'),
  payroll:   ICO('<rect x="4.4" y="2.6" width="15.2" height="18.8" rx="2.4"/><rect x="7.6" y="6" width="8.8" height="3.2"/><path d="M8 13.4h.01M12 13.4h.01M16 13.4h.01M8 17.4h.01M12 17.4h.01M16 17.4h.01"/>'),
  summary:   ICO('<rect x="5" y="4" width="14" height="17" rx="2.2"/><path d="M9 3h6v3H9z"/><path d="M8.6 11h6.8M8.6 15h4.6"/>'),
  dept:      ICO('<path d="M3.6 20.6h16.8"/><rect x="5" y="3.6" width="9.4" height="17"/><path d="M14.4 9h4.4v11.6"/><path d="M7.6 7h1M11 7h1M7.6 11h1M11 11h1M7.6 15h1M11 15h1"/>'),
  detail:    ICO('<path d="M8.4 3.6h8l3.6 3.6v10a2 2 0 0 1-2 2h-9.6a2 2 0 0 1-2-2v-11a2 2 0 0 1 2-2z"/><path d="M16.4 3.6v3.6H20"/><path d="M4.2 7.4v11.8a2.4 2.4 0 0 0 2.4 2.4h9"/><path d="M9.6 12h5.4M9.6 15.4h3.6"/>'),
  slip:      ICO('<path d="M5.4 2.8h13.2v18.4l-2.2-1.5-2.2 1.5-2.2-1.5-2.2 1.5-2.2-1.5-2.2 1.5z"/><path d="M8.8 8h6.4M8.8 12h6.4"/>'),
  wht:       ICO('<path d="M8 3.4h8l3.4 3.4v8.4a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V5.4a2 2 0 0 1 2-2z"/><path d="M16 3.4v3.4h3.4"/><circle cx="12" cy="19" r="2.4"/><path d="m9.9 20.6-.5 2.6 2.6-1.3 2.6 1.3-.5-2.6"/>'),
  pnd1:      ICO('<path d="M3.4 7.4a2 2 0 0 1 2-2h3.4l2 2.4h7.8a2 2 0 0 1 2 2v8.8a2 2 0 0 1-2 2H5.4a2 2 0 0 1-2-2z"/><path d="M8.6 13h6.8"/>'),
  sso:       ICO('<path d="M12 2.8 4.6 5.9v5.4c0 4.6 3.1 8.8 7.4 9.9 4.3-1.1 7.4-5.3 7.4-9.9V5.9z"/><path d="m8.9 11.9 2.2 2.2 4-4.3"/>'),
  pvd:       ICO('<path d="M3.2 9.4 12 4l8.8 5.4"/><path d="M4.6 9.6v8.6M9.2 9.6v8.6M14.8 9.6v8.6M19.4 9.6v8.6"/><path d="M3 20.4h18"/>'),
  wf:        ICO('<path d="M12 20.2s-7.4-4.4-7.4-9.8a4.2 4.2 0 0 1 7.4-2.7 4.2 4.2 0 0 1 7.4 2.7c0 5.4-7.4 9.8-7.4 9.8z"/><path d="M9.2 12.2h5.6M12 9.4V15"/>'),
  docs:      ICO('<path d="M8 3.4h6.4l4.2 4.2v11a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V5.4a2 2 0 0 1 2-2z"/><path d="M14.4 3.4v4.2h4.2"/><path d="M9 12h6M9 15.4h6M9 8.6h2.4"/>'),
  settings:  ICO('<circle cx="12" cy="12" r="3.1"/><path d="M19.2 14.6a1.6 1.6 0 0 0 .3 1.8l.1.1a1.9 1.9 0 1 1-2.7 2.7l-.1-.1a1.6 1.6 0 0 0-2.7 1.1v.3a1.9 1.9 0 1 1-3.8 0v-.2a1.6 1.6 0 0 0-2.8-1.1l-.1.1a1.9 1.9 0 1 1-2.7-2.7l.1-.1a1.6 1.6 0 0 0-1.1-2.7h-.3a1.9 1.9 0 1 1 0-3.8h.2a1.6 1.6 0 0 0 1.1-2.8l-.1-.1a1.9 1.9 0 1 1 2.7-2.7l.1.1a1.6 1.6 0 0 0 1.8.3h.1a1.6 1.6 0 0 0 1-1.5v-.3a1.9 1.9 0 1 1 3.8 0v.2a1.6 1.6 0 0 0 2.7 1.1l.1-.1a1.9 1.9 0 1 1 2.7 2.7l-.1.1a1.6 1.6 0 0 0 1.1 2.7h.3a1.9 1.9 0 1 1 0 3.8h-.2a1.6 1.6 0 0 0-1.5 1z"/>'),
  orders:    ICO('<circle cx="9.4" cy="20" r="1.4"/><circle cx="17.6" cy="20" r="1.4"/><path d="M2.6 3.4h2.8l2.4 11.4h10.4l2.2-8.4H6.2"/>'),
  quotes:    ICO('<path d="M7 2.8h7.4l4.6 4.6v12.4a1.4 1.4 0 0 1-1.4 1.4H7a1.4 1.4 0 0 1-1.4-1.4V4.2A1.4 1.4 0 0 1 7 2.8z"/><path d="M14.2 2.8v4.8H19"/><path d="M12.2 10.6v6.8M14.2 11.8h-2.9a1.3 1.3 0 0 0 0 2.6h1.8a1.3 1.3 0 0 1 0 2.6h-3"/>'),
  linechats: ICO('<path d="M12 3.6c-5 0-9 3.2-9 7.2 0 3.6 3.2 6.6 7.6 7.1l-.4 2.5 3.4-2.5c4.3-.6 7.4-3.6 7.4-7.1 0-4-4-7.2-9-7.2z"/><path d="M8 10.8h.01M12 10.8h.01M16 10.8h.01"/>'),
  feedback:  ICO('<path d="M20.4 12.6a7.4 7.4 0 0 1-8 7.4L4 21.4l1.4-8.4a7.4 7.4 0 1 1 15 -.4z"/><path d="M8.6 11h.01M12 11h.01M15.4 11h.01"/>'),
  companies: ICO('<rect x="2.8" y="7" width="18.4" height="13.4" rx="2.2"/><path d="M8.6 7V5.2a2 2 0 0 1 2-2h2.8a2 2 0 0 1 2 2V7"/><path d="M2.8 12.4h18.4M10.4 12.4v2.2h3.2v-2.2"/>'),
  admin:     ICO('<path d="M3 7.4 6.8 11 12 4.6 17.2 11 21 7.4l-1.6 11.2a1.6 1.6 0 0 1-1.6 1.4H6.2a1.6 1.6 0 0 1-1.6-1.4z"/>'),
};
const LOCK_ICO='<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4.6" y="10.4" width="14.8" height="10.4" rx="2.2"/><path d="M8.2 10.4V7.6a3.8 3.8 0 0 1 7.6 0v2.8"/></svg>';

const NAV_COLORS = {
  dashboard:'#17557f', employees:'#8b5cf6', attend:'#0891b2', checkin:'#0d9488', leave:'#84cc16', resign:'#f43f5e', advance:'#f97316', rounds:'#0ea5e9', payroll:'#06b6d4', summary:'#10b981',
  dept:'#f59e0b', detail:'#ec4899', slip:'#14b8a6', wht:'#ef4444',
  pnd1:'#6366f1', sso:'#0ea5e9', pvd:'#0f766e', wf:'#db2777', settings:'#5b7186', companies:'#a855f7', feedback:'#f97316', orders:'#22c55e', quotes:'#0ea5e9', linechats:'#06c755', admin:'#eab308'
};
/* เมนูตามประเภทบัญชี — สำนักงานบัญชีไม่มีลงเวลา/ลางาน แต่มีหน้าบริษัทลูกค้าเพิ่ม */
function pagesForEdition(){
  if(!isFirm()) return PAGES;
  return [['companies','บริษัทลูกค้า','🏢'],
          ...PAGES.filter(p=>!['attend','checkin','leave'].includes(p[0]))];
}
function pageAllowed(id){
  if(['orders','quotes','linechats','feedback','admin'].includes(id)) return IS_ADMIN;
  return pagesForEdition().some(p=>p[0]===id);
}
/* ตัวสลับบริษัทบนแถบเมนู */
function renderCoSwitch(){
  const nav=$('#nav'); if(!nav || !isFirm()) return;
  const list=activeCos();
  const box=el(`<div style="padding:10px 12px 12px;border-bottom:1px solid #1b3550;margin-bottom:8px">
    <div style="font-size:11px;font-weight:800;color:#7c94ac;letter-spacing:.6px;margin-bottom:6px">บริษัทที่กำลังทำ</div>
    ${list.length ? `<select id="coSel" style="width:100%;padding:9px 10px;border-radius:9px;border:1px solid #24466b;
        background:#14304d;color:#fff;font-family:inherit;font-size:13.5px;font-weight:600">
        ${list.map(c=>`<option value="${esc(c.id)}" ${c.id===CUR_CO?'selected':''}>${esc(c.name)}</option>`).join('')}
      </select>`
      : `<div style="color:#94a3b8;font-size:12.5px">ยังไม่มีบริษัท — กด “บริษัทลูกค้า” เพื่อเพิ่ม</div>`}
    <div style="font-size:11px;color:#7c94ac;margin-top:6px">
      ${list.length} บริษัท${coLimit()!==null?' / สูงสุด '+coLimit():''}</div>
  </div>`);
  nav.insertBefore(box, nav.firstChild);
  const sel=box.querySelector('#coSel');
  if(sel) sel.onchange=()=>switchCompany(sel.value);
}
const NAV_DOCS=['wht','pnd1','sso','pvd','wf'];
const NAV_DOC_LAB={wht:'หนังสือรับรอง 50 ทวิ', pnd1:'ภ.ง.ด.1', sso:'ประกันสังคม (สปส.1-10)', pvd:'กองทุนสำรองเลี้ยงชีพ', wf:'กองทุนสงเคราะห์ลูกจ้าง'};
function renderNav(){
  const nav = $('#nav'); nav.innerHTML='';
  const base = pagesForEdition();
  const items = IS_ADMIN ? [...base, ['orders','คำสั่งซื้อ/ต่ออายุ','🧾'], ['quotes','ใบเสนอราคา','📄'], ['linechats','แชต LINE','💬'], ['feedback','แจ้งปัญหา/คำแนะนำ','💬'], ['admin','ผู้ดูแลระบบ','👑']] : base;
  /* เมนูกลุ่ม "เอกสารราชการ": รวม 50 ทวิ / ภ.ง.ด.1 / สปส. / กองทุน เป็นเมนูเดียวที่กดกางดูข้อย่อยได้ */
  const inDocs=NAV_DOCS.includes(PAGE);
  let docOpen; try{ docOpen=localStorage.getItem('navDocsOpen'); }catch(e){}
  docOpen = inDocs || docOpen==='1';
  let docBox=null;
  items.forEach(([id,label,ico])=>{
    if(NAV_DOCS.includes(id)){
      if(!docBox){
        const kids=items.filter(x=>NAV_DOCS.includes(x[0]));
        const head=el(`<button class="navGrp${inDocs?' active':''}${docOpen?' open':''}" title="เอกสารราชการ">
          <span class="ico">${NAV_ICONS.docs}</span><span class="t">${tr('nav_docs')}</span>
          <span class="navCnt">${kids.length}</span><span class="navChev">›</span></button>`);
        docBox=el(`<div class="navSub${docOpen?' open':''}"></div>`);
        head.onclick=()=>{
          if(window.matchMedia('(max-width:1024px) and (min-width:721px)').matches){   // เมนูแบบไอคอน: กดแล้วไปเอกสารแรก
            if(!inDocs){ PAGE=kids[0][0]; savePage(PAGE); renderNav(); render(); } return; }
          const o=!docBox.classList.contains('open'); docBox.classList.toggle('open',o); head.classList.toggle('open',o);
          try{ localStorage.setItem('navDocsOpen', o?'1':'0'); }catch(e){}
        };
        nav.appendChild(head); nav.appendChild(docBox);
      }
      const c=el(`<button data-p="${id}" class="navKid${id===PAGE?' active':''}"><span class="ico">${NAV_ICONS[id]||ico}</span><span class="t">${(LANG!=='en'&&NAV_DOC_LAB[id])||tr('nav_'+id)}</span></button>`);
      c.onclick=()=>{ sideOpen(false); window.scrollTo(0,0); PAGE=id; savePage(id); renderNav(); render(); };
      docBox.appendChild(c);
      return;
    }
    const col = NAV_COLORS[id] || '#17557f';
    const lock = pageLocked(id);
    const b = el(`<button data-p="${id}" ${lock?'title="ต้องใช้แพ็กเกจพรีเมี่ยม"':''}>
      <span class="ico" style="background:linear-gradient(135deg,${col}cc,${col}77);color:#fff${lock?';filter:grayscale(.85);opacity:.6':''}">${NAV_ICONS[id]||ico}</span>
      <span class="t" style="${lock?'opacity:.6':''}">${tr('nav_'+id)}</span>
      ${lock?'<span style="margin-left:auto;opacity:.75;display:flex">'+LOCK_ICO+'</span>':''}</button>`);
    if(id===PAGE) b.classList.add('active');
    b.onclick = ()=>{
      if(pageLocked(id)){ premiumModal(id); sideOpen(false); return; }   // ล็อกอยู่ → ชวนอัปเกรดแทน
      sideOpen(false); window.scrollTo(0,0);
      if(id==='payroll'){ askPeriodThen(()=>{ PAGE=id; savePage(id); renderNav(); render(); }); return; }
      PAGE=id; savePage(id); renderNav(); render();
    };
    nav.appendChild(b);
  });
  renderCoSwitch();          // ตัวสลับบริษัท (เฉพาะแบบสำนักงานบัญชี)
}
/* ถามงวดเดือนก่อนเข้าหน้าคำนวณเงินได้ — กันทำผิดเดือนโดยไม่รู้ตัว */
function askPeriodThen(go){
  const [cy,cm]=PERIOD.split('-').map(Number);
  const nowY=new Date().getFullYear();
  const ys=new Set(); for(let y=nowY-5;y<=nowY+1;y++) ys.add(y);
  Object.keys(DB.payroll).forEach(p=>ys.add(+p.split('-')[0])); ys.add(cy);
  const years=[...ys].sort((a,b)=>b-a);
  const MN=(LANG==='en'?MONTHS_EN:THAI_MONTHS);
  const body=`<p style="margin:0 0 12px">${tr('ask_period_q')}</p>
    <div style="display:flex;gap:10px;flex-wrap:wrap">
      <select id="apM" class="inp" style="flex:1;min-width:130px">${MN.map((m,i)=>`<option value="${i+1}" ${i+1===cm?'selected':''}>${m}</option>`).join('')}</select>
      <select id="apY" class="inp" style="flex:1;min-width:110px">${years.map(y=>`<option value="${y}" ${y===cy?'selected':''}>${LANG==='en'?y:y+543}</option>`).join('')}</select>
    </div>
    <p id="apNote" class="muted" style="margin:10px 0 0;font-size:13px"></p>`;
  const start=()=>{
    const M=document.getElementById('apM'), Y=document.getElementById('apY');
    if(M&&Y) PERIOD=`${Y.value}-${String(M.value).padStart(2,'0')}`;
    closeModal(); go();
  };
  openModal(tr('ask_period_t'), body, [[tr('ask_period_ok'),'',start],[tr('cancel')||'ยกเลิก','ghost',closeModal]]);
  const M=document.getElementById('apM'), Y=document.getElementById('apY'), N=document.getElementById('apNote');
  const note=()=>{ const p=`${Y.value}-${String(M.value).padStart(2,'0')}`;
    N.innerHTML = periodHasData(p) ? `✅ ${tr('ask_period_has')}` : `🆕 ${tr('ask_period_new')}`; };
  if(M&&Y&&N){ M.onchange=note; Y.onchange=note; note();
    [M,Y].forEach(s=>s.onkeydown=e=>{ if(e.key==='Enter') start(); }); M.focus(); }
}
function renderPeriodSel(){
  const [curY, curM] = PERIOD.split('-').map(Number);
  // ปีที่เลือกได้: ปีปัจจุบัน ±5 และปีที่มีข้อมูลอยู่แล้ว
  const nowY = new Date().getFullYear();
  const yset = new Set();
  for(let y=nowY-5; y<=nowY+1; y++) yset.add(y);
  Object.keys(DB.payroll).forEach(p=>yset.add(+p.split('-')[0]));
  yset.add(curY);
  const years=[...yset].sort((a,b)=>b-a);

  const mSel=$('#monthSel'), ySel=$('#yearSel');
  mSel.innerHTML = (LANG==='en'?MONTHS_EN:THAI_MONTHS).map((m,i)=>`<option value="${i+1}" ${i+1===curM?'selected':''}>${m}</option>`).join('');
  ySel.innerHTML = years.map(y=>`<option value="${y}" ${y===curY?'selected':''}>${LANG==='en'?y:y+543}</option>`).join('');
  const apply=()=>{ PERIOD=`${ySel.value}-${String(mSel.value).padStart(2,'0')}`; render(); };
  mSel.onchange=apply; ySel.onchange=apply;
}

/* ---------- Router ---------- */
/* ซ่อมข้อมูลครั้งเดียวต่อบริษัท: 15 ต.ค. 2569 ฟังก์ชันชื่อซ้ำทำให้ยอด OT ถูกบันทึกเป็น 0
   ทั้งที่ชั่วโมง OT (otRows) ยังอยู่ครบ → คำนวณยอด OT และเงินหักอัตโนมัติของงวดนั้นใหม่ */
function repairOtZero(){
  if(!DB || DB._fixOt20261015 || !DB.payroll) return;
  const keep=PERIOD; let n=0;
  try{
    Object.keys(DB.payroll).filter(p=>p>='2026-09').forEach(p=>{ const pp=DB.payroll[p]||{};   // บั๊กอยู่แค่คืน 15 ต.ค. — งวดเก่ากว่านี้ไม่แตะ
      Object.keys(pp).forEach(id=>{ const r=pp[id], e=DB.employees.find(x=>x.id===id);
        if(!e || !r || !r.earn || +r.earn.ot || (r.manual && r.manual.ot)) return;
        const has=Array.isArray(r.earn.otRows) ? r.earn.otRows.some(x=>+x.h>0 && +x.m>0) : +r.earn.otHours>0;   // แบบเก่าเก็บ otHours แถวเดียว
        if(!has) return;
        PERIOD=p; r.earn.ot=otTotal(e, r); autoDeductions(e, r); n++; }); });
  } finally { PERIOD=keep; }
  DB._fixOt20261015=1;                 // ไม่มีอะไรซ่อม = ไม่ต้องบันทึก (กันบันทึกข้อมูลว่างตอนกำลังโหลด)
  if(n) save();
  if(n) console.info('repairOtZero: คำนวณยอด OT ใหม่', n, 'รายการ');
}
/* ---------- แบนเนอร์หัวหน้า (ทุกหน้ายกเว้นแดชบอร์ด): ชื่อหน้า + คำอธิบายสั้น + น้อง eSim ----------
   [ไอคอน 3 ตัวคั่นเว้นวรรค, ท่าน้อง eSim, คำอธิบายไทย, คำอธิบายอังกฤษ] */
const PB_INFO={
  employees:['👥 🪪 📇','e1c','รายชื่อ ประวัติ และข้อมูลเงินเดือนของพนักงานทุกคน','Every employee’s profile and pay details in one place'],
  checkin:['📱 🙂 📍','e4c','สแกนหน้า + GPS ลงเวลาผ่านมือถือ ไม่ต้องซื้อเครื่องสแกน','Face scan + GPS check-in from any phone'],
  attend:['⏰ 📅 ✅','e3c','บันทึกเวลาเข้า-ออก สาย และ OT ส่งต่อเข้าเงินเดือนให้เอง','Clock-in times, lateness and OT flow straight into payroll'],
  leave:['🌴 📝 ✅','e6c','ยื่นใบลา อนุมัติ และดูวันลาคงเหลือของทุกคน','Leave requests, approvals and balances'],
  resign:['🚪 📄 🤝','e5c','บันทึกพนักงานลาออก พร้อมคิดเงินงวดสุดท้าย','Record leavers and their final pay'],
  advance:['💸 🗓️ 🧾','e2c','เบิกเงินล่วงหน้า และจ่ายรายสัปดาห์ / 2 รอบ','Salary advances and weekly / twice-a-month pay'],
  payroll:['🧮 💰 ⏱️','e3c','คิด OT ภาษี ประกันสังคม และกองทุนให้อัตโนมัติ','OT, tax, social security and funds calculated for you'],
  summary:['📊 💰 🏦','e1c','ยอดเงินเดือนทั้งงวด พร้อมใบสรุปยอดโอน','The whole period at a glance, ready to transfer'],
  dept:['🏢 📊 💼','e2c','ต้นทุนเงินเดือนแยกตามแผนก','Payroll cost by department'],
  detail:['📋 🔎 📑','e3c','ทุกรายการเงินได้ เงินหัก ของทุกคนในตารางเดียว','Every earning and deduction in one table'],
  slip:['🧾 ✉️ 🖨️','e6c','สลิปเงินเดือน พิมพ์ / PDF / ส่งให้พนักงาน','Payslips to print, save as PDF or send'],
  wht:['📄 ✍️ ✅','e1c','หนังสือรับรองการหักภาษี ณ ที่จ่าย (50 ทวิ)','Withholding tax certificates (50 Bis)'],
  pnd1:['🏛️ 📄 🧮','e3c','แบบ ภ.ง.ด.1 ยอดตรงกับเงินเดือนทุกบาท','PND.1 that matches payroll to the baht'],
  sso:['🛡️ 📄 🏥','e1c','แบบประกันสังคม สปส.1-10 พร้อมยื่น','SSO 1-10 ready to file'],
  pvd:['🏦 📈 📄','e2c','สรุปเงินสะสม / สมทบ กองทุนสำรองเลี้ยงชีพ','Provident fund contributions summary'],
  wf:['🤝 📄 🏛️','e2c','สรุปเงินสะสม / สมทบ กองทุนสงเคราะห์ลูกจ้าง','Employee welfare fund summary'],
  settings:['⚙️ 🏢 🗓️','e5c','ข้อมูลบริษัท วันหยุด อัตรา OT และการตั้งค่าทั้งหมด','Company info, holidays, OT rates and more'],
  feedback:['💬 💡 🛠️','e6c','แจ้งปัญหา หรือเสนอแนะ ทีมงานอ่านทุกข้อความ','Report a problem or suggest an idea'],
  orders:['🛒 🧾 💳','e4c','ประวัติคำสั่งซื้อ ต่ออายุ และใบเสร็จ','Orders, renewals and receipts'],
  quotes:['📄 💼 ✍️','e1c','ออกใบเสนอราคาให้ลูกค้า','Quotations for customers'],
  linechats:['💬 🟢 👥','e6c','แชต LINE ของลูกค้า','Customer LINE chats'],
  companies:['🏢 📁 👥','e1c','บริษัทลูกค้าทั้งหมดของสำนักงาน','All of the firm’s client companies'],
  admin:['🛡️ 👥 ⚙️','e5c','จัดการผู้ใช้และระบบ','Users and system administration']
};
function pageBanner(p){
  const [ic, pose, th, en]=PB_INFO[p], b=ic.split(' ');
  return el(`<div class="dhero pbanner no-print">
    <div class="dhero-tx">
      <div class="dhero-k">eSimPayroll</div>
      <h1>${esc(tr('nav_'+p))}</h1>
      <p>${esc(LANG==='en'?en:th)}</p>
    </div>
    <div class="dhero-art" aria-hidden="true">
      <span class="dh-b b1">${b[0]}</span><span class="dh-b b2">${b[1]}</span><span class="dh-b b3">${b[2]}</span>
      <img src="/media/esim/${pose}.png" alt="" loading="lazy">
    </div>
  </div>`);
}
function render(){
  repairOtZero();
  /* จ่ายรายรอบอยู่ในหน้าเบิกจ่ายล่วงหน้า (แท็บ) — ลิงก์/ค่าที่จำไว้แบบเดิมพาไปแท็บนั้น */
  if(PAGE==='rounds'){ PAGE='advance'; ADV_TAB='rounds'; savePage(PAGE); renderNav(); }
  $('#pageTitle').textContent = tr('nav_'+PAGE);
  const pl=$('#periodLab'); if(pl) pl.textContent=tr('period');
  // หน้าที่ไม่ผูกกับงวดเดือน — ซ่อนตัวเลือกงวดเดือนด้านบน
  const pbox=$('#periodBox'); if(pbox) pbox.style.display = ['resign','employees','leave','quotes','linechats'].includes(PAGE) ? 'none' : '';
  renderPeriodSel();
  // ถ้าหน้าที่เปิดอยู่ถูกล็อก ให้เด้งกลับแดชบอร์ด
  if(pageLocked(PAGE)){ PAGE='dashboard'; savePage(PAGE); renderNav(); }
  const v = $('#view'); v.innerHTML='';
  if(TARGET_UID && MY_UID && TARGET_UID!==MY_UID) v.appendChild(adminBanner());
  if(PAGE!=='dashboard' && PB_INFO[PAGE]) v.appendChild(pageBanner(PAGE));
  // สำนักงานบัญชีที่ยังไม่ได้เลือกบริษัท — ให้เพิ่ม/เลือกบริษัทก่อน
  if(isFirm() && !CUR_CO && PAGE!=='companies' && PAGE!=='admin'){ PAGE='companies'; savePage(PAGE); renderNav(); }
  ({dashboard:vDashboard, employees:vEmployees, attend:vAttend, checkin:vCheckin, leave:vLeave, resign:vResign, advance:vAdvance, rounds:(x)=>vRounds(x), payroll:vPayroll, summary:vSummary,
    dept:vDept, detail:vDetail, slip:vSlip, wht:vWHT, pnd1:vPND1, sso:vSSO, pvd:vPVD, wf:vWF, settings:vSettings, feedback:vFeedback, orders:vOrders, quotes:vQuotes, linechats:vLineChats,
    admin:vAdmin, companies:vCompanies}[PAGE])(v);
  enhanceKpis(v);
}
/* ---------- การ์ด KPI ทุกหน้าให้เป็นสไตล์เดียวกับแดชบอร์ด ----------
   แปลงการ์ดเดิม <div class="kpi bN"><div class="lab">😀 ชื่อ</div><div class="val">…
   เป็น: ไอคอนสี่เหลี่ยมสี + ชื่อ อยู่แถวบน แล้วตัวเลขเต็มความกว้าง
   ไอคอนเลือกจากอีโมจิเดิมของการ์ด (ไม่มีอีโมจิ = ใช้ตามสีการ์ด) */
const KPI_SVG=(d)=>'<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+d+'</svg>';
const KPI_ICONS={
  users:KPI_SVG('<circle cx="9" cy="8" r="3.2"/><path d="M2.8 20a6.2 6.2 0 0 1 12.4 0"/><path d="M16.2 5.4a3.2 3.2 0 0 1 0 6.2"/><path d="M17.4 14.3A6.2 6.2 0 0 1 21.2 20"/>'),
  money:KPI_SVG('<rect x="2.6" y="5.6" width="18.8" height="12.8" rx="2.4"/><circle cx="12" cy="12" r="2.8"/><path d="M6.2 9.4h.01M17.8 14.6h.01"/>'),
  plus:KPI_SVG('<circle cx="12" cy="12" r="8.6"/><path d="M12 8v8M8 12h8"/>'),
  minus:KPI_SVG('<circle cx="12" cy="12" r="8.6"/><path d="M8 12h8"/>'),
  clock:KPI_SVG('<circle cx="12" cy="12" r="8.6"/><path d="M12 7.2V12l3.2 2"/>'),
  cal:KPI_SVG('<rect x="3.4" y="5" width="17.2" height="15.6" rx="2.4"/><path d="M3.4 9.6h17.2M8.2 3v4M15.8 3v4"/>'),
  doc:KPI_SVG('<path d="M6 2.8h8.4L19 7.4v13.8H6z"/><path d="M14.2 2.8v4.8H19M9 12h6M9 16h6"/>'),
  check:KPI_SVG('<circle cx="12" cy="12" r="8.6"/><path d="m8.2 12.2 2.6 2.6 5-5.2"/>'),
  bolt:KPI_SVG('<path d="M13 2.8 5 13.4h6.4L10.6 21.2 19 10.4h-6.4z"/>'),
  door:KPI_SVG('<path d="M14.5 3.5h3.6a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2h-3.6"/><path d="M10 8 6 12l4 4"/><path d="M6 12h9"/>'),
  phone:KPI_SVG('<rect x="6.5" y="2.8" width="11" height="18.4" rx="2.4"/><path d="M11 17.6h2"/>'),
  user:KPI_SVG('<circle cx="12" cy="8" r="3.6"/><path d="M4.8 20.4a7.2 7.2 0 0 1 14.4 0"/>')
};
const KPI_EMOJI={'👥':'users','🟢':'users','🆕':'user','👤':'user','💵':'money','💰':'money','💸':'money','💼':'money','➕':'plus','➖':'minus',
  '⏳':'clock','🕒':'clock','⏰':'clock','📅':'cal','📆':'cal','🧾':'doc','📝':'doc','📄':'doc','✅':'check','⚡':'bolt','🚪':'door','📱':'phone'};
const KPI_BY_COLOR={b1:'users',b2:'money',b3:'plus',b4:'minus',b5:'money'};
function enhanceKpis(root){
  (root||document).querySelectorAll('.cards .kpi:not(.kx)').forEach(k=>{
    if(k.closest('.kv2')) return;                       // แดชบอร์ดทำไว้แล้ว
    const lab=k.querySelector(':scope > .lab'); if(!lab) return;
    k.classList.add('kx');
    const m=lab.innerHTML.match(/^\s*((?:\p{Extended_Pictographic}|\p{Regional_Indicator})[️‍\p{Extended_Pictographic}]*)\s*/u);
    let key=null;
    if(m){ key=KPI_EMOJI[m[1].replace(/️/g,'')]||null; lab.innerHTML=lab.innerHTML.slice(m[0].length); }
    const col=(k.className.match(/\bb[1-5]\b/)||['b1'])[0];
    if(!key) key=KPI_BY_COLOR[col]||'users';
    const head=document.createElement('div'); head.className='khead';
    head.innerHTML=`<div class="kico kc-${col}">${KPI_ICONS[key]}</div>`;
    lab.parentNode.insertBefore(head,lab); head.appendChild(lab);
  });
}
/* หน้าที่วาดเพิ่มทีหลัง (โหลดข้อมูลแบบ async) ก็ให้ได้สไตล์เดียวกัน */
(function(){ const v=document.getElementById('view'); if(!v||!window.MutationObserver) return;
  let t=null; new MutationObserver(()=>{ clearTimeout(t); t=setTimeout(()=>enhanceKpis(v),0); }).observe(v,{childList:true,subtree:true}); })();
