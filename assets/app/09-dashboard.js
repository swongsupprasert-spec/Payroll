/* app.html · แดชบอร์ด + กราฟ — ลำดับไฟล์มีผล (โหลดตามเลข) */
/* ============ 0. DASHBOARD ============ */
let dashMode = 'month'; // 'month' | 'year'
/* ช่วงเดือนของกราฟบนแดชบอร์ด — null = ใช้ทั้งปีเท่าที่มีข้อมูล */
let chartFrom = null, chartTo = null, chartRangeY = null;
const C = {brand:'#0e3a5c',brandL:'#a7f3d0',green:'#059669',greenL:'#6ee7b7',red:'#dc2626',warn:'#d97706',purple:'#7c3aed',slate:'#94a3b8'};

function periodHasData(p){ const pp=DB.payroll[p]; return !!(pp && Object.keys(pp).length); }
// พนักงานคนนี้ทำงานอยู่ในเดือนนี้หรือไม่ (ตามวันเริ่มงาน)
/* รายชื่อพนักงานที่อยู่ในงวด p — ใช้ให้ทุกหน้าสรุป/สลิป/ส่งออก กรองเหมือนกันหมด
   ไม่งั้นบางหน้าแสดงคนที่ลาออกไปแล้วเป็น 0.00 ปนกับคนปัจจุบัน */
function activeEmps(p){
  const [y,m]=String(p||PERIOD).split('-').map(Number);
  return DB.employees.filter(e=>activeInMonth(e,y,m));
}
function activeInMonth(emp, year, month){
  if(emp.startDate){ const [sy,sm]=emp.startDate.split('-').map(Number); if(sy>year||(sy===year&&sm>month)) return false; }
  if(emp.resignDate){ const [ry,rm]=emp.resignDate.split('-').map(Number); if(ry<year||(ry===year&&rm<month)) return false; }
  return true;
}
// คำนวณยอดรวมของเดือน (ประมาณการทั้งปี: ใช้ค่าที่กรอกจริงถ้ามี ไม่งั้นใช้เงินเดือนฐาน) เคารพวันเริ่มงาน
function monthCompute(year, m){
  const p=`${year}-${String(m).padStart(2,'0')}`;
  const emps=DB.employees.filter(e=>activeInMonth(e,year,m));
  let salary=0,earn=0,gross=0,ded=0,net=0,tax=0;
  const depts={}; const earnBy={}, dedBy={};
  let salMonthly=0, salDaily=0;
  emps.forEach(e=>{ const c=calc(e,p); const r=readRec(p,e.id);
    salary+=c.base; earn+=c.earnTotal; gross+=c.gross; ded+=c.dedTotal; net+=c.net; tax+=Number(r.ded.tax||0);
    if(e.payType==='daily') salDaily+=c.base; else salMonthly+=c.base;
    EARN_FIELDS.forEach(([k])=>{ earnBy[k]=(earnBy[k]||0)+Number(r.earn[k]||0); });
    DED_FIELDS.forEach(([k])=>{ dedBy[k]=(dedBy[k]||0)+Number(r.ded[k]||0); });
    const d=e.dept||'(ไม่ระบุ)'; const o=depts[d]=depts[d]||{dept:d,count:0,salary:0,gross:0,ded:0,net:0};
    o.count++; o.salary+=c.base; o.gross+=c.gross; o.ded+=c.dedTotal; o.net+=c.net; });
  return {p, count:emps.length, salary, earn, gross, ded, net, tax, depts, earnBy, dedBy, salMonthly, salDaily};
}
/* เดือนสุดท้ายที่ถือว่า "เกิดขึ้นจริง" แล้วในปีนั้น — ปีที่ผ่านมาคือ 12, ปีอนาคตคือ 0 */
function lastRealYear(){ return new Date().getFullYear(); }
function lastRealMonth(year){
  const now=new Date(), y=now.getFullYear();
  if(year<y) return 12;
  if(year>y) return 0;
  return now.getMonth()+1;
}
/* กราฟแสดงเฉพาะเดือนที่เกิดขึ้นจริงแล้ว และทำเงินเดือนไปแล้วเท่านั้น
   ต้องเช็คปฏิทินด้วย เพราะแค่เปิดดูหน้าคำนวณเงินเดือนของเดือนอนาคต
   ระบบก็สร้างเรคคอร์ดพร้อมหักภาษี/ปกส. อัตโนมัติไว้แล้ว
   ทำให้เช็คว่า "มีข้อมูล" อย่างเดียวไม่พอ */
function monthSeries(year, curM, range){
  const out=[];
  const a=range&&range.from?range.from:1, b=range&&range.to?range.to:12;
  for(let m=a;m<=b;m++){
    /* เดือนที่ยังไม่ได้ทำเงินเดือน ยังขึ้นช่องไว้ให้เห็นว่าเลือกถึงตรงนี้ แต่เป็นแท่งจางค่า 0 */
    if(!monthIsReal(year,m)){
      out.push({label:THAI_MONTHS_ABBR[m-1], value:0, gross:0, ded:0, salary:0, active:m===curM, has:false, entered:false, mon:m});
      continue;
    }
    const mc=monthCompute(year,m);
    out.push({label:THAI_MONTHS_ABBR[m-1], value:mc.net, gross:mc.gross, ded:mc.ded, salary:mc.salary, active:m===curM, has:mc.count>0, entered:true, mon:m});
  }
  return out;
}
/* เดือนที่ทำเงินเดือนแล้วจริงของปีนั้น คืนเป็นเลขเดือน 1-12 */
/* เดือนที่มีเงินเดือนจริง = มาถึงแล้ว และทำเงินเดือนแล้ว
   ใช้เป็นเกณฑ์เดียวกันทั้งกราฟและยอดรวม ตัวเลขจะได้ไม่ขัดกัน */
