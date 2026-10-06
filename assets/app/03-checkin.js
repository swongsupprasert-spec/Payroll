/* app.html · ลงเวลาผ่านมือถือ (หน้าแอดมิน) — ลำดับไฟล์มีผล (โหลดตามเลข) */
/* ============ ลงเวลาผ่านมือถือ (ถ่ายรูป + GPS) — หน้าแอดมิน ============
   ข้อมูลอยู่ในตาราง checkin_config / checkin_users / punches (supabase-checkin.sql)
   ไม่อยู่ในก้อน DB ของบริษัท — มือถือพนักงานเขียนพร้อมกันได้โดยไม่ทับข้อมูลเงินเดือน */
let CK_STATE={ loaded:false, err:'', cfg:null, users:[], punches:[], from:'', to:'' };
function ckCode(){ const A='ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let s=''; const r=crypto.getRandomValues(new Uint8Array(6)); r.forEach(x=>s+=A[x%A.length]); return s; }
function ckPin(){ const r=crypto.getRandomValues(new Uint32Array(1))[0]; return String(100000+(r%900000)); }
function ckBkk(ts){   /* เวลาไทย → ['ปปปป-ดด-วว','ชช:นน'] */
  const p=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(new Date(ts));
  const g=t=>p.find(x=>x.type===t).value; return [`${g('year')}-${g('month')}-${g('day')}`, `${g('hour')==='24'?'00':g('hour')}:${g('minute')}`];
}
async function ckLoad(){
  CK_STATE.err='';
  if(DEMO || !sb || !MY_UID){ CK_STATE.err='demo'; CK_STATE.loaded=true; return; }
  const {from,to}=periodRange(PERIOD); CK_STATE.from=isoOf(from); CK_STATE.to=isoOf(to);
  const fromTs=new Date(CK_STATE.from+'T00:00:00+07:00').toISOString(), toTs=new Date(CK_STATE.to+'T23:59:59+07:00').toISOString();
  const [c,u,p]=await Promise.all([
    sb.from('checkin_config').select('*').eq('owner_id',MY_UID).maybeSingle(),
    sb.from('checkin_users').select('id,emp_id,emp_code,emp_name,active,fail_count,locked_until,created_at,role,dept,position,face_enrolled_at').eq('owner_id',MY_UID)
      .then(x=>x.error&&/position/.test(x.error.message)?sb.from('checkin_users').select('id,emp_id,emp_code,emp_name,active,fail_count,locked_until,created_at,role,dept,face_enrolled_at').eq('owner_id',MY_UID):x)
      .then(x=>x.error&&/face_|role|dept/.test(x.error.message)?sb.from('checkin_users').select('id,emp_id,emp_code,emp_name,active,fail_count,locked_until,created_at').eq('owner_id',MY_UID):x),
    sb.from('punches').select('id,emp_id,emp_code,emp_name,kind,ts,lat,lng,accuracy,distance_m,site_name,in_zone,face_dist,merged,edited_at,orig_ts,orig_kind,has_photo')                       /* ไม่ดึงรูป — ประหยัด egress ของ Supabase */
      .eq('owner_id',MY_UID).gte('ts',fromTs).lte('ts',toTs).order('ts',{ascending:false}).limit(2000)
      .then(x=>x.error&&/has_photo/.test(x.error.message)
        ? sb.from('punches').select('id,emp_id,emp_code,emp_name,kind,ts,lat,lng,accuracy,distance_m,site_name,in_zone,face_dist,merged,edited_at,orig_ts,orig_kind')
            .eq('owner_id',MY_UID).gte('ts',fromTs).lte('ts',toTs).order('ts',{ascending:false}).limit(2000)
        : x)
  ]);
  const e=c.error||u.error||p.error;
  if(e){ CK_STATE.err=/relation|does not exist|schema cache/i.test(e.message)?'nosql':e.message; }
  CK_STATE.cfg=c.data||null; CK_STATE.users=u.data||[]; CK_STATE.punches=p.data||[]; CK_STATE.loaded=true;
}
/* ระดับของพนักงานในระบบลงเวลา/สายอนุมัติ — ตั้งเองในข้อมูลพนักงาน หรือเดาจากตำแหน่ง/แผนก */
function guessRole(e){
  const t=((e&&e.position)||'')+' | '+((e&&e.dept)||'');
  if(/ceo|cfo|coo|cto|\bmd\b|managing director|president|owner|กรรมการ|ประธาน|ผู้บริหารระดับสูง|ผู้อำนวยการ|เจ้าของ|ผู้บริหาร/i.test(t)) return 'exec';
  if(/หัวหน้า|ผู้จัดการ|ผจก|manager|supervisor|ซุปเปอร์ไวเซอร์|ซูเปอร์ไวเซอร์|\blead\b|\bhead\b|foreman|โฟร์แมน/i.test(t)) return 'head';
  return 'staff';
}
function empRole(e){ return (e&&e.ckRole) || guessRole(e); }
function vCheckin(v){
  ckAutoMerge(); ckLeaveSync();
  if(!CK_STATE.loaded){ v.appendChild(el(`<div class="panel"><div class="empty">กำลังโหลด…</div></div>`));
    ckLoad().then(()=>{ if(PAGE==='checkin') render(); }); return; }
  const S=CK_STATE; S.loaded=false;          // เข้าหน้านี้ครั้งหน้าให้โหลดใหม่เสมอ
  if(S.err==='demo'){ v.appendChild(el(`<div class="panel"><div class="empty">📱 ระบบลงเวลาผ่านมือถือใช้ได้เมื่อเข้าสู่ระบบด้วยบัญชีจริง (โหมดสาธิตไม่มีข้อมูลบนคลาวด์)</div></div>`)); return; }
  if(S.err==='nosql'){ v.appendChild(el(`<div class="panel"><div class="empty">⚙️ ยังไม่ได้ติดตั้งฐานข้อมูลของฟีเจอร์นี้ — ผู้ดูแลระบบต้องรันไฟล์ <code>supabase-checkin.sql</code> ใน Supabase ก่อน</div></div>`)); return; }
  if(S.err){ v.appendChild(el(`<div class="panel"><div class="empty">โหลดข้อมูลไม่สำเร็จ: ${esc(S.err)}</div></div>`)); return; }

  const cfg=S.cfg || { code:'', company_name:(DB.company&&DB.company.name)||'', sites:[], require_zone:true, require_photo:true };
  const link=cfg.code?`${location.origin}/checkin?c=${cfg.code}&openExternalBrowser=1`:'';
  const unmerged=S.punches.filter(p=>!p.merged).length;
  const byEmp=new Map(S.users.map(u=>[u.emp_id,u]));
  const staff=DB.employees.filter(e=>!resignedBefore(e,PERIOD));

  /* ---- สรุปงวดนี้: บัญชี · มาสาย · ขาดงาน (ไม่ได้ลา) ---- */
  if(!Array.isArray(DB.ckWorkDays)||DB.ckWorkDays.length!==7) DB.ckWorkDays=[false,true,true,true,true,true,false];   // อา–ส · ค่าเริ่มต้น จ–ศ
  const WD=['อา','จ','อ','พ','พฤ','ศ','ส'];
  const todayIso=ckBkk(new Date().toISOString())[0];
  const hm=t=>{ const m=/^(\d{1,2}):(\d{2})/.exec(t||''); return m?(+m[1])*60+(+m[2]):null; };
  const dayList=[]; { const {from,to}=periodRange(PERIOD); for(let d=new Date(from); d<=to; d.setDate(d.getDate()+1)){ const iso=isoOf(d); if(iso>todayIso) break; dayList.push(iso); } }
  const tracked=staff.filter(e=>{ const u=byEmp.get(e.id); return u&&u.active&&u.role!=='exec'; });   // ผู้บริหารไม่ต้องลงเวลา
  const byEmpDay=new Map();   // empId|day -> {in:'HH:MM' เร็วสุด}
  S.punches.forEach(p=>{ const [d,t]=ckBkk(p.ts); const k=p.emp_id+'|'+d; const o=byEmpDay.get(k)||{};
    if(p.kind==='in'){ if(!o.in||t<o.in) o.in=t; } else o.out=t; byEmpDay.set(k,o); });
  const onLeave=(eid,d)=>leaveList().some(l=>l.empId===eid && l.status!=='rejected' && l.from<=d && (l.to||l.from)>=d);
  const lateRows=[], absentRows=[];
  tracked.forEach(e=>{
    const att=attendOf(PERIOD, e.id);
    dayList.forEach(d=>{
      if(e.startDate && d<e.startDate) return;
      const uc=byEmp.get(e.id).created_at; if(uc && d<ckBkk(uc)[0]) return;   // ก่อนมีบัญชีลงเวลา ไม่นับขาดงาน
      if(e.resignDate && d>e.resignDate) return;
      const pr=byEmpDay.get(e.id+'|'+d), rec=att[d];
      const inT=(pr&&pr.in)||(rec&&rec.i)||'';
      if(inT){ const sh=shiftFor(e,d), s=hm(sh.start), t=hm(inT);
        if(s!=null && t!=null && t>s+(+sh.grace||0)) lateRows.push({e,d,t:inT,min:t-s}); return; }
      if(pr||(rec&&rec.o)) return;                              // มีลงเวลาออกอย่างเดียว = มาทำงาน
      const wd=new Date(d+'T00:00:00').getDay();
      if(!DB.ckWorkDays[wd]) return;                             // วันหยุดประจำสัปดาห์
      if(isHoliday(d)) return;                                   // วันหยุดบริษัท (ปฏิทินวันหยุด)
      if(onLeave(e.id,d)) return;                                // ลาแล้ว
      absentRows.push({e,d});
    });
  });
  const lateEmp=new Set(lateRows.map(x=>x.e.id)), absEmp=new Set(absentRows.map(x=>x.e.id));
  const kp=el(`<div class="cards">
    <div class="kpi b1"><div class="lab">👤 บัญชีลงเวลา</div><div class="val">${num(tracked.length)} <span class="muted" style="font-size:14px">/ ${num(staff.length)} คน</span></div></div>
    <div class="kpi b3" data-kl="late" style="cursor:pointer"><div class="lab">⏰ มาสาย</div><div class="val">${num(lateEmp.size)} <span class="muted" style="font-size:14px">คน</span></div></div>
    <div class="kpi b2" data-kl="late" style="cursor:pointer"><div class="lab">📅 สายรวม</div><div class="val">${num(lateRows.length)} <span class="muted" style="font-size:14px">วัน</span></div></div>
    <div class="kpi b4" data-kl="abs" style="cursor:pointer"><div class="lab">🚫 ขาดงาน (ไม่ได้ลา)</div><div class="val">${num(absentRows.length)} <span class="muted" style="font-size:14px">วัน · ${num(absEmp.size)} คน</span></div></div>
  </div>`);
  v.appendChild(kp);
  const sub=el(`<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:-6px 0 14px;font-size:13px;color:var(--muted)">
    <span>นับถึงวันนี้ · เฉพาะคนที่มีบัญชีลงเวลา นับตั้งแต่วันที่สร้างบัญชี · วันทำงาน:</span>
    ${WD.map((n,i)=>`<button class="btn ghost sm" data-ckwd="${i}" style="padding:3px 9px;${DB.ckWorkDays[i]?'background:#0e3a5c;color:#fff;border-color:#0e3a5c':''}">${n}</button>`).join('')}
    <span style="margin-left:6px">· ลงเวลา ${num(S.punches.length)} ครั้ง · นอกพื้นที่ ${num(S.punches.filter(p=>p.in_zone===false).length)} · รอนำเข้า ${num(unmerged)}</span>
  </div>`);
  v.appendChild(sub);
  sub.querySelectorAll('[data-ckwd]').forEach(b=>b.onclick=()=>{ const i=+b.dataset.ckwd; DB.ckWorkDays[i]=!DB.ckWorkDays[i]; save(); CK_STATE.loaded=true; S.loaded=true; render(); });
  kp.querySelectorAll('[data-kl]').forEach(c=>c.onclick=()=>{
    const late=c.dataset.kl==='late'; const rows=(late?lateRows:absentRows).slice().sort((a,b)=>a.d<b.d?-1:(a.d>b.d?1:(a.e.code<b.e.code?-1:1)));
    const fmt=d=>`${d.slice(8)}/${d.slice(5,7)} (${WD[new Date(d+'T00:00:00').getDay()]})`;
    if(late){
      openModal('⏰ มาสาย — งวดนี้', rows.length?`<div class="tbl-wrap" style="max-height:60vh;overflow:auto"><table><thead><tr><th>วันที่</th><th>พนักงาน</th><th>เวลาเข้า</th><th class="num">สาย</th></tr></thead><tbody>
        ${rows.map(x=>`<tr><td>${fmt(x.d)}</td><td>${esc(x.e.code)} ${esc(x.e.name)}</td><td>${x.t}</td><td class="num" style="color:#dc2626">${num(x.min)} นาที</td></tr>`).join('')}
        </tbody></table></div>`:'<div class="empty">ไม่มีรายการ 🎉</div>',[['ปิด','',closeModal]]);
      return;
    }
    /* ขาดงาน: ติ๊กเลือก → สร้างใบลาไม่รับค่าจ้าง (รายเดือนเท่านั้น — รายวันไม่ได้ค่าจ้างวันที่ไม่มาอยู่แล้ว) */
    const canPick=x=>x.e.payType!=='daily';
    const nPick=rows.filter(canPick).length;
    const btns=[['ปิด','ghost',closeModal]];
    if(nPick) btns.push([`📝 สร้างใบลาไม่รับค่าจ้าง`,'',()=>{
      const picked=[...$('#modal').querySelectorAll('[data-abs]:checked')].map(x=>rows[+x.dataset.abs]);
      if(!picked.length){ toast('ยังไม่ได้เลือกรายการ'); return; }
      const L=leaveList(); let n=0;
      picked.forEach(x=>{
        if(L.some(l=>l.empId===x.e.id && l.status!=='rejected' && l.from<=x.d && (l.to||l.from)>=x.d)) return;   // มีใบลาแล้ว ไม่สร้างซ้ำ
        L.push({ id:uid(), empId:x.e.id, type:'unpaid', status:'approved', from:x.d, to:x.d, days:1, hours:null,
                 reason:'สร้างจากการขาดงาน — ระบบลงเวลาผ่านมือถือ (ไม่มีการลงเวลาและไม่มีใบลา)' });
        n++;
      });
      save(); closeModal(); CK_STATE.loaded=true; S.loaded=true; render();
      toast(`สร้างใบลาไม่รับค่าจ้างแล้ว ${num(n)} ใบ — ยอดหักจะขึ้นในหน้าเงินได้/เงินหัก ตรวจหรือลบได้ที่หน้าระบบลางาน`);
    }]);
    openModal('🚫 ขาดงาน (ไม่ได้ลา) — งวดนี้', rows.length?`
      ${nPick?`<label style="display:flex;gap:8px;align-items:center;font-size:13.5px;margin-bottom:8px"><input type="checkbox" id="absAll" checked> เลือกทั้งหมด (พนักงานรายเดือน ${num(nPick)} รายการ)</label>`:''}
      <div class="tbl-wrap" style="max-height:55vh;overflow:auto"><table><thead><tr><th></th><th>วันที่</th><th>พนักงาน</th><th>ประเภท</th></tr></thead><tbody>
      ${rows.map((x,i)=>`<tr><td>${canPick(x)?`<input type="checkbox" data-abs="${i}" checked style="width:18px;height:18px">`:''}</td>
        <td>${fmt(x.d)}</td><td>${esc(x.e.code)} ${esc(x.e.name)}</td>
        <td>${canPick(x)?'<span class="muted" style="font-size:12px">รายเดือน</span>':'<span class="muted" style="font-size:12px">รายวัน — ไม่ได้ค่าจ้างวันนี้อยู่แล้ว</span>'}</td></tr>`).join('')}
      </tbody></table></div>
      <p class="muted" style="font-size:12.5px;margin-top:8px">ขาดงาน = วันทำงานที่ไม่มีการลงเวลาเลย และไม่มีใบลา · ไม่นับวันหยุดใน “ปฏิทินวันหยุดบริษัท” (เมนูตั้งค่า)<br>
      กด <strong>สร้างใบลาไม่รับค่าจ้าง</strong> → ใบลาไปอยู่หน้าระบบลางาน และหักเงินในหน้าเงินได้/เงินหักอัตโนมัติ (เงินเดือน ÷ 30 × วัน) · ติ๊กออกถ้ารู้ว่าไม่ได้ขาดจริง</p>`
      :'<div class="empty">ไม่มีรายการ 🎉</div>', btns);
    const all=$('#absAll'); if(all) all.onchange=()=>$('#modal').querySelectorAll('[data-abs]').forEach(x=>x.checked=all.checked);
  });

  /* ---- 1) ข้อมูลบริษัท + หมุดบริษัท & รัศมีสแกน ---- */
  const site0=(cfg.sites&&cfg.sites[0])?{...cfg.sites[0]}:{name:'สำนักงาน',lat:null,lng:null,radius:100,address:'',sim:false};
  const saved0={...site0};
  const setP=el(`<div class="panel"><div style="padding:18px 20px">
    <h3 style="margin-bottom:12px">🏢 ข้อมูลบริษัท</h3>
    <div class="field"><label>ชื่อบริษัท</label><input id="ckName" value="${esc(cfg.company_name||'')}"></div>
    <div class="field" style="margin-top:10px"><label>รหัสบริษัท (พนักงานใช้เข้าสู่ระบบ · A-Z, 0-9 ยาว 4–12 ตัว)</label>
      <input id="ckCodeIn" value="${esc(cfg.code||'')}" maxlength="12" placeholder="เช่น BESTWORLD" autocomplete="off"
        style="text-transform:uppercase;font-weight:800;letter-spacing:2px;max-width:260px">
      ${cfg.code?'<div class="muted" style="font-size:12px;margin-top:3px">⚠️ เปลี่ยนรหัสแล้ว ลิงก์เดิมที่ส่งให้พนักงานจะใช้ไม่ได้ ต้องส่งลิงก์ใหม่ (พนักงานที่เข้าสู่ระบบค้างไว้ใช้ต่อได้)</div>':'<div class="muted" style="font-size:12px;margin-top:3px">เว้นว่าง = ระบบสุ่มให้</div>'}</div>
    <div class="field" style="margin-top:10px"><label>ที่อยู่บริษัท</label><textarea id="ckAddr" rows="2" style="width:100%">${esc(site0.address||(DB.company&&DB.company.address)||'')}</textarea></div>
    <button class="btn sm" id="ckGeo" style="margin-top:10px">🔎 ปักหมุดจากที่อยู่นี้</button>
    <div style="border-top:1px solid var(--line);margin:18px 0"></div>

    <h3 style="margin-bottom:12px">📍 หมุดบริษัท & รัศมีสแกน</h3>
    <div class="field"><label>วางลิงก์ Google Maps หรือพิกัด</label>
      <div style="display:flex;gap:8px"><input id="ckGmap" placeholder="เช่น https://www.google.com/maps/place/.../@13.608,100.919,17z หรือ 13.6080995, 100.919102" style="flex:1" autocomplete="off">
      <button class="btn sm" id="ckGmapGo">📍 ใช้ตำแหน่งนี้</button></div>
      <div class="muted" style="font-size:12px;margin-top:4px">วิธีที่ง่ายสุด: ใน Google Maps <strong>คลิกขวาที่ตำแหน่งบริษัท → กดตัวเลขพิกัดบรรทัดแรก</strong> (คัดลอกให้อัตโนมัติ) แล้ววางที่นี่ · หรือคัดลอกลิงก์จากแถบที่อยู่ของเบราว์เซอร์</div></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div class="field"><label>Latitude</label><input id="ckLat" type="number" step="any" value="${site0.lat??''}"></div>
      <div class="field"><label>Longitude</label><input id="ckLng" type="number" step="any" value="${site0.lng??''}"></div>
    </div>
    <div class="field" style="margin-top:10px"><label>รัศมีที่อนุญาต (เมตร)</label><input id="ckRad" type="number" min="30" step="10" value="${site0.radius||100}"></div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">
      <button class="btn ghost sm" id="ckHere">📌 ใช้ตำแหน่งปัจจุบันเป็นหมุดบริษัท</button>
      <button class="btn ghost sm" id="ckReset">↺ คืนค่าหมุดบริษัท</button>
      <button class="btn sm" id="ckSave" style="background:#1d4ed8">บันทึกการตั้งค่า</button>
    </div>
    <a id="ckMap" target="_blank" rel="noopener" style="display:inline-block;margin-top:10px;font-size:13.5px">🗺️ ดูหมุดใน Google Maps</a>
    <div style="display:flex;gap:18px;flex-wrap:wrap;margin-top:12px;font-size:13.5px">
      <label style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="ckZone" ${cfg.require_zone?'checked':''}> ต้องอยู่ในรัศมีจึงลงเวลาได้</label>
      <label style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="ckPhoto" ${cfg.require_photo?'checked':''}> ต้องถ่ายรูปทุกครั้ง</label>
      <label style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="ckFace" ${cfg.require_face!==false?'checked':''}> 🙂 จดจำใบหน้า (ใบหน้าไม่ตรง = ลงเวลาไม่ได้)</label>
    </div>
    <div style="border-top:1px solid var(--line);margin:18px 0"></div>

    <h3 style="margin-bottom:8px">โหมดจำลอง GPS (สำหรับทดสอบ)</h3>
    <label style="display:flex;gap:8px;align-items:center;font-size:14px"><input type="checkbox" id="ckSim" ${site0.sim?'checked':''}> เปิดโหมดจำลอง (ไม่ใช้ GPS จริง)</label>
    <p class="muted" style="font-size:12.5px;margin-top:4px">เปิดแล้วมือถือพนักงานจะส่งพิกัดหมุดบริษัทแทน GPS จริง ใช้ทดลองจากที่อื่นได้ — <strong style="color:#b45309">ปิดก่อนใช้งานจริง</strong></p>
    <div style="border-top:1px solid var(--line);margin:18px 0"></div>

    <button class="btn ghost sm" id="ckWipe" style="color:#dc2626">🗑️ ล้างข้อมูลทดลองทั้งหมด</button>
    <div style="margin-top:14px;font-size:13.5px">${link?`ลิงก์ให้พนักงาน: <a href="${link}" target="_blank" rel="noopener"><strong>${esc(link)}</strong></a>
      · รหัสบริษัท <strong style="letter-spacing:2px">${esc(cfg.code)}</strong> <button class="btn ghost sm" id="ckCopy">📋 คัดลอกลิงก์</button>`
      :'<span class="muted">บันทึกการตั้งค่าครั้งแรกแล้วจะได้ลิงก์และรหัสบริษัทสำหรับพนักงาน</span>'}</div>
  </div></div>`);
  v.appendChild(setP);
  const q=s=>setP.querySelector(s);
  const upMap=()=>{ const a=q('#ckMap'), la=q('#ckLat').value, lo=q('#ckLng').value;
    if(la&&lo){ a.href=`https://www.google.com/maps?q=${la},${lo}`; a.style.display='inline-block'; } else a.style.display='none'; };
  ['#ckLat','#ckLng'].forEach(s=>q(s).addEventListener('input',upMap)); upMap();
  /* อ่านพิกัดจากลิงก์ Google Maps หลายรูปแบบ หรือจากตัวเลข "lat, lng" */
  const parseGmap=t=>{
    t=decodeURIComponent(String(t||'').trim());
    const pats=[/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/, /@(-?\d+\.\d+),\s*(-?\d+\.\d+)/, /[?&](?:q|query|ll|center|destination)=(-?\d+\.\d+),\s*(-?\d+\.\d+)/,
                /^\s*\(?\s*(-?\d+\.\d+)\s*[, ]\s*(-?\d+\.\d+)\s*\)?\s*$/];
    for(const p of pats){ const m=t.match(p); if(m){ const la=+m[1], lo=+m[2]; if(Math.abs(la)<=90&&Math.abs(lo)<=180) return [la,lo]; } }
    return null;
  };
  const useGmap=()=>{
    const t=q('#ckGmap').value; if(!t.trim()){ toast('วางลิงก์หรือพิกัดก่อน'); return; }
    const p=parseGmap(t);
    if(!p){
      if(/goo\.gl|maps\.app/i.test(t)) toast('ลิงก์แบบย่อ (maps.app.goo.gl) อ่านพิกัดไม่ได้ — เปิดลิงก์นั้นก่อน แล้วคัดลอกลิงก์ยาวจากแถบที่อยู่ หรือคลิกขวาที่หมุดเพื่อคัดลอกพิกัด');
      else toast('หาพิกัดในข้อความนี้ไม่เจอ — ลองคลิกขวาที่หมุดใน Google Maps แล้วคัดลอกพิกัดมาวาง');
      return;
    }
    q('#ckLat').value=p[0].toFixed(7); q('#ckLng').value=p[1].toFixed(7); upMap();
    toast('ได้พิกัดแล้ว — อย่าลืมกดบันทึกการตั้งค่า');
  };
  q('#ckGmapGo').onclick=useGmap;
  q('#ckGmap').addEventListener('paste',()=>setTimeout(()=>{ if(parseGmap(q('#ckGmap').value)) useGmap(); },0));
  q('#ckHere').onclick=()=>{
    if(!navigator.geolocation){ toast('เบราว์เซอร์นี้หาตำแหน่งไม่ได้'); return; }
    toast('กำลังหาตำแหน่ง…');
    navigator.geolocation.getCurrentPosition(p=>{ q('#ckLat').value=p.coords.latitude.toFixed(7); q('#ckLng').value=p.coords.longitude.toFixed(7); upMap();
      toast(`ได้ตำแหน่งแล้ว (คลาดเคลื่อน ±${Math.round(p.coords.accuracy)} ม.) — อย่าลืมกดบันทึก`); },
      ()=>toast('ไม่ได้รับอนุญาตให้ใช้ตำแหน่ง'), {enableHighAccuracy:true,timeout:15000,maximumAge:0});
  };
  q('#ckReset').onclick=()=>{ q('#ckLat').value=saved0.lat??''; q('#ckLng').value=saved0.lng??''; q('#ckRad').value=saved0.radius||100; upMap(); toast('คืนค่าหมุดที่บันทึกไว้แล้ว'); };
  q('#ckGeo').onclick=async()=>{
    const addr=q('#ckAddr').value.trim(); if(!addr){ toast('กรอกที่อยู่ก่อน'); return; }
    const b=q('#ckGeo'); b.disabled=true; b.textContent='กำลังค้นหา…';
    try{
      const r=await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=th&accept-language=th&q='+encodeURIComponent(addr));
      const j=await r.json();
      if(!j.length){ toast('หาพิกัดจากที่อยู่นี้ไม่เจอ — ลองใส่แค่ ตำบล อำเภอ จังหวัด หรือใช้ตำแหน่งปัจจุบันแทน'); }
      else { q('#ckLat').value=(+j[0].lat).toFixed(7); q('#ckLng').value=(+j[0].lon).toFixed(7); upMap();
        toast('ปักหมุดแล้ว — กด “ดูหมุดใน Google Maps” เช็คว่าตรงไหม แล้วกดบันทึก'); }
    }catch(e){ toast('ค้นหาไม่สำเร็จ: '+e.message); }
    b.disabled=false; b.textContent='🔎 ปักหมุดจากที่อยู่นี้';
  };
  if(link) q('#ckCopy').onclick=()=>{ navigator.clipboard.writeText(link).then(()=>toast('คัดลอกลิงก์แล้ว')); };
  q('#ckWipe').onclick=async()=>{
    if(!confirm('ลบประวัติการลงเวลาผ่านมือถือทั้งหมดของบริษัทนี้ (รวมรูป)?\nเวลาที่นำเข้าหน้าเวลาเข้างานไปแล้วจะไม่ถูกลบ')) return;
    const {error}=await sb.from('punches').delete().eq('owner_id',MY_UID);
    if(error){ toast('ลบไม่สำเร็จ: '+error.message); return; }
    toast('ล้างข้อมูลทดลองแล้ว'); render();
  };
  q('#ckSave').onclick=async()=>{
    const lat=q('#ckLat').value===''?null:+q('#ckLat').value, lng=q('#ckLng').value===''?null:+q('#ckLng').value;
    const hasPin=lat!=null&&lng!=null&&isFinite(lat)&&isFinite(lng)&&Math.abs(lat)<=90&&Math.abs(lng)<=180;
    if((q('#ckZone').checked||q('#ckSim').checked) && !hasPin){ toast('ต้องมีหมุดบริษัท (Latitude/Longitude) ก่อน'); return; }
    const site={ name:q('#ckName').value.trim()||'สำนักงาน', lat, lng, radius:Math.max(30,+q('#ckRad').value||100),
                 address:q('#ckAddr').value.trim(), sim:q('#ckSim').checked };
    const want=q('#ckCodeIn').value.trim().toUpperCase();
    if(want && !/^[A-Z0-9]{4,12}$/.test(want)){ toast('รหัสบริษัทต้องเป็น A-Z หรือ 0-9 ยาว 4–12 ตัว (ไม่มีเว้นวรรคหรือภาษาไทย)'); return; }
    if(cfg.code && want && want!==cfg.code && !confirm(`เปลี่ยนรหัสบริษัทจาก ${cfg.code} เป็น ${want}?
ลิงก์เดิมที่ส่งให้พนักงานจะใช้ไม่ได้ ต้องส่งลิงก์ใหม่`)) return;
    const row={ owner_id:MY_UID, code:want||cfg.code||ckCode(), company_name:q('#ckName').value.trim(),
      sites: hasPin?[site]:[], require_zone:q('#ckZone').checked, require_photo:q('#ckPhoto').checked, require_face:q('#ckFace').checked, updated_at:new Date().toISOString() };
    if(row.require_face) row.require_photo=true;       // จดจำใบหน้าต้องมีรูปเสมอ
    let {error}=await sb.from('checkin_config').upsert(row);
    if(error && /require_face/.test(error.message)){ toast('ยังไม่ได้รัน supabase-checkin-3.sql — บันทึกโดยไม่เปิดจดจำใบหน้า'); delete row.require_face; ({error}=await sb.from('checkin_config').upsert(row)); }
    if(error && /duplicate|unique/i.test(error.message)){
      if(want){ toast(`รหัส ${want} มีบริษัทอื่นใช้แล้ว — ลองรหัสอื่น`); return; }
      row.code=ckCode(); ({error}=await sb.from('checkin_config').upsert(row)); }
    if(error && /row-level security|violates/i.test(error.message) && want && want.length!==6){ toast('ยังไม่ได้รัน supabase-checkin-4.sql — ตอนนี้ใช้ได้เฉพาะรหัส 6 ตัว'); return; }
    if(error){ toast('บันทึกไม่สำเร็จ: '+error.message); return; }
    toast(site.sim?'บันทึกแล้ว — โหมดจำลอง GPS เปิดอยู่':'บันทึกการตั้งค่าแล้ว'); render();
  };
  if(site0.sim) v.insertBefore(el(`<div class="panel" style="background:#fffbeb;border-color:#fcd34d"><div style="padding:12px 16px;color:#92400e;font-size:14px">⚠️ <strong>โหมดจำลอง GPS เปิดอยู่</strong> — พนักงานลงเวลาได้จากทุกที่ ปิดก่อนใช้งานจริง</div></div>`), setP);

  /* ---- 2) บัญชีพนักงาน: ชื่อผู้ใช้ + รหัสผ่าน + ลิงก์ส่วนตัว ---- */
  const userLink=u=>`${location.origin}/checkin?c=${cfg.code}&u=${encodeURIComponent(u)}&openExternalBrowser=1`;   // ให้ LINE เปิดใน Chrome/Safari (กล้องใช้ได้)
  const accP=el(`<div class="panel"><div style="padding:16px 18px 6px">
    <h3 style="margin-bottom:4px">👤 บัญชีลงเวลาของพนักงาน</h3>
    <p class="muted" style="font-size:13px;margin-bottom:10px">ตั้ง <strong>ชื่อผู้ใช้ + รหัสผ่าน</strong> ให้แต่ละคน แล้วส่ง <strong>ลิงก์ส่วนตัว</strong> ให้พนักงาน (ลิงก์กรอกรหัสบริษัทและชื่อผู้ใช้ไว้ให้แล้ว พนักงานใส่แค่รหัสผ่าน)<br>
    ระบบเก็บรหัสผ่านแบบเข้ารหัส — ดูย้อนหลังไม่ได้ ถ้าลืมให้ตั้งใหม่</p>
    <button class="btn sm" id="ckBulk" ${cfg.code?'':'disabled title="บันทึกการตั้งค่าบริษัทก่อน"'}>🔑 สร้างบัญชีให้ทุกคนที่ยังไม่มี (รหัสผ่านสุ่ม)</button>
  </div>
  <div class="tbl-wrap"><table><thead><tr><th>รหัส</th><th>ชื่อ</th><th>ชื่อผู้ใช้</th><th>ประเภทบัญชี</th><th>ใบหน้า</th><th>สถานะ</th><th></th></tr></thead><tbody>
  ${staff.map(e=>{ const u=byEmp.get(e.id);
    const st=!u?'<span class="chip" style="background:#f1f5f9;color:#64748b">ยังไม่มีบัญชี</span>'
      : !u.active?'<span class="chip" style="background:#fee2e2;color:#b91c1c">ปิดใช้งาน</span>'
      : (u.locked_until&&new Date(u.locked_until)>new Date())?'<span class="chip" style="background:#fef3c7;color:#b45309">ล็อก 15 นาที (รหัสผิด)</span>'
      : '<span class="chip" style="background:#dcfce7;color:#16a34a">ใช้งานได้</span>';
    return `<tr><td>${esc(e.code)}</td><td>${esc(e.name)}</td><td><strong>${u?esc(u.emp_code):'<span class="muted">-</span>'}</strong></td>
      <td>${u?`<select data-role="${u.id}" style="font-size:13px;padding:4px 6px">
        <option value="staff" ${(u.role||'staff')==='staff'?'selected':''}>พนักงาน</option>
        <option value="head" ${u.role==='head'?'selected':''}>หัวหน้า/ผู้จัดการ</option>
        <option value="exec" ${u.role==='exec'?'selected':''} title="อนุมัติอย่างเดียว ไม่ต้องลงเวลา">ผู้บริหาร/CEO</option></select>`:'<span class="muted">-</span>'}</td>
      <td>${u&&u.face_enrolled_at?`<button class="btn ghost sm" data-face="${u.id}" title="ดูใบหน้าที่ลงทะเบียน — ${esc(ckBkk(u.face_enrolled_at).join(' '))}">🙂 ดูรูป</button>`
        :(u?'<span class="muted" style="font-size:12px">ยังไม่ลงทะเบียน</span>':'<span class="muted">-</span>')}</td><td>${st}</td>
      <td style="text-align:right;white-space:nowrap">
      <button class="btn ghost sm" data-edit="${esc(e.id)}" ${cfg.code?'':'disabled'} title="${u?'ตั้งชื่อผู้ใช้ / รหัสผ่าน':'สร้างบัญชี'}">${u?'✏️':'➕ สร้างบัญชี'}</button>
      ${u&&u.face_enrolled_at?`<button class="btn ghost sm" data-rface="${u.id}" title="รีเซ็ตใบหน้า">🙂</button>`:''}
      ${u?`<button class="btn ghost sm" data-link="${esc(u.emp_code)}" title="คัดลอกลิงก์ส่วนตัว">🔗</button>
           <button class="btn ghost sm" data-act="${u.id}" data-on="${u.active?0:1}" title="${u.active?'ปิดใช้งานบัญชี':'เปิดใช้งานบัญชี'}">${u.active?'ปิด':'เปิด'}</button>`:''}</td></tr>`; }).join('')}
  </tbody></table></div></div>`);
  v.appendChild(accP);
  const ERRS={bad_login:'ชื่อผู้ใช้ต้องเป็น a-z, 0-9, จุด, ขีด ยาว 3–30 ตัว',bad_pin:'รหัสผ่านต้องยาว 4–32 ตัวอักษร',
    login_taken:'ชื่อผู้ใช้นี้มีพนักงานคนอื่นใช้แล้ว',not_premium:'ต้องใช้แพ็กเกจพรีเมี่ยม'};
  const errMsg=e=>{ for(const k in ERRS) if(String(e.message).includes(k)) return ERRS[k]; return e.message; };
  const setAcc=async(e,login,pw)=>{ const {error}=await sb.rpc('checkin_set_user',{p_emp_id:e.id,p_emp_code:login,p_emp_name:e.name,p_pin:pw}); return error; };
  const copy=t=>navigator.clipboard.writeText(t).then(()=>toast('คัดลอกแล้ว'),()=>toast('คัดลอกไม่ได้ — เลือกข้อความแล้วคัดลอกเอง'));
  const showCreds=(list)=>{
    openModal('🔑 ข้อมูลเข้าสู่ระบบของพนักงาน',
      `<p style="margin-bottom:8px">ส่งให้พนักงานแต่ละคน — <strong>ปิดหน้านี้แล้วจะดูรหัสผ่านอีกไม่ได้</strong> (ตั้งใหม่ได้เสมอ)</p>
       <p style="margin-bottom:10px;font-size:13.5px">รหัสบริษัท <strong style="letter-spacing:2px">${esc(cfg.code)}</strong></p>
       <div class="tbl-wrap"><table><thead><tr><th>ชื่อ</th><th>ชื่อผู้ใช้</th><th>รหัสผ่าน</th><th></th></tr></thead><tbody>
       ${list.map((x,i)=>`<tr><td>${esc(x.name)}</td><td><strong>${esc(x.login)}</strong></td><td style="font-weight:800;letter-spacing:1px">${esc(x.pw)}</td>
         <td><button class="btn ghost sm" data-cp="${i}">📋 คัดลอกข้อความส่ง LINE</button></td></tr>`).join('')}</tbody></table></div>`,
      [['🖨️ พิมพ์','ghost',()=>window.print()],['ปิด','',()=>{ closeModal(); render(); }]]);
    $('#modal').querySelectorAll('[data-cp]').forEach(b=>b.onclick=()=>{ const x=list[+b.dataset.cp];
      copy(`ลงเวลาเข้า-ออกงาน ${cfg.company_name||''}\nเปิดลิงก์: ${userLink(x.login)}\nชื่อผู้ใช้: ${x.login}\nรหัสผ่าน: ${x.pw}\n(เก็บรหัสผ่านไว้เป็นความลับ)`); });
  };
  accP.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>{
    const e=DB.employees.find(x=>x.id===b.dataset.edit); if(!e) return; const u=byEmp.get(e.id);
    const defLogin=(u&&u.emp_code)||String(e.code||'').toUpperCase().replace(/[^A-Z0-9._-]/g,'');
    openModal(`${u?'✏️ ตั้งชื่อผู้ใช้/รหัสผ่าน':'➕ สร้างบัญชี'} — ${esc(e.name)}`,
      `<div class="field"><label>ชื่อผู้ใช้ (a-z, 0-9, จุด, ขีด · 3–30 ตัว)</label><input id="caLogin" value="${esc(defLogin)}" style="text-transform:uppercase" autocomplete="off"></div>
       <div class="field" style="margin-top:10px"><label>รหัสผ่าน (4–32 ตัวอักษร)</label>
         <div style="display:flex;gap:6px"><input id="caPw" type="text" autocomplete="new-password" style="flex:1" placeholder="${u?'ตั้งรหัสผ่านใหม่':''}">
         <button class="btn ghost sm" id="caGen">🎲 สุ่ม</button></div></div>
       <p class="muted" style="font-size:12.5px;margin-top:8px">${u?'บันทึกแล้วพนักงานจะถูกออกจากระบบทุกเครื่อง ต้องเข้าใหม่ด้วยรหัสผ่านใหม่':'พนักงานเปิดลิงก์ส่วนตัวแล้วใส่รหัสผ่านนี้'}</p>`,
      [['ยกเลิก','ghost',closeModal],['💾 บันทึก','',async()=>{
        const login=$('#caLogin').value.trim().toUpperCase(), pw=$('#caPw').value;
        if(!/^[A-Z0-9._-]{3,30}$/.test(login)){ toast(ERRS.bad_login); return; }
        if(pw.length<4||pw.length>32){ toast(ERRS.bad_pin); return; }
        const err=await setAcc(e,login,pw); if(err){ toast('ไม่สำเร็จ: '+errMsg(err)); return; }
        showCreds([{name:e.name,login,pw}]);
      }]]);
    $('#caGen').onclick=()=>{ $('#caPw').value=ckPin(); };
    if(!u) $('#caPw').value=ckPin();
  });
  accP.querySelectorAll('[data-link]').forEach(b=>b.onclick=()=>copy(userLink(b.dataset.link)));
  accP.querySelectorAll('[data-role]').forEach(s=>s.onchange=async()=>{
    const {error}=await sb.from('checkin_users').update({role:s.value}).eq('id',s.dataset.role);
    { const u=S.users.find(x=>x.id===s.dataset.role), e=u&&DB.employees.find(x=>x.id===u.emp_id); if(e&&!error){ e.ckRole=s.value; save(); } }
    if(error){ toast(/role/.test(error.message)?'ยังไม่ได้รัน supabase-checkin-8.sql':('ไม่สำเร็จ: '+error.message)); render(); return; }
    toast(s.value==='exec'?'เปลี่ยนเป็นผู้บริหาร — ลิงก์จะมีแค่รายการอนุมัติ':s.value==='head'?'เปลี่ยนเป็นหัวหน้า — ลงเวลาได้และอนุมัติใบลาได้':'เปลี่ยนเป็นพนักงาน'); });
  /* แผนกในบัญชีลงเวลาให้ตรงกับข้อมูลพนักงานเสมอ (ใช้เลือกผู้อนุมัติของแผนก) */
  { const fix=S.users.filter(u=>{ const e=DB.employees.find(x=>x.id===u.emp_id); if(!e || u.dept===undefined) return false;
      if(!e.ckRole && u.role && u.role!=='staff'){ e.ckRole=u.role; save(); }        // ข้อมูลเดิมที่ตั้งจากหน้านี้ → เก็บเข้าข้อมูลพนักงาน
      return (u.dept||'')!==((e.dept||'').trim()) || empRole(e)!==(u.role||'staff') || u.emp_name!==e.name || (u.position!==undefined && (u.position||'')!==((e.position||'').trim())); });
    fix.forEach(u=>{ const e=DB.employees.find(x=>x.id===u.emp_id); u.role=empRole(e);
      const sel=accP.querySelector('[data-role="'+u.id+'"]'); if(sel) sel.value=u.role;
      sb.from('checkin_users').update(Object.assign({dept:(e.dept||'').trim(),emp_name:e.name,role:empRole(e)},u.position!==undefined?{position:(e.position||'').trim()}:{})).eq('id',u.id).then(()=>{}); }); }
  accP.querySelectorAll('[data-face]').forEach(im=>im.onclick=()=>{ const u=S.users.find(x=>x.id===im.dataset.face);
    openModal('🙂 ใบหน้าที่ลงทะเบียน — '+esc(u.emp_name||u.emp_code),'<div class="empty">กำลังโหลดรูป…</div>',[['ปิด','',closeModal]]);
    sb.from('checkin_users').select('face_photo').eq('id',u.id).maybeSingle().then(({data,error})=>{
      const box=$('#modal').querySelector('.mbody'); if(!box) return;
      box.innerHTML = (data&&data.face_photo)
        ? `<img src="${data.face_photo}" alt="" style="width:100%;max-width:320px;border-radius:14px;display:block;margin:0 auto">
           <p class="muted" style="text-align:center;margin-top:8px;font-size:13px">ลงทะเบียนเมื่อ ${esc(ckBkk(u.face_enrolled_at).join(' '))}</p>`
        : `<div class="empty">${error?'โหลดรูปไม่สำเร็จ: '+esc(error.message):'ไม่มีรูป'}</div>`;
    }); });
  accP.querySelectorAll('[data-rface]').forEach(b=>b.onclick=async()=>{
    if(!confirm('ลบใบหน้าที่ลงทะเบียนของพนักงานคนนี้?\nครั้งถัดไปที่ลงเวลา ระบบจะลงทะเบียนใบหน้าใหม่')) return;
    const {error}=await sb.rpc('checkin_reset_face',{p_user_id:b.dataset.rface});
    if(error){ toast('ไม่สำเร็จ: '+error.message); return; } toast('รีเซ็ตใบหน้าแล้ว'); render(); });
  accP.querySelectorAll('[data-act]').forEach(b=>b.onclick=async()=>{
    const {error}=await sb.from('checkin_users').update({active:b.dataset.on==='1'}).eq('id',b.dataset.act);
    if(error){ toast('ไม่สำเร็จ: '+error.message); return; } render();
  });
  const bulk=accP.querySelector('#ckBulk');
  if(bulk) bulk.onclick=async()=>{
    const taken=new Set(S.users.map(u=>u.emp_code));
    const todo=staff.filter(e=>!byEmp.has(e.id)); if(!todo.length){ toast('ทุกคนมีบัญชีแล้ว'); return; }
    bulk.disabled=true; const out=[]; let skip=0;
    for(const e of todo){
      const login=String(e.code||'').toUpperCase().replace(/[^A-Z0-9._-]/g,'');
      if(login.length<3||taken.has(login)){ skip++; continue; }
      const pw=ckPin(); bulk.textContent=`กำลังสร้าง ${out.length+1}/${todo.length}…`;
      const err=await setAcc(e,login,pw); if(err){ toast('ไม่สำเร็จ: '+errMsg(err)); break; }
      taken.add(login); out.push({name:e.name,login,pw});
    }
    if(skip) toast(`ข้าม ${skip} คน (รหัสพนักงานใช้เป็นชื่อผู้ใช้ไม่ได้ — ตั้งเองทีละคน)`);
    if(out.length) showCreds(out); else render();
  };

  /* ---- ผู้บริหาร/CEO ที่ไม่อยู่ในรายชื่อพนักงาน (อนุมัติอย่างเดียว) ---- */
  const extUsers=S.users.filter(u=>String(u.emp_id).startsWith('ext:'));
  const exP=el(`<div class="panel"><div style="padding:16px 18px">
    <h3 style="margin-bottom:4px">👔 ผู้บริหาร / CEO (อนุมัติใบลาอย่างเดียว)</h3>
    <p class="muted" style="font-size:13px;margin-bottom:10px">สำหรับผู้อนุมัติที่<strong>ไม่ได้อยู่ในรายชื่อพนักงาน</strong> (เช่น กรรมการ) — ลิงก์มีแค่รายการอนุมัติ ไม่มีลงเวลา/ใบลา
    · ถ้าผู้บริหารเป็นพนักงานอยู่แล้ว ให้เปลี่ยน “ประเภทบัญชี” ในตารางด้านบนเป็น “ผู้บริหาร/CEO” แทน</p>
    ${extUsers.length?`<div class="tbl-wrap"><table><thead><tr><th>ชื่อ</th><th>ชื่อผู้ใช้</th><th>สถานะ</th><th></th></tr></thead><tbody>
      ${extUsers.map(u=>`<tr><td>${esc(u.emp_name)}</td><td><strong>${esc(u.emp_code)}</strong></td>
        <td>${u.active?'<span class="chip" style="background:#dcfce7;color:#16a34a">ใช้งานได้</span>':'<span class="chip" style="background:#fee2e2;color:#b91c1c">ปิดใช้งาน</span>'}</td>
        <td style="text-align:right;white-space:nowrap"><button class="btn ghost sm" data-xedit="${u.id}">✏️ รหัสผ่าน</button>
          <button class="btn ghost sm" data-link="${esc(u.emp_code)}">🔗 คัดลอกลิงก์</button>
          <button class="btn ghost sm" data-act="${u.id}" data-on="${u.active?0:1}">${u.active?'ปิด':'เปิด'}</button></td></tr>`).join('')}
    </tbody></table></div>`:''}
    <button class="btn sm" id="ckAddExec" style="margin-top:10px" ${cfg.code?'':'disabled'}>➕ เพิ่มผู้บริหาร / CEO</button>
  </div></div>`);
  v.appendChild(exP);
  const execModal=(u)=>{
    openModal(u?'✏️ ตั้งรหัสผ่านผู้บริหาร':'➕ เพิ่มผู้บริหาร / CEO',
      `<div class="field"><label>ชื่อ-นามสกุล</label><input id="xName" value="${esc(u?u.emp_name:'')}" ${u?'readonly':''}></div>
       <div class="field" style="margin-top:10px"><label>ชื่อผู้ใช้ (a-z, 0-9, จุด, ขีด · 3–30 ตัว)</label><input id="xLogin" value="${esc(u?u.emp_code:'')}" style="text-transform:uppercase" autocomplete="off"></div>
       <div class="field" style="margin-top:10px"><label>รหัสผ่าน (4–32 ตัวอักษร)</label>
         <div style="display:flex;gap:6px"><input id="xPw" type="text" autocomplete="new-password" style="flex:1" value="${ckPin()}"><button class="btn ghost sm" id="xGen">🎲 สุ่ม</button></div></div>`,
      [['ยกเลิก','ghost',closeModal],['💾 บันทึก','',async()=>{
        const name=$('#xName').value.trim(), login=$('#xLogin').value.trim().toUpperCase(), pw=$('#xPw').value;
        if(name.length<2){ toast('ใส่ชื่อ'); return; }
        if(!/^[A-Z0-9._-]{3,30}$/.test(login)){ toast(ERRS.bad_login); return; }
        if(pw.length<4||pw.length>32){ toast(ERRS.bad_pin); return; }
        const empId=u?u.emp_id:'ext:'+crypto.randomUUID().slice(0,12);
        const {data:id,error}=await sb.rpc('checkin_set_user',{p_emp_id:empId,p_emp_code:login,p_emp_name:name,p_pin:pw});
        if(error){ toast('ไม่สำเร็จ: '+errMsg(error)); return; }
        const {error:e2}=await sb.from('checkin_users').update({role:'exec'}).eq('id',id||(u&&u.id));
        if(e2){ toast(/role/.test(e2.message)?'ยังไม่ได้รัน supabase-checkin-8.sql':('ตั้งประเภทบัญชีไม่สำเร็จ: '+e2.message)); return; }
        showCreds([{name,login,pw}]);
      }]]);
    $('#xGen').onclick=()=>{ $('#xPw').value=ckPin(); };
  };
  exP.querySelector('#ckAddExec').onclick=()=>execModal(null);
  exP.querySelectorAll('[data-xedit]').forEach(b=>b.onclick=()=>execModal(S.users.find(x=>x.id===b.dataset.xedit)));
  exP.querySelectorAll('[data-link]').forEach(b=>b.onclick=()=>copy(userLink(b.dataset.link)));
  exP.querySelectorAll('[data-act]').forEach(b=>b.onclick=async()=>{
    const {error}=await sb.from('checkin_users').update({active:b.dataset.on==='1'}).eq('id',b.dataset.act);
    if(error){ toast('ไม่สำเร็จ: '+error.message); return; } render(); });

  /* ---- สายอนุมัติใบลา (ขั้นเดียว) ---- */
  const A=Object.assign({enabled:false,ceo:'',depts:{},overrides:{},delegates:[]}, cfg.approval||{});
  const actU=S.users.filter(u=>u.active);
  const uName=id=>{ const u=S.users.find(x=>x.id===id); return u?u.emp_name+(u.role==='exec'?' (ผู้บริหาร)':u.role==='head'?' (หัวหน้า)':''):''; };
  const uOpts=(sel,extra)=>`${extra||''}${actU.slice().sort((a,b)=>(b.role>a.role?1:-1)).map(u=>`<option value="${u.id}" ${sel===u.id?'selected':''}>${esc(uName(u.id))}</option>`).join('')}`;
  const depts=[...new Set(DB.employees.map(e=>(e.dept||'').trim()).filter(Boolean))].sort();
  const apP=el(`<div class="panel"><div style="padding:16px 18px">
    <h3 style="margin-bottom:4px">🧭 สายอนุมัติใบลา</h3>
    <p class="muted" style="font-size:13px;margin-bottom:10px">อนุมัติขั้นเดียว — ผู้อนุมัติกดแล้วจบ ใบลาเข้าระบบลางานทันที · HR แก้ในหน้าระบบลางานได้เสมอ<br>
    ใบลาไปหา: ข้อยกเว้นรายคน → ผู้อนุมัติของแผนก → ผู้อนุมัติสูงสุด · ผู้อนุมัติของแผนกลาเอง → ผู้อนุมัติสูงสุด · ผู้อนุมัติสูงสุดลาเอง → HR</p>
    <label style="display:flex;gap:8px;align-items:center;font-weight:700"><input type="checkbox" id="apOn" ${A.enabled?'checked':''} style="width:18px;height:18px"> เปิดใช้สายอนุมัติ (ปิด = ใบลาไปที่ HR อย่างเดียว)</label>
    <div class="field" style="margin-top:12px;max-width:420px"><label>👔 ผู้อนุมัติสูงสุด (CEO / ผู้บริหาร)</label>
      <select id="apCeo">${uOpts(A.ceo,'<option value="">— ยังไม่เลือก (ไปที่ HR) —</option>')}</select></div>

    <h4 style="margin:16px 0 6px">ผู้อนุมัติของแต่ละแผนก</h4>
    ${depts.length?`<div class="tbl-wrap"><table><thead><tr><th>แผนก</th><th>ผู้อนุมัติ</th></tr></thead><tbody>
      ${depts.map(d=>`<tr><td>${esc(d)}</td><td><select data-apd="${esc(d)}">${uOpts(A.depts[d],'<option value="">— ไม่มี (ไปที่ผู้อนุมัติสูงสุด) —</option>')}</select></td></tr>`).join('')}
    </tbody></table></div>`:'<p class="muted" style="font-size:13px">ยังไม่มีแผนกในข้อมูลพนักงาน — ใส่แผนกในหน้าข้อมูลพนักงานก่อน</p>'}

    <h4 style="margin:16px 0 6px">ข้อยกเว้นรายคน</h4>
    <div id="apOv"></div><button class="btn ghost sm" id="apOvAdd">＋ เพิ่มข้อยกเว้น</button>

    <h4 style="margin:16px 0 6px">ผู้อนุมัติแทน (ชั่วคราว)</h4>
    <p class="muted" style="font-size:12.5px;margin-bottom:6px">เช่น หัวหน้าลาพักร้อน ให้อีกคนอนุมัติแทนในช่วงวันที่นี้ (ใช้กับใบลาที่ยื่นเข้ามาในช่วงนั้น)</p>
    <div id="apDel"></div><button class="btn ghost sm" id="apDelAdd">＋ เพิ่มผู้อนุมัติแทน</button>

    <div style="margin-top:16px"><button class="btn" id="apSave">💾 บันทึกสายอนุมัติ</button></div>
  </div></div>`);
  v.appendChild(apP);
  const staffAll=DB.employees.filter(e=>!e.resignDate);
  const ov=Object.entries(A.overrides||{}).map(([emp,to])=>({emp,to}));
  const dl=(A.delegates||[]).map(x=>({...x}));
  const drawOv=()=>{ const box=apP.querySelector('#apOv'); box.innerHTML=ov.length?'':'<div class="muted" style="font-size:13px">ไม่มี</div>';
    ov.forEach((o,i)=>{ const r=el(`<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:6px">
      <select data-k="emp">${'<option value="">— พนักงาน —</option>'+staffAll.map(e=>`<option value="${e.id}" ${o.emp===e.id?'selected':''}>${esc(e.code)} ${esc(e.name)}</option>`).join('')}</select>
      <span>→</span><select data-k="to">${uOpts(o.to,`<option value="ceo" ${o.to==='ceo'?'selected':''}>ผู้อนุมัติสูงสุด (CEO)</option>`)}</select>
      <button class="btn ghost sm" data-x style="color:#dc2626">ลบ</button></div>`);
      r.querySelectorAll('select').forEach(s=>s.onchange=()=>{ o[s.dataset.k]=s.value; });
      r.querySelector('[data-x]').onclick=()=>{ ov.splice(i,1); drawOv(); }; box.appendChild(r); }); };
  const drawDl=()=>{ const box=apP.querySelector('#apDel'); box.innerHTML=dl.length?'':'<div class="muted" style="font-size:13px">ไม่มี</div>';
    dl.forEach((o,i)=>{ const r=el(`<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:6px">
      <select data-k="from_user">${uOpts(o.from_user,'<option value="">— ผู้อนุมัติ —</option>')}</select><span>ให้</span>
      <select data-k="to_user">${uOpts(o.to_user,'<option value="">— อนุมัติแทน —</option>')}</select>
      <input type="date" data-k="from" value="${o.from||''}"><span>ถึง</span><input type="date" data-k="to" value="${o.to||''}">
      <button class="btn ghost sm" data-x style="color:#dc2626">ลบ</button></div>`);
      r.querySelectorAll('select,input').forEach(s=>s.onchange=()=>{ o[s.dataset.k]=s.value; });
      r.querySelector('[data-x]').onclick=()=>{ dl.splice(i,1); drawDl(); }; box.appendChild(r); }); };
  drawOv(); drawDl();
  apP.querySelector('#apOvAdd').onclick=()=>{ ov.push({emp:'',to:'ceo'}); drawOv(); };
  apP.querySelector('#apDelAdd').onclick=()=>{ dl.push({from_user:'',to_user:'',from:ckBkk(new Date().toISOString())[0],to:''}); drawDl(); };
  apP.querySelector('#apSave').onclick=async()=>{
    if(!cfg.code){ toast('บันทึกการตั้งค่าบริษัทก่อน'); return; }
    const depMap={}; apP.querySelectorAll('[data-apd]').forEach(s=>{ if(s.value) depMap[s.dataset.apd]=s.value; });
    const ovMap={}; ov.forEach(o=>{ if(o.emp&&o.to) ovMap[o.emp]=o.to; });
    const dels=dl.filter(o=>o.from_user&&o.to_user&&o.from&&o.to&&o.to>=o.from&&o.from_user!==o.to_user);
    if(dels.length!==dl.length){ toast('ผู้อนุมัติแทนบางแถวยังกรอกไม่ครบหรือวันที่ไม่ถูกต้อง'); return; }
    const on=apP.querySelector('#apOn').checked, ceo=apP.querySelector('#apCeo').value;
    if(on && !ceo && !Object.keys(depMap).length){ toast('เลือกผู้อนุมัติสูงสุด หรือผู้อนุมัติของแผนกอย่างน้อย 1 แผนก'); return; }
    const approval={enabled:on, ceo, depts:depMap, overrides:ovMap, delegates:dels};
    const {error}=await sb.from('checkin_config').update({approval, updated_at:new Date().toISOString()}).eq('owner_id',MY_UID);
    if(error){ toast(/approval/.test(error.message)?'ยังไม่ได้รัน supabase-checkin-8.sql':('บันทึกไม่สำเร็จ: '+error.message)); return; }
    // ผู้อนุมัติของแผนกที่ยังเป็นบัญชีพนักงานธรรมดา → เปลี่ยนเป็นหัวหน้า (ให้เห็นปุ่มอนุมัติ)
    const heads=[...new Set([...Object.values(depMap),...Object.values(ovMap).filter(x=>x!=='ceo'),...dels.map(d=>d.to_user)])]
      .filter(id=>{ const u=S.users.find(x=>x.id===id); return u&&(u.role||'staff')==='staff'; });
    if(heads.length){ await sb.from('checkin_users').update({role:'head'}).in('id',heads);
      heads.forEach(id=>{ const u=S.users.find(x=>x.id===id), e=u&&DB.employees.find(x=>x.id===u.emp_id); if(e) e.ckRole='head'; }); save(); }
    toast('บันทึกสายอนุมัติแล้ว'); render();
  };

  /* ---- 3) บันทึกการลงเวลา ---- */
  const logP=el(`<div class="panel"><div style="padding:16px 18px 6px;display:flex;gap:10px;flex-wrap:wrap;align-items:center">
    <h3 style="margin-right:auto">3. บันทึกการลงเวลา (งวดนี้)</h3>
    <button class="btn ghost sm" id="ckReload">🔄 โหลดใหม่</button>
    ${unmerged?`<button class="btn sm" id="ckMerge">⬇️ นำเข้าหน้าเวลาเข้างาน (${num(unmerged)} ใหม่)</button>`:(S.punches.length?'<span class="chip" style="background:#dcfce7;color:#15803d;font-weight:700;padding:6px 12px">✅ นำเข้าครบแล้ว</span> <button class="btn ghost sm" id="ckMerge" data-redo="1">⬇️ นำเข้าใหม่อีกครั้ง</button>':'')}
  </div>
  <p class="muted" style="font-size:12.5px;padding:0 18px 8px">นำเข้าแล้วระบบใช้ <strong>เวลาเข้าเร็วสุด</strong> และ <strong>เวลาออกช้าสุด</strong> ของแต่ละวัน ไปคิดวันทำงาน มาสาย และ OT ตามปกติ · รูปถูกลบอัตโนมัติหลัง 90 วัน</p>
  <div class="tbl-wrap" style="max-height:60vh;overflow:auto"><table><thead><tr><th>รูป</th><th>วันเวลา</th><th>พนักงาน</th><th>ประเภท</th><th>ตำแหน่ง</th><th>สถานะ</th><th></th></tr></thead><tbody>
  ${S.punches.length?S.punches.map(p=>{ const [d,t]=ckBkk(p.ts);
    return `<tr><td>${(p.has_photo!==false&&p.has_photo!==null)?`<button class="btn ghost sm" data-ph="${p.id}" title="ดูรูปตอนลงเวลา">📷</button>`:'<span class="muted">-</span>'}</td>
      <td style="white-space:nowrap">${d.slice(8)}/${d.slice(5,7)} <strong>${t}</strong></td>
      <td>${esc(p.emp_code)} ${esc(p.emp_name)}</td>
      <td>${p.kind==='in'?'<span class="chip" style="background:#dcfce7;color:#16a34a">เข้า</span>':'<span class="chip" style="background:#fef3c7;color:#b45309">ออก</span>'}</td>
      <td style="font-size:12.5px">${p.lat!=null?`<a target="_blank" rel="noopener" href="https://www.google.com/maps?q=${p.lat},${p.lng}">${p.site_name?esc(p.site_name)+' · ':''}${p.distance_m!=null?num(p.distance_m)+' ม.':'แผนที่'}</a>`:'<span class="muted">ไม่มี GPS</span>'}
        ${p.in_zone===false?' <span class="chip" style="background:#fee2e2;color:#b91c1c">นอกพื้นที่</span>':''}
        ${p.face_dist!=null?(p.face_dist===0?' <span class="chip" style="background:#e0f2fe;color:#0369a1">ลงทะเบียนหน้า</span>'
          :` <span class="chip" style="background:#dcfce7;color:#16a34a" title="ระยะห่างใบหน้า ${(+p.face_dist).toFixed(2)} (ยิ่งน้อยยิ่งเหมือน)">หน้าตรง ${Math.max(0,Math.round((1-p.face_dist)*100))}%</span>`):''}</td>
      <td>${p.merged?'<span class="muted" style="font-size:12px">นำเข้าแล้ว</span>':'<span style="font-size:12px;color:#0f766e;font-weight:700">รอนำเข้า</span>'}
        ${p.edited_at?`<br><span style="font-size:11px;color:#b45309" title="เดิม ${p.orig_ts?esc(ckBkk(p.orig_ts).join(' ')):''} ${p.orig_kind==='out'?'ออก':p.orig_kind==='in'?'เข้า':''}">✏️ แก้ไขแล้ว</span>`:''}</td>
      <td style="white-space:nowrap;text-align:right"><button class="btn ghost sm" data-pedit="${p.id}" title="แก้ไข">✏️</button>
        <button class="btn ghost sm" data-pdel="${p.id}" title="ลบ" style="color:#dc2626">🗑️</button></td></tr>`; }).join('')
    :'<tr><td colspan="7"><div class="empty">ยังไม่มีการลงเวลาในงวดนี้</div></td></tr>'}
  </tbody></table></div></div>`);
  v.appendChild(logP);
  logP.querySelector('#ckReload').onclick=()=>render();
  /* แก้/ลบรายการที่นำเข้าแล้ว → คำนวณเวลาเข้า-ออกของวันนั้นใหม่จากรายการที่เหลือ (เวลาเข้าเร็วสุด/ออกช้าสุด) */
  const redoDay=(empId,day,list)=>{
    const box=ensureAttend(periodOfDate(day)); if(!box[empId]) box[empId]={};
    const rows=list.filter(p=>p.emp_id===empId && p.merged && ckBkk(p.ts)[0]===day).map(p=>[p.kind,ckBkk(p.ts)[1]]);
    const ins=rows.filter(x=>x[0]==='in').map(x=>x[1]).sort(), outs=rows.filter(x=>x[0]==='out').map(x=>x[1]).sort();
    const rec=box[empId][day]||{};
    const nr={i:ins[0]||'', o:outs[outs.length-1]||''}; if(rec.c!=null) nr.c=rec.c;
    if(!nr.i && !nr.o && nr.c==null) delete box[empId][day]; else box[empId][day]=nr;
  };
  logP.querySelectorAll('[data-pdel]').forEach(b=>b.onclick=async()=>{
    const p=S.punches.find(x=>String(x.id)===b.dataset.pdel); if(!p) return; const [d,t]=ckBkk(p.ts);
    if(!confirm(`ลบรายการ${p.kind==='in'?'เข้างาน':'ออกงาน'}ของ ${p.emp_name||p.emp_code} วันที่ ${d.slice(8)}/${d.slice(5,7)} เวลา ${t}?${p.merged?'\nเวลาเข้างานของวันนั้นจะถูกคำนวณใหม่จากรายการที่เหลือ':''}`)) return;
    const {error}=await sb.from('punches').delete().eq('id',p.id);
    if(error){ toast('ลบไม่สำเร็จ: '+error.message); return; }
    if(p.merged){ redoDay(p.emp_id,d,S.punches.filter(x=>x.id!==p.id)); save(); }
    toast('ลบรายการแล้ว'); render();
  });
  logP.querySelectorAll('[data-pedit]').forEach(b=>b.onclick=()=>{
    const p=S.punches.find(x=>String(x.id)===b.dataset.pedit); if(!p) return; const [d,t]=ckBkk(p.ts);
    openModal(`✏️ แก้ไขการลงเวลา — ${esc(p.emp_name||p.emp_code)}`,
      `<div style="display:flex;gap:10px;flex-wrap:wrap">
         <div class="field"><label>วันที่</label><input type="date" id="peD" value="${d}"></div>
         <div class="field"><label>เวลา (24 ชม.)</label>${t24('id="peT"',t)}</div>
         <div class="field"><label>ประเภท</label><select id="peK"><option value="in" ${p.kind==='in'?'selected':''}>เข้างาน</option><option value="out" ${p.kind==='out'?'selected':''}>ออกงาน</option></select></div>
       </div>
       <p class="muted" style="font-size:12.5px;margin-top:8px">ระบบเก็บเวลาเดิมไว้เป็นหลักฐาน และแสดงป้าย “แก้ไขแล้ว” ในรายการ${p.merged?' · เวลาเข้างานของวันนั้นจะถูกคำนวณใหม่ให้อัตโนมัติ':''}</p>`,
      [['ยกเลิก','ghost',closeModal],['💾 บันทึก','',async()=>{
        const nd=$('#peD').value, nt=t24Norm($('#peT').value), nk=$('#peK').value;
        if(!nd || !nt){ toast('กรอกวันที่และเวลาให้ถูกต้อง'); return; }
        const ts=new Date(`${nd}T${nt}:00+07:00`).toISOString();
        const patch={ ts, kind:nk, edited_at:new Date().toISOString() };
        if(!p.orig_ts){ patch.orig_ts=p.ts; patch.orig_kind=p.kind; }
        const {error}=await sb.from('punches').update(patch).eq('id',p.id);
        if(error){ toast(/permission|edited_at|orig_/i.test(error.message)?'ยังไม่ได้รัน supabase-checkin-5.sql':('บันทึกไม่สำเร็จ: '+error.message)); return; }
        if(p.merged){ const upd=S.punches.map(x=>x.id===p.id?{...x,...patch}:x); redoDay(p.emp_id,d,upd); if(nd!==d) redoDay(p.emp_id,nd,upd); save(); }
        closeModal(); toast('แก้ไขแล้ว'); render();
      }]]);
  });
  logP.querySelectorAll('[data-ph]').forEach(im=>im.onclick=()=>{
    const p=S.punches.find(x=>String(x.id)===im.dataset.ph); const [d,t]=ckBkk(p.ts);
    openModal(`${esc(p.emp_name||p.emp_code)} · ${p.kind==='in'?'เข้างาน':'ออกงาน'} ${d.slice(8)}/${d.slice(5,7)} ${t}`,
      '<div class="empty">กำลังโหลดรูป…</div>',[['ปิด','',closeModal]]);
    sb.from('punches').select('photo').eq('id',p.id).maybeSingle().then(({data,error})=>{
      const box=$('#modal').querySelector('.mbody'); if(!box) return;
      box.innerHTML = (data&&data.photo)
        ? `<img src="${data.photo}" alt="" style="width:100%;max-width:360px;border-radius:14px;display:block;margin:0 auto">`
        : `<div class="empty">${error?'โหลดรูปไม่สำเร็จ: '+esc(error.message):'ไม่มีรูป (ระบบลบรูปอัตโนมัติหลัง 90 วัน)'}</div>`;
    });
  });
  const mBtn=logP.querySelector('#ckMerge'); if(mBtn) mBtn.onclick=async()=>{
    const redo=!!mBtn.dataset.redo;
    if(redo && !confirm('นำเข้าเวลาจากมือถือของงวดนี้ใหม่ทั้งหมด?\nวันที่มีรายการในมือถือ เวลาเข้า/ออกในหน้าเวลาเข้างานจะถูกแทนด้วยเวลาล่าสุดจากมือถือ (ถ้าเคยแก้เองในหน้าเวลาเข้างาน จะถูกแทน)')) return;
    mBtn.disabled=true; mBtn.textContent='⏳ กำลังนำเข้า…';
    const res=await ckMergePunches(redo?S.punches.slice():S.punches.filter(p=>!p.merged), redo);
    render();
    openModal(res.err?'⚠️ นำเข้าแล้วบางส่วน':'✅ นำเข้าเวลาเข้างานเรียบร้อย',
      `<p style="font-size:15px">นำเข้า <strong>${num(res.n)}</strong> รายการ ไปที่หน้า <strong>เวลาเข้างาน</strong> แล้ว</p>`
      +(res.skipped?`<p class="muted">ข้าม ${num(res.skipped)} รายการ เพราะไม่พบพนักงานในระบบ</p>`:'')
      +(res.err?`<p style="color:#dc2626">บันทึกสถานะไม่สำเร็จ: ${esc(res.err)}</p>`:'')
      +'<p class="muted" style="font-size:13px">ระบบใช้เวลาเข้าเร็วสุด/ออกช้าสุดของแต่ละวัน ไปคิดวันทำงาน มาสาย และ OT</p>',
      [['ปิด','ghost',closeModal],['ไปหน้าเวลาเข้างาน','',()=>{ closeModal(); PAGE='attend'; savePage('attend'); renderNav(); render(); }]]);
  };
}

