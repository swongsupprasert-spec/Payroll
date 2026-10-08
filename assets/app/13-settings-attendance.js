/* app.html · ตั้งค่า, วันหยุด, เวลาเข้างาน, กะ — ลำดับไฟล์มีผล (โหลดตามเลข) */
/* ============ SETTINGS ============ */
/* ============ ปฏิทินวันหยุดบริษัท ============
   เก็บใน DB.holidays = { "YYYY-MM-DD": "ชื่อวันหยุด" } — แยกตามบริษัท (อยู่ในข้อมูลของแต่ละบริษัท)
   ใช้: ไม่นับขาดงาน · ทำงานวันหยุดคิด OT ตามตัวคูณวันหยุด */
function holidayMap(){ if(!DB.holidays||typeof DB.holidays!=='object') DB.holidays={}; return DB.holidays; }
function isHoliday(iso){ return !!(DB.holidays && DB.holidays[iso]); }
function holidayName(iso){ return (DB.holidays && DB.holidays[iso]) || ''; }
/* วันหยุดตามประเพณีที่ใช้บ่อยในภาคเอกชน — วันตามจันทรคติเปลี่ยนทุกปี ใส่ให้เฉพาะปีที่ตรวจแล้ว
   ปีอื่นเติมเฉพาะวันที่ตายตัว แล้วให้บริษัทเพิ่มวันพระเอง */
const HOLIDAY_FIXED=[['01-01','วันขึ้นปีใหม่'],['04-06','วันจักรี'],['04-13','วันสงกรานต์'],['04-14','วันสงกรานต์'],['04-15','วันสงกรานต์'],
  ['05-01','วันแรงงานแห่งชาติ'],['05-04','วันฉัตรมงคล'],['06-03','วันเฉลิมพระชนมพรรษา สมเด็จพระราชินี'],['07-28','วันเฉลิมพระชนมพรรษา ร.10'],
  ['08-12','วันแม่แห่งชาติ'],['10-13','วันนวมินทรมหาราช'],['10-23','วันปิยมหาราช'],['12-05','วันพ่อแห่งชาติ'],['12-10','วันรัฐธรรมนูญ'],['12-31','วันสิ้นปี']];
