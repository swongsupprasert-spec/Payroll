/* app.html · การลาออก / เข้าใหม่ — ลำดับไฟล์มีผล (โหลดตามเลข) */
/* ============ การลาออก / เข้าใหม่ ============ */
let resignFilter='all', resignYear;   // all | active | resigned · ปี (undefined = ยังไม่เลือก → ใช้ปีของงวด, null = ทุกปี)
function vResign(v){
  const [py]=PERIOD.split('-').map(Number);
  if(resignYear===undefined) resignYear=py;
  const yr = resignYear;   // null = ทุกปี
  const inYear=(iso)=>{ if(!iso) return false; return yr===null || +iso.split('-')[0]===yr; };

  const resigned=DB.employees.filter(e=>e.resignDate);
  const activeList=DB.employees.filter(e=>!e.resignDate);
  const newInYear=DB.employees.filter(e=>inYear(e.startDate));
  const resignInYear=DB.employees.filter(e=>inYear(e.resignDate));

  v.appendChild(el(`<div class="cards">
    <div class="kpi b1"><div class="lab">👥 พนักงานทั้งหมด</div><div class="val">${num(DB.employees.length)} <span class="muted" style="font-size:14px">คน</span></div></div>
    <div class="kpi b2"><div class="lab">🟢 ทำงานอยู่</div><div class="val">${num(activeList.length)} <span class="muted" style="font-size:14px">คน</span></div></div>
    <div class="kpi b3"><div class="lab">🆕 เข้าใหม่${yr===null?' (ทุกปี)':' ปี '+(yr+543)}</div><div class="val">${num(newInYear.length)} <span class="muted" style="font-size:14px">คน</span></div></div>
    <div class="kpi b4"><div class="lab">🚪 ลาออก${yr===null?' (ทุกปี)':' ปี '+(yr+543)}</div><div class="val">${num(resignInYear.length)} <span class="muted" style="font-size:14px">คน</span></div></div>
  </div>`));

  // ปีที่เลือกได้ = ปีที่มีวันเริ่มงาน/ลาออก + ปีปัจจุบัน
  const yset=new Set([py]);
  DB.employees.forEach(e=>{ if(e.startDate) yset.add(+e.startDate.split('-')[0]); if(e.resignDate) yset.add(+e.resignDate.split('-')[0]); });
  const years=[...yset].sort((a,b)=>b-a);

  const bar=el(`<div class="toolbar" style="margin-bottom:6px">
    <div class="seg" style="display:inline-flex;background:#eaf6f1;border-radius:10px;padding:3px">
      <button class="segbtn ${resignFilter==='all'?'on':''}" data-f="all">ทั้งหมด (${DB.employees.length})</button>
      <button class="segbtn ${resignFilter==='active'?'on':''}" data-f="active">🟢 ทำงานอยู่ (${activeList.length})</button>
      <button class="segbtn ${resignFilter==='resigned'?'on':''}" data-f="resigned">🚪 ลาออก (${resigned.length})</button>
    </div>
    <div class="field" style="margin-left:auto"><label>ปี (พ.ศ.)</label>
      <select id="resignYr"><option value="">ทุกปี</option>${years.map(y=>`<option value="${y}" ${yr===y?'selected':''}>${y+543}</option>`).join('')}</select></div>
  </div>`);
  v.appendChild(bar);
  bar.querySelectorAll('.segbtn').forEach(b=>b.onclick=()=>{ resignFilter=b.dataset.f; render(); });
  bar.querySelector('#resignYr').onchange=(ev)=>{ resignYear = ev.target.value===''?null:+ev.target.value; render(); };

  // กรองรายชื่อตามปุ่ม + ปี
  const list=DB.employees.filter(e=>{
    if(resignFilter==='active')   return !e.resignDate;
    if(resignFilter==='resigned') return !!e.resignDate && inYear(e.resignDate);
    return true;
  });

  const rows=list.map(e=>{
    const isOut=!!e.resignDate;
    return `<tr>
      <td><span class="chip">${esc(e.code)}</span></td>
      <td>${genderIcon(e.gender)}<strong style="${isOut?'color:#94a3b8;text-decoration:line-through':''}">${esc(e.name)}</strong></td>
      <td>${esc(e.dept||'-')}</td>
      <td>${esc(fmtDate(e.startDate))}</td>
      <td>${isOut?'<span class="chip" style="background:#fee2e2;color:#dc2626">ลาออกแล้ว</span>':'<span class="chip" style="background:#dcfce7;color:#16a34a">ทำงานอยู่</span>'}</td>
      <td><input type="date" data-resign="${e.id}" value="${e.resignDate||''}" style="padding:6px 8px;border:1px solid var(--line);border-radius:7px"></td>
      <td>
        <select data-rsn="${e.id}" ${isOut?'':'disabled'} style="padding:6px 8px;border:1px solid var(--line);border-radius:7px;min-width:150px;${isOut?'':'background:#f8fafc;color:#94a3b8'}">
          <option value="">${isOut?'— เลือกเหตุผล —':'ใส่วันที่ลาออกก่อน'}</option>
          ${RESIGN_REASONS.map(([k,l])=>`<option value="${k}" ${e.resignReason===k?'selected':''}>${l}</option>`).join('')}
        </select>
        ${isOut&&e.resignReason?`<input data-rsnote="${e.id}" value="${esc(e.resignNote||'')}" placeholder="รายละเอียดเพิ่มเติม (ถ้ามี)"
              style="display:block;margin-top:5px;width:100%;padding:5px 8px;border:1px solid var(--line);border-radius:7px;font-size:12.5px">`:''}
        ${isOut&&resignNeedsSeverance(e.resignReason)?`<div class="muted" style="font-size:11px;margin-top:4px;color:#b45309;line-height:1.5">⚠️ ${esc(resignSeveranceNote(e.resignReason))}</div>`:''}
      </td>
      <td style="text-align:right">${isOut?`<button class="btn ghost sm" data-clear="${e.id}">↩️ ยกเลิกลาออก</button>`:''}</td>
    </tr>`;
  }).join('');
  const scope = resignFilter==='active'?'เฉพาะที่ทำงานอยู่' : resignFilter==='resigned'?`เฉพาะที่ลาออก${yr===null?'':' ปี '+(yr+543)}` : 'ทั้งหมด';
  const panel=el(`<div class="panel"><div class="phead"><h2>บันทึกการลาออก — ใส่วันที่ลาออกได้เลย</h2>
      <div class="sp"><span class="muted" style="font-size:12px">แสดง ${scope} · ${list.length} คน</span></div></div>
    <div class="pbody" style="padding:0"><div class="tbl-wrap"><table>
      <thead><tr><th>รหัส</th><th>ชื่อ-นามสกุล</th><th>แผนก</th><th>วันเริ่มงาน</th><th>สถานะ</th><th>วันที่ลาออก</th><th>เหตุผลในการลาออก</th><th></th></tr></thead>
      <tbody>${rows||'<tr><td colspan="8" class="empty">ไม่พบพนักงานตามเงื่อนไขที่เลือก</td></tr>'}</tbody>
    </table></div></div></div>`);
  v.appendChild(panel);
  panel.querySelectorAll('input[data-resign]').forEach(i=>i.onchange=()=>{
    const emp=DB.employees.find(x=>x.id===i.dataset.resign);
    emp.resignDate=i.value;
    if(!i.value){ delete emp.resignReason; delete emp.resignNote; }   // ไม่ลาออกแล้วก็ไม่ต้องมีเหตุผล
    save(); render(); toast(i.value?'บันทึกวันลาออกแล้ว — เลือกเหตุผลในช่องถัดไป':'ล้างวันลาออกแล้ว');
  });
  panel.querySelectorAll('select[data-rsn]').forEach(s=>s.onchange=()=>{
    const emp=DB.employees.find(x=>x.id===s.dataset.rsn);
    emp.resignReason=s.value;
    if(!s.value) delete emp.resignNote;         // ล้างเหตุผล = ล้างรายละเอียดด้วย
    save(); render();
    toast(s.value?('บันทึกเหตุผล: '+resignReasonLabel(s.value)):'ล้างเหตุผลแล้ว');
  });
  panel.querySelectorAll('input[data-rsnote]').forEach(i=>i.onchange=()=>{
    const emp=DB.employees.find(x=>x.id===i.dataset.rsnote);
    emp.resignNote=i.value.trim(); save(); toast('บันทึกรายละเอียดแล้ว');
  });
  panel.querySelectorAll('[data-clear]').forEach(b=>b.onclick=()=>{
    const emp=DB.employees.find(x=>x.id===b.dataset.clear);
    emp.resignDate=''; delete emp.resignReason; delete emp.resignNote;
    save(); render(); toast('ยกเลิกการลาออกแล้ว');
  });
  v.appendChild(el(`<div class="panel"><div class="pbody muted" style="font-size:13px">💡 เมื่อใส่วันที่ลาออก ระบบจะคิดเงินเดือนเดือนที่ลาออกตามสัดส่วนวันทำงานจริง และหยุดจ่ายในเดือนถัดไปอัตโนมัติ — มีผลกับสลิป, ภาษี, ภ.ง.ด.1 และแดชบอร์ดทั้งหมด<br>
      📌 <strong>เหตุผลในการลาออก</strong> ใช้กรอกในแบบ สปส.6-09 (แจ้งลูกจ้างออกจากงาน) และเป็นตัวชี้ว่าต้องจ่ายค่าชดเชยหรือไม่ — <strong>ลาออกเอง</strong>ไม่ต้องจ่าย ส่วน<strong>เลิกจ้าง</strong>ต้องจ่ายตามอายุงาน (พ.ร.บ.คุ้มครองแรงงาน ม.118)<br>
      ⚠️ <strong>ไม่ผ่านทดลองงาน</strong> ไม่ได้แปลว่าไม่ต้องจ่ายค่าชดเชย — ถ้าทำงานครบ <strong>120 วัน</strong> แล้วยังต้องจ่ายตามกฎหมาย ช่วงทดลองงานไม่ใช่ข้อยกเว้น</div></div>`));
}
/* ---------- เหตุผลการลาออก ----------
   แยกเป็นรหัสคงที่ เพราะมีผลต่างกันทางกฎหมาย:
   ลาออกเอง = ไม่ต้องจ่ายค่าชดเชย · เลิกจ้าง = ต้องจ่ายตามอายุงาน (ม.118)
   ใช้กรอกเหตุผลออกจากงานในแบบ สปส.6-09 ได้ด้วย */
