/* app.html · Supabase, ระบบหลายบริษัท, แพ็กเกจ, boot — ลำดับไฟล์มีผล (โหลดตามเลข) */
/* ---------- Cloud (Supabase) ---------- */
const SB_URL='https://sfzzswzyoqshlppsturd.supabase.co';
const SB_ANON='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNmenpzd3p5b3FzaGxwcHN0dXJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ4OTE1ODAsImV4cCI6MjEwMDQ2NzU4MH0.5IVEuvp6JM-JZUKGfCEoVgQ_CwiLLsU8tUJxbW85eac';
let sb=null;
try{ sb = window.supabase.createClient(SB_URL, SB_ANON); }catch(e){}

let MY_UID=null, MY_EMAIL='', TARGET_UID=null, TARGET_EMAIL='', IS_ADMIN=false, GUEST=false;
let _cloudT=null;
function cloudSaveDebounced(){
  if(!sb||!TARGET_UID) return;
  if(isFirm() && !CUR_CO) return;          // ยังไม่ได้เลือกบริษัท = ยังไม่มีที่ให้บันทึก
  clearTimeout(_cloudT); _cloudT=setTimeout(cloudSave, 1200);
}
async function cloudSave(){
  // ---- สำนักงานบัญชี: บันทึกลงแถวของบริษัทที่เปิดอยู่ ----
  if(isFirm()){
    try{
      if(!CUR_CO) return;
      const {core}=splitStores(DB);        // ไม่เก็บข้อมูลลงเวลา/ลางาน (ไม่มีในแบบสำนักงานบัญชี)
      const {error}=await sb.from('firm_stores')
        .upsert({company_id:CUR_CO, data:core, updated_at:new Date().toISOString()});
      if(error){ setSync('⚠️ ซิงก์ไม่สำเร็จ'); return; }
      const c=curCo();
      setSync('✓ บันทึก '+(c? c.name : '')+' แล้ว');
    }catch(e){ setSync('⚠️ ซิงก์ไม่สำเร็จ'); }
    return;
  }
  try{ if(!TARGET_UID) return;
    const {core, prem}=splitStores(DB);
    const {error}=await sb.from('payroll_stores').upsert({user_id:TARGET_UID, data:core});
    if(error){
      // ฐานข้อมูลปฏิเสธเพราะเกินโควตาพนักงาน — บอกให้ชัดว่าเกิดอะไรขึ้น
      if(isEmpLimitError(error)){
        setSync('🔒 เกินจำนวนพนักงานของแพ็กเกจ — ยังไม่ได้บันทึกขึ้นคลาวด์');
        toast('🔒 '+(quotaMsg()||'เกินจำนวนพนักงานที่แพ็กเกจรองรับ'));
      } else setSync('⚠️ ซิงก์ไม่สำเร็จ');
      return;
    }
    // ข้อมูลพรีเมี่ยมเก็บอีกตาราง — ถ้าไม่มีสิทธิ์ ฐานข้อมูลจะปฏิเสธเอง
    if(hasPremium()){
      const {error:e2}=await sb.from('premium_stores')
        .upsert({user_id:TARGET_UID, data:prem, updated_at:new Date().toISOString()});
      if(e2){ setSync('✓ บันทึกเงินเดือนแล้ว · ⚠️ ข้อมูลพรีเมี่ยมบันทึกไม่ได้'); return; }
    }
    setSync('✓ บันทึกขึ้นคลาวด์แล้ว');
  }catch(e){ setSync('⚠️ ซิงก์ไม่สำเร็จ'); }
}
async function cloudLoad(uid){
  // ดึงสองตารางพร้อมกัน — ข้อมูลพรีเมี่ยมถ้าไม่มีสิทธิ์ RLS จะคืนค่าว่าง (ไม่ error)
  const [r1,r2]=await Promise.all([
    sb.from('payroll_stores').select('data').eq('user_id',uid).maybeSingle(),
    Promise.resolve(sb.from('premium_stores').select('data').eq('user_id',uid).maybeSingle()).catch(()=>({}))
  ]);
  const data=r1&&r1.data, pd=r2&&r2.data;
  let merged = (data && data.data && data.data.employees) ? data.data : null;
  if(merged && pd && pd.data) Object.assign(merged, pd.data);
  if(merged){ localStorage.setItem(LS_KEY, JSON.stringify(merged)); }
  else { localStorage.removeItem(LS_KEY); }   // ไม่มีข้อมูลบนคลาวด์ → เริ่มว่าง (กันข้อมูลค้างของคนก่อน)
  DB=load();
}

/* ============================================================
   ระบบหลายบริษัท — สำนักงานบัญชี
   ============================================================ */
