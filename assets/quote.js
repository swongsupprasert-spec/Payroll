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
    const pkg=firm?'สำนักงานบัญชี':(ptype==='premium'?'พรีเมียม':'มาตรฐาน');
    // สิ่งที่ลูกค้าได้รับ — ใส่ไว้ใต้ชื่อแพ็กเกจ ให้ลูกค้าเห็นว่าจ่ายแล้วได้อะไร
    const gets=firm
      ? [`ดูแลบริษัทลูกค้า ${range} ในบัญชีเดียว พนักงานไม่จำกัด`, 'คำนวณเงินเดือน OT ภาษี ประกันสังคม กองทุนสำรองเลี้ยงชีพ', 'ออกสลิป 50 ทวิ ภ.ง.ด.1 ภ.ง.ด.1ก สปส.1-10 กท.20ก']
      : [`รองรับพนักงาน ${range}`, 'คำนวณเงินเดือน OT ภาษี ประกันสังคม กองทุนสำรองเลี้ยงชีพ', 'ออกสลิป 50 ทวิ ภ.ง.ด.1 ภ.ง.ด.1ก สปส.1-10 กท.20ก',
         ...(ptype==='premium'?['เพิ่ม: ลงเวลาสแกนหน้า + GPS · ลางาน + สายอนุมัติ · กะ / OT · ปฏิทินวันหยุด']:[])];
    const term=yearly?`ระยะเวลาบริการ 12 เดือน (จ่ายรายปีคิด ${YEAR_MONTHS} เดือน) นับจากวันที่ชำระ`:'ค่าบริการรายเดือน ต่ออายุทุกเดือน ยกเลิกได้ทุกเมื่อ';
    return {
      desc:`ค่าบริการระบบเงินเดือน eSimPayroll · แพ็กเกจ${pkg} · ${range} · ${yearly?'รายปี':'รายเดือน'}\n`+
           gets.map(g=>'• '+g).join('\n')+'\n• '+term,
      qty:Math.max(1,+periods||1), unit:yearly?'ปี':'เดือน',
      price:mo==null?null:(yearly?mo*YEAR_MONTHS:mo),
    };
  }

  const r2=n=>Math.round((+n||0)*100)/100;
  /* ยอดรวม — รายการที่เป็น "ตัวเลือก" (option) แสดงแยกให้ลูกค้าเลือก ไม่นำมารวมยอด */
  function totals(items, discount){
    const base=(items||[]).filter(i=>!i.option);
    const sub=r2(base.reduce((s,i)=>s+r2((+i.qty||0)*(+i.price||0)),0));
    const disc=Math.min(sub, Math.max(0, r2(discount)));
    return {sub, disc, total:r2(sub-disc), options:(items||[]).length-base.length};
  }
  /* ป้ายยอดรวม: ถ้าทุกรายการเป็นค่าบริการ 1 เดือน บอกให้ชัดว่าเป็นยอดต่อเดือน */
  function totalLabel(items){
    const base=(items||[]).filter(i=>!i.option);
    if(base.length && base.every(i=>i.unit==='เดือน' && +i.qty===1)) return 'ยอดรวมต่อเดือน (บาท)';
    if(base.length && base.every(i=>i.unit==='ปี' && +i.qty===1)) return 'ยอดรวมต่อปี (บาท)';
    return 'ยอดรวมทั้งสิ้น (บาท)';
  }

  // โลโก้ eSimPayroll (เหมือน brand/logo-mark.svg) ฝังเป็น SVG ในเอกสาร — พิมพ์ได้คมชัด ไม่ต้องโหลดรูป
  const LOGO=`<svg viewBox="0 0 44 44" width="64" height="64" aria-label="eSimPayroll" style="flex:none">
    <defs><linearGradient id="qtLogo" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#10b981"/><stop offset=".55" stop-color="#17557f"/><stop offset="1" stop-color="#092942"/></linearGradient></defs>
    <rect width="44" height="44" rx="12" fill="url(#qtLogo)"/>
    <path d="M28.5 27.5A8.5 8.5 0 1 1 31 21.5H14" fill="none" stroke="#fff" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const fmt=n=>(+n||0).toLocaleString('th-TH',{minimumFractionDigits:2,maximumFractionDigits:2});
  const thDate=d=>{ if(!d) return '-'; const x=new Date(typeof d==='string'&&d.length===10?d+'T00:00:00+07:00':d);
    const b=new Date(x.getTime()+7*3600e3); return `${String(b.getUTCDate()).padStart(2,'0')}/${String(b.getUTCMonth()+1).padStart(2,'0')}/${b.getUTCFullYear()+543}`; };
  const lines=s=>esc(s).replace(/\n/g,'<br>');

  function html(q){
    const s=q.seller||{}, c=q.customer||{};
    const {sub,disc,total}=totals(q.items,q.discount);
    const words=(window.ESIM_RECEIPT&&ESIM_RECEIPT.bahtText)?ESIM_RECEIPT.bahtText(total):'';
    const base=(q.items||[]).filter(i=>!i.option), opts=(q.items||[]).filter(i=>i.option);
    const descHtml=d=>{ const [first,...rest]=String(d||'').split('\n');
      return `<b>${esc(first)}</b>${rest.length?`<div class="gets">${rest.map(esc).join('<br>')}</div>`:''}`; };
    const rows=base.map((i,k)=>`<tr><td class="c">${k+1}</td><td>${descHtml(i.desc)}</td>
      <td class="c">${(+i.qty||0).toLocaleString('th-TH')} ${esc(i.unit||'')}</td><td class="tr">${fmt(i.price)}</td><td class="tr">${fmt((+i.qty||0)*(+i.price||0))}</td></tr>`).join('');
    const optRows=opts.map((i,k)=>`<tr><td class="c"><span class="tick"></span></td><td><div class="optn">ตัวเลือกที่ ${k+1}</div>${descHtml(i.desc)}</td>
      <td class="tr" style="white-space:nowrap"><div class="oprice">${fmt((+i.qty||0)*(+i.price||0))}</div>บาท${i.unit?` / ${+i.qty>1?`${(+i.qty).toLocaleString('th-TH')} `:''}${esc(i.unit)}`:''}</td></tr>`).join('');
    return `<!doctype html><html lang="th"><head><meta charset="utf-8"><title>${esc(q.quote_no||'ใบเสนอราคา')}</title>