/* นำรายการลงเวลาจากมือถือเข้าหน้าเวลาเข้างาน (เข้าเร็วสุด/ออกช้าสุดของวัน) แล้วติดสถานะ merged */
async function ckMergePunches(todo, redo){
  const known=new Map(DB.employees.map(e=>[e.id,e])); let n=0, skipped=0;
  if(redo){                                          // นำเข้าใหม่: ล้างวันที่มีรายการในมือถือ แล้วคิดจากรายการล่าสุด
    todo.forEach(p=>{ if(!known.has(p.emp_id)) return; const [d]=ckBkk(p.ts); const box=ensureAttend(periodOfDate(d));
      if(!box[p.emp_id]) box[p.emp_id]={}; const o=box[p.emp_id][d]||{}; box[p.emp_id][d]=Object.assign({},o,{i:'',o:''}); });
  }
  todo.slice().sort((a,b)=>a.ts<b.ts?-1:1).forEach(p=>{
    if(!known.has(p.emp_id)){ skipped++; return; }
    const [d,t]=ckBkk(p.ts); const box=ensureAttend(periodOfDate(d));
    if(!box[p.emp_id]) box[p.emp_id]={};
    const r=box[p.emp_id][d]||(box[p.emp_id][d]={i:'',o:''});
    if(p.kind==='in'){ if(!r.i || t<r.i) r.i=t; } else { if(!r.o || t>r.o) r.o=t; }
    n++;
  });
  if(n) save();
  const ids=todo.filter(p=>known.has(p.emp_id)).map(p=>p.id); let err='';
  for(let i=0;i<ids.length;i+=200){ const {error}=await sb.from('punches').update({merged:true}).in('id',ids.slice(i,i+200)); if(error){ err=error.message; break; } }
  return {n, skipped, err};
}
/* นำเข้าอัตโนมัติ — เรียกตอนเปิดหน้าเวลาเข้างาน/ลงเวลาผ่านมือถือ (เงียบ ๆ ไม่รบกวนถ้าไม่มีอะไรใหม่) */
let _ckAutoBusy=false, _ckAutoAt=0;
async function ckAutoMerge(){
  if(_ckAutoBusy || DEMO || !sb || !MY_UID || isFirm() || !hasPremium()) return;
  if(Date.now()-_ckAutoAt<60000) return;              // ไม่เกินนาทีละครั้ง
  _ckAutoBusy=true; _ckAutoAt=Date.now();
  try{
    const since=new Date(Date.now()-62*86400000).toISOString();
    const {data,error}=await sb.from('punches').select('id,emp_id,kind,ts').eq('owner_id',MY_UID).eq('merged',false).gte('ts',since).limit(2000);
    if(error || !data || !data.length) return;
    const res=await ckMergePunches(data);
    if(res.n){ toast(`📱 นำเข้าเวลาจากมือถืออัตโนมัติ ${num(res.n)} รายการ`); if(PAGE==='attend'||PAGE==='checkin') render(); }
  }catch(e){} finally{ _ckAutoBusy=false; }
}