async function fetchCompanies(){
  const [r,rq]=await Promise.all([
    sb.from('firm_companies')
      .select('id,name,tax_id,branch,note,archived,created_at')
      .eq('owner_id', TARGET_UID)
      .order('archived',{ascending:true}).order('created_at',{ascending:true}),
    Promise.resolve(sb.rpc('my_company_quota')).catch(()=>({}))
  ]);
  if(rq&&rq.data&&rq.data[0]) CO_QUOTA=rq.data[0].max_companies;
  const {data,error}=r;
  if(error){ COMPANIES=[]; return error; }
  COMPANIES=data||[];
  return null;
}
/* เปิดบริษัทหนึ่งขึ้นมาทำงาน — เปลี่ยนทั้งคีย์ในเครื่องและข้อมูลบนคลาวด์ */
async function openCompany(id){
  clearTimeout(_cloudT);                    // ยกเลิกคิวบันทึกของบริษัทก่อนหน้า กันเขียนผิดแถว
  CUR_CO=id;
  try{ localStorage.setItem(CO_KEY, id||''); }catch(e){}
  setStoreKey(id);
  if(!id){ DB=load(); return; }
  const {data}=await sb.from('firm_stores').select('data').eq('company_id',id).maybeSingle();
  const d=(data&&data.data&&data.data.employees)?data.data:null;
  if(d) localStorage.setItem(LS_KEY, JSON.stringify(d));
  else  localStorage.removeItem(LS_KEY);    // บริษัทใหม่ = เริ่มจากว่าง ไม่ใช่ข้อมูลบริษัทก่อนหน้า
  DB=load();
  // ชื่อบริษัทในระบบให้ตรงกับที่ตั้งไว้ในรายชื่อลูกค้า
  const c=curCo();
  if(c){
    if(!DB.company) DB.company={};
    if(!DB.company.name || DB.company.name==='บริษัท ตัวอย่าง จำกัด') DB.company.name=c.name;
    if(c.tax_id && !DB.company.taxId) DB.company.taxId=c.tax_id;
  }
}
async function switchCompany(id){
  if(id===CUR_CO) return;
  await openCompany(id);
  PAGE = pageAllowed(PAGE) ? PAGE : 'dashboard';
  renderNav(); render();
  const c=curCo(); toast('เปิด '+(c?c.name:'บริษัท')+' แล้ว');
}
async function createCompany(name, taxId, branch){
  if(coRoom()<1){ toast('🔒 '+coQuotaMsg()); return null; }
  const {data,error}=await sb.from('firm_companies')
    .insert({owner_id:TARGET_UID, name, tax_id:taxId||null, branch:branch||null})
    .select('id,name,tax_id,branch,note,archived,created_at').single();
  if(error){
    toast(isCoLimitError(error) ? ('🔒 '+(coQuotaMsg()||'เกินจำนวนบริษัทที่แพ็กเกจรองรับ'))
                                : ('เพิ่มบริษัทไม่สำเร็จ: '+error.message));
    return null;
  }
  COMPANIES.push(data);
  return data;
}
function setSync(t){ const f=$('#userFoot'); if(f&&f._email){ f.innerHTML=`☁️ ${esc(f._email)}${IS_ADMIN?' <span style="color:#fbbf24">👑</span>':''}<br><span style="opacity:.75">${t}</span> · <a href="#" id="logoutBtn" style="color:#a7f3d0">ออกจากระบบ</a>`; const b=$('#logoutBtn'); if(b) b.onclick=async(e)=>{ e.preventDefault(); await sb.auth.signOut(); clearAllStores(); localStorage.removeItem(PAGE_KEY); localStorage.removeItem(CO_KEY); location.reload(); }; } }

// แอดมิน: เปิดข้อมูลของผู้ใช้คนอื่นเพื่อดู/แก้
async function adminOpen(uid,email){ TARGET_UID=uid; TARGET_EMAIL=email; await cloudLoad(uid); PAGE='dashboard'; savePage(PAGE); renderNav(); render(); toast('เปิดข้อมูลของ '+email); }
async function adminBackToMine(){ TARGET_UID=MY_UID; TARGET_EMAIL=MY_EMAIL; await cloudLoad(MY_UID); PAGE='admin'; savePage(PAGE); renderNav(); render(); toast('กลับสู่ข้อมูลของฉัน'); }
function adminBanner(){
  const b=el(`<div class="panel" style="border:2px solid #d97706;background:#fffbeb"><div class="pbody" style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
    <span style="font-size:20px">👑</span><div><strong>โหมดแอดมิน</strong> — กำลังดู/แก้ไขข้อมูลของ <strong>${esc(TARGET_EMAIL)}</strong><br><span class="muted" style="font-size:12px">การแก้ไขจะบันทึกลงบัญชีของผู้ใช้คนนี้</span></div>
    <button class="btn ghost sm" id="backMine" style="margin-left:auto">↩️ กลับสู่ข้อมูลของฉัน</button></div></div>`);
  b.querySelector('#backMine').onclick=adminBackToMine; return b;
}
function fmtDateTime(s){ if(!s) return '-'; const d=new Date(s); return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()+543} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; }

