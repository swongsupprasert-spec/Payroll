/* ============================================================
   💬 แชต LINE (เฉพาะผู้ดูแลระบบ) — ลูกค้าที่ทัก LINE OA ล่าสุด + ปุ่ม "ฉันตอบเอง"
   LINE ไม่แจ้งระบบเมื่อแอดมินตอบแชตเอง → แอดมินกด "ฉันตอบเอง" ก่อนตอบ บอทจะหยุดตอบลูกค้ารายนั้น 2 ชม.
   ลูกค้าไม่เห็นอะไรจากหน้านี้ · ข้อมูลจากตาราง line_bot_chats (sql/36) ที่บอทบันทึกไว้
   ============================================================ */
const LC_PAUSE_MS=2*60*60*1000;
let LC_TIMER=null;

function lcAgo(t){
  const s=Math.max(0,(Date.now()-Date.parse(t))/1000);
  if(s<60) return 'เมื่อสักครู่';
  if(s<3600) return Math.floor(s/60)+' นาทีที่แล้ว';
  if(s<86400) return Math.floor(s/3600)+' ชม.ที่แล้ว';
  return fmtDateTime(t);
}
function lcLeft(until){
  const m=Math.max(0,Math.round((Date.parse(until)-Date.now())/60000));
  return m>=60?`${Math.floor(m/60)}:${String(m%60).padStart(2,'0')} ชม.`:`${m} นาที`;
}

async function vLineChats(v){
  clearInterval(LC_TIMER);
  v.appendChild(el(`<div class="toolbar"><h2 style="font-size:16px">💬 แชต LINE</h2>
    <span class="muted" style="font-size:12.5px">อัปเดตเองทุก 30 วินาที</span>
    <button class="btn ghost sm" style="margin-left:auto" id="lcRef">↻ รีเฟรช</button></div>`));
  v.appendChild(el(`<div class="panel" style="background:var(--chip);border:0"><div class="pbody" style="font-size:13.5px;line-height:1.7">
    🙋 <b>ก่อนตอบลูกค้าเองใน LINE OA ให้กด “ฉันตอบเอง”</b> — บอทจะหยุดตอบลูกค้ารายนั้น 2 ชั่วโมง ไม่ตอบแทรก ·
    ครบเวลาบอทกลับมาตอบเอง หรือกด “ให้บอทตอบต่อ” เมื่อคุยจบ · <span class="muted">ลูกค้าไม่เห็นการกดปุ่มเหล่านี้</span></div></div>`));
  const panel=el(`<div class="panel"><div class="pbody" style="padding:0"><div class="tbl-wrap" id="lcTbl"><div class="empty">กำลังโหลด…</div></div></div></div>`);
  v.appendChild(panel);
  v.appendChild(el(`<div class="toolbar" style="margin-top:18px"><h2 style="font-size:16px">🧠 คำตอบที่บอทจำไว้</h2>
    <span class="muted" style="font-size:12.5px">ลูกค้าถามคล้ายกันครั้งหน้า บอทตอบด้วยคำตอบนี้ให้เอง</span>
    <button class="btn sm" style="margin-left:auto" id="lcLrnAdd">＋ เพิ่มคำตอบ</button></div>`));
  v.appendChild(el(`<div class="panel"><div class="pbody" style="padding:0"><div class="tbl-wrap" id="lcLrnTbl"><div class="empty">กำลังโหลด…</div></div></div></div>`));
  $('#lcRef').onclick=()=>render();
  $('#lcLrnAdd').onclick=()=>lcLearnEdit({});
  lcLearnDraw();
  await lcDraw();
  LC_TIMER=setInterval(()=>{ if(PAGE!=='linechats'||!$('#lcTbl')){ clearInterval(LC_TIMER); return; } lcDraw(); },30000);
}