const RESIGN_REASONS=[
  ['voluntary',  'ลาออกเอง',              false],
  ['contract',   'สิ้นสุดสัญญาจ้าง',        false],
  ['probation',  'ไม่ผ่านทดลองงาน',        true,
    'ทำงานครบ 120 วันแล้วต้องจ่ายค่าชดเชย แม้ยังอยู่ในช่วงทดลองงาน — ไม่ครบ 120 วันไม่ต้องจ่าย'],
  ['retire',     'เกษียณอายุ',             true ],
  ['layoff',     'เลิกจ้าง',               true ],
  ['redundancy', 'เลิกจ้างเพราะยุบหน่วยงาน', true ],
  ['misconduct', 'ให้ออกเพราะกระทำผิด',     false],
  ['death',      'เสียชีวิต',              true ],
  ['other',      'อื่น ๆ',                 false]
];
function resignReasonLabel(code){
  const r=RESIGN_REASONS.find(x=>x[0]===code);
  return r?r[1]:'';
}
/* ต้องจ่ายค่าชดเชยไหม — ใช้เตือนบนหน้าจอเท่านั้น ไม่ได้คำนวณเงินให้ */
function resignNeedsSeverance(code){
  const r=RESIGN_REASONS.find(x=>x[0]===code);
  return !!(r && r[2]);
}
/* บางกรณีมีเงื่อนไขเฉพาะ ใช้ข้อความของตัวเอง ถ้าไม่มีก็ใช้ข้อความกลาง */
function resignSeveranceNote(code){
  const r=RESIGN_REASONS.find(x=>x[0]===code);
  if(!r || !r[2]) return '';
  return r[3] || 'กรณีนี้อาจต้องจ่ายค่าชดเชย';
}
function resignedBeforeToday(e){ if(!e.resignDate) return false; const [y,m,d]=e.resignDate.split('-').map(Number); return new Date(y,m-1,d) < new Date(); }