function showLogin(msg){ $('#authGate').style.display='flex'; if(msg){ const m=$('#authMsg'); m.style.color='#dc2626'; m.textContent=msg; } }
let ACCESS={status:'trial',days_left:30,premium:true};

/* ---------- เพดานจำนวนพนักงานตามแพ็กเกจ ----------
   null = ไม่จำกัด (ช่วงทดลอง / แอดมิน / แพ็กเกจสั่งทำ)
   ตัวบังคับจริงคือทริกเกอร์ trg_emp_limit ในฐานข้อมูล — ตรงนี้ทำให้ผู้ใช้รู้ตัวก่อนกรอกเสียเที่ยว */
let EMP_QUOTA = null;
/* ---------- ระบบหลายบริษัท (สำนักงานบัญชี) ----------
   edition: single = บริษัทเดียว (ระบบเดิม) · firm = สำนักงานบัญชี
   แบบ firm ไม่จำกัดจำนวนพนักงาน แต่จำกัดจำนวนบริษัทแทน และไม่มีลงเวลา/ลางาน */
let EDITION='single';
const isFirm = ()=> EDITION==='firm';
let COMPANIES=[];        // บริษัทลูกค้าทั้งหมดของสำนักงานนี้
let CUR_CO=null;         // id บริษัทที่กำลังเปิดอยู่
let CO_QUOTA=null;       // เพดานจำนวนบริษัทตามแพ็กเกจ (null = ไม่จำกัด)
const CO_KEY='payroll_company';
const curCo = ()=> COMPANIES.find(c=>c.id===CUR_CO) || null;
const activeCos = ()=> COMPANIES.filter(c=>!c.archived);   // ที่ยังดูแลอยู่ — ใช้แสดงในตัวสลับบริษัท
/* โควตานับ "ทุกบริษัท" รวมที่เก็บเข้าคลังแล้ว — ต้องลบเท่านั้นถึงจะคืนโควตา */
const countedCos = ()=> COMPANIES;
function coLimit(){ return (CO_QUOTA===null||CO_QUOTA===undefined) ? null : +CO_QUOTA; }
function coRoom(){ const l=coLimit(); return l===null ? Infinity : Math.max(0, l-countedCos().length); }
function coQuotaMsg(){
  const l=coLimit();
  return l===null ? '' : `แพ็กเกจของคุณเพิ่มบริษัทได้สูงสุด ${l} บริษัท (ใช้ไปแล้ว ${countedCos().length} รวมที่เก็บเข้าคลัง) — ลบบริษัทที่ไม่ใช้แล้ว หรืออัปเกรดแพ็กเกจ`;
}
function isCoLimitError(err){
  const m=String((err&&(err.message||err.hint))||'');
  return m.includes('COMPANY_LIMIT') || m.includes('upgrade_plan');
}

function empLimit(){ return isFirm() ? null : ((EMP_QUOTA===null || EMP_QUOTA===undefined) ? null : +EMP_QUOTA); }
function empUsed(){ return DB.employees.filter(e=>!e.resignDate).length; }   // คนที่ลาออกแล้วไม่กินโควตา
function empRoom(){ const l=empLimit(); return l===null ? Infinity : Math.max(0, l-empUsed()); }
function canAddEmp(n){ return empRoom() >= (n||1); }
function quotaMsg(){
  const l=empLimit();
  return l===null ? '' : `แพ็กเกจของคุณรองรับพนักงานสูงสุด ${l} คน (ใช้ไปแล้ว ${empUsed()} คน) — กรุณาอัปเกรดแพ็กเกจ`;
}
/* แปลงข้อผิดพลาดจากฐานข้อมูลให้เป็นภาษาคน */
function isEmpLimitError(err){
  const m=String((err&&(err.message||err.hint))||'');
  return m.includes('EMP_LIMIT') || m.includes('upgrade_plan');
}

/* เมนูที่ต้องซื้อแพ็กเกจพรีเมี่ยม (ช่วงทดลอง 30 วันใช้ได้ครบ)
   ล็อกหน้า "เวลาเข้างาน" = ล็อกระบบกะและกฎ OT ที่อยู่ในหน้านั้นไปด้วย */
