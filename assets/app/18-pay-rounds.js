/* app.html · จ่ายรายรอบ (เดือนละ 2 รอบ / รายสัปดาห์) — ลำดับไฟล์มีผล (โหลดตามเลข)
   หลักคิด: "เดือน" ยังเป็นงวดภาษี/ประกันสังคม/ภ.ง.ด.1/สปส.1-10 เหมือนเดิม แต่แบ่งจ่ายเงินเป็นหลายรอบ
   - รอบก่อนสุดท้าย: ค่าจ้างตามวันทำงานจริงในช่วงนั้น + OT ของช่วงนั้น
       ประกันสังคม = คิดสะสม (5% ของค่าจ้างสะสม ไม่เกินเพดาน) ลบที่หักไปแล้ว → รวมทั้งเดือนไม่เกิน 875
       ภาษี = ภาษีทั้งเดือน × (เงินได้รอบนี้ ÷ เงินได้ประมาณการทั้งเดือน)  — เฉลี่ยหักทุกรอบ
   - รอบสุดท้าย = ยอดทั้งเดือนจากหน้าคำนวณเงินเดือน − ที่จ่ายไปแล้ว (เงินหักอื่น ๆ หักรอบนี้ทั้งหมด)
   - กด "บันทึกว่าจ่ายแล้ว" = เก็บยอดรอบนั้นไว้ (ตัวเลขไม่เปลี่ยนตามทีหลัง) และยอดสุทธิที่จ่ายไปแล้ว
     ไปอยู่ในช่อง "เบิกจ่ายล่วงหน้า" ของเดือน → เงินสุทธิสิ้นเดือน = ส่วนที่เหลือพอดี (กลไกเดียวกับเบิกล่วงหน้า)
   ข้อมูล: DB.payRounds = { "YYYY-MM": { weekly|semi: { "1": {at,payDate,emps:{id:{...}}} } } } · DB.weekEnd = วันสิ้นสัปดาห์ (0=อา) */