<style>
 *{box-sizing:border-box;margin:0;padding:0}
 *{-webkit-print-color-adjust:exact;print-color-adjust:exact}   /* พิมพ์สีพื้น (แถวยอดรวม/หัวตาราง) ด้วย ไม่งั้นตัวหนังสือขาวหาย */
 body{font-family:"Sarabun","TH Sarabun New",Tahoma,sans-serif;color:#0f2438;font-size:15.5px;line-height:1.55;padding:14mm}
 .hd{display:flex;align-items:flex-start;gap:14px;border-bottom:2px solid #0e3a5c;padding-bottom:12px;margin-bottom:16px}
 .bn{font-size:28px;font-weight:800}.bn span{color:#0e3a5c}
 .hd .r{margin-left:auto;text-align:right}.hd .r h1{font-size:26px;color:#0e3a5c}
 .grid2{display:flex;gap:12px;margin-bottom:6px}.grid2>div{flex:1}
 .box{border:1px solid #d7e5dd;border-radius:8px;padding:11px 13px;font-size:15px}
 table{width:100%;border-collapse:collapse;margin-top:12px}
 th,td{border:1px solid #b9cddb;padding:9px 10px;text-align:left;vertical-align:top}
 th{background:#eaf6f1;font-size:15px}.tr{text-align:right}.c{text-align:center}
 .sum td{border:0;padding:4px 9px}.sum .tot td{background:#0e3a5c;color:#fff;font-weight:800;padding:8px 9px}
 .ft{display:flex;gap:14px;margin-top:28px}.sig{flex:1;text-align:center;font-size:14.5px;padding-top:36px}
 .sig .ln{border-top:1px dotted #7d95a8;margin-bottom:5px}
 .note{margin-top:14px;font-size:14.5px;color:#334155}
 .gets{font-size:14px;color:#334155;margin-top:4px;line-height:1.6}
 .sec{margin-top:16px;font-weight:800;color:#0e3a5c}.sec span{font-weight:400;font-size:14px;color:#475569}
 .opt td{vertical-align:middle}.optn{display:inline-block;background:#0e3a5c;color:#fff;border-radius:6px;padding:1px 9px;font-size:13.5px;font-weight:700;margin-bottom:4px}
 .oprice{font-size:21px;font-weight:800;color:#0e3a5c}
 .tick{display:inline-block;width:20px;height:20px;border:2px solid #0e3a5c;border-radius:4px}
 @media print{body{padding:0}@page{size:A4;margin:12mm}.noprint{display:none}}
 .noprint{text-align:center;margin-bottom:14px}
 .noprint button{padding:10px 22px;border:0;border-radius:9px;background:#0e3a5c;color:#fff;font-weight:700;font-size:14px;cursor:pointer;font-family:inherit}
</style></head><body>
<div class="noprint"><button onclick="window.print()">🖨️ พิมพ์ / บันทึกเป็น PDF</button></div>
<div class="hd">
  <div style="display:flex;align-items:center;gap:12px">${LOGO}
    <div><div class="bn">eSim<span>Payroll</span></div>
    <div style="font-size:14.5px;color:#475569">ระบบเงินเดือนออนไลน์สำหรับธุรกิจไทย<br>esimpayroll.com · hello@esimpayroll.com</div></div></div>
  <div class="r"><h1>ใบเสนอราคา</h1><div style="font-size:14px;color:#475569">Quotation</div>
    <div style="margin-top:5px">เลขที่ <b>${esc(q.quote_no||'(ยังไม่บันทึก)')}</b><br>วันที่ <b>${thDate(q.date)}</b><br>ยืนราคาถึง <b>${thDate(q.valid_until)}</b></div></div>
</div>
<div class="grid2">
  <div class="box"><b>ผู้เสนอราคา</b><br>${esc(s.name||'eSimPayroll')}${s.taxId?`<br>เลขประจำตัวผู้เสียภาษี ${esc(s.taxId)}`:''}${s.addr?`<br>${lines(s.addr)}`:''}
    <br>${esc(s.email||'hello@esimpayroll.com')}${s.phone?' · โทร '+esc(s.phone):''}
    ${s.line?`<br>LINE ${esc(s.line)}`:''}${s.contact?`<br>ผู้ติดต่อฝ่ายขาย <b>${esc(s.contact)}</b>`:''}</div>
  <div class="box"><b>เสนอราคาให้</b><br>${esc(c.name)}${c.taxId?`<br>เลขประจำตัวผู้เสียภาษี ${esc(c.taxId)}${c.branch?` (${esc(c.branch)})`:''}`:''}${c.addr?`<br>${lines(c.addr)}`:''}
    ${c.contact?`<br>เรียน ${esc(c.contact)}`:''}${c.email||c.phone?`<br>${esc(c.email||'')}${c.email&&c.phone?' · ':''}${esc(c.phone||'')}`:''}</div>
</div>
${opts.length?`<div class="sec">ตัวเลือกแพ็กเกจ — กรุณาเลือก ${opts.length>1?'1 ตัวเลือก':'รายการนี้'} <span>(ราคาแต่ละตัวเลือกแยกกัน ไม่นำมารวมกัน)</span></div>
<table class="opt">
  <thead><tr><th class="c" style="width:7%">เลือก</th><th style="width:68%">แพ็กเกจ / สิ่งที่ได้รับ</th><th class="tr" style="width:25%">ราคา</th></tr></thead>
  <tbody>${optRows}</tbody>
</table>`:''}
${base.length?`${opts.length?'<div class="sec">รายการอื่น</div>':''}<table>
  <thead><tr><th class="c" style="width:6%">ลำดับ</th><th style="width:50%">รายการ</th><th class="c" style="width:12%">จำนวน</th><th class="tr" style="width:15%">ราคาต่อหน่วย</th><th class="tr" style="width:17%">จำนวนเงิน (บาท)</th></tr></thead>
  <tbody>${rows}</tbody>
</table>
<table class="sum" style="width:46%;margin-left:auto;margin-top:6px">
  <tr><td>รวมเป็นเงิน</td><td class="tr">${fmt(sub)}</td></tr>
  ${disc?`<tr><td>ส่วนลด</td><td class="tr">-${fmt(disc)}</td></tr>`:''}
  <tr class="tot"><td>${totalLabel(q.items)}${opts.length?' ไม่รวมตัวเลือก':''}</td><td class="tr">${fmt(total)}</td></tr>
</table>
${words?`<div style="text-align:right;margin-top:6px">(${words})</div>`:''}`:''}
<div style="font-size:14px;color:#475569;margin-top:6px;text-align:right">ผู้ให้บริการไม่ได้จดทะเบียนภาษีมูลค่าเพิ่ม — ราคานี้ไม่มีภาษีมูลค่าเพิ่ม</div>
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

  window.ESIM_QUOTE={ TIERS, FIRM_TIERS, YEAR_MONTHS, planLine, totals, totalLabel, html, open };
})();