const PREMIUM_PAGES = ['attend','checkin','leave','advance'];
/* ข้อมูลของฟีเจอร์พรีเมี่ยม — เก็บคนละตารางกับข้อมูลเงินเดือน
   ตาราง premium_stores มี RLS กั้นไว้ คนที่ไม่มีสิทธิ์อ่าน/เขียนไม่ได้จริง ๆ */
const PREMIUM_KEYS = ['attend','leave','shifts','shiftPlan','otWeekdays','otDates','otMaxDay','leaveQuota','leaveHoursPerDay'];
function splitStores(db){
  const core={}, prem={};
  Object.keys(db).forEach(k=>{ (PREMIUM_KEYS.includes(k)?prem:core)[k]=db[k]; });
  return {core, prem};
}
// ครบสิทธิ์เมื่อ: ยังทดลองอยู่ · เป็นแอดมิน · หรือจ่ายแบบพรีเมี่ยม
function hasPremium(){
  if(ACCESS.premium !== undefined) return !!ACCESS.premium;   // ค่าจากเซิร์ฟเวอร์ = ตัวตัดสิน
  return true;   // เซิร์ฟเวอร์ยังไม่รายงานระดับแพ็กเกจ (ยังไม่รัน SQL) → ไม่ล็อกใคร
                 // กันเผลอล็อกลูกค้าที่จ่ายเงินแล้ว — การล็อกต้องมาจากเซิร์ฟเวอร์เท่านั้น
}
function pageLocked(id){ return PREMIUM_PAGES.includes(id) && !hasPremium(); }
// หมดสิทธิ์แล้ว → ล้างข้อมูลพรีเมี่ยมที่ค้างในเครื่อง ไม่ให้เห็นของเก่า
function clearPremiumLocal(){
  const d=structuredClone(DEFAULT);
  PREMIUM_KEYS.forEach(k=>{ DB[k]=d[k]; });
  try{ localStorage.setItem(LS_KEY, JSON.stringify(DB)); }catch(e){}
}
async function afterAuth(user){
  $('#authGate').style.display='none';
  MY_UID=user.id; MY_EMAIL=user.email; TARGET_UID=MY_UID; TARGET_EMAIL=MY_EMAIL;
  const f=$('#userFoot'); if(f) f._email=user.email;
  sb.from('profiles').upsert({id:user.id, email:user.email}).then(()=>{},()=>{});   // ให้แอดมินเห็นอีเมล (ไม่ต้องรอ)
  // ยิงพร้อมกัน ไม่ต่อคิวทีละตัว — เดิมรอทีละคำขอทำให้หน้าว่างนาน
  const q=p=>Promise.resolve(p).then(r=>r,()=>({}));
  const [rAdmin,rAccess,rQuota]=await Promise.all([q(sb.rpc('is_admin')), q(sb.rpc('my_access')), q(sb.rpc('my_emp_quota'))]);
  IS_ADMIN=!!(rAdmin&&rAdmin.data);
  // เช็คสิทธิ์ใช้งาน (ทดลอง 30 วัน / แพ็กเกจ)
  if(rAccess&&rAccess.data&&rAccess.data[0]){ ACCESS=rAccess.data[0]; EDITION=ACCESS.edition||'single'; }
  if(rQuota&&rQuota.data&&rQuota.data[0]) EMP_QUOTA=rQuota.data[0].max_employees;
  // เพิ่งสมัครและเลือก "สำนักงานบัญชี" ไว้ → ตั้งให้แล้วอ่านสิทธิ์ใหม่
  if(await applyPendingEdition(MY_UID)){
    try{ const {data}=await sb.rpc('my_access');
         if(data&&data[0]){ ACCESS=data[0]; EDITION=ACCESS.edition||'single'; } }catch(e){}
    try{ const {data}=await sb.rpc('my_emp_quota'); if(data&&data[0]) EMP_QUOTA=data[0].max_employees; }catch(e){}
  }
  // เพดานจำนวนพนักงานตามแพ็กเกจ (ฐานข้อมูลเป็นคนบังคับจริง อันนี้แค่เอามาแสดง/กันไว้ก่อน)
  if(ACCESS.status==='expired'){ showExpired(); return; }

  if(isFirm()){
    // สำนักงานบัญชี — โหลดรายชื่อบริษัท แล้วเปิดบริษัทที่ค้างไว้ก่อนรีเฟรช
    await fetchCompanies();
    let want=null; try{ want=localStorage.getItem(CO_KEY); }catch(e){}
    const pick = activeCos().find(c=>c.id===want) || activeCos()[0] || null;
    await openCompany(pick ? pick.id : null);
  }else{
    setStoreKey(null);
    await cloudLoad(MY_UID);
    if(!hasPremium()) clearPremiumLocal();
  }
  PAGE = restorePage();          // กลับไปหน้าที่ค้างไว้ก่อนรีเฟรช
  renderNav(); render(); showTrialBar();
  setSync('พร้อมใช้งาน'); cloudSaveDebounced();
}
/* ---------- กล่องชวนอัปเกรดเป็นพรีเมี่ยม ---------- */
function premiumModal(pageId){
  const name = tr('nav_'+pageId);
  openModal('💎 ฟีเจอร์แพ็กเกจพรีเมี่ยม',
    `<p style="margin-bottom:12px"><strong>${esc(name)}</strong> อยู่ในแพ็กเกจ <strong>พรีเมี่ยม</strong>
       — แพ็กเกจปัจจุบันของคุณคือ <strong>มาตรฐาน</strong> (ระบบเงินเดือนครบทุกฟีเจอร์)</p>
     <div style="background:linear-gradient(140deg,#0b1b2b,#0e3a5c 55%,#0f766e);color:#fff;border-radius:14px;padding:16px 18px">
       <b>อัปเกรดแล้วได้เพิ่ม</b>
       <div style="display:grid;gap:7px;margin-top:10px;font-size:14px">
         <span>📱 สแกนใบหน้าลงเวลาผ่านมือถือ — เซลฟี่ + GPS ไม่ต้องซื้อเครื่องสแกน</span>
         <span>⏰ ลงเวลาเข้างาน — นำเข้า CSV คิดวันทำงาน/มาสาย/OT ส่งเข้าเงินเดือนอัตโนมัติ</span>
         <span>🔄 ระบบกะการทำงาน — กะข้ามคืน สลับกะยกชุด หมุนเวียนกะ</span>
         <span>⚡ กฎการคิด OT — เลือกวันที่คิด OT เปิดรายคน ตั้งเพดานต่อวัน</span>
         <span>🌴 ระบบลางาน — โควตาวันลา ลาเป็นชั่วโมง หักเงินขาดงาน</span>
       </div>
     </div>
     <p class="muted" style="font-size:12.5px;margin-top:12px">ข้อมูลเงินเดือนเดิมของคุณยังอยู่ครบ ไม่มีอะไรเปลี่ยน</p>`,
    [['ไว้ก่อน','ghost',closeModal],
     ['💎 ดูแพ็กเกจพรีเมี่ยม','',()=>{ window.open('pricing.html','_blank','noopener'); closeModal(); }]]);
}

