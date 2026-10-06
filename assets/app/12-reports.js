/* app.html · สรุป, แผนก, รายละเอียด, สลิป, 50 ทวิ, ภ.ง.ด.1 — ลำดับไฟล์มีผล (โหลดตามเลข) */
/* ============ 3. SUMMARY ============ */
function vSummary(v){
  const t=periodTotals(PERIOD);
  v.appendChild(el(`<div class="toolbar"><h2 style="font-size:16px">สรุปเงินเดือน — ${periodLabel(PERIOD)}</h2>
    <button class="btn ghost sm" style="margin-left:auto" onclick="printWide()">🖨️ พิมพ์</button></div>`));
  const rows=activeEmps(PERIOD).map(e=>{ const c=calc(e,PERIOD); return `<tr>
    <td><span class="chip">${esc(e.code)}</span></td><td>${esc(e.name)}</td>
    <td class="num pos">${money(c.gross)}</td><td class="num neg">${money(c.dedTotal)}</td><td class="num"><strong>${money(c.net)}</strong></td></tr>`;}).join('');
  const panel=el(`<div class="panel"><div class="pbody" style="padding:0"><div class="tbl-wrap"></div></div></div>`);
  panel.querySelector('.tbl-wrap').appendChild(el(`<table>
    <thead><tr><th>รหัสพนักงาน</th><th>ชื่อ-นามสกุล</th><th class="num">รายได้รวม</th><th class="num">หักรวม</th><th class="num">เงินสุทธิ</th></tr></thead>
    <tbody>${rows||'<tr><td colspan="5" class="empty">ไม่มีข้อมูล</td></tr>'}</tbody>
    <tfoot><tr><td colspan="2">รวมทั้งสิ้น</td><td class="num">${money(t.gross)}</td><td class="num">${money(t.ded)}</td><td class="num">${money(t.net)}</td></tr></tfoot>
  </table>`));
  v.appendChild(panel);
}

/* ============ 4. DEPT SUMMARY ============ */
function vDept(v){
  const t=periodTotals(PERIOD); const depts=deptSummary(PERIOD);
  v.appendChild(el(`<div class="toolbar"><h2 style="font-size:16px">สรุปตามแผนก — ${periodLabel(PERIOD)}</h2>
    <button class="btn ghost sm" style="margin-left:auto" onclick="printWide()">🖨️ พิมพ์</button></div>`));
  const rows=depts.map(d=>`<tr><td><strong>${esc(d.dept)}</strong></td><td class="num">${num(d.count)}</td><td class="num">${money(d.salary)}</td><td class="num pos">${money(d.gross)}</td><td class="num neg">${money(d.ded)}</td><td class="num">${money(d.net)}</td></tr>`).join('');
  const panel=el(`<div class="panel"><div class="pbody" style="padding:0"><div class="tbl-wrap"></div></div></div>`);
  panel.querySelector('.tbl-wrap').appendChild(el(`<table>
    <thead><tr><th>แผนก</th><th class="num">พนักงาน</th><th class="num">เงินเดือน</th><th class="num">รายได้รวม</th><th class="num">หักรวม</th><th class="num">เงินสุทธิ</th></tr></thead>
    <tbody>${rows||'<tr><td colspan="6" class="empty">ไม่มีข้อมูล</td></tr>'}</tbody>
    <tfoot><tr><td>รวมทั้งสิ้น</td><td class="num">${num(t.count)}</td><td class="num">${money(t.salary)}</td><td class="num">${money(t.gross)}</td><td class="num">${money(t.ded)}</td><td class="num">${money(t.net)}</td></tr></tfoot>
  </table>`));
  v.appendChild(panel);
}