async function lcDraw(){
  const box=$('#lcTbl'); if(!box) return;
  const {data,error}=await sb.from('line_bot_chats').select('*').order('last_at',{ascending:false}).limit(100);
  if(!$('#lcTbl')) return;
  if(error){ box.innerHTML=`<div class="empty">โหลดไม่ได้: ${esc(error.message)}<br><span style="font-size:12px">(ยังไม่ได้รัน sql/36-supabase-line-chats.sql ใน Supabase?)</span></div>`; return; }
  if(!data||!data.length){ box.innerHTML='<div class="empty">ยังไม่มีลูกค้าทักเข้ามา — รายชื่อจะขึ้นเมื่อมีคนส่งข้อความถึง LINE OA</div>'; return; }
  const now=Date.now();
  box.innerHTML=`<table><thead><tr><th>ลูกค้า</th><th>ข้อความล่าสุด</th><th>เวลา</th><th>สถานะ</th><th></th></tr></thead><tbody>
    ${data.map((c,i)=>{ const paused=c.paused_until&&Date.parse(c.paused_until)>now;
      return `<tr style="${paused?'background:rgba(16,185,129,.07)':''}">
      <td><strong>${esc(c.name||'ลูกค้า LINE')}</strong></td>
      <td style="max-width:380px"><div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${esc(c.last_text||'')}">${esc(c.last_text||'-')}</div></td>
      <td style="white-space:nowrap">${esc(lcAgo(c.last_at))}</td>
      <td style="white-space:nowrap">${paused
        ? `<span class="chip" style="background:#dcfce7;color:#15803d">🙋 ${c.paused_by==='customer'?'ลูกค้าขอแอดมิน':'แอดมินตอบ'}</span> <span class="muted" style="font-size:12px">เหลือ ${lcLeft(c.paused_until)}</span>`
        : '<span class="chip" style="background:#e0f2fe;color:#0369a1">🤖 บอทตอบ</span>'}</td>
      <td style="white-space:nowrap;text-align:right">${paused
        ? `<button class="btn ghost sm" data-lcx="${i}" title="ต่อเวลาอีก 2 ชม.">+2 ชม.</button> <button class="btn ghost sm" data-lcr="${i}">🤖 ให้บอทตอบต่อ</button>`
        : `<button class="btn sm" data-lcp="${i}">🙋 ฉันตอบเอง</button>`}
        <button class="btn ghost sm" data-lcl="${i}" title="บันทึกคำตอบที่ตอบลูกค้าไป ให้บอทใช้ตอบครั้งหน้า">🧠 จำคำตอบ</button></td></tr>`; }).join('')}
  </tbody></table>`;
  const set=async(c,until,by,msg)=>{
    const {error}=await sb.from('line_bot_chats').update({paused_until:until,paused_by:by}).eq('user_id',c.user_id);
    if(error){ toast('บันทึกไม่สำเร็จ: '+error.message); return; }
    toast(msg); lcDraw();
  };
  box.querySelectorAll('[data-lcp]').forEach(b=>b.onclick=()=>{ const c=data[+b.dataset.lcp];
    set(c,new Date(Date.now()+LC_PAUSE_MS).toISOString(),'admin',`บอทหยุดตอบ ${c.name||'ลูกค้า'} 2 ชม. — ตอบใน LINE OA ได้เลย`); });
  box.querySelectorAll('[data-lcx]').forEach(b=>b.onclick=()=>{ const c=data[+b.dataset.lcx];
    const base=Math.max(Date.now(),Date.parse(c.paused_until)||0);
    set(c,new Date(base+LC_PAUSE_MS).toISOString(),c.paused_by||'admin','ต่อเวลาอีก 2 ชม. แล้ว'); });
  box.querySelectorAll('[data-lcr]').forEach(b=>b.onclick=()=>{ const c=data[+b.dataset.lcr];
    set(c,null,null,`บอทกลับมาตอบ ${c.name||'ลูกค้า'} แล้ว`); });
  box.querySelectorAll('[data-lcl]').forEach(b=>b.onclick=()=>{ const c=data[+b.dataset.lcl];
    const t=c.last_text||''; lcLearnEdit({question:/^\[.*\]$/.test(t)?'':t}); });
}

