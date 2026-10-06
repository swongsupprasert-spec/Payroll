/* app.html · เครื่องมือข้ามบริษัท + บริษัทลูกค้า (สำนักงานบัญชี) — ลำดับไฟล์มีผล (โหลดตามเลข) */
/* ============ เครื่องมือข้ามบริษัท (สำนักงานบัญชี) ============ */
/* คิดยอดของบริษัทอื่นโดยยืมฟังก์ชันคำนวณชุดเดิมทั้งหมด — สลับ DB ชั่วคราวแล้วคืนค่าเสมอ
   ทำแบบนี้เพื่อกันตัวเลขสองชุดเพี้ยนจากกัน ถ้าเขียนสูตรใหม่แยกไว้จะหลุดกันวันใดวันหนึ่ง */
function withDB(d, fn){
  const keep=DB;
  try{ DB=d; return fn(); }
  finally{ DB=keep; }
}
/* ดึงข้อมูลของทุกบริษัทมาไว้ในหน่วยความจำ (RLS คืนเฉพาะของเจ้าของอยู่แล้ว) */
async function loadAllStores(){
  const {data,error}=await sb.from('firm_stores').select('company_id,data');
  if(error) return {};
  const map={};
  (data||[]).forEach(r=>{ if(r.data && r.data.employees) map[r.company_id]=r.data; });
  return map;
}
/* ตั้งค่าที่ก๊อปข้ามบริษัทได้ — ไม่รวมข้อมูลบริษัท พนักงาน และเงินเดือน */
const COPY_KEYS=['ssoRate','ssoMaxBase','otDays','otHours','workDaysDefault',
                 'cutoffDay','workStart','workEnd','lateGrace','wfRateDefault','otMultWeekdays','advPct'];