/* ============ 5. FULL DETAIL ============ */
function vDetail(v){
  v.appendChild(el(`<div class="toolbar"><h2 style="font-size:16px">สรุปรายละเอียดทั้งหมด — ${periodLabel(PERIOD)}</h2>
    <button class="btn ghost sm" style="margin-left:auto" id="csvBtn">⬇️ CSV</button>
    <button class="btn ghost sm" onclick="printWide()">🖨️ พิมพ์</button></div>`));
  const head = ['รหัส','ชื่อ','แผนก','ค่าจ้างฐาน',...EARN_FIELDS.map(f=>f[1]),'รายได้รวม',...DED_FIELDS.map(f=>f[1]),'หักรวม','สุทธิ'];
  const tot = {}; head.forEach(h=>tot[h]=0);
  const list=activeEmps(PERIOD);   // เฉพาะคนที่อยู่ในงวดนี้ ให้ตรงกับหน้าคำนวณและแดชบอร์ด

  /* คอลัมน์เงินที่เป็นศูนย์ทุกคน — ซ่อนเฉพาะตอนพิมพ์ ไม่งั้นตารางกว้างเกินหน้ากระดาษ
     บนจอยังเห็นครบทุกคอลัมน์เหมือนเดิม
     ต้องคำนวณก่อนสร้างแถว เพราะแถวเรียกใช้ zc() */
  const zeroCol=head.map(()=>false);
  const colVals=head.map(()=>0);
  list.forEach(e=>{
    const c2=calc(e,PERIOD), r2=readRec(PERIOD,e.id);
    const vals=[0,0,0,c2.base,...EARN_FIELDS.map(([k])=>+r2.earn[k]||0),c2.gross,...DED_FIELDS.map(([k])=>+r2.ded[k]||0),c2.dedTotal,c2.net];
    vals.forEach((x,i)=>{ colVals[i]+=Math.abs(x); });
  });
  for(let i=4;i<head.length;i++) zeroCol[i] = colVals[i]<0.005;      // เริ่มที่ 4 เพื่อคง "ค่าจ้างฐาน" ไว้เสมอ
  const zc=i=>zeroCol[i]?' zcol':'';
  const nZero=zeroCol.filter(Boolean).length;

  const bodyRows = list.map(e=>{
    const c=calc(e,PERIOD); const r=c.r;
    const cells=[
      `<span class="chip">${esc(e.code)}</span>`, esc(e.name), esc(e.dept),
      money(c.base),
      ...EARN_FIELDS.map(([k])=>money(r.earn[k])),
      `<strong>${money(c.gross)}</strong>`,
      ...DED_FIELDS.map(([k])=>money(r.ded[k])),
      money(c.dedTotal),
      `<strong>${money(c.net)}</strong>`
    ];
    return `<tr>${cells.map((x,i)=>`<td class="${i>=3?'num':''}${zc(i)}">${x}</td>`).join('')}</tr>`;
  }).join('');
  // footer totals
  const t=periodTotals(PERIOD);
  const sums = {salary:0}; EARN_FIELDS.forEach(([k])=>sums['e_'+k]=0); DED_FIELDS.forEach(([k])=>sums['d_'+k]=0);
  list.forEach(e=>{ const c=calc(e,PERIOD); const r=readRec(PERIOD,e.id); sums.salary+=c.base; EARN_FIELDS.forEach(([k])=>sums['e_'+k]+=+r.earn[k]||0); DED_FIELDS.forEach(([k])=>sums['d_'+k]+=+r.ded[k]||0); });
  const footCells=['รวม','','',money(sums.salary),...EARN_FIELDS.map(([k])=>money(sums['e_'+k])),money(t.gross),...DED_FIELDS.map(([k])=>money(sums['d_'+k])),money(t.ded),money(t.net)];

  const panel=el(`<div class="panel"><div class="pbody" style="padding:0"><div class="tbl-wrap"></div></div></div>`);
  panel.querySelector('.tbl-wrap').appendChild(el(`<table style="font-size:13px">
    <thead><tr>${head.map((h,i)=>`<th class="${i>=3?'num':''}${zc(i)}">${h}</th>`).join('')}</tr></thead>
    <tbody>${bodyRows||`<tr><td colspan="${head.length}" class="empty">ไม่มีข้อมูล</td></tr>`}</tbody>
    <tfoot><tr>${footCells.map((x,i)=>`<td class="${i>=3?'num':''}${zc(i)}">${x}</td>`).join('')}</tr></tfoot>
  </table>`));
  if(nZero) panel.querySelector('.pbody').insertAdjacentHTML('afterbegin',
    `<div class="no-print muted" style="padding:8px 12px;font-size:12px;border-bottom:1px solid var(--line)">🖨️ ตอนพิมพ์จะซ่อน ${num(nZero)} คอลัมน์ที่เป็น 0 ทุกคน เพื่อให้พอดีหน้ากระดาษ (บนจอยังเห็นครบ)</div>`);
  v.appendChild(panel);
  $('#csvBtn').onclick=()=>exportCSV(head, list);
}
function exportCSV(head, list){
  const lines=[head.join(',')];
  (list||activeEmps(PERIOD)).forEach(e=>{ const c=calc(e,PERIOD); const r=c.r;
    const row=[e.code,`"${e.name}"`,`"${e.dept}"`,c.base,...EARN_FIELDS.map(([k])=>r.earn[k]||0),c.gross,...DED_FIELDS.map(([k])=>r.ded[k]||0),c.dedTotal,c.net];
    lines.push(row.join(','));
  });
  downloadFile(`payroll_${PERIOD}.csv`, '﻿'+lines.join('\n'), 'text/csv');
  toast('ส่งออก CSV แล้ว');
}