function monthIsReal(year, m){
  return m<=lastRealMonth(year) && periodHasData(`${year}-${String(m).padStart(2,'0')}`);
}
function monthsWithData(year){
  const out=[], lim=lastRealMonth(year);
  for(let m=1;m<=lim;m++){ if(monthIsReal(year,m)) out.push(m); }
  return out;
}
function yearTotals(year){
  let salary=0,earn=0,gross=0,ded=0,net=0,tax=0,entered=0;
  const earnBy={}, dedBy={};
  let salMonthly=0, salDaily=0;
  for(let m=1;m<=12;m++){ const mc=monthCompute(year,m);
    salary+=mc.salary; earn+=mc.earn; gross+=mc.gross; ded+=mc.ded; net+=mc.net; tax+=mc.tax;
    salMonthly+=mc.salMonthly||0; salDaily+=mc.salDaily||0;
    EARN_FIELDS.forEach(([k])=>{ earnBy[k]=(earnBy[k]||0)+Number((mc.earnBy||{})[k]||0); });
    DED_FIELDS.forEach(([k])=>{ dedBy[k]=(dedBy[k]||0)+Number((mc.dedBy||{})[k]||0); });
    if(periodHasData(mc.p)) entered++; }
  const dec=DB.employees.filter(e=>activeInMonth(e,year,12));
  return {count:dec.length, salary, earn, gross, ded, net, tax, entered, earnBy, dedBy,
    salMonthly, salDaily,
    nMonthly:dec.filter(e=>e.payType!=='daily').length, nDaily:dec.filter(e=>e.payType==='daily').length};
}
/* ยอดรวมของช่วงเดือน a..b นับเฉพาะเดือนที่ทำเงินเดือนแล้วจริง
   จำนวนพนักงานใช้ของเดือนสุดท้ายในช่วง เพราะเป็นภาพปัจจุบันที่สุด */
function rangeTotals(year, a, b){
  let salary=0,earn=0,gross=0,ded=0,net=0,tax=0,months=0,lastM=null;
  const earnBy={}, dedBy={};
  let salMonthly=0, salDaily=0;
  for(let m=a;m<=b;m++){
    if(!monthIsReal(year,m)) continue;
    const p=`${year}-${String(m).padStart(2,'0')}`;
    const t=periodTotals(p);
    months++; lastM=m;
    salary+=t.salary; earn+=t.earn; gross+=t.gross; ded+=t.ded; net+=t.net; tax+=t.tax;
    salMonthly+=t.salMonthly||0; salDaily+=t.salDaily||0;
    EARN_FIELDS.forEach(([k])=>{ earnBy[k]=(earnBy[k]||0)+Number(t.earnBy[k]||0); });
    DED_FIELDS.forEach(([k])=>{ dedBy[k]=(dedBy[k]||0)+Number(t.dedBy[k]||0); });
  }
  const ref = lastM===null ? null : periodTotals(`${year}-${String(lastM).padStart(2,'0')}`);
  return {months, salary, earn, gross, ded, net, tax, earnBy, dedBy, salMonthly, salDaily,
          count: ref?ref.count:0, nMonthly: ref?ref.nMonthly:0, nDaily: ref?ref.nDaily:0, lastM};
}
function deptSummaryRange(year, a, b){
  const map={};
  for(let m=a;m<=b;m++){
    if(!monthIsReal(year,m)) continue;
    const mc=monthCompute(year,m);
    Object.values(mc.depts).forEach(d=>{ const o=map[d.dept]=map[d.dept]||{dept:d.dept,count:0,salary:0,gross:0,ded:0,net:0};
      o.gross+=d.gross; o.ded+=d.ded; o.net+=d.net; o.salary+=d.salary; o.count=Math.max(o.count,d.count); });
  }
  return Object.values(map).sort((a2,b2)=>a2.dept.localeCompare(b2.dept,'th'));
}
function deptSummaryYear(year){
  const map={};
  for(let m=1;m<=12;m++){ const mc=monthCompute(year,m);
    Object.values(mc.depts).forEach(d=>{ const o=map[d.dept]=map[d.dept]||{dept:d.dept,count:0,salary:0,gross:0,ded:0,net:0};
      o.gross+=d.gross; o.ded+=d.ded; o.net+=d.net; o.salary+=d.salary; o.count=Math.max(o.count,d.count); }); }
  return Object.values(map).sort((a,b)=>a.dept.localeCompare(b.dept,'th'));
}

