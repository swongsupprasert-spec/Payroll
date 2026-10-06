/* app.html · คำสั่งซื้อ/ต่ออายุ, แจ้งปัญหา (แอดมิน) — ลำดับไฟล์มีผล (โหลดตามเลข) */
/* ============ คำสั่งซื้อ / ต่ออายุ (แอดมินเท่านั้น) ============ */
async function vOrders(v){
  v.appendChild(el(`<div class="toolbar"><h2 style="font-size:16px">🧾 คำสั่งซื้อ / ต่ออายุแพ็กเกจ</h2>
    <button class="btn ghost sm" style="margin-left:auto" id="oRef">↻ รีเฟรช</button></div>`));
  const panel=el(`<div class="panel"><div class="pbody" style="padding:0"><div class="tbl-wrap" id="ordTbl"><div class="empty">กำลังโหลด…</div></div></div></div>`);
  v.appendChild(panel);
  $('#oRef').onclick=()=>render();
  const {data,error}=await sb.from('orders').select('*').order('created_at',{ascending:false});
  const box=$('#ordTbl'); if(!box) return;
  if(error){ box.innerHTML=`<div class="empty">โหลดไม่ได้: ${esc(error.message)}<br><span style="font-size:12px">(ยังไม่ได้สร้างตาราง orders ใน Supabase?)</span></div>`; return; }
  if(!data||!data.length){ box.innerHTML='<div class="empty">ยังไม่มีคำสั่งซื้อ</div>'; return; }
  const sc={pending:'#fef3c7;color:#b45309',paid:'#dcfce7;color:#16a34a',cancelled:'#fee2e2;color:#dc2626'};
  const st={pending:'รอชำระ',paid:'ชำระแล้ว',cancelled:'ยกเลิก'};
  const sum=data.filter(o=>o.status==='paid').reduce((s,o)=>s+Number(o.amount||0),0);
  const pend=data.filter(o=>o.status==='pending').length;
  v.insertBefore(el(`<div class="cards">
    <div class="kpi b1"><div class="lab">🧾 คำสั่งซื้อทั้งหมด</div><div class="val">${num(data.length)}</div></div>
    <div class="kpi b3"><div class="lab">⏳ รอชำระ</div><div class="val">${num(pend)}</div></div>
    <div class="kpi b2"><div class="lab">💰 ยอดที่ชำระแล้ว</div><div class="val money">${money(sum)}</div></div>
  </div>`), panel);
  const rows=data.map(o=>`<tr>
    <td>${esc(fmtDateTime(o.created_at))}</td>
    <td><strong>${esc(o.company||'-')}</strong>
      ${o.buyer_type==='juristic'
        ? '<span class="chip" style="background:#e0e7ff;color:#4338ca">🏢 นิติบุคคล</span>'
        : '<span class="chip" style="background:#f1f5f9;color:#475569">👤 บุคคล</span>'}
      <br><span class="muted" style="font-size:12px">${esc(o.email||'')}${o.phone?' · '+esc(o.phone):''}${o.tax_id?'<br>เลขภาษี '+esc(o.tax_id)+(o.branch?' ('+esc(o.branch)+')':''):''}${o.address?'<br>'+esc(o.address):''}</span></td>
    <td>${esc(o.plan||'-')}<br><span class="muted" style="font-size:12px">${num(o.employees||0)} คน · ${o.cycle==='yearly'?'รายปี':'รายเดือน'}</span></td>
    <td class="num"><strong>${money(o.amount)}</strong></td>
    <td><span class="chip" style="background:${sc[o.status]||sc.pending}">${st[o.status]||o.status}</span></td>
    <td style="text-align:right">
      <select data-st="${o.id}" style="padding:5px 8px;border:1px solid var(--line);border-radius:7px">
        ${Object.keys(st).map(k=>`<option value="${k}" ${o.status===k?'selected':''}>${st[k]}</option>`).join('')}
      </select></td>
  </tr>`).join('');
  const tbl=el(`<table><thead><tr><th>วันที่</th><th>ผู้สั่งซื้อ</th><th>แพ็กเกจ</th><th class="num">ยอด</th><th>สถานะ</th><th></th></tr></thead>
    <tbody>${rows}</tbody></table>`);
  tbl.querySelectorAll('[data-st]').forEach(s2=>s2.onchange=async()=>{
    const ord=data.find(o=>String(o.id)===s2.dataset.st);
    const {error:e2}=await sb.from('orders').update({status:s2.value}).eq('id',ord.id);
    if(e2){ toast('อัปเดตไม่สำเร็จ'); return; }
    // ชำระแล้ว → ต่ออายุสิทธิ์ใช้งานให้ลูกค้าอัตโนมัติ
    if(s2.value==='paid'){
      const months = ord.cycle==='yearly' ? 12 : 1;
      const {data:pf}=await sb.from('profiles').select('id,paid_until').eq('email',ord.email).maybeSingle();
      if(!pf){ toast(`อัปเดตแล้ว — แต่ยังไม่พบบัญชี ${ord.email} (ลูกค้าต้องสมัครก่อน)`); render(); return; }
      const base=new Date(Math.max(Date.now(), pf.paid_until?new Date(pf.paid_until).getTime():0));
      base.setMonth(base.getMonth()+months);
      const {error:e3}=await sb.from('profiles').update({paid_until:base.toISOString(), plan:ord.plan}).eq('id',pf.id);
      toast(e3?('ต่ออายุไม่สำเร็จ: '+e3.message):`✅ ต่ออายุ ${ord.email} ถึง ${fmtDate(base.toISOString().slice(0,10))}`);
    } else toast('อัปเดตสถานะแล้ว');
    render();
  });
  box.innerHTML=''; box.appendChild(tbl);
}
/* ============ แจ้งปัญหา / คำแนะนำ (แอดมินเท่านั้น) ============ */
async function vFeedback(v){
  v.appendChild(el(`<div class="toolbar"><h2 style="font-size:16px">💬 แจ้งปัญหา / คำแนะนำ จากผู้ใช้</h2>
    <button class="btn ghost sm" style="margin-left:auto" id="fbRefresh">↻ รีเฟรช</button></div>`));
  const panel=el(`<div class="panel"><div class="pbody" id="fbList"><div class="empty">กำลังโหลด…</div></div></div>`);
  v.appendChild(panel);
  $('#fbRefresh').onclick=()=>render();
  const {data,error}=await sb.from('feedback').select('*').order('created_at',{ascending:false});
  const box=$('#fbList'); if(!box) return;
  if(error){ box.innerHTML=`<div class="empty">โหลดไม่ได้: ${esc(error.message)}<br><span style="font-size:12px">(ยังไม่ได้สร้างตาราง feedback ใน Supabase?)</span></div>`; return; }
  if(!data||!data.length){ box.innerHTML='<div class="empty">ยังไม่มีข้อความจากผู้ใช้</div>'; return; }
  const kc={'ปัญหา':'#fee2e2;color:#dc2626','คำแนะนำ':'#dcfce7;color:#16a34a','สอบถาม':'#eaf6f1;color:#092942'};
  box.innerHTML=`<div style="margin-bottom:12px" class="muted">ทั้งหมด ${data.length} ข้อความ</div>`+data.map(f=>`
    <div style="border:1px solid var(--line);border-radius:12px;padding:14px 16px;margin-bottom:12px">
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:6px;flex-wrap:wrap">
        <span class="chip" style="background:${kc[f.kind]||'#eaf6f1;color:#092942'}">${esc(f.kind||'-')}</span>
        <strong>${esc(f.name||'ไม่ระบุชื่อ')}</strong>
        ${f.email?`<a href="mailto:${esc(f.email)}" class="muted" style="font-size:12px">${esc(f.email)}</a>`:''}
        <span class="muted" style="font-size:12px;margin-left:auto">${esc(fmtDateTime(f.created_at))}</span>
      </div>
      <div style="white-space:pre-wrap">${esc(f.message)}</div>
    </div>`).join('');
}