/* ============ 6. PAYSLIP ============ */
let slipEmpId='ALL';
function vSlip(v){
  v.appendChild(el(`<div class="toolbar no-print">
    <div class="field" style="min-width:260px"><label>เลือกพนักงาน</label>
      <select id="slipSel"><option value="ALL">— ทุกคน —</option>${activeEmps(PERIOD).map(e=>`<option value="${e.id}" ${e.id===slipEmpId?'selected':''}>${esc(e.code)} — ${esc(e.name)}</option>`).join('')}</select></div>
    <button class="btn" style="margin-top:22px" onclick="window.print()">🖨️ พิมพ์สลิป</button>
  </div>`));
  $('#slipSel').onchange=(e)=>{ slipEmpId=e.target.value; render(); };
  const area=el(`<div class="print-area"></div>`); v.appendChild(area);
  const list = slipEmpId==='ALL'?activeEmps(PERIOD):DB.employees.filter(e=>e.id===slipEmpId);
  if(list.length===0){ area.appendChild(el(`<div class="empty">ไม่มีข้อมูล</div>`)); return; }
  list.forEach(e=>area.appendChild(slipDoc(e)));
}
function slipDoc(e){
  const en = LANG==='en';
  const T = {
    title: en?'Pay Slip':'สลิปเงินเดือน / Pay Slip',
    period: en?'Period':'ประจำงวด', cycle: en?'Cycle':'รอบวันที่',
    code: en?'Employee ID':'รหัสพนักงาน', name: en?'Name':'ชื่อ-นามสกุล',
    position: en?'Position':'ตำแหน่ง', dept: en?'Department':'แผนก',
    earnHead: en?'Earnings':'รายการเงินได้', dedHead: en?'Deductions':'รายการเงินหัก',
    amount: en?'Amount (THB)':'จำนวน (บาท)', totalEarn: en?'Total Earnings':'รวมเงินได้',
    totalDed: en?'Total Deductions':'รวมเงินหัก', net: en?'Net Pay':'เงินได้สุทธิ (Net Pay)',
    salary: en?'Salary':'เงินเดือน', payer: en?'Payer':'ผู้จ่ายเงิน', payee: en?'Received by':'ผู้รับเงิน',
    monthName: en?'month':'เดือน', days: en?'days':'วัน', prorated: en?'prorated':'ตามสัดส่วน',
  };
  const c=calc(e,PERIOD); const r=c.r;
  const pr=prorate(e,PERIOD);
  const baseLabel = e.payType==='daily'
    ? (en?`Daily wage (${num(r.days||0)} ${T.days} × ${money(e.salary)})`:`ค่าจ้างรายวัน (${num(r.days||0)} วัน × ${money(e.salary)})`)
    : (pr.partial && pr.factor>0 ? `${T.salary} (${T.prorated} ${pr.worked}/${pr.dim} ${T.days})` : T.salary);
  const earnList=[[baseLabel,c.base],...EARN_FIELDS.map(f=>[FL(f),r.earn[f[0]]])].filter(x=>+x[1]);
  const dedList=DED_FIELDS.map(f=>[FL(f),r.ded[f[0]]]).filter(x=>+x[1]);
  const n=Math.max(earnList.length,dedList.length);
  let rows='';
  for(let i=0;i<n;i++){
    rows+=`<tr>
      <td>${earnList[i]?earnList[i][0]:''}</td><td style="text-align:right">${earnList[i]?money(earnList[i][1]):''}</td>
      <td>${dedList[i]?dedList[i][0]:''}</td><td style="text-align:right">${dedList[i]?money(dedList[i][1]):''}</td></tr>`;
  }
  const rg=periodRange(PERIOD);
  return el(`<div class="doc">
    <div class="company"><div class="cn">${esc(DB.company.name)}</div><div>${esc(DB.company.address)}</div></div>
    <h2 class="dt">${T.title}</h2>
    <div style="text-align:center;margin-bottom:14px">${T.period} ${periodLabel(PERIOD)}<br><span style="font-size:13px">${T.cycle} ${fmtD(rg.from)} – ${fmtD(rg.to)}</span></div>
    <div class="row2" style="margin-bottom:10px">
      <div><strong>${T.code}:</strong> ${esc(e.code)}<br><strong>${T.name}:</strong> ${esc(e.name)}</div>
      <div style="text-align:right"><strong>${T.position}:</strong> ${esc(e.position||'-')}<br><strong>${T.dept}:</strong> ${esc(e.dept||'-')}</div>
    </div>
    <table class="dtbl">
      <thead><tr><th>${T.earnHead}</th><th style="text-align:right">${T.amount}</th><th>${T.dedHead}</th><th style="text-align:right">${T.amount}</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot>
        <tr><th>${T.totalEarn}</th><th style="text-align:right">${money(c.gross)}</th><th>${T.totalDed}</th><th style="text-align:right">${money(c.dedTotal)}</th></tr>
        <tr><th colspan="3" style="text-align:right;font-size:15px">${T.net}</th><th style="text-align:right;font-size:15px">${money(c.net)}</th></tr>
      </tfoot>
    </table>
    ${en?'':`<div style="margin-top:6px;font-size:12px">(${bahtText(c.net)})</div>`}
    <div class="sign">
      <div><div class="line"></div>${T.payer}</div>
      <div><div class="line"></div>${T.payee} (${esc(e.name)})</div>
    </div>
  </div>`);
}

