/* ============================================================
   ใบเสนอราคา eSimPayroll (เมนูผู้ดูแลระบบ)
   - ราคาแพ็กเกจ: ตารางเดียวกับหน้าราคา (tests/quote.test.mjs ตรวจว่าตรงกับ pricing.html)
   - ผู้ให้บริการยังไม่จด VAT → ไม่บวกภาษีมูลค่าเพิ่ม
   - จำนวนเงินตัวอักษรใช้ ESIM_RECEIPT.bahtText (โหลด receipt.js ก่อนไฟล์นี้)
   ============================================================ */
(function(){
  const TIERS=[
    {min:1,   max:10,  price:0,    prem:590},
    {min:11,  max:30,  price:590,  prem:790},
    {min:31,  max:50,  price:990,  prem:1490},
    {min:51,  max:80,  price:1490, prem:2290},
    {min:81,  max:100, price:2290, prem:2990},
    {min:101, max:150, price:2990, prem:4490},
  ];
  const FIRM_TIERS=[{min:1,max:15,price:3990},{min:16,max:40,price:6990}];
  const YEAR_MONTHS=10;   // จ่ายรายปีคิด 10 เดือน

  /* รายการแพ็กเกจจากจำนวนพนักงาน/บริษัท — คืน {desc, qty, unit, price} (price=null = เกินตาราง ให้กรอกเอง) */
  function planLine({edition='single', count=1, ptype='standard', cycle='yearly', periods=1}={}){
    const yearly=cycle==='yearly', firm=edition==='firm';
    const t=(firm?FIRM_TIERS:TIERS).find(x=>count>=x.min&&count<=x.max);
    const mo=t?(firm?t.price:(ptype==='premium'?t.prem:t.price)):null;
    const range=t?`${t.min}-${t.max} ${firm?'บริษัท':'คน'}`:`${count} ${firm?'บริษัท':'คน'}`;
    const pkg=firm?'สำนักงานบัญชี (หลายบริษัท พนักงานไม่จำกัด)':(ptype==='premium'?'พรีเมียม (เงินเดือน + ลงเวลา ลา กะ OT)':'มาตรฐาน (เงินเดือน ภาษี ประกันสังคม เอกสารราชการ)');
    return {
      desc:`ค่าบริการระบบเงินเดือน eSimPayroll · แพ็กเกจ${pkg} · ${range}`+
           (yearly?` · รายปี (12 เดือน คิด ${YEAR_MONTHS} เดือน)`:' · รายเดือน'),
      qty:Math.max(1,+periods||1), unit:yearly?'ปี':'เดือน',
      price:mo==null?null:(yearly?mo*YEAR_MONTHS:mo),
    };
  }

  const r2=n=>Math.round((+n||0)*100)/100;
  function totals(items, discount){
    const sub=r2((items||[]).reduce((s,i)=>s+r2((+i.qty||0)*(+i.price||0)),0));
    const disc=Math.min(sub, Math.max(0, r2(discount)));
    return {sub, disc, total:r2(sub-disc)};
  }

  const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const fmt=n=>(+n||0).toLocaleString('th-TH',{minimumFractionDigits:2,maximumFractionDigits:2});
  const thDate=d=>{ if(!d) return '-'; const x=new Date(typeof d==='string'&&d.length===10?d+'T00:00:00+07:00':d);
    const b=new Date(x.getTime()+7*3600e3); return `${String(b.getUTCDate()).padStart(2,'0')}/${String(b.getUTCMonth()+1).padStart(2,'0')}/${b.getUTCFullYear()+543}`; };
  const lines=s=>esc(s).replace(/\n/g,'<br>');

  function html(q){
    const s=q.seller||{}, c=q.customer||{};
    const {sub,disc,total}=totals(q.items,q.discount);
    const words=(window.ESIM_RECEIPT&&ESIM_RECEIPT.bahtText)?ESIM_RECEIPT.bahtText(total):'';
    const rows=(q.items||[]).map((i,k)=>`<tr><td class="c">${k+1}</td><td>${lines(i.desc)}</td>
      <td class="c">${(+i.qty||0).toLocaleString('th-TH')} ${esc(i.unit||'')}</td><td class="tr">${fmt(i.price)}</td><td class="tr">${fmt((+i.qty||0)*(+i.price||0))}</td></tr>`).join('');
    return `<!doctype html><html lang="th"><head><meta charset="utf-8"><title>${esc(q.quote_no||'ใบเสนอราคา')}</title>
<style>
 *{box-sizing:border-box;margin:0;padding:0}
 body{font-family:"Sarabun","TH Sarabun New",Tahoma,sans-serif;color:#0f2438;font-size:13px;line-height:1.55;padding:14mm}
 .hd{display:flex;align-items:flex-start;gap:14px;border-bottom:2px solid #0e3a5c;padding-bottom:12px;margin-bottom:16px}
 .bn{font-size:23px;font-weight:800}.bn span{color:#0e3a5c}
 .hd .r{margin-left:auto;text-align:right}.hd .r h1{font-size:20px;color:#0e3a5c}
 .grid2{display:flex;gap:12px;margin-bottom:6px}.grid2>div{flex:1}
 .box{border:1px solid #d7e5dd;border-radius:8px;padding:11px 13px;font-size:12.5px}
 table{width:100%;border-collapse:collapse;margin-top:12px}
 th,td{border:1px solid #b9cddb;padding:7px 9px;text-align:left;vertical-align:top}
 th{background:#eaf6f1;font-size:12.5px}.tr{text-align:right}.c{text-align:center}
 .sum td{border:0;padding:4px 9px}.sum .tot td{background:#0e3a5c;color:#fff;font-weight:800;padding:8px 9px}
 .ft{display:flex;gap:14px;margin-top:28px}.sig{flex:1;text-align:center;font-size:12px;padding-top:36px}
 .sig .ln{border-top:1px dotted #7d95a8;margin-bottom:5px}
 .note{margin-top:14px;font-size:12px;color:#334155}
 @media print{body{padding:0}@page{size:A4;margin:12mm}.noprint{display:none}}
 .noprint{text-align:center;margin-bottom:14px}
 .noprint button{padding:10px 22px;border:0;border-radius:9px;background:#0e3a5c;color:#fff;font-weight:700;font-size:14px;cursor:pointer;font-family:inherit}
</style></head><body>
<div class="noprint"><button onclick="window.print()">🖨️ พิมพ์ / บันทึกเป็น PDF</button></div>
<div class="hd">
  <div><div class="bn">eSim<span>Payroll</span></div>
    <div style="font-size:12px;color:#5b7186">ระบบเงินเดือนออนไลน์สำหรับธุรกิจไทย<br>esimpayroll.com · hello@esimpayroll.com</div></div>
  <div class="r"><h1>ใบเสนอราคา</h1><div style="font-size:11.5px;color:#5b7186">Quotation</div>
    <div style="margin-top:5px">เลขที่ <b>${esc(q.quote_no||'(ยังไม่บันทึก)')}</b><br>วันที่ <b>${thDate(q.date)}</b><br>ยืนราคาถึง <b>${thDate(q.valid_until)}</b></div></div>
</div>
<div class="grid2">
  <div class="box"><b>ผู้เสนอราคา</b><br>${esc(s.name||'eSimPayroll')}${s.taxId?`<br>เลขประจำตัวผู้เสียภาษี ${esc(s.taxId)}`:''}${s.addr?`<br>${lines(s.addr)}`:''}
    <br>${esc(s.email||'hello@esimpayroll.com')}${s.phone?' · '+esc(s.phone):''}${s.contact?`<br>ผู้ติดต่อ ${esc(s.contact)}`:''}</div>
  <div class="box"><b>เสนอราคาให้</b><br>${esc(c.name)}${c.taxId?`<br>เลขประจำตัวผู้เสียภาษี ${esc(c.taxId)}${c.branch?` (${esc(c.branch)})`:''}`:''}${c.addr?`<br>${lines(c.addr)}`:''}
    ${c.contact?`<br>เรียน ${esc(c.contact)}`:''}${c.email||c.phone?`<br>${esc(c.email||'')}${c.email&&c.phone?' · ':''}${esc(c.phone||'')}`:''}</div>
</div>
<table>
  <thead><tr><th class="c" style="width:6%">ลำดับ</th><th style="width:50%">รายการ</th><th class="c" style="width:12%">จำนวน</th><th class="tr" style="width:15%">ราคาต่อหน่วย</th><th class="tr" style="width:17%">จำนวนเงิน (บาท)</th></tr></thead>
  <tbody>${rows}</tbody>
</table>
<table class="sum" style="width:46%;margin-left:auto;margin-top:6px">
  <tr><td>รวมเป็นเงิน</td><td class="tr">${fmt(sub)}</td></tr>
  ${disc?`<tr><td>ส่วนลด</td><td class="tr">-${fmt(disc)}</td></tr>`:''}
  <tr class="tot"><td>ยอดรวมทั้งสิ้น (บาท)</td><td class="tr">${fmt(total)}</td></tr>
</table>
${words?`<div style="text-align:right;margin-top:6px">(${words})</div>`:''}
<div style="font-size:11.5px;color:#5b7186;margin-top:4px;text-align:right">ผู้ให้บริการไม่ได้จดทะเบียนภาษีมูลค่าเพิ่ม — ราคานี้ไม่มีภาษีมูลค่าเพิ่ม</div>
${q.notes?`<div class="note"><b>เงื่อนไข / หมายเหตุ</b><br>${lines(q.notes)}</div>`:''}
<div class="ft">
  <div class="sig"><div class="ln"></div>ผู้เสนอราคา<br>วันที่ ......./......./.......</div>
  <div class="sig"><div class="ln"></div>ผู้อนุมัติสั่งซื้อ (ลูกค้า)<br>วันที่ ......./......./.......</div>
</div>
<script>window.onload=function(){setTimeout(function(){window.print();},350)}<\/script>
</body></html>`;
  }

  function open(q, win){
    const w=win||window.open('','_blank');
    if(!w){ alert('เบราว์เซอร์บล็อกป๊อปอัป กรุณาอนุญาตป๊อปอัปแล้วลองอีกครั้ง'); return false; }
    w.document.open(); w.document.write(html(q)); w.document.close();
    return true;
  }

  window.ESIM_QUOTE={ TIERS, FIRM_TIERS, YEAR_MONTHS, planLine, totals, html, open };
})();