/* ---------- แถบแจ้งวันทดลองที่เหลือ ---------- */
function showTrialBar(){
  const old=$('#trialBar'); if(old) old.remove();
  if(ACCESS.status!=='trial' && !(ACCESS.status==='active'&&ACCESS.days_left<=7)) return;
  const d=ACCESS.days_left, warn=d<=7;
  const bar=el(`<div id="trialBar" class="no-print" style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;
      padding:11px 18px;font-size:14px;border-bottom:1px solid ${warn?'#fcd34d':'#bfe5d3'};
      background:${warn?'#fffbeb':'#eaf6f1'};color:${warn?'#92400e':'#0e3a5c'}">
    <span>${warn?'⚠️':'🎁'} <strong>${ACCESS.status==='trial'?'ทดลองใช้ฟรี':'แพ็กเกจของคุณ'}</strong>
      เหลืออีก <strong>${d}</strong> วัน${warn?' — ต่ออายุเพื่อใช้งานต่อเนื่อง':''}${ACCESS.status==='trial'?' · ช่วงทดลองใช้ได้ครบทุกฟีเจอร์':''}</span>
    <a href="/pricing" class="btn sm" style="margin-left:auto;background:${warn?'#d97706':'#0e3a5c'};color:#fff">💳 ดูแพ็กเกจ</a>
  </div>`);
  const main=document.querySelector('.main'); main.insertBefore(bar, main.children[1]);
}
/* ---------- หน้าจอเมื่อหมดอายุ ---------- */
function showExpired(){
  document.querySelector('.app').style.display='none';
  const scr=el(`<div style="position:fixed;inset:0;background:linear-gradient(160deg,#f6faf8,#eaf6f1);z-index:300;
      display:flex;align-items:center;justify-content:center;padding:20px;overflow:auto">
    <div style="background:#fff;border-radius:20px;max-width:520px;width:100%;padding:38px 32px;text-align:center;
        box-shadow:0 26px 60px rgba(14,58,92,.22)">
      <div style="font-size:56px;line-height:1">⏳</div>
      <h2 style="font-size:25px;margin:12px 0 8px">หมดระยะทดลองใช้งานแล้ว</h2>
      <p style="color:#5b7186;margin-bottom:6px">บัญชี <strong>${esc(MY_EMAIL)}</strong></p>
      <p style="color:#5b7186;margin-bottom:22px">ทดลองใช้ฟรี 30 วันสิ้นสุดแล้ว กรุณาเลือกแพ็กเกจเพื่อใช้งานต่อ<br>
        <span style="font-size:13px">ข้อมูลของคุณยังถูกเก็บไว้ครบ และกลับมาใช้ได้ทันทีหลังชำระเงิน</span></p>
      <a href="/pricing" class="btn" style="width:100%;justify-content:center;padding:14px;font-size:16px;
         background:linear-gradient(135deg,#10b981,#0f766e);color:#fff;margin-bottom:10px">💳 เลือกแพ็กเกจ</a>
      <a href="/" class="btn ghost" style="width:100%;justify-content:center">← กลับหน้าแรก</a>
      <div style="margin-top:16px;font-size:13px;color:#5b7186">
        ชำระเงินแล้ว? <a href="#" id="reCheck" style="color:#0e3a5c;font-weight:700">ตรวจสอบสถานะอีกครั้ง</a>
        · <a href="#" id="expLogout" style="color:#5b7186">ออกจากระบบ</a>
      </div>
    </div></div>`);
  document.body.appendChild(scr);
  scr.querySelector('#reCheck').onclick=e=>{ e.preventDefault(); location.reload(); };
  scr.querySelector('#expLogout').onclick=async e=>{ e.preventDefault(); await sb.auth.signOut(); clearAllStores(); localStorage.removeItem(PAGE_KEY); localStorage.removeItem(CO_KEY); location.reload(); };
}
function enterGuest(){
  GUEST=true; MY_UID=null; TARGET_UID=null;
  $('#authGate').style.display='none';
  DB=load();
  const f=$('#userFoot'); if(f){ f.innerHTML='🧪 โหมดทดลอง (ไม่ได้ล็อกอิน)<br><span style="opacity:.75">ข้อมูลเก็บในเครื่องนี้เท่านั้น</span> · <a href="/app" style="color:#a7f3d0">เข้าสู่ระบบ/สมัคร</a>'; }
  renderNav(); render();
}
/* โหมดสาธิต: บริษัทตัวอย่าง 5 คน + จำลองระดับแพ็กเกจ
   ?demo         = แพ็กเกจมาตรฐาน (เวลาเข้างาน/ลางาน ถูกล็อก)
   ?demo=premium = แพ็กเกจพรีเมี่ยม (ใช้ได้ครบ)                         */
