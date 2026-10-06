/* app.html · ระบบลางาน — ลำดับไฟล์มีผล (โหลดตามเลข) */
/* ============================================================
   🌴 ระบบลางาน — ผูกกับข้อมูลพนักงาน
   ลาไม่รับค่าจ้าง/ขาดงาน หักเงินเข้าหน้าเงินได้-เงินหักได้
   ============================================================ */
const LEAVE_TYPES=[
  ['sick','ลาป่วย','#ef4444'],
  ['personal','ลากิจ','#f59e0b'],
  ['vacation','ลาพักร้อน','#10b981'],
  ['maternity','ลาคลอด','#ec4899'],
  ['ordination','ลาอุปสมบท','#8b5cf6'],
  ['unpaid','ขาดงาน / ลาไม่รับค่าจ้าง','#64748b'],
  ['other','อื่นๆ','#0ea5e9'],
];
const LEAVE_LAB=k=>{ const t=LEAVE_TYPES.find(x=>x[0]===k); return t?t[1]:k; };
const LEAVE_COL=k=>{ const t=LEAVE_TYPES.find(x=>x[0]===k); return t?t[2]:'#64748b'; };
const QUOTA_TYPES=['sick','personal','vacation'];

function leaveList(){ if(!Array.isArray(DB.leave)) DB.leave=[]; return DB.leave; }
// ชั่วโมงทำงานต่อวัน (ใช้แปลงวันลา ↔ ชั่วโมงลา)
function lvHPD(){ return +DB.leaveHoursPerDay || +DB.otHours || 8; }
function hrsToDays(h){ return Math.round((+h||0)/lvHPD()*10000)/10000; }
function daysToHrs(d){ return Math.round((+d||0)*lvHPD()*100)/100; }
// แสดงจำนวนวันลาให้อ่านง่าย — ถ้าไม่เต็มวันบอกเป็นชั่วโมงกำกับ
function leaveAmountText(l){
  const d=Number(l.days||leaveDaysCount(l.from,l.to||l.from)||0);
  const h=(l.hours!=null && l.hours!=='') ? Number(l.hours) : null;
  if(h!=null) return `${num(h)} ชม.<br><span class="muted" style="font-size:11.5px">= ${num(Math.round(d*100)/100)} วัน</span>`;
  return num(d);
}
/* จำนวนวันลาในช่วง — ไม่นับวันหยุดบริษัท (ปฏิทินวันหยุด) */
function leaveDaysCount(a,b){
  const n=daysBetween(a,b); if(!n) return 0;
  const [y,m,d]=a.split('-').map(Number); let k=0;
  for(let i=0;i<n;i++){ const x=new Date(y,m-1,d+i); const iso=`${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`; if(!isHoliday(iso)) k++; }
  return k;
}
function daysBetween(a,b){
  if(!a||!b) return 0;
  const [y1,m1,d1]=a.split('-').map(Number), [y2,m2,d2]=b.split('-').map(Number);
  const A=new Date(y1,m1-1,d1), B=new Date(y2,m2-1,d2);
  if(B<A) return 0;
  return Math.round((B-A)/86400000)+1;
}
// จำนวนวันลาของใบลานี้ที่ตกอยู่ในงวด p
function leaveDaysInPeriod(lv, p){
  const {from,to}=periodRange(p);
  const [y1,m1,d1]=lv.from.split('-').map(Number), [y2,m2,d2]=(lv.to||lv.from).split('-').map(Number);
  let A=new Date(y1,m1-1,d1), B=new Date(y2,m2-1,d2);
  if(A<from) A=from; if(B>to) B=to;
  if(A>B) return 0;
  const iso=x=>`${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`;
  const span=leaveDaysCount(iso(A), iso(B));
  const total=leaveDaysCount(lv.from, lv.to||lv.from) || 1;
  // ถ้าผู้ใช้ระบุจำนวนวันเอง (เช่นลาครึ่งวัน) เฉลี่ยตามสัดส่วน
  return Math.round((Number(lv.days||total) * span/total)*100)/100;
}
// วันครบ 1 ปีของพนักงาน (วันเริ่มงาน + 1 ปี)
function anniversary1Y(emp){
  if(!emp || !emp.startDate) return null;
  const [y,m,d]=String(emp.startDate).split('-').map(Number);
  if(!y||!m||!d) return null;
  return new Date(y+1, m-1, d);
}
// สิทธิ์ลาพักร้อนของปีที่ดู: ต้องทำงานครบ 1 ปีแล้ว
//   ปีที่ผ่านมา/ปีอนาคต → วัดที่สิ้นปีนั้น · ปีปัจจุบัน → วัดที่วันนี้
function vacationEligible(emp, year){
  const ann=anniversary1Y(emp);
  if(!ann) return { ok:false, ann:null, reason:'ไม่ได้ระบุวันเริ่มงาน' };
  const nowY=new Date().getFullYear();
  const asOf = (year===nowY) ? new Date() : new Date(year,11,31);
  return { ok: ann<=asOf, ann, asOf };
}
function fmtThaiDate(d){ return d? `${d.getDate()} ${THAI_MONTHS_ABBR[d.getMonth()]} ${d.getFullYear()+543}` : '-'; }
// อายุงาน ณ วันที่อ้างอิง — คืนข้อความอ่านง่าย
function serviceText(emp, year){
  if(!emp.startDate) return '-';
  const [y,m,d]=String(emp.startDate).split('-').map(Number);
  const S=new Date(y,m-1,d);
  const nowY=new Date().getFullYear();
  const asOf=(year===nowY)?new Date():new Date(year,11,31);
  if(S>asOf) return 'ยังไม่เริ่มงาน';
  let yy=asOf.getFullYear()-S.getFullYear();
  let mm=asOf.getMonth()-S.getMonth();
  if(asOf.getDate()<S.getDate()) mm--;
  if(mm<0){ yy--; mm+=12; }
  return (yy>0? yy+' ปี ':'') + mm + ' เดือน';
}
/* ตั้งโควตาเฉพาะพนักงานคนหนึ่ง — เว้นว่าง = ใช้ค่าส่วนกลาง */
function empQuotaForm(emp, year){
  if(!emp) return;
  const g=DB.leaveQuota||{};
  const vac=vacationEligible(emp, year);
  openModal('ตั้งโควตาวันลา — '+emp.name, `
    <div class="muted" style="font-size:13px;margin-bottom:12px;line-height:1.7">
      กรอกเฉพาะประเภทที่ต้องการให้ต่างจากคนอื่น · <strong>เว้นว่าง = ใช้ค่าส่วนกลาง</strong><br>
      อายุงาน ${esc(serviceText(emp, year))}${vac.ann?' · ครบ 1 ปี '+esc(fmtThaiDate(vac.ann)):''}
    </div>
    ${QUOTA_TYPES.map(k=>`
      <div class="field"><label>${esc(LEAVE_LAB(k))} (วัน/ปี)</label>
        <input type="number" min="0" step="0.5" id="eq_${k}" value="${ownQuota(emp,k)??''}"
          placeholder="ค่าส่วนกลาง ${num(+g[k]||0)} วัน"></div>`).join('')}
    ${!vac.ok?`<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:10px 13px;font-size:12.5px;color:#92400e">
      ⚠️ คนนี้ยังทำงานไม่ครบ 1 ปี — ถึงตั้งโควตาลาพักร้อนไว้ ระบบก็ยังไม่ให้สิทธิ์จนกว่าจะครบตามกฎหมาย</div>`:''}`,
    [['ยกเลิก','ghost',closeModal],
     ['ใช้ค่าส่วนกลาง','ghost',()=>{
       delete emp.quota; save(); closeModal(); render(); toast('กลับไปใช้ค่าส่วนกลางแล้ว');
     }],
     ['บันทึก','',()=>{
       const q={};
       QUOTA_TYPES.forEach(k=>{ const v=$('#eq_'+k).value.trim(); if(v!=='') q[k]=Math.max(0,+v||0); });
       if(Object.keys(q).length) emp.quota=q; else delete emp.quota;
       save(); closeModal(); render();
       toast(Object.keys(q).length? 'บันทึกโควตาของ '+emp.name+' แล้ว' : 'กลับไปใช้ค่าส่วนกลางแล้ว');
     }]]);
}
/* โควตารายคน — ตั้งทับค่าส่วนกลางได้ (เช่น ลาพักร้อนเพิ่มตามอายุงานหรือตามสัญญาจ้าง)
   เก็บที่ emp.quota = { sick, personal, vacation } · ค่าว่าง/ไม่ได้ตั้ง = ใช้ค่าส่วนกลาง */
