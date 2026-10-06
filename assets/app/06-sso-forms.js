/* app.html · แบบ สปส.1-10, กท.20 ก — ลำดับไฟล์มีผล (โหลดตามเลข) */
/* ============ แบบประกันสังคม (สปส. 1-10) ============ */
/* ---------- ข้อมูลค่าจ้างรายเดือนสำหรับ กท.20 ก ----------
   ค่าจ้างตามกฎหมายประกันสังคม = ค่าจ้างฐาน + ค่าตอบแทนประจำ
   (ไม่รวมค่าล่วงเวลาและโบนัส ตามหมายเหตุในแบบฟอร์ม)                    */
const KT20_CAP=20000;   // เพดานค่าจ้างที่ต้องแจ้ง 20,000/คน/เดือน
// ดึงยอดของเดือนนั้นจากข้อมูลประกันสังคมรายเดือน (ฐานเดียวกับ สปส. 1-10)
function kt20Month(year, m){
  const p=`${year}-${String(m).padStart(2,'0')}`;
  let count=0, salary=0, daily=0, other=0, excess=0, ot=0, bonus=0, sso=0;
  DB.employees.forEach(e=>{
    if(!activeInMonth(e,year,m)) return;
    if(ssoExempt(e)) return;                     // กรรมการ ไม่นับในแบบประกันสังคม
    const r=readRec(p,e.id);
    const base=basePay(e,r,p);
    const oth=SSO_WAGE_KEYS.reduce((s,k)=>s+Number(r.earn[k]||0),0);
    const wage=ssoWage(e,r,p);                   // = base + oth (ค่าจ้าง ปกส. ของคนนี้เดือนนี้)
    if(wage<=0) return;
    count++;
    if(e.payType==='daily') daily+=base; else salary+=base;
    other+=oth;
    excess+=Math.max(0, wage-KT20_CAP);          // ส่วนที่เกินเพดาน (คิดรายคน)
    sso+=Number(r.ded.sso||0);                   // เงินสมทบที่นำส่งเดือนนั้น
    ot+=Number(r.earn.ot||0); bonus+=Number(r.earn.bonus||0);
  });
  const total=salary+daily+other;
  return {count, salary, daily, other, total, excess, net:total-excess, ot, bonus, sso};
}
function kt20Year(year){
  const months=Array.from({length:12},(_,i)=>kt20Month(year,i+1));
  const sum=months.reduce((a,b)=>({count:0,salary:a.salary+b.salary,daily:a.daily+b.daily,other:a.other+b.other,
    total:a.total+b.total,excess:a.excess+b.excess,net:a.net+b.net,ot:a.ot+b.ot,bonus:a.bonus+b.bonus,sso:a.sso+b.sso}),
    {salary:0,daily:0,other:0,total:0,excess:0,net:0,ot:0,bonus:0,sso:0});
  sum.count=Math.max(0,...months.map(x=>x.count));    // จำนวนลูกจ้างสูงสุดในปี
  // ค่าจ้างต่ำสุด
  const monthlyEmps=DB.employees.filter(e=>(e.payType||'monthly')==='monthly'&&+e.salary>0);
  const dailyEmps=DB.employees.filter(e=>e.payType==='daily'&&+e.salary>0);
  sum.minMonthly = monthlyEmps.length?Math.min(...monthlyEmps.map(e=>+e.salary)):0;
  sum.minDaily   = dailyEmps.length?Math.min(...dailyEmps.map(e=>+e.salary)):0;
  return {months, sum};
}
let ssoForm='sps10';   // sps10 | kt20
function vSSO(v){
  const [py,pm]=PERIOD.split('-').map(Number);
  const activeAll=DB.employees.filter(e=>activeInMonth(e,py,pm));
  const list=activeAll.filter(e=>!ssoExempt(e));          // ตัดกรรมการออกจากแบบประกันสังคม
  const exempt=activeAll.filter(e=>ssoExempt(e));
  // ปุ่มเลือกแบบฟอร์ม
  const seg=el(`<div class="toolbar no-print" style="margin-bottom:6px">
    <div class="seg" style="display:inline-flex;background:#eaf6f1;border-radius:10px;padding:3px">
      <button class="segbtn ${ssoForm==='sps10'?'on':''}" data-f="sps10">🛡️ สปส. 1-10 (รายเดือน)</button>
      <button class="segbtn ${ssoForm==='kt20'?'on':''}" data-f="kt20">📋 กท. 20 ก (รายปี)</button>
    </div>
  </div>`);
  v.appendChild(seg);
  seg.querySelectorAll('.segbtn').forEach(b=>b.onclick=()=>{ ssoForm=b.dataset.f; render(); });
  if(ssoForm==='kt20'){ vKT20(v, py); return; }

  v.appendChild(el(`<div class="toolbar no-print"><h2 style="font-size:16px">แบบรายการแสดงการส่งเงินสมทบ (สปส. 1-10) — ${periodLabel(PERIOD)}</h2>
    <button class="btn ghost sm" style="margin-left:auto" id="ssoCsv">⬇️ CSV</button>
    <button class="btn" onclick="window.print()">🖨️ พิมพ์</button></div>`));
  if(exempt.length) v.appendChild(el(`<div class="panel no-print" style="border-color:#fcd34d;background:#fffbeb"><div class="pbody" style="font-size:13px;color:#92400e">
    ⚠️ ไม่นับรวมในแบบประกันสังคม ${exempt.length} คน (ตำแหน่งกรรมการ / ตั้งค่ายกเว้น): ${exempt.map(e=>esc(e.name)).join(', ')}</div></div>`));
  let totWage=0, totSso=0;
  const rows=list.map((e,i)=>{ const r=readRec(PERIOD,e.id); const c={base:ssoWage(e,r,PERIOD)}; const s=+r.ded.sso||0; totWage+=c.base; totSso+=s;
    return `<tr><td style="text-align:center">${i+1}</td><td>${esc(e.taxId||'-')}</td><td>${esc(e.name)}</td>
      <td style="text-align:right">${money(c.base)}</td><td style="text-align:right">${money(s)}</td></tr>`;
  }).join('');
  const area=el(`<div class="print-area"></div>`); v.appendChild(area);
  area.appendChild(el(`<div class="doc">
    <h2 class="dt">แบบรายการแสดงการส่งเงินสมทบ</h2>
    <div style="text-align:center;margin-bottom:8px">สปส. 1-10 · ประจำเดือน ${THAI_MONTHS[pm-1]} พ.ศ. ${py+543}</div>
    <table class="dtbl">
      <tr><td style="width:60%"><strong>ชื่อสถานประกอบการ:</strong> ${esc(DB.company.name)}</td>
          <td><strong>เลขที่บัญชีนายจ้าง:</strong> ${esc(DB.company.ssoNo||'-')}</td></tr>
    </table>
    <table class="dtbl" style="margin-top:8px">
      <thead><tr><th style="width:8%">ลำดับ</th><th>เลขบัตรประชาชน</th><th>ชื่อ-สกุลผู้ประกันตน</th>
        <th style="text-align:right">ค่าจ้าง (บาท)</th><th style="text-align:right">เงินสมทบ 5% (บาท)</th></tr></thead>
      <tbody>${rows||'<tr><td colspan="5" style="text-align:center">ไม่มีข้อมูล</td></tr>'}</tbody>
      <tfoot><tr><th colspan="3" style="text-align:right">รวม</th><th style="text-align:right">${money(totWage)}</th><th style="text-align:right">${money(totSso)}</th></tr></tfoot>
    </table>
    <table class="dtbl" style="margin-top:8px">
      <tr><td>1. เงินสมทบผู้ประกันตน (ลูกจ้าง) รวม</td><td style="text-align:right;width:28%">${money(totSso)} บาท</td></tr>
      <tr><td>2. เงินสมทบนายจ้าง (เท่ากับข้อ 1)</td><td style="text-align:right">${money(totSso)} บาท</td></tr>
      <tr><td><strong>3. รวมเงินสมทบที่นำส่งทั้งสิ้น (ข้อ 1 + ข้อ 2)</strong></td><td style="text-align:right"><strong>${money(totSso*2)} บาท</strong></td></tr>
    </table>
    <div style="margin-top:6px;font-size:12px">จำนวนผู้ประกันตน ${num(list.length)} ราย · รวมนำส่ง ${money(totSso*2)} บาท (${bahtText(totSso*2)})</div>
    <div class="sign"><div><div class="line"></div>ลายมือชื่อนายจ้าง / ผู้รับมอบอำนาจ<br>( ${esc(DB.company.signer)} )<br>วันที่ ......./......./.......</div></div>
  </div>`));
  $('#ssoCsv').onclick=()=>{
    const lines=['ลำดับ,เลขบัตรประชาชน,ชื่อ,ค่าจ้าง,เงินสมทบ5%'];
    list.forEach((e,i)=>{ const r=readRec(PERIOD,e.id); const s=+r.ded.sso||0; lines.push(`${i+1},${e.taxId||''},"${e.name}",${ssoWage(e,r,PERIOD)},${s}`); });
    downloadFile(`sso_1-10_${PERIOD}.csv`, '﻿'+lines.join('\r\n'),'text/csv;charset=utf-8'); toast('ส่งออกแล้ว');
  };
}
/* ---------- แบบ กท. 20 ก (คำนวณค่าจ้างทั้งปี) ---------- */
function vKT20(v, year){
  const {months, sum}=kt20Year(year);
  v.appendChild(el(`<div class="toolbar no-print"><h2 style="font-size:16px">แบบคำนวณค่าจ้าง (กท. 20 ก) — ประจำปี ${year+543}</h2>
    <button class="btn ghost sm" style="margin-left:auto" id="ktCsv">⬇️ CSV</button>
    <button class="btn" onclick="window.print()">🖨️ พิมพ์</button></div>`));
  const line='<span style="border-bottom:1px dotted #555;display:inline-block;min-width:110px">&nbsp;</span>';
  const rows=months.map((x,i)=>`<tr>
    <td style="text-align:center">${THAI_MONTHS_ABBR[i]}</td>
    <td style="text-align:center">${x.count||''}</td>
    <td style="text-align:right">${x.salary?money(x.salary):''}</td>
    <td style="text-align:right">${x.daily?money(x.daily):''}</td>
    <td style="text-align:right">${x.other?money(x.other):''}</td>
    <td style="text-align:right">${x.total?money(x.total):''}</td>
    <td style="text-align:right">${x.excess?money(x.excess):''}</td>
    <td style="text-align:right">${x.net?money(x.net):''}</td></tr>`).join('');

  const area=el(`<div class="print-area"></div>`); v.appendChild(area);
  area.appendChild(el(`<div class="doc a4 kt20">
    <div style="text-align:center;font-weight:800;text-decoration:underline;font-size:13px">โปรดกรอกเอกสารฉบับนี้และส่งคืนสำนักงานพร้อมแบบ กท. 20 ก</div>
    <div style="text-align:center;margin-bottom:8px">แบบคำนวณค่าจ้างเพื่อประกอบการรายงานค่าจ้างตามแบบ กท. 20 ก ประจำปี ${year+543}</div>
    <div style="display:flex;gap:16px"><div style="flex:1">สำนักงานประกันสังคมจังหวัด ${line}</div><div style="width:34%">โทร. ${line}</div></div>
    <div style="display:flex;gap:16px"><div style="flex:1">ชื่อสถานประกอบการ <strong>${esc(DB.company.name)}</strong></div><div style="width:34%">เลขที่บัญชี <strong>${esc(DB.company.ssoNo||'-')}</strong></div></div>
    <div style="display:flex;gap:16px;margin-bottom:6px"><div style="flex:1">(ก) รหัสกิจการ ${line} อัตราเงินสมทบ ${line}</div><div style="width:34%">โทร. ${line}</div></div>

    <table class="dtbl kt20m">
      <thead>
        <tr>
          <th rowspan="2" style="width:8%">เดือน</th>
          <th rowspan="2" style="width:9%">จำนวน<br>ลูกจ้าง</th>
          <th colspan="4">① ประเภทของค่าจ้างตามกฎหมาย (รวมทุกสาขา)</th>
          <th rowspan="2" style="width:13%">② ส่วนที่เกิน<br>20,000/คน/เดือน</th>
          <th rowspan="2" style="width:14%">①-②=③ ค่าจ้างสุทธิ<br>ที่ต้องแจ้ง</th>
        </tr>
        <tr><th>เงินเดือน</th><th>ค่าจ้างรายวัน</th><th>ค่าตอบแทนอื่น ๆ</th><th>① รวมค่าจ้าง</th></tr>
        <tr><th colspan="8" style="font-weight:400;font-size:10px;text-align:left">** ไม่รวมเงินที่ไม่ใช่ค่าจ้าง เช่น ค่าล่วงเวลา โบนัส ฯลฯ **</th></tr>
      </thead>
      <tbody>${rows}</tbody>
      <tfoot><tr><th>รวม</th><th style="text-align:center">${sum.count||'-'}</th>
        <th style="text-align:right">${money(sum.salary)}</th><th style="text-align:right">${money(sum.daily)}</th>
        <th style="text-align:right">${money(sum.other)}</th><th style="text-align:right">${money(sum.total)}</th>
        <th style="text-align:right">${money(sum.excess)}</th><th style="text-align:right">${money(sum.net)}</th></tr></tfoot>
    </table>

    <div style="margin-top:5px">(ข) ค่าจ้างรายเดือนของลูกจ้างที่ได้รับต่ำสุด เดือนละ <strong>${sum.minMonthly?money(sum.minMonthly):'-'}</strong> บาท &nbsp; ค่าจ้างรายวันของลูกจ้างที่ได้รับต่ำสุดวันละ <strong>${sum.minDaily?money(sum.minDaily):'-'}</strong> บาท</div>

    <div style="display:flex;gap:10px;margin-top:4px">
      <div style="flex:1.15;border:1px solid #333;padding:5px 8px">
        <div>(ค) รายการเงินได้ตามแบบยื่นรายการภาษีเงินได้หัก ณ ที่จ่าย ภงด. 1 ก</div>
        <div style="margin-top:2px">จำนวน <strong>${num(sum.count)}</strong> ราย &nbsp; เงินได้ทั้งสิ้น <strong>${money(sum.total+sum.ot+sum.bonus)}</strong> บาท</div>
        <div style="padding-left:26px">ประกอบด้วย &nbsp; เงินเดือน <strong>${money(sum.salary)}</strong> บาท</div>
        <div>ค่าจ้างรายวัน <strong>${money(sum.daily)}</strong> บาท &nbsp;&nbsp; ค่าล่วงเวลา <strong>${money(sum.ot)}</strong> บาท</div>
        <div>โบนัส <strong>${money(sum.bonus)}</strong> บาท &nbsp;&nbsp; ค่าตอบแทนอื่น ๆ <strong>${money(sum.other)}</strong> บาท</div>
        <div>${line} บาท &nbsp;&nbsp; ${line} บาท</div>
      </div>
      <div style="flex:1;text-align:center;padding-top:6px;position:relative">
        ลงชื่อ ................................................ นายจ้าง<br>
        ( ${esc(DB.company.signer)} )<br>
        ตำแหน่ง ................................................<br>
        <span style="display:inline-block;border:1px solid #333;border-radius:50%;width:62px;height:62px;line-height:1.1;font-size:8px;padding-top:20px;margin-top:6px">ประทับตรา<br>นิติบุคคล</span>
      </div>
    </div>

    <div style="border-top:1px solid #333;margin:8px 0 5px"></div>

    <div style="display:flex;align-items:flex-end;gap:10px;margin-bottom:3px">
      <div style="flex:1">ประจำปี <strong>${year+543}</strong> &nbsp; รหัสกิจการ ${line} &nbsp; อัตราเงินสมทบ ${line}</div>
      <div style="font-weight:700">สำหรับเจ้าหน้าที่</div>
    </div>
    <table class="dtbl">
      <thead><tr>
        <th style="width:26%">ประเภท</th><th>ค่าจ้าง</th>
        <th>ปรับขั้นต่ำ (เฉพาะลูกจ้าง 1 คน)</th><th>ค่าจ้างสุทธิ</th><th style="width:15%">เงินสมทบ</th>
      </tr></thead>
      <tbody>
        <tr><td>การประเมินต้นปี</td><td></td><td></td><td></td><td></td></tr>
        <tr><td>การรายงานค่าจ้าง</td><td></td><td></td><td></td><td></td></tr>
        <tr><td>สปส 1-10</td><td></td><td></td><td></td><td></td></tr>
        <tr><td colspan="4">กองทุนเงินทดแทน สรุปผลเป็น เรียกเพิ่ม (Dr.), จ่ายคืน (Cr.)</td><td></td></tr>
      </tbody>
    </table>
  </div>`));

  $('#ktCsv').onclick=()=>{
    const lines=['เดือน,จำนวนลูกจ้าง,เงินเดือน,ค่าจ้างรายวัน,ค่าตอบแทนอื่นๆ,รวมค่าจ้าง,ส่วนที่เกิน20000,ค่าจ้างสุทธิที่ต้องแจ้ง'];
    months.forEach((x,i)=>lines.push([THAI_MONTHS[i],x.count,x.salary,x.daily,x.other,x.total,x.excess,x.net].join(',')));
    lines.push(['รวม',sum.count,sum.salary,sum.daily,sum.other,sum.total,sum.excess,sum.net].join(','));
    downloadFile(`kt20k_${year+543}.csv`, '﻿'+lines.join('\r\n'),'text/csv;charset=utf-8'); toast('ส่งออก กท.20 ก แล้ว');
  };
}