function enterDemo(){
  const q = new URLSearchParams(location.search).get('demo');
  const prem = (q==='premium');
  GUEST=true; MY_UID=null; TARGET_UID=null;
  $('#authGate').style.display='none';
  // ยังไม่มีข้อมูลสาธิต → สร้างใหม่ · มีแล้ว → ใช้ของเดิม (ผู้ใช้ลองแก้ไว้ไม่หาย)
  let d=null; try{ d=JSON.parse(localStorage.getItem(LS_KEY)); }catch(e){}
  if(!(d && d.employees && d.employees.length)){ DB=demoSeed(); save(); }
  DB=load();
  ACCESS={ status:'active', days_left:365, premium:prem,
           plan:'1-10 คน', plan_type: prem?'premium':'standard' };
  EMP_QUOTA = 10;         // แพ็กเกจ 1-10 คน — ให้เห็นการล็อกจำนวนพนักงานเหมือนของจริง
  demoFillPeriod();
  const f=$('#userFoot');
  if(f) f.innerHTML=`🧪 โหมดสาธิต · แพ็กเกจ${prem?'พรีเมี่ยม':'มาตรฐาน'}<br>`
    +`<span style="opacity:.75">ข้อมูลตัวอย่าง เก็บในเครื่องนี้เท่านั้น</span>`
    +` · <a href="#" id="demoReset" style="color:#a7f3d0">เริ่มใหม่</a>`;
  renderNav(); render();
  const rb=$('#demoReset');
  if(rb) rb.onclick=e=>{ e.preventDefault(); clearAllStores(); localStorage.removeItem(PAGE_KEY); localStorage.removeItem(CO_KEY); location.reload(); };
  demoBanner(prem);
}
function demoBanner(prem){
  if($('#demoBar')) return;
  const b=el(`<div id="demoBar" style="position:sticky;top:0;z-index:50;background:linear-gradient(120deg,#0e3a5c,#0f766e);
    color:#fff;padding:9px 16px;font-size:13.5px;display:flex;gap:12px;align-items:center;flex-wrap:wrap">
    <strong>🧪 โหมดสาธิต</strong>
    <span style="opacity:.9">ข้อมูลตัวอย่าง แก้ได้เต็มที่ ไม่กระทบของจริง — กำลังดูแบบ
      <strong>${prem?'พรีเมี่ยม':'มาตรฐาน'}</strong></span>
    <span style="margin-left:auto;display:flex;gap:8px;flex-wrap:wrap">
      <a href="/app?demo=${prem?'':'premium'}" style="background:rgba(255,255,255,.18);padding:5px 12px;border-radius:100px;color:#fff">
        ${prem?'↩ ดูแบบมาตรฐาน':'ดูแบบพรีเมี่ยม →'}</a>
      <a href="/pricing" style="background:#fff;color:#0e3a5c;font-weight:700;padding:5px 12px;border-radius:100px">ดูราคา</a>
    </span></div>`);
  document.body.insertBefore(b, document.body.firstChild);
}
async function boot(){
  if(DEMO){ enterDemo(); return; }
  const guest = new URLSearchParams(location.search).has('guest') || location.hash==='#guest';
  if(guest){ enterGuest(); return; }
  if(!sb || SB_ANON.indexOf('__PASTE')===0){ showLogin('ยังไม่ได้ตั้งค่า Supabase anon key ในไฟล์ (บรรทัด SB_ANON)'); return; }
  try{ const {data:{session}}=await sb.auth.getSession(); if(session){ afterAuth(session.user); return; } }catch(e){}
  showLogin();
}
async function doLogin(){
  const email=$('#authEmail').value.trim(), pass=$('#authPass').value; const m=$('#authMsg');
  m.style.color='#5b7186'; m.textContent='กำลังเข้าสู่ระบบ…';
  markPendingEdition();          // ถ้าผู้ใช้กดเลือกประเภทไว้ ให้มีผลกับบัญชีที่ยังไม่เคยจ่ายเงิน
  const {data,error}=await sb.auth.signInWithPassword({email,password:pass});
  if(error){ m.style.color='#dc2626'; m.textContent=error.message; return; }
  afterAuth(data.user);
}
/* ---------- ประเภทการใช้งานที่เลือกตอนสมัคร ----------
   มีผลเฉพาะบัญชีใหม่ที่ยังไม่เคยชำระเงิน — ผู้ใช้เดิมยึดตามแพ็กเกจที่ซื้อไว้เสมอ
   เก็บลง localStorage เพราะการสมัครด้วย Google ต้องออกไปหน้าอื่นแล้วเด้งกลับมา */