/* ใบลาจากมือถือ ↔ ระบบลางาน
   ดึง: ใบลาใหม่ → DB.leave (สถานะรออนุมัติ, reqId=เลขใบลาในตาราง leave_requests)
   ส่งกลับ: สถานะที่แอดมินเลือกในระบบลางาน → leave_requests.status ให้พนักงานเห็น
   พนักงานยกเลิกใบที่ยังรออนุมัติ → ลบออกจากระบบลางาน */
let _lvSyncBusy=false, _lvSyncAt=0;
async function ckLeaveSync(force){
  if(_lvSyncBusy || DEMO || !sb || !MY_UID || isFirm() || !hasPremium()) return;
  if(!force && Date.now()-_lvSyncAt<30000) return;
  _lvSyncBusy=true; _lvSyncAt=Date.now();
  let changed=false, added=0;
  try{
    const L=leaveList();
    // 1) ใบใหม่ที่ยังไม่เคยดึง
    const {data:news,error}=await sb.from('leave_requests').select('*').eq('owner_id',MY_UID).eq('synced',false).limit(500);
    if(error) return;                                    // ยังไม่รัน SQL รอบ 6 → เงียบไว้
    const known=new Set(DB.employees.map(e=>e.id)), done=[];
    (news||[]).forEach(q=>{
      done.push(q.id);
      if(!known.has(q.emp_id) || L.some(l=>l.reqId===q.id)) return;
      if(q.status==='cancelled') return;                 // ยกเลิกก่อนแอดมินเห็น ไม่ต้องเพิ่ม
      const hours=q.hours!=null?+q.hours:null;
      const by=q.decided_by_name?` · ${q.status==='approved'?'อนุมัติ':'ไม่อนุมัติ'}โดย ${q.decided_by_name}${q.decide_note?' ('+q.decide_note+')':''}`:(q.approver_name?` · ผู้อนุมัติ ${q.approver_name}`:'');
      L.push({ id:uid(), reqId:q.id, reqStatus:q.status, files:Array.isArray(q.attachments)?q.attachments.length:0, empId:q.emp_id, type:q.type, status:q.status, from:q.from_date, to:q.to_date,
               days: hours!=null?hrsToDays(hours):leaveDaysCount(q.from_date,q.to_date), hours,
               reason:(q.reason?q.reason+' · ':'')+'ยื่นจากมือถือ'+by });
      added++; changed=true;
    });
    if(done.length) await sb.from('leave_requests').update({synced:true}).in('id',done);
    // 2) ส่งสถานะกลับ + รับการยกเลิกจากพนักงาน
    const mine=L.filter(l=>l.reqId);
    if(mine.length){
      const {data:rs}=await sb.from('leave_requests').select('id,status,decided_by_name,decide_note').in('id',mine.map(l=>l.reqId));
      const st=new Map((rs||[]).map(x=>[x.id,x]));
      for(const l of mine){
        const q=st.get(l.reqId); if(!q) continue; const s=q.status;
        if(s==='cancelled'){ if(l.status==='pending'){ L.splice(L.indexOf(l),1); changed=true; } continue; }
        const known=l.reqStatus||'pending';
        if(s!==known){                                   // ผู้อนุมัติตัดสินในมือถือ → ใช้ค่าจากเซิร์ฟเวอร์
          l.status=s; l.reqStatus=s; changed=true;
          if(q.decided_by_name && !String(l.reason||'').includes('โดย '+q.decided_by_name))
            l.reason=(l.reason||'')+` · ${s==='approved'?'อนุมัติ':'ไม่อนุมัติ'}โดย ${q.decided_by_name}${q.decide_note?' ('+q.decide_note+')':''}`;
          continue;
        }
        const want=['pending','approved','rejected'].includes(l.status)?l.status:'approved';
        if(s!==want){                                    // HR แก้ในระบบลางาน → ส่งกลับให้พนักงานเห็น
          await sb.from('leave_requests').update({status:want, decided_at:new Date().toISOString(), decided_by_name:'ฝ่ายบุคคล (HR)'}).eq('id',l.reqId);
          l.reqStatus=want; changed=true;
        }
      }
    }
    if(changed){ save(); if(added) toast(`📱 มีใบลาใหม่จากมือถือ ${num(added)} ใบ`); if(['leave','attend','checkin'].includes(PAGE)) render(); }
  }catch(e){} finally{ _lvSyncBusy=false; }
}

