/* ============================================================
   📄 ใบเสนอราคา (เฉพาะผู้ดูแลระบบ)
   เก็บในตาราง quotes (sql/31) · เลขที่ QT2569-0001 ออกโดย trigger ตอนบันทึก
   ตัวสร้างเอกสาร + ตารางราคา: /assets/quote.js (ESIM_QUOTE)
   ============================================================ */
const QUOTE_SELLER_KEY='quote_seller';
const QUOTE_NOTES='1. ราคานี้ยืนราคาถึงวันที่ระบุในใบเสนอราคา\n2. เริ่มใช้งานได้ทันทีหลังชำระค่าบริการ (พร้อมเพย์ หรือบัตรเครดิต/เดบิต) ระบบเปิดแพ็กเกจและออกใบเสร็จรับเงินให้อัตโนมัติ\n3. ทดลองใช้ฟรี 30 วันก่อนตัดสินใจได้ที่ esimpayroll.com';
const QST={issued:['ออกแล้ว','#e0f2fe'],accepted:['ลูกค้าตกลง','#dcfce7'],cancelled:['ยกเลิก','#fee2e2']};
function quoteSeller(){ try{ return JSON.parse(localStorage.getItem(QUOTE_SELLER_KEY)||'{}'); }catch(e){ return {}; } }
const qIsoDay=(d)=>new Date(d.getTime()+7*3600e3).toISOString().slice(0,10);   // วันที่ตามเวลาไทย
const qAddDays=(n)=>qIsoDay(new Date(Date.now()+n*864e5));