/* ============ 7. WHT 50 ทวิ ============ */
let whtEmpId=null, whtYear=null;
function vWHT(v){
  if(DB.employees.length===0){ v.appendChild(el(`<div class="panel"><div class="pbody empty">ยังไม่มีพนักงาน</div></div>`)); return; }
  if(!whtEmpId||(whtEmpId!=='ALL'&&!DB.employees.find(e=>e.id===whtEmpId))) whtEmpId=DB.employees[0].id;
  if(!whtYear) whtYear=+PERIOD.split('-')[0];
  v.appendChild(el(`<div class="toolbar no-print">
    <div class="field" style="min-width:260px"><label>พนักงาน</label>
      <select id="whtSel"><option value="ALL" ${whtEmpId==='ALL'?'selected':''}>— ทุกคน —</option>${DB.employees.map(e=>`<option value="${e.id}" ${e.id===whtEmpId?'selected':''}>${esc(e.code)} — ${esc(e.name)}</option>`).join('')}</select></div>
    <div class="field"><label>ปี (พ.ศ.)</label><input id="whtYear" type="number" value="${whtYear+543}" style="width:120px"></div>
    <button class="btn" style="margin-top:22px" onclick="window.print()">🖨️ พิมพ์</button>
  </div>`));
  $('#whtSel').onchange=(e)=>{ whtEmpId=e.target.value; render(); };
  $('#whtYear').onchange=(e)=>{ whtYear=(+e.target.value)-543; render(); };
  const area=el(`<div class="print-area"></div>`); v.appendChild(area);
  const list = whtEmpId==='ALL' ? DB.employees : DB.employees.filter(x=>x.id===whtEmpId);
  list.forEach(e=>area.appendChild(el(wht50Doc(e, yearAgg(e,whtYear), whtYear))));
}
// ช่องเลขประจำตัวผู้เสียภาษี 13 หลัก
function tid13(id){ id=String(id||'').replace(/\D/g,'').slice(0,13); let s='<span style="display:inline-flex;gap:1px;vertical-align:middle">';
  for(let i=0;i<13;i++){ s+=`<span style="display:inline-block;width:13px;height:16px;border:1px solid #444;text-align:center;font-size:11px;line-height:16px">${id[i]||'&nbsp;'}</span>`; } return s+'</span>'; }
