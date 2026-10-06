/* app.html · คำนวณเงินได้/เงินหัก — ลำดับไฟล์มีผล (โหลดตามเลข) */
/* ============ 2. PAYROLL (earnings/deductions per employee) ============ */
let payrollEmpId=null, payrollFilter='all';
/* ═══════════ เบิกจ่ายล่วงหน้า ═══════════
   บริษัทที่จ่ายเดือนละ 2 รอบ : รอบกลางเดือนจ่ายล่วงหน้า แล้วหักคืนตอนสิ้นเดือน
   ยอดเบิกเก็บเป็นรายการหัก 'advance' ของงวดนั้น ภาษี/ประกันสังคมจึงยังคิดเป็นรายเดือนถูกต้องเหมือนเดิม */
/* เปอร์เซ็นต์ที่ใช้เติมยอดเบิกกลางเดือนให้ทุกคน — ตั้งได้ต่อบริษัท ไม่ตั้งใช้ 40%
   จำกัด 1–100 เพราะเบิกเกินค่าจ้างของงวดไม่มีเงินเหลือให้หักคืนตอนสิ้นเดือน */
function advPct(){
  const v=+(DB.advPct||0);
  return v>0 ? Math.min(100, v) : 40;
}
function setAdvPct(v){
  const n=Math.round(+v||0);
  if(!(n>0)) return false;
  DB.advPct=Math.min(100, n);
  return true;
}
function advPayDate(){
  const {from,to}=periodRange(PERIOD);
  const mid=new Date(from.getTime()+Math.floor((to-from)/2));
  return isoOf(mid);
}
function advOf(emp){ return Number(readRec(PERIOD, emp.id).ded.advance||0); }
function advSet(emp, val){
  const r=getRec(PERIOD, emp.id);
  r.manual=r.manual||{}; r.manual.advance=1;          // เป็นตัวเลขที่คนกรอก ไม่ให้ระบบเขียนทับ
  r.ded.advance=Math.max(0, Math.round(Number(val||0)*100)/100);
  save();
}
function vAdvance(v){
  const [py,pm]=PERIOD.split('-').map(Number);
  const list=DB.employees.filter(e=>activeInMonth(e,py,pm));
  if(!list.length){ v.appendChild(el(`<div class="panel"><div class="pbody empty">ไม่มีพนักงานในงวด ${periodLabel(PERIOD)}</div></div>`)); return; }

  const pct = advPct();
  const rows=list.map(e=>{
    const c0=calc(e,PERIOD);
    const adv=advOf(e);
    const suggest=Math.round(basePay(e, c0.r, PERIOD)*pct/100);
    return {e, base:basePay(e,c0.r,PERIOD), net:c0.net, adv, suggest};
  });
  const totalAdv=rows.reduce((s,x)=>s+x.adv,0);
  const picked=rows.filter(x=>x.adv>0).length;

  const panel=el(`<div class="panel">
    <div class="phead"><h2>💸 เบิกจ่ายล่วงหน้า — ${periodLabel(PERIOD)}</h2>
      <div class="sp" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <span class="muted" style="font-size:12px">จ่ายวันที่ ${esc(fmtDate(advPayDate()))}</span>
        <span style="display:inline-flex;align-items:center;gap:6px;border:1px solid var(--line);
              border-radius:8px;padding:3px 4px 3px 9px;background:var(--card,#fff)">
          <label for="advPct" class="muted" style="font-size:12px">เติมที่</label>
          <input type="number" id="advPct" min="1" max="100" step="1" value="${pct}"
                 style="width:56px;text-align:right;padding:4px 6px;font-weight:700" title="เปอร์เซ็นต์ของค่าจ้างฐาน (1–100)">
          <span class="muted" style="font-size:12px;padding-right:4px">%</span>
        </span>
        <button class="btn ghost sm" id="advFill">⚡ เติมให้ทุกคน</button>
        <button class="btn ghost sm" id="advClear">ล้างทั้งหมด</button>
        <button class="btn ghost sm" id="advCsv">⬇️ ส่งออก CSV</button>
        <button class="btn sm" id="advSheet">🖨️ ใบสรุปยอดโอน</button>
      </div></div>
    <div class="pbody" style="padding:0">
      <div style="padding:12px 16px;background:#fff7ed;border-bottom:1px solid #fed7aa;font-size:13px;color:#9a3412">
        กรอกยอดที่จ่ายกลางเดือนของแต่ละคน ระบบจะ<strong>หักคืนอัตโนมัติ</strong>ในช่อง “เบิกจ่ายล่วงหน้า” ของหน้าคำนวณเงินได้ตอนสิ้นเดือน
        · ภาษีและประกันสังคมยังคิดเป็นรายเดือนตามกฎหมายเหมือนเดิม
      </div>
      <div class="tbl-wrap" id="advTbl"></div>
    </div></div>`);
  v.appendChild(panel);

  const draw=()=>{
    const tr2=rows.map(x=>{
      const daily=x.e.payType==='daily';
      return `<tr>
        <td><span class="chip">${esc(x.e.code)}</span></td>
        <td><strong>${esc(x.e.name)}</strong><div class="muted" style="font-size:11px">${esc(x.e.dept||'-')}</div></td>
        <td>${daily?'<span class="chip" style="background:#fef3c7;color:#b45309">รายวัน</span>':'<span class="chip" style="background:#d8f3e6;color:#092942">รายเดือน</span>'}</td>
        <td class="num">${money(x.base)}</td>
        <td class="num"><input type="number" step="0.01" min="0" class="advIn" data-id="${x.e.id}" value="${x.adv||''}"
              placeholder="${x.suggest}" style="width:118px;text-align:right"></td>
        <td class="num muted" style="font-size:12px">${money(Math.max(0,x.net))}</td>
        <td>${x.e.bank?esc(x.e.bank)+' '+esc(x.e.bankNo||''):'<span class="muted">ยังไม่มีเลขบัญชี</span>'}</td>
      </tr>`;
    }).join('');
    const box=panel.querySelector('#advTbl');
    box.innerHTML='';
    box.appendChild(el(`<table>
      <thead><tr><th>รหัส</th><th>ชื่อ</th><th>ประเภท</th><th class="num">ค่าจ้างฐาน</th>
        <th class="num">ยอดเบิกกลางเดือน</th><th class="num">คงเหลือปลายเดือน</th><th>บัญชีรับโอน</th></tr></thead>
      <tbody>${tr2}</tbody>
      <tfoot><tr><td colspan="4"><strong>รวม ${picked} คน</strong></td>
        <td class="num"><strong>${money(totalAdv)}</strong></td><td colspan="2"></td></tr></tfoot>
    </table>`));
    box.querySelectorAll('.advIn').forEach(inp=>{
      inp.onchange=()=>{
        const e=DB.employees.find(x=>x.id===inp.dataset.id);
        advSet(e, inp.value);
        render();
      };
    });
  };
  draw();

  const pctIn=panel.querySelector('#advPct');
  pctIn.onchange=()=>{
    if(!setAdvPct(pctIn.value)){ pctIn.value=pct; toast('เปอร์เซ็นต์ต้องอยู่ระหว่าง 1–100'); return; }
    save(); render(); toast(`ตั้งเป็น ${advPct()}% แล้ว — ตัวเลขที่แนะนำในตารางอัปเดตให้แล้ว`);
  };
  panel.querySelector('#advFill').onclick=()=>{
    rows.forEach(x=>advSet(x.e, x.suggest));
    render(); toast(`เติมยอดเบิก ${pct}% ให้ ${rows.length} คนแล้ว`);
  };
  panel.querySelector('#advClear').onclick=()=>{
    rows.forEach(x=>advSet(x.e, 0));
    render(); toast('ล้างยอดเบิกแล้ว');
  };
  panel.querySelector('#advCsv').onclick=()=>{
    const head=['รหัส','ชื่อ','แผนก','ธนาคาร','เลขที่บัญชี','ยอดโอนกลางเดือน'];
    const lines=[head.map(csvEsc).join(',')];
    rows.filter(x=>x.adv>0).forEach(x=>lines.push([x.e.code,x.e.name,x.e.dept||'',x.e.bank||'',x.e.bankNo||'',x.adv].map(csvEsc).join(',')));
    if(lines.length===1){ toast('ยังไม่มีคนที่มียอดเบิก'); return; }
    downloadFile(`advance_${PERIOD}.csv`, '\ufeff'+lines.join('\r\n'), 'text/csv;charset=utf-8');
    toast('ส่งออกแล้ว');
  };
  panel.querySelector('#advSheet').onclick=()=>advSheet(rows);
}
/* ใบสรุปยอดโอน — เปิดหน้าต่างใหม่สำหรับพิมพ์/ส่งธนาคาร */
function advSheet(rows){
  const use=rows.filter(x=>x.adv>0);
  if(!use.length){ toast('ยังไม่มีคนที่มียอดเบิก'); return; }
  const total=use.reduce((s,x)=>s+x.adv,0);
  const co=(DB.company&&DB.company.name)||DB.companyName||'';
  const w=window.open('','_blank');
  if(!w){ toast('เบราว์เซอร์บล็อกป๊อปอัป กรุณาอนุญาตแล้วลองอีกครั้ง'); return; }
  w.document.write(`<!doctype html><html lang="th"><head><meta charset="utf-8">
    <title>ใบสรุปยอดโอน ${periodLabel(PERIOD)}</title>
    <style>
      body{font-family:"Sarabun","Segoe UI",Tahoma,sans-serif;padding:26px;color:#0b1b2b}
      h1{font-size:19px;margin:0 0 4px}.sub{color:#5b7186;font-size:13px;margin-bottom:16px}
      table{width:100%;border-collapse:collapse;font-size:13px}
      th,td{border:1px solid #cbd5e1;padding:7px 9px;text-align:left}
      th{background:#0e3a5c;color:#fff}
      td.num,th.num{text-align:right;font-variant-numeric:tabular-nums}
      tfoot td{font-weight:800;background:#f1f5f9}
      .sign{margin-top:34px;display:flex;gap:60px;font-size:13px}
      .sign div{flex:1;border-top:1px solid #94a3b8;padding-top:6px;text-align:center;color:#5b7186}
      @media print{@page{size:A4;margin:14mm}}
    </style></head><body>
    <h1>ใบสรุปยอดโอนเงินเบิกจ่ายล่วงหน้า${co?' — '+co:''}</h1>
    <div class="sub">งวด ${periodLabel(PERIOD)} · จ่ายวันที่ ${fmtDate(advPayDate())} · จำนวน ${use.length} คน</div>
    <table><thead><tr><th>ลำดับ</th><th>รหัส</th><th>ชื่อ-นามสกุล</th><th>ธนาคาร</th><th>เลขที่บัญชี</th><th class="num">ยอดโอน (บาท)</th></tr></thead>
    <tbody>${use.map((x,i)=>`<tr><td>${i+1}</td><td>${x.e.code}</td><td>${x.e.name}</td>
      <td>${x.e.bank||'-'}</td><td>${x.e.bankNo||'-'}</td><td class="num">${money(x.adv)}</td></tr>`).join('')}</tbody>
    <tfoot><tr><td colspan="5">รวมทั้งสิ้น</td><td class="num">${money(total)}</td></tr></tfoot></table>
    <div class="sign"><div>ผู้จัดทำ</div><div>ผู้ตรวจสอบ</div><div>ผู้อนุมัติ</div></div>
    <script>window.onload=function(){window.print()}<\/script>
    </body></html>`);
  w.document.close();
}
function vPayroll(v){
  if(DB.employees.length===0){ v.appendChild(el(`<div class="panel"><div class="pbody empty">ยังไม่มีพนักงาน</div></div>`)); return; }
  // เฉพาะพนักงานที่ยังทำงานในงวดนี้ (คนลาออกแล้วไม่แสดง) + กรองตามประเภทการจ้าง
  const [py,pm]=PERIOD.split('-').map(Number);
  const active=DB.employees.filter(e=>activeInMonth(e,py,pm));
  const list=active.filter(e=> payrollFilter==='all' || (e.payType||'monthly')===payrollFilter);
  const mCount=active.filter(e=>(e.payType||'monthly')==='monthly').length, dCount=active.filter(e=>e.payType==='daily').length;

  // ปุ่มสลับ ทั้งหมด / รายเดือน / รายวัน
  const seg=el(`<div class="toolbar" style="margin-bottom:6px">
    <div class="seg" style="display:inline-flex;background:#eaf6f1;border-radius:10px;padding:3px">
      <button class="segbtn ${payrollFilter==='all'?'on':''}" data-f="all">ทั้งหมด (${active.length})</button>
      <button class="segbtn ${payrollFilter==='monthly'?'on':''}" data-f="monthly">📅 รายเดือน (${mCount})</button>
      <button class="segbtn ${payrollFilter==='daily'?'on':''}" data-f="daily">🗓️ รายวัน (${dCount})</button>
    </div>
  </div>`);
  v.appendChild(seg);
  seg.querySelectorAll('.segbtn').forEach(b=>b.onclick=()=>{ payrollFilter=b.dataset.f; payrollEmpId=null; render(); });

  if(list.length===0){ v.appendChild(el(`<div class="panel"><div class="pbody empty">ไม่มีพนักงาน${payrollFilter==='daily'?'รายวัน':payrollFilter==='monthly'?'รายเดือน':''}ในงวด ${periodLabel(PERIOD)}</div></div>`)); return; }
  if(payrollEmpId!=='ALL' && (!payrollEmpId || !list.find(e=>e.id===payrollEmpId))) payrollEmpId=list[0].id;
  const isAll = payrollEmpId==='ALL';

  const tb=el(`<div class="toolbar">
    <div class="field" style="min-width:280px"><label>เลือกพนักงาน</label>
      <select id="peSel"><option value="ALL" ${isAll?'selected':''}>— ทั้งหมด (${list.length} คน) —</option>${list.map(e=>`<option value="${e.id}" ${e.id===payrollEmpId?'selected':''}>${esc(e.code)} — ${esc(e.name)}${e.payType==='daily'?' (รายวัน)':''}</option>`).join('')}</select>
    </div>
    ${isAll?'':`<button class="btn ghost sm" id="autoTax" style="margin-top:22px">🔍 ดูวิธีคำนวณภาษี</button>`}
    <button class="btn ghost sm" id="peCsv" style="margin-top:22px">⬇️ ส่งออก CSV</button>
    <button class="btn ghost sm" id="peCsvIn" style="margin-top:22px">⬆️ นำเข้า CSV</button>
    <input type="file" id="peCsvFile" accept=".csv,text/csv" style="display:none">
    <span style="flex:1"></span>
    ${periodHasData(PERIOD)?`<button class="btn danger sm" id="peClear" style="margin-top:22px">🗑️ ล้างข้อมูลงวดนี้</button>`:''}
  </div>`);
  v.appendChild(tb);
  { const b=tb.querySelector('#peClear'); if(b) b.onclick=()=>clearPeriodModal(PERIOD); }
  tb.querySelector('#peSel').onchange=(e)=>{ payrollEmpId=e.target.value; render(); };
  tb.querySelector('#peCsv').onclick=()=>exportPayrollCSV(list);
  tb.querySelector('#peCsvIn').onclick=()=>tb.querySelector('#peCsvFile').click();
  tb.querySelector('#peCsvFile').onchange=(ev)=>{
    const f=ev.target.files&&ev.target.files[0]; if(!f) return;
    const rd=new FileReader();
    rd.onload=()=>{ importPayrollCSV(decodeTextBytes(rd.result), list); ev.target.value=''; };
    rd.readAsArrayBuffer(f);
  };
  if(isAll){ vPayrollAll(v, list); return; }

  const emp=DB.employees.find(e=>e.id===payrollEmpId);
  const r=getRec(PERIOD, emp.id);
  // คำนวณประกันสังคม/กสล. อัตโนมัติ (ไม่ต้องกดปุ่ม)
  autoDeductions(emp, r);
  const c=calc(emp,PERIOD);
  const isDaily = emp.payType==='daily';
  tb.querySelector('#autoTax').onclick=()=>taxModal(emp,r);

  // พนักงานรายวัน: กล่องกรอกจำนวนวันทำงาน → ค่าจ้างฐาน
  const dayBlock = isDaily ? `<div class="field" style="grid-column:1/-1;background:#fffbeb;border:1px solid #fcd34d;border-radius:10px;padding:12px 14px;margin-bottom:14px">
    <label style="font-weight:700;color:#b45309">ค่าจ้างรายวัน — ค่าจ้าง/วัน × จำนวนวันทำงาน</label>
    <div class="grid3" style="margin-top:8px">
      <div class="field"><label>ค่าจ้าง/วัน</label><input value="${money(emp.salary)}" readonly style="background:#fef3c7;font-weight:600"></div>
      <div class="field"><label>จำนวนวันทำงาน</label><input type="number" step="0.5" id="workDays" value="${r.days||0}"></div>
      <div class="field"><label>ค่าจ้างฐาน (บาท)</label><input id="baseShow" value="${money(basePay(emp,r))}" readonly style="background:#eaf6f1;font-weight:700"></div>
    </div></div>` : '';

  // พนักงานรายเดือนที่เข้างานกลางเดือน: คิดเงินเดือนตามสัดส่วน
  const pr = prorate(emp, PERIOD);
  const prorateBlock = (!isDaily && pr.partial) ? `<div class="field" style="grid-column:1/-1;background:#fffbeb;border:1px solid #fcd34d;border-radius:10px;padding:12px 14px;margin-bottom:14px">
    <label style="font-weight:700;color:#b45309">📅 เข้างานกลางเดือน — คิดเงินเดือนตามสัดส่วน (Prorate)</label>
    ${pr.factor>0
      ? `<div style="margin-top:6px;line-height:1.7">เริ่มงาน ${fmtDate(emp.startDate)} · งวด ${fmtD(pr.from)} – ${fmtD(pr.to)}<br>ทำงาน <strong>${pr.worked}</strong> วัน จาก ${pr.dim} วันในงวดนี้<br>
         เงินเดือน ${money(emp.salary)} × ${pr.worked}/${pr.dim} = <strong style="color:var(--brand-d);font-size:16px">${money(basePay(emp,r,PERIOD))}</strong> บาท</div>`
      : `<div style="margin-top:6px">พนักงานเริ่มงาน ${fmtDate(emp.startDate)} ซึ่งยังไม่ถึงงวดนี้ จึงยังไม่มีเงินเดือนในงวด ${periodLabel(PERIOD)}</div>`}
  </div>` : '';

  const earnRows=EARN_FIELDS.filter(([k])=>k!=='ot').map(([k,l])=>`<div class="field"><label>${l}</label><input type="number" step="0.01" data-earn="${k}" value="${r.earn[k]||0}"></div>`).join('');
  const rate=otRate(emp);
  const otRateLabel = isDaily ? `${money(emp.salary)}÷${DB.otHours||8}` : `${money(emp.salary)}÷${DB.otDays||30}÷${DB.otHours||8}`;
  const otBlock=`<div class="field" style="grid-column:1/-1;background:#f6faf8;border:1px solid var(--line);border-radius:10px;padding:12px 14px;margin-bottom:14px">
    <label style="font-weight:700;color:var(--brand-d)">ค่าล่วงเวลา (OT) — คำนวณรายชั่วโมง</label>
    <div class="muted" style="font-size:12px;margin-top:2px">อัตรา/ชม. ${otRateLabel} = ${money(rate)} บาท · เพิ่มได้หลายแถวถ้าเดือนนี้มี OT หลายแบบ</div>
    <div id="otRows" style="margin-top:8px"></div>
    <button type="button" id="otAdd" class="btn ghost" style="padding:7px 14px;font-size:13.5px">+ เพิ่มแถว OT</button>
    <div style="margin-top:12px;display:flex;gap:10px;align-items:center;flex-wrap:wrap">
      <span class="muted">รวมค่าล่วงเวลา (OT):</span>
      <input type="number" step="0.01" data-earn="ot" id="otAmt" value="${r.earn.ot||0}" style="width:150px;padding:9px 11px;border:1px solid var(--line);border-radius:8px;font-weight:700"> <span class="muted">บาท</span>
      <span class="muted" style="font-size:12px">(แก้ตัวเลขนี้เองได้)</span>
    </div>
  </div>`;
  const AUTO_DED={sso:1,pvd:1,tax:1,absent:1};   // ช่องคำนวณอัตโนมัติ (แก้ทับเองได้)
  const uDays=unpaidDays(emp, PERIOD);
  const dedRows=DED_FIELDS.map(([k,l])=>{
    const auto=AUTO_DED[k], man=r.manual&&r.manual[k];
    const tag = !auto ? ''
      : man ? ` <span style="color:#d97706;font-size:11px">(แก้เอง)</span> <a href="#" data-reauto="${k}" style="font-size:11px;color:var(--brand)">↻ คืนค่าอัตโนมัติ</a>`
            : ' <span style="color:#059669;font-size:11px">(อัตโนมัติ)</span>';
    const bg = auto ? (man?'background:#fffbeb':'background:#f0fdf4') : '';
    // บอกที่มาของยอดหักขาดงาน ให้ตรวจย้อนไปที่ใบลาได้
    let note='';
    if(k==='absent'){
      note = isDaily
        ? '<div class="muted" style="font-size:11px;margin-top:3px">พนักงานรายวันไม่ถูกหัก — ได้ค่าจ้างตามวันที่มาทำงานอยู่แล้ว</div>'
        : uDays>0
          ? `<div class="muted" style="font-size:11px;margin-top:3px">จากใบลาไม่รับค่าจ้าง <strong>${num(uDays)}</strong> วันในงวดนี้ · ${money(emp.salary||0)} ÷ 30 × ${num(uDays)}</div>`
          : '<div class="muted" style="font-size:11px;margin-top:3px">งวดนี้ไม่มีใบลาไม่รับค่าจ้าง</div>';
    }
    return `<div class="field"><label>${l}${tag}</label>
      <input type="number" step="0.01" data-ded="${k}" id="ded_${k}" value="${r.ded[k]||0}" style="${bg}">${note}</div>`;
  }).join('');

  const panel=el(`<div class="panel">
    <div class="phead"><h2>${esc(emp.name)} <span class="muted">— ${periodLabel(PERIOD)}</span></h2>
      <div class="sp"><span class="chip">${isDaily?`รายวัน ${money(emp.salary)}/วัน`:`เงินเดือน ${money(emp.salary)}`}</span></div></div>
    <div class="pbody">
      <div class="grid2">
        <div>
          <div class="sec-title">2.1 เงินได้</div>
          ${dayBlock}
          ${prorateBlock}
          ${otBlock}
          <div class="grid2">${earnRows}</div>
        </div>
        <div>
          <div class="sec-title">2.2 เงินหัก</div>
          <div class="grid2">${dedRows}</div>
        </div>
      </div>
    </div>
  </div>`);
  v.appendChild(panel);

  const totBox=el(`<div class="cards" id="peTot"></div>`);
  v.appendChild(totBox);
  drawPeTot(emp);

  // เงินได้เปลี่ยน → คำนวณ ปกส./กสล./ภาษี ใหม่ แล้วอัปเดตช่องอัตโนมัติ
  const refreshAutoDed=()=>{ autoDeductions(emp,r);
    ['sso','pvd','tax'].forEach(k=>{ const el2=panel.querySelector('#ded_'+k); if(el2) el2.value=r.ded[k]; }); };

  panel.querySelectorAll('input[data-earn]').forEach(i=>i.oninput=()=>{ r.earn[i.dataset.earn]=+i.value||0; refreshAutoDed(); save(); drawPeTot(emp); });
  panel.querySelectorAll('input[data-ded]').forEach(i=>i.oninput=()=>{
    const k=i.dataset.ded, val=+i.value||0;
    if(AUTO_DED[k]) setManualDed(r,k,val); else r.ded[k]=val;   // แก้ช่องอัตโนมัติ = ยึดค่าที่พิมพ์
    save(); drawPeTot(emp);
  });
  // ปุ่มคืนค่าอัตโนมัติ
  panel.querySelectorAll('[data-reauto]').forEach(a=>a.onclick=(ev)=>{
    ev.preventDefault(); clearManualDed(emp,r,a.dataset.reauto); render(); toast('คืนค่าอัตโนมัติแล้ว');
  });
  // OT auto-calc: รวมทุกแถว (อัตรา/ชม. × ชั่วโมง × ตัวคูณ)
  const otA=panel.querySelector('#otAmt'), otBox=panel.querySelector('#otRows');
  const recalcOT=()=>{
    const rows=otRowsOf(r);
    otBox.querySelectorAll('.otrow').forEach(function(el,i){
      if(!rows[i]) rows[i]={h:0,m:1.5};
      rows[i].h=+el.querySelector('.otH').value||0;
      rows[i].m=+el.querySelector('.otM').value||0;
      el.querySelector('.otSub').textContent=money(otAmount(emp,rows[i].h,rows[i].m))+' บาท';
    });
    const amt=otTotal(emp,r);
    r.earn.ot=amt; otA.value=amt; refreshAutoDed(); save(); drawPeTot(emp);
  };
  const drawOTRows=()=>{
    const rows=otRowsOf(r);
    otBox.innerHTML=rows.map(function(row,i){
      return '<div class="otrow" style="display:grid;grid-template-columns:1fr 1.6fr auto auto;gap:10px;align-items:end;margin-bottom:8px">'
        +'<div class="field"><label>จำนวนชั่วโมง</label><input type="number" step="0.5" class="otH" value="'+(row.h||0)+'"></div>'
        +'<div class="field"><label>ตัวคูณ (เท่า)</label><select class="otM">'
        + OT_MULTS.map(function(o){ return '<option value="'+o[0]+'"'+((+(row.m||1.5)===+o[0])?' selected':'')+'>'+o[1]+'</option>'; }).join('')
        +'</select></div>'
        +'<div class="field"><label>เป็นเงิน</label><div class="otSub" style="padding:9px 4px;font-weight:700;color:var(--brand-d);white-space:nowrap">0 บาท</div></div>'
        +'<button type="button" class="otDel" title="ลบแถวนี้" style="border:1px solid var(--line);background:#fff;color:#dc2626;border-radius:8px;width:36px;height:38px;cursor:pointer;font-size:15px">✕</button>'
        +'</div>';
    }).join('');
    otBox.querySelectorAll('.otH').forEach(function(x){ x.oninput=recalcOT; });
    otBox.querySelectorAll('.otM').forEach(function(x){ x.onchange=recalcOT; });
    otBox.querySelectorAll('.otDel').forEach(function(b,i){
      b.onclick=function(){
        const rows=otRowsOf(r);
        if(rows.length<=1) rows[0]={h:0,m:1.5}; else rows.splice(i,1);
        drawOTRows(); recalcOT();
      };
    });
    recalcOT();
  };
  drawOTRows();
  panel.querySelector('#otAdd').onclick=()=>{ otRowsOf(r).push({h:0,m:1.5}); drawOTRows(); };
  // พนักงานรายวัน: เปลี่ยนจำนวนวัน → อัปเดตค่าจ้างฐาน
  const wd=panel.querySelector('#workDays');
  if(wd) wd.oninput=()=>{ r.days=+wd.value||0; panel.querySelector('#baseShow').value=money(basePay(emp,r));
    refreshAutoDed();   // วันเปลี่ยน → คำนวณ ปกส./กสล./ภาษี ใหม่
    save(); drawPeTot(emp); };
}
/* ---------- มุมมอง "ทั้งหมด" : ตารางกรอกเงินได้/เงินหักทุกคน ---------- */
const MANUAL_DED=['loan','studentloan','other'];        // ช่องหักที่กรอกเอง
/* ---------- ล้างข้อมูลเงินเดือนทั้งงวด (เช่น เผลอทำเงินเดือนเดือนที่ยังไม่ถึง) ---------- */
function clearPeriodModal(p){
  const pp=DB.payroll[p]||{};
  const ids=Object.keys(pp);
  if(!ids.length){ toast('งวด '+periodLabel(p)+' ยังไม่มีข้อมูลให้ล้าง'); return; }
  /* สรุปให้เห็นก่อนว่ากำลังจะลบอะไร */
  let gross=0, net=0, named=[];
  ids.forEach(id=>{
    const e=DB.employees.find(x=>x.id===id); if(!e) return;
    const cc=calc(e,p); gross+=cc.gross; net+=cc.net;
    named.push(esc(e.code)+' — '+esc(e.name));
  });
  const [py,pm]=p.split('-').map(Number);
  const future = py>lastRealYear() || (py===lastRealYear() && pm>lastRealMonth(py));
  const body=`
    ${future?'<div style="background:#fef3c7;color:#92400e;border-radius:8px;padding:9px 12px;margin-bottom:12px;font-size:13px">⚠️ งวดนี้เป็นเดือนที่ยังมาไม่ถึง</div>':''}
    <p>กำลังจะลบข้อมูลเงินเดือนของงวด <strong>${periodLabel(p)}</strong> ทั้งหมด</p>
    <div class="tbl-wrap" style="max-height:190px;overflow:auto;margin:10px 0">
      <table style="font-size:13px"><tbody>
        ${named.map(n=>'<tr><td>'+n+'</td></tr>').join('')}
      </tbody></table></div>
    <div style="display:flex;justify-content:space-between;font-size:13px"><span>พนักงาน</span><strong>${num(ids.length)} คน</strong></div>
    <div style="display:flex;justify-content:space-between;font-size:13px"><span>เงินได้รวม</span><strong>${money(gross)}</strong></div>
    <div style="display:flex;justify-content:space-between;font-size:13px"><span>เงินสุทธิรวม</span><strong>${money(net)}</strong></div>
    <p class="muted" style="font-size:12px;margin-top:12px">ข้อมูลพนักงาน การลา และเวลาเข้างาน <strong>จะไม่ถูกลบ</strong> — ลบเฉพาะตัวเลขเงินเดือนของงวดนี้เท่านั้น</p>`;
  openModal('ล้างข้อมูลงวด '+periodLabel(p), body, [
    ['ยกเลิก','ghost',closeModal],
    ['ลบข้อมูลงวดนี้','danger',()=>{
      delete DB.payroll[p];
      save(); closeModal(); render();
      toast('ล้างข้อมูลงวด '+periodLabel(p)+' แล้ว ('+num(ids.length)+' คน)');
    }]
  ]);
}
function vPayrollAll(v, list){
  const panel=el(`<div class="panel">
    <div class="phead"><h2>เงินได้ / เงินหัก ทุกคน — ${periodLabel(PERIOD)}</h2>
      <div class="sp"><span class="muted" style="font-size:12px">💡 แก้ตัวเลขในตารางได้เลย · ช่องสีเขียวคำนวณอัตโนมัติ</span></div></div>
    <div class="pbody" style="padding:0"><div class="tbl-wrap" id="allTbl"></div></div></div>`);
  v.appendChild(panel);

  const inp=(v2,attrs)=>`<input type="number" step="0.01" value="${v2||0}" ${attrs} style="width:92px;padding:5px 7px;border:1px solid var(--line);border-radius:6px;text-align:right">`;

  const rows=list.map(e=>{
    const r=getRec(PERIOD,e.id); autoDeductions(e,r); const c=calc(e,PERIOD);
    return `<tr data-row="${e.id}">
      <td><span class="chip">${esc(e.code)}</span></td>
      <td><strong>${esc(e.name)}</strong>${e.payType==='daily'?' <span class="chip" style="background:#fef3c7;color:#b45309">รายวัน</span>':''}</td>
      ${e.payType==='daily'?`<td class="num">${inp(r.days,`data-days="${e.id}"`)}</td>`:'<td class="num muted">-</td>'}
      <td class="num" data-base="${e.id}">${money(c.base)}</td>
      ${EARN_FIELDS.map(f=>`<td class="num">${inp(r.earn[f[0]],`data-e="${f[0]}" data-id="${e.id}"`)}</td>`).join('')}
      <td class="num pos" data-gross="${e.id}"><strong>${money(c.gross)}</strong></td>
      ${['tax','sso','pvd'].map(k=>`<td class="num">${inp(r.ded[k],`data-a="${k}" data-id="${e.id}"`)}</td>`).join('')}
      ${MANUAL_DED.map(k=>`<td class="num">${inp(r.ded[k],`data-d="${k}" data-id="${e.id}"`)}</td>`).join('')}
      <td class="num neg" data-ded="${e.id}">${money(c.dedTotal)}</td>
      <td class="num" data-net="${e.id}"><strong>${money(c.net)}</strong></td>
    </tr>`;
  }).join('');

  const dedLabel=k=>DED_FIELDS.find(f=>f[0]===k)[1];
  const tbl=el(`<table style="font-size:13px">
    <thead><tr>
      <th>รหัส</th><th>ชื่อ</th><th class="num">วันทำงาน</th><th class="num">ค่าจ้างฐาน</th>
      ${EARN_FIELDS.map(f=>`<th class="num">${FL(f)}</th>`).join('')}
      <th class="num">รายได้รวม</th>
      <th class="num">ภาษี</th><th class="num">ปกส.</th><th class="num">กสล.</th>
      ${MANUAL_DED.map(k=>`<th class="num">${dedLabel(k)}</th>`).join('')}
      <th class="num">หักรวม</th><th class="num">สุทธิ</th>
    </tr></thead><tbody>${rows}</tbody></table>`);
  const box=$('#allTbl'); box.innerHTML=''; box.appendChild(tbl);

  // อัปเดตแถวเดียวเมื่อแก้ตัวเลข
  const refreshRow=(id)=>{
    const e=DB.employees.find(x=>x.id===id), r=getRec(PERIOD,e.id);
    autoDeductions(e,r); const c=calc(e,PERIOD);
    const q=s=>tbl.querySelector(s);
    q(`[data-base="${id}"]`).textContent=money(c.base);
    q(`[data-gross="${id}"]`).innerHTML=`<strong>${money(c.gross)}</strong>`;
    q(`[data-ded="${id}"]`).textContent=money(c.dedTotal);
    q(`[data-net="${id}"]`).innerHTML=`<strong>${money(c.net)}</strong>`;
    // อัปเดตช่องอัตโนมัติที่ยังไม่ได้แก้เอง (ไม่ทับค่าที่ผู้ใช้พิมพ์)
    ['tax','sso','pvd','absent'].forEach(k=>{ if(r.manual&&r.manual[k]) return;
      const f=q(`input[data-a="${k}"][data-id="${id}"]`);
      if(f && document.activeElement!==f) f.value=r.ded[k];
    });
    save(); drawAllTot(list);
  };
  tbl.querySelectorAll('input[data-e]').forEach(i=>i.oninput=()=>{ const id=i.dataset.id;
    getRec(PERIOD,id).earn[i.dataset.e]=+i.value||0; refreshRow(id); });
  tbl.querySelectorAll('input[data-d]').forEach(i=>i.oninput=()=>{ const id=i.dataset.id;
    getRec(PERIOD,id).ded[i.dataset.d]=+i.value||0; refreshRow(id); });
  // แก้ทับช่องอัตโนมัติในตาราง
  tbl.querySelectorAll('input[data-a]').forEach(i=>{
    const id=i.dataset.id, k=i.dataset.a, r0=getRec(PERIOD,id), man=r0.manual&&r0.manual[k];
    i.style.background = man?'#fffbeb':'#f0fdf4';
    i.title = man?'แก้เอง — ดับเบิลคลิกเพื่อคืนค่าอัตโนมัติ':'คำนวณอัตโนมัติ (พิมพ์ทับได้)';
    i.oninput=()=>{ setManualDed(getRec(PERIOD,id),k,+i.value||0); i.style.background='#fffbeb'; refreshRow(id); };
    i.ondblclick=()=>{ const e2=DB.employees.find(x=>x.id===id);
      clearManualDed(e2,getRec(PERIOD,id),k); i.style.background='#f0fdf4'; i.value=getRec(PERIOD,id).ded[k]; refreshRow(id); toast('คืนค่าอัตโนมัติแล้ว'); };
  });
  tbl.querySelectorAll('input[data-days]').forEach(i=>i.oninput=()=>{ const id=i.dataset.days;
    getRec(PERIOD,id).days=+i.value||0; refreshRow(id); });

  v.appendChild(el(`<div class="cards" id="allTot"></div>`));
  drawAllTot(list);
}
function drawAllTot(list){
  let g=0,d=0,n=0;
  list.forEach(e=>{ const c=calc(e,PERIOD); g+=c.gross; d+=c.dedTotal; n+=c.net; });
  const box=$('#allTot'); if(!box) return;
  box.innerHTML=`<div class="kpi b3"><div class="lab">รายได้รวม (${list.length} คน)</div><div class="val money">${money(g)}</div></div>
    <div class="kpi b4"><div class="lab">หักรวม</div><div class="val money">${money(d)}</div></div>
    <div class="kpi b5"><div class="lab">เงินสุทธิรวม</div><div class="val money">${money(n)}</div></div>`;
}
/* ---------- ส่งออก CSV หน้าเงินได้/เงินหัก ---------- */
function exportPayrollCSV(list){
  const head=['รหัส','ชื่อ-นามสกุล','ประเภท','วันทำงาน','ค่าจ้างฐาน',
    ...EARN_FIELDS.map(f=>f[1]),'รายได้รวม',...DED_FIELDS.map(f=>f[1]),'หักรวม','เงินสุทธิ'];
  const lines=[head.map(csvEsc).join(',')];
  let tg=0,td=0,tn=0;
  list.forEach(e=>{ const r=getRec(PERIOD,e.id); autoDeductions(e,r); const c=calc(e,PERIOD);
    tg+=c.gross; td+=c.dedTotal; tn+=c.net;
    lines.push([e.code, e.name, e.payType==='daily'?'รายวัน':'รายเดือน',
      e.payType==='daily'?(r.days||0):'', c.base,
      ...EARN_FIELDS.map(f=>r.earn[f[0]]||0), c.gross,
      ...DED_FIELDS.map(f=>r.ded[f[0]]||0), c.dedTotal, c.net].map(csvEsc).join(','));
  });
  lines.push(['รวม','','','','',...EARN_FIELDS.map(()=>''),tg,...DED_FIELDS.map(()=>''),td,tn].map(csvEsc).join(','));
  const tag = payrollFilter==='daily'?'_รายวัน' : payrollFilter==='monthly'?'_รายเดือน' : '';
  downloadFile(`payroll${tag}_${PERIOD}.csv`, '﻿'+lines.join('\r\n'),'text/csv;charset=utf-8');
  toast(`ส่งออก CSV แล้ว (${list.length} คน)`);
}
/* ---------- นำเข้า CSV หน้าคำนวณเงินได้ ----------
   ใช้ไฟล์ที่ "ส่งออก CSV" ออกมาได้เลย — จับคู่คนด้วยรหัสพนักงาน และจับช่องด้วยชื่อหัวคอลัมน์
   ช่องที่คำนวณเอง (ค่าจ้างฐาน/รายได้รวม/หักรวม/เงินสุทธิ) ข้ามไป ไม่เขียนทับ                */