let SIGNUP_ED='single';
let SIGNUP_ED_TOUCHED=false;      // ผู้ใช้กดเลือกเองหรือยัง — ถ้าไม่ได้กด จะไม่ไปแตะบัญชีเขา
const PEND_ED='pending_edition';
function setSignupEd(v, byUser){
  SIGNUP_ED=v;
  if(byUser) SIGNUP_ED_TOUCHED=true;
  const s=$('#edPickS'), f=$('#edPickF'), n=$('#edPickNote');
  if(s) s.classList.toggle('on', v==='single');
  if(f) f.classList.toggle('on', v==='firm');
  if(n) n.textContent = v==='firm'
    ? 'ดูแลลูกค้าหลายบริษัทในบัญชีเดียว พนักงานไม่จำกัด (ไม่มีระบบลงเวลาและลางาน)'
    : 'ใช้กับบริษัทของคุณเอง มีครบทั้งลงเวลา ลางาน กะ และ OT';
}
/* บันทึกความตั้งใจไว้ก่อน เพราะการสมัครด้วย Google ต้องออกไปหน้าอื่นแล้วเด้งกลับ
   เขียนเฉพาะตอนที่ผู้ใช้กดเลือกเอง — ถ้าไม่ได้กด ถือว่าไม่ต้องการเปลี่ยนอะไร */
function markPendingEdition(force){
  if(!SIGNUP_ED_TOUCHED && !force) return;
  try{ localStorage.setItem(PEND_ED, JSON.stringify({ed:SIGNUP_ED, at:Date.now()})); }catch(e){}
}
/* ตั้งประเภทบัญชีตามที่เลือกไว้ — เปลี่ยนได้ทั้งสองทาง แต่เฉพาะบัญชีที่ยังไม่เคยจ่ายเงิน
   คนที่ซื้อแพ็กเกจแล้วยึดตามที่ซื้อเสมอ ห้ามเปลี่ยนจากหน้าเข้าสู่ระบบ */