const CYCLE_LABEL={weekly:'รายสัปดาห์',semi:'เดือนละ 2 รอบ'};
const WEEKDAY_TH=['อาทิตย์','จันทร์','อังคาร','พุธ','พฤหัสบดี','ศุกร์','เสาร์'];
let RND_CYCLE=null, RND_IDX={};
const r2=n=>Math.round((+n||0)*100)/100;
function cycleOf(e){ return e.payCycle==='weekly'||e.payCycle==='semi' ? e.payCycle : 'monthly'; }
function addDays(d,n){ return new Date(d.getFullYear(), d.getMonth(), d.getDate()+n); }
/* แบ่งงวดเดือนเป็นรอบ */
function payRounds(p, cycle){
  const {from,to}=periodRange(p), out=[];
  if(cycle==='semi'){
    const mid=addDays(from,14);
    out.push([from, mid<to?mid:to]);
    if(mid<to) out.push([addDays(mid,1), to]);
  } else {
    const we=(DB.weekEnd==null)?0:+DB.weekEnd;
    let s=from;
    for(let d=from; d<=to; d=addDays(d,1)){
      if(d.getDay()===we || isoOf(d)===isoOf(to)){ out.push([s,d]); s=addDays(d,1); }
    }
  }
  return out.map(([a,b],i)=>({i:i+1, from:isoOf(a), to:isoOf(b), last:i===out.length-1, cycle}));
}
function roundStore(p, cycle){
  DB.payRounds=DB.payRounds||{}; DB.payRounds[p]=DB.payRounds[p]||{}; DB.payRounds[p][cycle]=DB.payRounds[p][cycle]||{};
  return DB.payRounds[p][cycle];
}
/* วันทำงาน/ชม. OT ที่กรอกเองในรอบ (กรณีไม่มีเวลาเข้างาน) — เก็บแยกใน _man ไม่ปนกับรอบที่บันทึกจ่าย */
function roundManual(p, cycle, i, empId){ const st=DB.payRounds&&DB.payRounds[p]&&DB.payRounds[p][cycle]; const m=st&&st._man&&st._man[String(i)]; return (m&&m[empId])||null; }
function setRoundManual(p, cycle, i, empId, key, val){
  const st=roundStore(p,cycle); st._man=st._man||{}; const m=st._man[String(i)]=st._man[String(i)]||{}; const o=m[empId]=m[empId]||{};
  if(val===''||val==null) delete o[key]; else o[key]=Math.max(0,+val||0);
  if(!Object.keys(o).length) delete m[empId];
  save();
}
function setRoundOT(p, cycle, i, empId, by){
  const st=roundStore(p,cycle); st._man=st._man||{}; const m=st._man[String(i)]=st._man[String(i)]||{}; const o=m[empId]=m[empId]||{};
  if(by) o.otBy=by; else delete o.otBy;
  if(!Object.keys(o).length) delete m[empId];
  save();
}
function roundPaid(p, cycle, i){ const st=DB.payRounds&&DB.payRounds[p]&&DB.payRounds[p][cycle]; return (st&&st[String(i)])||null; }
/* ช่วงที่คนนี้ทำงานจริงภายในรอบ (ตัดวันเริ่มงาน/ลาออก) — null = ไม่ได้ทำงานในรอบนี้ */
function empWindow(e, from, to){
  let a=from, b=to;
  if(e.startDate && e.startDate>a) a=e.startDate;
  if(e.resignDate && e.resignDate<b) b=e.resignDate;
  return a<=b ? {from:a, to:b} : null;
}
/* ป้ายบอกที่มาของตัวเลขในช่อง: 📱 จากลงเวลา / ✏️ กรอกเอง (กดเพื่อกลับไปใช้ลงเวลา) */
function rnSrc(manual, hol){
  return manual ? `<div style="font-size:10.5px;margin-top:2px"><a href="#" class="rnAuto" title="ลบที่กรอกเอง แล้วใช้ตัวเลขจากลงเวลา">✏️ กรอกเอง · ↩️ ใช้ลงเวลา</a></div>`
    : `<div class="muted" style="font-size:10.5px;margin-top:2px">📱 จากลงเวลา${hol?` (+วันหยุด ${num(hol)})`:''}</div>`;
}
/* OT ของรอบแยกตามตัวคูณ: กรอกเอง (man.otBy หรือแบบเก่า man.otH = 1.5 เท่า) ไม่งั้นมาจากลงเวลา */
function roundOtBy(man, s){
  if(man && man.otBy && typeof man.otBy==='object') return man.otBy;
  if(man && man.otH!=null) return {1.5:+man.otH||0};
  return s.otBy||{};
}
function roundOtRows(e, by){ return Object.keys(by||{}).map(Number).filter(m=>+by[m]>0).sort((a,b)=>a-b).map(m=>({m, h:r2(by[m]), amt:r2(otAmount(e, +by[m], m))})); }
function otRowsHtml(rows){ return (rows||[]).map(o=>`<div class="rnOt"><b>${o.m}×</b> ${num(o.h)} ชม. <span>${money(o.amt)}</span></div>`).join(''); }
function hasManOT(man){ return !!(man && (man.otH!=null || man.otBy)); }
function winLen(w){ return w ? Math.round((new Date(w.to+'T00:00:00')-new Date(w.from+'T00:00:00'))/864e5)+1 : 0; }
/* วันได้ค่าจ้างของรายวันในรอบ: กรอกเอง (ไม่เกินจำนวนวันในช่วง) หรือ วันมาทำงาน + วันหยุดตามประเพณีที่ได้ค่าจ้าง */
function roundDays(win, s, man){
  if(man && man.days!=null) return Math.min(+man.days||0, winLen(win));
  return Math.min((s.days||0)+(s.holDays||0), winLen(win));
}
/* วันทำงาน/OT ของทุกรอบรวมกัน → เขียนลงหน้าคำนวณเงินได้/เงินหักของเดือน (ให้ 2 หน้าตรงกันเสมอ) */
function syncRoundMonth(p, cycle, e){
  let days=0, manOT=false; const by={};
  payRounds(p, cycle).forEach(rd=>{
    const win=empWindow(e, rd.from, rd.to); if(!win) return;
    const man=roundManual(p, cycle, rd.i, e.id)||{}, s=attendStats(e, p, win);
    const paid=!rd.last && roundPaid(p, cycle, rd.i), snap=paid&&paid.emps&&paid.emps[e.id];
    if(e.payType==='daily') days+= snap ? (+snap.days||0) : roundDays(win, s, man);
    if(hasManOT(man)) manOT=true;
    const ob=roundOtBy(man, s); Object.keys(ob).forEach(k=>{ by[k]=(by[k]||0)+(+ob[k]||0); });
  });
  const r=getRec(p, e.id);
  if(e.payType==='daily') r.days=r2(days);
  if(manOT){   // มีกรอก OT เองในรอบ → แถว OT ของเดือนมาจากรอบทั้งหมด
    const ks=Object.keys(by).filter(k=>by[k]>0).sort((a,b)=>a-b);
    r.earn.otRows=ks.map(k=>({h:r2(by[k]), m:+k})); delete r.earn.otHours; delete r.earn.otMult;
    r.earn.ot=otTotal(e, r);
  }
  autoDeductions(e, r);
}
/* ยอดของรอบที่ยังไม่ใช่รอบสุดท้าย (คำนวณสด) */
function roundCalcRaw(e, p, rd, prev){
  const win=empWindow(e, rd.from, rd.to);
  const zero={days:0, base:0, ot:0, otH:0, gross:0, ssoBase:0, tax:0, sso:0, net:0};
  if(!win) return zero;
  const s=attendStats(e, p, win);
  const man=roundManual(p, rd.cycle, rd.i, e.id)||{};
  let base=0, days=0;
  if(e.payType==='daily'){ days=roundDays(win, s, man); base=r2(salaryOnDate(e, win.to)*days); }
  else {
    const {from,to}=periodRange(p); const dim=Math.round((to-from)/864e5)+1;
    let sum=0; for(let d=new Date(win.from+'T00:00:00'); isoOf(d)<=win.to; d=addDays(d,1)){ sum+=salaryOnDate(e, isoOf(d)); days++; }
    base=r2(sum/dim);
  }
  const otRows=roundOtRows(e, roundOtBy(man, s));
  let ot=otRows.reduce((a,o)=>a+o.amt,0), otH=otRows.reduce((a,o)=>a+o.h,0);
  ot=r2(ot);
  const gross=r2(base+ot);
  /* ประกันสังคมสะสม: ค่าจ้าง (ไม่รวม OT) สะสมถึงรอบนี้ แล้วหักส่วนที่หักไปแล้ว */
  const ssoBase=base, cumPrev=prev.ssoBase, cum=cumPrev+ssoBase;
  const sso=ssoExempt(e) ? 0 : Math.max(0, autoSSO(cum)-autoSSO(cumPrev));
  /* ภาษีเฉลี่ยตามสัดส่วนเงินได้ของรอบ */
  const rec=readRec(p, e.id);
  let taxM=+rec.ded.tax||0;
  if(!(taxM>0)) taxM=estTax(e, +p.split('-')[0], {earn:{}, days:e.payType==='daily'?(DB.workDaysDefault||26):0}).monthly;
  const proj=e.payType==='daily' ? salaryFor(e,p)*(DB.workDaysDefault||26) : salaryFor(e,p);
  const tax=proj>0 ? r2(taxM*gross/proj) : 0;
  return {days, base, ot, otH, otRows, gross, ssoBase, tax, sso, net:r2(gross-tax-sso), attDays:s.days, holDays:s.holDays||0, maxDays:winLen(win), manDays:man.days!=null, manOT:hasManOT(man), man:(man.days!=null||hasManOT(man))};
}
/* ยอดของทุกรอบของคนหนึ่ง (รอบที่บันทึกจ่ายแล้วใช้ตัวเลขที่เก็บไว้) */
function empRounds(e, p, cycle){
  const rounds=payRounds(p, cycle), out=[];
  let prev={gross:0, tax:0, sso:0, net:0, ssoBase:0};
  rounds.forEach(rd=>{
    const paid=roundPaid(p, cycle, rd.i), snap=paid&&paid.emps&&paid.emps[e.id];
    let v;
    if(rd.last){
      const c=calc(e, p), r=c.r;
      const tax=r2((+r.ded.tax||0)-prev.tax), sso=r2((+r.ded.sso||0)-prev.sso);
      const other=r2(c.dedTotal-(+r.ded.tax||0)-(+r.ded.sso||0)-(+r.ded.advance||0));
      const lw=empWindow(e, rd.from, rd.to);
      v={last:true, maxDays:winLen(lw), manDays:(roundManual(p,cycle,rd.i,e.id)||{}).days!=null, days:e.payType==='daily'?Math.max(0,(+r.days||0)-out.reduce((s,x)=>s+(x.days||0),0)):null,
         gross:r2(c.gross-prev.gross), tax, sso, other, needDays:e.payType==='daily'&&!(+r.days>0)};
      v.net=r2(v.gross-v.tax-v.sso-v.other);   // = เงินสุทธิสิ้นเดือน − ที่จ่ายไปแล้ว (เท่ากันเมื่อบันทึกจ่ายรอบก่อนครบ)
    } else {
      v = snap ? Object.assign({}, snap) : roundCalcRaw(e, p, rd, prev);
      v.paid=!!snap;
    }
    out.push(Object.assign({rd}, v));
    if(!rd.last){ prev={gross:prev.gross+v.gross, tax:prev.tax+v.tax, sso:prev.sso+v.sso, net:prev.net+v.net, ssoBase:prev.ssoBase+(v.ssoBase||0)}; }
  });
  return out;
}
/* ยอดสุทธิที่จ่ายไปแล้ว (รอบที่บันทึก) → ช่อง "เบิกจ่ายล่วงหน้า" ของเดือน */
function syncRoundAdvance(p, cycle){
  const [py,pm]=p.split('-').map(Number);
  DB.employees.filter(e=>cycleOf(e)===cycle && activeInMonth(e,py,pm)).forEach(e=>{
    const st=roundStore(p, cycle);
    const paidNet=Object.keys(st).filter(k=>k!=='_man').reduce((s,k)=>s+((st[k].emps&&st[k].emps[e.id]&&+st[k].emps[e.id].net)||0),0);
    const r=getRec(p, e.id);
    if(paidNet>0 || (r.manual&&r.manual.advanceRounds)){
      r.manual=r.manual||{}; r.manual.advance=1; r.manual.advanceRounds=1;
      r.ded.advance=r2(paidNet);
    }
  });
  save();
}
function vRounds(v){
  const [py,pm]=PERIOD.split('-').map(Number);
  const all=DB.employees.filter(e=>activeInMonth(e,py,pm));
  const byC={weekly:all.filter(e=>cycleOf(e)==='weekly'), semi:all.filter(e=>cycleOf(e)==='semi')};
  const cycles=Object.keys(byC).filter(k=>byC[k].length);
  if(!cycles.length){
    v.appendChild(el(`<div class="panel"><div class="pbody">
      <h3 style="margin:0 0 8px">📆 จ่ายเงินเดือนหลายรอบต่อเดือน</h3>
      <p class="muted" style="margin:0 0 12px;line-height:1.7">ยังไม่มีพนักงานที่ตั้งรอบจ่ายเป็น <b>รายสัปดาห์</b> หรือ <b>เดือนละ 2 รอบ</b><br>
      ไปที่เมนู <b>ข้อมูลพนักงาน</b> → กด ✏️ ที่พนักงาน → ช่อง <b>รอบจ่ายเงิน</b> แล้วเลือกรอบที่ต้องการ</p>
      <button class="btn sm" id="rnGoEmp">👥 ไปหน้าข้อมูลพนักงาน</button></div></div>`));
    $('#rnGoEmp').onclick=()=>{ PAGE='employees'; savePage(PAGE); renderNav(); render(); };
    return;
  }
  if(typeof ckAutoMerge==='function') ckAutoMerge();   // แพ็กเกจพรีเมียม: ดึงเวลาจากมือถือเข้าก่อน แล้ววันทำงาน/OT ขึ้นเอง
  if(!cycles.includes(RND_CYCLE)) RND_CYCLE=cycles[0];
  const cycle=RND_CYCLE, emps=byC[cycle], rounds=payRounds(PERIOD, cycle);
  const key=PERIOD+'|'+cycle;
  if(!RND_IDX[key]){ const firstOpen=rounds.find(rd=>!rd.last && !roundPaid(PERIOD,cycle,rd.i)); RND_IDX[key]=firstOpen?firstOpen.i:rounds.length; }
  const idx=Math.min(RND_IDX[key], rounds.length), rd=rounds[idx-1];
  const rows=emps.map(e=>({e, all:empRounds(e,PERIOD,cycle)})).map(x=>Object.assign(x,{v:x.all[idx-1]}));
  const paid=!rd.last && roundPaid(PERIOD,cycle,rd.i);
  const unpaidBefore=rounds.filter(x=>x.i<rd.i && !x.last && !roundPaid(PERIOD,cycle,x.i)).length;
  const tot=k=>r2(rows.reduce((s,x)=>s+(+x.v[k]||0),0));
  const nPaid=rounds.filter(x=>!x.last && roundPaid(PERIOD,cycle,x.i)).length;
  const lab=x=>`${fmtDate(x.from)} – ${fmtDate(x.to)}`;

  v.appendChild(el(`<div class="cards">
    <div class="kpi b1"><div class="lab">👥 พนักงาน${CYCLE_LABEL[cycle]}</div><div class="val">${num(emps.length)} <span class="muted" style="font-size:14px">คน</span></div></div>
    <div class="kpi b2"><div class="lab">📅 รอบในงวดนี้</div><div class="val">${num(rounds.length)} <span class="muted" style="font-size:14px">รอบ</span></div></div>
    <div class="kpi b3"><div class="lab">✅ บันทึกจ่ายแล้ว</div><div class="val">${num(nPaid)} <span class="muted" style="font-size:14px">/ ${num(rounds.length-1)} รอบ (ไม่นับรอบสุดท้าย)</span></div></div>
    <div class="kpi b5"><div class="lab">💰 ยอดโอนรอบ ${rd.i}</div><div class="val money">${money(tot('net'))}</div></div>
  </div>`));

  const bar=el(`<div class="toolbar" style="flex-wrap:wrap;gap:8px">
    ${cycles.length>1?`<div class="seg" style="display:inline-flex;background:#eaf6f1;border-radius:10px;padding:3px">${cycles.map(c=>`<button class="segbtn ${c===cycle?'on':''}" data-cy="${c}">${CYCLE_LABEL[c]}</button>`).join('')}</div>`:`<span class="chip" style="font-weight:700">${CYCLE_LABEL[cycle]}</span>`}
    ${cycle==='weekly'?`<span class="muted" style="font-size:13px;margin-left:6px">สัปดาห์สิ้นสุดวัน</span>
      <select id="rnWe" style="padding:5px 8px;border:1px solid var(--line);border-radius:7px">${WEEKDAY_TH.map((d,i)=>`<option value="${i}" ${((DB.weekEnd==null?0:+DB.weekEnd)===i)?'selected':''}>${d}</option>`).join('')}</select>`:''}
    <span class="muted" style="font-size:12.5px;margin-left:auto">ภาษีและประกันสังคม: เฉลี่ยหักทุกรอบ · รวมทั้งเดือนตรงกับ ภ.ง.ด.1 / สปส.1-10</span>
  </div>`);
  v.appendChild(bar);
  bar.querySelectorAll('[data-cy]').forEach(b=>b.onclick=()=>{ RND_CYCLE=b.dataset.cy; render(); });
  const we=bar.querySelector('#rnWe');
  if(we) we.onchange=()=>{
    if(Object.keys(roundStore(PERIOD,'weekly')).length){ toast('งวดนี้บันทึกจ่ายรายสัปดาห์ไปแล้ว — ยกเลิกการบันทึกก่อนจึงเปลี่ยนวันสิ้นสัปดาห์ได้'); we.value=(DB.weekEnd==null?0:+DB.weekEnd); return; }
    DB.weekEnd=+we.value; Object.keys(RND_IDX).forEach(k=>{ if(k.endsWith('|weekly')) delete RND_IDX[k]; }); save(); render();
  };

  v.appendChild(el(`<div class="rnTabs">${rounds.map(x=>{
    const pd=!x.last&&roundPaid(PERIOD,cycle,x.i);
    return `<button type="button" class="rnTab ${x.i===idx?'on':''}" data-ri="${x.i}">
      <b>รอบ ${x.i}${x.last?' · สุดท้าย':''}</b><span>${lab(x)}</span><i>${x.last?'ปิดยอดเดือน':pd?'✅ จ่ายแล้ว':'ยังไม่จ่าย'}</i></button>`;}).join('')}</div>`));
  v.querySelectorAll('[data-ri]').forEach(b=>b.onclick=()=>{ RND_IDX[key]=+b.dataset.ri; render(); });

  const needDays=rd.last ? rows.filter(x=>x.v.needDays).length : 0;
  const notes=[];
  if(rd.last) notes.push('รอบสุดท้าย = ยอดทั้งเดือนจากหน้า <b>คำนวณเงินได้ / เงินหัก</b> ลบส่วนที่จ่ายไปแล้ว — เงินหักอื่น ๆ (เงินกู้ กยศ. ขาดงาน ฯลฯ) หักในรอบนี้ทั้งหมด');
  if(needDays) notes.push(`⚠️ พนักงานรายวัน ${needDays} คนยังไม่มีจำนวนวันทำงานของเดือน — กรอกในช่อง <b>วันทำงาน</b> ด้านล่าง หรือกด <button class="btn sm" id="rnSyncDays" style="padding:3px 10px">📥 ใช้วันทำงานจากทุกรอบ</button>`);
  if(unpaidBefore) notes.push(`⚠️ มี ${unpaidBefore} รอบก่อนหน้าที่ยังไม่ได้บันทึกว่าจ่าย — ยอดรอบนี้คิดโดยถือว่ารอบก่อนจ่ายตามตัวเลขที่แสดง`);
  const noDays=!rd.last&&!paid ? rows.filter(x=>x.e.payType==='daily'&&!(+x.v.days>0)).length : 0;
  if(noDays) notes.push(`พนักงานรายวัน ${noDays} คนยังไม่มีเวลาเข้างานในช่วงนี้ — <b>กรอกจำนวนวันทำงานในตารางได้เลย</b> หรือใส่เวลาที่หน้า <b>เวลาเข้างาน</b>`);
  if(!paid && rows.some(x=>x.e.payType==='daily')) notes.push('วันที่กรอกในแต่ละรอบรวมกันเป็น <b>จำนวนวันทำงานของเดือน</b> ในหน้าคำนวณเงินได้/เงินหักให้เอง · วันหยุดตามประเพณีนับเป็นวันได้ค่าจ้างของรายวันให้เอง');
  if(paid) notes.push(`✅ บันทึกว่าจ่ายแล้ว${paid.payDate?' วันที่ '+esc(fmtDate(paid.payDate)):''} — ตัวเลขรอบนี้ถูกเก็บไว้ ไม่เปลี่ยนตามข้อมูลที่แก้ทีหลัง`);

  const head=rd.last
    ? `<th>รหัส</th><th>ชื่อ</th><th class="num">วันทำงาน</th><th class="num">เงินได้ส่วนที่เหลือ</th><th class="num">ภาษี</th><th class="num">ประกันสังคม</th><th class="num">หักอื่น ๆ</th><th class="num">รับสุทธิ</th>`
    : `<th>รหัส</th><th>ชื่อ</th><th class="num">วันทำงาน</th><th class="num">ค่าจ้าง</th><th class="num">OT</th><th class="num">เงินได้รวม</th><th class="num">ภาษี</th><th class="num">ประกันสังคม</th><th class="num">รับสุทธิ</th>`;
  const body=rows.map(({e,v:x})=>rd.last
    ? `<tr><td><span class="chip">${esc(e.code)}</span></td><td><strong>${esc(e.name)}</strong>${x.needDays?' <span class="chip" style="background:#fef3c7;color:#b45309">ยังไม่มีวันทำงาน</span>':''}</td>
        <td class="num">${e.payType==='daily'?`<input type="number" min="0" max="${x.maxDays}" step="0.5" class="rnIn" data-emp="${e.id}" data-k="days" data-max="${x.maxDays}" value="${x.days||0}" title="วันได้ค่าจ้างในรอบสุดท้าย (สูงสุด ${x.maxDays} วัน)">${x.manDays?rnSrc(true):''}`:'<span class="muted">-</span>'}</td>
        <td class="num">${money(x.gross)}</td><td class="num neg">${money(x.tax)}</td><td class="num neg">${money(x.sso)}</td><td class="num neg">${money(x.other)}</td><td class="num"><b>${money(x.net)}</b></td></tr>`
    : `<tr><td><span class="chip">${esc(e.code)}</span></td><td><strong>${esc(e.name)}</strong><div class="muted" style="font-size:11px">${e.payType==='daily'?'รายวัน':'รายเดือน'}</div></td>
        <td class="num">${(!paid&&e.payType==='daily')?`<input type="number" min="0" max="${x.maxDays}" step="0.5" class="rnIn" data-emp="${e.id}" data-k="days" data-max="${x.maxDays}" value="${x.days||0}" title="วันได้ค่าจ้างในรอบนี้ (มาทำงาน ${num(x.attDays||0)} วัน${x.holDays?' + วันหยุดตามประเพณี '+num(x.holDays)+' วัน':''}) · สูงสุด ${x.maxDays} วัน — แก้ได้">${rnSrc(x.manDays, x.holDays)}`:num(x.days||0)}</td><td class="num">${money(x.base)}</td><td class="num">${otRowsHtml(x.otRows)||(x.ot?money(x.ot):(paid?'-':''))}${!paid?`<div style="margin-top:3px"><button type="button" class="rnOtEdit" data-emp="${e.id}">${x.otRows&&x.otRows.length?'✏️ แก้ OT':'＋ OT'}</button></div>${x.manOT?rnSrc(true).replace('class="rnAuto"','class="rnAuto" data-k="ot"'):''}`:''}</td><td class="num pos">${money(x.gross)}</td>
        <td class="num neg">${money(x.tax)}</td><td class="num neg">${money(x.sso)}</td><td class="num"><b>${money(x.net)}</b></td></tr>`).join('');
  const foot=rd.last
    ? `<td colspan="3">รวม ${num(rows.length)} คน</td><td class="num">${money(tot('gross'))}</td><td class="num">${money(tot('tax'))}</td><td class="num">${money(tot('sso'))}</td><td class="num">${money(tot('other'))}</td><td class="num">${money(tot('net'))}</td>`
    : `<td colspan="3">รวม ${num(rows.length)} คน</td><td class="num">${money(tot('base'))}</td><td class="num">${money(tot('ot'))}</td><td class="num">${money(tot('gross'))}</td><td class="num">${money(tot('tax'))}</td><td class="num">${money(tot('sso'))}</td><td class="num">${money(tot('net'))}</td>`;
  const panel=el(`<div class="panel"><div class="phead"><h2>📆 รอบ ${rd.i}${rd.last?' (สุดท้าย)':''} — ${lab(rd)}</h2>
      <div class="sp" style="display:flex;gap:8px;flex-wrap:wrap;margin-left:auto">
        ${rd.last?'':paid?`<button class="btn ghost sm" id="rnUnpay">↩️ ยกเลิกบันทึก</button>`:`<button class="btn sm" id="rnPay">✅ บันทึกว่าจ่ายรอบนี้แล้ว</button>`}
        <button class="btn ghost sm" id="rnCsv">⬇️ CSV</button>
        <button class="btn ghost sm" id="rnSheet">🖨️ ใบสรุปยอดโอน</button>
        <button class="btn ghost sm" id="rnSlip">🧾 สลิปรอบนี้</button>
      </div></div>
    ${notes.length?`<div style="padding:10px 16px;background:#eff6ff;border-bottom:1px solid #bfdbfe;font-size:13px;line-height:1.7;color:#1e3a8a">${notes.join('<br>')}</div>`:''}
    <div class="pbody" style="padding:0"><div class="tbl-wrap"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody><tfoot><tr>${foot}</tr></tfoot></table></div></div></div>`);
  v.appendChild(panel);

  panel.querySelectorAll('.rnIn').forEach(inp=>inp.onchange=()=>{
    let val=inp.value; const mx=+inp.dataset.max;
    if(val!=='' && inp.dataset.max!=null && +val>mx){ val=String(mx); toast(`รอบนี้มี ${mx} วัน — ใส่ได้ไม่เกิน ${mx} วัน`); }
    setRoundManual(PERIOD, cycle, rd.i, inp.dataset.emp, inp.dataset.k, val);
    const e=DB.employees.find(x=>x.id===inp.dataset.emp); if(e){ syncRoundMonth(PERIOD, cycle, e); save(); }
    render(); });
  panel.querySelectorAll('.rnAuto').forEach(a=>a.onclick=ev=>{ ev.preventDefault();
    const td=a.closest('td'), inp=td.querySelector('.rnIn'), ob=td.querySelector('.rnOtEdit');
    const empId=inp?inp.dataset.emp:(ob&&ob.dataset.emp); if(!empId) return;
    if(a.dataset.k==='ot'){ setRoundManual(PERIOD, cycle, rd.i, empId, 'otH', ''); setRoundOT(PERIOD, cycle, rd.i, empId, null); }
    else setRoundManual(PERIOD, cycle, rd.i, empId, inp.dataset.k, '');
    const e=DB.employees.find(x=>x.id===empId); if(e){ syncRoundMonth(PERIOD, cycle, e); save(); }
    render(); });
  panel.querySelectorAll('.rnOtEdit').forEach(b=>b.onclick=()=>{
    const e=DB.employees.find(x=>x.id===b.dataset.emp); if(!e) return;
    const x=(rows.find(r=>r.e.id===e.id)||{}).v||{}, cur={}; (x.otRows||[]).forEach(o=>cur[o.m]=o.h);
    const steps=[...new Set([1,1.5,2,3,...Object.keys(cur).map(Number)])].sort((a,b)=>a-b);
    const lab={1:'1 เท่า (วันหยุด ในเวลางาน · รายเดือน)',1.5:'1.5 เท่า (ล่วงเวลาวันทำงาน)',2:'2 เท่า (วันหยุด ในเวลางาน · รายวัน)',3:'3 เท่า (ล่วงเวลาในวันหยุด)'};
    openModal(`⏱️ OT รอบ ${rd.i} — ${esc(e.name)}`,
      `<p class="muted" style="font-size:12.5px;margin:0 0 10px">ใส่ชั่วโมงแยกตามตัวคูณ · ค่าเริ่มต้นมาจากลงเวลา (ตัวคูณตามวันหยุด/วันในสัปดาห์ที่ตั้งไว้)</p>
       ${steps.map(m=>`<div class="field" style="display:flex;align-items:center;gap:10px;margin-bottom:6px"><label style="flex:1;margin:0">${lab[m]||m+' เท่า'}</label>
         <input type="number" min="0" step="0.5" data-otm="${m}" value="${cur[m]||''}" placeholder="ชม." style="width:90px;text-align:right"></div>`).join('')}`,
      [['ยกเลิก','ghost',closeModal],['บันทึก','',()=>{
        const by={}; document.querySelectorAll('[data-otm]').forEach(i=>{ const h=+i.value; if(h>0) by[i.dataset.otm]=h; });
        setRoundManual(PERIOD, cycle, rd.i, e.id, 'otH', ''); setRoundOT(PERIOD, cycle, rd.i, e.id, by);
        syncRoundMonth(PERIOD, cycle, e); save(); closeModal(); render(); }]]);
  });
  const sd=panel.querySelector('#rnSyncDays');
  if(sd) sd.onclick=()=>{ emps.forEach(e=>syncRoundMonth(PERIOD, cycle, e)); save(); toast('ตั้งวันทำงานของเดือนจากทุกรอบแล้ว'); render(); };
  const pb=panel.querySelector('#rnPay');
  if(pb) pb.onclick=()=>{
    if(unpaidBefore){ toast('กรุณาบันทึกจ่ายรอบก่อนหน้าให้ครบก่อน'); return; }
    const today=isoOf(new Date());
    openModal('✅ บันทึกว่าจ่ายรอบนี้แล้ว',
      `<p>รอบ ${rd.i} (${esc(lab(rd))}) · ${num(rows.length)} คน · ยอดโอนรวม <b>${money(tot('net'))}</b> บาท</p>
       <div class="field"><label>วันที่จ่ายเงิน</label><input type="date" id="rnPayDate" value="${today}"></div>
       <p class="muted" style="font-size:12.5px;line-height:1.6">ตัวเลขรอบนี้จะถูกเก็บไว้ และยอดสุทธิที่จ่ายจะไปอยู่ในช่อง <b>เบิกจ่ายล่วงหน้า</b> ของเดือน ตอนสิ้นเดือนระบบจะจ่ายเฉพาะส่วนที่เหลือ</p>`,
      [['ยกเลิก','ghost',closeModal],['บันทึก','',()=>{
        const st=roundStore(PERIOD,cycle);
        st[String(rd.i)]={at:new Date().toISOString(), payDate:($('#rnPayDate')||{}).value||today,
          emps:Object.fromEntries(rows.map(({e,v:x})=>[e.id,{days:x.days,base:x.base,ot:x.ot,otH:x.otH,otRows:x.otRows||[],gross:x.gross,ssoBase:x.ssoBase,tax:x.tax,sso:x.sso,net:x.net}]))};
        syncRoundAdvance(PERIOD,cycle); closeModal();
        const nx=rounds.find(x=>x.i>rd.i); if(nx) RND_IDX[key]=nx.i;
        toast(`บันทึกจ่ายรอบ ${rd.i} แล้ว`); render();
      }]]);
  };
  const ub=panel.querySelector('#rnUnpay');
  if(ub) ub.onclick=()=>{
    const later=rounds.filter(x=>x.i>rd.i && !x.last && roundPaid(PERIOD,cycle,x.i));
    if(later.length){ toast('ยกเลิกรอบหลังก่อน (รอบที่ใหม่กว่า)'); return; }
    if(!confirm(`ยกเลิกการบันทึกจ่ายรอบ ${rd.i}?`)) return;
    delete roundStore(PERIOD,cycle)[String(rd.i)]; syncRoundAdvance(PERIOD,cycle); toast('ยกเลิกแล้ว'); render();
  };
  panel.querySelector('#rnCsv').onclick=()=>{
    const hd=['รหัส','ชื่อ','ธนาคาร','เลขที่บัญชี','วันทำงาน','ค่าจ้าง','OT (ชม. × ตัวคูณ)','OT','เงินได้รวม','ภาษี','ประกันสังคม','หักอื่น','รับสุทธิ'];
    const lines=[hd.map(csvEsc).join(',')].concat(rows.map(({e,v:x})=>[e.code,e.name,e.bank||'',e.bankNo||'',x.days??'',x.base??'',(x.otRows||[]).map(o=>`${o.m}x ${o.h} ชม.`).join(' / '),x.ot??'',x.gross,x.tax,x.sso,x.other||0,x.net].map(csvEsc).join(',')));
    downloadFile(`pay-round_${PERIOD}_${cycle}_${rd.i}.csv`, '﻿'+lines.join('\r\n'), 'text/csv;charset=utf-8'); toast('ส่งออกแล้ว');
  };
  panel.querySelector('#rnSheet').onclick=()=>roundSheet(rows, rd, cycle, paid);
  panel.querySelector('#rnSlip').onclick=()=>roundSlips(rows, rd, cycle, paid);
}
function roundWin(title, body){
  const w=window.open('','_blank');
  if(!w){ toast('เบราว์เซอร์บล็อกป๊อปอัป กรุณาอนุญาตแล้วลองอีกครั้ง'); return; }
  w.document.write(`<!doctype html><html lang="th"><head><meta charset="utf-8"><title>${title}</title><style>
    body{font-family:"Sarabun","Segoe UI",Tahoma,sans-serif;padding:24px;color:#0b1b2b}
    h1{font-size:19px;margin:0 0 4px}.sub{color:#5b7186;font-size:13px;margin-bottom:14px}
    table{width:100%;border-collapse:collapse;font-size:13px}th,td{border:1px solid #cbd5e1;padding:6px 9px;text-align:left}
    th{background:#0e3a5c;color:#fff}td.num,th.num{text-align:right;font-variant-numeric:tabular-nums}tfoot td{font-weight:800;background:#f1f5f9}
    .sign{margin-top:34px;display:flex;gap:60px;font-size:13px}.sign div{flex:1;border-top:1px solid #94a3b8;padding-top:6px;text-align:center;color:#5b7186}
    .slip{border:1.5px solid #0e3a5c;border-radius:10px;padding:14px 16px;margin-bottom:16px;page-break-inside:avoid}
    .slip h2{font-size:15px;margin:0 0 2px}.slip .meta{font-size:12px;color:#5b7186;margin-bottom:8px}
    .slip table td{border:0;border-bottom:1px dashed #cbd5e1;padding:4px 2px}.slip .tot td{font-weight:800;border-bottom:0;font-size:14px}
    @media print{@page{size:A4;margin:12mm}}</style></head><body>${body}<script>window.onload=function(){window.print()}<\/script></body></html>`);
  w.document.close();
}
function roundSheet(rows, rd, cycle, paid){
  const use=rows.filter(x=>+x.v.net>0); if(!use.length){ toast('ไม่มียอดโอนในรอบนี้'); return; }
  const co=(DB.company&&DB.company.name)||'';
  const tot=use.reduce((s,x)=>s+(+x.v.net),0);
  roundWin(`ใบสรุปยอดโอน รอบ ${rd.i}`,`<h1>ใบสรุปยอดโอนเงินเดือน${CYCLE_LABEL[cycle]} รอบ ${rd.i}${co?' — '+esc(co):''}</h1>
    <div class="sub">งวด ${periodLabel(PERIOD)} · ช่วง ${fmtDate(rd.from)} – ${fmtDate(rd.to)}${paid&&paid.payDate?' · จ่ายวันที่ '+fmtDate(paid.payDate):''} · ${use.length} คน</div>
    <table><thead><tr><th>ลำดับ</th><th>รหัส</th><th>ชื่อ-นามสกุล</th><th>ธนาคาร</th><th>เลขที่บัญชี</th><th class="num">ยอดโอน (บาท)</th></tr></thead>
    <tbody>${use.map((x,i)=>`<tr><td>${i+1}</td><td>${esc(x.e.code)}</td><td>${esc(x.e.name)}</td><td>${esc(x.e.bank||'-')}</td><td>${esc(x.e.bankNo||'-')}</td><td class="num">${money(x.v.net)}</td></tr>`).join('')}</tbody>
    <tfoot><tr><td colspan="5">รวมทั้งสิ้น</td><td class="num">${money(tot)}</td></tr></tfoot></table>
    <div class="sign"><div>ผู้จัดทำ</div><div>ผู้ตรวจสอบ</div><div>ผู้อนุมัติ</div></div>`);
}
function roundSlips(rows, rd, cycle, paid){
  const co=(DB.company&&DB.company.name)||'';
  const row=(l,v,cls)=>`<tr${cls?` class="${cls}"`:''}><td>${l}</td><td style="text-align:right">${v}</td></tr>`;
  roundWin(`สลิปรอบ ${rd.i}`, rows.map(({e,v:x})=>`<div class="slip">
    <h2>${esc(co||'สลิปเงินเดือน')} · สลิปเงินเดือน${CYCLE_LABEL[cycle]} รอบ ${rd.i}${rd.last?' (ปิดยอดเดือน)':''}</h2>
    <div class="meta">${esc(e.code)} ${esc(e.name)}${e.dept?' · '+esc(e.dept):''} · ช่วง ${fmtDate(rd.from)} – ${fmtDate(rd.to)} · งวด ${periodLabel(PERIOD)}${paid&&paid.payDate?' · จ่าย '+fmtDate(paid.payDate):''}</div>
    <table>${rd.last
      ? row('เงินได้ส่วนที่เหลือของเดือน',money(x.gross))+row('ภาษีหัก ณ ที่จ่าย','− '+money(x.tax))+row('ประกันสังคม','− '+money(x.sso))+(x.other?row('เงินหักอื่น ๆ','− '+money(x.other)):'')+row('รับสุทธิรอบนี้',money(x.net),'tot')
      : row(e.payType==='daily'?`ค่าจ้าง (${num(x.days||0)} วัน)`:'เงินเดือน (ตามสัดส่วนวัน)',money(x.base))+((x.otRows&&x.otRows.length)?x.otRows.map(o=>row(`ค่าล่วงเวลา ${o.m} เท่า (${num(o.h)} ชม.)`,money(o.amt))).join(''):(x.ot?row(`ค่าล่วงเวลา (${num(x.otH||0)} ชม.)`,money(x.ot)):''))+row('รวมเงินได้',money(x.gross))+row('ภาษีหัก ณ ที่จ่าย (เฉลี่ย)','− '+money(x.tax))+row('ประกันสังคม','− '+money(x.sso))+row('รับสุทธิรอบนี้',money(x.net),'tot')}
    </table></div>`).join(''));
}