/* ============ บริษัทลูกค้า (เฉพาะแบบสำนักงานบัญชี) ============ */
async function vCompanies(v){
  const room=coRoom(), lim=coLimit();
  const full = room<1;

  v.appendChild(el(`<div class="toolbar">
    <h2 style="font-size:16px">บริษัทลูกค้าที่ดูแล</h2>
    <span class="chip" style="background:${full?'#fee2e2':'#eaf6f1'};color:${full?'#dc2626':'#0f766e'};font-weight:700">
      ${full?'🔒 ':''}${countedCos().length}${lim!==null?' / '+lim:''} บริษัท</span>
    <button class="btn ghost sm" id="coCopy" style="margin-left:auto">⚙️ ก๊อปตั้งค่าข้ามบริษัท</button>
    <button class="btn ghost sm" id="coCsv">⬇️ สรุปยื่นภาษีทุกบริษัท</button>
    <button class="btn" id="addCo" ${full?'disabled style="opacity:.5;cursor:not-allowed"':''}>➕ เพิ่มบริษัท</button>
  </div>`));

  if(full) v.appendChild(el(`<div class="panel" style="border:2px solid #f59e0b;background:#fffbeb"><div class="pbody"
    style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">
    <span style="font-size:20px">🔒</span>
    <div><strong>เพิ่มบริษัทไม่ได้ — เต็มโควตาแพ็กเกจแล้ว</strong><br>
      <span class="muted" style="font-size:13px">${esc(coQuotaMsg())}<br>
      บริษัทที่เก็บเข้าคลังแล้ว<strong>ยังนับในโควตา</strong> — ถ้าเลิกดูแลถาวรแล้วให้กด 🗑️ ลบ เพื่อคืนโควตา</span></div>
    <a class="btn sm" href="/pricing" target="_blank" rel="noopener" style="margin-left:auto">อัปเกรดแพ็กเกจ</a>
  </div></div>`));

  if(!COMPANIES.length){
    v.appendChild(el(`<div class="panel"><div class="pbody empty" style="padding:40px 20px;text-align:center">
      <div style="font-size:15px;font-weight:700;margin-bottom:6px">ยังไม่มีบริษัทลูกค้า</div>
      <div class="muted" style="font-size:13.5px">กด “➕ เพิ่มบริษัท” เพื่อเริ่มต้น<br>
        แต่ละบริษัทมีข้อมูลพนักงานและเงินเดือนแยกจากกันโดยสิ้นเชิง</div></div></div>`));
  }else{
    const panel=el(`<div class="panel"><div class="pbody" style="padding:0">
      <div class="tbl-wrap" id="coTbl"><div class="empty">กำลังรวมข้อมูลทุกบริษัท…</div></div></div></div>`);
    v.appendChild(panel);
  }

  v.appendChild(el(`<div class="panel"><div class="pbody muted" style="font-size:13px;line-height:1.8">
    💡 ข้อมูลพนักงาน เงินเดือน และเอกสารของแต่ละบริษัทแยกจากกันสมบูรณ์ สลับบริษัทได้จากช่องด้านบนของแถบเมนูซ้าย ·
    แพ็กเกจสำนักงานบัญชี<strong>ไม่จำกัดจำนวนพนักงาน</strong>ในแต่ละบริษัท<br>
    📦 <strong>เก็บเข้าคลัง</strong> = ซ่อนจากตัวสลับบริษัท ข้อมูลยังอยู่ครบ ออกเอกสารย้อนหลังได้
    แต่<strong>ยังนับในโควตา</strong><br>
    🗑️ <strong>ลบ</strong> = คืนโควตา 1 บริษัท แต่ข้อมูลทั้งหมดของบริษัทนั้นหายถาวร กู้คืนไม่ได้</div></div>`));

  const add=$('#addCo'); if(add && !full) add.onclick=()=>coForm(null);
  if(!COMPANIES.length) return;

  /* ---- ตารางเดียว: ตัวเลขของงวด + ปุ่มจัดการ อยู่ในแถวเดียวกัน ---- */
  const stores=await loadAllStores();
  const box=$('#coTbl'); if(!box) return;
  let gEmp=0, gGross=0, gTax=0, gNet=0, done=0;
  const nActive=activeCos().length;

  const rows=COMPANIES.map(co=>{
    const d=stores[co.id];
    const t=d ? withDB(d, ()=>periodTotals(PERIOD)) : null;
    const hasData=d ? withDB(d, ()=>periodHasData(PERIOD)) : false;
    if(t && !co.archived){ gEmp+=t.count; gGross+=t.gross; gTax+=t.tax; gNet+=t.net; if(hasData) done++; }

    const name=`<strong>${esc(co.name)}</strong>
      ${co.id===CUR_CO?' <span class="chip" style="background:#dcfce7;color:#16a34a">กำลังทำ</span>':''}
      ${co.archived?' <span class="chip" style="background:#e2e8f0;color:#64748b">เก็บเข้าคลัง</span>':''}
      <br><span class="muted" style="font-size:11.5px">${esc(co.tax_id||'ไม่ได้ระบุเลขผู้เสียภาษี')}${co.branch?' · '+esc(co.branch):''}</span>`;

    const figs = t
      ? `<td class="num">${num(t.count)}</td><td class="num">${money(t.gross)}</td>
         <td class="num">${money(t.tax)}</td><td class="num"><strong>${money(t.net)}</strong></td>
         <td class="num">${hasData?'<span class="chip" style="background:#dcfce7;color:#16a34a">ทำแล้ว</span>'
                                  :'<span class="chip" style="background:#fef3c7;color:#b45309">ยังไม่ได้ทำ</span>'}</td>`
      : `<td colspan="5" class="muted" style="text-align:center">ยังไม่ได้ใส่ข้อมูลพนักงาน</td>`;

    return `<tr${co.archived?' style="opacity:.55"':''}>
      <td>${name}</td>${figs}
      <td class="num" style="white-space:nowrap">
        ${co.archived
          ? `<button class="btn ghost sm" data-unarch="${co.id}">↩️ นำกลับมา</button>`
          : `<button class="btn ghost sm" data-open="${co.id}" ${co.id===CUR_CO?'disabled style="opacity:.45"':''}>เปิดทำงาน</button>
             <button class="btn ghost sm" data-edit="${co.id}" title="แก้ไขข้อมูลบริษัท">✏️</button>
             <button class="btn ghost sm" data-arch="${co.id}" title="เก็บเข้าคลัง">📦</button>`}
        <button class="btn ghost sm" data-del="${co.id}" title="ลบถาวร — คืนโควตา"
          style="color:#dc2626;border-color:#fecaca">🗑️</button>
      </td></tr>`;
  }).join('');

  box.innerHTML=`<table>
    <thead><tr><th>บริษัท</th><th class="num">พนักงาน</th><th class="num">รายได้รวม</th>
      <th class="num">ภาษีหัก</th><th class="num">จ่ายสุทธิ</th>
      <th class="num">งวด ${esc(periodLabel(PERIOD))}</th><th class="num">จัดการ</th></tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr style="background:#f8fafc;font-weight:800">
      <td>รวม ${nActive} บริษัทที่ดูแลอยู่</td>
      <td class="num">${num(gEmp)}</td><td class="num">${money(gGross)}</td>
      <td class="num">${money(gTax)}</td><td class="num">${money(gNet)}</td>
      <td class="num">ทำแล้ว ${done}/${nActive}</td><td></td></tr></tfoot></table>`;

  box.querySelectorAll('[data-open]').forEach(b=>b.onclick=async()=>{
    await switchCompany(b.dataset.open); PAGE='dashboard'; savePage(PAGE); renderNav(); render();
  });
  box.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>coForm(COMPANIES.find(x=>x.id===b.dataset.edit)));
  box.querySelectorAll('[data-arch]').forEach(b=>b.onclick=()=>setArchived(b.dataset.arch,true));
  box.querySelectorAll('[data-unarch]').forEach(b=>b.onclick=()=>setArchived(b.dataset.unarch,false));
  box.querySelectorAll('[data-del]').forEach(b=>b.onclick=()=>deleteCompany(b.dataset.del));

  /* ---- ส่งออกสรุปสำหรับยื่นภาษีทุกบริษัท ---- */
  $('#coCsv').onclick=()=>{
    const head=['บริษัท','เลขผู้เสียภาษี','สาขา','งวด','จำนวนพนักงาน','รายได้รวม','ภาษีหัก ณ ที่จ่าย','ประกันสังคม(ลูกจ้าง)','จ่ายสุทธิ'];
    const lines=[head.join(',')];
    activeCos().forEach(co=>{
      const d=stores[co.id]; if(!d) return;
      const t=withDB(d, ()=>periodTotals(PERIOD));
      const sso=withDB(d, ()=>DB.employees.reduce((s,e)=>s+Number(readRec(PERIOD,e.id).ded.sso||0),0));
      lines.push([co.name, co.tax_id||'', co.branch||'', PERIOD, t.count,
        t.gross.toFixed(2), t.tax.toFixed(2), sso.toFixed(2), t.net.toFixed(2)]
        .map(x=>`"${String(x).replace(/"/g,'""')}"`).join(','));
    });
    downloadFile(`สรุปยื่นภาษีทุกบริษัท-${PERIOD}.csv`, '\ufeff'+lines.join('\r\n'), 'text/csv;charset=utf-8');
    toast('ส่งออกสรุป '+activeCos().length+' บริษัทแล้ว');
  };

  /* ---- ก๊อปตั้งค่าจากบริษัทหนึ่งไปอีกหลายบริษัท ---- */
  $('#coCopy').onclick=()=>{
    const list=activeCos();
    if(list.length<2){ toast('ต้องมีอย่างน้อย 2 บริษัทถึงจะก๊อปได้'); return; }
    openModal('ก๊อปตั้งค่าข้ามบริษัท', `
      <div class="field"><label>ก๊อปจากบริษัท</label>
        <select id="cp_from">${list.map(c=>`<option value="${esc(c.id)}" ${c.id===CUR_CO?'selected':''}>${esc(c.name)}</option>`).join('')}</select></div>
      <div class="field"><label>ไปยังบริษัท (เลือกได้หลายบริษัท)</label>
        <div id="cp_to" style="max-height:200px;overflow:auto;border:1px solid var(--line);border-radius:10px;padding:8px">
          ${list.map(c=>`<label style="display:flex;align-items:center;gap:8px;padding:5px 4px;cursor:pointer">
            <input type="checkbox" value="${esc(c.id)}"> <span>${esc(c.name)}</span></label>`).join('')}
        </div></div>
      <div class="muted" style="font-size:12.5px;line-height:1.7">
        ก๊อปเฉพาะ<strong>ค่าตั้งต้นการคำนวณ</strong> — อัตราประกันสังคม ฐานคำนวณ OT วันทำงานต่อเดือน
        วันตัดรอบ เวลาทำงาน และอัตรากองทุนสงเคราะห์<br>
        <strong>ไม่แตะ</strong>ข้อมูลบริษัท ข้อมูลพนักงาน และเงินเดือนที่ทำไปแล้ว</div>`,
      [['ยกเลิก','ghost',closeModal],['ก๊อป','',async()=>{
        const from=$('#cp_from').value;
        const targets=[...document.querySelectorAll('#cp_to input:checked')].map(i=>i.value).filter(id=>id!==from);
        if(!targets.length){ toast('ยังไม่ได้เลือกบริษัทปลายทาง'); return; }
        const src=stores[from];
        if(!src){ toast('บริษัทต้นทางยังไม่มีข้อมูล'); return; }
        closeModal();
        let ok=0;
        for(const id of targets){
          const cur=stores[id] || structuredClone(DEFAULT);
          COPY_KEYS.forEach(k=>{ if(src[k]!==undefined) cur[k]=structuredClone(src[k]); });
          const {error}=await sb.from('firm_stores')
            .upsert({company_id:id, data:cur, updated_at:new Date().toISOString()});
          if(!error){ ok++; stores[id]=cur;
            if(id===CUR_CO){ COPY_KEYS.forEach(k=>{ if(src[k]!==undefined) DB[k]=structuredClone(src[k]); });
                             localStorage.setItem(LS_KEY, JSON.stringify(DB)); } }
        }
        toast(`ก๊อปตั้งค่าไปแล้ว ${ok}/${targets.length} บริษัท`);
        render();
      }]]);
  };
}
function coForm(co){
  const isNew=!co;
  openModal(isNew?'เพิ่มบริษัทลูกค้า':'แก้ไขข้อมูลบริษัท', `
    <div class="field"><label>ชื่อบริษัท *</label>
      <input id="co_name" value="${esc(co?co.name:'')}" placeholder="บริษัท ตัวอย่าง จำกัด"></div>
    <div class="field"><label>เลขประจำตัวผู้เสียภาษี *</label>
      <input id="co_tax" inputmode="numeric" maxlength="13" value="${esc(co?(co.tax_id||''):'')}" placeholder="13 หลัก"></div>
    <div class="field"><label>สาขา</label>
      <input id="co_branch" value="${esc(co?(co.branch||''):'')}" placeholder="สำนักงานใหญ่"></div>
    <div id="co_err" style="font-size:13px;color:#dc2626;min-height:18px;margin-bottom:4px"></div>
    ${isNew?'<div class="muted" style="font-size:12.5px">เพิ่มแล้วระบบจะเปิดบริษัทนี้ให้ทันที เริ่มจากข้อมูลว่าง</div>':''}`,
    [['ยกเลิก','ghost',closeModal],['บันทึก','',async()=>{
      const name=$('#co_name').value.trim();
      const tax=$('#co_tax').value.replace(/\D/g,'');
      const branch=$('#co_branch').value.trim();
      const err=$('#co_err');
      const bad=(msg,el)=>{ if(err) err.textContent=msg; else toast(msg);
        if(el){ el.style.borderColor='#dc2626'; el.focus(); } };
      if(!name) return bad('กรุณากรอกชื่อบริษัท', $('#co_name'));
      if(!tax)  return bad('กรุณากรอกเลขประจำตัวผู้เสียภาษี', $('#co_tax'));
      if(tax.length!==13) return bad(`เลขประจำตัวผู้เสียภาษีต้องมี 13 หลัก (ตอนนี้ ${tax.length} หลัก)`, $('#co_tax'));
      // กันเพิ่มบริษัทเดียวกันซ้ำสองรอบ
      const dup=COMPANIES.find(x=>x.id!==(co&&co.id) && String(x.tax_id||'')===tax);
      if(dup) return bad(`เลขนี้ซ้ำกับ "${dup.name}" ที่มีอยู่แล้ว`, $('#co_tax'));
      closeModal();
      if(isNew){
        const created=await createCompany(name, tax, branch);
        if(!created) return;
        await openCompany(created.id);
        PAGE='dashboard'; savePage(PAGE); renderNav(); render();
        toast('เพิ่ม '+name+' แล้ว');
      }else{
        const {error}=await sb.from('firm_companies')
          .update({name, tax_id:tax||null, branch:branch||null}).eq('id',co.id);
        if(error){ toast('บันทึกไม่สำเร็จ: '+error.message); return; }
        Object.assign(co,{name, tax_id:tax||null, branch:branch||null});
        renderNav(); render(); toast('บันทึกแล้ว');
      }
    }]]);
  // ช่องเลขผู้เสียภาษี — พิมพ์ได้เฉพาะตัวเลข ไม่เกิน 13 หลัก และบอกสถานะระหว่างพิมพ์
  const tf=$('#co_tax'), ef=$('#co_err');
  if(tf) tf.oninput=()=>{
    tf.value=tf.value.replace(/\D/g,'').slice(0,13);
    tf.style.borderColor='';
    if(ef) ef.textContent = (tf.value.length && tf.value.length<13)
      ? `กรอกแล้ว ${tf.value.length}/13 หลัก` : '';
    if(ef) ef.style.color = tf.value.length===13 ? '#059669' : '#dc2626';
  };
  const nf=$('#co_name'); if(nf) nf.oninput=()=>{ nf.style.borderColor=''; if(ef) ef.textContent=''; };
}
/* ลบบริษัทถาวร — ทางเดียวที่คืนโควตา และลบข้อมูลเงินเดือนทิ้งด้วย
   ให้พิมพ์ชื่อบริษัทยืนยัน เพราะกู้คืนไม่ได้ */