async function applyPendingEdition(uid){
  let p=null; try{ p=JSON.parse(localStorage.getItem(PEND_ED)||'null'); }catch(e){}
  if(!p || !p.ed) return false;
  const fresh = (Date.now()-(+p.at||0)) < 15*60*1000;      // เกิน 15 นาที ถือว่าไม่ใช่การกดรอบนี้
  try{ localStorage.removeItem(PEND_ED); }catch(e){}
  if(!fresh) return false;
  if(!['single','firm'].includes(p.ed)) return false;
  if(ACCESS.paid_until) return false;                       // เคยจ่ายแล้ว = ยึดตามแพ็กเกจที่ซื้อ
  if((ACCESS.edition||'single')===p.ed) return false;       // ตรงกับของเดิมอยู่แล้ว ไม่ต้องเขียน
  const {error}=await sb.from('profiles').update({edition:p.ed}).eq('id',uid);
  if(error) return false;
  EDITION=p.ed; ACCESS.edition=p.ed;
  return true;
}
async function doSignup(){
  const email=$('#authEmail').value.trim(), pass=$('#authPass').value; const m=$('#authMsg');
  if(pass.length<6){ m.style.color='#dc2626'; m.textContent='รหัสผ่านอย่างน้อย 6 ตัวอักษร'; return; }
  m.style.color='#5b7186'; m.textContent='กำลังสมัคร…';
  markPendingEdition(true);      // สมัครใหม่ = ยึดตามที่เลือกเสมอ
  const {data,error}=await sb.auth.signUp({email,password:pass});
  if(error){ m.style.color='#dc2626'; m.textContent=error.message; return; }
  if(data.session){ afterAuth(data.user); }
  else { m.style.color='#059669';
         m.textContent='สมัครสำเร็จ! กรุณายืนยันอีเมลก่อน แล้วเข้าสู่ระบบ'; }
}

/* ---------- Boot ---------- */
/* ---------- เมนู drawer (มือถือ) ---------- */
function sideOpen(on){ $('#side').classList.toggle('open',on); $('#sideOverlay').classList.toggle('on',on); }
$('#menuBtn').onclick=()=>sideOpen(!$('#side').classList.contains('open'));
$('#sideOverlay').onclick=()=>sideOpen(false);
window.addEventListener('keydown',e=>{ if(e.key==='Escape') sideOpen(false); });

const themeBtn=$('#themeToggle');
if(themeBtn){
  const paint=()=>{ const d=document.documentElement.getAttribute('data-theme')==='dark';
    themeBtn.textContent=d?'☀️ โหมดสว่าง':'🌙 โหมดมืด'; };
  paint();
  themeBtn.onclick=()=>{ const t=document.documentElement.getAttribute('data-theme')==='dark'?'light':'dark';
    document.documentElement.setAttribute('data-theme',t); try{ localStorage.setItem('esp_theme',t); }catch(e){} paint(); };
}
const langBtn=$('#langToggle');
if(langBtn){ langBtn.textContent = LANG==='th'?'🌐 EN':'🌐 TH';
  langBtn.onclick=()=>{ LANG = LANG==='th'?'en':'th'; localStorage.setItem('lang',LANG); langBtn.textContent = LANG==='th'?'🌐 EN':'🌐 TH'; renderNav(); render(); }; }
$('#authLogin').onclick=doLogin;
$('#authSignup').onclick=doSignup;
$('#edPickS').onclick=()=>setSignupEd('single',true);
$('#edPickF').onclick=()=>setSignupEd('firm',true);
setSignupEd('single');   // ตั้งค่าเริ่มต้น ไม่นับว่าผู้ใช้เลือก
$('#authGoogle').onclick=async()=>{
  const m=$('#authMsg'); m.style.color='#5b7186'; m.textContent='กำลังเปิดหน้าเข้าสู่ระบบ Google…';
  markPendingEdition();      // Google ต้องออกไปหน้าอื่นแล้วเด้งกลับ ต้องจำไว้ก่อน
  const {error}=await sb.auth.signInWithOAuth({ provider:'google', options:{ redirectTo: window.location.origin + window.location.pathname } });
  if(error){ m.style.color='#dc2626'; m.textContent='เข้าสู่ระบบด้วย Google ไม่สำเร็จ: '+error.message; }
};
$('#authPass').addEventListener('keydown',e=>{ if(e.key==='Enter') doLogin(); });
window.addEventListener('keydown',e=>{ if(e.key==='Escape') closeModal(); });
boot();