async function vQuotes(v){
  if(!window.ESIM_QUOTE){ v.appendChild(el('<div class="empty">โหลดตัวสร้างใบเสนอราคาไม่สำเร็จ ลองรีเฟรชหน้า</div>')); return; }
  v.appendChild(el(`<div class="toolbar"><h2 style="font-size:16px">📄 ใบเสนอราคา</h2>
    <button class="btn" id="qNew" style="margin-left:auto">➕ สร้างใบเสนอราคา</button>
    <button class="btn ghost sm" id="qRef">↻ รีเฟรช</button></div>`));
  const panel=el(`<div class="panel"><div class="pbody" style="padding:0"><div class="tbl-wrap" id="qTbl"><div class="empty">กำลังโหลด…</div></div></div></div>`);
  v.appendChild(panel);
  $('#qNew').onclick=()=>quoteEditor(v, null);
  $('#qRef').onclick=()=>render();
  const {data,error}=await sb.from('quotes').select('*').order('created_at',{ascending:false}).limit(300);
  const box=$('#qTbl'); if(!box) return;
  if(error){ box.innerHTML=`<div class="empty">โหลดไม่ได้: ${esc(error.message)}<br><span style="font-size:12px">(ยังไม่ได้รัน sql/31-supabase-quotes.sql ใน Supabase?)</span></div>`; return; }
  if(!data||!data.length){ box.innerHTML='<div class="empty">ยังไม่มีใบเสนอราคา — กด “สร้างใบเสนอราคา” ด้านบน</div>'; return; }
  const today=qIsoDay(new Date());
  box.innerHTML=`<table><thead><tr><th>เลขที่</th><th>วันที่</th><th>ลูกค้า</th><th class="num">ยอดรวม</th><th>ยืนราคาถึง</th><th>สถานะ</th><th></th></tr></thead><tbody>
    ${data.map((q,i)=>{ const exp=q.status==='issued'&&q.valid_until&&q.valid_until<today;
      const contact=q.doc&&q.doc.customer&&q.doc.customer.contact;
      return `<tr><td style="white-space:nowrap"><strong>${esc(q.quote_no||'-')}</strong>
        <button class="btn ghost sm" data-qn="${i}" title="แก้ไขเลขที่" style="padding:2px 7px;margin-left:4px">✏️</button></td><td>${esc(fmtDateTime(q.created_at))}</td>
      <td>${esc(q.customer)}${contact?`<br><span class="muted" style="font-size:12px">${esc(contact)}</span>`:''}</td>
      <td class="num"><strong>${money(q.total)}</strong></td>
      <td style="${exp?'color:#dc2626;font-weight:700':''}">${q.valid_until?fmtDate(q.valid_until):'-'}${exp?' (หมดอายุ)':''}</td>
      <td><select data-qs="${i}" style="padding:5px 8px;border:1px solid var(--line);border-radius:7px;background:${(QST[q.status]||QST.issued)[1]};color:#0f2438">
        ${Object.entries(QST).map(([k,[t]])=>`<option value="${k}" ${k===q.status?'selected':''}>${t}</option>`).join('')}</select></td>
      <td style="white-space:nowrap;text-align:right">
        <button class="btn ghost sm" data-qo="${i}" title="เปิด / พิมพ์">🖨️</button>
        <button class="btn ghost sm" data-qe="${i}" title="แก้ไขใบเสนอราคา (บันทึกทับ เลขที่เดิม)">📝</button>
        <button class="btn ghost sm" data-qc="${i}" title="คัดลอกเป็นใบใหม่">📋</button>
        <button class="btn ghost sm" data-qd="${i}" title="ลบ">🗑️</button></td></tr>`; }).join('')}
  </tbody></table>`;
  const docOf=q=>({ ...(q.doc||{}), quote_no:q.quote_no, date:q.created_at, valid_until:q.valid_until });
  box.querySelectorAll('[data-qo]').forEach(b=>b.onclick=()=>ESIM_QUOTE.open(docOf(data[+b.dataset.qo])));
  box.querySelectorAll('[data-qe]').forEach(b=>b.onclick=()=>{ const q=data[+b.dataset.qe]; quoteEditor(v, q.doc||{}, q); });
  box.querySelectorAll('[data-qc]').forEach(b=>b.onclick=()=>quoteEditor(v, data[+b.dataset.qc].doc||{}));
  box.querySelectorAll('[data-qs]').forEach(s=>s.onchange=async()=>{
    const q=data[+s.dataset.qs];
    const {error}=await sb.from('quotes').update({status:s.value}).eq('id',q.id);
    if(error){ toast('บันทึกสถานะไม่สำเร็จ: '+error.message); s.value=q.status; return; }
    q.status=s.value; s.style.background=(QST[s.value]||QST.issued)[1]; toast('อัปเดตสถานะแล้ว');
  });
  // แก้ไขเลขที่ใบเสนอราคา (เช่น ให้ตรงกับเลขในระบบเดิม) — เลขต้องไม่ซ้ำกับใบอื่น
  box.querySelectorAll('[data-qn]').forEach(b=>b.onclick=()=>{
    const q=data[+b.dataset.qn];
    openModal('แก้ไขเลขที่ใบเสนอราคา',`<div class="field"><label>เลขที่ใบเสนอราคา</label>
        <input id="qnInp" value="${esc(q.quote_no||'')}" maxlength="40" style="font-weight:700;font-size:16px"></div>
      <p class="muted" style="font-size:12.5px;margin:8px 0 0">เลขต้องไม่ซ้ำกับใบอื่น · ใบใหม่ถัดไปยังออกเลขต่อจากลำดับอัตโนมัติเหมือนเดิม</p>`,
      [['ยกเลิก','ghost',closeModal],['บันทึก','',async()=>{
        const no=($('#qnInp').value||'').trim();
        if(!no){ toast('กรุณาใส่เลขที่'); return; }
        if(no===q.quote_no){ closeModal(); return; }
        const {error}=await sb.from('quotes').update({quote_no:no}).eq('id',q.id);
        if(error){ toast(/duplicate|unique/i.test(error.message)?'เลขที่ '+no+' มีอยู่แล้ว — ใช้เลขอื่น':'บันทึกไม่สำเร็จ: '+error.message); return; }
        closeModal(); toast('เปลี่ยนเลขที่เป็น '+no+' แล้ว'); render();
      }]]);
    const inp=$('#qnInp'); if(inp){ inp.focus(); inp.select(); }
  });
  box.querySelectorAll('[data-qd]').forEach(b=>b.onclick=()=>{
    const q=data[+b.dataset.qd];
    openModal('ลบใบเสนอราคา',`<p>ลบ <b>${esc(q.quote_no)}</b> ของ ${esc(q.customer)} ใช่ไหม? เลขที่นี้จะไม่ถูกนำกลับมาใช้อีก</p>`,
      [['ยกเลิก','ghost',closeModal],['ลบ','danger',async()=>{ closeModal();
        const {error}=await sb.from('quotes').delete().eq('id',q.id);
        if(error){ toast('ลบไม่สำเร็จ: '+error.message); return; } toast('ลบแล้ว'); render(); }]]);
  });
}