/* ---------- 🧠 คำตอบที่บอทจำไว้ (ตาราง line_bot_learned, sql/40) ---------- */
let LC_LRN=[];
async function lcLearnDraw(){
  const box=$('#lcLrnTbl'); if(!box) return;
  const {data,error}=await sb.from('line_bot_learned').select('*').order('updated_at',{ascending:false});
  if(!$('#lcLrnTbl')) return;
  if(error){ box.innerHTML=`<div class="empty">โหลดไม่ได้: ${esc(error.message)}<br><span style="font-size:12px">(ยังไม่ได้รัน sql/40-supabase-line-learned.sql ใน Supabase?)</span></div>`; return; }
  LC_LRN=data||[];
  if(!LC_LRN.length){ box.innerHTML='<div class="empty">ยังไม่มี — หลังตอบลูกค้าใน LINE OA แล้ว กด “🧠 จำคำตอบ” ที่แถวของลูกค้า แล้ววางคำตอบที่ตอบไป</div>'; return; }
  box.innerHTML=`<table><thead><tr><th>คำถามลูกค้า</th><th>คำตอบ</th><th>ใช้ไป</th><th>สถานะ</th><th></th></tr></thead><tbody>
    ${LC_LRN.map((r,i)=>`<tr style="${r.active?'':'opacity:.5'}">
      <td style="max-width:260px">${esc(r.question).split('|').join('<br>')}</td>
      <td style="max-width:380px;white-space:pre-wrap">${esc(r.answer)}</td>
      <td style="white-space:nowrap">${r.uses||0} ครั้ง</td>
      <td style="white-space:nowrap">${r.active?'<span class="chip" style="background:#dcfce7;color:#15803d">ใช้อยู่</span>':'<span class="chip">ปิดไว้</span>'}</td>
      <td style="white-space:nowrap;text-align:right"><button class="btn ghost sm" data-lle="${i}">✏️ แก้</button>
        <button class="btn ghost sm" data-llt="${i}">${r.active?'⏸ ปิดใช้':'▶ เปิดใช้'}</button></td></tr>`).join('')}
  </tbody></table>`;
  box.querySelectorAll('[data-lle]').forEach(b=>b.onclick=()=>lcLearnEdit(LC_LRN[+b.dataset.lle]));
  box.querySelectorAll('[data-llt]').forEach(b=>b.onclick=async()=>{ const r=LC_LRN[+b.dataset.llt];
    const {error}=await sb.from('line_bot_learned').update({active:!r.active,updated_at:new Date().toISOString()}).eq('id',r.id);
    if(error){ toast('บันทึกไม่สำเร็จ: '+error.message); return; }
    toast(r.active?'ปิดใช้คำตอบนี้แล้ว':'เปิดใช้คำตอบนี้แล้ว'); lcLearnDraw(); });
}
function lcLearnEdit(r){
  openModal(r.id?'✏️ แก้คำตอบที่บอทจำ':'🧠 ให้บอทจำคำตอบ',`
    <label style="display:block">คำถามลูกค้า <span class="muted" style="font-weight:400">— ถามได้หลายแบบ ขึ้นบรรทัดใหม่ทีละแบบ</span></label>
    <textarea id="llQ" rows="3" style="width:100%" placeholder="เช่น ลาออกกลางเดือนคิดเงินยังไง">${esc((r.question||'').split('|').join('\n'))}</textarea>
    <label style="display:block;margin-top:10px">คำตอบที่แอดมินตอบลูกค้า</label>
    <textarea id="llA" rows="6" style="width:100%" placeholder="วางข้อความที่ตอบลูกค้าไปใน LINE OA">${esc(r.answer||'')}</textarea>
    <div class="muted" style="font-size:12.5px;margin-top:8px">ลูกค้าถามคล้าย ๆ กันครั้งหน้า บอทจะตอบด้วยข้อความนี้ทันที · อย่าใส่ข้อมูลส่วนตัวของลูกค้าในคำตอบ</div>`,
    [['ยกเลิก','ghost',closeModal],['บันทึก','',async()=>{
      const question=$('#llQ').value.split('\n').map(s=>s.trim().replace(/\|/g,' ')).filter(s=>s.length>=2).join('|').slice(0,500);
      const answer=$('#llA').value.trim().slice(0,2000);
      if(!question){ toast('ใส่คำถามลูกค้าอย่างน้อย 1 แบบ'); return; }
      if(!answer){ toast('ใส่คำตอบก่อน'); return; }
      const row={question,answer,updated_at:new Date().toISOString()};
      const {error}=r.id?await sb.from('line_bot_learned').update(row).eq('id',r.id):await sb.from('line_bot_learned').insert(row);
      if(error){ toast('บันทึกไม่สำเร็จ: '+error.message); return; }
      closeModal(); toast('บอทจำคำตอบนี้แล้ว — มีผลภายใน 1 นาที'); lcLearnDraw();
    }]]);
}
