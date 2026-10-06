/* app.html · ข้อมูลพนักงาน — ลำดับไฟล์มีผล (โหลดตามเลข) */
/* ============ 1. EMPLOYEES ============ */
let empSearch='', empFilter='all';
// พนักงานที่ยังทำงานอยู่ (คนลาออกแล้วดูได้ที่เมนู "การลาออก")
function empActiveList(){ return DB.employees.filter(e=>!e.resignDate); }
// รายชื่อพนักงานที่แสดงอยู่ (ตามตัวกรอง + คำค้น) — ใช้ร่วมกับตารางและการส่งออก CSV
function empVisibleList(){
  const q=empSearch.trim().toLowerCase();
  return empActiveList()
    .filter(e=> empFilter==='all' || (e.payType||'monthly')===empFilter)
    .filter(e=> !q || [e.code,e.name,e.position,e.dept].some(x=>String(x||'').toLowerCase().includes(q)));
}
function vEmployees(v){
  const baseList=empActiveList();
  const mC=baseList.filter(e=>(e.payType||'monthly')==='monthly').length;
  const dC=baseList.filter(e=>e.payType==='daily').length;
  const outCount=DB.employees.length-baseList.length;

  /* ---- การ์ดสรุปข้อมูลพนักงานที่ควรรู้ ---- */
  if(baseList.length){
    const today=new Date(); today.setHours(0,0,0,0);
    const dOf=s=>{ const m=/^(\d{4})-(\d{2})-(\d{2})/.exec(s||''); return m?new Date(+m[1],+m[2]-1,+m[3]):null; };
    const days=s=>{ const d=dOf(s); return d?Math.floor((today-d)/864e5):null; };
    const male=baseList.filter(e=>e.gender==='M').length, female=baseList.filter(e=>e.gender==='F').length;
    const depts=new Set(baseList.map(e=>(e.dept||'').trim()).filter(Boolean)).size;
    const monthly=baseList.filter(e=>(e.payType||'monthly')==='monthly'), daily=baseList.filter(e=>e.payType==='daily');
    const mSum=monthly.reduce((s,e)=>s+(+e.salary||0),0), dSum=daily.reduce((s,e)=>s+(+e.salary||0),0);
    const tenure=baseList.map(e=>days(e.startDate)).filter(x=>x!=null&&x>=0);
    const avgD=tenure.length?tenure.reduce((a,b)=>a+b,0)/tenure.length:0;
    const avgY=Math.floor(avgD/365), avgM=Math.floor((avgD%365)/30.4);
    const newbies=baseList.filter(e=>{ const x=days(e.startDate); return x!=null&&x>=0&&x<=90; }).length;
    /* ทดลองงาน: ยังทำงานไม่ครบ 119 วัน (เลิกจ้างก่อนครบ ไม่ต้องจ่ายค่าชดเชย) */
    const prob=baseList.map(e=>({e,d:days(e.startDate)})).filter(x=>x.d!=null&&x.d>=0&&x.d<119).sort((a,b)=>b.d-a.d);
    const miss=baseList.map(e=>{ const m=[];
      if(!/^[0-9]{13}$/.test(String(e.taxId||'').trim())) m.push('เลขบัตรประชาชน');
      if(!String(e.bankNo||'').trim()) m.push('เลขบัญชีธนาคาร');
      if(!e.startDate) m.push('วันเริ่มงาน');
      if(!String(e.dept||'').trim()) m.push('แผนก');
      return {e,m}; }).filter(x=>x.m.length);
    const sub=t=>`<div class="muted" style="font-size:12.5px;margin-top:6px;line-height:1.5">${t}</div>`;
    const cards=el(`<div class="cards">
      <div class="kpi b1"><div class="lab">👥 พนักงานปัจจุบัน</div><div class="val">${num(baseList.length)} <span class="muted" style="font-size:14px">คน</span></div>
        ${sub([male?`♂ ชาย ${num(male)}`:'',female?`♀ หญิง ${num(female)}`:'',depts?`${num(depts)} แผนก`:''].filter(Boolean).join(' · ')||'&nbsp;')}</div>
      <div class="kpi b2"><div class="lab">💵 ค่าจ้างรายเดือนรวม</div><div class="val money">${money(mSum)}</div>
        ${sub(`${num(monthly.length)} คนรายเดือน${daily.length?` · รายวัน ${num(daily.length)} คน รวม ${money(dSum)} /วัน`:''}`)}</div>
      <div class="kpi b5"><div class="lab">⏳ อายุงานเฉลี่ย</div><div class="val">${tenure.length?(avgY?`${avgY} <span class="muted" style="font-size:14px">ปี</span> `:'')+`${avgM} <span class="muted" style="font-size:14px">เดือน</span>`:'-'}</div>
        ${sub(newbies?`🆕 เข้าใหม่ 90 วันล่าสุด ${num(newbies)} คน`:'ไม่มีพนักงานเข้าใหม่ใน 90 วัน')}</div>
      <div class="kpi b3" ${prob.length?'data-card="prob" style="cursor:pointer"':''}><div class="lab">🧪 ยังไม่ครบ 119 วัน</div><div class="val">${num(prob.length)} <span class="muted" style="font-size:14px">คน</span></div>
        ${sub(prob.length?`ใกล้ครบสุด: ${esc(prob[0].e.name)} อีก ${num(119-prob[0].d)} วัน`:'ทุกคนผ่านช่วงทดลองงานแล้ว')}</div>
      <div class="kpi b4" ${miss.length?'data-card="miss" style="cursor:pointer"':''}><div class="lab">⚠️ ข้อมูลยังไม่ครบ</div><div class="val" style="${miss.length?'color:var(--bad)':'color:var(--good)'}">${miss.length?num(miss.length)+' <span class="muted" style="font-size:14px">คน</span>':'ครบ ✓'}</div>
        ${sub(miss.length?'กดเพื่อดูว่าใครขาดอะไร':'เลขบัตร บัญชี วันเริ่มงาน แผนก ครบทุกคน')}</div>
    </div>`);
    v.appendChild(cards);
    const pc=cards.querySelector('[data-card="prob"]');
    if(pc) pc.onclick=()=>openModal('🧪 พนักงานที่ยังทำงานไม่ครบ 119 วัน',
      `<p class="muted" style="font-size:13px;margin-bottom:10px">ตามกฎหมายคุ้มครองแรงงาน ถ้าเลิกจ้างก่อนทำงานครบ 120 วัน ไม่ต้องจ่ายค่าชดเชย — ประเมินผลก่อนครบกำหนด</p>
       <div class="tbl-wrap"><table><thead><tr><th>พนักงาน</th><th>เริ่มงาน</th><th class="num">ทำงานมาแล้ว</th><th class="num">ครบ 119 วันในอีก</th></tr></thead><tbody>
       ${prob.map(x=>`<tr><td>${esc(x.e.name)}</td><td>${esc(fmtDate(x.e.startDate))}</td><td class="num">${num(x.d)} วัน</td><td class="num"><strong>${num(119-x.d)} วัน</strong></td></tr>`).join('')}</tbody></table></div>`,
      [['ปิด','ghost',closeModal]]);
    const mc=cards.querySelector('[data-card="miss"]');
    if(mc) mc.onclick=()=>{ openModal('⚠️ พนักงานที่ข้อมูลยังไม่ครบ',
      `<p class="muted" style="font-size:13px;margin-bottom:10px">ข้อมูลเหล่านี้ใช้ออก 50 ทวิ ภ.ง.ด.1 แบบประกันสังคม และโอนเงินเดือน — กด ✏️ เพื่อกรอกให้ครบ</p>
       <div class="tbl-wrap"><table><thead><tr><th>พนักงาน</th><th>ยังขาด</th><th></th></tr></thead><tbody>
       ${miss.map(x=>`<tr><td>${esc(x.e.name)}</td><td style="color:var(--bad);font-size:13px">${x.m.map(esc).join(' · ')}</td><td style="text-align:right"><button class="btn ghost sm" data-fix="${esc(x.e.id)}">✏️</button></td></tr>`).join('')}</tbody></table></div>`,
      [['ปิด','ghost',closeModal]]);
      document.querySelectorAll('#modal [data-fix]').forEach(b=>b.onclick=()=>{ closeModal(); empForm(b.dataset.fix); }); };
  }

  const seg=el(`<div class="toolbar" style="margin-bottom:6px">
    <div class="seg" style="display:inline-flex;background:#eaf6f1;border-radius:10px;padding:3px">
      <button class="segbtn ${empFilter==='all'?'on':''}" data-f="all">ทั้งหมด (${baseList.length})</button>
      <button class="segbtn ${empFilter==='monthly'?'on':''}" data-f="monthly">📅 รายเดือน (${mC})</button>
      <button class="segbtn ${empFilter==='daily'?'on':''}" data-f="daily">🗓️ รายวัน (${dC})</button>
    </div>
    ${outCount?`<span class="muted" style="font-size:12px;margin-left:6px">🚪 ลาออกแล้ว ${outCount} คน (ดูที่เมนู "การลาออก")</span>`:''}
  </div>`);
  v.appendChild(seg);
  seg.querySelectorAll('.segbtn').forEach(b=>b.onclick=()=>{ empFilter=b.dataset.f; render(); });

  const tb = el(`<div class="toolbar">
    <div class="search"><input id="empQ" placeholder="${tr('search_emp')}" value="${esc(empSearch)}"></div>
    <button class="btn ghost sm" id="impBtn">${tr('import_csv')}</button>
    <button class="btn ghost sm" id="expBtn">${tr('export_csv')}</button>
    <button class="btn" id="addEmp">${tr('add_emp')}</button>
  </div>`);
  v.appendChild(tb);
  // แสดงโควตาที่เหลือ และปิดปุ่มเมื่อเต็มแล้ว
  {
    const lim=empLimit();
    if(lim!==null){
      const used=empUsed(), full=used>=lim;
      const chip=el(`<span class="chip" style="margin-left:auto;background:${full?'#fee2e2':'#eaf6f1'};
        color:${full?'#dc2626':'#0f766e'};font-weight:700">${full?'🔒 ':''}พนักงาน ${used}/${lim} คน</span>`);
      tb.insertBefore(chip, tb.querySelector('#impBtn'));
      const add=tb.querySelector('#addEmp');
      if(full){
        add.disabled=true; add.style.opacity='.5'; add.style.cursor='not-allowed';
        add.title=quotaMsg();
        const note=el(`<div class="panel" style="border:2px solid #f59e0b;background:#fffbeb"><div class="pbody"
          style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">
          <span style="font-size:20px">🔒</span>
          <div><strong>เพิ่มพนักงานไม่ได้ — เต็มโควตาแพ็กเกจแล้ว</strong><br>
          <span class="muted" style="font-size:13px">${esc(quotaMsg())}<br>
          พนักงานที่ลาออกแล้วไม่นับในโควตา ถ้าใครลาออกให้ใส่วันที่ลาออกในหน้า “การลาออก”</span></div>
          <a class="btn sm" href="/pricing" target="_blank" rel="noopener" style="margin-left:auto">อัปเกรดแพ็กเกจ</a>
        </div></div>`);
        v.appendChild(note);
      }
    }
  }
  tb.querySelector('#addEmp').onclick=()=>{
    if(!canAddEmp(1)){ toast('🔒 '+quotaMsg()); return; }
    empForm();
  };
  tb.querySelector('#empQ').oninput=(e)=>{ empSearch=e.target.value; drawEmp(); };
  tb.querySelector('#expBtn').onclick=exportEmpCSV;
  tb.querySelector('#impBtn').onclick=importEmpCSV;

  const panel = el(`<div class="panel"><div class="pbody" style="padding:0"><div class="tbl-wrap" id="empTbl"></div></div></div>`);
  v.appendChild(panel);
  drawEmp();
}
function drawEmp(){
  const list = empVisibleList();
  const alive=new Set(DB.employees.map(x=>x.id));
  empSel.forEach(id=>{ if(!alive.has(id)) empSel.delete(id); });   // คนที่ถูกลบไปแล้วไม่ต้องค้าง
  const rows = list.map(e=>{ const daily=e.payType==='daily'; return `<tr${empSel.has(e.id)?' style="background:#eff6ff"':''}>
    <td style="width:34px"><input type="checkbox" class="empPick" data-pick="${e.id}" ${empSel.has(e.id)?'checked':''} style="width:16px;height:16px;cursor:pointer" aria-label="เลือก ${esc(e.name)}"></td>
    <td><span class="chip">${esc(e.code)}</span></td>
    <td><span style="display:inline-flex;align-items:center">${empAvatar(e,34)}<span>${genderIcon(e.gender)}<strong style="${e.resignDate?'color:#94a3b8;text-decoration:line-through':''}">${esc(e.name)}</strong>${e.resignDate?` <span class="chip" style="background:#fee2e2;color:#dc2626">ลาออก ${esc(fmtDate(e.resignDate))}</span>`:''}</span></span></td>
    <td>${esc(e.position)}</td>
    <td>${esc(e.dept)}</td>
    <td>${daily?`<span class="chip" style="background:#fef3c7;color:#b45309">${tr('type_daily')}</span>`:`<span class="chip" style="background:#d8f3e6;color:#092942">${tr('type_monthly')}</span>`}</td>
    <td class="num">${money(e.salary)} <span class="muted" style="font-size:11px">${daily?tr('per_day'):tr('per_month')}</span>${salHistOf(e)?` <span class="chip" style="background:#eaf6f1;color:#0b5f58;font-size:10px">${salHistOf(e).length} อัตรา</span>`:''}</td>
    <td>${esc(fmtDate(e.startDate))}</td>
    <td style="text-align:right">
      <button class="icon-btn" title="ประวัติการขึ้นเงินเดือน" data-sh="${e.id}">📈</button>
      <button class="icon-btn" title="แก้ไข" data-ed="${e.id}">✏️</button>
      <button class="icon-btn" title="ลบ" data-del="${e.id}">🗑️</button>
    </td></tr>`;}).join('');
  const tbl = el(`<table>
    <thead><tr><th style="width:34px"><input type="checkbox" id="empPickAll" style="width:16px;height:16px;cursor:pointer" title="เลือกทั้งหมดที่เห็น" aria-label="เลือกทั้งหมดที่เห็น"></th><th>${tr('th_code')}</th><th>${tr('th_name')}</th><th>${tr('th_position')}</th><th>${tr('th_dept')}</th><th>${tr('th_type')}</th><th class="num">${tr('th_wage')}</th><th>${tr('th_start')}</th><th></th></tr></thead>
    <tbody>${rows||`<tr><td colspan="9" class="empty">${tr('emp_not_found')}</td></tr>`}</tbody>
  </table>`);
  tbl.querySelectorAll('[data-sh]').forEach(b=>b.onclick=()=>salaryHistModal(b.dataset.sh));
  tbl.querySelectorAll('[data-ed]').forEach(b=>b.onclick=()=>empForm(b.dataset.ed));
  tbl.querySelectorAll('[data-del]').forEach(b=>b.onclick=()=>delEmp(b.dataset.del));
  // ติ๊กทีละคน
  tbl.querySelectorAll('[data-pick]').forEach(cb=>cb.onchange=()=>{
    if(cb.checked) empSel.add(cb.dataset.pick); else empSel.delete(cb.dataset.pick);
    drawEmp();
  });
  // ติ๊กทั้งหมดที่เห็น (นับเฉพาะรายชื่อที่ผ่านการค้นหา/กรองอยู่ตอนนี้)
  const all=tbl.querySelector('#empPickAll');
  const nVis=list.filter(e=>empSel.has(e.id)).length;
  if(all){
    all.checked = list.length>0 && nVis===list.length;
    all.indeterminate = nVis>0 && nVis<list.length;
    all.onchange=()=>{
      if(all.checked) list.forEach(e=>empSel.add(e.id));
      else list.forEach(e=>empSel.delete(e.id));
      drawEmp();
    };
  }
  const box=$('#empTbl'); box.innerHTML='';
  if(empSel.size){
    const hidden=empSel.size-nVis;
    const bar=el(`<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:10px 14px;margin-bottom:12px">
      <strong style="color:#1d4ed8">เลือกแล้ว ${empSel.size} คน</strong>
      ${hidden>0?`<span class="muted" style="font-size:12.5px">(${hidden} คนไม่แสดงในรายการที่กรองอยู่)</span>`:''}
      <span style="flex:1"></span>
      <button class="btn ghost sm" id="bulkClr">ยกเลิกการเลือก</button>
      <button class="btn danger sm" id="bulkDel">🗑️ ลบที่เลือก (${empSel.size})</button>
    </div>`);
    bar.querySelector('#bulkClr').onclick=()=>{ empSel.clear(); drawEmp(); };
    bar.querySelector('#bulkDel').onclick=delEmpBulk;
    box.appendChild(bar);
  }
  box.appendChild(tbl);
}
function fmtDate(d){ if(!d) return '-'; const [y,m,dd]=d.split('-'); return `${dd}/${m}/${(+y)+543}`; }
/* ---------- ประวัติการขึ้นเงินเดือน (โมดัล) ---------- */
function salaryHistModal(empId){
  const e=DB.employees.find(x=>x.id===empId); if(!e) return;
  const unit = e.payType==='daily' ? 'บาท/วัน' : 'บาท/เดือน';
  const draw=()=>{
    const h=salHistOf(e);
    const rows = h ? h.map((x,i)=>{
      const first = x.from==='0000-01-01';
      return `<tr>
        <td>${first?'<span class="muted">ตั้งแต่เริ่มงาน</span>':esc(fmtDate(x.from))}</td>
        <td class="num"><strong>${money(x.salary)}</strong> <span class="muted" style="font-size:11px">${unit}</span></td>
        <td style="text-align:right">${h.length>1?`<button class="icon-btn" title="ลบรายการนี้" data-rm="${i}">🗑️</button>`:''}</td>
      </tr>`;
    }).join('') : `<tr><td colspan="3" class="empty">ยังไม่มีประวัติ — ใช้อัตราปัจจุบัน ${money(e.salary)} ${unit} ทุกงวด</td></tr>`;
    const body=`
      <p class="muted" style="margin:0 0 12px;font-size:13px">
        บันทึกการขึ้น (หรือลด) เงินเดือนพร้อมวันที่มีผล — <strong>งวดที่ผ่านมาจะยังใช้อัตราเดิม</strong>
        สลิปและเอกสารย้อนหลังจึงไม่เปลี่ยน · งวดที่ขึ้นกลางเดือนจะคิดเฉลี่ยรายวันให้
      </p>
      <div class="tbl-wrap"><table>
        <thead><tr><th>มีผลตั้งแต่</th><th class="num">อัตรา</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
      <div class="grid2" style="margin-top:14px">
        <div class="field"><label>อัตราใหม่ (${unit}) *</label><input id="sh_val" type="number" step="0.01" min="0" placeholder="${e.salary||0}"></div>
        <div class="field"><label>มีผลตั้งแต่วันที่ *</label><input id="sh_from" type="date" value="${isoOf(periodRange(PERIOD).from)}"></div>
      </div>`;
    openModal(`ประวัติเงินเดือน — ${e.name}`, body,
      [['ปิด','ghost',closeModal],['➕ บันทึกอัตราใหม่','',()=>{
        const v=+($('#sh_val').value||0), from=$('#sh_from').value;
        if(!(v>0)){ toast('กรุณากรอกอัตราใหม่'); return; }
        if(!from){ toast('กรุณาเลือกวันที่มีผล'); return; }
        raiseSalary(e, v, from);
        closeModal(); draw(); drawEmp(); toast('บันทึกอัตราใหม่แล้ว');
      }]]);
    document.querySelectorAll('[data-rm]').forEach(b=>b.onclick=()=>{
      const i=+b.dataset.rm; e.salHist.splice(i,1);
      if(e.salHist.length===1 && e.salHist[0].from==='0000-01-01'){ e.salary=e.salHist[0].salary; delete e.salHist; }
      else e.salary=salaryOnDate(e, isoOf(new Date()));
      save(); closeModal(); draw(); drawEmp(); toast('ลบรายการแล้ว');
    });
  };
  draw();
}
function genderIcon(g){
  if(g==='M') return '<span title="ชาย" style="display:inline-block;width:20px;height:20px;line-height:20px;text-align:center;border-radius:50%;background:#d8f3e6;color:#0e3a5c;font-weight:700;margin-right:7px;font-size:13px">♂</span>';
  if(g==='F') return '<span title="หญิง" style="display:inline-block;width:20px;height:20px;line-height:20px;text-align:center;border-radius:50%;background:#fce7f3;color:#db2777;font-weight:700;margin-right:7px;font-size:13px">♀</span>';
  return '<span title="ไม่ระบุ" style="display:inline-block;width:20px;height:20px;line-height:20px;text-align:center;border-radius:50%;background:#f1f5f9;color:#94a3b8;margin-right:7px;font-size:13px">–</span>';
}
/* ลบข้อมูลทุกอย่างที่ผูกกับพนักงาน — เดิมลบแค่ตัวพนักงานกับเงินเดือน
   ใบลา เวลาเข้างาน และตารางกะจึงค้างอยู่ ทำให้การ์ดสรุปนับใบลาของคนที่ไม่มีแล้ว */