async function deleteCompany(id){
  const co=COMPANIES.find(x=>x.id===id); if(!co) return;
  openModal('🗑️ ลบบริษัทถาวร', `
    <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:11px;padding:13px 15px;margin-bottom:14px">
      <div style="font-weight:800;color:#b91c1c;margin-bottom:6px">การลบนี้กู้คืนไม่ได้</div>
      <div style="font-size:13.5px;color:#7f1d1d;line-height:1.75">
        ข้อมูลของ <strong>${esc(co.name)}</strong> จะถูกลบทิ้งทั้งหมด ได้แก่<br>
        • ข้อมูลพนักงานทุกคน<br>
        • เงินเดือนทุกงวดที่ทำไว้<br>
        • ประวัติสำหรับออก 50 ทวิ / ภ.ง.ด.1 / สปส.1-10 ย้อนหลัง<br><br>
        ถ้าแค่เลิกดูแลแต่อาจต้องออกเอกสารย้อนหลัง ให้ใช้ <strong>📦 เก็บเข้าคลัง</strong> แทน
        (ข้อมูลยังอยู่ครบ แต่ยังนับโควตา)
      </div>
    </div>
    <div class="field"><label>พิมพ์ชื่อบริษัทเพื่อยืนยัน</label>
      <input id="del_name" placeholder="${esc(co.name)}" autocomplete="off"></div>
    <div class="muted" style="font-size:12.5px">ลบแล้วจะได้โควตาคืน 1 บริษัท</div>`,
    [['ยกเลิก','ghost',closeModal],['ลบถาวร','',async()=>{
      if($('#del_name').value.trim()!==co.name){
        toast('ชื่อบริษัทไม่ตรง — ยังไม่ได้ลบ');
        const f=$('#del_name'); if(f){ f.style.borderColor='#dc2626'; f.focus(); }
        return;
      }
      closeModal();
      const {error}=await sb.from('firm_companies').delete().eq('id',id);
      if(error){ toast('ลบไม่สำเร็จ: '+error.message); return; }
      COMPANIES=COMPANIES.filter(x=>x.id!==id);
      try{ localStorage.removeItem('payroll_co_'+id); }catch(e){}   // ล้างข้อมูลที่ค้างในเครื่องด้วย
      if(id===CUR_CO){
        const next=activeCos()[0];
        await openCompany(next?next.id:null);
      }
      try{ const {data:q}=await sb.rpc('my_company_quota'); if(q&&q[0]) CO_QUOTA=q[0].max_companies; }catch(e){}
      renderNav(); render();
      toast('ลบ '+co.name+' แล้ว · คืนโควตา 1 บริษัท');
    }]]);
}
/* เก็บเข้าคลัง / นำกลับมาดูแล — ไม่ลบข้อมูล ยังออกเอกสารย้อนหลังได้ แต่ยังนับโควตา */
async function setArchived(id, on){
  const co=COMPANIES.find(x=>x.id===id); if(!co) return;
  if(on && !confirm(`เก็บ "${co.name}" เข้าคลัง?\n\nข้อมูลทั้งหมดยังอยู่ครบ นำกลับมาดูแลได้ทุกเมื่อ\n\nหมายเหตุ: ยังนับในโควตาบริษัทอยู่ — ถ้าต้องการคืนโควตาต้องกดลบถาวร`)) return;
  const {error}=await sb.from('firm_companies').update({archived:on}).eq('id',id);
  if(error){
    toast(isCoLimitError(error) ? ('🔒 '+(coQuotaMsg()||'เกินจำนวนบริษัทที่แพ็กเกจรองรับ'))
                                : ('ไม่สำเร็จ: '+error.message));
    return;
  }
  co.archived=on;
  // ถ้าเก็บบริษัทที่กำลังเปิดอยู่ ให้สลับไปบริษัทอื่น
  if(on && id===CUR_CO){
    const next=activeCos()[0];
    await openCompany(next?next.id:null);
  }
  renderNav(); render();
  toast(on?'เก็บเข้าคลังแล้ว':'นำกลับมาดูแลแล้ว');
}