function ownQuota(emp, type){
  const v=emp && emp.quota && emp.quota[type];
  return (v===''||v===null||v===undefined) ? null : (+v||0);
}
function hasOwnQuota(emp, type){ return ownQuota(emp,type)!==null; }
// โควตาที่ได้จริงของพนักงานคนนี้ในปีนี้ (ลาพักร้อนผูกกับอายุงานครบ 1 ปี)
function quotaFor(emp, type, year){
  const own=ownQuota(emp,type);
  const base = own!==null ? own : (+((DB.leaveQuota||{})[type])||0);
  if(type!=='vacation') return base;
  return vacationEligible(emp, year).ok ? base : 0;
}

function leaveUsed(empId, year, type){
  return leaveList().filter(l=>l.empId===empId && l.type===type && l.status!=='rejected'
      && String(l.from||'').slice(0,4)===String(year))
    .reduce((s,l)=>s+Number(l.days||leaveDaysCount(l.from,l.to||l.from)||0),0);
}
/* จำนวนวันลาไม่รับค่าจ้าง/ขาดงานที่ตกอยู่ในงวดนี้ (ใบที่ไม่อนุมัติไม่นับ) */
function unpaidDays(emp, p){
  if(!Array.isArray(DB.leave)) return 0;
  return Math.round(DB.leave.filter(l=>l.empId===emp.id && l.type==='unpaid' && l.status!=='rejected')
    .reduce((s,l)=>s+leaveDaysInPeriod(l,p),0)*100)/100;
}
function unpaidDeduction(emp, p){
  if(emp.payType==='daily') return 0;   // รายวันไม่จ่ายวันที่ไม่มา อยู่แล้ว
  const d=unpaidDays(emp, p);
  if(!d) return 0;
  return Math.round(Number(emp.salary||0)/30*d);
}