function purgeEmpData(ids){
  const gone = ids instanceof Set ? ids : new Set(ids);
  if(!gone.size) return { leave:0, attend:0, shift:0, payroll:0 };
  const n={leave:0, attend:0, shift:0, payroll:0};

  if(Array.isArray(DB.leave)){
    const before=DB.leave.length;
    DB.leave=DB.leave.filter(l=>!gone.has(l.empId));
    n.leave=before-DB.leave.length;
  }
  Object.values(DB.payroll||{}).forEach(function(pp){
    gone.forEach(function(id){ if(pp[id]!==undefined){ delete pp[id]; n.payroll++; } });
  });
  Object.values(DB.attend||{}).forEach(function(pp){
    gone.forEach(function(id){ if(pp[id]!==undefined){ delete pp[id]; n.attend++; } });
  });
  Object.values(DB.shiftPlan||{}).forEach(function(pp){
    gone.forEach(function(id){ if(pp[id]!==undefined){ delete pp[id]; n.shift++; } });
  });
  return n;
}
/* บอกว่าลบอะไรไปบ้าง ถ้าไม่มีอะไรนอกจากตัวพนักงานก็ไม่ต้องพูดถึง */
function purgeSummary(n){
  const p=[];
  if(n.leave) p.push('ใบลา '+n.leave+' ใบ');
  if(n.attend) p.push('เวลาเข้างาน '+n.attend+' รายการ');
  if(n.payroll) p.push('เงินเดือน '+n.payroll+' งวด');
  if(n.shift) p.push('ตารางกะ '+n.shift+' รายการ');
  return p.length ? ' · ลบ'+p.join(' · ') : '';
}