function parseCSV(text){
  const rows=[]; let row=[], cur='', q=false;
  text=text.replace(/^\ufeff/,'');
  for(let i=0;i<text.length;i++){
    const ch=text[i];
    if(q){
      if(ch==='"'){ if(text[i+1]==='"'){ cur+='"'; i++; } else q=false; }
      else cur+=ch;
    }else{
      if(ch==='"') q=true;
      else if(ch===','){ row.push(cur); cur=''; }
      else if(ch==='\n'){ row.push(cur); rows.push(row); row=[]; cur=''; }
      else if(ch!=='\r') cur+=ch;
    }
  }
  if(cur!==''||row.length){ row.push(cur); rows.push(row); }
  return rows.filter(r=>r.some(x=>String(x).trim()!==''));
}
function importPayrollCSV(text, list){
  const rows=parseCSV(text);
  if(rows.length<2){ toast('ไฟล์ว่างหรืออ่านไม่ได้'); return; }
  const head=rows[0].map(h=>String(h).trim());
  const iCode=head.findIndex(h=>/^(รหัส|code)$/i.test(h));
  if(iCode<0){ toast('ไม่พบคอลัมน์ "รหัส" ในไฟล์'); return; }
  const iDays=head.findIndex(h=>/^(วันทำงาน|days)$/i.test(h));
  /* จับคอลัมน์เงินได้/เงินหักจากชื่อป้าย (ทั้งไทยและอังกฤษ) */
  const mapEarn={}, mapDed={};
  EARN_FIELDS.forEach(f=>{ const i=head.findIndex(h=>h===f[1]||h===f[2]); if(i>=0) mapEarn[f[0]]=i; });
  DED_FIELDS.forEach(f=>{ const i=head.findIndex(h=>h===f[1]||h===f[2]); if(i>=0) mapDed[f[0]]=i; });
  if(!Object.keys(mapEarn).length && !Object.keys(mapDed).length){ toast('ไม่พบคอลัมน์เงินได้หรือเงินหักที่รู้จัก'); return; }

  const byCode={}; DB.employees.forEach(e=>byCode[String(e.code).trim().toLowerCase()]=e);
  const inList=new Set(list.map(e=>e.id));
  const numOf=v=>{ const n=Number(String(v??'').replace(/[, ]/g,'')); return isFinite(n)?n:0; };
  let ok=0, skipped=0, notFound=[];

  for(let i=1;i<rows.length;i++){
    const r=rows[i];
    const code=String(r[iCode]??'').trim();
    if(!code || /^(รวม|total)$/i.test(code)) continue;        // แถวรวมท้ายตาราง
    const e=byCode[code.toLowerCase()];
    if(!e){ notFound.push(code); continue; }
    if(!inList.has(e.id)){ skipped++; continue; }             // ไม่อยู่ในงวด/ตัวกรองนี้
    const rec=getRec(PERIOD, e.id);
    rec.manual=rec.manual||{};
    if(iDays>=0 && e.payType==='daily' && String(r[iDays]??'').trim()!=='') rec.days=numOf(r[iDays]);
    Object.entries(mapEarn).forEach(([k,idx])=>{ if(String(r[idx]??'').trim()!=='') rec.earn[k]=numOf(r[idx]); });
    Object.entries(mapDed).forEach(([k,idx])=>{
      if(String(r[idx]??'').trim()==='') return;
      const v=numOf(r[idx]);
      rec.ded[k]=v;
      /* ช่องที่ระบบคิดเอง (ภาษี/ปกส./กสล./กองทุนสงเคราะห์) — ทำเครื่องหมายว่าคนกรอกเอง
         เฉพาะเมื่อค่าต่างจากที่ระบบคำนวณ ไม่งั้นปล่อยให้ระบบคิดต่อเหมือนเดิม */
      if(['tax','sso','pvd','wf'].includes(k)){
        const auto=JSON.parse(JSON.stringify(rec));
        autoDeductions(e, auto);
        if(Math.abs(Number(auto.ded[k]||0)-v)>0.005) rec.manual[k]=1; else delete rec.manual[k];
        rec.ded[k]=v;
      } else rec.manual[k]=1;
    });
    autoDeductions(e, rec);
    ok++;
  }
  save(); render();
  let msg=`นำเข้าแล้ว ${ok} คน`;
  if(skipped) msg+=` · ข้าม ${skipped} คน (ไม่อยู่ในงวดนี้)`;
  if(notFound.length) msg+=` · ไม่พบรหัส ${notFound.slice(0,3).join(', ')}${notFound.length>3?'…':''}`;
  toast(msg);
}
function drawPeTot(emp){
  const c=calc(emp,PERIOD);
  $('#peTot').innerHTML=`
    <div class="kpi b3"><div class="lab">รายได้รวม</div><div class="val money">${money(c.gross)}</div></div>
    <div class="kpi b4"><div class="lab">หักรวม</div><div class="val money">${money(c.dedTotal)}</div></div>
    <div class="kpi b5"><div class="lab">เงินสุทธิ</div><div class="val money">${money(c.net)}</div></div>`;
}

