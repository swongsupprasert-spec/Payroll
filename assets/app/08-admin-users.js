/* app.html · แอดมิน — รายชื่อผู้ใช้ — ลำดับไฟล์มีผล (โหลดตามเลข) */
/* ============ ADMIN — รายชื่อผู้ใช้ทั้งหมด ============ */
/* จำการเปลี่ยนสิทธิ์ครั้งล่าสุดไว้ เผื่อแอดมินกดผิดแล้วอยากย้อนกลับ */
let LAST_PLAN=null;
const isPrem=u=>String(u.plan_type||'standard')==='premium';
const isFirmU=u=>String(u.edition||'single')==='firm';
/* ป้ายบอกระดับแพ็กเกจ — ช่วงทดลองใช้ได้ครบทุกฟีเจอร์อยู่แล้ว บอกไว้กันเข้าใจผิด */
function planBadge(u,s){
  const prem=isPrem(u);
  const cap = u.max_employees ? `สูงสุด ${u.max_employees} คน` : 'ไม่จำกัดจำนวนคน';
  const firm = isFirmU(u);
  const tag = firm
    ? '<span class="chip" style="background:#f3e8ff;color:#7e22ce;font-weight:700">🏦 สำนักงานบัญชี</span>'
    : (prem
      ? '<span class="chip" style="background:#ede9fe;color:#6d28d9;font-weight:700">💎 พรีเมี่ยม</span>'
      : '<span class="chip" style="background:#e2e8f0;color:#475569;font-weight:700">มาตรฐาน</span>');
  const coCap = u.max_companies ? `สูงสุด ${u.max_companies} บริษัท` : 'ไม่จำกัดจำนวนบริษัท';
  const note = firm
    ? `<br><span class="muted" style="font-size:11.5px">${coCap} · พนักงานไม่จำกัด</span>`
    : ((s.t==='ทดลองใช้')
      ? '<br><span class="muted" style="font-size:11.5px">ช่วงทดลอง — ใช้ได้ครบทุกฟีเจอร์</span>'
      : `<br><span class="muted" style="font-size:11.5px">${cap}</span>`);
  return tag+note;
}
async function applyPlan(u, patch, msg){
  const prev={ id:u.id, email:u.email, paid_until:u.paid_until??null, plan:u.plan??null,
               plan_type:u.plan_type??null, max_employees:u.max_employees??null,
               edition:u.edition??null, max_companies:u.max_companies??null, msg };
  const {error}=await sb.from('profiles').update(patch).eq('id',u.id);
  if(error){ toast('ไม่สำเร็จ: '+error.message); return false; }
  LAST_PLAN=prev;      // บันทึกค่าเดิม "หลัง" อัปเดตสำเร็จเท่านั้น
  toast(msg); render(); return true;
}
async function vAdmin(v){
  v.appendChild(el(`<div class="toolbar"><h2 style="font-size:16px">👑 รายชื่อผู้ใช้ที่สมัครทั้งหมด</h2>
    <button class="btn ghost sm" id="refreshUsers" style="margin-left:auto">↻ รีเฟรช</button></div>`));
  const panel=el(`<div class="panel"><div class="pbody" style="padding:0"><div class="tbl-wrap" id="usersTbl"><div class="empty">กำลังโหลด…</div></div></div></div>`);
  v.appendChild(panel);
  $('#refreshUsers').onclick=()=>render();
  const {data,error}=await sb.from('profiles')
    .select('id,email,created_at,paid_until,plan,plan_type,max_employees,edition,max_companies,trial_days')
    .order('created_at',{ascending:false});
  const box=$('#usersTbl'); if(!box) return;
  if(error){ box.innerHTML=`<div class="empty">โหลดไม่ได้: ${esc(error.message)}</div>`; return; }
  // แถบย้อนกลับ — โผล่หลังเพิ่งเปลี่ยนสิทธิ์ เผื่อกดผิด
  if(LAST_PLAN){
    const before = LAST_PLAN.paid_until ? fmtDate(LAST_PLAN.paid_until.slice(0,10)) : 'ยังไม่เคยชำระเงิน';
    const bar=el(`<div class="panel" style="border:2px solid #f59e0b;background:#fffbeb;margin-bottom:12px"><div class="pbody"
      style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">
      <span style="font-size:20px">↩️</span>
      <div><strong>เพิ่งเปลี่ยนสิทธิ์ของ ${esc(LAST_PLAN.email||'')}</strong><br>
        <span class="muted" style="font-size:13px">${esc(LAST_PLAN.msg||'')}<br>ค่าเดิมก่อนเปลี่ยน: <b>${esc(before)}</b></span></div>
      <button class="btn sm" id="undoPlan" style="margin-left:auto">↩️ ย้อนกลับเป็นค่าเดิม</button>
      <button class="btn ghost sm" id="dismissUndo">ปิด</button>
    </div></div>`);
    v.insertBefore(bar, panel);      // ให้อยู่เหนือตาราง จะได้เห็นทันที
    bar.querySelector('#undoPlan').onclick=async()=>{
      const p=LAST_PLAN; LAST_PLAN=null;          // ล้างก่อน กันบันทึกการย้อนกลับเป็นรายการใหม่
      const {error}=await sb.from('profiles').update({paid_until:p.paid_until, plan:p.plan,
        plan_type:p.plan_type, max_employees:p.max_employees,
        edition:p.edition, max_companies:p.max_companies}).eq('id',p.id);
      toast(error ? ('ย้อนกลับไม่สำเร็จ: '+error.message) : `↩️ คืนค่าเดิมของ ${p.email} แล้ว`);
      render();
    };
    bar.querySelector('#dismissUndo').onclick=()=>{ LAST_PLAN=null; render(); };
  }
  // สถานะสิทธิ์ใช้งานของแต่ละคน
  const FOREVER=Date.now()+3650*864e5;   // เกิน 10 ปี = ถือว่าไม่จำกัด
  const stat=u=>{
    const now=Date.now();
    const trialEnd=new Date(u.created_at).getTime()+ (u.trial_days||30)*864e5;
    const paid=u.paid_until?new Date(u.paid_until).getTime():0;
    if(paid>FOREVER) return {t:'♾️ ไม่จำกัด',c:'#ede9fe;color:#6d28d9',d:0,e:null,unlimited:true};
    if(paid>now) return {t:'ชำระแล้ว',c:'#dcfce7;color:#16a34a',d:Math.ceil((paid-now)/864e5),e:u.paid_until};
    if(trialEnd>now) return {t:'ทดลองใช้',c:'#dbeafe;color:#1d4ed8',d:Math.ceil((trialEnd-now)/864e5),e:new Date(trialEnd).toISOString()};
    if((u.edition||'single')==='single') return {t:'ฟรี 1-10 คน',c:'#f1f5f9;color:#475569',d:0,e:null};
    return {t:'หมดอายุ',c:'#fee2e2;color:#dc2626',d:0,e:u.paid_until||new Date(trialEnd).toISOString()};
  };
  const rows=(data||[]).map(u=>{ const s=stat(u); return `<tr>
    <td><strong>${esc(u.email||'(ไม่มีอีเมล)')}</strong>${u.id===MY_UID?' <span class="chip">คุณ</span>':''}
      ${u.plan?`<br><span class="muted" style="font-size:12px">${esc(u.plan)}</span>`:''}</td>
    <td>${esc(fmtDateTime(u.created_at))}</td>
    <td><span class="chip" style="background:${s.c}">${s.t}</span>
      ${s.d?`<br><span class="muted" style="font-size:12px">เหลือ ${s.d} วัน</span>`:''}</td>
    <td>${s.unlimited?'<b style="color:#6d28d9">ตลอดไป</b>':(s.e?esc(fmtDate(s.e.slice(0,10))):'-')}</td>
    <td>${planBadge(u,s)}</td>
    <td style="text-align:right;white-space:nowrap">
      <button class="btn ghost sm" data-ext="${u.id}" data-mo="1" title="ต่ออายุ 1 เดือน">➕1 เดือน</button>
      <button class="btn ghost sm" data-ext="${u.id}" data-mo="12" title="ต่ออายุ 1 ปี">➕1 ปี</button>
      <button class="btn ghost sm" data-pt="${u.id}" title="สลับระดับแพ็กเกจ">⇄ ${isPrem(u)?'เป็นมาตรฐาน':'เป็นพรีเมี่ยม'}</button>
      ${s.unlimited
        ? `<button class="btn ghost sm" data-unl="${u.id}" data-off="1" title="ยกเลิกสิทธิ์ไม่จำกัด">↩️ ยกเลิกไม่จำกัด</button>`
        : `<button class="btn ghost sm" data-unl="${u.id}" title="ให้ใช้งานได้ตลอดไป">♾️ ไม่จำกัด</button>`}
      <button class="btn ghost sm" data-edt="${u.id}" title="แก้ไขสิทธิ์ทั้งหมด">⚙️ แก้สิทธิ์</button>
      <button class="btn sm" data-open="${u.id}" data-email="${esc(u.email||'')}">✏️ ดูข้อมูล</button></td>
  </tr>`;}).join('');
  const tbl=el(`<table><thead><tr><th>อีเมล</th><th>สมัครเมื่อ</th><th>สถานะ</th><th>ใช้ได้ถึง</th><th>แพ็กเกจ</th><th></th></tr></thead>
    <tbody>${rows||'<tr><td colspan="6" class="empty">ยังไม่มีผู้ใช้</td></tr>'}</tbody></table>`);
  tbl.querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>adminOpen(b.dataset.open, b.dataset.email));
  // ♾️ ให้/ยกเลิกสิทธิ์ใช้งานไม่จำกัด
  tbl.querySelectorAll('[data-unl]').forEach(b=>b.onclick=async()=>{
    const u=data.find(x=>x.id===b.dataset.unl), off=b.dataset.off==='1';
    await applyPlan(u, {paid_until: off?null:'2099-12-31T23:59:59Z', plan: off?null:'ไม่จำกัด'},
      off ? `ยกเลิกสิทธิ์ไม่จำกัดของ ${u.email} แล้ว` : `♾️ ${u.email} ใช้งานได้ตลอดไปแล้ว`);
  });
  // ➕ ต่ออายุ 1 เดือน / 1 ปี — ต่อจากวันหมดอายุเดิม (ถ้ายังไม่หมด) ไม่ใช่ทับของเดิม
  tbl.querySelectorAll('[data-ext]').forEach(b=>b.onclick=async()=>{
    const u=data.find(x=>x.id===b.dataset.ext);
    const mo=+b.dataset.mo||1;
    const base=new Date(Math.max(Date.now(), u.paid_until?new Date(u.paid_until).getTime():0));
    base.setMonth(base.getMonth()+mo);
    await applyPlan(u, {paid_until: base.toISOString()},
      `✅ ต่ออายุ ${u.email} อีก ${mo===12?'1 ปี':mo+' เดือน'} → ถึง ${fmtDate(base.toISOString().slice(0,10))}`);
  });
  // ⇄ สลับระดับแพ็กเกจเร็ว ๆ (มาตรฐาน ↔ พรีเมี่ยม)
  tbl.querySelectorAll('[data-pt]').forEach(b=>b.onclick=async()=>{
    const u=data.find(x=>x.id===b.dataset.pt);
    const to = isPrem(u) ? 'standard' : 'premium';
    await applyPlan(u, {plan_type: to},
      to==='premium' ? `💎 ${u.email} เป็นพรีเมี่ยมแล้ว (ปลดล็อกลงเวลา/ลางาน)`
                     : `${u.email} เปลี่ยนเป็นมาตรฐานแล้ว (ล็อกลงเวลา/ลางาน)`);
  });
  // ⚙️ แก้สิทธิ์ทั้งหมดในที่เดียว — วันหมดอายุ + ระดับแพ็กเกจ + เพดานพนักงาน
  tbl.querySelectorAll('[data-edt]').forEach(b=>b.onclick=()=>{
    const u=data.find(x=>x.id===b.dataset.edt);
    const cur=u.paid_until? u.paid_until.slice(0,10) : '';
    const prem=isPrem(u);
    openModal('แก้สิทธิ์ — '+(u.email||''), `
      <div class="field"><label>ใช้งานได้ถึงวันที่</label>
        <input type="date" id="pd_date" value="${esc(cur)}"></div>
      <div class="muted" style="font-size:12.5px;margin:-6px 0 12px">
        ค่าปัจจุบัน <b>${cur?esc(fmtDate(cur)):'ยังไม่เคยชำระเงิน'}</b> ·
        <b>เว้นว่าง</b> = ล้างสิทธิ์ที่ชำระแล้ว กลับไปนับช่วงทดลองตามวันสมัคร
      </div>

      <div class="field"><label>ระดับแพ็กเกจ</label>
        <select id="pd_type">
          <option value="standard" ${prem?'':'selected'}>มาตรฐาน — ไม่มีลงเวลาเข้างาน / ลางาน</option>
          <option value="premium"  ${prem?'selected':''}>💎 พรีเมี่ยม — ใช้ได้ครบทุกฟีเจอร์</option>
        </select></div>

      <div class="field"><label>ประเภทบัญชี</label>
        <select id="pd_ed">
          <option value="single" ${isFirmU(u)?'':'selected'}>บริษัทเดียว — ระบบเดิม</option>
          <option value="firm"   ${isFirmU(u)?'selected':''}>🏦 สำนักงานบัญชี — หลายบริษัท ไม่จำกัดพนักงาน</option>
        </select></div>

      <div class="field"><label>จำนวนพนักงานสูงสุด <span style="color:#94a3b8;font-size:11px">(เฉพาะแบบบริษัทเดียว)</span></label>
        <input type="number" id="pd_max" min="0" step="1" value="${u.max_employees||''}" placeholder="เว้นว่าง = ไม่จำกัด"></div>

      <div class="field"><label>จำนวนบริษัทสูงสุด <span style="color:#94a3b8;font-size:11px">(เฉพาะแบบสำนักงานบัญชี)</span></label>
        <input type="number" id="pd_co" min="0" step="1" value="${u.max_companies||''}" placeholder="เว้นว่าง = ไม่จำกัด"></div>
      <div class="muted" style="font-size:12.5px;margin-top:-6px;line-height:1.7">
        ตามแพ็กเกจปกติ: 10 · 30 · 50 · 80 · 100 คน<br>
        นับเฉพาะพนักงานที่ยังทำงานอยู่ คนที่ลาออกแล้วไม่กินโควตา
      </div>`,
      [['ยกเลิก','ghost',closeModal],['บันทึก','',async()=>{
        const v=$('#pd_date').value;
        const t=$('#pd_type').value;
        const mx=$('#pd_max').value.trim();
        const ed=$('#pd_ed').value;
        const mc=$('#pd_co').value.trim();
        closeModal();
        const parts=[];
        if(v!==cur) parts.push(v?('หมดอายุ '+fmtDate(v)):'ล้างสิทธิ์ที่ชำระแล้ว');
        if(t!==(u.plan_type||'standard')) parts.push(t==='premium'?'เป็นพรีเมี่ยม':'เป็นมาตรฐาน');
        if(String(mx)!==String(u.max_employees??'')) parts.push('สูงสุด '+(mx?mx+' คน':'ไม่จำกัด'));
        if(ed!==(u.edition||'single')) parts.push(ed==='firm'?'เป็นสำนักงานบัญชี':'เป็นบริษัทเดียว');
        if(String(mc)!==String(u.max_companies??'')) parts.push('สูงสุด '+(mc?mc+' บริษัท':'ไม่จำกัดบริษัท'));
        if(!parts.length){ toast('ไม่มีอะไรเปลี่ยน'); return; }
        await applyPlan(u, {
          paid_until: v ? v+'T23:59:59Z' : null,
          plan_type: t,
          max_employees: mx==='' ? null : (+mx||null),
          edition: ed,
          max_companies: mc==='' ? null : (+mc||null)
        }, `⚙️ ${u.email}: ${parts.join(' · ')}`);
      }]]);
  });
  box.innerHTML=''; box.appendChild(tbl);
}