// checkbox เล็ก (on=ติ๊ก)
function ck(on){ return `<span style="display:inline-block;width:11px;height:11px;border:1px solid #333;text-align:center;line-height:10px;font-size:10px;vertical-align:middle">${on?'✓':''}</span>`; }
function wht50Doc(e, agg, year){
  const C=DB.company;
  const blank='<span style="border-bottom:1px dotted #555;display:inline-block;min-width:60px">&nbsp;</span>';
  const empty=(n)=>Array.from({length:n}).map(()=>'<td></td>').join('');
  const wr=(label)=>`<tr><td>${label}</td><td></td><td></td><td></td></tr>`;  // แถวประเภทเงินได้ (ว่าง)
  return `<div class="doc a4" style="font-size:12px;line-height:1.4">
    <div style="font-size:10.5px">ฉบับที่ 1 (สำหรับผู้ถูกหักภาษี ณ ที่จ่าย ใช้แนบพร้อมกับแบบแสดงรายการภาษี)<br>ฉบับที่ 2 (สำหรับผู้ถูกหักภาษี ณ ที่จ่าย เก็บไว้เป็นหลักฐาน)</div>
    <h2 class="dt" style="margin-top:2px">หนังสือรับรองการหักภาษี ณ ที่จ่าย</h2>
    <div style="text-align:center">ตามมาตรา 50 ทวิ แห่งประมวลรัษฎากร</div>
    <div style="text-align:right;font-size:11px">เล่มที่ ............... &nbsp;&nbsp; เลขที่ ...............</div>

    <div style="border:1px solid #333;padding:6px 9px;margin-top:5px">
      <div style="display:flex;justify-content:space-between;gap:10px"><strong>ผู้มีหน้าที่หักภาษี ณ ที่จ่าย :–</strong><span>เลขประจำตัวผู้เสียภาษีอากร (13 หลัก)* ${tid13(C.taxId)}</span></div>
      <div style="margin-top:3px">ชื่อ <strong>${esc(C.name)}</strong></div>
      <div>ที่อยู่ ${esc(C.address||'')}</div>
    </div>

    <div style="border:1px solid #333;padding:6px 9px;margin-top:4px">
      <div style="display:flex;justify-content:space-between;gap:10px"><strong>ผู้ถูกหักภาษี ณ ที่จ่าย :–</strong><span>เลขประจำตัวผู้เสียภาษีอากร (13 หลัก)* ${tid13(e.taxId)}</span></div>
      <div style="margin-top:3px">ชื่อ <strong>${esc(e.name)}</strong></div>
      <div>ที่อยู่ ${esc(e.address||'')}</div>
    </div>

    <div style="border:1px solid #333;padding:6px 9px;margin-top:4px;font-size:11.5px">
      ลำดับที่ <span style="border:1px solid #333;padding:0 14px">&nbsp;</span> ในแบบ &nbsp;&nbsp;
      ${ck(1)} (1) ภ.ง.ด.1ก &nbsp; ${ck()} (2) ภ.ง.ด.1ก พิเศษ &nbsp; ${ck()} (3) ภ.ง.ด.2 &nbsp; ${ck()} (4) ภ.ง.ด.3<br>
      <span style="padding-left:70px"></span>${ck()} (5) ภ.ง.ด.2ก &nbsp; ${ck()} (6) ภ.ง.ด.3ก &nbsp; ${ck()} (7) ภ.ง.ด.53
    </div>

    <table class="dtbl" style="margin-top:4px;font-size:10.5px;line-height:1.3">
      <thead><tr>
        <th style="width:56%">ประเภทเงินได้พึงประเมินที่จ่าย</th>
        <th style="width:15%">วัน เดือน<br>หรือปีภาษี ที่จ่าย</th>
        <th style="width:15%">จำนวนเงินที่จ่าย</th>
        <th style="width:14%">ภาษีที่หัก<br>และนำส่งไว้</th>
      </tr></thead>
      <tbody>
        <tr><td>1. เงินเดือน ค่าจ้าง เบี้ยเลี้ยง โบนัส ฯลฯ ตามมาตรา 40 (1)</td><td style="text-align:center">ปีภาษี ${year+543}</td><td style="text-align:right">${money(agg.income)}</td><td style="text-align:right">${money(agg.tax)}</td></tr>
        ${wr('2. ค่าธรรมเนียม ค่านายหน้า ฯลฯ ตามมาตรา 40 (2)')}
        ${wr('3. ค่าแห่งลิขสิทธิ์ ฯลฯ ตามมาตรา 40 (3)')}
        ${wr('4. (ก) ดอกเบี้ย ฯลฯ ตามมาตรา 40 (4) (ก)')}
        ${wr('&nbsp;&nbsp;&nbsp;(ข) เงินปันผล เงินส่วนแบ่งกำไร ฯลฯ ตามมาตรา 40 (4) (ข)')}
        ${wr('&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;(1) กรณีผู้ได้รับเงินปันผลได้รับเครดิตภาษี โดยจ่ายจากกำไรสุทธิ')}
        ${wr('&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;ของกิจการที่ต้องเสียภาษีเงินได้นิติบุคคลในอัตราดังนี้')}
        ${wr('&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;(1.1) อัตราร้อยละ 30 ของกำไรสุทธิ')}
        ${wr('&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;(1.2) อัตราร้อยละ 25 ของกำไรสุทธิ')}
        ${wr('&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;(1.3) อัตราร้อยละ 20 ของกำไรสุทธิ')}
        ${wr('&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;(1.4) อัตราอื่น ๆ (ระบุ) ........ ของกำไรสุทธิ')}
        ${wr('&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;(2) กรณีผู้ได้รับเงินปันผลไม่ได้รับเครดิตภาษี เนื่องจากจ่ายจาก')}
        ${wr('&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;(2.1) กำไรสุทธิของกิจการที่ได้รับยกเว้นภาษีเงินได้นิติบุคคล')}
        ${wr('&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;(2.2) เงินปันผลหรือเงินส่วนแบ่งของกำไรที่ได้รับยกเว้นไม่ต้องนำมารวมคำนวณฯ')}
        ${wr('&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;(2.3) กำไรสุทธิส่วนที่ได้หักผลขาดทุนสุทธิยกมาไม่เกิน 5 ปีฯ')}
        ${wr('&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;(2.4) กำไรที่รับรู้ทางบัญชีโดยวิธีส่วนได้เสีย (equity method)')}
        ${wr('&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;(2.5) อื่น ๆ (ระบุ) ........................')}
        ${wr('5. การจ่ายเงินได้ที่ต้องหักภาษี ณ ที่จ่าย ตามคำสั่งกรมสรรพากรที่ออกตามมาตรา 3 เตรส')}
        ${wr('&nbsp;&nbsp;&nbsp;เช่น รางวัล ส่วนลดหรือประโยชน์ใด ๆ เนื่องจากการส่งเสริมการขาย ค่าจ้างทำของ ค่าโฆษณา ฯลฯ')}
        ${wr('6. อื่น ๆ (ระบุ) ....................................')}
        <tr><td style="text-align:right"><strong>รวมเงินที่จ่ายและภาษีที่หักนำส่ง</strong></td><td></td><td style="text-align:right"><strong>${money(agg.income)}</strong></td><td style="text-align:right"><strong>${money(agg.tax)}</strong></td></tr>
        <tr><td colspan="4">รวมเงินภาษีที่หักนำส่ง (ตัวอักษร) &nbsp; <strong>( ${bahtText(agg.tax)} )</strong></td></tr>
      </tbody>
    </table>

    <div style="border:1px solid #333;padding:6px 9px;margin-top:4px;font-size:11.5px">
      เงินที่จ่ายเข้า กบข./กสจ./กองทุนสงเคราะห์ครูโรงเรียนเอกชน ${blank} บาท &nbsp;
      กองทุนประกันสังคม <strong>${money(agg.sso)}</strong> บาท &nbsp;
      กองทุนสำรองเลี้ยงชีพ <strong>${money(agg.pvd)}</strong> บาท
    </div>

    <div style="border:1px solid #333;padding:6px 9px;margin-top:4px;font-size:11.5px">
      <strong>ผู้จ่ายเงิน</strong> &nbsp; ${ck(1)} (1) หัก ณ ที่จ่าย &nbsp; ${ck()} (2) ออกให้ตลอดไป &nbsp; ${ck()} (3) ออกให้ครั้งเดียว &nbsp; ${ck()} (4) อื่น ๆ (ระบุ) ..............
    </div>

    <div style="display:flex;gap:5px;margin-top:4px">
      <div style="flex:1;border:1px solid #333;padding:6px 9px;font-size:10.5px"><strong>คำเตือน</strong> ผู้มีหน้าที่ออกหนังสือรับรองการหักภาษี ณ ที่จ่าย ฝ่าฝืนไม่ปฏิบัติตามมาตรา 50 ทวิ แห่งประมวลรัษฎากร ต้องรับโทษทางอาญาตามมาตรา 35 แห่งประมวลรัษฎากร</div>
      <div style="flex:1;border:1px solid #333;padding:6px 9px;text-align:center;font-size:11.5px">ขอรับรองว่าข้อความและตัวเลขดังกล่าวข้างต้นถูกต้องตรงกับความจริงทุกประการ<br><br>
        ลงชื่อ ...................................... ผู้จ่ายเงิน<br>( ${esc(C.signer)} )<br><br>
        ......./......./....... วัน เดือน ปี ที่ออกหนังสือรับรองฯ</div>
    </div>
  </div>`;
}
function yearAgg(e, year){
  let income=0, tax=0, sso=0, pvd=0;
  for(let m=1;m<=12;m++){ const p=`${year}-${String(m).padStart(2,'0')}`; if(!DB.payroll[p]||!DB.payroll[p][e.id]) continue;
    const c=calc(e,p); income+=c.gross; tax+=+c.r.ded.tax||0; sso+=+c.r.ded.sso||0; pvd+=+c.r.ded.pvd||0; }
  return {income,tax,sso,pvd};
}

