/* app.html · นำเข้า/ส่งออก CSV, โมดัล, บาทเป็นตัวหนังสือ — ลำดับไฟล์มีผล (โหลดตามเลข) */
/* ---------- Import / Export ---------- */
function exportJSON(){ downloadFile(`payroll_backup_${curPeriod()}.json`, JSON.stringify(DB,null,2),'application/json'); toast('ส่งออกข้อมูลแล้ว'); }
function importJSON(){
  const inp=document.createElement('input'); inp.type='file'; inp.accept='.json,application/json';
  inp.onchange=()=>{ const f=inp.files[0]; if(!f) return; const rd=new FileReader();
    rd.onload=()=>{ try{ const d=JSON.parse(rd.result); if(!d.employees) throw 0; DB=Object.assign(structuredClone(DEFAULT),d); save(); render(); toast('นำเข้าข้อมูลแล้ว'); }catch(e){ toast('ไฟล์ไม่ถูกต้อง'); } };
    rd.readAsText(f); };
  inp.click();
}
function downloadFile(name, content, type){
  const b=new Blob([content],{type}); const u=URL.createObjectURL(b);
  const a=document.createElement('a'); a.href=u; a.download=name; a.click(); setTimeout(()=>URL.revokeObjectURL(u),1000);
}

/* ---------- นำเข้า/ส่งออก พนักงาน เป็น CSV ---------- */
const EMP_CSV_HEAD=['รหัส','ชื่อ-นามสกุล','เพศ','สัญชาติ','ตำแหน่ง','เบอร์โทร','แผนก','ประเภท','ค่าจ้าง','วันเริ่มงาน(ปปปป-ดด-วว)','วันที่ลาออก(ปปปป-ดด-วว)','เหตุผลในการลาออก','รายละเอียดการลาออก','เลขบัตรประชาชน','ที่อยู่','ธนาคาร','เลขที่บัญชี','อัตรากสล.%','กองทุนสงเคราะห์%','คิดOT(ใช่/ไม่)','กะประจำ'];
function csvEsc(v){ v=String(v??''); return /[",\n\r]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v; }
/* ---------- ช่องที่ Excel ชอบแปลงค่าให้เอง ----------
   เลขบัตร 13 หลัก -> 1.23457E+11 · เบอร์โทร 0812345678 -> 812345678 (เลข 0 หน้าหาย)
   วันที่ 2026-07-15 -> 15/7/2026 แล้วพอบันทึกกลับก็นำเข้าไม่ได้
   แก้ด้วยการเขียนเป็นสูตร ="..." ซึ่ง Excel/Sheets/LibreOffice อ่านเป็นข้อความล้วน */
function csvKeepText(v){
  v=String(v??'');
  if(v==='') return '';
  return '="'+v.replace(/"/g,'""')+'"';
}
/* ถอด ="..." หรือ '... ที่ติดมาจากไฟล์ Excel ออกก่อนใช้งาน */
function csvUnText(v){
  let s=String(v??'').trim();
  const m=s.match(/^=\s*"([\s\S]*)"$/);
  if(m) s=m[1].replace(/""/g,'"');
  else if(s.startsWith("'")) s=s.slice(1);
  return s.trim();
}
/* ---------- อ่านวันที่จากรูปแบบที่คนกรอกกันจริง ----------
   รับ 2026-07-15 · 15/7/2026 · 15-07-2026 · 2569-07-15 (พ.ศ.) · 15/7/2569
   คืนค่าเป็น YYYY-MM-DD เสมอ อ่านไม่ออกคืนค่าว่าง ดีกว่าเก็บค่าที่ใช้ไม่ได้ */
function csvDate(v){
  const s=csvUnText(v);
  if(!s) return '';
  const p=s.split(/[-/.]/).map(x=>x.trim()).filter(Boolean);
  if(p.length!==3) return '';
  let y,m,d;
  if(p[0].length===4){ y=+p[0]; m=+p[1]; d=+p[2]; }   // ปีมาก่อน
  else { d=+p[0]; m=+p[1]; y=+p[2]; }                  // วันมาก่อน (แบบไทย/ยุโรป)
  if(!(y>0&&m>0&&d>0)) return '';
  if(y<100) y+=2000;
  if(y>2400) y-=543;                                   // พ.ศ. -> ค.ศ.
  if(m>12||d>31) return '';
  const dt=new Date(y,m-1,d);
  if(dt.getFullYear()!==y||dt.getMonth()!==m-1||dt.getDate()!==d) return '';   // 31/2 ไม่มีจริง
  return y+'-'+pad2(m)+'-'+pad2(d);
}
function parseCSV(text){
  const rows=[]; let field='', row=[], inQ=false; text=text.replace(/\r\n/g,'\n').replace(/\r/g,'\n');
  for(let i=0;i<text.length;i++){ const c=text[i];
    if(inQ){ if(c==='"'){ if(text[i+1]==='"'){field+='"';i++;} else inQ=false; } else field+=c; }
    else if(c==='"') inQ=true;
    else if(c===',') { row.push(field); field=''; }
    else if(c==='\n'){ row.push(field); rows.push(row); row=[]; field=''; }
    else field+=c;
  }
  if(field!==''||row.length){ row.push(field); rows.push(row); }
  return rows;
}
function exportEmpCSV(){
  const list = empVisibleList();                     // ส่งออกตามที่กรอง/ค้นหาอยู่
  const lines=[EMP_CSV_HEAD.map(csvEsc).join(',')];
  list.forEach(e=>{
    lines.push([csvKeepText(e.code), e.name, e.gender==='M'?'ชาย':e.gender==='F'?'หญิง':'',
      e.nationality||'', e.position||'', csvKeepText(e.phone), e.dept||'',
      e.payType==='daily'?'รายวัน':'รายเดือน',
      e.salary||0, csvKeepText(e.startDate), csvKeepText(e.resignDate),
      resignReasonLabel(e.resignReason), e.resignNote||'', csvKeepText(e.taxId),
      e.address||'', e.bank||'', csvKeepText(e.bankNo), e.pvdRate||0, e.wfRate||'', e.noOT?'ไม่':'ใช่', (shiftById(e.shiftId)||ensureShifts()[0]).name].map(csvEsc).join(','));
  });
  const tag = empFilter==='daily'?'_รายวัน' : empFilter==='monthly'?'_รายเดือน' : '';
  downloadFile(`employees${tag}_${curPeriod()}.csv`, '﻿'+lines.join('\r\n'), 'text/csv;charset=utf-8');
  toast(`ส่งออก CSV แล้ว (${list.length} คน)`);
}
/* ---------- จับคู่คอลัมน์ CSV จากชื่อหัวตาราง ----------
   เดิมอ่านตามลำดับคอลัมน์ตายตัว ไฟล์ที่เรียงคอลัมน์ต่างออกไปจึงเข้าช่องผิดหมด
   (เช่น เบอร์โทรไปอยู่ช่องตำแหน่ง) ตอนนี้อ่านชื่อหัวตารางก่อน
   ถ้าอ่านชื่อไม่ออกเลยค่อยถอยไปใช้ลำดับแบบเดิม */
const EMP_FIELDS=[
  ['code','รหัส',            [/^รหัส/,/^เลขที่?พนักงาน/,/\b(emp(loyee)?[ _-]?)?(code|id|no)\b/i]],
  ['name','ชื่อ-นามสกุล',     [/^ชื่อ/,/^นาม/,/\bname\b/i]],
  ['gender','เพศ',           [/^เพศ/,/\b(gender|sex)\b/i]],
  ['nationality','สัญชาติ',   [/^สัญชาติ/,/\bnationality\b/i]],
  ['position','ตำแหน่ง',      [/^ตำแหน่ง/,/\b(position|job ?title|title)\b/i]],
  ['phone','เบอร์โทร',        [/เบอร์|โทรศัพท์|^โทร/,/\b(phone|mobile|tel)\b/i]],
  ['dept','แผนก',            [/^แผนก/,/^ฝ่าย/,/\b(dept|department)\b/i]],
  ['payType','ประเภท',        [/^ประเภท/,/\b(pay ?type|employment ?type)\b/i]],
  ['salary','ค่าจ้าง',        [/^ค่าจ้าง/,/^เงินเดือน/,/^ฐานเงินเดือน/,/\b(salary|wage|rate)\b/i]],
  ['startDate','วันเริ่มงาน',  [/เริ่มงาน|วันที่เริ่ม|วันเข้างาน/,/\b(start|hire)[ _-]?date\b/i]],
  ['resignDate','วันที่ลาออก', [/ลาออก|สิ้นสุด|พ้นสภาพ/,/\b(resign|end|termination)[ _-]?date\b/i]],
  ['resignReason','เหตุผลในการลาออก',[/เหตุผล.*ลาออก|สาเหตุ.*ออก/,/\b(resign|leaving|termination) ?reason\b/i]],
  ['resignNote','รายละเอียดการลาออก',[/รายละเอียด.*ลาออก/,/\bresign ?note\b/i]],
  ['taxId','เลขบัตรประชาชน',  [/บัตรประชาชน|ประจำตัวประชาชน|^เลขประจำตัว/,/\b(national ?id|id ?card|citizen)\b/i]],
  ['address','ที่อยู่',        [/^ที่อยู่/,/\baddress\b/i]],
  ['bank','ธนาคาร',          [/^ธนาคาร/,/\bbank$/i,/\bbank ?name\b/i]],
  ['bankNo','เลขที่บัญชี',    [/เลขที่?บัญชี|บัญชีธนาคาร/,/\b(account ?(no|number)|bank ?account)\b/i]],
  ['pvdRate','อัตรากสล.%',    [/กสล|สำรองเลี้ยงชีพ/,/\bpvd\b/i]],
  ['wfRate','กองทุนสงเคราะห์%',[/สงเคราะห์/,/\bwelfare\b/i]],
  ['noOT','คิดOT',           [/คิด ?ot/i,/^ot$/i]],
  ['shift','กะประจำ',        [/^กะ/,/\bshift\b/i]]
];
const EMP_POS_ORDER=['code','name','gender','nationality','position','dept','payType','salary',
  'startDate','resignDate','taxId','address','bank','bankNo','pvdRate','wfRate','noOT','shift'];
function normHead(s){
  return String(s||'').replace(/^\uFEFF/,'').replace(/[()（）]/g,' ')
    .replace(/[\s\u00A0._-]+/g,' ').trim();
}
/* คืน {map:{field:ดัชนีคอลัมน์}, unmatched:[ชื่อคอลัมน์ที่ไม่รู้จัก], byName:true/false} */
function mapEmpColumns(head){
  const cols=head.map(normHead);
  const map={}, taken=new Set();
  EMP_FIELDS.forEach(([field,,pats])=>{
    for(let i=0;i<cols.length;i++){
      if(taken.has(i) || !cols[i]) continue;
      if(pats.some(p=>p.test(cols[i]))){ map[field]=i; taken.add(i); return; }
    }
  });
  // ต้องเจออย่างน้อยรหัสกับชื่อ ถึงจะเชื่อว่าอ่านหัวตารางได้จริง
  if(map.code===undefined || map.name===undefined){
    const m={}; EMP_POS_ORDER.forEach((f,i)=>{ if(i<cols.length) m[f]=i; });
    return { map:m, unmatched:[], byName:false };
  }
  const unmatched=cols.map((t,i)=>({t,i})).filter(x=>x.t && !taken.has(x.i)).map(x=>x.t);
  return { map, unmatched, byName:true };
}
function empRecFromRow(c, map){
  // ถอด ="..." ที่ Excel ใส่ไว้ออกทุกช่อง แล้วค่อยใช้งาน
  const g=f=> map[f]===undefined ? '' : csvUnText(c[map[f]]);
  const num=f=> +String(g(f)).replace(/,/g,'') || 0;
  const gen=g('gender');
  const pvd=num('pvdRate');
  const otTxt=g('noOT');
  const rec={
    code:g('code'), name:g('name'),
    gender:/ชาย|^m(ale)?$/i.test(gen)?'M':/หญิง|^f(emale)?$/i.test(gen)?'F':'',
    nationality:g('nationality'), position:g('position'), phone:g('phone'), dept:g('dept'),
    payType:/วัน|daily/i.test(g('payType'))?'daily':'monthly',
    salary:num('salary'),
    startDate:csvDate(g('startDate')), resignDate:csvDate(g('resignDate')),
    taxId:g('taxId').replace(/[\s-]/g,''), address:g('address'), bank:g('bank'), bankNo:g('bankNo'),
    resignReason:(RESIGN_REASONS.find(r=>r[1]===g('resignReason'))||[])[0]||'',
    resignNote:g('resignNote'),
    pvdRate:pvd, wfRate: pvd>0 ? 0 : num('wfRate'),
    noOT: otTxt && /^(ไม่|no|n|0|false)$/i.test(otTxt) ? 1 : 0
  };
  const sh=g('shift');
  if(sh){ const s=ensureShifts().find(x=>x.name===sh); if(s) rec.shiftId=s.id; }
  return rec;
}
function importEmpCSV(){
  const inp=document.createElement('input'); inp.type='file'; inp.accept='.csv,text/csv';
  inp.onchange=()=>{ const f=inp.files[0]; if(!f) return; const rd=new FileReader();
    rd.onload=()=>{ try{
      const rows=parseCSV(decodeTextBytes(rd.result));
      if(rows.length<2) throw 0;
      const { map, unmatched, byName } = mapEmpColumns(rows[0]);
      const recs=[];
      for(let r=1;r<rows.length;r++){ const c=rows[r]; if(!c) continue;
        const rec=empRecFromRow(c, map);
        if(!rec.code) continue;
        recs.push(rec);
      }
      if(!recs.length){ toast('ไม่พบข้อมูลพนักงานในไฟล์นี้'); return; }
      // วันเริ่มงานที่กรอกมาแต่อ่านไม่ออก ต้องเตือน ไม่ใช่เงียบแล้วเว้นว่าง
      const badDates=[];
      for(let r=1;r<rows.length;r++){
        const cc=rows[r]; if(!cc) continue;
        const raw=map.startDate===undefined?'':csvUnText(cc[map.startDate]);
        const code=map.code===undefined?'':csvUnText(cc[map.code]);
        if(code && raw && !csvDate(raw)) badDates.push(code+' → “'+raw+'”');
      }
      const willUpdate=recs.filter(x=>DB.employees.some(e=>e.code===x.code)).length;
      const willAdd=recs.length-willUpdate;
      const sample=recs.slice(0,3);
      const shown=EMP_FIELDS.filter(([f])=>map[f]!==undefined);
      const missing=EMP_FIELDS.filter(([f])=>map[f]===undefined&&['name','salary','startDate'].includes(f)).map(x=>x[1]);
      openModal('ตรวจก่อนนำเข้า CSV',
        `${byName
           ? '<p>อ่านชื่อคอลัมน์จากหัวตารางได้ — ตรวจว่าจับคู่ถูกต้องก่อนกดยืนยัน</p>'
           : '<p style="color:var(--bad)"><strong>อ่านชื่อคอลัมน์ไม่ออก</strong> จะใช้ลำดับคอลัมน์แบบมาตรฐานแทน ถ้าไฟล์เรียงคอลัมน์ต่างออกไป ข้อมูลจะเข้าช่องผิด — แนะนำให้กด “ส่งออก CSV” ดูรูปแบบที่ถูกต้องก่อน</p>'}
         <div class="tbl-wrap" style="max-height:240px;overflow:auto"><table>
           <thead><tr><th>ช่องในโปรแกรม</th><th>คอลัมน์ในไฟล์</th><th>ตัวอย่าง</th></tr></thead>
           <tbody>${shown.map(([f,lab])=>`<tr><td>${esc(lab)}</td>
             <td><span class="chip">${esc(normHead(rows[0][map[f]])||('คอลัมน์ '+(map[f]+1)))}</span></td>
             <td class="muted">${esc(sample.map(s=>String(s[f]??'')).filter(Boolean).slice(0,2).join(' · ')||'—')}</td></tr>`).join('')}</tbody>
         </table></div>
         ${missing.length?`<p style="color:var(--bad);margin-top:10px">⚠️ ไม่พบคอลัมน์: <strong>${missing.map(esc).join(', ')}</strong> ช่องเหล่านี้จะว่างหรือเป็น 0</p>`:''}
         ${badDates.length?`<p style="color:var(--bad);margin-top:10px">⚠️ อ่านวันเริ่มงานไม่ออก ${badDates.length} รายการ จะถูกเว้นว่าง:<br>
           <span class="muted" style="font-size:12.5px">${badDates.slice(0,6).map(esc).join(' · ')}${badDates.length>6?' …':''}</span><br>
           <span class="muted" style="font-size:12.5px">รูปแบบที่รับได้: 2026-07-15 · 15/7/2026 · 15/7/2569</span></p>`:''}
         ${unmatched.length?`<p class="muted" style="font-size:12.5px;margin-top:8px">คอลัมน์ที่ไม่รู้จักและจะถูกข้าม: ${unmatched.map(esc).join(', ')}</p>`:''}
         <p style="margin-top:12px">พบ <strong>${recs.length}</strong> รายการ —
           เพิ่มใหม่ <strong>${willAdd}</strong> คน · เขียนทับของเดิม <strong style="color:var(--bad)">${willUpdate}</strong> คน</p>`,
        [['ยกเลิก','ghost',closeModal],[`นำเข้า ${recs.length} รายการ`,'',()=>{
          let added=0, updated=0, skipped=0;
          for(let i=0;i<recs.length;i++){
            const rec=recs[i];
            const ex=DB.employees.find(x=>x.code===rec.code);
            if(ex){ Object.assign(ex,rec); updated++; }
            else {
              // เกินโควตาแพ็กเกจ → หยุดตรงนี้ ไม่นำเข้าต่อ (ที่นำเข้าไปแล้วยังอยู่)
              if(!canAddEmp(1)){ skipped = recs.length-i; break; }
              DB.employees.push({id:uid(),...rec}); added++;
            }
          }
          save(); closeModal(); drawEmp();
          toast(skipped
            ? `นำเข้า ${added} คน · อัปเดต ${updated} · 🔒 ข้าม ${skipped} คน เพราะเต็มโควตาแพ็กเกจ (สูงสุด ${empLimit()} คน)`
            : `นำเข้า CSV สำเร็จ: เพิ่ม ${added} · อัปเดต ${updated}`);
        }]]);
    }catch(e){ toast('ไฟล์ CSV ไม่ถูกต้อง'); } };
    rd.readAsArrayBuffer(f); };
  inp.click();
}

/* ---------- Modal ---------- */
/* ปุ่มเปิด-ปิดตาดูรหัสผ่านหน้าเข้าสู่ระบบ */
(function(){
  function wire(){
    const inp=document.getElementById('authPass'), btn=document.getElementById('pwEye');
    if(!inp||!btn||btn.dataset.wired) return;
    btn.dataset.wired='1';
    btn.onclick=()=>{
      const show = inp.type==='password';
      inp.type = show ? 'text' : 'password';
      btn.setAttribute('aria-pressed', String(show));
      btn.setAttribute('aria-label', show ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน');
      const on=btn.querySelector('.eye-on'), off=btn.querySelector('.eye-off');
      if(on&&off){ on.style.display = show?'none':''; off.style.display = show?'':'none'; }
      inp.focus();
      try{ const n=inp.value.length; inp.setSelectionRange(n,n); }catch(e){}
    };
  }
  document.addEventListener('DOMContentLoaded',wire);
  wire();
  /* หน้าเข้าสู่ระบบถูกวาดใหม่ได้ จึงเฝ้าดูไว้ด้วย */
  new MutationObserver(wire).observe(document.documentElement,{childList:true,subtree:true});
})();
function openModal(title, body, buttons){
  const m=$('#modal');
  m.innerHTML=`<div class="mhead"><h3>${esc(title)}</h3></div><div class="mbody">${body}</div><div class="mfoot"></div>`;
  const foot=m.querySelector('.mfoot');
  (buttons||[['ปิด','ghost',closeModal]]).forEach(([lab,cls,fn])=>{ const b=el(`<button class="btn ${cls}">${esc(lab)}</button>`); b.onclick=fn; foot.appendChild(b); });
  wireT24(m);                     // ช่องเวลา 24 ชม. ในโมดัลใด ๆ ใช้งานได้ทันที
  $('#backdrop').classList.add('on');
}
/* พิมพ์ตารางกว้างแบบแนวนอน — เพิ่ม @page ชั่วคราวแล้วถอดออกเมื่อพิมพ์เสร็จ
   ทำแบบนี้เพราะ @page เปลี่ยนตาม element ไม่ได้ ต้องสลับที่ระดับเอกสาร */
function printWide(){
  const s=document.createElement('style');
  s.id='printWideCss';
  s.textContent='@media print{@page{size:A4 landscape;margin:8mm}}';
  document.head.appendChild(s);
  const cleanup=()=>{ s.remove(); window.removeEventListener('afterprint',cleanup); };
  window.addEventListener('afterprint',cleanup);
  window.print();
  setTimeout(cleanup,1000);   // เผื่อเบราว์เซอร์ไม่ยิง afterprint
}
function closeModal(){ $('#backdrop').classList.remove('on'); }
/* โมดัลที่มีช่องให้กรอก = ปิดด้วยการคลิกพื้นที่ว่างไม่ได้ กันข้อมูลหายจากการเผลอคลิก */
function modalHasInput(){
  const m=$('#modal');
  return !!(m && m.querySelector('input:not([type=hidden]), select, textarea'));
}
$('#backdrop').addEventListener('click',e=>{
  if(e.target.id!=='backdrop') return;
  if(modalHasInput()){
    toast('กด “ยกเลิก” หรือ “บันทึก” เพื่อปิด — กันข้อมูลที่กรอกไว้หาย');
    return;
  }
  closeModal();
});

/* ---------- Baht text (อ่านจำนวนเงินเป็นไทย) ---------- */
function bahtText(n){
  n=Math.round((+n||0)*100)/100;
  const neg=n<0; n=Math.abs(n);
  const bt=Math.floor(n), st=Math.round((n-bt)*100);
  const readInt=(s)=>{
    const d=['ศูนย์','หนึ่ง','สอง','สาม','สี่','ห้า','หก','เจ็ด','แปด','เก้า'];
    const pos=['','สิบ','ร้อย','พัน','หมื่น','แสน','ล้าน'];
    if(s==='0') return '';
    let out='', L=s.length;
    for(let i=0;i<L;i++){ const dig=+s[i]; const p=(L-1-i)%6;
      if(dig!==0){
        if(p===1&&dig===1) out+='สิบ';
        else if(p===1&&dig===2) out+='ยี่สิบ';
        else if(p===0&&dig===1&&L>1&&out!=='') out+='เอ็ด';
        else out+=d[dig]+pos[p];
      }
      if((L-1-i)%6===0 && (L-1-i)!==0) out+='ล้าน';
    }
    return out;
  };
  let txt=(bt===0?'ศูนย์':readInt(String(bt)))+'บาท';
  txt += st===0 ? 'ถ้วน' : readInt(String(st))+'สตางค์';
  return (neg?'ลบ':'')+txt;
}