let leaveYear, leaveEmpF='all', leaveTypeF='all';
function vLeave(v){
  ckLeaveSync(true);
  setTimeout(()=>document.querySelectorAll('[data-lvfiles]').forEach(b=>b.onclick=async()=>{
    openModal('📎 รูปแนบใบลา','<div class="empty">กำลังโหลด…</div>',[['ปิด','',closeModal]]);
    const {data,error}=await sb.from('leave_requests').select('attachments').eq('id',+b.dataset.lvfiles).maybeSingle();
    const box=$('#modal').querySelector('.empty')||$('#modal');
    if(error||!data){ box.textContent='โหลดรูปไม่สำเร็จ'+(error?': '+error.message:''); return; }
    box.outerHTML=(data.attachments||[]).filter(s=>String(s).startsWith('data:image/jpeg;base64,'))
      .map(s=>`<img src="${s}" alt="" style="width:100%;border-radius:12px;margin-bottom:10px">`).join('')||'<div class="empty">ไม่มีรูป</div>';
  }),0);
  // ไม่นับใบลาของพนักงานที่ถูกลบไปแล้ว (ข้อมูลเก่าก่อนแก้เรื่องเก็บกวาด)
  const alive=new Set(DB.employees.map(e=>e.id));
  const lst=leaveList().filter(l=>alive.has(l.empId));
  const py=+PERIOD.split('-')[0];
  if(leaveYear===undefined) leaveYear=py;
  const yr=leaveYear;   // null = ทุกปี
  const inYr=l=>yr===null || String(l.from||'').slice(0,4)===String(yr);

  let rows=lst.filter(inYr);
  if(leaveEmpF!=='all') rows=rows.filter(l=>l.empId===leaveEmpF);
  if(leaveTypeF!=='all') rows=rows.filter(l=>l.type===leaveTypeF);
  rows=rows.slice().sort((a,b)=>String(b.from).localeCompare(String(a.from)));

  const yrAll=lst.filter(inYr);
  const totDays=yrAll.filter(l=>l.status!=='rejected').reduce((s,l)=>s+Number(l.days||leaveDaysCount(l.from,l.to||l.from)||0),0);
  const byType={}; LEAVE_TYPES.forEach(([k])=>byType[k]=0);
  yrAll.filter(l=>l.status!=='rejected').forEach(l=>{ byType[l.type]=(byType[l.type]||0)+Number(l.days||leaveDaysCount(l.from,l.to||l.from)||0); });
  const pend=yrAll.filter(l=>l.status==='pending').length;

  v.appendChild(el(`<div class="cards">
    <div class="kpi b1"><div class="lab">📝 ใบลา${yr===null?' (ทุกปี)':' ปี '+(yr+543)}</div><div class="val">${num(yrAll.length)} <span class="muted" style="font-size:14px">ใบ</span></div></div>
    <div class="kpi b2"><div class="lab">📅 วันลารวม</div><div class="val">${num(totDays)} <span class="muted" style="font-size:14px">วัน</span></div></div>
    <div class="kpi b3"><div class="lab">⏳ รออนุมัติ</div><div class="val">${num(pend)} <span class="muted" style="font-size:14px">ใบ</span></div></div>
    <div class="kpi b4"><div class="lab">💸 ขาดงาน/ไม่รับค่าจ้าง</div><div class="val">${num(byType.unpaid||0)} <span class="muted" style="font-size:14px">วัน</span></div></div>
  </div>`));

  const yset=new Set([py]); lst.forEach(l=>{ if(l.from) yset.add(+String(l.from).slice(0,4)); });
  const years=[...yset].sort((a,b)=>b-a);
  const active=DB.employees.filter(e=>!e.resignDate);

  const bar=el(`<div class="toolbar">
    <button class="btn sm" id="lvAdd">➕ เพิ่มใบลา</button>
    <button class="btn ghost sm" id="lvExp">⬇️ ส่งออก CSV</button>
    <button class="btn ghost sm" id="lvImp">⬆️ นำเข้า CSV</button>
    <button class="btn ghost sm" id="lvPush">➡️ หักเงินขาดงานเข้างวด</button>
    <div class="field" style="margin-left:auto"><label>พนักงาน</label>
      <select id="lvEmp"><option value="all">ทั้งหมด</option>
        ${DB.employees.map(e=>`<option value="${e.id}" ${leaveEmpF===e.id?'selected':''}>${esc(e.code)} — ${esc(e.name)}</option>`).join('')}</select></div>
    <div class="field"><label>ประเภท</label>
      <select id="lvType"><option value="all">ทั้งหมด</option>
        ${LEAVE_TYPES.map(([k,l])=>`<option value="${k}" ${leaveTypeF===k?'selected':''}>${esc(l)}</option>`).join('')}</select></div>
    <div class="field"><label>ปี (พ.ศ.)</label>
      <select id="lvYr"><option value="">ทุกปี</option>${years.map(y=>`<option value="${y}" ${yr===y?'selected':''}>${y+543}</option>`).join('')}</select></div>
  </div>`);
  v.appendChild(bar);
  bar.querySelector('#lvAdd').onclick=()=>leaveModal(null);
  bar.querySelector('#lvExp').onclick=exportLeaveCSV;
  bar.querySelector('#lvImp').onclick=importLeaveCSV;
  bar.querySelector('#lvPush').onclick=pushUnpaidToPayroll;
  bar.querySelector('#lvEmp').onchange=e=>{ leaveEmpF=e.target.value; render(); };
  bar.querySelector('#lvType').onchange=e=>{ leaveTypeF=e.target.value; render(); };
  bar.querySelector('#lvYr').onchange=e=>{ leaveYear=e.target.value===''?null:+e.target.value; render(); };

  // โควตาวันลาต่อปี
  const q=DB.leaveQuota||{};
  const cfg=el(`<div class="panel" style="margin-bottom:16px"><div class="pbody">
    <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end">
      ${QUOTA_TYPES.map(k=>`<div class="field"><label>โควตา${LEAVE_LAB(k)} (วัน/ปี)${k==='vacation'?' <span style="color:#b45309">*</span>':''}</label>
        <input type="number" min="0" step="0.5" id="lq_${k}" value="${q[k]??''}"></div>`).join('')}
      <div class="field" style="max-width:170px"><label>ชั่วโมงทำงาน/วัน</label>
        <input type="number" min="1" step="0.5" id="lvHPD" value="${lvHPD()}"></div>
      <button class="btn ghost sm" id="lvQSave">💾 บันทึกโควตา</button>
      <span class="muted" style="font-size:12.5px">ตามกฎหมายแรงงาน: ลาป่วย 30 วัน · ลากิจ 3 วัน · ลาพักร้อน 6 วัน<br>
        <span style="color:#b45309">* ลาพักร้อนให้เฉพาะพนักงานที่ทำงานครบ 1 ปีแล้ว — คนที่ยังไม่ครบจะไม่ได้โควตา</span></span>
    </div></div></div>`);
  v.appendChild(cfg);
  cfg.querySelector('#lvQSave').onclick=()=>{
    DB.leaveQuota=DB.leaveQuota||{};
    QUOTA_TYPES.forEach(k=>{ DB.leaveQuota[k]=+cfg.querySelector('#lq_'+k).value||0; });
    DB.leaveHoursPerDay=Math.max(1,+cfg.querySelector('#lvHPD').value||8);
    save(); render(); toast('บันทึกโควตาแล้ว');
  };

  if(!DB.employees.length){ v.appendChild(el(`<div class="panel"><div class="empty">${tr('no_emp_hint')}</div></div>`)); return; }

  // ตารางใบลา
  const stCol={approved:'#dcfce7;color:#16a34a', pending:'#fef3c7;color:#b45309', rejected:'#fee2e2;color:#dc2626'};
  const stLab={approved:'อนุมัติ', pending:'รออนุมัติ', rejected:'ไม่อนุมัติ'};
  const body=rows.length? rows.map(l=>{
    const e=DB.employees.find(x=>x.id===l.empId);
    const dd=Number(l.days||leaveDaysCount(l.from,l.to||l.from)||0);
    return `<tr>
      <td>${e?`<strong>${esc(e.name)}</strong><br><span class="muted" style="font-size:12px">${esc(e.code)} · ${esc(e.dept||'-')}</span>`
             :'<span class="muted">— ไม่พบพนักงาน —</span>'}</td>
      <td><span class="chip" style="background:${LEAVE_COL(l.type)}22;color:${LEAVE_COL(l.type)}">${esc(LEAVE_LAB(l.type))}</span></td>
      <td style="white-space:nowrap">${esc(l.from||'')}${l.to&&l.to!==l.from?'<br>ถึง '+esc(l.to):''}</td>
      <td class="num"><strong>${leaveAmountText(l)}</strong></td>
      <td>${esc(l.reason||'')||'<span class="muted">-</span>'}${l.reqId&&l.files?` <button class="btn ghost sm" data-lvfiles="${l.reqId}" style="padding:2px 8px">📎 ${l.files}</button>`:''}</td>
      <td><span class="chip" style="background:${stCol[l.status]||stCol.approved}">${stLab[l.status]||l.status}</span></td>
      <td style="text-align:right;white-space:nowrap">
        <button class="btn ghost sm" data-lv-ed="${l.id}">✏️</button>
        <button class="btn danger sm" data-lv-del="${l.id}">🗑️</button></td>
    </tr>`;
  }).join('') : `<tr><td colspan="7"><div class="empty">ยังไม่มีใบลา — กด “➕ เพิ่มใบลา”</div></td></tr>`;

  const panel=el(`<div class="panel"><div class="phead" style="padding:12px 16px;font-weight:700">📝 รายการใบลา (${rows.length})</div>
    <div class="pbody" style="padding:0"><div class="tbl-wrap"><table>
    <thead><tr><th>พนักงาน</th><th>ประเภท</th><th>วันที่</th><th class="num">วัน</th><th>เหตุผล</th><th>สถานะ</th><th></th></tr></thead>
    <tbody>${body}</tbody></table></div></div></div>`);
  v.appendChild(panel);
  panel.querySelectorAll('[data-lv-ed]').forEach(b=>b.onclick=()=>leaveModal(b.dataset.lvEd));
  panel.querySelectorAll('[data-lv-del]').forEach(b=>b.onclick=()=>{
    const l=leaveList().find(x=>x.id===b.dataset.lvDel); if(!l) return;
    const e=DB.employees.find(x=>x.id===l.empId);
    openModal('ลบใบลา',`<p>ลบใบลา${esc(LEAVE_LAB(l.type))} ของ <strong>${esc(e?e.name:'-')}</strong> วันที่ ${esc(l.from)} ?</p>`,
      [['ยกเลิก','ghost',closeModal],['ลบ','danger',()=>{
        DB.leave=leaveList().filter(x=>x.id!==l.id); save(); closeModal(); render(); toast('ลบใบลาแล้ว');
      }]]);
  });

  // สรุปโควตาคงเหลือรายคน
  if(yr!==null && active.length){
    const qrows=active.map(e=>{
      const vac=vacationEligible(e, yr);
      const cells=QUOTA_TYPES.map(k=>{
        const used=leaveUsed(e.id, yr, k), quota=quotaFor(e, k, yr);
        // ลาพักร้อนแต่ยังไม่ครบ 1 ปี → ไม่มีสิทธิ์
        if(k==='vacation' && !vac.ok){
          return `<td class="num"><span class="chip" style="background:#f1f5f9;color:#64748b">ยังไม่มีสิทธิ์</span>
            <br><span class="muted" style="font-size:11.5px">${vac.ann?'ครบ 1 ปี '+fmtThaiDate(vac.ann):esc(vac.reason||'')}</span>
            ${used?`<br><span style="font-size:12px;color:#dc2626">ใช้ไป ${num(used)} วัน</span>`:''}</td>`;
        }
        const left=quota-used, over=quota>0&&left<0;
        const own=hasOwnQuota(e,k);
        return `<td class="num">${num(used)}${quota?` <span class="muted">/ ${num(quota)}</span>`:''}
          ${own?'<span title="ตั้งเฉพาะคนนี้" style="color:#7c3aed;font-weight:800">•</span>':''}
          ${quota?`<br><span style="font-size:12px;color:${over?'#dc2626':'#16a34a'}">${over?'เกิน '+num(-left):'เหลือ '+num(left)}</span>`:''}</td>`;
      }).join('');
      const other=LEAVE_TYPES.filter(([k])=>!QUOTA_TYPES.includes(k))
        .reduce((s,[k])=>s+leaveUsed(e.id,yr,k),0);
      return `<tr><td>${esc(e.code)}</td><td><strong>${esc(e.name)}</strong>
        ${e.startDate?`<br><span class="muted" style="font-size:11.5px">เริ่ม ${esc(e.startDate)}</span>`:''}</td>
        <td class="num">${esc(serviceText(e, yr))}</td>${cells}
        <td class="num">${other?num(other):'<span class="muted">-</span>'}</td>
        <td class="num"><button class="btn ghost sm" data-eq="${e.id}" title="ตั้งโควตาเฉพาะคนนี้">⚙️ ตั้งโควตา</button></td></tr>`;
    }).join('');
    const nEligible=active.filter(e=>vacationEligible(e,yr).ok).length;
    const nCustom=active.filter(e=>QUOTA_TYPES.some(k=>hasOwnQuota(e,k))).length;
    const qp=el(`<div class="panel" style="margin-top:16px">
      <div class="phead" style="padding:12px 16px;font-weight:700">📊 โควตาวันลาคงเหลือ ปี ${yr+543}</div>
      <div class="pbody" style="padding:0"><div class="tbl-wrap"><table>
      <thead><tr><th>${tr('th_code')}</th><th>${tr('th_name')}</th><th class="num">อายุงาน</th>
        ${QUOTA_TYPES.map(k=>`<th class="num">${esc(LEAVE_LAB(k))}${k==='vacation'?'<br><span style="font-weight:400;font-size:11px">ต้องครบ 1 ปี</span>':''}</th>`).join('')}
        <th class="num">ลาอื่น ๆ</th><th class="num"></th></tr></thead>
      <tbody>${qrows}</tbody></table></div>
      <div style="padding:11px 16px;font-size:12.5px;color:var(--muted);border-top:1px solid var(--line);line-height:1.8">
        🌴 <strong>ลาพักร้อน</strong>: มีสิทธิ์เฉพาะผู้ที่ทำงานติดต่อกัน<strong>ครบ 1 ปี</strong>แล้วเท่านั้น
        (พ.ร.บ.คุ้มครองแรงงาน ม.30) — ปี ${yr+543} มีสิทธิ์ <strong>${num(nEligible)}</strong> / ${num(active.length)} คน<br>
        <span style="color:#7c3aed;font-weight:800">•</span> = ตั้งโควตาเฉพาะคนนี้ ไม่ใช้ค่าส่วนกลาง
        (ตอนนี้ <strong>${num(nCustom)}</strong> คน) — กด <strong>⚙️ ตั้งโควตา</strong> ท้ายแถวเพื่อแก้รายคน
      </div></div></div>`);
    v.appendChild(qp);
    qp.querySelectorAll('[data-eq]').forEach(b=>b.onclick=()=>
      empQuotaForm(DB.employees.find(x=>x.id===b.dataset.eq), yr));
  }
}