/* ============ 8. PND1 ============ */
function pndPayDate(p){   // วันที่จ่ายของงวด (แก้เองได้ ค่าเริ่มต้น=สิ้นเดือน)
  if(DB.payDates && DB.payDates[p]) return DB.payDates[p];
  const [y,m]=p.split('-').map(Number);
  return `${y}-${String(m).padStart(2,'0')}-${String(daysInMonth(y,m)).padStart(2,'0')}`;
}
function vPND1(v){
  const tb=el(`<div class="toolbar no-print"><h2 style="font-size:16px">แบบ ภ.ง.ด.1 — ${periodLabel(PERIOD)}</h2>
    <div class="field" style="margin-left:auto"><label>วันที่จ่ายเงิน</label><input type="date" id="pndDate" value="${pndPayDate(PERIOD)}"></div>
    <button class="btn ghost sm" style="margin-top:22px" id="pnd1csv">⬇️ CSV</button>
    <button class="btn" style="margin-top:22px" onclick="window.print()">🖨️ พิมพ์</button></div>`);
  v.appendChild(tb);
  tb.querySelector('#pndDate').onchange=(e)=>{ DB.payDates=DB.payDates||{}; DB.payDates[PERIOD]=e.target.value; save(); render(); };
  const payD=fmtDate(pndPayDate(PERIOD));
  let totIncome=0, totTax=0;
  const rows=DB.employees.map((e,i)=>{ const c=calc(e,PERIOD); totIncome+=c.gross; totTax+=+c.r.ded.tax||0;
    return `<tr><td style="text-align:center">${i+1}</td><td>${esc(e.taxId||'-')}</td><td>${esc(e.name)}</td>
      <td style="text-align:center">${payD}</td>
      <td style="text-align:right">${money(c.gross)}</td><td style="text-align:right">${money(c.r.ded.tax)}</td></tr>`;
  }).join('');
  const area=el(`<div class="print-area"></div>`); v.appendChild(area);
  area.appendChild(el(`<div class="doc">
    <div class="row2"><div><strong>แบบยื่นรายการภาษีเงินได้หัก ณ ที่จ่าย</strong><br>ตามมาตรา 59 (ภ.ง.ด.1)</div>
      <div style="text-align:right">ประจำเดือน ${THAI_MONTHS[+PERIOD.split('-')[1]-1]} พ.ศ. ${(+PERIOD.split('-')[0])+543}</div></div>
    <table class="dtbl" style="margin-top:8px">
      <tr><td><strong>ผู้มีหน้าที่หักภาษี:</strong> ${esc(DB.company.name)}</td><td><strong>เลขประจำตัวผู้เสียภาษี:</strong> ${esc(DB.company.taxId)}</td></tr>
    </table>
    <table class="dtbl" style="margin-top:8px">
      <thead><tr><th>ลำดับ</th><th>เลขประจำตัวผู้เสียภาษี</th><th>ชื่อผู้มีเงินได้</th><th>วันเดือนปีที่จ่าย</th><th style="text-align:right">จำนวนเงินได้</th><th style="text-align:right">ภาษีหัก ณ ที่จ่าย</th></tr></thead>
      <tbody>${rows||'<tr><td colspan="6" style="text-align:center">ไม่มีข้อมูล</td></tr>'}</tbody>
      <tfoot><tr><th colspan="4" style="text-align:right">รวมทั้งสิ้น</th><th style="text-align:right">${money(totIncome)}</th><th style="text-align:right">${money(totTax)}</th></tr></tfoot>
    </table>
    <div style="margin-top:8px">จำนวนผู้มีเงินได้ ${num(DB.employees.length)} ราย · รวมภาษีที่นำส่ง ${money(totTax)} บาท (${bahtText(totTax)})</div>
    <div class="sign"><div><div class="line"></div>ผู้จ่ายเงิน / ผู้มีหน้าที่หักภาษี ณ ที่จ่าย<br>(${esc(DB.company.signer)})</div></div>
  </div>`));
  $('#pnd1csv').onclick=()=>{
    const lines=['ลำดับ,เลขประจำตัวผู้เสียภาษี,ชื่อ,เงินได้,ภาษีหัก'];
    DB.employees.forEach((e,i)=>{ const c=calc(e,PERIOD); lines.push(`${i+1},${e.taxId||''},"${e.name}",${c.gross},${c.r.ded.tax||0}`); });
    downloadFile(`pnd1_${PERIOD}.csv`, '﻿'+lines.join('\n'),'text/csv'); toast('ส่งออกแล้ว');
  };
}