/* ---- SVG charts (self-contained) ---- */
function barChart(items,{color=C.brand,clickable=false,height=300}={}){
  const W=960,H=300,padT=22,padB=30,padL=14,padR=14;
  const innerH=H-padT-padB, innerW=W-padL-padR, n=items.length||1, slot=innerW/n;
  const max=Math.max(1,...items.map(i=>i.value));
  const cursor = clickable ? 'cursor:pointer' : '';
  let g='';
  for(let i=1;i<=4;i++){ const y=padT+innerH-(innerH*i/4); g+=`<line x1="${padL}" y1="${y}" x2="${W-padR}" y2="${y}" stroke="#eef1f5" stroke-width="1"/>`; }
  items.forEach((it,i)=>{
    const hasVal = it.has!==false && it.value>0;
    const bh = hasVal ? (it.value/max)*innerH : 4;       // แท่งจางสำหรับเดือนที่ยังไม่มีข้อมูล
    const bw=slot*0.6, x=padL+i*slot+(slot-bw)/2, y=padT+innerH-bh;
    const fill = it.active ? C.brand : (hasVal ? color : '#e2e8f0');
    const cx=padL+i*slot+slot/2;
    // พื้นที่คลิกทั้งช่อง (โปร่งใส) เพื่อกดง่าย
    if(clickable) g+=`<rect x="${padL+i*slot}" y="${padT}" width="${slot}" height="${innerH}" fill="transparent" data-i="${i}" style="cursor:pointer"><title>${it.label}: ${money(it.value)}</title></rect>`;
    g+=`<rect x="${x}" y="${y}" width="${bw}" height="${Math.max(0,bh)}" rx="4" fill="${fill}" data-i="${i}" style="${cursor}"><title>${it.label}: ${money(it.value)}</title></rect>`;
    if(hasVal) g+=`<text x="${x+bw/2}" y="${y-6}" font-size="13" text-anchor="middle" fill="#374151">${shortMoney(it.value)}</text>`;
    g+=`<text x="${cx}" y="${H-10}" font-size="13" text-anchor="middle" fill="${it.active?'#0e3a5c':'#6b7280'}" font-weight="${it.active?'700':'400'}">${it.label}</text>`;
  });
  g+=`<line x1="${padL}" y1="${padT+innerH}" x2="${W-padR}" y2="${padT+innerH}" stroke="#cbd5e1"/>`;
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" style="width:100%;height:${height}px;overflow:visible">${g}</svg>`;
}
/* กราฟเส้น+พื้นที่ไล่สี — แนวโน้มเงินเดือนสุทธิรายเดือน (คลิกคอลัมน์เพื่อเปิดเดือนนั้น) */
function areaChart(items,{height=300}={}){
  const W=960,H=300,padT=34,padB=32,padL=16,padR=16;
  const innerH=H-padT-padB, innerW=W-padL-padR, n=items.length||1, slot=innerW/n;
  const max=Math.max(1,...items.map(i=>i.value))*1.08;
  const X=i=>padL+slot*i+slot/2, Y=v=>padT+innerH-(v/max)*innerH;
  const pts=items.map((it,i)=>{ const ok=it.has!==false&&it.value>0; return {x:X(i),y:Y(ok?it.value:0),it,i,ok}; });
  const real=pts.filter(p=>p.ok);
  let g='<defs><linearGradient id="vzArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--s1)" stop-opacity=".32"/><stop offset="1" stop-color="var(--s1)" stop-opacity="0"/></linearGradient></defs>';
  for(let k=1;k<=4;k++){ const y=padT+innerH-(innerH*k/4); g+=`<line x1="${padL}" y1="${y}" x2="${W-padR}" y2="${y}" stroke="var(--viz-grid)" stroke-width="1"/>`; }
  /* เส้นโค้งนุ่ม เฉพาะเดือนที่มีข้อมูล */
  const curve=a=>a.map((p,i)=>{ if(!i) return `M${p.x} ${p.y}`;
    const p0=a[i-2]||a[i-1], p1=a[i-1], p3=a[i+1]||p;
    const c1x=p1.x+(p.x-p0.x)/6, c1y=p1.y+(p.y-p0.y)/6, c2x=p.x-(p3.x-p1.x)/6, c2y=p.y-(p3.y-p1.y)/6;
    return `C${c1x} ${c1y} ${c2x} ${c2y} ${p.x} ${p.y}`; }).join(' ');
  const base=padT+innerH;
  if(real.length>1){ const d=curve(real);
    g+=`<path d="${d} L${real[real.length-1].x} ${base} L${real[0].x} ${base} Z" fill="url(#vzArea)"/>`;
    g+=`<path d="${d}" fill="none" stroke="var(--s1)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>`; }
  g+=`<line x1="${padL}" y1="${base}" x2="${W-padR}" y2="${base}" stroke="var(--viz-axis)"/>`;
  const peak=real.reduce((m,p)=>!m||p.it.value>m.it.value?p:m,null);
  pts.forEach(p=>{ const it=p.it;
    g+=`<g class="vzc"><rect x="${padL+slot*p.i}" y="${padT-20}" width="${slot}" height="${innerH+20}" rx="8" fill="transparent" data-i="${p.i}" style="cursor:pointer"><title>${it.label}: ${p.ok?money(it.value):'ยังไม่ได้ทำเงินเดือน'}</title></rect>`;
    if(p.ok){ const big=it.active;
      g+=`<circle cx="${p.x}" cy="${p.y}" r="${big?7:4.5}" fill="${big?'var(--s1)':'var(--viz-surf)'}" stroke="var(--s1)" stroke-width="2.5" pointer-events="none"/>`;
      if(big||p===peak) g+=`<text x="${p.x}" y="${p.y-14}" font-size="13" font-weight="700" text-anchor="middle" fill="var(--viz-ink)" pointer-events="none">${shortMoney(it.value)}</text>`;
    } else g+=`<circle cx="${p.x}" cy="${base}" r="3" fill="var(--viz-axis)" pointer-events="none"/>`;
    g+=`<text x="${p.x}" y="${H-10}" font-size="13" text-anchor="middle" fill="${it.active?'var(--s1)':'var(--viz-mute)'}" font-weight="${it.active?'700':'400'}" pointer-events="none">${it.label}</text></g>`;
  });
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" style="width:100%;height:${height}px;overflow:visible">${g}</svg>`;
}
/* แท่งแนวนอน — เปรียบเทียบเงินสุทธิแต่ละแผนก (เรียงจากมากไปน้อย) */
function hbarChart(items){
  const list=items.filter(i=>i.value>0).sort((a,b)=>b.value-a.value);
  if(!list.length) return '<div class="empty">ยังไม่มีข้อมูล</div>';
  const max=Math.max(...list.map(i=>i.value)), total=list.reduce((s,i)=>s+i.value,0);
  return `<div style="display:flex;flex-direction:column;gap:13px">${list.map(i=>{ const w=Math.max(2,i.value/max*100);
    return `<div title="${esc(i.label)}: ${money(i.value)}">
      <div style="display:flex;justify-content:space-between;gap:10px;font-size:13px;margin-bottom:5px">
        <span style="color:var(--ink);font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(i.label)}</span>
        <span style="color:var(--ink);font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap">${money(i.value)} <span style="color:var(--muted);font-weight:400;font-size:12px">${Math.round(i.value/total*100)}%</span></span></div>
      <div style="height:12px;border-radius:6px;background:var(--viz-grid);overflow:hidden">
        <div style="height:100%;width:${w}%;border-radius:6px;background:var(--s3)"></div></div>
    </div>`; }).join('')}</div>`;
}
/* ================= ภาพรวม HR บนแดชบอร์ด: ①กำลังคน ④เวลา&การลา ⑤โครงสร้างพนักงาน ⑥ต้นทุนบุคลากร ================= */
const VZ=['var(--s1)','var(--s2)','var(--s3)','var(--s4)','var(--s5)'];
/* แบ่งเป็นกลุ่ม: 4 กลุ่มใหญ่สุดใช้สีตามลำดับ ที่เหลือรวมเป็น "อื่น ๆ" (ไม่วนสีซ้ำ) */
function vzGroups(map){
  const arr=Object.entries(map).filter(([,v])=>v>0).sort((a,b)=>b[1]-a[1]);
  const top=arr.length>5?arr.slice(0,4):arr, rest=arr.length>5?arr.slice(4).reduce((s,x)=>s+x[1],0):0;
  const out=top.map(([k,v],i)=>({label:k,value:v,color:VZ[i]}));
  if(rest>0) out.push({label:'อื่น ๆ',value:rest,color:'var(--viz-mute)'});
  return out;
}
function vzLegend(segs,fmt){
  const tot=segs.reduce((s,x)=>s+x.value,0)||1;
  return `<div class="vz-legend">${segs.map(s=>`<div class="row"><span class="sw" style="background:${s.color}"></span><span class="lab">${esc(s.label)}</span><span class="val">${fmt?fmt(s.value):num(s.value)}</span><span class="pct">${Math.round(s.value/tot*100)}%</span></div>`).join('')}</div>`;
}
function vzStat(ic,lab,val,note){
  return `<div class="hr-stat"><span class="ic">${ic}</span><span class="lab">${lab}</span><span class="val">${val}</span>${note?`<span class="note">${note}</span>`:''}</div>`;
}
/* แท่งแนวตั้งเล็ก (ช่วงอายุ / อายุงาน) — สีเดียว เพราะเป็นขนาด ไม่ใช่ประเภท */
function vzCols(items,color){
  const max=Math.max(1,...items.map(i=>i.value)), tot=items.reduce((s,i)=>s+i.value,0)||1;
  return `<div class="vz-cols">${items.map(i=>`<div class="c" title="${esc(i.label)}: ${num(i.value)} คน">
    <div class="v">${num(i.value)}</div><div class="bar"><i style="height:${Math.max(i.value?6:0,i.value/max*100)}%;background:${color}"></i></div>
    <div class="l">${esc(i.label)}</div><div class="p">${Math.round(i.value/tot*100)}%</div></div>`).join('')}</div>`;
}
function hrOverview(curY, cf, ct){
  const today=new Date(); today.setHours(0,0,0,0);
  const dOf=s=>{ const m=/^(\d{4})-(\d{2})-(\d{2})/.exec(s||''); return m?new Date(+m[1],+m[2]-1,+m[3]):null; };
  const inRange=s=>{ const d=dOf(s); return d && d.getFullYear()===curY && d.getMonth()+1>=cf && d.getMonth()+1<=ct; };
  const act=empActiveList();
  const scope=cf===1&&ct===12?`ปี ${curY+543}`:cf===ct?periodLabel(`${curY}-${String(cf).padStart(2,'0')}`):`${THAI_MONTHS_ABBR[cf-1]}–${THAI_MONTHS_ABBR[ct-1]} ${curY+543}`;

  /* ① กำลังคน */
  const hired=DB.employees.filter(e=>inRange(e.startDate)).length;
  const left=DB.employees.filter(e=>inRange(e.resignDate)).length;
  const daily=act.filter(e=>e.payType==='daily').length;
  const byDept={}; act.forEach(e=>{ const d=(e.dept||'').trim()||'(ไม่ระบุ)'; byDept[d]=(byDept[d]||0)+1; });
  const deptSegs=vzGroups(byDept);
  const p1=`<div class="panel hr-card" style="margin:0"><div class="phead"><h2>กำลังคน</h2><span class="muted" style="font-size:12px;margin-left:auto">${scope}</span></div><div class="pbody">
    ${vzStat('👥','พนักงานปัจจุบัน',`${num(act.length)} คน`)}
    ${vzStat('🆕','เข้าใหม่',`${num(hired)} คน`)}
    ${vzStat('🚪','ลาออก',`${num(left)} คน`, act.length?`อัตราลาออก ${(left/Math.max(1,act.length+left)*100).toFixed(1)}%`:'')}
    ${vzStat('🗓️','พนักงานรายวัน',`${num(daily)} คน`)}
    <div class="hr-sub">พนักงานแยกตามแผนก</div>
    <div class="hr-split">${donutChart(deptSegs).replace('>รวมรายได้<','>พนักงาน<').replace(/>[^<]*<\/text><\/svg>$/,`>${num(act.length)} คน</text></svg>`)}${vzLegend(deptSegs,v=>num(v)+' คน')}</div>
  </div></div>`;

  /* ④ เวลาเข้างาน & การลา — งวดที่เลือก + การลาในช่วง */
  let wDays=0, late=0, otH=0, withData=0;
  act.forEach(e=>{ const s=attendStats(e,PERIOD); wDays+=s.days; late+=s.late; otH+=s.otHours; if(s.days) withData++; });
  const lv=leaveList().filter(l=>l.status!=='rejected'&&l.status!=='cancelled'&&inRange(l.from));
  const lvBy={}; LEAVE_TYPES.forEach(([k])=>lvBy[k]=0);
  lv.forEach(l=>{ lvBy[l.type]=(lvBy[l.type]||0)+(+l.days||0); });
  const lvSegs=LEAVE_TYPES.map(([k,lab,col])=>({label:lab,value:Math.round((lvBy[k]||0)*10)/10,color:col})).filter(s=>s.value>0);
  const absent=lvBy.unpaid||0, lvTot=lvSegs.reduce((s,x)=>s+x.value,0);
  const lvMonth=[]; for(let m=cf;m<=ct;m++){ const v=lv.filter(l=>+String(l.from).slice(5,7)===m).reduce((s,l)=>s+(+l.days||0),0);
    lvMonth.push({label:THAI_MONTHS_ABBR[m-1],value:v,has:m<=lastRealMonth(curY),active:false}); }
  const p4=`<div class="panel hr-card" style="margin:0"><div class="phead"><h2>เวลาเข้างาน &amp; การลา</h2><span class="muted" style="font-size:12px;margin-left:auto">เวลา: งวด ${esc(periodLabel(PERIOD))}</span></div><div class="pbody">
    ${withData?vzStat('✅','วันทำงานที่บันทึก',`${num(wDays)} วัน`,`${num(withData)}/${num(act.length)} คนมีข้อมูลเวลา`):vzStat('✅','วันทำงานที่บันทึก','-','ยังไม่มีข้อมูลเวลาในงวดนี้')}
    ${vzStat('⏰','มาสาย',`${num(late)} ครั้ง`, wDays?`อัตรามาสาย ${(late/wDays*100).toFixed(1)}%`:'')}
    ${vzStat('⚡','ชั่วโมง OT',`${num(otH)} ชม.`)}
    ${vzStat('🚫','ขาดงาน / ลาไม่รับค่าจ้าง',`${num(absent)} วัน`,scope)}
    <div class="hr-sub">การลาแยกตามประเภท — ${scope}</div>
    ${lvSegs.length?`<div class="hr-split">${donutChart(lvSegs).replace('>รวมรายได้<','>วันลา<').replace(/>[^<]*<\/text><\/svg>$/,`>${num(lvTot)} วัน</text></svg>`)}${vzLegend(lvSegs,v=>num(v)+' วัน')}</div>`:'<div class="empty" style="padding:14px">ยังไม่มีการลาในช่วงนี้</div>'}
    ${lvTot?`<div class="hr-sub">แนวโน้มวันลารายเดือน</div>${areaChart(lvMonth,{height:150}).replace(/id="vzArea"/,'id="vzArea2"').replace(/url\(#vzArea\)/,'url(#vzArea2)')}`:''}
  </div></div>`;

  /* ⑤ โครงสร้างพนักงาน */
  const years=s=>{ const d=dOf(s); return d?(today-d)/(365.25*864e5):null; };
  const ten=act.map(e=>years(e.startDate)).filter(x=>x!=null&&x>=0);
  const avgTen=ten.length?ten.reduce((a,b)=>a+b,0)/ten.length:null;
  const tenB=[['< 1 ปี',0,1],['1–3 ปี',1,3],['3–5 ปี',3,5],['5 ปีขึ้นไป',5,99]].map(([l,a,b])=>({label:l,value:ten.filter(x=>x>=a&&x<b).length}));
  const ages=act.map(e=>years(e.birthDate)).filter(x=>x!=null&&x>10);
  const ageB=[['< 25',0,25],['25–34',25,35],['35–44',35,45],['45–54',45,55],['55+',55,200]].map(([l,a,b])=>({label:l,value:ages.filter(x=>x>=a&&x<b).length}));
  const male=act.filter(e=>e.gender==='M').length, female=act.filter(e=>e.gender==='F').length;
  const roles={exec:0,head:0,staff:0}; act.forEach(e=>{ roles[empRole(e)]=(roles[empRole(e)]||0)+1; });
  const roleSegs=[{label:'พนักงาน',value:roles.staff,color:'var(--s1)'},{label:'หัวหน้า/ผู้จัดการ',value:roles.head,color:'var(--s2)'},{label:'ผู้บริหาร',value:roles.exec,color:'var(--s3)'}].filter(s=>s.value>0);
  const pct=n=>act.length?Math.round(n/act.length*100)+'%':'-';
  const p5=`<div class="panel hr-card" style="margin:0"><div class="phead"><h2>โครงสร้างพนักงาน</h2></div><div class="pbody">
    ${vzStat('⏳','อายุงานเฉลี่ย',avgTen==null?'-':`${avgTen.toFixed(1)} ปี`)}
    ${vzStat('📅','รายเดือน / รายวัน',`${pct(act.length-daily)} / ${pct(daily)}`)}
    ${(male||female)?vzStat('🚻','ชาย / หญิง',`${pct(male)} / ${pct(female)}`,act.length-male-female?`ไม่ระบุ ${num(act.length-male-female)} คน`:''):vzStat('🚻','ชาย / หญิง','-','ยังไม่ได้ระบุเพศในข้อมูลพนักงาน')}
    <div class="hr-sub">ช่วงอายุ</div>
    ${ages.length?vzCols(ageB,'var(--s1)')+(ages.length<act.length?`<div class="muted" style="font-size:12px;margin-top:4px">คิดจาก ${num(ages.length)}/${num(act.length)} คนที่กรอกวันเกิด</div>`:''):'<div class="empty" style="padding:12px;font-size:13px">กรอก “วันเกิด” ในข้อมูลพนักงาน เพื่อดูช่วงอายุ</div>'}
    <div class="hr-sub">อายุงาน</div>
    ${ten.length?vzCols(tenB,'var(--s3)'):'<div class="empty" style="padding:12px;font-size:13px">กรอกวันเริ่มงานในข้อมูลพนักงาน</div>'}
    <div class="hr-sub">ระดับตำแหน่ง</div>
    <div class="hr-split">${donutChart(roleSegs).replace('>รวมรายได้<','>ทั้งหมด<').replace(/>[^<]*<\/text><\/svg>$/,`>${num(act.length)} คน</text></svg>`)}${vzLegend(roleSegs,v=>num(v)+' คน')}</div>
  </div></div>`;

  /* ⑥ ต้นทุนบุคลากร — รวมเดือนที่ทำเงินเดือนแล้วในช่วง */
  let sal=0, ot=0, bonus=0, otherE=0, ssoEr=0, pvdEr=0, wfEr=0, heads=0, months=0; const dCost={};
  for(let m=cf;m<=Math.min(ct,lastRealMonth(curY));m++){ if(!monthIsReal(curY,m)) continue;
    const mc=monthCompute(curY,m); if(!mc.count) continue; months++; heads+=mc.count;
    const e=mc.earnBy||{}; sal+=mc.salary; ot+=+e.ot||0; bonus+=+e.bonus||0;
    otherE+=Math.max(0,mc.gross-mc.salary-(+e.ot||0)-(+e.bonus||0));
    ssoEr+=+(mc.dedBy&&mc.dedBy.sso)||0;                         // นายจ้างสมทบเท่าลูกจ้าง
    wfEr+=+(mc.dedBy&&mc.dedBy.wf)||0;                            // กองทุนสงเคราะห์: นายจ้างสมทบเท่าลูกจ้างตามกฎหมาย
    /* กสล. ส่วนบริษัท: ตามอัตราที่ตั้งไว้ของแต่ละคน หรือเท่ากับที่พนักงานสะสม */
    const pp=`${curY}-${String(m).padStart(2,'0')}`;
    DB.employees.filter(e=>activeInMonth(e,curY,m)&&(+e.pvdRate>0||+e.pvdEr>0)).forEach(e=>{
      const rec=readRec(pp,e.id), own=+(rec.ded&&rec.ded.pvd)||0;
      const er=(e.pvdEr==null||e.pvdEr==='')?own:Math.round((+calc(e,pp).base||0)*(+e.pvdEr)/100);
      pvdEr+=er; });
    Object.values(mc.depts).forEach(d=>{ dCost[d.dept]=(dCost[d.dept]||0)+d.gross; }); }
  const cost=sal+ot+bonus+otherE+ssoEr+pvdEr+wfEr;
  const costSegs=[{label:'เงินเดือน/ค่าจ้าง',value:sal,color:'var(--s1)'},{label:'ค่าล่วงเวลา (OT)',value:ot,color:'var(--s2)'},{label:'โบนัส',value:bonus,color:'var(--s3)'},
    {label:'เงินเพิ่มอื่น ๆ',value:otherE,color:'var(--s4)'},{label:'ประกันสังคมส่วนนายจ้าง',value:ssoEr,color:'var(--s5)'},
    {label:'กองทุนส่วนบริษัท (กสล. / กองทุนสงเคราะห์)',value:pvdEr+wfEr,color:'var(--viz-mute)'}].filter(s=>s.value>0);
  const p6=`<div class="panel hr-card" style="margin:0"><div class="phead"><h2>ต้นทุนบุคลากร</h2><span class="muted" style="font-size:12px;margin-left:auto">${scope}</span></div><div class="pbody">
    ${months?`<div class="hr-hero"><div class="lab">ต้นทุนรวม (${num(months)} เดือนที่ทำเงินเดือนแล้ว)</div><div class="big">${money(cost)} <span>บาท</span></div>
      <div class="muted" style="font-size:12.5px">เฉลี่ย ${money(cost/months)} บาท/เดือน · ${money(cost/Math.max(1,heads))} บาท/คน/เดือน</div></div>
    ${vzLegend(costSegs,money)}
    <div class="hr-sub">ต้นทุนแยกตามแผนก (เงินได้รวม)</div>
    ${hbarChart(Object.entries(dCost).map(([k,v])=>({label:k,value:v})))}`
    :'<div class="empty">ยังไม่ได้ทำเงินเดือนในช่วงที่เลือก</div>'}
  </div></div>`;

  /* 2 คอลัมน์แยกกัน การ์ดเรียงต่อกันในแต่ละคอลัมน์ ไม่มีช่องว่างตามความสูงแถว */
  return `<div class="hr-grid"><div class="hr-col">${p1}${p5}</div><div class="hr-col">${p4}${p6}</div></div>`;
}
function donutChart(segments){
  const segs=segments.filter(s=>s.value>0);
  const total=segs.reduce((s,x)=>s+x.value,0);
  const cx=95,cy=95,R=80,r=52;
  let paths='';
  if(total<=0){ paths=`<circle cx="${cx}" cy="${cy}" r="${(R+r)/2}" fill="none" stroke="#e5e7eb" stroke-width="${R-r}"/>`; }
  else if(segs.length===1){ paths=`<circle cx="${cx}" cy="${cy}" r="${(R+r)/2}" fill="none" stroke="${segs[0].color}" stroke-width="${R-r}"/>`; }
  else { let a=-Math.PI/2;
    segs.forEach(s=>{ const frac=s.value/total, a2=a+frac*2*Math.PI, large=frac>0.5?1:0;
      const x1=cx+R*Math.cos(a),y1=cy+R*Math.sin(a),x2=cx+R*Math.cos(a2),y2=cy+R*Math.sin(a2);
      const xi1=cx+r*Math.cos(a2),yi1=cy+r*Math.sin(a2),xi2=cx+r*Math.cos(a),yi2=cy+r*Math.sin(a);
      paths+=`<path d="M${x1} ${y1} A${R} ${R} 0 ${large} 1 ${x2} ${y2} L${xi1} ${yi1} A${r} ${r} 0 ${large} 0 ${xi2} ${yi2} Z" fill="${s.color}" stroke="var(--viz-surf)" stroke-width="2" stroke-linejoin="round"><title>${s.label}: ${money(s.value)}</title></path>`;
      a=a2; });
  }
  return `<svg viewBox="0 0 190 190" style="width:190px;height:190px">${paths}
    <text x="${cx}" y="${cy-4}" font-size="12.5" text-anchor="middle" fill="var(--viz-mute)">รวมรายได้</text>
    <text x="${cx}" y="${cy+16}" font-size="18" text-anchor="middle" font-weight="800" fill="var(--viz-ink)">${shortMoney(total)}</text></svg>`;
}
function legend(items){
  return `<div style="display:flex;flex-direction:column;gap:10px">${items.filter(i=>i.value>0||i.always).map(i=>`
    <div style="display:flex;align-items:center;gap:8px">
      <span style="width:12px;height:12px;border-radius:3px;background:${i.color};flex-shrink:0"></span>
      <span style="flex:1">${i.label}</span>
      <strong class="money">${money(i.value)}</strong>
    </div>`).join('')}</div>`;
}

/* รายละเอียดใต้ตัวเลขรวมในแดชบอร์ด — โชว์เฉพาะรายการที่ไม่เป็นศูนย์
   เรียงจากมากไปน้อย เกิน 4 รายการยุบเป็น "อื่น ๆ" รวมกัน กันการ์ดยาวเกิน */
function kpiBreak(by, fields, total){
  const rows=fields.map(([k,lab])=>({lab, v:Number((by||{})[k]||0)}))
    .filter(x=>Math.abs(x.v)>=0.005)
    .sort((a,b)=>b.v-a.v);
  if(!rows.length) return '<div class="kpi-brk muted">ยังไม่มีรายการ</div>';
  const top=rows.slice(0,4);
  const rest=rows.slice(4);
  if(rest.length) top.push({lab:'อื่น ๆ ('+rest.length+' รายการ)', v:rest.reduce((s,x)=>s+x.v,0)});
  const pct=v=>total>0?' <span class="kpi-pct">'+Math.round(v/total*100)+'%</span>':'';
  return '<div class="kpi-brk">'+top.map(x=>
    '<div class="kpi-brk-row"><span class="kpi-brk-lab">'+esc(x.lab)+'</span>'+
    '<span class="kpi-brk-val">'+money(x.v)+pct(x.v)+'</span></div>').join('')+'</div>';
}
function vDashboard(v){
  const [curY,curM]=PERIOD.split('-').map(Number);
  const isYear = dashMode==='year';
  /* ── ช่วงเดือน: ต้องรู้ก่อนวาดการ์ด KPI เพราะทั้งหน้าอิงช่วงนี้ ── */
  const avail=monthsWithData(curY);
  if(chartRangeY!==curY){ chartRangeY=curY; chartFrom=null; chartTo=null; }
  /* ค่าเริ่มต้นคือช่วงที่มีข้อมูลจริง แต่ผู้ใช้เลือกได้ครบทั้ง 12 เดือน */
  const lo=avail.length?avail[0]:1, hi=avail.length?avail[avail.length-1]:12;
  let cf=chartFrom==null?lo:Math.min(Math.max(chartFrom,1),12);
  let ct=chartTo==null?hi:Math.min(Math.max(chartTo,1),12);
  if(cf>ct){ const s=cf; cf=ct; ct=s; }
  const rangeAll = cf===lo && ct===hi;
  const t = isYear ? yearTotals(curY) : rangeTotals(curY, cf, ct);
  const rangeLabel = cf===ct ? periodLabel(`${curY}-${String(cf).padStart(2,'0')}`)
    : `${THAI_MONTHS_ABBR[cf-1]} – ${THAI_MONTHS_ABBR[ct-1]} ${curY+543}`;
  const scopeLabel = isYear ? `ปี ${curY+543}` : rangeLabel;
  /* เดือนที่ยังไม่ได้ทำเงินเดือนใส่จุดนำหน้าไว้ จะได้รู้ก่อนเลือกว่ายังไม่มีข้อมูล */
  const opts=(sel)=>Array.from({length:12},(_,i)=>i+1).map(m=>
    `<option value="${m}" ${m===sel?'selected':''}>${avail.includes(m)?'':'· '}${THAI_MONTHS_ABBR[m-1]}</option>`).join('');

  // mode toggle
  const tb=el(`<div class="toolbar" style="margin-bottom:18px">
    <div class="seg" style="display:inline-flex;background:#eaf6f1;border-radius:10px;padding:3px">
      <button class="segbtn ${!isYear?'on':''}" data-m="month">📅 รายเดือน</button>
      <button class="segbtn ${isYear?'on':''}" data-m="year">📆 รายปี</button>
    </div>
    ${(!isYear&&avail.length)?`<span class="muted" style="margin-left:10px;font-size:13px">ช่วงเดือน</span>
      <select id="chFrom" style="padding:5px 8px;border:1px solid var(--line);border-radius:7px">${opts(cf)}</select>
      <span class="muted" style="font-size:13px">ถึง</span>
      <select id="chTo" style="padding:5px 8px;border:1px solid var(--line);border-radius:7px">${opts(ct)}</select>
      ${rangeAll?'':`<button class="btn ghost sm" id="chAll">↺ ทั้งปี</button>`}`:''}
    <span class="muted" style="margin-left:6px">แสดงข้อมูล: <strong>${scopeLabel}</strong>${isYear?` · ประมาณการครบ 12 เดือน (กรอกจริง ${t.entered} เดือน)`:t.months>1?` · รวม ${num(t.months)} เดือนที่ทำแล้ว${(ct-cf+1)>t.months?` (เลือกไว้ ${num(ct-cf+1)} เดือน)`:''}`:''}</span>
  </div>`);
  v.appendChild(tb);
  tb.querySelectorAll('.segbtn').forEach(b=>b.onclick=()=>{ dashMode=b.dataset.m; render(); });
  { const f=tb.querySelector('#chFrom'), t2=tb.querySelector('#chTo'), a=tb.querySelector('#chAll');
    if(f) f.onchange=()=>{ chartFrom=+f.value; if(chartTo!=null&&chartTo<chartFrom) chartTo=chartFrom; render(); };
    if(t2) t2.onchange=()=>{ chartTo=+t2.value; if(chartFrom!=null&&chartFrom>chartTo) chartFrom=chartTo; render(); };
    if(a) a.onclick=()=>{ chartFrom=null; chartTo=null; render(); }; }

  // KPI cards — นับเฉพาะพนักงานที่ทำงานอยู่ในงวดนี้ (ไม่รวมคนลาออก)
  const refM = isYear ? 12 : (t.lastM || curM);
  const actives=DB.employees.filter(e=>activeInMonth(e,curY,refM));
  const mCount=actives.filter(e=>e.gender==='M').length, fCount=actives.filter(e=>e.gender==='F').length, uCount=actives.filter(e=>!e.gender).length;
  v.appendChild(el(`<div class="cards">
    <div class="kpi b1"><div class="lab">👥 ${tr('kpi_count')}</div><div class="val">${num(actives.length)} <span class="muted" style="font-size:14px">${tr('unit_person')}</span></div>
      <div style="margin-top:6px;display:flex;gap:12px;font-size:12px">
        <span style="color:#0e3a5c">♂ ${tr('male')} ${num(mCount)}</span>
        <span style="color:#db2777">♀ ${tr('female')} ${num(fCount)}</span>
        ${uCount?`<span class="muted">– ${tr('unspec')} ${num(uCount)}</span>`:''}
      </div></div>
    <div class="kpi b2"><div class="lab">💼 ${tr('kpi_salary')}</div><div class="val money">${money(t.salary)}</div>
      ${kpiBreak({monthly:t.salMonthly, daily:t.salDaily},
        [['monthly','รายเดือน ('+num(t.nMonthly||0)+' คน)'],['daily','รายวัน ('+num(t.nDaily||0)+' คน)']], t.salary)}</div>
    <div class="kpi b3"><div class="lab">➕ ${tr('kpi_income')}</div><div class="val money">${money(t.gross)}</div>
      ${kpiBreak(Object.assign({_base:t.salary}, t.earnBy),
        [['_base','ค่าจ้างฐาน']].concat(EARN_FIELDS.map(f=>[f[0],FL(f)])), t.gross)}</div>
    <div class="kpi b4"><div class="lab">➖ ${tr('kpi_deduct')}</div><div class="val money">${money(t.ded)}</div>
      ${kpiBreak(t.dedBy, DED_FIELDS.map(f=>[f[0],FL(f)]), t.ded)}</div>
    <div class="kpi b5"><div class="lab">💰 ${tr('kpi_net')}</div><div class="val money">${money(t.net)}</div>
      <div class="kpi-brk">
        <div class="kpi-brk-row"><span class="kpi-brk-lab">เงินได้รวม</span><span class="kpi-brk-val">${money(t.gross)}</span></div>
        <div class="kpi-brk-row"><span class="kpi-brk-lab">หัก เงินหักรวม</span><span class="kpi-brk-val" style="color:var(--bad)">− ${money(t.ded)}</span></div>
        <div class="kpi-brk-row" style="border-top:1px solid var(--line);padding-top:3px;margin-top:1px">
          <span class="kpi-brk-lab">ยอดโอนจริง</span><span class="kpi-brk-val">${money(t.net)}</span></div>
      </div></div>
  </div>`));

  if(DB.employees.length===0){
    v.appendChild(el(`<div class="panel"><div class="pbody empty">${tr('no_emp_hint')}</div></div>`));
    return;
  }

  // Bar chart: net pay per month across the year
  const series=monthSeries(curY, isYear?-1:curM, {from:cf,to:ct});
  /* ยอดรวมของช่วงที่เลือก คิดจากแท่งที่แสดงอยู่จริง */
  
  const barPanel=el(`<div class="panel"><div class="phead"><h2>💰 เงินเดือนสุทธิรายเดือน — ปี ${curY+543}</h2>
    <div class="sp"><span class="muted" style="font-size:12px">💡 คลิกที่แท่งเดือนเพื่อดูรายละเอียดเดือนนั้น</span></div></div>
    <div class="pbody">${series.length?areaChart(series,{height:300}):`<div class="empty">${avail.length?'ไม่มีเดือนที่ทำเงินเดือนแล้วในช่วงที่เลือก':lastRealMonth(curY)?`ยังไม่ได้ทำเงินเดือนของปี ${curY+543} เลยสักเดือน — ไปที่หน้า “คำนวณเงินเดือน” เพื่อเริ่มทำงวดแรก`:`ปี ${curY+543} ยังมาไม่ถึง`}</div>`}</div></div>`);
  v.appendChild(barPanel);
  barPanel.querySelectorAll('rect[data-i]').forEach(rc=>rc.onclick=()=>{
    const m=(series[+rc.dataset.i]||{}).mon; if(!m) return;
    PERIOD=`${curY}-${String(m).padStart(2,'0')}`; dashMode='month'; render();
  });

  // Two columns: donut (income split) + dept bar
  /* รายได้ทั้งหมดไปไหน: สุทธิ + เงินหักหลัก ๆ (ที่เหลือรวมเป็น "อื่น ๆ") — สีตามลำดับคงที่ */
  const dB=t.dedBy||{}, dTax=+dB.tax||0, dSso=+dB.sso||0, dPvd=+dB.pvd||0, dOth=Math.max(0,t.ded-dTax-dSso-dPvd);
  const dsplit=[{label:'เงินสุทธิ (Net)',value:t.net,color:'var(--s1)'},{label:'ภาษีเงินได้',value:dTax,color:'var(--s2)'},
    {label:'ประกันสังคม',value:dSso,color:'var(--s3)'},{label:'กองทุนสำรองเลี้ยงชีพ',value:dPvd,color:'var(--s4)'},{label:'เงินหักอื่น ๆ',value:dOth,color:'var(--s5)'}];
  const dTot=dsplit.reduce((s,x)=>s+x.value,0)||1;
  const depts = isYear ? deptSummaryYear(curY) : deptSummaryRange(curY, cf, ct);
  const deptItems = depts.map((d,i)=>({label:d.dept,value:d.net,has:true,color:[C.brand,C.green,C.purple,C.warn,C.slate][i%5]}));
  const row=el(`<div style="display:grid;grid-template-columns:1fr 1.3fr;gap:20px;margin-bottom:20px;align-items:start" class="dash2"></div>`);
  row.appendChild(el(`<div class="panel" style="margin:0"><div class="phead"><h2>🍩 รายได้ทั้งหมดไปไหน</h2></div>
    <div class="pbody" style="display:flex;flex-direction:column;align-items:center;gap:16px">
      ${donutChart(dsplit)}
      <div class="vz-legend">${dsplit.filter(s=>s.value>0).map(s=>`<div class="row"><span class="sw" style="background:${s.color}"></span><span class="lab">${esc(s.label)}</span><span class="val">${money(s.value)}</span><span class="pct">${(s.value/dTot*100).toFixed(s.value/dTot<0.1?1:0)}%</span></div>`).join('')}</div>
    </div></div>`));
  row.appendChild(el(`<div class="panel" style="margin:0"><div class="phead"><h2>🏢 เงินสุทธิตามแผนก</h2></div>
    <div class="pbody">${hbarChart(deptItems)}</div></div>`));
  v.appendChild(row);

  // Dept table
  const rows = depts.map(d=>`<tr><td>${esc(d.dept)}</td><td class="num">${num(d.count)}</td><td class="num">${money(d.salary)}</td><td class="num pos">${money(d.gross)}</td><td class="num neg">${money(d.ded)}</td><td class="num">${money(d.net)}</td></tr>`).join('');
  const panel = el(`<div class="panel"><div class="phead"><h2>${tr('dept_summary')} — ${scopeLabel}</h2></div><div class="pbody" style="padding:0"><div class="tbl-wrap"></div></div></div>`);
  panel.querySelector('.tbl-wrap').appendChild(el(`<table>
    <thead><tr><th>${tr('th_dept')}</th><th class="num">${tr('th_emp')}</th><th class="num">${tr('th_salary')}</th><th class="num">${tr('th_income')}</th><th class="num">${tr('th_deduct')}</th><th class="num">${tr('th_net')}</th></tr></thead>
    <tbody>${rows||`<tr><td colspan="6" class="empty">${tr('no_data')}</td></tr>`}</tbody>
    <tfoot><tr><td>${tr('grand_total')}</td><td class="num">${num(t.count)}</td><td class="num">${money(t.salary)}</td><td class="num">${money(t.gross)}</td><td class="num">${money(t.ded)}</td><td class="num">${money(t.net)}</td></tr></tfoot>
  </table>`));
  v.appendChild(panel);

  /* ภาพรวม HR: กำลังคน · เวลา&การลา · โครงสร้างพนักงาน · ต้นทุนบุคลากร (อยู่ใต้ส่วนเงินเดือน) */
  v.appendChild(el(hrOverview(curY, cf, ct)));
}
function deptSummary(p){
  const map={};
  activeEmps(p).forEach(e=>{ const c=calc(e,p); const d=e.dept||'(ไม่ระบุ)';
    map[d] = map[d]||{dept:d,count:0,salary:0,gross:0,ded:0,net:0};
    map[d].count++; map[d].salary+=c.base; map[d].gross+=c.gross; map[d].ded+=c.dedTotal; map[d].net+=c.net;
  });
  return Object.values(map).sort((a,b)=>a.dept.localeCompare(b.dept,'th'));
}

