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
  return out.map(([a,b],i)=>({i:i+1, from:isoOf(a), to:isoOf(b), last:i===out.length-1}));
}
function roundStore(p, cycle){
  DB.payRounds=DB.payRounds||{}; DB.payRounds[p]=DB.payRounds[p]||{}; DB.payRounds[p][cycle]=DB.payRounds[p][cycle]||{};
  return DB.payRounds[p][cycle];
}
function roundPaid(p, cycle, i){ const st=DB.payRounds&&DB.payRounds[p]&&DB.payRounds[p][cycle]; return (st&&st[String(i)])||null; }
/* ช่วงที่คนนี้ทำงานจริงภายในรอบ (ตัดวันเริ่มงาน/ลาออก) — null = ไม่ได้ทำงานในรอบนี้ */
function empWindow(e, from, to){
  let a=from, b=to;
  if(e.startDate && e.startDate>a) a=e.startDate;
  if(e.resignDate && e.resignDate<b) b=e.resignDate;
  return a<=b ? {from:a, to:b} : null;
}
/* ยอดของรอบที่ยังไม่ใช่รอบสุดท้าย (คำนวณสด) */
function roundCalcRaw(e, p, rd, prev){
  const win=empWindow(e, rd.from, rd.to);
  const zero={days:0, base:0, ot:0, otH:0, gross:0, ssoBase:0, tax:0, sso:0, net:0};
  if(!win) return zero;
  const s=attendStats(e, p, win);
  let base=0, days=0;
  if(e.payType==='daily'){ days=s.days; base=r2(salaryOnDate(e, win.to)*days); }
  else {
    const {from,to}=periodRange(p); const dim=Math.round((to-from)/864e5)+1;
    let sum=0; for(let d=new Date(win.from+'T00:00:00'); isoOf(d)<=win.to; d=addDays(d,1)){ sum+=salaryOnDate(e, isoOf(d)); days++; }
    base=r2(sum/dim);
  }
  let ot=0, otH=0; Object.keys(s.otBy||{}).forEach(m=>{ const h=+s.otBy[m]||0; otH+=h; ot+=otAmount(e,h,+m); });
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
  return {days, base, ot, otH, gross, ssoBase, tax, sso, net:r2(gross-tax-sso)};
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
      v={last:true, days:e.payType==='daily'?Math.max(0,(+r.days||0)-out.reduce((s,x)=>s+(x.days||0),0)):null,
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
    const paidNet=Object.keys(st).reduce((s,k)=>s+((st[k].emps&&st[k].emps[e.id]&&+st[k].emps[e.id].net)||0),0);
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
  if(needDays) notes.push(`⚠️ พนักงานรายวัน ${needDays} คนยังไม่มีจำนวนวันทำงานของเดือน — ไปหน้า <b>เวลาเข้างาน</b> แล้วกด <b>➡️ ส่งเข้าเงินได้ / เงินหัก</b> ก่อน`);
  if(unpaidBefore) notes.push(`⚠️ มี ${unpaidBefore} รอบก่อนหน้าที่ยังไม่ได้บันทึกว่าจ่าย — ยอดรอบนี้คิดโดยถือว่ารอบก่อนจ่ายตามตัวเลขที่แสดง`);
  if(paid) notes.push(`✅ บันทึกว่าจ่ายแล้ว${paid.payDate?' วันที่ '+esc(fmtDate(paid.payDate)):''} — ตัวเลขรอบนี้ถูกเก็บไว้ ไม่เปลี่ยนตามข้อมูลที่แก้ทีหลัง`);

  const head=rd.last
    ? `<th>รหัส</th><th>ชื่อ</th><th class="num">เงินได้ส่วนที่เหลือ</th><th class="num">ภาษี</th><th class="num">ประกันสังคม</th><th class="num">หักอื่น ๆ</th><th class="num">รับสุทธิ</th>`
    : `<th>รหัส</th><th>ชื่อ</th><th class="num">วันทำงาน</th><th class="num">ค่าจ้าง</th><th class="num">OT</th><th class="num">เงินได้รวม</th><th class="num">ภาษี</th><th class="num">ประกันสังคม</th><th class="num">รับสุทธิ</th>`;
  const body=rows.map(({e,v:x})=>rd.last
    ? `<tr><td><span class="chip">${esc(e.code)}</span></td><td><strong>${esc(e.name)}</strong>${x.needDays?' <span class="chip" style="background:#fef3c7;color:#b45309">ยังไม่มีวันทำงาน</span>':''}</td>
        <td class="num">${money(x.gross)}</td><td class="num neg">${money(x.tax)}</td><td class="num neg">${money(x.sso)}</td><td class="num neg">${money(x.other)}</td><td class="num"><b>${money(x.net)}</b></td></tr>`
    : `<tr><td><span class="chip">${esc(e.code)}</span></td><td><strong>${esc(e.name)}</strong><div class="muted" style="font-size:11px">${e.payType==='daily'?'รายวัน':'รายเดือน'}</div></td>
        <td class="num">${num(x.days||0)}</td><td class="num">${money(x.base)}</td><td class="num">${x.ot?money(x.ot):'-'}</td><td class="num pos">${money(x.gross)}</td>
        <td class="num neg">${money(x.tax)}</td><td class="num neg">${money(x.sso)}</td><td class="num"><b>${money(x.net)}</b></td></tr>`).join('');
  const foot=rd.last
    ? `<td colspan="2">รวม ${num(rows.length)} คน</td><td class="num">${money(tot('gross'))}</td><td class="num">${money(tot('tax'))}</td><td class="num">${money(tot('sso'))}</td><td class="num">${money(tot('other'))}</td><td class="num">${money(tot('net'))}</td>`
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
          emps:Object.fromEntries(rows.map(({e,v:x})=>[e.id,{days:x.days,base:x.base,ot:x.ot,otH:x.otH,gross:x.gross,ssoBase:x.ssoBase,tax:x.tax,sso:x.sso,net:x.net}]))};
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
    const hd=['รหัส','ชื่อ','ธนาคาร','เลขที่บัญชี','วันทำงาน','ค่าจ้าง','OT','เงินได้รวม','ภาษี','ประกันสังคม','หักอื่น','รับสุทธิ'];
    const lines=[hd.map(csvEsc).join(',')].concat(rows.map(({e,v:x})=>[e.code,e.name,e.bank||'',e.bankNo||'',x.days??'',x.base??'',x.ot??'',x.gross,x.tax,x.sso,x.other||0,x.net].map(csvEsc).join(',')));
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
      : row(e.payType==='daily'?`ค่าจ้าง (${num(x.days||0)} วัน)`:'เงินเดือน (ตามสัดส่วนวัน)',money(x.base))+(x.ot?row(`ค่าล่วงเวลา (${num(x.otH||0)} ชม.)`,money(x.ot)):'')+row('รวมเงินได้',money(x.gross))+row('ภาษีหัก ณ ที่จ่าย (เฉลี่ย)','− '+money(x.tax))+row('ประกันสังคม','− '+money(x.sso))+row('รับสุทธิรอบนี้',money(x.net),'tot')}
    </table></div>`).join(''));
}