/* ---------- เลือกลบหลายคน ----------
   เก็บ id ที่เลือกไว้นอกฟังก์ชันวาด เพื่อให้ค้างอยู่ตอนพิมพ์ค้นหาหรือสลับแท็บ */
const empSel=new Set();
function delEmpBulk(){
  const picked=DB.employees.filter(e=>empSel.has(e.id));
  if(!picked.length){ toast('ยังไม่ได้เลือกใคร'); return; }
  const show=picked.slice(0,12);
  openModal('ลบพนักงานที่เลือก',
    `<p>ต้องการลบพนักงาน <strong style="color:var(--bad)">${picked.length} คน</strong> หรือไม่?</p>
     <p class="muted" style="font-size:13px;margin-top:-6px">ข้อมูลเงินเดือนทุกงวด ใบลา เวลาเข้างาน และตารางกะของคนเหล่านี้จะถูกลบไปด้วย</p>
     <div style="max-height:230px;overflow:auto;border:1px solid var(--line);border-radius:8px;padding:8px 12px;background:#f8fafc">
       <ul style="margin:0;padding-left:18px;font-size:13.5px;line-height:1.9">
         ${show.map(e=>`<li>${esc(e.name)} <span class="muted">(${esc(e.code)})</span></li>`).join('')}
       </ul>
       ${picked.length>show.length?`<div class="muted" style="font-size:12.5px;margin-top:6px">…และอีก ${picked.length-show.length} คน</div>`:''}
     </div>
     <p class="muted" style="font-size:12.5px;margin-top:10px">การลบย้อนกลับไม่ได้ — ถ้ายังไม่แน่ใจ กด “ส่งออก CSV” เก็บไว้ก่อน</p>`,
    [['ยกเลิก','ghost',closeModal],[`ลบ ${picked.length} คน`,'danger',()=>{
      const gone=new Set(picked.map(e=>e.id));
      DB.employees=DB.employees.filter(x=>!gone.has(x.id));
      const n=purgeEmpData(gone);
      empSel.clear();
      save(); closeModal(); render();
      toast(`ลบพนักงาน ${gone.size} คนแล้ว`+purgeSummary(n));
    }]]);
}
function delEmp(id){
  const e=DB.employees.find(x=>x.id===id);
  openModal(`ลบพนักงาน`,
    `<p>ต้องการลบ <strong>${esc(e.name)}</strong> (${esc(e.code)}) หรือไม่?</p>
     <p class="muted" style="font-size:13px">ข้อมูลเงินเดือนทุกงวด ใบลา เวลาเข้างาน และตารางกะของคนนี้จะถูกลบไปด้วย</p>`,
    [['ยกเลิก','ghost',closeModal],['ลบ','danger',()=>{
      DB.employees=DB.employees.filter(x=>x.id!==id);
      const n=purgeEmpData([id]);
      save(); closeModal(); render();
      toast('ลบพนักงานแล้ว'+purgeSummary(n));
    }]]);
}
/* ---------- รูปพนักงาน ----------
   เก็บเป็น data URI ย่อแล้ว (180×180 JPEG) ประมาณ 6–12 KB ต่อคน
   ครอบตัดตรงกลางเป็นสี่เหลี่ยมจัตุรัสให้อัตโนมัติ ไม่บิดสัดส่วน */