/* ฟอร์มสร้างใบเสนอราคา — base = ข้อมูลใบเดิม (กรณีคัดลอก) */
/* ฟอร์มใบเสนอราคา — base = ข้อมูลในใบ (คัดลอก/แก้ไข) · editing = แถวในตาราง quotes (โหมดแก้ไขใบเดิม) */
function quoteEditor(v, base, editing){
  const copying=!!base && !editing;
  base=base||{};
  const S={name:'eSimPayroll', email:'hello@esimpayroll.com', line:'@esimpayroll', ...quoteSeller(), ...(base.seller||{})};
  const C={...(base.customer||{})};
  const items=(base.items||[]).map(x=>({...x}));
  v.innerHTML='';
  const f=(id,label,val)=>`<div class="field"><label>${label}</label><input id="${id}" value="${esc(val??'')}"></div>`;
  const ta=(id,label,val,rows=2,full=true)=>`<div class="field"${full?' style="grid-column:1/-1"':''}><label>${label}</label><textarea id="${id}" rows="${rows}">${esc(val??'')}</textarea></div>`;
  const cell='width:100%;padding:6px 8px;border:1px solid var(--line);border-radius:7px;font-family:inherit';
  v.appendChild(el(`<div>
    <div class="toolbar"><h2 style="font-size:16px">📄 ${editing?'แก้ไขใบเสนอราคา '+esc(editing.quote_no||''):copying?'คัดลอกเป็นใบเสนอราคาใหม่':'สร้างใบเสนอราคา'}</h2>
      <button class="btn ghost sm" id="qBack" style="margin-left:auto">← กลับไปรายการ</button></div>
    <div class="panel"><div class="phead"><h2>ลูกค้า</h2></div><div class="pbody"><div class="grid2">
      ${f('qcName','ชื่อบริษัท / ลูกค้า *',C.name)}${f('qcContact','ผู้ติดต่อ (เรียน)',C.contact)}
      ${f('qcTax','เลขประจำตัวผู้เสียภาษี',C.taxId)}${f('qcBranch','สำนักงานใหญ่ / สาขา',C.branch)}
      ${ta('qcAddr','ที่อยู่',C.addr)}
      ${f('qcEmail','อีเมล',C.email)}${f('qcPhone','โทรศัพท์',C.phone)}
    </div></div></div>
    <div class="panel"><div class="phead"><h2>รายการ</h2></div><div class="pbody">
      <div style="background:var(--chip);border-radius:10px;padding:12px;margin-bottom:12px">
        <div style="font-weight:700;margin-bottom:8px">➕ เพิ่มแพ็กเกจจากตารางราคา</div>
        <div class="grid3" style="grid-template-columns:repeat(auto-fit,minmax(130px,1fr))">
          <div class="field"><label>ประเภทบัญชี</label><select id="qpEd"><option value="single">บริษัทเดียว</option><option value="firm">สำนักงานบัญชี</option></select></div>
          <div class="field"><label id="qpCntL">จำนวนพนักงาน</label><input id="qpCnt" type="number" min="1" value="50"></div>
          <div class="field"><label>ระดับ</label><select id="qpPt"><option value="standard">มาตรฐาน</option><option value="premium">พรีเมียม</option></select></div>
          <div class="field"><label>รอบชำระ</label><select id="qpCy"><option value="yearly">รายปี</option><option value="monthly">รายเดือน</option></select></div>
          <div class="field"><label id="qpPerL">จำนวน (ปี)</label><input id="qpPer" type="number" min="1" value="1"></div>
        </div>
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:4px">
          <button class="btn sm" id="qpAdd">➕ เพิ่มลงรายการ</button><button class="btn ghost sm" id="qpOpt" title="ให้ลูกค้าเลือก 1 แพ็กเกจ ราคาไม่นำมารวมกัน">⚖️ เพิ่มมาตรฐาน + พรีเมียมเป็นตัวเลือก</button><span class="muted" id="qpHint" style="font-size:12.5px"></span></div>
      </div>
      <div class="tbl-wrap"><table><thead><tr><th style="width:7%" title="ติ๊ก = ให้ลูกค้าเลือก ไม่รวมยอด">ตัวเลือก</th><th style="width:41%">รายการ</th><th style="width:10%">จำนวน</th><th style="width:10%">หน่วย</th><th class="num" style="width:15%">ราคาต่อหน่วย</th><th class="num" style="width:14%">จำนวนเงิน</th><th></th></tr></thead>
        <tbody id="qItems"></tbody></table></div>
      <button class="btn ghost sm" id="qAddRow" style="margin-top:8px">➕ เพิ่มรายการเอง</button>
      <div class="grid3" style="margin-top:14px">
        ${f('qDisc','ส่วนลด (บาท)',base.discount||'')}
        <div class="field"><label>ยืนราคาถึง</label><input id="qValid" type="date" value="${esc(editing&&editing.valid_until?editing.valid_until:qAddDays(30))}"></div>
        <div class="field"><label>ยอดรวมทั้งสิ้น (บาท)</label><div id="qTotal" style="font-size:22px;font-weight:800;color:var(--brand);padding-top:4px">0</div></div>
      </div>
      <div class="grid2">${ta('qNotes','เงื่อนไข / หมายเหตุ',base.notes!=null?base.notes:QUOTE_NOTES,4)}</div>
    </div></div>
    <div class="panel"><div class="phead"><h2>ผู้เสนอราคา <span class="muted" style="font-size:12px;font-weight:400">(จำไว้ในเครื่องนี้ ใช้กับใบถัดไป)</span></h2></div><div class="pbody"><div class="grid2">
      ${f('qsName','ชื่อผู้ขาย / บริษัท',S.name)}${f('qsTax','เลขประจำตัวผู้เสียภาษี',S.taxId)}
      ${ta('qsAddr','ที่อยู่',S.addr)}
      ${f('qsEmail','อีเมล',S.email)}${f('qsPhone','โทรศัพท์',S.phone)}${f('qsLine','LINE',S.line)}${f('qsContact','ผู้ติดต่อฝ่ายขาย (ชื่อ)',S.contact)}
    </div></div></div>
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin:6px 0 20px">
      <button class="btn" id="qSave">💾 ${editing?'บันทึกการแก้ไข':'บันทึกและพิมพ์'}</button>
      <button class="btn ghost" id="qPrev">👁️ ดูตัวอย่าง (ยังไม่บันทึก)</button>
    </div>
  </div>`));

  const val=id=>($('#'+id).value||'').trim();
  const sumUp=()=>{ const t=ESIM_QUOTE.totals(items.map(i=>({...i,price:+i.price||0})), +val('qDisc')||0);
    $('#qTotal').textContent=(t.options&&t.total===0&&!items.some(i=>!i.option))?`ตามตัวเลือก (${t.options} ตัวเลือก)`
      :money(t.total)+(t.disc?`  (ส่วนลด ${money(t.disc)})`:'')+(t.options?`  + ตัวเลือก ${t.options} รายการ (ไม่รวมยอด)`:''); };
  const drawItems=()=>{
    const tb=$('#qItems');
    tb.innerHTML=items.length?items.map((it,i)=>`<tr>
      <td style="text-align:center"><input type="checkbox" data-opt="${i}" ${it.option?'checked':''} title="ตัวเลือก — ไม่รวมยอด"></td>
      <td><textarea data-k="desc" data-i="${i}" rows="${Math.min(7,String(it.desc||'').split('\n').length+1)}" style="${cell}">${esc(it.desc)}</textarea></td>
      <td><input data-k="qty" data-i="${i}" type="number" min="0" step="any" value="${esc(it.qty)}" style="${cell}"></td>
      <td><input data-k="unit" data-i="${i}" value="${esc(it.unit||'')}" style="${cell}"></td>
      <td><input data-k="price" data-i="${i}" type="number" min="0" step="any" value="${it.price==null?'':esc(it.price)}" placeholder="กรอกราคา" style="${cell};text-align:right;${it.price==null?'border-color:#f59e0b':''}"></td>
      <td class="num" data-amt="${i}">${money((+it.qty||0)*(+it.price||0))}</td>
      <td><button class="btn ghost sm" data-rm="${i}" title="ลบรายการ">✕</button></td></tr>`).join('')
      :'<tr><td colspan="7" class="empty">ยังไม่มีรายการ — เพิ่มแพ็กเกจด้านบน หรือกด “เพิ่มรายการเอง”</td></tr>';
    tb.querySelectorAll('[data-k]').forEach(inp=>inp.oninput=()=>{
      const i=+inp.dataset.i, it=items[i], k=inp.dataset.k;
      it[k]=(k==='qty'||k==='price')?(inp.value===''?null:+inp.value):inp.value;
      const a=tb.querySelector(`[data-amt="${i}"]`); if(a) a.textContent=money((+it.qty||0)*(+it.price||0));
      if(k==='price') inp.style.borderColor=inp.value===''?'#f59e0b':'';
      sumUp();
    });
    tb.querySelectorAll('[data-opt]').forEach(c=>c.onchange=()=>{ items[+c.dataset.opt].option=c.checked; sumUp(); });
    tb.querySelectorAll('[data-rm]').forEach(b=>b.onclick=()=>{ items.splice(+b.dataset.rm,1); drawItems(); });
    sumUp();
  };
  $('#qDisc').oninput=sumUp;

  const pkgOpts=()=>({ edition:$('#qpEd').value, count:+$('#qpCnt').value||1, ptype:$('#qpPt').value, cycle:$('#qpCy').value, periods:+$('#qpPer').value||1 });
  const hint=()=>{
    const firm=$('#qpEd').value==='firm';
    $('#qpCntL').textContent=firm?'จำนวนบริษัทลูกค้า':'จำนวนพนักงาน';
    $('#qpPt').disabled=firm;
    $('#qpPerL').textContent=$('#qpCy').value==='yearly'?'จำนวน (ปี)':'จำนวน (เดือน)';
    const l=ESIM_QUOTE.planLine(pkgOpts());
    $('#qpHint').textContent=l.price==null?'⚠️ เกินตารางราคา — เพิ่มลงรายการแล้วกรอกราคาเอง'
      :`${money(l.price)} บาท/${l.unit} × ${l.qty} = ${money(l.price*l.qty)} บาท`;
  };
  ['qpEd','qpCnt','qpPt','qpCy','qpPer'].forEach(id=>{ $('#'+id).oninput=hint; $('#'+id).onchange=hint; });
  $('#qpAdd').onclick=()=>{ items.push(ESIM_QUOTE.planLine(pkgOpts())); drawItems(); };
  // มาตรฐานกับพรีเมียมเป็น "ตัวเลือก" ให้ลูกค้าเลือก 1 อย่าง — แสดงแยก ไม่บวกรวมกัน
  $('#qpOpt').onclick=()=>{ const o=pkgOpts();
    const kinds=o.edition==='firm'?['standard']:['standard','premium'];
    kinds.forEach(pt=>items.push({...ESIM_QUOTE.planLine({...o,ptype:pt}), option:true}));
    drawItems(); toast('เพิ่มเป็นตัวเลือกแล้ว — ราคาจะแสดงแยก ไม่นำมารวมกัน'); };
  $('#qAddRow').onclick=()=>{ items.push({desc:'',qty:1,unit:'รายการ',price:null}); drawItems(); };
  $('#qBack').onclick=()=>render();
  hint(); drawItems();
  rememberCustomers();

  /* จำลูกค้าเก่า: พิมพ์ชื่อบริษัทแล้วมีรายชื่อจากใบเสนอราคาที่เคยออกให้เลือก
     เลือกแล้วเติมผู้ติดต่อ เลขภาษี สาขา ที่อยู่ อีเมล โทร ให้อัตโนมัติ (ใช้ข้อมูลใบล่าสุดของลูกค้ารายนั้น) */
  async function rememberCustomers(){
    const {data}=await sb.from('quotes').select('doc,created_at').order('created_at',{ascending:false}).limit(500);
    const known=new Map();
    (data||[]).forEach(q=>{ const c=q.doc&&q.doc.customer; const k=c&&String(c.name||'').trim().toLowerCase();
      if(k && !known.has(k)) known.set(k,c); });
    if(!known.size) return;
    const inp=$('#qcName'); if(!inp) return;
    const dl=document.createElement('datalist'); dl.id='qcNameList';
    dl.innerHTML=[...known.values()].map(c=>`<option value="${esc(c.name)}">${esc([c.contact,c.taxId].filter(Boolean).join(' · '))}</option>`).join('');
    inp.after(dl); inp.setAttribute('list','qcNameList'); inp.setAttribute('autocomplete','off');
    inp.placeholder='พิมพ์ชื่อ หรือเลือกลูกค้าเดิมจากรายการ';
    const fill=()=>{
      const c=known.get(inp.value.trim().toLowerCase()); if(!c) return;
      const set={qcContact:c.contact,qcTax:c.taxId,qcBranch:c.branch,qcAddr:c.addr,qcEmail:c.email,qcPhone:c.phone};
      Object.entries(set).forEach(([id,v])=>{ const e=$('#'+id); if(e) e.value=v||''; });
      toast('เติมข้อมูลลูกค้าเดิมให้แล้ว');
    };
    inp.addEventListener('change',fill);
  }

  const collect=()=>{
    const seller={name:val('qsName'),taxId:val('qsTax'),addr:val('qsAddr'),email:val('qsEmail'),phone:val('qsPhone'),contact:val('qsContact'),line:val('qsLine')};
    try{ localStorage.setItem(QUOTE_SELLER_KEY, JSON.stringify(seller)); }catch(e){}
    return { seller,
      customer:{name:val('qcName'),contact:val('qcContact'),taxId:val('qcTax'),branch:val('qcBranch'),addr:val('qcAddr'),email:val('qcEmail'),phone:val('qcPhone')},
      items:items.map(i=>({desc:String(i.desc||'').trim(),qty:+i.qty||0,unit:i.unit||'',price:+i.price||0,...(i.option?{option:true}:{})})),
      discount:+val('qDisc')||0, notes:$('#qNotes').value.trim(), valid_until:val('qValid') };
  };
  const ok=(d)=>{
    if(!d.customer.name){ toast('กรุณากรอกชื่อลูกค้า'); $('#qcName').focus(); return false; }
    if(!d.items.length){ toast('ยังไม่มีรายการ'); return false; }
    if(items.some(i=>i.price==null||i.price==='')){ toast('มีรายการที่ยังไม่ได้กรอกราคา'); return false; }
    if(d.items.some(i=>!i.desc)){ toast('มีรายการที่ยังไม่ได้ใส่คำอธิบาย'); return false; }
    if(d.items.some(i=>i.qty<=0)){ toast('จำนวนต้องมากกว่า 0'); return false; }
    if(d.items.filter(i=>i.option).length===1 && !d.items.some(i=>!i.option)){ toast('มีตัวเลือกเดียว — เอาติ๊ก "ตัวเลือก" ออก หรือเพิ่มตัวเลือกอื่น'); return false; }
    return true;
  };
  $('#qPrev').onclick=()=>{ const d=collect(); if(ok(d)) ESIM_QUOTE.open({...d, date:new Date()}); };
  $('#qSave').onclick=async()=>{
    const d=collect(); if(!ok(d)) return;
    const w=window.open('','_blank');                 // เปิดหน้าต่างทันทีตอนกด กันเบราว์เซอร์บล็อกป๊อปอัป
    if(w) w.document.write('<p style="font-family:sans-serif;padding:24px">⏳ กำลังบันทึก…</p>');
    $('#qSave').disabled=true;
    const t=ESIM_QUOTE.totals(d.items, d.discount);
    const fields={ customer:d.customer.name, total:t.total, valid_until:d.valid_until||null, doc:d };
    // แก้ไขใบเดิม → บันทึกทับ เลขที่และวันที่เดิม · ใบใหม่ → ระบบออกเลขถัดไปให้
    const {data,error}=await (editing
      ? sb.from('quotes').update(fields).eq('id',editing.id).select('quote_no,created_at').single()
      : sb.from('quotes').insert(fields).select('quote_no,created_at').single());
    $('#qSave').disabled=false;
    if(error){ if(w) w.close(); toast('บันทึกไม่สำเร็จ: '+error.message); return; }
    ESIM_QUOTE.open({...d, quote_no:data.quote_no, date:data.created_at}, w);
    toast((editing?'บันทึกการแก้ไข ':'บันทึกใบเสนอราคา ')+data.quote_no+' แล้ว'); render();
  };
}