const HOLIDAY_LUNAR={ 2026:[['2026-03-03','วันมาฆบูชา'],['2026-05-31','วันวิสาขบูชา'],['2026-07-29','วันอาสาฬหบูชา'],['2026-07-30','วันเข้าพรรษา']] };
function vHolidayPanel(v){
  const H=holidayMap();
  if(!window._hyYear) window._hyYear=+PERIOD.split('-')[0];
  const Y=window._hyYear;
  const list=Object.keys(H).filter(d=>+d.slice(0,4)===Y).sort();
  const TH_M=['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
  const WDN=['อา','จ','อ','พ','พฤ','ศ','ส'];
  const fmt=d=>`${WDN[new Date(d+'T00:00:00').getDay()]} ${+d.slice(8)} ${TH_M[+d.slice(5,7)-1]}`;
  const p=el(`<div class="panel"><div class="phead"><h2>📅 ปฏิทินวันหยุดบริษัท</h2></div><div class="pbody">
    <p class="muted" style="font-size:13px;margin-bottom:10px">วันหยุดของบริษัทนี้เท่านั้น (แต่ละบริษัทตั้งไม่เหมือนกันได้) · ใช้กับ <strong>ไม่นับขาดงาน</strong> และ <strong>OT วันหยุด</strong></p>
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:12px">
      <button class="btn ghost sm" id="hyPrev">‹</button><strong style="font-size:16px">ปี ${Y+543}</strong><button class="btn ghost sm" id="hyNext">›</button>
      <span class="chip" style="${list.length<13?'background:#fef3c7;color:#b45309':'background:#dcfce7;color:#16a34a'}">${num(list.length)} วัน${list.length<13?' — กฎหมายกำหนดวันหยุดตามประเพณีอย่างน้อย 13 วัน':''}</span>
      <span style="margin-left:auto;display:flex;gap:6px;flex-wrap:wrap">
        <button class="btn ghost sm" id="hyFill">⭐ เติมวันหยุดทั่วไปปี ${Y+543}</button>
        <button class="btn ghost sm" id="hyCopy">📋 คัดลอกจากปี ${Y+542}</button>
      </span>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end;margin-bottom:10px">
      <div class="field"><label>วันที่</label><input type="date" id="hyD" value="${Y}-01-01" min="${Y}-01-01" max="${Y}-12-31"></div>
      <div class="field" style="flex:1;min-width:180px"><label>ชื่อวันหยุด</label><input id="hyN" placeholder="เช่น หยุดชดเชยสงกรานต์ / วันหยุดประจำปีบริษัท"></div>
      <button class="btn sm" id="hyAdd">＋ เพิ่มวันหยุด</button>
    </div>
    <div class="tbl-wrap" style="max-height:340px;overflow:auto"><table><thead><tr><th>วันที่</th><th>ชื่อวันหยุด</th><th></th></tr></thead><tbody>
      ${list.length?list.map(d=>`<tr><td style="white-space:nowrap">${fmt(d)}</td><td>${esc(H[d])}</td>
        <td style="text-align:right"><button class="btn ghost sm" data-hydel="${d}" style="color:#dc2626">ลบ</button></td></tr>`).join('')
        :`<tr><td colspan="3"><div class="empty">ยังไม่มีวันหยุดปี ${Y+543} — กด “เติมวันหยุดทั่วไป” แล้วลบวันที่บริษัทไม่หยุด</div></td></tr>`}
    </tbody></table></div>
    <div class="settings-row" style="margin-top:12px"><label>ตัวคูณ OT เมื่อทำงานล่วงเวลาในวันหยุด</label>
      <select id="hyMul">${[1.5,2,3].map(m=>`<option value="${m}" ${(+DB.holidayOtMult||3)===m?'selected':''}>${m} เท่า</option>`).join('')}</select>
      <span class="muted" style="font-size:12px">กฎหมายแรงงาน: ล่วงเวลาในวันหยุด = 3 เท่า · ตั้งเฉพาะวันในหน้าเวลาเข้างานจะมีผลเหนือค่านี้</span></div>
    <p class="muted" style="font-size:12px;margin-top:8px">⚠️ วันหยุดตามจันทรคติ (มาฆบูชา วิสาขบูชา ฯลฯ) และวันหยุดชดเชยเปลี่ยนทุกปี ตรวจกับประกาศของบริษัทก่อนใช้ · รัฐอาจประกาศวันหยุดพิเศษเพิ่มระหว่างปี</p>
  </div></div>`);
  v.appendChild(p);
  const q=s=>p.querySelector(s);
  q('#hyPrev').onclick=()=>{ window._hyYear--; render(); };
  q('#hyNext').onclick=()=>{ window._hyYear++; render(); };
  q('#hyAdd').onclick=()=>{ const d=q('#hyD').value, n=q('#hyN').value.trim();
    if(!d){ toast('เลือกวันที่ก่อน'); return; } if(!n){ toast('ใส่ชื่อวันหยุด'); return; }
    H[d]=n; if(+d.slice(0,4)!==Y) window._hyYear=+d.slice(0,4); save(); render(); toast('เพิ่มวันหยุดแล้ว'); };
  p.querySelectorAll('[data-hydel]').forEach(b=>b.onclick=()=>{ delete H[b.dataset.hydel]; save(); render(); });
  q('#hyFill').onclick=()=>{
    const add=[...HOLIDAY_FIXED.map(([md,n])=>[`${Y}-${md}`,n]), ...(HOLIDAY_LUNAR[Y]||[])];
    let n=0; add.forEach(([d,name])=>{ if(!H[d]){ H[d]=name; n++; } }); save(); render();
    toast(`เติมแล้ว ${n} วัน${HOLIDAY_LUNAR[Y]?'':' — ปีนี้ยังไม่มีวันพระในรายการ เพิ่มมาฆบูชา/วิสาขบูชา/อาสาฬหบูชา/เข้าพรรษาเอง'} · ลบวันที่บริษัทไม่หยุดได้เลย`);
  };
  q('#hyCopy').onclick=()=>{
    const src=Object.keys(H).filter(d=>+d.slice(0,4)===Y-1); if(!src.length){ toast(`ปี ${Y+542} ยังไม่มีวันหยุด`); return; }
    let n=0; src.forEach(d=>{ const nd=Y+d.slice(4); if(!H[nd]){ H[nd]=H[d]; n++; } }); save(); render();
    toast(`คัดลอกแล้ว ${n} วัน — วันพระและวันชดเชยเปลี่ยนทุกปี ตรวจวันที่อีกครั้ง`);
  };
  q('#hyMul').onchange=e=>{ DB.holidayOtMult=+e.target.value; save(); toast('ตั้ง OT วันหยุด = '+e.target.value+' เท่า'); };
}

function vSettings(v){
  const c=DB.company;
  const panel=el(`<div class="panel"><div class="phead"><h2>ข้อมูลบริษัท / ผู้จ่ายเงิน</h2></div><div class="pbody">
    <div class="grid2">
      <div class="field"><label>ชื่อบริษัท</label><input id="s_name" value="${esc(c.name)}"></div>
      <div class="field"><label>เลขประจำตัวผู้เสียภาษี (13 หลัก)</label><input id="s_taxId" value="${esc(c.taxId)}" inputmode="numeric" maxlength="13" placeholder="ตัวเลข 13 หลัก" oninput="this.value=this.value.replace(/[^0-9]/g,'').slice(0,13);this.style.borderColor=(this.value&&this.value.length<13)?'#f59e0b':''"></div>
      <div class="field" style="grid-column:1/-1"><label>ที่อยู่</label><input id="s_address" value="${esc(c.address)}"></div>
      <div class="field"><label>เลขที่บัญชีนายจ้าง (ประกันสังคม)</label><input id="s_ssoNo" value="${esc(c.ssoNo)}"></div>
      <div class="field"><label>ชื่อผู้ลงนาม</label><input id="s_signer" value="${esc(c.signer)}"></div>
      <div class="field"><label>อัตราประกันสังคม (%)</label><input id="s_ssoRate" type="number" step="0.5" value="${DB.ssoRate}"></div>
      <div class="field"><label>เพดานฐานประกันสังคม (บาท)</label><input id="s_ssoMax" type="number" value="${DB.ssoMaxBase}"></div>
      <div class="field"><label>ฐานคำนวณ OT: วันทำงาน/เดือน</label><input id="s_otDays" type="number" value="${DB.otDays||30}"></div>
      <div class="field"><label>ฐานคำนวณ OT: ชั่วโมง/วัน</label><input id="s_otHours" type="number" value="${DB.otHours||8}"></div>
      <div class="field"><label>วันทำงาน/เดือน (ประมาณการภาษีรายวัน)</label><input id="s_workDays" type="number" value="${DB.workDaysDefault||26}"></div>
      <div class="field"><label>วันตัดรอบเงินเดือน</label><select id="s_cutoff">
        <option value="0" ${!(+DB.cutoffDay)?'selected':''}>สิ้นเดือน</option>
        ${Array.from({length:31},(_,i)=>i+1).map(d=>`<option value="${d}" ${(+DB.cutoffDay===d)?'selected':''}>วันที่ ${d}</option>`).join('')}
      </select></div>
    </div>
    <div style="margin-top:16px"><button class="btn" id="saveSet">💾 บันทึกการตั้งค่า</button></div>
  </div></div>`);
  v.appendChild(panel);
  panel.querySelector('#saveSet').onclick=()=>{
    { const t=$('#s_taxId').value.trim(); if(t && !/^[0-9]{13}$/.test(t)){ toast(`เลขประจำตัวผู้เสียภาษีต้องครบ 13 หลัก (ตอนนี้ ${t.replace(/[^0-9]/g,'').length} หลัก)`); const f=$('#s_taxId'); f.style.borderColor='#dc2626'; f.focus(); return; } }
    c.name=$('#s_name').value; c.taxId=$('#s_taxId').value; c.address=$('#s_address').value;
    c.ssoNo=$('#s_ssoNo').value; c.signer=$('#s_signer').value;
    DB.ssoRate=+$('#s_ssoRate').value||5; DB.ssoMaxBase=+$('#s_ssoMax').value||17500;
    DB.otDays=+$('#s_otDays').value||30; DB.otHours=+$('#s_otHours').value||8; DB.workDaysDefault=+$('#s_workDays').value||26; DB.cutoffDay=+$('#s_cutoff').value||0;
    save(); toast('บันทึกการตั้งค่าแล้ว');
  };

  vHolidayPanel(v);
  vReceiptsPanel(v);

  // ส่วน "ข้อมูลระบบ" (สำรอง/นำเข้า/รีเซ็ต) — เห็นเฉพาะผู้ดูแลระบบ
  if(IS_ADMIN){
    const data=el(`<div class="panel"><div class="phead"><h2>ข้อมูลระบบ <span style="color:#eab308">👑</span></h2></div><div class="pbody">
      <div class="settings-row"><label>สำรอง/กู้คืนข้อมูล</label>
        <button class="btn ghost sm" id="bkExp">⬇️ ส่งออกทั้งหมด (JSON)</button>
        <button class="btn ghost sm" id="bkImp">⬆️ นำเข้า (JSON)</button></div>
      <div class="settings-row"><label>ล้างข้อมูลทั้งหมด</label>
        <button class="btn danger sm" id="resetAll">🗑️ รีเซ็ตเป็นค่าเริ่มต้น</button></div>
    </div></div>`);
    v.appendChild(data);
    data.querySelector('#bkExp').onclick=exportJSON;
    data.querySelector('#bkImp').onclick=importJSON;
    data.querySelector('#resetAll').onclick=()=>openModal('รีเซ็ตข้อมูล','<p>ต้องการลบข้อมูลทั้งหมดและเริ่มใหม่หรือไม่? การกระทำนี้ย้อนกลับไม่ได้</p>',
      [['ยกเลิก','ghost',closeModal],['รีเซ็ต','danger',()=>{ DB=seed(); save(); closeModal(); render(); toast('รีเซ็ตแล้ว'); }]]);
  }
}


/* 🧾 ประวัติการชำระเงิน / ใบเสร็จ — ดาวน์โหลดย้อนหลังได้ทุกเมื่อ เลขที่เดิมทุกครั้ง
   อ่านจากตาราง payments ของบัญชีตัวเอง (RLS: read own payments) · เลขที่ออกโดย trigger ใน sql/30 */
function vReceiptsPanel(v){
  if(DEMO || GUEST || !sb || !MY_UID) return;
  const p=el(`<div class="panel"><div class="phead"><h2>🧾 ประวัติการชำระเงิน / ใบเสร็จ</h2></div><div class="pbody" id="rcBody"><p class="muted">กำลังโหลด…</p></div></div>`);
  v.appendChild(p);
  const body=p.querySelector('#rcBody');
  (async()=>{
    const {data,error}=await sb.from('payments')
      .select('charge_id,receipt_no,paid_at,created_at,amount,plan,employees,cycle,edition,method,buyer_name,buyer_email,buyer_phone,buyer_type,tax_id,branch,address')
      .eq('user_id',MY_UID).eq('status','successful').order('paid_at',{ascending:false});
    if(error){ body.innerHTML=`<p class="muted">โหลดประวัติไม่สำเร็จ ลองรีเฟรชหน้าอีกครั้ง</p>`; return; }
    if(!data || !data.length){ body.innerHTML=`<p class="muted">ยังไม่มีรายการชำระเงิน — ชำระผ่านหน้า <a href="/pricing">แพ็กเกจและราคา</a> แล้วใบเสร็จจะขึ้นที่นี่</p>`; return; }
    body.innerHTML=`<div class="tbl-wrap"><table><thead><tr><th>วันที่ชำระ</th><th>เลขที่ใบเสร็จ</th><th>แพ็กเกจ</th><th class="num">จำนวนเงิน</th><th></th></tr></thead><tbody>
      ${data.map((r,i)=>`<tr><td>${fmtDate(new Date(Date.parse(r.paid_at||r.created_at)+7*3600e3).toISOString().slice(0,10))}</td><td>${esc(r.receipt_no||'—')}</td>
        <td>${esc(r.plan||'')} · ${r.cycle==='yearly'?'รายปี':'รายเดือน'}</td><td class="num">${num(+r.amount)}</td>
        <td><button class="btn ghost sm" data-rc="${i}">🧾 ดาวน์โหลด</button></td></tr>`).join('')}
    </tbody></table></div>
    <p class="muted" style="margin-top:10px;font-size:12.5px">ใบเสร็จออกในชื่อที่กรอกตอนชำระเงิน · ต้องการแก้ชื่อหรือที่อยู่ ติดต่อ hello@esimpayroll.com</p>`;
    body.querySelectorAll('[data-rc]').forEach(b=>b.onclick=()=>{
      const r=data[+b.dataset.rc];
      if(!window.ESIM_RECEIPT){ toast('โหลดตัวสร้างใบเสร็จไม่สำเร็จ ลองรีเฟรชหน้า'); return; }
      ESIM_RECEIPT.open({
        docNo:r.receipt_no||('REF-'+String(r.charge_id).slice(-10)), date:r.paid_at||r.created_at,
        name:r.buyer_name, email:r.buyer_email, phone:r.buyer_phone, btype:r.buyer_type,
        taxId:r.tax_id, branch:r.branch, addr:r.address,
        plan:r.plan, employees:r.employees, cycle:r.cycle, edition:r.edition,
        amount:+r.amount, transRef:r.charge_id, method:r.method,
      }, LANG==='en');
    });
  })();
}

/* ============================================================
   ⏰ เวลาเข้างาน — บันทึกเวลาเข้า/ออก นำเข้าจาก CSV
   ผูกกับข้อมูลพนักงาน และส่งวันทำงาน/ชั่วโมง OT เข้าหน้าเงินได้-เงินหัก
   ============================================================ */
function ensureAttend(p){ if(!DB.attend) DB.attend={}; if(!DB.attend[p]) DB.attend[p]={}; return DB.attend[p]; }
function attendOf(p, empId){ const a=DB.attend&&DB.attend[p]; return (a&&a[empId])||{}; }
function hm2min(s){ const m=/^(\d{1,2}):(\d{2})/.exec(String(s||'').trim()); if(!m) return null;
  const h=+m[1], mi=+m[2]; if(h>23||mi>59) return null; return h*60+mi; }
function pad2(n){ return String(n).padStart(2,'0'); }
/* ---------- ช่องกรอกเวลาแบบ 24 ชม. ----------
   input[type=time] ของเบราว์เซอร์แสดง AM/PM ตาม locale ของเครื่อง บังคับไม่ได้
   จึงใช้ช่องข้อความที่ควบคุมเอง — เก็บค่าเป็น "HH:MM" 24 ชม. เหมือนเดิมทุกประการ */
function t24Norm(s){
  s=String(s??'').trim();
  if(!s) return '';
  let d=s.replace(/\D/g,'');
  if(!d) return null;
  if(d.length<=2){ const h=+d; return h>23 ? null : pad2(h)+':00'; }   // "8" → 08:00 · "17" → 17:00
  if(d.length===3) d='0'+d;                                            // "830" → 0830
  d=d.slice(0,4);
  const h=+d.slice(0,2), m=+d.slice(2,4);
  return (h>23||m>59) ? null : pad2(h)+':'+pad2(m);
}
function t24(attrs, val, style){
  return `<input type="text" class="t24" inputmode="numeric" autocomplete="off" maxlength="5"
    placeholder="--:--" ${attrs||''} value="${esc(val||'')}" style="${style||''}">`;
}
function wireT24(root){
  (root||document).querySelectorAll('input.t24').forEach(inp=>{
    if(inp._t24) return; inp._t24=1;
    inp.addEventListener('focus', ()=>setTimeout(()=>inp.select(),0));
    inp.addEventListener('input', ()=>{
      const d=inp.value.replace(/\D/g,'').slice(0,4);
      inp.value = d.length>2 ? d.slice(0,2)+':'+d.slice(2) : d;
      inp.classList.remove('bad');
    });
    inp.addEventListener('blur', ()=>{
      const n=t24Norm(inp.value);
      if(n===null){ inp.classList.add('bad'); toast('เวลาไม่ถูกต้อง — กรอกแบบ 24 ชม. เช่น 08:30 หรือ 17:45'); }
      else { inp.value=n; inp.classList.remove('bad'); }
    });
  });
}
function min2hm(v){ if(v==null) return ''; return pad2(Math.floor(v/60))+':'+pad2(v%60); }
function isoOf(d){ return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`; }
// วันที่ทุกวันในงวด (อิงวันตัดรอบ)
function periodDates(p){
  const {from,to}=periodRange(p); const out=[]; const d=new Date(from);
  while(d<=to){ out.push(isoOf(d)); d.setDate(d.getDate()+1); }
  return out;
}
function inPeriod(iso, p){
  if(!iso) return false;
  const {from,to}=periodRange(p);
  const [y,m,dd]=iso.split('-').map(Number); const D=new Date(y,m-1,dd);
  return D>=from && D<=to;
}
const WD_TH=['อาทิตย์','จันทร์','อังคาร','พุธ','พฤหัสบดี','ศุกร์','เสาร์'];
const WD_S=['อา','จ','อ','พ','พฤ','ศ','ส'];
function weekdayOf(iso){ return new Date(iso+'T00:00:00').getDay(); }
// วันนี้เปิดให้คิด OT ไหม — กำหนดเฉพาะวัน (ถ้ามี) ทับค่ารายสัปดาห์
function otAllowed(iso){
  if(DB.otDates && Object.prototype.hasOwnProperty.call(DB.otDates, iso)) return !!DB.otDates[iso];
  const arr=DB.otWeekdays;
  return Array.isArray(arr) ? !!arr[weekdayOf(iso)] : true;   // ยังไม่ตั้งค่า = เปิดทุกวัน
}
function otOverridden(iso){ return !!(DB.otDates && Object.prototype.hasOwnProperty.call(DB.otDates, iso)); }
/* ตัวคูณ OT ของแต่ละวัน — ตั้งตามวันในสัปดาห์ได้ และกำหนดเฉพาะวันทับได้
   ไม่ตั้งค่า = 1.5 เท่า (ล่วงเวลาวันทำงานปกติ) */
const OT_MULT_STEPS=[1,1.5,2,2.5,3];
function otMultWeekday(i){
  const a=DB.otMultWeekdays;
  const v=Array.isArray(a)?+a[i]:0;
  return v>0?v:1.5;
}
function otMultFor(iso){
  if(DB.otMultDates && DB.otMultDates[iso]!=null){ const v=+DB.otMultDates[iso]; if(v>0) return v; }
  if(isHoliday(iso)) return +DB.holidayOtMult||3;      // ทำงานล่วงเวลาในวันหยุดบริษัท
  return otMultWeekday(weekdayOf(iso));
}
function otMultOverridden(iso){ return !!(DB.otMultDates && DB.otMultDates[iso]!=null); }
// พนักงานคนนี้เปิดให้คิด OT ไหม (ไม่ตั้งค่า = เปิด)
function otPerson(emp){ return !(emp && emp.noOT); }
// แปลงนาทีที่อยู่เกินเป็นชั่วโมง OT — ปัดลงทีละครึ่งชั่วโมง ไม่ปัดขึ้น
// 45 นาที → 0.5 · 29 นาที → 0 · 59 นาที → 0.5 · 90 นาที → 1.5
function otHalfHours(mins){ return Math.max(0, Math.floor((+mins||0)/30)/2); }
// เพดาน OT ต่อวันของคนนี้ — ตั้งรายคนได้ ถ้าไม่ตั้งใช้ค่าส่วนกลาง (0 = ไม่จำกัด)
/* เพดาน OT ของ "วันนั้น" — ถ้ากรอก OT อนุมัติรายวันไว้ (รวม 0) ใช้ค่านั้น ไม่งั้นใช้เพดานรายคน/ส่วนกลาง
   คืนค่า -1 = ไม่จำกัด */
function otCapDay(emp, r){
  if(r && r.c!=null && r.c!=='') return Math.max(0,+r.c||0);
  const cap=otCapFor(emp); return cap>0 ? cap : -1;
}
function otCapFor(emp){
  return +DB.otMaxDay||0;   // เพดานส่วนกลาง · ต่างกันรายคน/รายวัน ใช้ "OT อนุมัติ"
}
// เปิด OT จริงเมื่อ "คนเปิด" และ "วันเปิด" พร้อมกัน
function otAllowedFor(emp, iso){ return otPerson(emp) && otAllowed(iso); }


/* ============================================================
   🕐 ระบบกะการทำงาน (Shift)
   - แต่ละคนมีกะประจำของตัวเอง
   - สลับกะรายวันได้ (ตารางกะ)
   - รองรับกะข้ามคืน เช่น 22:00–06:00
   ============================================================ */
const SHIFT_COLORS=['#0891b2','#f59e0b','#6366f1','#10b981','#ec4899','#8b5cf6','#ef4444','#64748b'];

// สร้างกะเริ่มต้นจากเวลามาตรฐานเดิม (ผู้ใช้เก่าไม่มีอะไรเปลี่ยน)
function ensureShifts(){
  if(!Array.isArray(DB.shifts) || !DB.shifts.length){
    DB.shifts=[{ id:'sh_def', name:'กะปกติ', start:DB.workStart||'08:00',
                 end:DB.workEnd||'17:00', grace:+DB.lateGrace||0, color:SHIFT_COLORS[0] }];
  }
  if(!DB.shiftPlan || typeof DB.shiftPlan!=='object') DB.shiftPlan={};
  return DB.shifts;
}
function shiftById(id){ const l=ensureShifts(); return l.find(s=>s.id===id)||null; }
// กะของพนักงานคนนี้ในวันนี้ — ตารางกะรายวัน (ถ้ามี) ทับกะประจำตัว
function shiftFor(emp, iso){
  const l=ensureShifts();
  const plan=DB.shiftPlan[iso];
  const id=(plan && plan[emp.id]) || emp.shiftId;
  return l.find(s=>s.id===id) || l[0];
}
function shiftPlanned(emp, iso){ const p=DB.shiftPlan&&DB.shiftPlan[iso]; return !!(p && p[emp.id]); }
function shiftShort(sh){ return sh.short || String(sh.name||'').replace(/^กะ/,'').slice(0,3) || '?'; }

// ช่วงเวลาของกะ (นาทีจากเที่ยงคืน) — กะข้ามคืนจะได้ E > 1440
function shiftSpan(sh){
  const S=hm2min(sh.start)??480;
  const E0=hm2min(sh.end)??1020;
  const over=E0<=S;                       // เลิกงานเวลาน้อยกว่าหรือเท่าเข้างาน = ข้ามคืน
  return { S, E0, E:over?E0+1440:E0, over, grace:+sh.grace||0 };
}
// ปรับเวลาปั๊มเข้า-ออกให้อยู่บนแกนเดียวกับกะ (รองรับข้ามเที่ยงคืน)
function punchMinutes(sh, i, o){
  const sp=shiftSpan(sh);
  let IM=hm2min(i), OM=hm2min(o);
  // กะข้ามคืน: ปั๊มเข้าหลังเที่ยงคืน (เช่นกะ 22:00 แต่มาถึง 00:30) → บวกอีกวัน
  if(IM!=null && sp.over && IM < sp.E0) IM+=1440;
  if(OM!=null){
    if(IM!=null){ let g=0; while(OM<IM && g++<2) OM+=1440; }   // ออกงานต้องหลังเข้างานเสมอ
    else if(sp.over && OM < sp.E0) OM+=1440;
  }
  return { IM, OM, ...sp };
}
function shiftHours(sh){ const sp=shiftSpan(sh); return Math.round((sp.E-sp.S)/6)/10; }

// สรุปสถิติเวลาเข้างานของพนักงาน 1 คนในงวด
/* ข้อความแยก OT ตามตัวคูณ ใช้ใต้ยอดรวมในตาราง */
function otByLabel(by){
  const ks=Object.keys(by||{}).filter(k=>+by[k]>0).sort((a,b)=>a-b);
  if(!ks.length) return '';
  return '<br><span class="muted" style="font-size:11.5px;line-height:1.5">'
    + ks.map(function(k){ return k+'× '+num(Math.round(by[k]*100)/100); }).join('<br>')
    + '</span>';
}
function attendStats(emp, p){
  const rec=attendOf(p, emp.id);
  ensureShifts();
  let days=0, late=0, lateMin=0, otH=0, skipH=0, skipDays=0, capH=0, capDays=0, early=0, noOut=0;
  const otBy={};                                   // แยกชั่วโมงตามตัวคูณ เช่น {1.5:8, 3:4}
  Object.keys(rec).forEach(d=>{
    if(!inPeriod(d,p)) return;
    // ใช้กะของคนนี้ในวันนี้ (รองรับสลับกะ + กะข้ามคืน)
    const sh=shiftFor(emp, d);
    const {IM:im, OM:om, S:ws, E:we, grace}=punchMinutes(sh, rec[d].i, rec[d].o);
    if(im==null && om==null) return;
    days++;
    if(im!=null && im>ws+grace){ late++; lateMin+=im-(ws+grace); }
    if(om==null){ noOut++; return; }
    if(om>we){
      // ปัดลงทีละครึ่งชั่วโมง "รายวัน" แล้วค่อยรวม
      // (ถ้ารวมนาทีทั้งเดือนก่อนปัด เศษของวันที่ทำไม่ถึง 30 นาทีจะถูกสะสมกลายเป็น OT)
      const raw=otHalfHours(om-we);
      if(raw>0){
        if(otAllowedFor(emp, d)){
          const cap=otCapDay(emp, rec[d]);
          const h=(cap>=0 && raw>cap) ? cap : raw;   // เกินเพดาน (หรือ OT อนุมัติของวันนั้น) → ตัดเหลือเท่าเพดาน
          otH+=h;
          const mul=otMultFor(d);
          otBy[mul]=Math.round(((otBy[mul]||0)+h)*100)/100;
          if(h<raw){ capH+=raw-h; capDays++; }
        }
        else { skipH+=raw; skipDays++; }          // ปิดที่คนหรือที่วัน → ไม่คิด
      }
    }
    else if(om<we) early++;
  });
  return { days, late, lateMin, otHours:Math.round(otH*100)/100, otBy,
           skipHours:Math.round(skipH*100)/100, skipDays,
           capHours:Math.round(capH*100)/100, capDays, early, noOut,
           otOff:!otPerson(emp) };
}

let attendSearch='';
function vAttend(v){
  ckAutoMerge(); ckLeaveSync();
  const list=DB.employees.filter(e=>!resignedBefore(e,PERIOD));
  const q=attendSearch.trim().toLowerCase();
  const shown=q? list.filter(e=>[e.code,e.name,e.position,e.dept].some(x=>String(x||'').toLowerCase().includes(q))) : list;
  const stats=new Map(shown.map(e=>[e.id, attendStats(e,PERIOD)]));
  const T={ days:0, late:0, ot:0, skip:0, cap:0, withData:0 };
  stats.forEach(s=>{ T.days+=s.days; T.late+=s.late; T.ot+=s.otHours;
    T.skip+=s.skipHours||0; T.cap+=s.capHours||0; if(s.days) T.withData++; });
  const {from,to}=periodRange(PERIOD);

  v.appendChild(el(`<div class="cards">
    <div class="kpi b1"><div class="lab">📅 ช่วงงวด</div><div class="val" style="font-size:17px">${fmtD(from)} – ${fmtD(to)}</div></div>
    <div class="kpi b2"><div class="lab">✅ มีข้อมูลเวลา</div><div class="val">${num(T.withData)} <span class="muted" style="font-size:14px">/ ${num(shown.length)} คน</span></div></div>
    <div class="kpi b3"><div class="lab">🕒 รวมวันทำงาน</div><div class="val">${num(T.days)} <span class="muted" style="font-size:14px">วัน</span></div></div>
    <div class="kpi b4"><div class="lab">⚡ รวม OT</div><div class="val">${num(T.ot)} <span class="muted" style="font-size:14px">ชม.${T.skip?` · ไม่คิด ${num(T.skip)} ชม.`:''}${T.cap?` · เกินเพดาน ${num(T.cap)} ชม.`:''} · สาย ${num(T.late)} ครั้ง</span></div></div>
  </div>`));

  const bar=el(`<div class="toolbar">
    <input id="atQ" placeholder="ค้นหา รหัส / ชื่อ / แผนก" value="${esc(attendSearch)}" style="min-width:210px">
    <button class="btn ghost sm" id="atTpl">📄 เทมเพลต CSV</button>
    <button class="btn ghost sm" id="atImp">⬆️ นำเข้า CSV</button>
    <button class="btn ghost sm" id="atExp">⬇️ ส่งออก CSV</button>
    <button class="btn sm" id="atPush" style="margin-left:auto">➡️ ส่งเข้าเงินได้ / เงินหัก</button>
  </div>`);
  v.appendChild(bar);
  bar.querySelector('#atQ').oninput=(e)=>{ attendSearch=e.target.value; const c=e.target.selectionStart; render();
    const n=$('#atQ'); if(n){ n.focus(); n.setSelectionRange(c,c); } };
  bar.querySelector('#atTpl').onclick=attendTemplate;
  bar.querySelector('#atImp').onclick=importAttendCSV;
  bar.querySelector('#atExp').onclick=exportAttendCSV;
  bar.querySelector('#atPush').onclick=pushAttendToPayroll;

  v.appendChild(shiftPanel());
  const spPanel=shiftPlanPanel(shown);
  if(spPanel) v.appendChild(spPanel);
  v.appendChild(otDaysPanel());

  if(!DB.employees.length){ v.appendChild(el(`<div class="panel"><div class="empty">${tr('no_emp_hint')}</div></div>`)); return; }
  if(!shown.length){ v.appendChild(el(`<div class="panel"><div class="empty">${tr('emp_not_found')}</div></div>`)); return; }

  const rows=shown.map(e=>{
    const s=stats.get(e.id);
    return `<tr>
      <td>${esc(e.code)}</td>
      <td><strong>${esc(e.name)}</strong><br><span class="muted" style="font-size:12px">${esc(e.dept||'-')}</span></td>
      <td><span class="chip">${e.payType==='daily'?tr('type_daily'):tr('type_monthly')}</span></td>
      <td><select data-shsel="${e.id}" style="padding:4px 6px;font-size:12.5px;max-width:130px">
        ${ensureShifts().map(s=>`<option value="${s.id}" ${(e.shiftId||ensureShifts()[0].id)===s.id?'selected':''}>${esc(s.name)}</option>`).join('')}
      </select></td>
      <td><button type="button" data-otp="${e.id}" title="กดเพื่อสลับสิทธิ์ OT ของคนนี้"
        style="padding:4px 11px;border-radius:20px;font-size:12px;font-weight:700;cursor:pointer;
          border:1.5px solid ${otPerson(e)?'#0f766e':'#cbd5e1'};
          background:${otPerson(e)?'#ccfbf1':'#f8fafc'};color:${otPerson(e)?'#0f766e':'#94a3b8'}">
        ${otPerson(e)?'⚡ เปิด':'✕ ปิด'}</button></td>
      <td class="num"><strong>${num(s.days)}</strong></td>
      <td class="num">${s.late?`<span style="color:#dc2626">${num(s.late)} ครั้ง</span><br><span class="muted" style="font-size:12px">${num(s.lateMin)} นาที</span>`:'<span class="muted">-</span>'}</td>
      <td class="num">${s.otHours?`<strong style="color:#0d9488">${num(s.otHours)}</strong>${otByLabel(s.otBy)}`:'<span class="muted">-</span>'}</td>
      <td class="num">${s.early?num(s.early):'<span class="muted">-</span>'}</td>
      <td class="num">${s.noOut?`<span style="color:#b45309">${num(s.noOut)}</span>`:'<span class="muted">-</span>'}</td>
      <td style="text-align:right"><button class="btn ghost sm" data-at-view="${e.id}">📋 รายวัน</button></td>
    </tr>`;
  }).join('');

  const panel=el(`<div class="panel"><div class="pbody" style="padding:0"><div class="tbl-wrap">
    <table><thead><tr>
      <th>${tr('th_code')}</th><th>${tr('th_name')}</th><th>${tr('th_type')}</th>
      <th title="กะประจำตัว — สลับรายวันได้ที่ตารางกะด้านบน">กะประจำ</th>
      <th title="เปิด/ปิดสิทธิ์ OT เฉพาะคนนี้">สิทธิ์ OT</th>
      <th class="num">วันทำงาน</th><th class="num">มาสาย</th><th class="num">OT (ชม.)</th>
      <th class="num">ออกก่อน</th><th class="num">ไม่ลงเวลาออก</th><th></th>
    </tr></thead><tbody>${rows}</tbody></table></div></div></div>`);
  v.appendChild(panel);
  panel.querySelectorAll('[data-at-view]').forEach(b=>b.onclick=()=>attendDetailModal(b.dataset.atView));
  panel.querySelectorAll('[data-shsel]').forEach(s=>s.onchange=()=>{
    const emp=DB.employees.find(x=>x.id===s.dataset.shsel); if(!emp) return;
    emp.shiftId=s.value; save(); render(); toast(`${emp.name}: ${shiftById(s.value).name}`);
  });
  panel.querySelectorAll('[data-otp]').forEach(b=>b.onclick=()=>{
    const emp=DB.employees.find(x=>x.id===b.dataset.otp); if(!emp) return;
    if(emp.noOT) delete emp.noOT; else emp.noOT=1;
    save(); render(); toast(`${emp.name}: ${emp.noOT?'ปิด':'เปิด'} OT`);
  });
}


/* ---------- แผงจัดการกะ ---------- */
function shiftPanel(){
  const list=ensureShifts();
  const rows=list.map(sh=>{
    const sp=shiftSpan(sh);
    const used=DB.employees.filter(e=>(e.shiftId||list[0].id)===sh.id).length;
    return `<tr>
      <td><input data-sh-name="${sh.id}" value="${esc(sh.name)}" style="width:120px"></td>
      <td>${t24(`data-sh-start="${sh.id}"`, sh.start)}</td>
      <td>${t24(`data-sh-end="${sh.id}"`, sh.end)}</td>
      <td class="num" data-sh-hrs="${sh.id}">${shiftHours(sh)} ชม.${sp.over?'<br><span class="chip" style="background:#ede9fe;color:#6d28d9">ข้ามคืน</span>':''}</td>
      <td class="num"><input type="number" min="0" data-sh-grace="${sh.id}" value="${+sh.grace||0}" style="width:64px;text-align:center"></td>
      <td><input type="color" data-sh-color="${sh.id}" value="${esc(sh.color||'#0891b2')}" style="width:44px;height:30px;padding:2px;border:1px solid var(--line);border-radius:6px"></td>
      <td class="num">${num(used)} คน</td>
      <td style="text-align:right">${list.length>1?`<button class="btn danger sm" data-sh-del="${sh.id}">🗑️</button>`:'<span class="muted" style="font-size:12px">กะสุดท้าย</span>'}</td>
    </tr>`;
  }).join('');

  const p=el(`<div class="panel" style="margin-bottom:16px">
    <div class="phead" style="padding:12px 16px;font-weight:700">🕐 กะการทำงาน
      <span class="muted" style="font-weight:400;font-size:13px">— ${num(list.length)} กะ · ใช้ตัดสินว่าสายและ OT ตามกะของแต่ละคน</span></div>
    <div class="pbody" style="padding:0">
      <div class="tbl-wrap"><table>
        <thead><tr><th>ชื่อกะ</th><th>เข้างาน</th><th>เลิกงาน</th><th class="num">ชั่วโมง</th>
          <th class="num">อนุโลมสาย<br><span style="font-weight:400;font-size:11px">(นาที)</span></th>
          <th>สี</th><th class="num">พนักงาน</th><th></th></tr></thead>
        <tbody>${rows}</tbody></table></div>
      <div style="padding:12px 16px;display:flex;gap:8px;flex-wrap:wrap;align-items:center;border-top:1px solid var(--line)">
        <button class="btn ghost sm" id="shAdd">➕ เพิ่มกะ</button>
        <button class="btn ghost sm" id="shPreset">⚡ ใส่กะมาตรฐาน 3 กะ</button>
        <button class="btn sm" id="shSave">💾 บันทึกกะ</button>
        <span class="muted" style="font-size:12.5px">เลิกงานเวลาน้อยกว่าเข้างาน = <strong>กะข้ามคืน</strong> ระบบคิดให้อัตโนมัติ<br>
          <strong>OT ปัดลงทีละครึ่งชั่วโมง ไม่ปัดขึ้น</strong> — ทำไม่ครบ 30 นาทีไม่คิดให้</span>
      </div>
    </div></div>`);
  wireT24(p);
  /* ชั่วโมงเปลี่ยนตามเวลาที่พิมพ์ทันที ไม่ต้องรอกดบันทึก */
  const liveHours=()=>list.forEach(sh=>{
    const cell=p.querySelector('[data-sh-hrs="'+sh.id+'"]'); if(!cell) return;
    const s=t24Norm(p.querySelector('[data-sh-start="'+sh.id+'"]').value)||sh.start;
    const e=t24Norm(p.querySelector('[data-sh-end="'+sh.id+'"]').value)||sh.end;
    const tmp={start:s,end:e}, sp=shiftSpan(tmp);
    cell.innerHTML=shiftHours(tmp)+' ชม.'+(sp.over?'<br><span class="chip" style="background:#ede9fe;color:#6d28d9">ข้ามคืน</span>':'');
  });
  p.querySelectorAll('[data-sh-start],[data-sh-end]').forEach(i=>{ i.addEventListener('input',liveHours); i.addEventListener('change',liveHours); i.addEventListener('blur',liveHours); });

  const readForm=()=>{
    list.forEach(sh=>{
      const g=(sel)=>p.querySelector(`[data-sh-${sel}="${sh.id}"]`);
      sh.name=(g('name').value||'').trim()||sh.name;
      sh.start=t24Norm(g('start').value)||sh.start;
      sh.end=t24Norm(g('end').value)||sh.end;
      sh.grace=+g('grace').value||0;
      sh.color=g('color').value||sh.color;
    });
  };
  p.querySelector('#shSave').onclick=()=>{ readForm(); save(); render(); toast('บันทึกกะแล้ว'); };
  p.querySelector('#shAdd').onclick=()=>{
    readForm();
    DB.shifts.push({ id:'sh_'+uid(), name:'กะใหม่ '+(DB.shifts.length+1), start:'08:00', end:'17:00',
      grace:0, color:SHIFT_COLORS[DB.shifts.length%SHIFT_COLORS.length] });
    save(); render();
  };
  p.querySelector('#shPreset').onclick=()=>openModal('ใส่กะมาตรฐาน 3 กะ',
    `<p>จะเพิ่มกะเหล่านี้เข้าไป (ของเดิมไม่ถูกลบ):</p>
     <ul style="margin-left:18px">
       <li><strong>กะเช้า</strong> 08:00 – 17:00</li>
       <li><strong>กะบ่าย</strong> 16:00 – 01:00 <span class="muted">(ข้ามคืน)</span></li>
       <li><strong>กะดึก</strong> 00:00 – 08:00</li>
     </ul>`,
    [['ยกเลิก','ghost',closeModal],['เพิ่ม','',()=>{
      const add=[['กะเช้า','08:00','17:00'],['กะบ่าย','16:00','01:00'],['กะดึก','00:00','08:00']];
      add.forEach(([name,start,end],i)=>{
        if(DB.shifts.some(s=>s.name===name)) return;
        DB.shifts.push({ id:'sh_'+uid(), name, start, end, grace:+DB.lateGrace||0,
          color:SHIFT_COLORS[(DB.shifts.length+i)%SHIFT_COLORS.length] });
      });
      save(); closeModal(); render(); toast('เพิ่มกะมาตรฐานแล้ว');
    }]]);
  p.querySelectorAll('[data-sh-del]').forEach(b=>b.onclick=()=>{
    const sh=shiftById(b.dataset.shDel); if(!sh) return;
    const used=DB.employees.filter(e=>e.shiftId===sh.id).length;
    openModal('ลบกะ',
      `<p>ลบกะ <strong>${esc(sh.name)}</strong> (${esc(sh.start)}–${esc(sh.end)}) ?</p>
       ${used?`<p style="color:#b45309">มีพนักงาน <strong>${num(used)}</strong> คนใช้กะนี้อยู่ — จะถูกย้ายไปกะแรกให้อัตโนมัติ</p>`:''}`,
      [['ยกเลิก','ghost',closeModal],['ลบ','danger',()=>{
        DB.shifts=DB.shifts.filter(s=>s.id!==sh.id);
        const first=DB.shifts[0];
        DB.employees.forEach(e=>{ if(e.shiftId===sh.id) e.shiftId=first?first.id:undefined; });
        Object.keys(DB.shiftPlan||{}).forEach(d=>{
          Object.keys(DB.shiftPlan[d]).forEach(eid=>{ if(DB.shiftPlan[d][eid]===sh.id) delete DB.shiftPlan[d][eid]; });
          if(!Object.keys(DB.shiftPlan[d]).length) delete DB.shiftPlan[d];
        });
        save(); closeModal(); render(); toast('ลบกะแล้ว');
      }]]);
  });
  return p;
}

/* ---------- ตารางกะรายวัน (สลับกะ) ---------- */
function shiftPlanPanel(shown){
  const list=ensureShifts();
  if(list.length<2) return null;                 // มีกะเดียวไม่ต้องมีตารางสลับ
  const dates=periodDates(PERIOD);
  const head=dates.map(d=>{
    const wk=weekdayOf(d);
    return `<th style="min-width:38px;padding:5px 2px;font-size:11px;${isHoliday(d)?'background:#fee2e2':(wk===0||wk===6?'background:#f1f5f9':'')}" ${isHoliday(d)?`title="🎌 ${esc(holidayName(d))}"`:''}>
      ${+d.slice(8)}<br><span style="font-weight:400;color:${isHoliday(d)?'#b91c1c':'#94a3b8'}">${isHoliday(d)?'หยุด':WD_S[wk]}</span></th>`;
  }).join('');
  const body=shown.map(e=>{
    const cells=dates.map(d=>{
      const sh=shiftFor(e,d), ov=shiftPlanned(e,d);
      return `<td style="padding:2px">
        <button type="button" data-sp="${e.id}|${d}" title="${esc(e.name)} · ${d} · ${esc(sh.name)}${ov?' (สลับกะ)':''}"
          style="width:100%;min-width:34px;padding:4px 0;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer;
            border:1.5px ${ov?'solid':'dashed'} ${sh.color};background:${sh.color}1f;color:${sh.color}">
          ${esc(shiftShort(sh))}</button></td>`;
    }).join('');
    return `<tr><td style="position:sticky;left:0;background:var(--card);white-space:nowrap;padding-right:10px">
      <strong>${esc(e.name)}</strong><br><span class="muted" style="font-size:11px">${esc(e.code)}</span></td>${cells}</tr>`;
  }).join('');

  const p=el(`<div class="panel" style="margin-bottom:16px">
    <div class="phead" style="padding:12px 16px;font-weight:700">🔄 ตารางกะรายวัน — งวด ${esc(periodLabel(PERIOD))}
      <span class="muted" style="font-weight:400;font-size:13px">— กดที่ช่องเพื่อสลับกะทีละวัน · เส้นทึบ = สลับไว้เอง</span></div>
    <div class="pbody" style="padding:0">
      <div style="padding:11px 16px;display:flex;gap:8px;flex-wrap:wrap;align-items:center">
        <button class="btn sm" id="spBulk">📅 ตั้งกะเป็นช่วง</button>
        <button class="btn ghost sm" id="spSwap">🔁 สลับกะ 2 กลุ่ม</button>
        <button class="btn ghost sm" id="spRotate">♻️ หมุนเวียนกะ</button>
        <button class="btn ghost sm" id="spCopy">📋 คัดลอกจากงวดก่อน</button>
        <button class="btn ghost sm" id="spClear">↺ ล้างการสลับกะ</button>
        <span style="display:flex;gap:9px;flex-wrap:wrap;margin-left:auto">
          ${list.map(s=>`<span style="font-size:12px;display:inline-flex;align-items:center;gap:4px">
            <span style="width:12px;height:12px;border-radius:3px;background:${s.color};display:inline-block"></span>
            ${esc(s.name)} <span class="muted">${esc(s.start)}–${esc(s.end)}</span></span>`).join('')}
        </span>
      </div>
      <div class="tbl-wrap" style="max-height:340px;overflow:auto">
        <table style="font-size:12px"><thead><tr>
          <th style="position:sticky;left:0;background:var(--card);z-index:2">พนักงาน</th>${head}
        </tr></thead><tbody>${body}</tbody></table></div>
    </div></div>`);

  // กดช่อง → วนไปกะถัดไป ครบรอบแล้วกลับไปใช้กะประจำตัว
  p.querySelectorAll('[data-sp]').forEach(b=>b.onclick=()=>{
    const [eid,d]=b.dataset.sp.split('|');
    const emp=DB.employees.find(x=>x.id===eid); if(!emp) return;
    const cur=shiftFor(emp,d);
    const i=list.findIndex(s=>s.id===cur.id);
    const next=list[(i+1)%list.length];
    DB.shiftPlan[d]=DB.shiftPlan[d]||{};
    if(next.id===(emp.shiftId||list[0].id)) delete DB.shiftPlan[d][eid];   // ตรงกับกะประจำ → ไม่ต้องเก็บ
    else DB.shiftPlan[d][eid]=next.id;
    if(!Object.keys(DB.shiftPlan[d]).length) delete DB.shiftPlan[d];
    save(); render();
  });
  p.querySelector('#spClear').onclick=()=>{
    dates.forEach(d=>delete DB.shiftPlan[d]);
    save(); render(); toast('ล้างการสลับกะแล้ว');
  };
  p.querySelector('#spBulk').onclick=()=>shiftBulkModal(shown);
  p.querySelector('#spSwap').onclick=()=>shiftSwapModal(shown);
  p.querySelector('#spRotate').onclick=()=>shiftRotateModal(shown);
  p.querySelector('#spCopy').onclick=shiftCopyPrev;
  return p;
}


/* ---------- เครื่องมือจัดกะแบบยกชุด ---------- */
// เขียนกะลงตาราง — ถ้าตรงกับกะประจำตัวอยู่แล้วก็ไม่ต้องเก็บ (กันข้อมูลบวม)
function setShiftPlan(iso, emp, shId){
  const def=emp.shiftId||ensureShifts()[0].id;
  DB.shiftPlan[iso]=DB.shiftPlan[iso]||{};
  if(shId===def) delete DB.shiftPlan[iso][emp.id];
  else DB.shiftPlan[iso][emp.id]=shId;
  if(!Object.keys(DB.shiftPlan[iso]).length) delete DB.shiftPlan[iso];
}
// เขียนแบบดิบ (ใช้ตอนตรึงอดีต — ต้องเก็บแม้ค่าจะตรงกับกะประจำ)
function setShiftPlanRaw(iso, emp, shId){
  DB.shiftPlan[iso]=DB.shiftPlan[iso]||{};
  DB.shiftPlan[iso][emp.id]=shId;
}
// ทุกวันที่พนักงานคนนี้มีข้อมูลลงเวลา (ทุกงวด)
function attendDatesOf(emp){
  const out=[];
  Object.keys(DB.attend||{}).forEach(p=>{
    const m=DB.attend[p] && DB.attend[p][emp.id];
    if(m) out.push(...Object.keys(m));
  });
  return out;
}
/* เปลี่ยน "กะประจำ" แบบถาวร โดยไม่ให้กระทบวันที่คำนวณไปแล้ว
   วันเก่าที่มีข้อมูลลงเวลาและอยู่ก่อนวันเริ่ม จะถูกล็อกกะเดิมไว้ก่อนเปลี่ยน */
function applyPermanentShift(emps, fromIso, mapFn){
  // 1) ตรึงอดีต — เฉพาะวันที่มีข้อมูลลงเวลาจริง (วันอื่นไม่มีผลต่อการคำนวณ)
  emps.forEach(e=>{
    attendDatesOf(e).forEach(iso=>{
      if(iso < fromIso && !shiftPlanned(e,iso)) setShiftPlanRaw(iso, e, shiftFor(e,iso).id);
    });
  });
  // 2) จำค่าที่ตั้งไว้รายวันตั้งแต่วันเริ่มเป็นต้นไป แล้วแปลงตามกฎเดียวกัน
  const pend=[];
  emps.forEach(e=>{
    Object.keys(DB.shiftPlan).forEach(iso=>{
      if(iso < fromIso) return;
      const cur=DB.shiftPlan[iso][e.id]; if(!cur) return;
      const next=mapFn(cur); if(next && next!==cur) pend.push([iso,e,next]);
    });
  });
  // 3) เปลี่ยนกะประจำ
  emps.forEach(e=>{
    const def=e.shiftId||ensureShifts()[0].id;
    const next=mapFn(def); if(next) e.shiftId=next;
  });
  // 4) เขียนค่าที่ค้าง แล้วเก็บกวาดตัวที่ตรงกับกะประจำใหม่
  pend.forEach(([iso,e,id])=>setShiftPlan(iso,e,id));
  emps.forEach(e=>{
    Object.keys(DB.shiftPlan).forEach(iso=>{
      if(iso < fromIso) return;
      if(DB.shiftPlan[iso][e.id]===(e.shiftId||ensureShifts()[0].id)){
        delete DB.shiftPlan[iso][e.id];
        if(!Object.keys(DB.shiftPlan[iso]).length) delete DB.shiftPlan[iso];
      }
    });
  });
}

// วนทุกวันในช่วง เลือกเฉพาะวันในสัปดาห์ที่ติ๊กไว้
function eachDate(f, t, wds, fn){
  const [y1,m1,d1]=String(f).split('-').map(Number);
  const [y2,m2,d2]=String(t).split('-').map(Number);
  const D=new Date(y1,m1-1,d1), end=new Date(y2,m2-1,d2);
  let n=0, guard=0;
  while(D<=end && guard++<800){ if(!wds || wds.has(D.getDay())){ fn(isoOf(D)); n++; } D.setDate(D.getDate()+1); }
  return n;
}

/* ช่องเลือกพนักงานแบบมีตัวกรอง — ใช้ร่วมกันทุกเครื่องมือ */
function empPickerHtml(shown){
  const list=ensureShifts();
  const depts=[...new Set(shown.map(e=>e.dept).filter(Boolean))];
  return `<div class="field" style="margin-top:10px"><label>พนักงาน</label>
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin:5px 0 6px">
      <select id="epDept" style="max-width:150px"><option value="">ทุกแผนก</option>
        ${depts.map(d=>`<option value="${esc(d)}">${esc(d)}</option>`).join('')}</select>
      <select id="epShift" style="max-width:180px"><option value="">กะประจำ: ทุกกะ</option>
        ${list.map(s=>`<option value="${s.id}">กะประจำ: ${esc(s.name)}</option>`).join('')}</select>
      <button type="button" class="btn ghost sm" id="epAll">เลือกทั้งหมด</button>
      <button type="button" class="btn ghost sm" id="epNone">ล้าง</button>
    </div>
    <div style="max-height:170px;overflow:auto;border:1px solid var(--line);border-radius:9px;padding:8px">
      ${shown.map(e=>`<label class="epRow" data-dept="${esc(e.dept||'')}" data-shift="${esc(e.shiftId||list[0].id)}"
        style="display:block;font-size:13px;padding:2px 0">
        <input type="checkbox" class="epChk" value="${e.id}" checked> ${esc(e.code)} — ${esc(e.name)}
        ${e.dept?`<span class="muted" style="font-size:11.5px">· ${esc(e.dept)}</span>`:''}</label>`).join('')}
    </div>
    <div class="muted" style="font-size:12px;margin-top:5px" id="epCount"></div></div>`;
}
function wireEmpPicker(){
  const rows=[...document.querySelectorAll('.epRow')];
  const upd=()=>{ const n=document.querySelectorAll('.epChk:checked').length;
    const c=$('#epCount'); if(c) c.textContent=`เลือกแล้ว ${num(n)} คน`; };
  const filt=()=>{ const d=$('#epDept').value, s=$('#epShift').value;
    rows.forEach(r=>{ const ok=(!d||r.dataset.dept===d)&&(!s||r.dataset.shift===s);
      r.style.display=ok?'block':'none'; r.querySelector('.epChk').checked=ok; });
    upd(); };
  const dp=$('#epDept'), sp=$('#epShift');
  if(dp) dp.onchange=filt;
  if(sp) sp.onchange=filt;
  const ba=$('#epAll'), bn=$('#epNone');
  if(ba) ba.onclick=()=>{ rows.forEach(r=>{ if(r.style.display!=='none') r.querySelector('.epChk').checked=true; }); upd(); };
  if(bn) bn.onclick=()=>{ rows.forEach(r=>r.querySelector('.epChk').checked=false); upd(); };
  document.querySelectorAll('.epChk').forEach(x=>x.onchange=upd);
  upd();
}
function pickedEmps(){ return [...document.querySelectorAll('.epChk:checked')]
  .map(x=>DB.employees.find(e=>e.id===x.value)).filter(Boolean); }

/* ช่องติ๊กเปลี่ยนกะประจำด้วย */
function permaHtml(label){
  return `<label style="display:flex;gap:8px;align-items:flex-start;margin-top:12px;background:#fff7ed;
      border:1px solid #fed7aa;border-radius:9px;padding:10px 12px;cursor:pointer">
    <input type="checkbox" id="brPerma" style="margin-top:3px">
    <span style="font-size:13px;color:#9a3412"><strong>${label}</strong><br>
      คอลัมน์ “กะประจำ” จะเปลี่ยนตามด้วย และมีผลตั้งแต่<strong>วันที่เริ่ม</strong>เป็นต้นไป (ไม่สนใจวันสิ้นสุด)<br>
      วันก่อนหน้าที่ลงเวลาไว้แล้วจะถูกล็อกกะเดิมไว้ ตัวเลขเดิมไม่เปลี่ยน</span></label>`;
}
function isPerma(){ const x=$('#brPerma'); return !!(x && x.checked); }

/* ช่วงวันที่ + วันในสัปดาห์ */
function dateRangeHtml(){
  const {from,to}=periodRange(PERIOD);
  return `<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:10px">
      <div class="field"><label>ตั้งแต่วันที่</label><input type="date" id="brFrom" value="${isoOf(from)}"></div>
      <div class="field"><label>ถึงวันที่</label><input type="date" id="brTo" value="${isoOf(to)}"></div>
    </div>
    <div class="field" style="margin-top:10px"><label>เฉพาะวัน</label>
      <div style="display:flex;gap:5px;flex-wrap:wrap;margin-top:4px">
        ${WD_S.map((w,i)=>`<label style="display:inline-flex;align-items:center;gap:4px;font-size:13px;
          border:1px solid var(--line);border-radius:8px;padding:5px 9px;cursor:pointer">
          <input type="checkbox" class="brWd" value="${i}" checked> ${w}</label>`).join('')}
      </div></div>`;
}
function readRange(){
  const f=$('#brFrom').value, t=$('#brTo').value;
  if(!f||!t||daysBetween(f,t)===0){ toast('ช่วงวันที่ไม่ถูกต้อง'); return null; }
  const wds=new Set([...document.querySelectorAll('.brWd:checked')].map(x=>+x.value));
  if(!wds.size){ toast('ยังไม่ได้เลือกวันในสัปดาห์'); return null; }
  return {f,t,wds};
}

/* 1) ตั้งกะเป็นช่วงวันที่ */
function shiftBulkModal(shown){
  const list=ensureShifts();
  openModal('📅 ตั้งกะเป็นช่วงวันที่',
    `<div class="field"><label>ตั้งเป็นกะ</label><select id="sbShift">
      ${list.map(s=>`<option value="${s.id}">${esc(s.name)} (${esc(s.start)}–${esc(s.end)})</option>`).join('')}</select></div>
     ${dateRangeHtml()}${permaHtml('ตั้งเป็นกะประจำถาวร')}${empPickerHtml(shown)}`,
    [['ยกเลิก','ghost',closeModal],['ตั้งกะ','',()=>{
      const r=readRange(); if(!r) return;
      const emps=pickedEmps(); if(!emps.length){ toast('ยังไม่ได้เลือกพนักงาน'); return; }
      const shId=$('#sbShift').value;
      if(isPerma()){
        applyPermanentShift(emps, r.f, ()=>shId);
        save(); closeModal(); render();
        toast(`ตั้งกะประจำถาวรแล้ว ${num(emps.length)} คน`);
        return;
      }
      let n=0;
      eachDate(r.f,r.t,r.wds,iso=>{ emps.forEach(e=>{ setShiftPlan(iso,e,shId); n++; }); });
      save(); closeModal(); render(); toast(`ตั้งกะแล้ว ${num(n)} รายการ`);
    }]]);
  wireEmpPicker();
}

/* 2) สลับกะ 2 กลุ่ม — A↔B พร้อมกันในครั้งเดียว */
function shiftSwapModal(shown){
  const list=ensureShifts();
  if(list.length<2){ toast('ต้องมีอย่างน้อย 2 กะ'); return; }
  const opt=(sel)=>list.map((s,i)=>`<option value="${s.id}" ${i===sel?'selected':''}>${esc(s.name)} (${esc(s.start)}–${esc(s.end)})</option>`).join('');
  openModal('🔁 สลับกะ 2 กลุ่ม',
    `<p class="muted" style="font-size:13px;margin-bottom:6px">
       คนที่อยู่ <strong>กะ A</strong> จะย้ายไป <strong>กะ B</strong> และคนที่อยู่ <strong>กะ B</strong> จะย้ายมา <strong>กะ A</strong> — สลับพร้อมกันในครั้งเดียว<br>
       คนที่อยู่กะอื่นจะไม่ถูกแตะ</p>
     <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end">
       <div class="field"><label>กะ A</label><select id="swA">${opt(0)}</select></div>
       <div style="padding-bottom:10px;font-size:20px">🔁</div>
       <div class="field"><label>กะ B</label><select id="swB">${opt(1)}</select></div>
     </div>
     <div class="field" style="margin-top:6px"><label>รูปแบบการสลับ</label>
       <select id="swMode"><option value="once">สลับครั้งเดียว (ตามช่วงวันที่ด้านล่าง)</option><option value="cycle">สลับเป็นรอบ ๆ ไปเรื่อย ๆ</option></select></div>
     <div id="swCyc" style="display:none">
       <div style="display:flex;gap:10px;flex-wrap:wrap">
         <div class="field"><label>เปลี่ยนกะทุก ๆ</label>
           <select id="swEvery"><option value="1">1 วัน</option><option value="2">2 วัน</option><option value="3">3 วัน</option>
             <option value="7" selected>1 สัปดาห์</option><option value="14">2 สัปดาห์</option>
             <option value="m1">1 เดือน</option><option value="m2">2 เดือน</option><option value="m3">3 เดือน</option></select></div>
         <div class="field" id="swWdBox"><label>สลับกะทุกวัน</label>
           <select id="swWd"><option value="1" selected>จันทร์</option><option value="2">อังคาร</option><option value="3">พุธ</option>
             <option value="4">พฤหัสบดี</option><option value="5">ศุกร์</option><option value="6">เสาร์</option><option value="0">อาทิตย์</option></select></div>
         <div class="field"><label>เริ่มนับรอบจากวันที่</label><input type="date" id="swAnchor" value="${isoOf(periodRange(PERIOD).from)}"></div>
       </div>
       <p class="muted" id="swHint" style="font-size:12.5px;margin-top:4px"></p>
       <p class="muted" style="font-size:12.5px">รอบแรกทุกคนอยู่กะประจำของตัวเอง รอบถัดไปสลับ A↔B แล้วสลับกลับไปเรื่อย ๆ</p>
     </div>
     ${dateRangeHtml()}<div id="swPerma">${permaHtml('สลับกะประจำถาวร')}</div>${empPickerHtml(shown)}`,
    [['ยกเลิก','ghost',closeModal],['สลับกะ','',()=>{
      const A=$('#swA').value, B=$('#swB').value;
      if(A===B){ toast('เลือกกะให้ต่างกัน'); return; }
      const r=readRange(); if(!r) return;
      const emps=pickedEmps(); if(!emps.length){ toast('ยังไม่ได้เลือกพนักงาน'); return; }
      const swap=id=> id===A?B : id===B?A : null;
      if($('#swMode').value==='cycle'){
        const ev=$('#swEvery').value, anchor=$('#swAnchor').value;
        if(!anchor){ toast('ยังไม่ได้เลือกวันเริ่มนับรอบ'); return; }
        let n=0, who=new Set();
        eachDate(r.f,r.t,r.wds,iso=>{
          const odd=Math.abs(cycBlock(iso,ev,anchor,+$('#swWd').value))%2===1;
          emps.forEach(e=>{ const base=e.shiftId||list[0].id; if(base!==A&&base!==B) return;
            setShiftPlan(iso,e,odd?swap(base):base); n++; who.add(e.id); });
        });
        save(); closeModal(); render();
        toast(n?`สร้างตารางสลับกะเป็นรอบแล้ว ${num(who.size)} คน`:'ไม่มีใครมีกะประจำเป็นสองกะนี้');
        return;
      }
      if(isPerma()){
        const affected=emps.filter(e=>{ const d=e.shiftId||list[0].id; return d===A||d===B; });
        applyPermanentShift(emps, r.f, swap);
        save(); closeModal(); render();
        toast(affected.length?`สลับกะประจำถาวรแล้ว ${num(affected.length)} คน`:'ไม่มีใครอยู่ในสองกะนี้');
        return;
      }
      let n=0;
      eachDate(r.f,r.t,r.wds,iso=>{
        // อ่านกะเดิมของทุกคนก่อน แล้วค่อยเขียน — กันเขียนทับกันเองระหว่างสลับ
        const cur=emps.map(e=>[e, shiftFor(e,iso).id]);
        cur.forEach(([e,id])=>{
          const nx=swap(id); if(nx){ setShiftPlan(iso,e,nx); n++; }
        });
      });
      save(); closeModal(); render();
      toast(n?`สลับกะแล้ว ${num(n)} รายการ`:'ไม่มีใครอยู่ในสองกะนี้ในช่วงที่เลือก');
    }]]);
  wireEmpPicker();
  { const TH=['อาทิตย์','จันทร์','อังคาร','พุธ','พฤหัสบดี','ศุกร์','เสาร์'];
    const upd=()=>{ const cyc=$('#swMode').value==='cycle'; $('#swCyc').style.display=cyc?'':'none'; $('#swPerma').style.display=cyc?'none':'';
      const ev=$('#swEvery').value, wk=(ev==='7'||ev==='14'); $('#swWdBox').style.display=wk?'':'none';
      const a=$('#swAnchor').value, day=a?+a.split('-')[2]:null;
      $('#swHint').textContent= wk?`สลับกะทุกวัน${TH[+$('#swWd').value]} ทุก ${ev==='7'?'1':'2'} สัปดาห์`
        : ev[0]==='m' ? (day?`สลับกะทุกวันที่ ${day} ของเดือน ทุก ${ev.slice(1)} เดือน`:'') : `สลับกะทุก ${ev} วัน นับจากวันเริ่ม`; };
    ['swMode','swEvery','swWd','swAnchor'].forEach(id=>$('#'+id).addEventListener('change',upd)); upd(); }
}
/* ลำดับรอบของวัน iso — ใช้ร่วมกันระหว่างสลับกะเป็นรอบ */
function cycBlock(iso, ev, anchor, wd){
  const months=ev[0]==='m'?+ev.slice(1):0, every=months?0:(+ev||7);
  const [ay,am,ad]=anchor.split('-').map(Number); let A0=new Date(ay,am-1,ad);
  if(every===7||every===14) A0=new Date(ay,am-1,ad-((A0.getDay()-wd+7)%7));
  const [y,m,d]=iso.split('-').map(Number);
  if(months){ let diff=(y*12+m)-(ay*12+am); if(d<ad) diff--; return Math.floor(diff/months); }
  return Math.floor(Math.round((new Date(y,m-1,d)-A0)/86400000)/every);
}

/* 3) หมุนเวียนกะอัตโนมัติ — วนกะทุก N วัน แต่ละคนเริ่มจากกะประจำตัวเอง (กลุ่มจึงเหลื่อมกันเอง) */
function shiftRotateModal(shown){
  const list=ensureShifts();
  if(list.length<2){ toast('ต้องมีอย่างน้อย 2 กะ'); return; }
  openModal('♻️ หมุนเวียนกะอัตโนมัติ',
    `<p class="muted" style="font-size:13px;margin-bottom:8px">
       สร้างตารางหมุนกะให้ทั้งช่วงในครั้งเดียว — แต่ละคน<strong>เริ่มจากกะประจำตัวเอง</strong>
       แล้ววนไปกะถัดไปทุก ๆ รอบ กลุ่มที่ตั้งกะประจำต่างกันจึงหมุนเหลื่อมกันโดยอัตโนมัติ</p>
     <div class="field"><label>กะที่ร่วมหมุนเวียน (ตามลำดับ)</label>
       <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:5px">
         ${list.map((s,i)=>`<label style="display:inline-flex;align-items:center;gap:5px;font-size:13px;
           border:1.5px solid ${s.color};border-radius:8px;padding:5px 10px;cursor:pointer;background:${s.color}14">
           <input type="checkbox" class="roSh" value="${s.id}" checked> ${i+1}. ${esc(s.name)}</label>`).join('')}
       </div></div>
     <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:10px">
       <div class="field"><label>เปลี่ยนกะทุก ๆ</label>
         <select id="roEvery">
           <option value="1">1 วัน</option>
           <option value="2">2 วัน</option>
           <option value="3">3 วัน</option>
           <option value="7" selected>1 สัปดาห์</option>
           <option value="14">2 สัปดาห์</option>
           <option value="m1">1 เดือน</option>
           <option value="m2">2 เดือน</option>
           <option value="m3">3 เดือน</option>
         </select></div>
       <div class="field" id="roWdBox"><label>สลับกะทุกวัน</label>
         <select id="roWd">
           <option value="1" selected>จันทร์</option><option value="2">อังคาร</option><option value="3">พุธ</option>
           <option value="4">พฤหัสบดี</option><option value="5">ศุกร์</option><option value="6">เสาร์</option><option value="0">อาทิตย์</option>
         </select></div>
       <div class="field"><label>เริ่มนับรอบจากวันที่</label><input type="date" id="roAnchor" value="${isoOf(periodRange(PERIOD).from)}"></div>
     </div>
     <p class="muted" id="roHint" style="font-size:12.5px;margin-top:4px"></p>
     ${dateRangeHtml()}${empPickerHtml(shown)}`,
    [['ยกเลิก','ghost',closeModal],['สร้างตารางหมุนกะ','',()=>{
      const ids=[...document.querySelectorAll('.roSh:checked')].map(x=>x.value);
      if(ids.length<2){ toast('เลือกกะที่ร่วมหมุนอย่างน้อย 2 กะ'); return; }
      const ev=$('#roEvery').value;
      const months=ev[0]==='m' ? +ev.slice(1) : 0;
      const every=months ? 0 : (+ev||7);
      const anchor=$('#roAnchor').value;
      if(!anchor){ toast('ยังไม่ได้เลือกวันเริ่มนับรอบ'); return; }
      const r=readRange(); if(!r) return;
      const emps=pickedEmps(); if(!emps.length){ toast('ยังไม่ได้เลือกพนักงาน'); return; }
      const [ay,am,ad]=anchor.split('-').map(Number); let A0=new Date(ay,am-1,ad);
      /* รายสัปดาห์: ขยับจุดเริ่มถอยไปยังวันสลับกะที่เลือก รอบจึงตัดตรงวันนั้นทุกครั้ง */
      if(every===7||every===14){ const wd=+$('#roWd').value; A0=new Date(ay,am-1,ad-((A0.getDay()-wd+7)%7)); }
      let n=0;
      eachDate(r.f,r.t,r.wds,iso=>{
        const [y,m,d]=iso.split('-').map(Number);
        let block;
        if(months){ /* รายเดือน: เปลี่ยนกะในวันที่เดียวกับวันเริ่มนับของทุกเดือน */
          let diff=(y*12+m)-(ay*12+am); if(d<ad) diff--;
          block=Math.floor(diff/months);
        } else block=Math.floor(Math.round((new Date(y,m-1,d)-A0)/86400000)/every);
        emps.forEach(e=>{
          const def=e.shiftId||list[0].id;
          let start=ids.indexOf(def); if(start<0) start=0;      // กะประจำไม่ได้ร่วมหมุน → เริ่มที่ตัวแรก
          const idx=(((start+block)%ids.length)+ids.length)%ids.length;
          setShiftPlan(iso,e,ids[idx]); n++;
        });
      });
      save(); closeModal(); render(); toast(`สร้างตารางหมุนกะแล้ว ${num(n)} รายการ`);
    }]]);
  wireEmpPicker();
  /* แสดงตัวเลือกวันสลับกะเฉพาะรอบรายสัปดาห์ และคำอธิบายว่ารอบตัดวันไหน */
  (function(){
    const TH=['อาทิตย์','จันทร์','อังคาร','พุธ','พฤหัสบดี','ศุกร์','เสาร์'];
    const upd=()=>{
      const ev=$('#roEvery').value, wk=(ev==='7'||ev==='14');
      $('#roWdBox').style.display=wk?'':'none';
      const a=$('#roAnchor').value, day=a?+a.split('-')[2]:null;
      let h='';
      if(wk) h=`สลับกะทุกวัน${TH[+$('#roWd').value]} ทุก ${ev==='7'?'1':'2'} สัปดาห์`;
      else if(ev[0]==='m') h=day?`สลับกะทุกวันที่ ${day} ของเดือน ทุก ${ev.slice(1)} เดือน${day>28?' (เดือนที่ไม่มีวันนี้ จะสลับวันแรกของเดือนถัดไป)':''}`:'';
      else h=`สลับกะทุก ${ev} วัน นับจากวันเริ่ม`;
      $('#roHint').textContent=h;
    };
    ['roEvery','roWd','roAnchor'].forEach(id=>$('#'+id).addEventListener('change',upd)); upd();
  })();
  /* ติ๊กกะออก = กะนั้นไม่ร่วมหมุนเวียน คนที่มีกะประจำเป็นกะนั้นจึงไม่ควรถูกจัดตารางด้วย
     จึงติ๊กชื่อออกให้อัตโนมัติ และติ๊กกลับให้เมื่อเลือกกะนั้นคืน */
  (function(){
    const rows=[...document.querySelectorAll('.epRow')];
    const refresh=()=>{ const ck=document.querySelector('.epChk'); if(ck) ck.dispatchEvent(new Event('change')); };
    document.querySelectorAll('.roSh').forEach(sh=>{
      sh.addEventListener('change', ()=>{
        rows.forEach(r=>{
          if(r.dataset.shift!==sh.value) return;
          if(r.style.display==='none') return;          /* ถูกกรองซ่อนอยู่ ไม่ต้องยุ่ง */
          const ck=r.querySelector('.epChk'); if(ck) ck.checked=sh.checked;
        });
        refresh();
      });
    });
  })();
}

/* 4) คัดลอกตารางกะจากงวดก่อน (จับคู่ตามลำดับวันในงวด) */
function shiftCopyPrev(){
  const [y,m]=PERIOD.split('-').map(Number);
  const prev=`${m===1?y-1:y}-${pad2(m===1?12:m-1)}`;
  const src=periodDates(prev), dst=periodDates(PERIOD);
  let found=0;
  src.forEach(d=>{ if(DB.shiftPlan[d]) found+=Object.keys(DB.shiftPlan[d]).length; });
  if(!found){ toast(`งวด ${periodLabel(prev)} ไม่มีการสลับกะให้คัดลอก`); return; }
  openModal('📋 คัดลอกตารางกะจากงวดก่อน',
    `<p>คัดลอกการสลับกะจากงวด <strong>${esc(periodLabel(prev))}</strong> (${num(found)} รายการ)
       มาที่งวด <strong>${esc(periodLabel(PERIOD))}</strong></p>
     <p class="muted" style="font-size:12.5px">จับคู่ตามลำดับวันในงวด — วันแรกของงวดก่อน → วันแรกของงวดนี้
       ${src.length!==dst.length?`<br>⚠️ งวดก่อนมี ${src.length} วัน งวดนี้มี ${dst.length} วัน — วันที่เกินจะถูกข้าม`:''}</p>
     <p style="color:#b45309;font-size:13px">การสลับกะเดิมในงวดนี้จะถูกแทนที่ทั้งหมด</p>`,
    [['ยกเลิก','ghost',closeModal],['คัดลอก','',()=>{
      dst.forEach(d=>delete DB.shiftPlan[d]);
      let n=0;
      const len=Math.min(src.length,dst.length);
      for(let i=0;i<len;i++){
        const s=DB.shiftPlan[src[i]]; if(!s) continue;
        Object.keys(s).forEach(eid=>{
          const emp=DB.employees.find(x=>x.id===eid); if(!emp) return;
          setShiftPlan(dst[i], emp, s[eid]); n++;
        });
      }
      save(); closeModal(); render(); toast(`คัดลอกแล้ว ${num(n)} รายการ`);
    }]]);
}

// แผงตั้งค่า "วันไหนเปิด OT" — รายสัปดาห์ + กำหนดเฉพาะวันในงวดนี้
function otDaysPanel(){
  if(!Array.isArray(DB.otWeekdays)) DB.otWeekdays=[true,true,true,true,true,true,true];
  if(!DB.otDates || typeof DB.otDates!=='object') DB.otDates={};
  const dates=periodDates(PERIOD);
  const nOpen=dates.filter(otAllowed).length;
  const nOver=dates.filter(otOverridden).length;

  const wdBtns=WD_TH.map((lab,i)=>{
    const on=!!DB.otWeekdays[i];
    return `<button type="button" data-wd="${i}" title="${lab}"
      style="min-width:52px;padding:8px 10px;border-radius:9px;font-weight:700;font-size:14px;cursor:pointer;
        border:1.5px solid ${on?'#0f766e':'#e2e8f0'};background:${on?'#ccfbf1':'#fff'};color:${on?'#0f766e':'#94a3b8'}">
      ${WD_S[i]}</button>`;
  }).join('');

  const chips=dates.map(d=>{
    const on=otAllowed(d), ov=otOverridden(d);
    return `<button type="button" data-otd="${d}" title="${d} (${WD_TH[weekdayOf(d)]})${isHoliday(d)?' 🎌 '+esc(holidayName(d)):''} — ${on?'เปิด OT':'ปิด OT'}${ov?' · กำหนดเอง':''}"
      style="width:42px;padding:6px 0;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;
        border:1.5px ${ov?'solid':'dashed'} ${on?'#0f766e':'#cbd5e1'};
        background:${on?'#ccfbf1':'#f8fafc'};color:${on?'#0f766e':'#94a3b8'}">
      ${+d.slice(8)}${ov?'<span style="color:#f59e0b">•</span>':''}${isHoliday(d)?'<span style="color:#dc2626">🎌</span>':''}</button>`;
  }).join('');

  const wdMulBtns=WD_TH.map((lab,i)=>{
    const cur=otMultWeekday(i);
    return `<div style="text-align:center">
      <div class="muted" style="font-size:12px;margin-bottom:3px">${WD_S[i]}</div>
      <select data-wdm="${i}" style="padding:5px 4px;font-size:12.5px;width:66px">
        ${OT_MULT_STEPS.map(v=>`<option value="${v}" ${cur===v?'selected':''}>${v}×</option>`).join('')}
      </select></div>`;
  }).join('');
  const nMulOver=dates.filter(otMultOverridden).length;
  const mulChips=dates.map(d=>{
    if(!otAllowed(d)) return '';                       // วันที่ปิด OT ไม่ต้องตั้งตัวคูณ
    const m=otMultFor(d), ov=otMultOverridden(d);
    return `<button type="button" data-otm="${d}" title="${d} (${WD_TH[weekdayOf(d)]}) — ตัวคูณ ${m}× ${ov?'(กำหนดเอง — มีผลเหนือวันหยุดและวันในสัปดาห์)':isHoliday(d)?'(วันหยุดบริษัท: '+esc(holidayName(d))+')':'(ตามวันในสัปดาห์)'} · กดเพื่อเปลี่ยน"
      style="min-width:50px;padding:5px 3px;border-radius:8px;font-size:12.5px;font-weight:700;cursor:pointer;line-height:1.35;
        border:1.5px ${ov?'solid':'dashed'} ${isHoliday(d)&&!ov?'#dc2626':'#0f766e'};background:${ov?'#ccfbf1':isHoliday(d)?'#fff1f2':'#fff'};color:${isHoliday(d)&&!ov?'#b91c1c':'#0f766e'}">
      ${+d.slice(8)}${isHoliday(d)?'🎌':''}<br><span style="font-size:11px;font-weight:600">${m}×</span></button>`;
  }).join('');

  const panel=el(`<div class="panel" style="margin-bottom:16px">
    <div class="phead" style="padding:12px 16px;font-weight:700">⚡ วันที่เปิดให้คิด OT
      <span class="muted" style="font-weight:400;font-size:13px">— งวดนี้เปิด ${num(nOpen)} / ${num(dates.length)} วัน${nOver?` · กำหนดเอง ${num(nOver)} วัน`:''}</span></div>
    <div class="pbody">
      <div style="font-size:13.5px;font-weight:700;margin-bottom:7px">เปิด OT ตามวันในสัปดาห์</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px">${wdBtns}</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px">
        <button class="btn ghost sm" id="otAllOn">เปิดทุกวัน</button>
        <button class="btn ghost sm" id="otWorkOnly">จ–ศ เท่านั้น</button>
        <button class="btn ghost sm" id="otAllOff">ปิดทุกวัน</button>
      </div>

      <div style="font-size:13.5px;font-weight:700;margin-bottom:4px">กำหนดเฉพาะวัน — งวด ${esc(periodLabel(PERIOD))}</div>
      <div class="muted" style="font-size:12.5px;margin-bottom:8px">กดที่วันที่เพื่อสลับเปิด/ปิด (ทับค่ารายสัปดาห์) · จุดสีเหลือง = กำหนดเอง</div>
      <div style="display:flex;gap:5px;flex-wrap:wrap">${chips}</div>
      ${nOver?`<button class="btn ghost sm" id="otClr" style="margin-top:11px">↺ ล้างที่กำหนดเองในงวดนี้ (${num(nOver)} วัน)</button>`:''}

      <div style="border-top:1px solid var(--line);margin-top:16px;padding-top:14px">
        <div style="font-size:13.5px;font-weight:700;margin-bottom:4px">ตัวคูณ OT — วันไหนคูณเท่าไร</div>
        <div class="muted" style="font-size:12.5px;margin-bottom:8px">
          ตั้งตามวันในสัปดาห์ก่อน แล้วกดที่วันที่ด้านล่างเพื่อกำหนดเฉพาะวัน (เช่น วันหยุดนักขัตฤกษ์)</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">${wdMulBtns}</div>
        <div class="muted" style="font-size:12.5px;margin-bottom:6px">กำหนดเฉพาะวัน — กดที่วันที่เพื่อวนเปลี่ยนตัวคูณ · กรอบทึบ = กำหนดเอง</div>
        <div style="display:flex;gap:5px;flex-wrap:wrap">${mulChips}</div>
        ${nMulOver?`<button class="btn ghost sm" id="otMulClr" style="margin-top:11px">↺ ล้างตัวคูณที่กำหนดเองในงวดนี้ (${num(nMulOver)} วัน)</button>`:''}
      </div>

      <div style="border-top:1px solid var(--line);margin-top:16px;padding-top:14px">
        <div style="font-size:13.5px;font-weight:700;margin-bottom:6px">เพดาน OT ต่อวัน</div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end">
          <div class="field" style="max-width:150px"><label>ไม่เกินวันละ (ชม.)</label>
            <input type="number" id="otCap" min="0" step="0.5" value="${+DB.otMaxDay||0}"></div>
          <button class="btn ghost sm" id="otCapSave">💾 บันทึกเพดาน</button>
          <span class="muted" style="font-size:12.5px">ใส่ <strong>0</strong> = ไม่จำกัด · ชั่วโมงที่เกินจะถูกตัดออก ไม่นำไปคิดเงิน<br>
            แต่ละคนแต่ละวันไม่เท่ากัน ใช้ “กรอก OT อนุมัติตามวันที่” ด้านล่าง</span>
        </div>
      </div>

      <div style="border-top:1px solid var(--line);margin-top:16px;padding-top:14px">
        <div style="font-size:13.5px;font-weight:700;margin-bottom:4px">เปิด OT เฉพาะบางคน</div>
        <div class="muted" style="font-size:12.5px;margin-bottom:8px">
          ปัจจุบันเปิดให้ <strong>${num(DB.employees.filter(otPerson).length)}</strong> / ${num(DB.employees.length)} คน
          — กดสลับรายคนได้ที่คอลัมน์ <strong>“สิทธิ์ OT”</strong> ในตารางด้านล่าง</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn ghost sm" id="otpAll">เปิดให้ทุกคน</button>
          <button class="btn ghost sm" id="otpNone">ปิดทุกคน</button>
          <button class="btn ghost sm" id="otpDaily">เปิดเฉพาะพนักงานรายวัน</button>
          <button class="btn ghost sm" id="otpMonthly">เปิดเฉพาะพนักงานรายเดือน</button>
        </div>
      </div>
      <div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--line)">
        <div style="font-size:13.5px;font-weight:700;margin-bottom:4px">OT อนุมัติรายวัน (แต่ละคนไม่เท่ากัน)</div>
        <div class="muted" style="font-size:12.5px;margin-bottom:8px">เลือกวันที่ แล้วกรอกชั่วโมง OT ที่อนุมัติของทุกคนในวันนั้นในหน้าเดียว</div>
        <button class="btn sm" id="otByDate">🗓️ กรอก OT อนุมัติตามวันที่</button>
      </div>

      <div style="margin-top:14px;padding:11px 13px;background:#f8fafc;border-radius:10px;font-size:12.5px;color:var(--muted)">
        คิด OT ให้เมื่อ <strong>คนนั้นเปิดสิทธิ์</strong> และ <strong>วันนั้นเปิด OT</strong> พร้อมกัน<br>
        วันที่ <strong>ปิด OT</strong> ระบบจะไม่นำเวลาที่อยู่เกินเวลาเลิกงานมาคิดเป็น OT
        แต่ยังนับวันทำงาน มาสาย และออกก่อนตามปกติ — ชั่วโมงที่ถูกตัดออกดูรวมได้ที่การ์ด <strong>“รวม OT”</strong> ด้านบน
      </div>
    </div></div>`);

  panel.querySelectorAll('[data-wd]').forEach(b=>b.onclick=()=>{
    const i=+b.dataset.wd; DB.otWeekdays[i]=!DB.otWeekdays[i]; save(); render();
  });
  // ตัวคูณตามวันในสัปดาห์
  panel.querySelectorAll('[data-wdm]').forEach(s=>s.onchange=()=>{
    if(!Array.isArray(DB.otMultWeekdays)) DB.otMultWeekdays=[1.5,1.5,1.5,1.5,1.5,1.5,1.5];
    DB.otMultWeekdays[+s.dataset.wdm]=+s.value||1.5; save(); render();
    toast('ตั้งตัวคูณวัน'+WD_TH[+s.dataset.wdm]+' = '+(+s.value)+'×');
  });
  // ตัวคูณเฉพาะวัน — กดวนไปเรื่อย ๆ ถ้าวนมาตรงกับค่ารายสัปดาห์จะล้างการกำหนดเอง
  panel.querySelectorAll('[data-otm]').forEach(b=>b.onclick=()=>{
    const d=b.dataset.otm;
    DB.otMultDates=DB.otMultDates||{};
    const cur=otMultFor(d);
    const i=OT_MULT_STEPS.indexOf(cur);
    const next=OT_MULT_STEPS[(i+1)%OT_MULT_STEPS.length];
    const base=isHoliday(d)?(+DB.holidayOtMult||3):otMultWeekday(weekdayOf(d));   // ค่าที่ใช้ถ้าไม่กำหนดเอง
    if(next===base) delete DB.otMultDates[d];
    else DB.otMultDates[d]=next;
    save(); render();
  });
  const mulClr=panel.querySelector('#otMulClr');
  if(mulClr) mulClr.onclick=()=>{
    dates.forEach(d=>{ if(DB.otMultDates) delete DB.otMultDates[d]; });
    save(); render(); toast('ล้างตัวคูณที่กำหนดเองแล้ว');
  };
  panel.querySelector('#otAllOn').onclick=()=>{ DB.otWeekdays=[true,true,true,true,true,true,true]; save(); render(); };
  panel.querySelector('#otWorkOnly').onclick=()=>{ DB.otWeekdays=[false,true,true,true,true,true,false]; save(); render(); };
  panel.querySelector('#otAllOff').onclick=()=>{ DB.otWeekdays=[false,false,false,false,false,false,false]; save(); render(); };
  panel.querySelectorAll('[data-otd]').forEach(b=>b.onclick=()=>{
    const d=b.dataset.otd, wdDefault=!!DB.otWeekdays[weekdayOf(d)];
    const next=!otAllowed(d);
    if(next===wdDefault) delete DB.otDates[d];   // กลับไปตรงกับค่ารายสัปดาห์ → ไม่ต้องเก็บ
    else DB.otDates[d]=next;
    save(); render();
  });
  const clr=panel.querySelector('#otClr');
  if(clr) clr.onclick=()=>{ dates.forEach(d=>delete DB.otDates[d]); save(); render(); toast('ล้างที่กำหนดเองแล้ว'); };
  const setAll=(fn)=>{ DB.employees.forEach(e=>{ if(fn(e)) delete e.noOT; else e.noOT=1; });
    save(); render(); toast('ตั้งสิทธิ์ OT รายคนแล้ว'); };
  panel.querySelector('#otCapSave').onclick=()=>{
    DB.otMaxDay=Math.max(0,+panel.querySelector('#otCap').value||0);
    save(); render(); toast(DB.otMaxDay? `ตั้งเพดาน OT วันละ ${num(DB.otMaxDay)} ชม.` : 'ยกเลิกเพดาน OT แล้ว');
  };
  panel.querySelector('#otpAll').onclick=()=>setAll(()=>true);
  panel.querySelector('#otpNone').onclick=()=>setAll(()=>false);
  panel.querySelector('#otpDaily').onclick=()=>setAll(e=>e.payType==='daily');
  panel.querySelector('#otpMonthly').onclick=()=>setAll(e=>e.payType!=='daily');
  panel.querySelector('#otByDate').onclick=()=>otByDateModal();
  return panel;
}

// ตารางเวลารายวันของพนักงาน 1 คน — แก้ไขได้ทีละช่อง
/* OT อนุมัติตามวันที่ — วันเดียว กรอกได้ทุกคน (ค่าเก็บที่ attend[งวด][คน][วัน].c เหมือนหน้ารายวันของแต่ละคน) */
function otByDateModal(pick){
  const dates=periodDates(PERIOD);
  const today=isoOf(new Date());
  const day=pick || (dates.includes(today)?today:dates[0]);
  ensureShifts();
  const list=DB.employees.filter(e=>!resignedBefore(e,PERIOD));
  const rows=list.map(e=>{
    const r=attendOf(PERIOD,e.id)[day]||{};
    const sh=shiftFor(e,day);
    const {OM:om,E:we}=punchMinutes(sh,r.i,r.o);
    const raw=(om!=null&&om>we)?otHalfHours(om-we):0;
    const ok=otAllowedFor(e,day);
    const cap=otCapDay(e,r), got=!ok?0:((cap>=0&&raw>cap)?cap:raw);
    const v=(r.c!=null&&r.c!=='')?r.c:'';
    return `<tr>
      <td>${esc(e.code)}</td><td>${esc(e.name)}<br><span class="muted" style="font-size:11px">${esc(sh.name)}</span></td>
      <td>${r.i||'<span class="muted">-</span>'}–${r.o||'<span class="muted">-</span>'}</td>
      <td class="num">${raw?num(raw):'<span class="muted">-</span>'}</td>
      <td>${ok?`<input type="number" min="0" step="0.5" data-obd="${e.id}" value="${v}" placeholder="${otCapFor(e)>0?num(otCapFor(e)):'∞'}" style="width:70px;padding:5px 6px">`
             :`<span class="chip" style="background:#f1f5f9;color:#64748b">${!otPerson(e)?'คนนี้ปิด OT':'วันนี้ปิด OT'}</span>`}</td>
      <td class="num"><strong style="color:#0d9488">${got?num(got):'-'}</strong></td>
    </tr>`;
  }).join('');
  openModal('🗓️ OT อนุมัติตามวันที่',
    `<div class="field" style="max-width:260px"><label>วันที่</label>
       <select id="obdDay">${dates.map(d=>`<option value="${d}" ${d===day?'selected':''}>${d.slice(8)}/${d.slice(5,7)}/${+d.slice(0,4)+543} (${WD_S[new Date(d+'T00:00:00').getDay()]})</option>`).join('')}</select></div>
     <div style="display:flex;gap:6px;flex-wrap:wrap;margin:8px 0">
       <input type="number" id="obdAll" min="0" step="0.5" placeholder="ชม." style="width:80px;padding:5px 6px">
       <button class="btn ghost sm" id="obdFill">ใส่ค่านี้ให้ทุกคนที่ว่าง</button>
       <button class="btn ghost sm" id="obdClear">ล้างทั้งหมด</button>
     </div>
     <div class="tbl-wrap" style="max-height:50vh;overflow:auto"><table>
       <thead><tr><th>รหัส</th><th>ชื่อ</th><th>เข้า–ออก</th><th class="num">อยู่เกิน (ชม.)</th><th>OT อนุมัติ (ชม.)</th><th class="num">คิด OT</th></tr></thead>
       <tbody>${rows}</tbody></table></div>
     <p class="muted" style="font-size:12.5px;margin-top:8px">เว้นว่าง = ใช้เพดานปกติของคนนั้น · 0 = วันนี้ไม่คิด OT · ระบบคิดไม่เกินเวลาที่อยู่เกินจริง<br>
     เปลี่ยนวันที่ระบบจะถามก่อนถ้ายังไม่ได้บันทึก</p>`,
    [['ปิด','ghost',closeModal],['💾 บันทึก','',()=>{ otByDateSave(day); save(); closeModal(); render(); toast('บันทึก OT อนุมัติแล้ว'); }]]);
  const m=$('#modal'); let dirty=false;
  m.querySelectorAll('[data-obd]').forEach(i=>i.addEventListener('input',()=>dirty=true));
  m.querySelector('#obdFill').onclick=()=>{ const v=m.querySelector('#obdAll').value; if(v==='') return;
    m.querySelectorAll('[data-obd]').forEach(i=>{ if(i.value===''){ i.value=v; dirty=true; } }); };
  m.querySelector('#obdClear').onclick=()=>{ m.querySelectorAll('[data-obd]').forEach(i=>i.value=''); dirty=true; };
  m.querySelector('#obdDay').onchange=ev=>{
    if(dirty && confirm('บันทึกค่าของวันนี้ก่อนเปลี่ยนวันไหม?')){ otByDateSave(day); save(); }
    otByDateModal(ev.target.value);
  };
}
function otByDateSave(day){
  const box=ensureAttend(PERIOD);
  $('#modal').querySelectorAll('[data-obd]').forEach(inp=>{
    const id=inp.dataset.obd; const v=inp.value;
    if(!box[id]) box[id]={};
    const r=box[id][day];
    if(v===''){ if(r){ delete r.c; if(!r.i&&!r.o) delete box[id][day]; } }
    else { box[id][day]=Object.assign(r||{i:'',o:''},{c:Math.max(0,+v||0)}); }
    if(!Object.keys(box[id]).length) delete box[id];
  });
}
function attendDetailModal(empId){
  const emp=DB.employees.find(e=>e.id===empId); if(!emp) return;
  const rec=attendOf(PERIOD, empId);
  ensureShifts();
  const rows=periodDates(PERIOD).map(d=>{
    const r=rec[d]||{}; const im=hm2min(r.i), om=hm2min(r.o);
    const dt=new Date(d+'T00:00:00'); const wk=dt.getDay();
    const sh=shiftFor(emp, d);
    const {IM:im2, OM:om2, S:ws2, E:we2, grace:gr2}=punchMinutes(sh, r.i, r.o);
    const isLate=im2!=null && im2>ws2+gr2;
    const rawOver=(om2!=null&&om2>we2)?otHalfHours(om2-we2):0;
    const capD=otCapDay(emp, r);
    const over=(capD>=0 && rawOver>capD) ? capD : rawOver;
    const dayCap=(r.c!=null && r.c!=='') ? r.c : '';
    const capped=over<rawOver;
    const okOT=otAllowedFor(emp, d);
    return `<tr style="${isHoliday(d)?'background:#fff1f2':(wk===0||wk===6?'background:#f8fafc':'')}">
      <td style="white-space:nowrap">${d.slice(8)}/${d.slice(5,7)}<br><span class="muted" style="font-size:11px">${WD_S[wk]}</span>${isHoliday(d)?`<br><span class="chip" style="background:#fee2e2;color:#b91c1c;font-size:10.5px;padding:1px 6px" title="${esc(holidayName(d))}">🎌 วันหยุด</span>`:''}</td>
      <td>${t24(`data-ai="${d}"`, r.i||'', isLate?'color:#dc2626;font-weight:700':'')}</td>
      <td>${t24(`data-ao="${d}"`, r.o||'')}</td>
      <td class="num">${!rawOver?'<span class="muted">-</span>'
        : okOT ? `<strong style="color:#0d9488">${num(over)}</strong>${capped?`<br><span style="font-size:11px;color:#b45309" title="${dayCap!==''?'OT อนุมัติวันนี้':'เกินเพดานวันละ'} ${num(capD)} ชม.">จาก ${num(rawOver)}</span>`:''}`
               : `<span style="color:#94a3b8;text-decoration:line-through">${num(rawOver)}</span>`}</td>
      <td><input type="number" min="0" step="0.5" data-ac="${d}" value="${dayCap}" placeholder="${otCapFor(emp)>0?num(otCapFor(emp)):'∞'}"
        style="width:62px;padding:5px 6px;font-size:13px" title="OT อนุมัติวันนี้ (ชม.) — เว้นว่าง = ใช้เพดานปกติ · 0 = ไม่คิด OT วันนี้"></td>
      <td><span class="chip" title="${esc(sh.start)}–${esc(sh.end)}"
        style="background:${sh.color}1f;color:${sh.color}">${esc(sh.name)}</span>
        ${shiftPlanned(emp,d)?'<br><span class="muted" style="font-size:10.5px">สลับกะ</span>':''}</td>
      <td>${okOT?'<span class="chip" style="background:#ccfbf1;color:#0f766e">เปิด OT</span>'
        : !otPerson(emp) ? '<span class="chip" style="background:#fef3c7;color:#b45309">คนนี้ปิด OT</span>'
        : '<span class="chip" style="background:#f1f5f9;color:#64748b">วันนี้ปิด OT</span>'}</td>
      <td>${isLate?'<span class="chip" style="background:#fee2e2;color:#dc2626">สาย</span>':(im!=null?'<span class="chip" style="background:#dcfce7;color:#16a34a">ปกติ</span>':'')}</td>
    </tr>`;
  }).join('');
  openModal(`⏰ เวลาเข้างาน — ${emp.name}`,
    `${!otPerson(emp)?`<div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:9px;
       padding:9px 12px;margin-bottom:10px;font-size:12.5px;color:#9a3412">
       ⚠️ พนักงานคนนี้<strong>ปิดสิทธิ์ OT</strong> — เวลาที่อยู่เกินจะไม่ถูกคิดเป็น OT ทุกวัน</div>`:''}
     <div class="tbl-wrap" style="max-height:56vh;overflow:auto"><table>
      <thead><tr><th>วันที่</th><th>เข้า</th><th>ออก</th><th class="num">OT</th><th title="เว้นว่าง = ใช้เพดานปกติ · 0 = ไม่คิด OT วันนี้">OT อนุมัติ<br><span style="font-weight:400;font-size:11px">(ชม.)</span></th><th>กะ</th><th>OT วันนี้</th><th>สถานะ</th></tr></thead>
      <tbody>${rows}</tbody></table></div>
     <p class="muted" style="font-size:12.5px;margin-top:10px">แก้เวลาแล้วกด “บันทึก” · เว้นว่าง = ไม่มาทำงานวันนั้น<br>
     <strong>OT อนุมัติ</strong> = จำนวนชั่วโมง OT สูงสุดที่ให้คิดในวันนั้น · เว้นว่าง = ใช้เพดานปกติของคนนี้ · ใส่ 0 = วันนั้นไม่คิด OT<br>
     กรอกแบบ <strong>24 ชั่วโมง</strong> — พิมพ์ตัวเลขติดกันได้เลย เช่น <code>830</code> → 08:30 · <code>1745</code> → 17:45 · <code>20</code> → 20:00</p>`,
    [['ปิด','ghost',closeModal],['💾 บันทึก','',()=>{
      const box=ensureAttend(PERIOD); if(!box[empId]) box[empId]={};
      const map=box[empId];
      let bad=0;
      $('#modal').querySelectorAll('[data-ai]').forEach(inp=>{
        const d=inp.dataset.ai, o=$('#modal').querySelector(`[data-ao="${d}"]`);
        const i=t24Norm(inp.value), ov=o?t24Norm(o.value):'';
        if(i===null||ov===null){ bad++; return; }        // ค่าผิด → ข้ามไป ไม่เขียนทับของเดิม
        const cEl=$('#modal').querySelector(`[data-ac="${d}"]`);
        const cv=cEl && cEl.value!=='' ? Math.max(0,+cEl.value||0) : null;
        if(!i && !ov && cv==null) delete map[d];
        else { map[d]={i, o:ov}; if(cv!=null) map[d].c=cv; }
      });
      if(bad){ toast(`มีเวลาไม่ถูกต้อง ${bad} ช่อง — ช่องนั้นไม่ถูกบันทึก`); }
      if(!Object.keys(map).length) delete box[empId];
      save(); closeModal(); render(); toast('บันทึกเวลาแล้ว');
    }]]);
}

const ATT_CSV_HEAD=['รหัสพนักงาน','วันที่(ปปปป-ดด-วว)','เวลาเข้า(ชช:นน)','เวลาออก(ชช:นน)','OT อนุมัติ(ชม.) เว้นว่างได้'];
function attendTemplate(){
  const {from}=periodRange(PERIOD);
  const e=DB.employees[0];
  const sample=[
    [e?e.code:'EMP001', isoOf(from), '08:00','17:00',''],
    [e?e.code:'EMP001', isoOf(new Date(from.getFullYear(),from.getMonth(),from.getDate()+1)), '08:25','20:30','2'],
  ];
  const lines=[ATT_CSV_HEAD.map(csvEsc).join(','), ...sample.map(r=>r.map(csvEsc).join(','))];
  downloadFile(`attendance_template.csv`, '﻿'+lines.join('\r\n'), 'text/csv;charset=utf-8');
  toast('ดาวน์โหลดเทมเพลตแล้ว');
}
function exportAttendCSV(){
  const lines=[ATT_CSV_HEAD.map(csvEsc).join(',')];
  let n=0;
  DB.employees.forEach(e=>{
    const rec=attendOf(PERIOD, e.id);
    Object.keys(rec).sort().forEach(d=>{
      if(!inPeriod(d,PERIOD)) return;
      lines.push([e.code, d, rec[d].i||'', rec[d].o||'', rec[d].c!=null?rec[d].c:''].map(csvEsc).join(',')); n++;
    });
  });
  downloadFile(`attendance_${PERIOD}.csv`, '﻿'+lines.join('\r\n'), 'text/csv;charset=utf-8');
  toast(n?`ส่งออก CSV แล้ว (${n} รายการ)`:'ยังไม่มีข้อมูลเวลาในงวดนี้');
}
function importAttendCSV(){
  const inp=document.createElement('input'); inp.type='file'; inp.accept='.csv,text/csv';
  inp.onchange=()=>{ const f=inp.files[0]; if(!f) return; const rd=new FileReader();
    rd.onload=()=>{
      const rows=parseCSV(decodeTextBytes(rd.result));
      if(rows.length<2){ toast('ไฟล์ CSV ว่างเปล่า'); return; }
      let ok=0; const bad=[], outside=[], unknown=new Set();
      for(let r=1;r<rows.length;r++){
        const c=rows[r]; if(!c||!String(c[0]||'').trim()) continue;
        const code=String(c[0]).trim();
        const emp=DB.employees.find(x=>String(x.code).trim()===code);
        if(!emp){ unknown.add(code); continue; }
        const d=String(c[1]||'').trim();
        if(!/^\d{4}-\d{2}-\d{2}$/.test(d)){ bad.push(`บรรทัด ${r+1}: วันที่ "${d}"`); continue; }
        const i=String(c[2]||'').trim(), o=String(c[3]||'').trim();
        if(i && hm2min(i)==null){ bad.push(`บรรทัด ${r+1}: เวลาเข้า "${i}"`); continue; }
        if(o && hm2min(o)==null){ bad.push(`บรรทัด ${r+1}: เวลาออก "${o}"`); continue; }
        const cs=String(c[4]==null?'':c[4]).trim();
        if(cs && !(+cs>=0)){ bad.push(`บรรทัด ${r+1}: OT อนุมัติ "${cs}"`); continue; }
        if(!i && !o && !cs){ continue; }
        // เก็บลงงวดที่วันที่นั้นสังกัด (รองรับไฟล์ที่คร่อมหลายงวด)
        const p = periodOfDate(d);
        const box=ensureAttend(p); if(!box[emp.id]) box[emp.id]={};
        box[emp.id][d]={i,o}; if(cs) box[emp.id][d].c=+cs;
        if(p!==PERIOD) outside.push(p);
        ok++;
      }
      save(); render();
      let msg=`นำเข้าสำเร็จ ${ok} รายการ`;
      if(unknown.size) msg+=` · ไม่พบรหัส ${[...unknown].slice(0,3).join(', ')}${unknown.size>3?'…':''}`;
      if(bad.length) msg+=` · ข้อมูลผิด ${bad.length} บรรทัด`;
      toast(msg);
      if(bad.length||unknown.size){
        openModal('ผลการนำเข้า CSV',
          `<p>สำเร็จ <strong>${ok}</strong> รายการ${outside.length?` (มี ${new Set(outside).size} งวดอื่นด้วย)`:''}</p>
           ${unknown.size?`<p style="color:#b45309">ไม่พบรหัสพนักงานเหล่านี้ในระบบ: <strong>${esc([...unknown].join(', '))}</strong><br>
             <span class="muted" style="font-size:12.5px">ต้องเพิ่มพนักงานในเมนู “ข้อมูลพนักงาน” ให้รหัสตรงกันก่อน</span></p>`:''}
           ${bad.length?`<p style="color:#dc2626">รูปแบบไม่ถูกต้อง:</p><ul style="margin-left:18px;font-size:13px">${bad.slice(0,12).map(b=>`<li>${esc(b)}</li>`).join('')}</ul>${bad.length>12?`<p class="muted">…และอีก ${bad.length-12} บรรทัด</p>`:''}`:''}`,
          [['ปิด','ghost',closeModal]]);
      }
    };
    rd.readAsArrayBuffer(f); };
  inp.click();
}
// งวดที่วันที่นี้สังกัด (อิงวันตัดรอบ)
function periodOfDate(iso){
  const [y,m,d]=iso.split('-').map(Number);
  const cut=+DB.cutoffDay||0;
  if(!cut) return `${y}-${pad2(m)}`;
  // ถ้าเลยวันตัดรอบ → นับเป็นงวดเดือนถัดไป
  if(d>cut){ const nm=m===12?1:m+1, ny=m===12?y+1:y; return `${ny}-${pad2(nm)}`; }
  return `${y}-${pad2(m)}`;
}
// ส่งวันทำงาน + ชั่วโมง OT เข้าหน้าเงินได้/เงินหักของงวดนี้
function pushAttendToPayroll(){
  const list=DB.employees.filter(e=>!resignedBefore(e,PERIOD));
  const targets=list.map(e=>({e, s:attendStats(e,PERIOD)})).filter(x=>x.s.days||x.s.otHours);
  if(!targets.length){ toast('ยังไม่มีข้อมูลเวลาในงวดนี้'); return; }
  const nDaily=targets.filter(x=>x.e.payType==='daily').length;
  const nOT=targets.filter(x=>x.s.otHours>0).length;
  // รวมชั่วโมงตามตัวคูณของทุกคน เพื่อให้เห็นก่อนกดยืนยัน
  const sumBy={};
  targets.forEach(({s})=>Object.keys(s.otBy||{}).forEach(k=>{
    sumBy[k]=Math.round(((sumBy[k]||0)+ +s.otBy[k])*100)/100;
  }));
  const byKeys=Object.keys(sumBy).filter(k=>sumBy[k]>0).sort((a,b)=>a-b);
  const byLine=byKeys.length
    ? '<ul style="margin:6px 0 0 18px">'+byKeys.map(k=>'<li><strong>'+k+'×</strong> รวม '+num(sumBy[k])+' ชม.</li>').join('')+'</ul>'
    : '';
  openModal('➡️ ส่งข้อมูลเข้าเงินได้ / เงินหัก',
    `<p>จากเวลาเข้างานงวด <strong>${esc(periodLabel(PERIOD))}</strong> จะเขียนข้อมูลลงหน้า “เงินได้ / เงินหัก”:</p>
     <ul style="margin-left:18px">
       <li>ตั้ง <strong>จำนวนวันทำงาน</strong> ให้พนักงานรายวัน <strong>${nDaily}</strong> คน</li>
       <li>สร้าง <strong>แถว OT แยกตามตัวคูณ</strong> ให้ <strong>${nOT}</strong> คน แล้วคำนวณเงิน OT ใหม่${byLine}</li>
     </ul>
     <p class="muted" style="font-size:12.5px">
       ตัวคูณมาจากที่ตั้งไว้ในหัวข้อ <strong>“ตัวคูณ OT — วันไหนคูณเท่าไร”</strong><br>
       แถว OT และจำนวนวันทำงานเดิมจะถูกเขียนทับ ช่องอื่นไม่ถูกแตะ</p>`,
    [['ยกเลิก','ghost',closeModal],['เขียนข้อมูล','',()=>{
      let d=0, o=0;
      targets.forEach(({e,s})=>{
        const r=getRec(PERIOD, e.id);
        if(e.payType==='daily'){ r.days=s.days; d++; }
        if(s.otHours>0){
          // แยกเป็นแถวละตัวคูณ เรียงจากน้อยไปมาก
          const by=s.otBy||{};
          const ks=Object.keys(by).filter(k=>+by[k]>0).sort((a,b)=>a-b);
          r.earn.otRows = ks.length ? ks.map(k=>({h:+by[k], m:+k}))
                                    : [{h:s.otHours, m:1.5}];
          delete r.earn.otHours; delete r.earn.otMult;   // เลิกใช้รูปแบบแถวเดียว
          r.earn.ot=otTotal(e, r);
          o++;
        }
        autoDeductions(e, r);   // ภาษี/ประกันสังคม/กสล. คำนวณใหม่ตามเงินได้ที่เปลี่ยน
      });
      save(); closeModal(); toast(`ส่งข้อมูลแล้ว · วันทำงาน ${d} คน · OT ${o} คน`);
    }]]);
}