const EMP_PHOTO_SIZE=180;
function readEmpPhoto(file, cb){
  if(!file) return;
  if(!/^image\//.test(file.type||'')){ toast('ไฟล์นี้ไม่ใช่รูปภาพ'); return; }
  if(file.size > 12*1024*1024){ toast('ไฟล์ใหญ่เกิน 12 MB — ใช้รูปเล็กกว่านี้'); return; }
  const fr=new FileReader();
  fr.onerror=()=>toast('อ่านไฟล์ไม่สำเร็จ');
  fr.onload=()=>{
    const img=new Image();
    img.onerror=()=>toast('เปิดรูปนี้ไม่ได้ — ลองไฟล์ JPG หรือ PNG');
    img.onload=()=>{
      try{
        const S=EMP_PHOTO_SIZE, cv=document.createElement('canvas');
        cv.width=S; cv.height=S;
        const cx=cv.getContext('2d');
        cx.fillStyle='#fff'; cx.fillRect(0,0,S,S);
        const m=Math.min(img.width,img.height);          // ครอบตัดจัตุรัสจากกลางภาพ
        cx.drawImage(img,(img.width-m)/2,(img.height-m)/2,m,m,0,0,S,S);
        cb(cv.toDataURL('image/jpeg',0.72));
      }catch(err){ toast('ย่อรูปไม่สำเร็จ'); }
    };
    img.src=fr.result;
  };
  fr.readAsDataURL(file);
}
/* วงกลมรูป — ถ้าไม่มีรูปใช้อักษรแรกของชื่อแทน */
function empAvatar(e, size){
  const s=size||34;
  if(e && e.photo)
    return '<img src="'+e.photo+'" alt="" style="width:'+s+'px;height:'+s+'px;border-radius:50%;object-fit:cover;'
      +'border:1px solid var(--line);vertical-align:middle;margin-right:8px;flex-shrink:0">';
  const ini=(e && e.name ? String(e.name).trim().charAt(0) : '?') || '?';
  return '<span style="display:inline-flex;align-items:center;justify-content:center;width:'+s+'px;height:'+s+'px;'
    +'border-radius:50%;background:#eaf6f1;color:#0b5f58;font-weight:700;font-size:'+Math.round(s*0.42)+'px;'
    +'margin-right:8px;vertical-align:middle;flex-shrink:0">'+esc(ini)+'</span>';
}

function empForm(id){
  const e = id ? DB.employees.find(x=>x.id===id) : {code:nextCode(),name:'',position:'',dept:'',salary:0,startDate:'',payType:'monthly',taxId:'',bank:'',bankNo:'',pvdRate:3};
  const isDaily = e.payType==='daily';
  let photoData = e.photo || '';
  const body = `
    <div class="grid2">
      <div class="field" style="grid-column:1/-1;display:flex;gap:14px;align-items:center;background:#f8fafc;border:1px solid var(--line);border-radius:10px;padding:12px 14px">
        <div id="f_photoBox">${empAvatar(e,72)}</div>
        <div>
          <label style="font-weight:700">รูปพนักงาน</label>
          <input type="file" id="f_photo" accept="image/*" style="display:none">
          <div style="display:flex;gap:8px;margin-top:4px;flex-wrap:wrap">
            <button type="button" class="btn ghost sm" id="f_photoPick">📷 เลือกรูป</button>
            <button type="button" class="btn ghost sm" id="f_photoDel" ${e.photo?'':'style="display:none"'}>ลบรูป</button>
          </div>
          <div class="muted" style="font-size:11.5px;margin-top:5px">ย่อเหลือ 180×180 อัตโนมัติ ครอบตัดจากกลางภาพ · ใช้ในหน้ารายชื่อพนักงาน</div>
        </div>
      </div>
      <div class="field"><label>รหัสพนักงาน *</label><input id="f_code" value="${esc(e.code)}"><div id="codeWarn" style="color:#dc2626;font-size:12px;min-height:14px;margin-top:2px"></div></div>
      <div class="field"><label>ชื่อ-นามสกุล *</label><input id="f_name" value="${esc(e.name)}"></div>
      <div class="field"><label>เพศ</label><select id="f_gender">
        <option value="" ${!e.gender?'selected':''}>ไม่ระบุ</option>
        <option value="M" ${e.gender==='M'?'selected':''}>♂ ชาย</option>
        <option value="F" ${e.gender==='F'?'selected':''}>♀ หญิง</option></select></div>
      <div class="field"><label>วันเกิด <span class="muted" style="font-weight:400">(ไม่บังคับ)</span></label><input type="date" id="f_birth" value="${esc(e.birthDate||'')}"></div>
      <div class="field"><label>สัญชาติ</label><input id="f_nationality" value="${esc(e.nationality||'ไทย')}" list="natList"><datalist id="natList"><option value="ไทย"><option value="พม่า"><option value="ลาว"><option value="กัมพูชา"><option value="เวียดนาม"></datalist></div>
      <div class="field"><label>ตำแหน่ง</label><input id="f_position" value="${esc(e.position)}"></div>
      <div class="field"><label>เบอร์โทร</label><input id="f_phone" value="${esc(e.phone||'')}" inputmode="numeric" maxlength="10" placeholder="08xxxxxxxx (10 หลัก)" oninput="this.value=this.value.replace(/[^0-9]/g,'').slice(0,10);this.style.borderColor=(this.value&&this.value.length<9)?'#f59e0b':''"></div>
      <div class="field"><label>แผนก</label><input id="f_dept" value="${esc(e.dept)}" list="deptList"></div>
      <div class="field"><label>ประเภทการจ้าง *</label><select id="f_payType">
        <option value="monthly" ${!isDaily?'selected':''}>รายเดือน</option>
        <option value="daily" ${isDaily?'selected':''}>รายวัน</option></select></div>
      <div class="field"><label id="f_salaryLab">${isDaily?'ค่าจ้างต่อวัน (บาท) *':'เงินเดือน (บาท) *'}</label><input id="f_salary" type="number" step="0.01" value="${e.salary||0}">
        <div class="muted" style="font-size:11px;margin-top:3px">อัตราปัจจุบัน · แก้ตรงนี้จะเปลี่ยนย้อนหลังทุกงวด</div></div>
      <div class="field"><label>วันที่เริ่มงาน</label><input id="f_startDate" type="date" value="${e.startDate||''}"></div>
      <!-- ปรับอัตราใหม่ในฟอร์มเดียวกัน ไม่ต้องไปกดปุ่ม 📈 แยก -->
      <div class="field" style="grid-column:1/-1;background:#f6faf8;border:1px solid var(--line);border-radius:10px;padding:12px 14px">
        <label style="font-weight:700;color:var(--brand-d)">📈 ปรับอัตราใหม่ (ขึ้น/ลดเงินเดือน) — ไม่บังคับ</label>
        <div class="grid2" style="margin-top:8px">
          <div class="field"><label>อัตราใหม่ (บาท)</label>
            <input id="f_newSal" type="number" step="0.01" min="0" placeholder="${e.salary||0}"></div>
          <div class="field"><label>มีผลตั้งแต่วันที่</label>
            <input id="f_newFrom" type="date" value="${isoOf(periodRange(PERIOD).from)}"></div>
        </div>
        <div id="f_newHint" class="muted" style="font-size:11.5px;margin-top:6px">
          กรอกทั้งสองช่องแล้วกดบันทึก — <strong>งวดที่ผ่านมาจะยังใช้อัตราเดิม</strong> สลิปย้อนหลังไม่เปลี่ยน
          ${salHistOf(e)?` · ตอนนี้มีประวัติ <strong>${salHistOf(e).length} อัตรา</strong>`:''}
        </div>
      </div>
      <div class="field"><label>วันที่ลาออก <span style="color:#94a3b8;font-size:11px">(เว้นว่างถ้ายังทำงานอยู่)</span></label><input id="f_resignDate" type="date" value="${e.resignDate||''}"></div>
      <div class="field"><label>เลขบัตรประชาชน (13 หลัก)</label><input id="f_taxId" value="${esc(e.taxId)}" inputmode="numeric" maxlength="13" placeholder="ตัวเลข 13 หลัก" oninput="this.value=this.value.replace(/[^0-9]/g,'').slice(0,13);this.style.borderColor=(this.value&&this.value.length<13)?'#f59e0b':''"></div>
      <div class="field"><label>อัตราสะสม กสล. (%)</label>
        <input id="f_pvdRate" type="number" step="0.5" min="0" value="${e.pvdRate||0}">
        <div class="muted" style="font-size:11px;margin-top:2px">กองทุนสำรองเลี้ยงชีพ</div></div>
      <div class="field"><label>บริษัทสมทบ กสล. (%)</label>
        <input id="f_pvdEr" type="number" step="0.5" min="0" value="${e.pvdEr??''}" placeholder="เท่ากับพนักงาน">
        <div class="muted" style="font-size:11px;margin-top:2px">เว้นว่าง = เท่ากับที่พนักงานสะสม · ใช้คิดต้นทุนบริษัท ไม่หักจากเงินเดือน</div></div>
      <div class="field"><label>กองทุนสงเคราะห์ลูกจ้าง (%)</label>
        <input id="f_wfRate" type="number" step="0.05" min="0" value="${e.wfRate??''}" placeholder="ไม่เข้ากองทุน">
        <div class="muted" style="font-size:11px;margin-top:2px">
          <button type="button" id="f_wfSet" style="background:none;border:0;color:var(--brand);cursor:pointer;padding:0;font:inherit;text-decoration:underline">ใส่ 0.25%</button>
          · เลือกได้<strong>อย่างใดอย่างหนึ่ง</strong>กับ กสล.</div></div>
      <div id="f_fundNote" style="grid-column:1/-1;display:none;background:#fff7ed;border:1px solid #fed7aa;
        border-radius:9px;padding:9px 12px;font-size:12.5px;color:#9a3412;margin-top:-4px"></div>
      <div class="field"><label>ประกันสังคม</label><select id="f_noSSO">
        <option value="0" ${!e.noSSO?'selected':''}>เข้าประกันสังคม (หัก 5%)</option>
        <option value="1" ${e.noSSO?'selected':''}>ยกเว้น — ไม่หัก/ไม่ยื่น (เช่น กรรมการ)</option></select>
        <div class="muted" style="font-size:11px;margin-top:2px">* ตำแหน่งที่มีคำว่า "กรรมการ" ระบบยกเว้นให้อัตโนมัติ</div></div>
      <div class="field"><label>ระดับ (สิทธิ์ในลิงก์ลงเวลา)</label><select id="f_ckRole">
        <option value="staff" ${empRole(e)==='staff'?'selected':''}>พนักงาน</option>
        <option value="head" ${empRole(e)==='head'?'selected':''}>หัวหน้า/ผู้จัดการ (อนุมัติใบลาได้)</option>
        <option value="exec" ${empRole(e)==='exec'?'selected':''}>ผู้บริหาร/CEO (อนุมัติอย่างเดียว ไม่ลงเวลา)</option></select>
        <div class="muted" style="font-size:11px;margin-top:2px">* ${e.ckRole?'ตั้งเองไว้':'เลือกให้อัตโนมัติจากตำแหน่ง/แผนก — เปลี่ยนได้'} · ใช้กับระบบลงเวลาผ่านมือถือและสายอนุมัติใบลา</div></div>
      <div class="field"><label>สิทธิ์ค่าล่วงเวลา (OT)</label><select id="f_noOT">
        <option value="0" ${!e.noOT?'selected':''}>คิด OT ให้ (ปกติ)</option>
        <option value="1" ${e.noOT?'selected':''}>ไม่คิด OT ให้คนนี้</option></select>
        <div class="muted" style="font-size:11px;margin-top:2px">* ตั้งเป็นรายคนได้จากหน้า “เวลาเข้างาน” ด้วย</div></div>
      <div class="field"><label>ธนาคาร</label><input id="f_bank" value="${esc(e.bank)}"></div>
      <div class="field"><label>เลขที่บัญชี</label><input id="f_bankNo" value="${esc(e.bankNo)}"></div>
      <div class="field" style="grid-column:1/-1"><label>ที่อยู่ (สำหรับหนังสือรับรองหัก ณ ที่จ่าย 50 ทวิ)</label><input id="f_address" value="${esc(e.address||'')}" placeholder="บ้านเลขที่ หมู่ ถนน ตำบล/แขวง อำเภอ/เขต จังหวัด รหัสไปรษณีย์"></div>
    </div>
    <datalist id="deptList">${[...new Set(DB.employees.map(x=>x.dept).filter(Boolean))].map(d=>`<option value="${esc(d)}">`).join('')}</datalist>`;
  openModal(id?'แก้ไขพนักงาน':'เพิ่มพนักงาน', body, [['ยกเลิก','ghost',closeModal],['บันทึก','',()=>{
    const g=id=>$('#'+id).value;
    const code=g('f_code').trim(), name=g('f_name').trim();
    if(!code||!name){ toast('กรุณากรอกรหัสและชื่อ'); return; }
    // ห้ามรหัสพนักงานซ้ำ (ไม่สนตัวพิมพ์เล็ก/ใหญ่ และไม่นับตัวเอง)
    const dup=DB.employees.find(x=>x.id!==id && String(x.code||'').trim().toLowerCase()===code.toLowerCase());
    if(dup){ toast(`รหัส ${code} ซ้ำกับ "${dup.name}" — กรุณาใช้รหัสอื่น`);
      const f=$('#f_code'); if(f){ f.style.borderColor='#dc2626'; f.focus(); f.select(); } return; }
    /* ตรวจจำนวนหลัก — เว้นว่างได้ แต่ถ้ากรอกต้องครบ */
    const bad=(sel,msg)=>{ toast(msg); const f=$(sel); if(f){ f.style.borderColor='#dc2626'; f.focus(); } };
    const tid=g('f_taxId').trim(), ph=g('f_phone').trim();
    if(tid && !/^[0-9]{13}$/.test(tid)){ bad('#f_taxId',`เลขบัตรประชาชนต้องครบ 13 หลัก (ตอนนี้ ${tid.replace(/[^0-9]/g,'').length} หลัก)`); return; }
    if(ph && !/^0[0-9]{8,9}$/.test(ph)){ bad('#f_phone',`เบอร์โทรต้องขึ้นต้นด้วย 0 และมี 9–10 หลัก (ตอนนี้ ${ph.replace(/[^0-9]/g,'').length} หลัก)`); return; }
    const rec={code,name,gender:g('f_gender'),birthDate:g('f_birth'),position:g('f_position').trim(),phone:g('f_phone').trim(),dept:g('f_dept').trim(),payType:g('f_payType'),salary:+g('f_salary')||0,startDate:g('f_startDate'),resignDate:g('f_resignDate'),taxId:g('f_taxId').trim(),nationality:g('f_nationality').trim(),address:g('f_address').trim(),bank:g('f_bank').trim(),bankNo:g('f_bankNo').trim(),pvdRate:+g('f_pvdRate')||0,pvdEr:(g('f_pvdEr')===''?null:Math.max(0,+g('f_pvdEr')||0)),wfRate:(+g('f_pvdRate')||0)>0?0:(+g('f_wfRate')||0),noSSO:+g('f_noSSO')||0,noOT:+g('f_noOT')||0,ckRole:g('f_ckRole')||'staff',photo:photoData||''};
    // เพิ่มคนใหม่ หรือปลดสถานะลาออกให้กลับมาทำงาน = กินโควตาเพิ่ม ต้องเช็คก่อน
    const willCount = !rec.resignDate;
    const wasCount  = id ? !e.resignDate : false;
    if(willCount && !wasCount && !canAddEmp(1)){ toast('🔒 '+quotaMsg()); return; }
    // อัตราใหม่ — ต้องกรอกครบทั้งจำนวนและวันที่ ถ้ากรอกมาแค่ช่องเดียวถือว่ากรอกไม่ครบ
    const nsRaw=$('#f_newSal').value.trim(), nfRaw=$('#f_newFrom').value;
    if(nsRaw!=='' && !nfRaw){ toast('กรอกวันที่มีผลของอัตราใหม่ด้วย'); return; }
    if(nsRaw==='' && nfRaw && $('#f_newSal')===document.activeElement){ /* ปล่อยผ่าน ยังไม่พิมพ์ตัวเลข */ }
    const newSal=nsRaw===''?null:(+nsRaw||0);
    if(newSal!==null && !(newSal>0)){ toast('อัตราใหม่ต้องมากกว่า 0'); return; }

    const target = id ? e : {id:uid(),...rec};
    if(id) Object.assign(e,rec); else DB.employees.push(target);

    let msg='บันทึกแล้ว';
    if(newSal!==null){
      // raiseSalary เก็บอัตราเดิมเป็นชั้นแรกให้เอง งวดเก่าจึงไม่เปลี่ยน
      raiseSalary(target, newSal, nfRaw);
      msg=`บันทึกแล้ว · ปรับอัตราเป็น ${money(newSal)} มีผล ${fmtDate(nfRaw)}`;
    }
    save(); closeModal(); render(); toast(msg);
  }]]);
  $('#f_payType').onchange=(ev)=>{ $('#f_salaryLab').textContent = ev.target.value==='daily' ? 'ค่าจ้างต่อวัน (บาท) *' : 'เงินเดือน (บาท) *'; };
  // แสดงส่วนต่างสด ๆ ให้เห็นว่าขึ้นเท่าไร กี่เปอร์เซ็นต์ ก่อนกดบันทึก
  const nsIn=$('#f_newSal'), nfIn=$('#f_newFrom'), nHint=$('#f_newHint');
  const baseHint=nHint.innerHTML;
  const showDiff=()=>{
    const cur=+$('#f_salary').value||0, nv=+nsIn.value||0;
    if(!nsIn.value.trim() || !(nv>0)){ nHint.innerHTML=baseHint; return; }
    const d=nv-cur;
    const pct=cur>0 ? Math.round(d/cur*1000)/10 : 0;
    const col=d>0?'var(--good,#15803d)':d<0?'var(--bad)':'inherit';
    const sign=d>0?'+':'';
    nHint.innerHTML=`<span style="color:${col};font-weight:700">${sign}${money(d)}`
      + (cur>0?` (${sign}${pct}%)`:'')+'</span>'
      + ` จาก ${money(cur)} → <strong>${money(nv)}</strong>`
      + (nfIn.value?` มีผล ${fmtDate(nfIn.value)}`:' — ยังไม่ได้เลือกวันที่มีผล');
  };
  [nsIn,nfIn,$('#f_salary')].forEach(x=>{ if(x){ x.addEventListener('input',showDiff); x.addEventListener('change',showDiff); } });
  // รูปพนักงาน — เลือก / ลบ
  const phIn=$('#f_photo'), phBox=$('#f_photoBox'), phDel=$('#f_photoDel');
  const drawPhoto=()=>{
    phBox.innerHTML=empAvatar({name:$('#f_name').value, photo:photoData}, 72);
    phDel.style.display = photoData ? '' : 'none';
  };
  $('#f_photoPick').onclick=()=>phIn.click();
  phIn.onchange=()=>{
    const f=phIn.files && phIn.files[0];
    readEmpPhoto(f, (data)=>{ photoData=data; drawPhoto(); toast('เลือกรูปแล้ว — กดบันทึกเพื่อจัดเก็บ'); });
    phIn.value='';
  };
  phDel.onclick=()=>{ photoData=''; drawPhoto(); };
  // กสล. กับ กองทุนสงเคราะห์ลูกจ้าง — เลือกได้อย่างใดอย่างหนึ่ง
  const syncFunds=()=>{
    const pv=$('#f_pvdRate'), wf=$('#f_wfRate'), note=$('#f_fundNote'), btn=$('#f_wfSet');
    if(!pv||!wf) return;
    const hasPvd=(+pv.value||0)>0, hasWf=(+wf.value||0)>0;
    wf.disabled=hasPvd; pv.disabled=hasWf;
    if(btn) btn.disabled=hasPvd;
    wf.style.background=hasPvd?'#f1f5f9':''; pv.style.background=hasWf?'#f1f5f9':'';
    if(hasPvd&&!hasWf) note.innerHTML='ℹ️ คนนี้มี<strong>กองทุนสำรองเลี้ยงชีพ</strong>อยู่แล้ว จึงไม่ต้องเข้ากองทุนสงเคราะห์ลูกจ้าง';
    else if(hasWf&&!hasPvd) note.innerHTML='ℹ️ คนนี้เข้า<strong>กองทุนสงเคราะห์ลูกจ้าง</strong> จึงกรอกอัตรา กสล. ไม่ได้';
    else note.innerHTML='';
    note.style.display=(hasPvd||hasWf)?'block':'none';
  };
  // เตือนทันทีถ้ารหัสซ้ำ (ระหว่างพิมพ์)
  $('#f_code').oninput=(ev)=>{
    const val=ev.target.value.trim().toLowerCase();
    const dup=val && DB.employees.some(x=>x.id!==id && String(x.code||'').trim().toLowerCase()===val);
    ev.target.style.borderColor = dup ? '#dc2626' : '';
    const w=$('#codeWarn'); if(w) w.textContent = dup ? '⚠️ รหัสนี้ถูกใช้แล้ว' : '';
  };
  ['#f_pvdRate','#f_wfRate'].forEach(s=>{ const n=$(s); if(n) n.addEventListener('input', syncFunds); });
  const wfSet=$('#f_wfSet');
  if(wfSet) wfSet.onclick=()=>{ $('#f_wfRate').value=(+DB.wfRateDefault||0.25); syncFunds(); };
  syncFunds();
}
function nextCode(){
  const used=new Set(DB.employees.map(e=>String(e.code||'').trim().toLowerCase()));
  const nums = DB.employees.map(e=>{ const m=String(e.code).match(/(\d+)/); return m?+m[1]:0; });
  let n=Math.max(0,...nums)+1, code;
  do{ code='EMP'+String(n).padStart(3,'0'); n++; } while(used.has(code.toLowerCase()));  // กันชนซ้ำ
  return code;
}