function taxModal(emp, r){
  const year=+PERIOD.split('-')[0];
  const t=estTax(emp, year, r);
  if(t.months===0){ openModal(`คำนวณภาษี — ${emp.name}`, `<p>พนักงานเริ่มงานวันที่ <strong>${fmtDate(emp.startDate)}</strong> ซึ่งอยู่หลังปีภาษี ${year+543} จึงยังไม่มีเงินได้ในปีนี้</p>`, [['ปิด','ghost',closeModal]]); return; }
  const line=(lab,val,neg)=>`<tr><td>${lab}</td><td class="num ${neg?'neg':''}">${neg?'-':''}${money(Math.abs(val))}</td></tr>`;
  const brackets=`0–150,000 (0%) · 150,001–300,000 (5%) · 300,001–500,000 (10%) · 500,001–750,000 (15%) · 750,001–1,000,000 (20%) · 1,000,001–2,000,000 (25%) · 2,000,001–5,000,000 (30%) · >5,000,000 (35%)`;
  const startNote = t.months<12 ? `<div style="background:#fef3c7;border:1px solid #fcd34d;border-radius:8px;padding:8px 12px;margin-bottom:12px;font-size:13px">📅 เริ่มงาน ${fmtDate(emp.startDate)} → ทำงานในปีภาษี ${year+543} จำนวน <strong>${t.months} เดือน</strong> (คำนวณเงินได้และเฉลี่ยภาษีตามเดือนที่ทำงานจริง)</div>` : '';
  const body= startNote + `
    <table style="width:100%">
      <tbody>
        ${line('เงินได้ประจำ/เดือน (เงินเดือน+OT+คอม+ค่าตำแหน่งฯ) '+money(t.recurringMonthly)+' × '+t.months+' เดือน', t.recurringMonthly*t.months)}
        ${t.bonus?line('+ โบนัส (จ่ายครั้งเดียว)', t.bonus):''}
        ${line('รวมเงินได้ทั้งปี', t.inc)}
        ${line('หัก ค่าใช้จ่าย 50% (สูงสุด 100,000)', t.expense, true)}
        ${line('หัก ลดหย่อนส่วนตัว', t.personal, true)}
        ${t.spouse?line('หัก คู่สมรส', t.spouse, true):''}
        ${t.children?line('หัก บุตร ('+ (emp.children||0) +' คน)', t.children, true):''}
        ${line('หัก ประกันสังคม (สูงสุด 10,500)', t.sso, true)}
        ${t.pvd?line('หัก กองทุนสำรองเลี้ยงชีพ', t.pvd, true):''}
        ${t.other?line('หัก ลดหย่อนอื่น', t.other, true):''}
      </tbody>
      <tfoot>
        <tr><td><strong>เงินได้สุทธิ (ฐานภาษี)</strong></td><td class="num"><strong>${money(t.net)}</strong></td></tr>
        <tr><td>ภาษีทั้งปี (อัตราก้าวหน้า)</td><td class="num">${money(t.annual)}</td></tr>
        <tr><td><strong>ภาษีหัก ณ ที่จ่าย / เดือน (÷ ${t.months} เดือน)</strong></td><td class="num"><strong style="color:var(--brand-d);font-size:16px">${money(t.monthly)}</strong></td></tr>
      </tfoot>
    </table>
    <div style="background:#eaf6f1;border:1px solid #a7e3cd;border-radius:8px;padding:9px 12px;margin-top:14px;font-size:13px">
      ✅ ระบบใส่ยอดนี้ในช่อง <strong>ภาษีเงินได้</strong> ให้อัตโนมัติแล้ว และคิดใหม่เองทุกครั้งที่เงินได้เปลี่ยน — หน้านี้ไว้ดูที่มาของตัวเลขเท่านั้น
    </div>
    <p class="muted" style="font-size:12px;margin-top:12px;line-height:1.6">อัตราภาษีขั้นบันได: ${brackets}</p>
    <p class="muted" style="font-size:12px">* ค่าจ้างรวมทั้งปีคิดจาก<strong>เงินที่ได้รับจริงของแต่ละเดือน</strong> เดือนที่เข้างานหรือลาออกกลางเดือนหารตามวันทำงาน (ตัวเลขข้างบนจึงเป็นค่าเฉลี่ยต่อเดือน) · เงินเพิ่มประจำคูณตามจำนวนเดือนที่ทำงาน โบนัสบวกครั้งเดียว · ปรับค่าลดหย่อนได้ที่ข้อมูลพนักงาน</p>`;
  openModal(`คำนวณภาษี — ${emp.name}`, body, [['ปิด','ghost',closeModal]]);
}

