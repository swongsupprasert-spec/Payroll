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
  const isAdminOnly = ['orders','feedback','admin'].includes(id);
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
  advance:   ICO('<rect x="2.6" y="5.6" width="18.8" height="12.8" rx="2.4"/><circle cx="12" cy="12" r="2.8"/><path d="M6.2 9.4h.01M17.8 14.6h.01"/>'),
  payroll:   ICO('<rect x="4.4" y="2.6" width="15.2" height="18.8" rx="2.4"/><rect x="7.6" y="6" width="8.8" height="3.2"/><path d="M8 13.4h.01M12 13.4h.01M16 13.4h.01M8 17.4h.01M12 17.4h.01M16 17.4h.01"/>'),
  summary:   ICO('<rect x="5" y="4" width="14" height="17" rx="2.2"/><path d="M9 3h6v3H9z"/><path d="M8.6 11h6.8M8.6 15h4.6"/>'),
  dept:      ICO('<path d="M3.6 20.6h16.8"/><rect x="5" y="3.6" width="9.4" height="17"/><path d="M14.4 9h4.4v11.6"/><path d="M7.6 7h1M11 7h1M7.6 11h1M11 11h1M7.6 15h1M11 15h1"/>'),
  detail:    ICO('<path d="M8.4 3.6h8l3.6 3.6v10a2 2 0 0 1-2 2h-9.6a2 2 0 0 1-2-2v-11a2 2 0 0 1 2-2z"/><path d="M16.4 3.6v3.6H20"/><path d="M4.2 7.4v11.8a2.4 2.4 0 0 0 2.4 2.4h9"/><path d="M9.6 12h5.4M9.6 15.4h3.6"/>'),
  slip:      ICO('<path d="M5.4 2.8h13.2v18.4l-2.2-1.5-2.2 1.5-2.2-1.5-2.2 1.5-2.2-1.5-2.2 1.5z"/><path d="M8.8 8h6.4M8.8 12h6.4"/>'),
  wht:       ICO('<path d="M8 3.4h8l3.4 3.4v8.4a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V5.4a2 2 0 0 1 2-2z"/><path d="M16 3.4v3.4h3.4"/><circle cx="12" cy="19" r="2.4"/><path d="m9.9 20.6-.5 2.6 2.6-1.3 2.6 1.3-.5-2.6"/>'),
  pnd1:      ICO('<path d="M3.4 7.4a2 2 0 0 1 2-2h3.4l2 2.4h7.8a2 2 0 0 1 2 2v8.8a2 2 0 0 1-2 2H5.4a2 2 0 0 1-2-2z"/><path d="M8.6 13h6.8"/>'),
  sso:       ICO('<path d="M12 2.8 4.6 5.9v5.4c0 4.6 3.1 8.8 7.4 9.9 4.3-1.1 7.4-5.3 7.4-9.9V5.9z"/><path d="m8.9 11.9 2.2 2.2 4-4.3"/>'),
  settings:  ICO('<circle cx="12" cy="12" r="3.1"/><path d="M19.2 14.6a1.6 1.6 0 0 0 .3 1.8l.1.1a1.9 1.9 0 1 1-2.7 2.7l-.1-.1a1.6 1.6 0 0 0-2.7 1.1v.3a1.9 1.9 0 1 1-3.8 0v-.2a1.6 1.6 0 0 0-2.8-1.1l-.1.1a1.9 1.9 0 1 1-2.7-2.7l.1-.1a1.6 1.6 0 0 0-1.1-2.7h-.3a1.9 1.9 0 1 1 0-3.8h.2a1.6 1.6 0 0 0 1.1-2.8l-.1-.1a1.9 1.9 0 1 1 2.7-2.7l.1.1a1.6 1.6 0 0 0 1.8.3h.1a1.6 1.6 0 0 0 1-1.5v-.3a1.9 1.9 0 1 1 3.8 0v.2a1.6 1.6 0 0 0 2.7 1.1l.1-.1a1.9 1.9 0 1 1 2.7 2.7l-.1.1a1.6 1.6 0 0 0 1.1 2.7h.3a1.9 1.9 0 1 1 0 3.8h-.2a1.6 1.6 0 0 0-1.5 1z"/>'),
  orders:    ICO('<circle cx="9.4" cy="20" r="1.4"/><circle cx="17.6" cy="20" r="1.4"/><path d="M2.6 3.4h2.8l2.4 11.4h10.4l2.2-8.4H6.2"/>'),
  feedback:  ICO('<path d="M20.4 12.6a7.4 7.4 0 0 1-8 7.4L4 21.4l1.4-8.4a7.4 7.4 0 1 1 15 -.4z"/><path d="M8.6 11h.01M12 11h.01M15.4 11h.01"/>'),
  companies: ICO('<rect x="2.8" y="7" width="18.4" height="13.4" rx="2.2"/><path d="M8.6 7V5.2a2 2 0 0 1 2-2h2.8a2 2 0 0 1 2 2V7"/><path d="M2.8 12.4h18.4M10.4 12.4v2.2h3.2v-2.2"/>'),
  admin:     ICO('<path d="M3 7.4 6.8 11 12 4.6 17.2 11 21 7.4l-1.6 11.2a1.6 1.6 0 0 1-1.6 1.4H6.2a1.6 1.6 0 0 1-1.6-1.4z"/>'),
};
const LOCK_ICO='<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4.6" y="10.4" width="14.8" height="10.4" rx="2.2"/><path d="M8.2 10.4V7.6a3.8 3.8 0 0 1 7.6 0v2.8"/></svg>';