function leaveModal(id){
  const lst=leaveList();
  const cur=id? lst.find(x=>x.id===id) : null;
  const pool=cur? DB.employees : DB.employees.filter(e=>!e.resignDate);
  if(!pool.length){ toast('ยังไม่มีพนักงาน'); return; }
  const {from,to}=periodRange(PERIOD);
  // เปิดฟอร์มใหม่ให้ตั้งเป็นวันนี้ ถ้าวันนี้ไม่อยู่ในงวดที่เลือกอยู่ค่อยใช้วันแรกของงวด
  const today=new Date(); today.setHours(0,0,0,0);
  const inPeriod = today>=from && today<=to;
  const d0=cur?cur.from:isoOf(inPeriod?today:from);
  openModal(cur?'✏️ แก้ไขใบลา':'➕ เพิ่มใบลา',
    `<div class="field"><label>พนักงาน *</label><select id="lvE">
      ${pool.map(e=>`<option value="${e.id}" ${cur&&cur.empId===e.id?'selected':''}>${esc(e.code)} — ${esc(e.name)}${e.resignDate?' (ลาออกแล้ว)':''}</option>`).join('')}</select></div>
     <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:10px">
       <div class="field"><label>ประเภทการลา *</label><select id="lvT">
         ${LEAVE_TYPES.map(([k,l])=>`<option value="${k}" ${cur&&cur.type===k?'selected':''}>${esc(l)}</option>`).join('')}</select></div>
       <div class="field"><label>สถานะ</label><select id="lvS">
         <option value="approved" ${!cur||cur.status==='approved'?'selected':''}>อนุมัติ</option>
         <option value="pending" ${cur&&cur.status==='pending'?'selected':''}>รออนุมัติ</option>
         <option value="rejected" ${cur&&cur.status==='rejected'?'selected':''}>ไม่อนุมัติ</option></select></div>
     </div>
     <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:10px">
       <div class="field"><label>ลาตั้งแต่ *</label><input type="date" id="lvF" value="${esc(d0)}"></div>
       <div class="field"><label>ถึงวันที่ *</label><input type="date" id="lvTo" value="${esc(cur?(cur.to||cur.from):d0)}"></div>
       <div class="field"><label>จำนวนวัน</label><input type="number" step="0.5" min="0" id="lvD" value="${cur?(cur.days??''):''}" placeholder="อัตโนมัติ"></div>
       <div class="field"><label>หรือจำนวนชั่วโมง</label><input type="number" step="0.5" min="0" id="lvH" value="${cur&&cur.hours!=null?cur.hours:''}" placeholder="เช่น 2"></div>
     </div>
     <div id="lvAuto" class="muted" style="display:none;font-size:12px;margin-top:6px;color:var(--brand-d)"></div>
     <div class="field" style="margin-top:10px"><label>เหตุผล</label><input id="lvR" value="${esc(cur?cur.reason||'':'')}" placeholder="เช่น ไปโรงพยาบาล"></div>
     <div id="lvWarn" style="display:none;margin-top:10px;background:#fff7ed;border:1px solid #fed7aa;
        border-radius:9px;padding:10px 12px;font-size:12.5px;color:#9a3412"></div>
     <p class="muted" style="font-size:12.5px;margin-top:10px">
       <strong>ลาเป็นวัน</strong> — เลือกช่วงวันที่ จำนวนวันเติมให้เอง (ลาครึ่งวันพิมพ์ทับเป็น 0.5)<br>
       <strong>ลาเป็นชั่วโมง</strong> — ลบจำนวนวันทิ้ง แล้วพิมพ์ชั่วโมงในช่องถัดไป
       (<strong>${num(lvHPD())} ชม. = 1 วัน</strong> ปรับได้ที่ช่อง “ชั่วโมงทำงาน/วัน”)</p>`,
    [['ยกเลิก','ghost',closeModal],[cur?'บันทึก':'เพิ่ม','',()=>{
      const empId=$('#lvE').value, type=$('#lvT').value, status=$('#lvS').value;
      const f=$('#lvF').value, t=$('#lvTo').value||$('#lvF').value;
      const manual=$('#lvD').value.trim(), manualH=$('#lvH').value.trim();
      if(!empId||!f){ toast('กรอกข้อมูลไม่ครบ'); return; }
      if(daysBetween(f,t)===0){ toast('ช่วงวันที่ไม่ถูกต้อง (วันสิ้นสุดต้องไม่ก่อนวันเริ่ม)'); return; }
      // กรอกชั่วโมง → แปลงเป็นวันให้ (โควตาและการหักเงินคิดเป็นวันทั้งระบบ)
      let days, hours=null;
      if(manualH!==''){ hours=+manualH; days=hrsToDays(hours); }
      else if(manual!==''){ days=+manual; }
      else { days=leaveDaysCount(f,t); }
      if(!(days>0)){ toast(manualH!==''?'จำนวนชั่วโมงต้องมากกว่า 0':'จำนวนวันต้องมากกว่า 0'); return; }
      const rec={ empId, type, status, from:f, to:t, days, hours, reason:$('#lvR').value.trim() };
      if(cur) Object.assign(cur, rec); else leaveList().push({ id:uid(), ...rec });
      save(); closeModal(); render(); toast(cur?'บันทึกใบลาแล้ว':'เพิ่มใบลาแล้ว');
    }]]);
  // เตือนถ้าเลือกลาพักร้อนให้คนที่ยังทำงานไม่ครบ 1 ปี
  const chkVac=()=>{
    const box=$('#lvWarn'); if(!box) return;
    const e=DB.employees.find(x=>x.id===$('#lvE').value);
    const yr=+String($('#lvF').value||'').slice(0,4) || new Date().getFullYear();
    if($('#lvT').value==='vacation' && e){
      const vac=vacationEligible(e, yr);
      if(!vac.ok){
        box.style.display='block';
        box.innerHTML=`⚠️ <strong>${esc(e.name)}</strong> ยังทำงานไม่ครบ 1 ปี จึงยังไม่มีสิทธิ์ลาพักร้อน`
          + (vac.ann? ` — จะครบ 1 ปีวันที่ <strong>${fmtThaiDate(vac.ann)}</strong>` : ` (${esc(vac.reason||'')})`)
          + `<br>บันทึกได้ แต่จะแสดงเป็น “ใช้เกินสิทธิ์” ในตารางโควตา`;
        return;
      }
    }
    box.style.display='none';
  };
  ['#lvE','#lvT','#lvF'].forEach(s=>{ const n=$(s); if(n) n.addEventListener('change', chkVac); });
  chkVac();
  // กรอกช่องไหน อีกช่องคำนวณตาม + เติมจำนวนวันจากช่วงวันที่ให้เอง
  const dIn=$('#lvD'), hIn=$('#lvH'), fIn=$('#lvF'), tIn=$('#lvTo'), note=$('#lvAuto');
  if(dIn&&hIn){
    let lock=false;
    // โหมดอัตโนมัติ = ผู้ใช้ยังไม่ได้พิมพ์จำนวนวัน/ชั่วโมงเอง
    // ใบลาเดิมที่มีตัวเลขบันทึกไว้แล้วถือว่ากรอกเอง จะได้ไม่ถูกเขียนทับตอนเปิดแก้ไข
    let auto = !(cur && (cur.days!=null || cur.hours!=null));
    const showNote=(txt)=>{ if(note){ note.textContent=txt||''; note.style.display=txt?'':'none'; } };
    const syncFromDates=()=>{
      if(!auto) return;
      const f=fIn?fIn.value:'', t=(tIn&&tIn.value)||f;
      const d=leaveDaysCount(f,t), hol=daysBetween(f,t)-d;
      if(daysBetween(f,t)>0){
        lock=true; dIn.value=String(d); hIn.value=''; lock=false;
        showNote('นับจากช่วงวันที่ให้'+(hol?` (ไม่นับวันหยุดบริษัท ${hol} วัน)`:'')+' — พิมพ์ทับได้ถ้าลาไม่เต็มวัน');
      }else{
        lock=true; dIn.value=''; hIn.value=''; lock=false;
        showNote('');
      }
    };
    // แตะช่องไหนก็ตาม (รวมถึงลบทิ้ง) = ผู้ใช้คุมเอง ระบบจะไม่เติมกลับ
    // จำเป็นสำหรับการลาเป็นชั่วโมง — ต้องลบจำนวนวันทิ้งก่อนแล้วพิมพ์ชั่วโมง
    const markManual=()=>{
      auto=false;
      showNote(dIn.value.trim()==='' && hIn.value.trim()===''
        ? 'ลบจำนวนวันแล้ว — พิมพ์จำนวนชั่วโมงในช่องถัดไป หรือเปลี่ยนวันที่เพื่อให้นับใหม่'
        : '');
    };
    dIn.addEventListener('input',()=>{ if(lock) return; lock=true;
      hIn.value = dIn.value.trim()===''?'':String(daysToHrs(+dIn.value||0)); lock=false; markManual(); });
    hIn.addEventListener('input',()=>{ if(lock) return; lock=true;
      dIn.value = hIn.value.trim()===''?'':String(Math.round(hrsToDays(+hIn.value||0)*10000)/10000); lock=false; markManual(); });
    // เลือกวันที่ใหม่ = ตั้งใจลาเป็นวัน ให้กลับมานับให้อัตโนมัติ
    const onDate=()=>{ auto=true; syncFromDates(); };
    [fIn,tIn].forEach(n=>{ if(n){ n.addEventListener('change',onDate); n.addEventListener('input',onDate); } });
    syncFromDates();
  }
}

