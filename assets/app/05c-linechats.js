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
  $('#lcRef').onclick=()=>render();
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
        : `<button class="btn sm" data-lcp="${i}">🙋 ฉันตอบเอง</button>`}</td></tr>`; }).join('')}
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
}