const NAV_COLORS = {
  dashboard:'#17557f', employees:'#8b5cf6', attend:'#0891b2', checkin:'#0d9488', leave:'#84cc16', resign:'#f43f5e', advance:'#f97316', payroll:'#06b6d4', summary:'#10b981',
  dept:'#f59e0b', detail:'#ec4899', slip:'#14b8a6', wht:'#ef4444',
  pnd1:'#6366f1', sso:'#0ea5e9', settings:'#5b7186', companies:'#a855f7', feedback:'#f97316', orders:'#22c55e', admin:'#eab308'
};
/* เมนูตามประเภทบัญชี — สำนักงานบัญชีไม่มีลงเวลา/ลางาน แต่มีหน้าบริษัทลูกค้าเพิ่ม */
function pagesForEdition(){
  if(!isFirm()) return PAGES;
  return [['companies','บริษัทลูกค้า','🏢'],
          ...PAGES.filter(p=>!['attend','checkin','leave'].includes(p[0]))];
}
function pageAllowed(id){
  if(['orders','feedback','admin'].includes(id)) return IS_ADMIN;
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
function renderNav(){
  const nav = $('#nav'); nav.innerHTML='';
  const base = pagesForEdition();
  const items = IS_ADMIN ? [...base, ['orders','คำสั่งซื้อ/ต่ออายุ','🧾'], ['feedback','แจ้งปัญหา/คำแนะนำ','💬'], ['admin','ผู้ดูแลระบบ','👑']] : base;
  items.forEach(([id,label,ico])=>{
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
function render(){
  $('#pageTitle').textContent = tr('nav_'+PAGE);
  const pl=$('#periodLab'); if(pl) pl.textContent=tr('period');
  // หน้าที่ไม่ผูกกับงวดเดือน — ซ่อนตัวเลือกงวดเดือนด้านบน
  const pbox=$('#periodBox'); if(pbox) pbox.style.display = (PAGE==='resign'||PAGE==='employees'||PAGE==='leave') ? 'none' : '';
  renderPeriodSel();
  // ถ้าหน้าที่เปิดอยู่ถูกล็อก ให้เด้งกลับแดชบอร์ด
  if(pageLocked(PAGE)){ PAGE='dashboard'; savePage(PAGE); renderNav(); }
  const v = $('#view'); v.innerHTML='';
  if(TARGET_UID && MY_UID && TARGET_UID!==MY_UID) v.appendChild(adminBanner());
  // สำนักงานบัญชีที่ยังไม่ได้เลือกบริษัท — ให้เพิ่ม/เลือกบริษัทก่อน
  if(isFirm() && !CUR_CO && PAGE!=='companies' && PAGE!=='admin'){ PAGE='companies'; savePage(PAGE); renderNav(); }
  ({dashboard:vDashboard, employees:vEmployees, attend:vAttend, checkin:vCheckin, leave:vLeave, resign:vResign, advance:vAdvance, payroll:vPayroll, summary:vSummary,
    dept:vDept, detail:vDetail, slip:vSlip, wht:vWHT, pnd1:vPND1, sso:vSSO, settings:vSettings, feedback:vFeedback, orders:vOrders,
    admin:vAdmin, companies:vCompanies}[PAGE])(v);
}