const LV_CSV_HEAD=['รหัสพนักงาน','ประเภท','ลาตั้งแต่(ปปปป-ดด-วว)','ถึงวันที่(ปปปป-ดด-วว)','จำนวนวัน','จำนวนชั่วโมง','เหตุผล','สถานะ'];
function exportLeaveCSV(){
  const lines=[LV_CSV_HEAD.map(csvEsc).join(',')];
  const yr=leaveYear;
  leaveList().filter(l=>yr===null||yr===undefined||String(l.from||'').slice(0,4)===String(yr)).forEach(l=>{
    const e=DB.employees.find(x=>x.id===l.empId);
    lines.push([e?e.code:'', LEAVE_LAB(l.type), l.from||'', l.to||l.from||'',
      l.days||daysBetween(l.from,l.to||l.from), (l.hours!=null?l.hours:''), l.reason||'',
      l.status==='pending'?'รออนุมัติ':l.status==='rejected'?'ไม่อนุมัติ':'อนุมัติ'].map(csvEsc).join(','));
  });
  downloadFile(`leave_${leaveYear||'all'}.csv`, '﻿'+lines.join('\r\n'), 'text/csv;charset=utf-8');
  toast(`ส่งออก CSV แล้ว (${lines.length-1} ใบ)`);
}
function importLeaveCSV(){
  const inp=document.createElement('input'); inp.type='file'; inp.accept='.csv,text/csv';
  inp.onchange=()=>{ const f=inp.files[0]; if(!f) return; const rd=new FileReader();
    rd.onload=()=>{
      const rows=parseCSV(decodeTextBytes(rd.result));
      if(rows.length<2){ toast('ไฟล์ CSV ว่างเปล่า'); return; }
      let ok=0; const unknown=new Set(); const bad=[];
      for(let r=1;r<rows.length;r++){
        const c=rows[r]; if(!c||!String(c[0]||'').trim()) continue;
        const code=String(c[0]).trim();
        const emp=DB.employees.find(x=>String(x.code).trim()===code);
        if(!emp){ unknown.add(code); continue; }
        const tTxt=String(c[1]||'').trim();
        const t=(LEAVE_TYPES.find(([k,l])=>l===tTxt||k===tTxt)||['unpaid'])[0];
        const fr=String(c[2]||'').trim(), to=String(c[3]||'').trim()||fr;
        if(!/^\d{4}-\d{2}-\d{2}$/.test(fr)){ bad.push(`บรรทัด ${r+1}: วันที่ "${fr}"`); continue; }
        if(daysBetween(fr,to)===0){ bad.push(`บรรทัด ${r+1}: ช่วงวันที่ไม่ถูกต้อง`); continue; }
        const hTxt=String(c[5]||'').trim();
        const hours = hTxt!=='' ? +hTxt : null;
        const days = hours!=null ? hrsToDays(hours) : (+c[4]||leaveDaysCount(fr,to));
        const stTxt=String(c[7]||'').trim();
        const status=/รออนุมัติ|pending/i.test(stTxt)?'pending':/ไม่อนุมัติ|reject/i.test(stTxt)?'rejected':'approved';
        leaveList().push({ id:uid(), empId:emp.id, type:t, from:fr, to, days, hours,
          reason:String(c[6]||'').trim(), status });
        ok++;
      }
      save(); render();
      let msg=`นำเข้าใบลา ${ok} ใบ`;
      if(unknown.size) msg+=` · ไม่พบรหัส ${[...unknown].slice(0,3).join(', ')}`;
      if(bad.length) msg+=` · ผิดรูปแบบ ${bad.length} บรรทัด`;
      toast(msg);
    };
    rd.readAsArrayBuffer(f); };
  inp.click();
}
// หักเงินขาดงาน/ลาไม่รับค่าจ้าง เข้าช่อง "หักขาดงาน" ของงวดนี้
function pushUnpaidToPayroll(){
  const list=DB.employees.filter(e=>!resignedBefore(e,PERIOD));
  const targets=list.map(e=>({e, amt:unpaidDeduction(e,PERIOD),
      d:leaveList().filter(l=>l.empId===e.id&&l.type==='unpaid'&&l.status!=='rejected')
        .reduce((s,l)=>s+leaveDaysInPeriod(l,PERIOD),0)}))
    .filter(x=>x.d>0);
  if(!targets.length){ toast('ไม่มีวันขาดงาน/ลาไม่รับค่าจ้างในงวดนี้'); return; }
  const rowsHtml=targets.map(({e,amt,d})=>`<tr><td>${esc(e.name)}</td><td class="num">${num(d)}</td>
    <td class="num">${e.payType==='daily'?'<span class="muted">คิดจากวันทำงานแล้ว</span>':'<strong>'+money(amt)+'</strong>'}</td></tr>`).join('');
  openModal('➡️ หักเงินขาดงานเข้างวด '+periodLabel(PERIOD),
    `<div class="tbl-wrap"><table><thead><tr><th>พนักงาน</th><th class="num">วันขาด</th><th class="num">หักเงิน</th></tr></thead>
      <tbody>${rowsHtml}</tbody></table></div>
     <p class="muted" style="font-size:12.5px;margin-top:10px">สูตร: เงินเดือน ÷ 30 × จำนวนวันขาด · เขียนลงช่อง “หักขาดงาน/ลาไม่รับค่าจ้าง”<br>
     พนักงานรายวันไม่ถูกหัก เพราะได้ค่าจ้างตามจำนวนวันที่มาทำงานอยู่แล้ว</p>`,
    [['ยกเลิก','ghost',closeModal],['เขียนข้อมูล','',()=>{
      let n=0;
      targets.forEach(({e,amt})=>{
        if(e.payType==='daily') return;
        const r=getRec(PERIOD, e.id);
        r.ded.absent=amt; n++;
        autoDeductions(e, r);
      });
      save(); closeModal(); toast(`หักเงินขาดงานแล้ว ${n} คน`);
    }]]);
}

