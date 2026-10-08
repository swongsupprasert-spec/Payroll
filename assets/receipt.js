/* ============================================================
   ใบเสร็จรับเงิน eSimPayroll — ใช้ร่วมกันทั้งหน้าราคา (หลังชำระ) และในโปรแกรม (ประวัติการชำระเงิน)
   ผู้ให้บริการยังไม่ได้จด VAT → ออกเป็น "ใบเสร็จรับเงิน" ไม่แยกภาษีมูลค่าเพิ่ม
   เลขที่ใบเสร็จมาจากฐานข้อมูล (payments.receipt_no ออกโดย trigger เรียงต่อกันรายปี)
   ใช้: ESIM_RECEIPT.open({ docNo, date, name, email, phone, btype, taxId, branch, addr,
                            plan, employees, cycle, amount, transRef, method, edition }, lang)
   ============================================================ */
(function(){
  const TX={
    dTitle:['ใบเสร็จรับเงิน','Receipt'], dSub:['Receipt','ใบเสร็จรับเงิน'], dNo:['เลขที่','No.'], dDate:['วันที่','Date'],
    dSeller:['ผู้ให้บริการ / ผู้รับเงิน','Service provider / Payee'], dBuyer:['ผู้ชำระเงิน','Customer'],
    btJur:['นิติบุคคล','Company'], btIndiv:['บุคคลทั่วไป','Individual'], brHQ:['สำนักงานใหญ่','Head office'], brBr:['สาขา','Branch'],
    dTaxIdLbl:['เลขประจำตัวผู้เสียภาษี','Tax ID'],
    dItem:['รายการ','Description'], dQty:['จำนวน','Qty'], dCycle:['รอบชำระ','Cycle'], dAmt:['จำนวนเงิน (บาท)','Amount (THB)'],
    dService:['ค่าบริการระบบเงินเดือน eSimPayroll','eSimPayroll payroll service'], dPlanLbl:['แพ็กเกจ','Plan'],
    ppl:['คน','employees'], cos:['บริษัท','companies'],
    cyYear:['รายปี','Annual'], cyMonth:['รายเดือน','Monthly'],
    dSum:['รวมเป็นเงิน (บาท)','Total (THB)'], dWords:['จำนวนเงินตัวอักษร','Amount in words'],
    dNoVat:['ผู้ให้บริการไม่ได้จดทะเบียนภาษีมูลค่าเพิ่ม — ยอดนี้ไม่มีภาษีมูลค่าเพิ่ม','The provider is not VAT-registered — no VAT is included in this amount'],
    dPayCh:['ชำระผ่านช่องทาง','Paid via'],
    dPPay:['พร้อมเพย์ (Omise)','PromptPay (Omise)'], dCard:['บัตรเครดิต/เดบิต (Omise)','Credit/debit card (Omise)'],
    transRef:['เลขอ้างอิงรายการ','Transaction reference'],
    dPaid:['ได้รับชำระเงินครบถ้วนแล้ว','Payment received in full'],
    dNote:['* เอกสารนี้ออกโดยระบบอัตโนมัติเมื่อได้รับชำระเงิน ใช้เป็นหลักฐานการชำระเงินได้ · ขอสำเนาหรือแก้ไขชื่อผู้ชำระเงิน ติดต่อ hello@esimpayroll.com',
           '* Generated automatically on payment and valid as proof of payment · For copies or name corrections contact hello@esimpayroll.com'],
    dPrint:['🖨️ พิมพ์ / บันทึกเป็น PDF','🖨️ Print / Save as PDF'],
    dTagline:['ระบบเงินเดือนออนไลน์สำหรับธุรกิจไทย','Online payroll for Thai businesses'],
    popupBlocked:['เบราว์เซอร์บล็อกป๊อปอัป กรุณาอนุญาตป๊อปอัปแล้วลองอีกครั้ง','Pop-up blocked. Please allow pop-ups and try again.'],
  };

  /* อ่านจำนวนเงินเป็นตัวอักษรไทย เช่น 5,900 → ห้าพันเก้าร้อยบาทถ้วน */
  function bahtText(n){
    n=Math.round((+n||0)*100)/100;
    const bt=Math.floor(n), st=Math.round((n-bt)*100);
    const d=['ศูนย์','หนึ่ง','สอง','สาม','สี่','ห้า','หก','เจ็ด','แปด','เก้า'];
    const pos=['','สิบ','ร้อย','พัน','หมื่น','แสน'];
    const readInt=s=>{
      if(s==='0') return '';
      let out='';
      const L=s.length;
      for(let i=0;i<L;i++){
        const dg=+s[i], k=L-1-i, p=k%6;
        if(dg!==0){
          if(p===1&&dg===1) out+='สิบ';
          else if(p===1&&dg===2) out+='ยี่สิบ';
          else if(p===0&&dg===1&&out!=='') out+='เอ็ด';   // 11 สิบเอ็ด · 101 หนึ่งร้อยเอ็ด
          else out+=d[dg]+pos[p];
        }
        if(k%6===0&&k!==0) out+='ล้าน';
      }
      return out;
    };
    return (bt===0?'ศูนย์':readInt(String(bt)))+'บาท'+(st===0?'ถ้วน':readInt(String(st))+'สตางค์');
  }

  function html(o, lang){
    const L=k=>(TX[k]||[k,k])[lang?1:0];
    const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
    const fmt=n=>(+n||0).toLocaleString('th-TH',{minimumFractionDigits:2,maximumFractionDigits:2});
    const dt=o.date instanceof Date?o.date:new Date(o.date||Date.now());
    const bkk=new Date(dt.getTime()+7*3600e3);   // แสดงวันที่ตามเวลาไทยเสมอ
    const dstr=`${String(bkk.getUTCDate()).padStart(2,'0')}/${String(bkk.getUTCMonth()+1).padStart(2,'0')}/${bkk.getUTCFullYear()+(lang?0:543)}`;
    const jur=o.btype==='juristic';
    const yearly=o.cycle==='y'||o.cycle==='yearly';
    const qty=o.edition==='firm'?L('cos'):L('ppl');
    return `<!doctype html><html lang="${lang?'en':'th'}"><head><meta charset="utf-8">
<title>${esc(o.docNo)}</title>
<style>
 *{box-sizing:border-box;margin:0;padding:0}
 body{font-family:"Sarabun","TH Sarabun New",Tahoma,sans-serif;color:#0f2438;font-size:13px;line-height:1.55;padding:14mm}
 .hd{display:flex;align-items:flex-start;gap:14px;border-bottom:2px solid #0e3a5c;padding-bottom:12px;margin-bottom:16px}
 .bn{font-size:23px;font-weight:800}.bn span{color:#0e3a5c}
 .hd .r{margin-left:auto;text-align:right}
 .hd .r h1{font-size:19px;color:#0e3a5c}
 table{width:100%;border-collapse:collapse;margin-top:12px}
 th,td{border:1px solid #b9cddb;padding:8px 10px;text-align:left}
 th{background:#eaf6f1;font-size:12.5px}
 .tr{text-align:right}
 .box{border:1px solid #d7e5dd;border-radius:8px;padding:11px 13px;font-size:12.5px}
 .grid2{display:flex;gap:12px;margin-bottom:6px}.grid2>div{flex:1}
 .tot{background:#0e3a5c;color:#fff;font-weight:800}
 .paid{display:inline-block;margin-top:6px;border:2px solid #10b981;color:#0b8a63;border-radius:6px;padding:1px 9px;font-weight:800;font-size:12px}
 .note{margin-top:16px;font-size:11.5px;color:#5b7186;border-top:1px solid #e2e8f0;padding-top:9px}
 @media print{body{padding:0}@page{size:A4;margin:12mm}.noprint{display:none}}
 .noprint{text-align:center;margin-bottom:14px}
 .noprint button{padding:10px 22px;border:0;border-radius:9px;background:#0e3a5c;color:#fff;font-weight:700;font-size:14px;cursor:pointer;font-family:inherit}
</style></head><body>
<div class="noprint"><button onclick="window.print()">${L('dPrint')}</button></div>
<div class="hd">
  <div><div class="bn">eSim<span>Payroll</span></div>
    <div style="font-size:12px;color:#5b7186">${L('dTagline')}<br>esimpayroll.com · hello@esimpayroll.com</div></div>
  <div class="r"><h1>${L('dTitle')}</h1>
    <div style="font-size:11.5px;color:#5b7186">${L('dSub')}</div>
    <div style="margin-top:5px">${L('dNo')} <b>${esc(o.docNo)}</b><br>${L('dDate')} <b>${dstr}</b></div>
    <div class="paid">✓ ${L('dPaid')}</div></div>
</div>

<div class="grid2">
  <div class="box"><b>${L('dSeller')}</b><br>eSimPayroll<br>esimpayroll.com<br>hello@esimpayroll.com</div>
  <div class="box"><b>${L('dBuyer')} (${jur?L('btJur'):L('btIndiv')})</b><br>${esc(o.name)}
    ${jur&&o.taxId?`<br>${L('dTaxIdLbl')} ${esc(o.taxId)}${o.branch?` (${o.branch==='สาขา'?L('brBr'):L('brHQ')})`:''}`:''}
    ${o.addr?`<br>${esc(o.addr)}`:''}
    <br>${esc(o.email)}${o.phone?' · '+esc(o.phone):''}</div>
</div>

<table>
  <thead><tr><th style="width:50%">${L('dItem')}</th><th style="width:15%">${L('dQty')}</th><th style="width:15%">${L('dCycle')}</th><th class="tr" style="width:20%">${L('dAmt')}</th></tr></thead>
  <tbody>
    <tr><td>${L('dService')}<br><span style="font-size:11.5px;color:#5b7186">${L('dPlanLbl')} ${esc(o.plan)}</span></td>
        <td>${o.employees??''} ${qty}</td><td>${yearly?L('cyYear'):L('cyMonth')}</td>
        <td class="tr">${fmt(o.amount)}</td></tr>
    <tr class="tot"><td colspan="3" class="tr">${L('dSum')}</td><td class="tr">${fmt(o.amount)}</td></tr>
    <tr><td colspan="4">${L('dWords')} — <b>(${bahtText(o.amount)})</b></td></tr>
  </tbody>
</table>
<div style="font-size:11.5px;color:#5b7186;margin-top:6px">${L('dNoVat')}</div>

<div style="margin-top:14px">
  <div class="box"><b>${L('dPayCh')}</b> ${o.method==='card'?L('dCard'):L('dPPay')}
    ${o.transRef?`<br><span style="color:#5b7186">${L('transRef')} <b>${esc(o.transRef)}</b></span>`:''}</div>
</div>

<div class="note">${L('dNote')}</div>
<script>window.onload=function(){setTimeout(function(){window.print();},350)}<\/script>
</body></html>`;
  }

  // win = หน้าต่างที่เปิดไว้แล้วตอนผู้ใช้กด (ถ้าต้องรอโหลดข้อมูลก่อน — กันเบราว์เซอร์บล็อกป๊อปอัป)
  function open(o, lang, win){
    const w=win||window.open('','_blank');
    if(!w){ alert(TX.popupBlocked[lang?1:0]); return false; }
    w.document.open(); w.document.write(html(o, lang)); w.document.close();
    return true;
  }

  window.ESIM_RECEIPT={ open, html, bahtText };
})();
