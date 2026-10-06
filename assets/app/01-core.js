/* app.html · ข้อมูล/โหมดสาธิต, ภาษา TH/EN, ที่เก็บข้อมูล, สูตรคำนวณเงินเดือน — ลำดับไฟล์มีผล (โหลดตามเลข) */
/* ============================================================
   ระบบเงินเดือน (Payroll) — single-file app, localStorage
   ============================================================ */
/* โหมดสาธิต (?demo) — ข้อมูลตัวอย่างสำหรับลองใช้ก่อนซื้อ
   ใช้คีย์ localStorage คนละตัวกับของจริง จะได้ไม่ทับข้อมูลที่ผู้ใช้กรอกไว้ */
const DEMO = new URLSearchParams(location.search).has('demo');
let LS_KEY = DEMO ? 'payroll_demo_v1' : 'payroll_data_v1';
/* สำนักงานบัญชีเปิดได้หลายบริษัท — ข้อมูลในเครื่องต้องแยกคีย์ต่อบริษัท
   ถ้าใช้คีย์เดียวกัน ข้อมูลเงินเดือนของลูกค้ารายหนึ่งจะไปโผล่ในอีกรายตอนสลับ */
function setStoreKey(companyId){
  LS_KEY = DEMO ? 'payroll_demo_v1'
         : companyId ? 'payroll_co_' + companyId
         : 'payroll_data_v1';
}
/* ล้างข้อมูลบริษัทที่ค้างในเครื่องทั้งหมด (ตอนออกจากระบบ) */
function clearAllStores(){
  try{
    Object.keys(localStorage)
      .filter(k=>k===LS_KEY || k==='payroll_data_v1' || k.startsWith('payroll_co_'))
      .forEach(k=>localStorage.removeItem(k));
  }catch(e){}
}
const THB = new Intl.NumberFormat('th-TH',{minimumFractionDigits:2,maximumFractionDigits:2});
const money = n => THB.format(Number(n||0));
const num = n => new Intl.NumberFormat('th-TH').format(Number(n||0));
const THAI_MONTHS = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
const THAI_MONTHS_ABBR = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
const MONTHS_EN = ['January','February','March','April','May','June','July','August','September','October','November','December'];

/* ---------- i18n (TH/EN) ---------- */
let LANG = localStorage.getItem('lang') || 'th';
const I18N = {
  th:{
    ask_period_t:'เลือกงวดเดือนที่จะทำเงินเดือน', ask_period_q:'ต้องการทำเงินเดือนของเดือนไหน?',
    ask_period_ok:'เริ่มทำเงินเดือน', ask_period_has:'งวดนี้เคยกรอกข้อมูลไว้แล้ว — เปิดขึ้นมาแก้ไขต่อได้',
    ask_period_new:'งวดนี้ยังไม่มีข้อมูล — จะเริ่มกรอกใหม่', cancel:'ยกเลิก',
    nav_dashboard:'แดชบอร์ด', nav_employees:'ข้อมูลพนักงาน', nav_attend:'เวลาเข้างาน', nav_checkin:'ลงเวลาผ่านมือถือ', nav_leave:'ระบบลางาน', nav_resign:'การลาออก', nav_advance:'เบิกจ่ายล่วงหน้า', nav_payroll:'คำนวณเงินได้ / เงินหัก', nav_summary:'สรุปเงินเดือน',
    nav_dept:'สรุปตามแผนก', nav_detail:'สรุปรายละเอียดทั้งหมด', nav_slip:'สลิปเงินเดือน', nav_wht:'หนังสือรับรองหัก ณ ที่จ่าย (50 ทวิ)',
    nav_pnd1:'แบบ ภ.ง.ด.1', nav_sso:'แบบประกันสังคม (สปส.1-10)', nav_settings:'ตั้งค่า', nav_companies:'บริษัทลูกค้า', nav_admin:'ผู้ดูแลระบบ', nav_feedback:'แจ้งปัญหา/คำแนะนำ', nav_orders:'คำสั่งซื้อ/ต่ออายุ',
    period:'งวดเดือน',
    kpi_count:'จำนวนพนักงาน', kpi_salary:'เงินเดือนรวม', kpi_income:'เงินได้รวม', kpi_deduct:'เงินหักรวม', kpi_net:'เงินสุทธิรวม',
    male:'ชาย', female:'หญิง', unspec:'ไม่ระบุ', unit_person:'คน',
    dept_summary:'สรุปตามแผนก', grand_total:'รวมทั้งสิ้น', no_data:'ยังไม่มีข้อมูล',
    th_dept:'แผนก', th_emp:'พนักงาน', th_salary:'เงินเดือน', th_income:'รายได้รวม', th_deduct:'หักรวม', th_net:'สุทธิ',
    no_emp_hint:'ยังไม่มีพนักงาน — ไปที่เมนู “ข้อมูลพนักงาน” เพื่อเพิ่ม',
    search_emp:'ค้นหา รหัส / ชื่อ / ตำแหน่ง / แผนก', import_csv:'⬆️ นำเข้า CSV', export_csv:'⬇️ ส่งออก CSV', add_emp:'➕ เพิ่มพนักงาน',
    th_code:'รหัส', th_name:'ชื่อ-นามสกุล', th_position:'ตำแหน่ง', th_type:'ประเภท', th_wage:'ค่าจ้าง', th_start:'วันเริ่มงาน',
    type_monthly:'รายเดือน', type_daily:'รายวัน', per_month:'/เดือน', per_day:'/วัน', emp_not_found:'ไม่พบพนักงาน',
    print:'🖨️ พิมพ์',
  },
  en:{
    ask_period_t:'Choose the payroll period', ask_period_q:'Which month do you want to run payroll for?',
    ask_period_ok:'Start payroll', ask_period_has:'This period already has data — you can continue editing it',
    ask_period_new:'This period is empty — you will start fresh', cancel:'Cancel',
    nav_dashboard:'Dashboard', nav_employees:'Employees', nav_attend:'Attendance', nav_checkin:'Mobile check-in', nav_leave:'Leave', nav_resign:'Resignation', nav_advance:'Advance Payment', nav_payroll:'Calculate Earnings / Deductions', nav_summary:'Payroll Summary',
    nav_dept:'By Department', nav_detail:'Full Details', nav_slip:'Payslip', nav_wht:'Withholding Cert. (50 Bis)',
    nav_pnd1:'PND.1 Form', nav_sso:'Social Security Form', nav_settings:'Settings', nav_companies:'Client companies', nav_admin:'Admin', nav_feedback:'Feedback', nav_orders:'Orders',
    period:'Period',
    kpi_count:'Employees', kpi_salary:'Total Salary', kpi_income:'Total Earnings', kpi_deduct:'Total Deductions', kpi_net:'Total Net Pay',
    male:'Male', female:'Female', unspec:'N/A', unit_person:'',
    dept_summary:'Summary by Department', grand_total:'Grand Total', no_data:'No data',
    th_dept:'Department', th_emp:'Staff', th_salary:'Salary', th_income:'Gross', th_deduct:'Deductions', th_net:'Net',
    no_emp_hint:'No employees yet — go to “Employees” to add.',
    search_emp:'Search code / name / position / dept', import_csv:'⬆️ Import CSV', export_csv:'⬇️ Export CSV', add_emp:'➕ Add Employee',
    th_code:'Code', th_name:'Name', th_position:'Position', th_type:'Type', th_wage:'Wage', th_start:'Start Date',
    type_monthly:'Monthly', type_daily:'Daily', per_month:'/mo', per_day:'/day', emp_not_found:'No employees found',
    print:'🖨️ Print',
  }
};
function tr(k){ return (I18N[LANG] && I18N[LANG][k]) || I18N.th[k] || k; }
function monthName(i){ return LANG==='en' ? MONTHS_EN[i] : THAI_MONTHS[i]; }
const shortMoney = n => { n=+n||0; const s=n<0?'-':''; n=Math.abs(n); if(n>=1e6) return s+(n/1e6).toFixed(n>=1e7?0:1)+'M'; if(n>=1e3) return s+Math.round(n/1e3)+'K'; return s+Math.round(n); };
const uid = () => Date.now().toString(36)+Math.random().toString(36).slice(2,7);

/* ---------- Data store ---------- */
const DEFAULT = {
  company:{ name:'บริษัท ตัวอย่าง จำกัด', address:'123 ถนนตัวอย่าง แขวง/ตำบล เขต/อำเภอ จังหวัด 10000', taxId:'0000000000000', ssoNo:'', signer:'ผู้จัดการฝ่ายบุคคล' },
  ssoRate:5, ssoMaxBase:17500, // ประกันสังคม 5% เพดานฐาน 17,500 => สูงสุด 875
  otDays:30, otHours:8,        // ฐานคำนวณ OT: เงินเดือน ÷ วัน ÷ ชม./วัน
  workDaysDefault:26,          // วันทำงาน/เดือน (ใช้ประมาณการภาษีพนักงานรายวัน)
  cutoffDay:0,                 // วันตัดรอบเงินเดือน (0 = สิ้นเดือน)
  workStart:'08:00', workEnd:'17:00', lateGrace:15,   // เวลาทำงานมาตรฐาน + อนุโลมสาย (นาที)
  shifts:[],     // กะการทำงาน [{id,name,start,end,grace,color}] — สร้างอัตโนมัติครั้งแรก
  shiftPlan:{},  // สลับกะรายวัน { "YYYY-MM-DD": { empId: shiftId } }
  otMaxDay:0,    // เพดาน OT ต่อวัน (ชั่วโมง) · 0 = ไม่จำกัด · ต่างกันรายคน/รายวันใช้ OT อนุมัติ (attend.c)
  otWeekdays:[true,true,true,true,true,true,true],     // เปิด OT วันไหน (0=อาทิตย์ … 6=เสาร์)
  otDates:{},                                          // กำหนดเฉพาะวัน { "YYYY-MM-DD": true|false } ทับค่ารายสัปดาห์
  leaveQuota:{ sick:30, personal:3, vacation:6 },      // โควตาวันลาต่อปี
  leaveHoursPerDay:8,                                  // ชั่วโมงทำงาน/วัน — ใช้แปลงวันลาเป็นชั่วโมง
  wfRateDefault:0.25,                                  // กองทุนสงเคราะห์ลูกจ้าง — 0.25% (1 ต.ค.69–30 ก.ย.74) แล้วขึ้นเป็น 0.50%
  attend:{},     // { "YYYY-MM": { empId: { "YYYY-MM-DD": {i:"08:00", o:"17:00"} } } }
  leave:[],      // [ {id,empId,type,from,to,days,reason,status} ]
  employees:[],  // {id,code,name,position,dept,payType('monthly'|'daily'),salary,startDate,taxId,bank,bankNo,pvdRate}
  payroll:{}     // { "YYYY-MM": { empId: {earn:{ot,commission,diligence,travel,position,bonus,other}, ded:{tax,sso,pvd,loan,studentloan,other}} } }
};
let DB = load();
function load(){
  try{ const d = JSON.parse(localStorage.getItem(LS_KEY)); if(d && d.employees) return Object.assign(structuredClone(DEFAULT),d); }catch(e){}
  return seed();
}
function save(){ localStorage.setItem(LS_KEY, JSON.stringify(DB)); cloudSaveDebounced(); }
function seed(){
  // เริ่มต้นด้วยข้อมูลว่างเปล่า (ไม่มีพนักงานตัวอย่าง) — ผู้ใช้ใหม่กรอกเอง
  const d = structuredClone(DEFAULT);
  d.employees = [];
  d.payroll = {};
  return d;
}
/* ข้อมูลบริษัทตัวอย่างสำหรับโหมดสาธิต — พนักงาน 5 คน (แพ็กเกจ 1-10 คน เพิ่มได้อีก 5)
   ครบทุกเคสที่ SME เจอจริง: รายเดือน/รายวัน · มี/ไม่มีกองทุนสำรองเลี้ยงชีพ · เข้างานกลางปี */
function demoSeed(){
  const d = structuredClone(DEFAULT);
  d.company = { name:'ห้างหุ้นส่วนจำกัด ศรีสมบูรณ์ เทรดดิ้ง',
    address:'88/12 ถนนพระราม 2 แขวงแสมดำ เขตบางขุนเทียน กรุงเทพมหานคร 10150',
    taxId:'0105558012345', ssoNo:'1010012345', signer:'สมชาย ใจดี' };
  const E=[
    {code:'EMP001',name:'สมชาย ใจดี',   position:'ผู้จัดการทั่วไป', dept:'บริหาร',  payType:'monthly', salary:35000, startDate:'2021-03-01', pvdRate:3, spouse:1, children:2},
    {code:'EMP002',name:'สุดา พงษ์ศรี',  position:'พนักงานบัญชี',   dept:'บัญชี',   payType:'monthly', salary:19000, startDate:'2023-06-15', pvdRate:3, children:1},
    {code:'EMP003',name:'อนุชา แก้วมณี', position:'พนักงานขาย',     dept:'ขาย',     payType:'monthly', salary:15000, startDate:'2024-01-08', pvdRate:0},
    {code:'EMP004',name:'มาลี ศรีสุข',    position:'ธุรการ',         dept:'สำนักงาน', payType:'monthly', salary:12000, startDate:'2025-02-03', pvdRate:0},
    {code:'EMP005',name:'ประยุทธ ทองดี', position:'ช่างซ่อมบำรุง',   dept:'ช่าง',    payType:'daily',   salary:520,   startDate:'2024-09-01', pvdRate:0},
  ];
  d.employees = E.map((e,i)=>Object.assign({id:'demo'+(i+1),
    taxId:'110150001'+(1000+i), bank:'กสิกรไทย', bankNo:'123-4-5678'+i, wfRate:0.25}, e));
  return d;
}
/* เติมเงินได้ของงวดปัจจุบัน แล้วให้ระบบคำนวณเงินหักเอง (ต้องเรียกหลัง PERIOD ถูกตั้งค่า) */
function demoFillPeriod(){
  const pp = ensurePeriod(PERIOD);
  const earns = { demo1:{position:5000,travel:2000}, demo2:{ot:1875,diligence:500},
                  demo3:{commission:8500,travel:1500}, demo4:{ot:900,diligence:500},
                  demo5:{ot:1560} };
  DB.employees.forEach(e=>{
    if(pp[e.id]) return;                       // มีข้อมูลอยู่แล้ว = ผู้ใช้แก้เอง ไม่เขียนทับ
    const rec = pp[e.id] = blankRec();
    Object.assign(rec.earn, earns[e.id] || {});
    if(e.payType==='daily') rec.days = 24;
    autoDeductions(e, rec);
  });
  save();
}
function curPeriod(){ const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; }
function periodLabel(p){ const [y,m]=p.split('-'); return LANG==='en' ? `${MONTHS_EN[+m-1]} ${+y}` : `${THAI_MONTHS[+m-1]} ${(+y)+543}`; }
// ช่วงวันที่ของงวดจ่าย ตามวันตัดรอบ (0 = สิ้นเดือน)
function periodRange(p){
  const [y,m]=p.split('-').map(Number); const cut=+DB.cutoffDay||0;
  if(!cut) return {from:new Date(y,m-1,1), to:new Date(y,m,0)};
  return {from:new Date(y,m-2,cut+1), to:new Date(y,m-1,cut)};
}
function fmtD(d){ return `${d.getDate()} ${THAI_MONTHS_ABBR[d.getMonth()]} ${d.getFullYear()+543}`; }

/* ---------- Payroll calc ---------- */
const EARN_FIELDS = [['ot','ค่าล่วงเวลา (OT)','Overtime (OT)'],['commission','ค่าคอมมิชชั่น','Commission'],['diligence','ค่าเบี้ยขยัน','Diligence Allowance'],['travel','ค่าเดินทาง','Travel Allowance'],['position','ค่าตำแหน่ง','Position Allowance'],['bonus','โบนัส','Bonus'],['other','อื่นๆ','Other']];
const DED_FIELDS = [['tax','ภาษีเงินได้','Income Tax'],['sso','ประกันสังคม','Social Security'],['pvd','กองทุนสำรองเลี้ยงชีพ','Provident Fund'],['wf','กองทุนสงเคราะห์ลูกจ้าง','Employee Welfare Fund'],['loan','เงินกู้บริษัท','Company Loan'],['studentloan','กยศ.','Student Loan (SLF)'],['absent','หักขาดงาน/ลาไม่รับค่าจ้าง','Unpaid Leave / Absence'],['advance','เบิกจ่ายล่วงหน้า','Advance Payment'],['other','อื่นๆ','Other']];
// ป้ายรายการตามภาษา (f = [key, th, en])
function FL(f){ return (LANG==='en' && f[2]) ? f[2] : f[1]; }

function ensurePeriod(p){ if(!DB.payroll[p]) DB.payroll[p]={}; return DB.payroll[p]; }
function blankRec(){ return { earn:{ot:0,commission:0,diligence:0,travel:0,position:0,bonus:0,other:0}, ded:{tax:0,sso:0,pvd:0,wf:0,loan:0,studentloan:0,absent:0,other:0} }; }
// getRec: สำหรับ "แก้ไข" — สร้างเรคคอร์ดจริงถ้ายังไม่มี
function getRec(p, empId){
  const pp = ensurePeriod(p);
  if(!pp[empId]) pp[empId] = blankRec();
  return pp[empId];
}
// readRec: สำหรับ "อ่าน/คำนวณ" — ไม่สร้างข้อมูลขยะ คืนค่าว่างถ้ายังไม่มี
function readRec(p, empId){
  const pp = DB.payroll[p];
  return (pp && pp[empId]) ? pp[empId] : blankRec();
}
function autoSSO(wage){ return Math.round(Math.min(wage, DB.ssoMaxBase) * DB.ssoRate/100); } // ปัดเป็นจำนวนเต็มบาท
function daysInMonth(year, month){ return new Date(year, month, 0).getDate(); }
// เงินเดือนตามสัดส่วน (prorate) — อิงช่วงงวดจ่ายตามวันตัดรอบ + วันเริ่มงาน/ลาออก
function prorate(emp, p){
  if(!p || emp.payType==='daily') return {partial:false, factor:1};   // รายวันคิดจากจำนวนวันจริง
  const {from,to}=periodRange(p);
  const DAY=86400000, total=Math.round((to-from)/DAY)+1;
  let eStart=from, eEnd=to;
  if(emp.startDate){ const [y,m,d]=emp.startDate.split('-').map(Number); const S=new Date(y,m-1,d); if(S>eStart) eStart=S; }
  if(emp.resignDate){ const [y,m,d]=emp.resignDate.split('-').map(Number); const R=new Date(y,m-1,d); if(R<eEnd) eEnd=R; }
  if(eStart>eEnd) return {partial:true, factor:0, worked:0, dim:total, from, to};   // ไม่ได้ทำงานในงวดนี้
  const worked=Math.round((eEnd-eStart)/DAY)+1;
  if(worked>=total) return {partial:false, factor:1};                 // ทำงานเต็มงวด
  return {partial:true, factor:worked/total, worked, dim:total, from, to};
}
/* ---------- ประวัติการขึ้นเงินเดือน ----------
   emp.salHist = [{from:'YYYY-MM-DD', salary:n}, ...] เรียงจากเก่าไปใหม่
   ถ้าไม่มีประวัติ = ใช้ emp.salary ตัวเดียวเหมือนเดิมทุกงวด (พฤติกรรมเดิมเป๊ะ)   */
function salHistOf(emp){ return (Array.isArray(emp.salHist)&&emp.salHist.length)?emp.salHist:null; }
/* เงินเดือน ณ วันที่ที่ระบุ */
function salaryOnDate(emp, iso){
  const h=salHistOf(emp);
  if(!h) return Number(emp.salary||0);
  let s=h[0];
  for(const x of h){ if(x.from<=iso) s=x; else break; }
  return Number(s.salary||0);
}
/* เงินเดือน ณ วันสิ้นงวด — ใช้กับอัตรา OT / ประมาณภาษี / การแสดงผล */
function salaryFor(emp, p){
  if(!salHistOf(emp)) return Number(emp.salary||0);
  return salaryOnDate(emp, isoOf(periodRange(p||PERIOD).to));
}
/* บันทึกการขึ้นเงินเดือน (ใช้ลดเงินเดือนก็ได้) */
function raiseSalary(emp, newSal, fromIso){
  if(!salHistOf(emp)) emp.salHist=[{from:'0000-01-01', salary:Number(emp.salary||0)}];
  emp.salHist=emp.salHist.filter(x=>x.from!==fromIso);   // วันเดียวกันซ้ำ = แทนที่
  emp.salHist.push({from:fromIso, salary:Number(newSal)||0});
  emp.salHist.sort((a,b)=> a.from<b.from?-1 : a.from>b.from?1 : 0);
  emp.salary=salaryOnDate(emp, isoOf(new Date()));       // ค่าปัจจุบันไว้แสดงในหน้ารายชื่อ
  save();
}
// ค่าจ้างฐานของงวด: รายเดือน = เงินเดือน (prorate เดือนแรก) · รายวัน = ค่าจ้าง/วัน × จำนวนวันทำงาน
function basePay(emp, rec, p){
  if(emp.payType==='daily'){
    if(resignedBefore(emp, p)) return 0;                 // ลาออกไปก่อนงวดนี้แล้ว
    return salaryFor(emp, p) * Number((rec&&rec.days)||0);
  }
  if(!salHistOf(emp)){                                   // ไม่มีประวัติ = สูตรเดิมเป๊ะ
    const sal=Number(emp.salary||0);
    const pr=prorate(emp, p);
    return Math.round(sal*pr.factor*100)/100;
  }
  /* มีประวัติเงินเดือน: คิดเฉลี่ยรายวัน — วันไหนอัตราไหนได้อัตรานั้น
     ครอบคลุมทั้งขึ้นเงินเดือนกลางงวด และเข้า/ออกกลางเดือนพร้อมกัน */
  const {from,to}=periodRange(p||PERIOD);
  const DAY=86400000, dim=Math.round((to-from)/DAY)+1;
  let eS=from, eE=to;
  if(emp.startDate){ const [y,m,d]=emp.startDate.split('-').map(Number); const S=new Date(y,m-1,d); if(S>eS) eS=S; }
  if(emp.resignDate){ const [y,m,d]=emp.resignDate.split('-').map(Number); const R=new Date(y,m-1,d); if(R<eE) eE=R; }
  if(eS>eE) return 0;
  let sum=0;
  for(let t=eS.getTime(); t<=eE.getTime(); t+=DAY) sum+=salaryOnDate(emp, isoOf(new Date(t)));
  return Math.round(sum/dim*100)/100;
}
// ลาออกก่อนงวดนี้เริ่มหรือไม่ (ทั้งงวดอยู่หลังวันลาออก)
function resignedBefore(emp, p){
  if(!emp.resignDate || !p) return false;
  const {from}=periodRange(p);
  const [y,m,d]=emp.resignDate.split('-').map(Number);
  return new Date(y,m-1,d) < from;
}
// คำนวณเงินหักอัตโนมัติ (ประกันสังคม + กสล. + ภาษี) จากค่าจ้างฐาน/เงินได้ของงวด
function autoDeductions(emp, rec){
  const m = rec.manual || {};      // ช่องที่ผู้ใช้แก้เอง — ไม่เขียนทับ
  const base = basePay(emp, rec, PERIOD);
  if(!m.sso) rec.ded.sso = ssoExempt(emp) ? 0 : autoSSO(ssoWage(emp, rec, PERIOD));   // กรรมการ = ไม่หัก ปกส.
  if(!m.pvd) rec.ded.pvd = Math.round(base * (emp.pvdRate||0)/100);
  // กองทุนสงเคราะห์ลูกจ้าง — เฉพาะคนที่ไม่มีกองทุนสำรองเลี้ยงชีพ (เลือกได้อย่างใดอย่างหนึ่ง)
  if(!m.wf)  rec.ded.wf  = (Number(emp.pvdRate)>0) ? 0 : Math.round(base * (emp.wfRate||0)/100);
  // ลาไม่รับค่าจ้าง/ขาดงาน — ดึงจากใบลาของงวดนี้ให้อัตโนมัติ (เงินเดือน ÷ 30 × วันที่ลา)
  // พนักงานรายวันคืน 0 เพราะได้ค่าจ้างตามวันที่มาทำงานอยู่แล้ว
  if(!m.absent) rec.ded.absent = unpaidDeduction(emp, PERIOD);
  if(!m.tax) rec.ded.tax = estTax(emp, +PERIOD.split('-')[0], rec).monthly;           // ภาษีหัก ณ ที่จ่าย/เดือน
  save();
}
function setManualDed(rec, key, val){ rec.manual=rec.manual||{}; rec.manual[key]=1; rec.ded[key]=val; }
function clearManualDed(emp, rec, key){ if(rec.manual) delete rec.manual[key]; autoDeductions(emp, rec); }
/* ---------- ค่าจ้างตามนิยามประกันสังคม (ใช้ร่วมกันทั้ง สปส.1-10 และ กท.20 ก) ----------
   = ค่าจ้างฐาน + ค่าตอบแทนประจำ  (ไม่รวมค่าล่วงเวลาและโบนัส)                        */
const SSO_WAGE_KEYS=['commission','diligence','travel','position','other'];
function ssoWage(emp, rec, p){
  const r = rec || readRec(p||PERIOD, emp.id);
  return basePay(emp, r, p||PERIOD) + SSO_WAGE_KEYS.reduce((s,k)=>s+Number(r.earn[k]||0),0);
}
// ยกเว้นประกันสังคม — กรรมการ (ไม่ใช่ลูกจ้างตาม ม.33) หรือกาช่องยกเว้นเอง
function ssoExempt(emp){
  if(emp.noSSO) return true;
  return /กรรมการ|director/i.test(String(emp.position||''));
}
// ค่าจ้างต่อเดือนโดยประมาณ (ใช้คำนวณ ปกส./กสล./ภาษี) — รายวันใช้จำนวนวันจริง ถ้าไม่มีใช้ค่าเริ่มต้น
function monthlyWage(emp, rec){
  if(emp.payType==='daily'){ const d=Number((rec&&rec.days)||0)||(DB.workDaysDefault||26); return salaryFor(emp, PERIOD)*d; }
  return salaryFor(emp, PERIOD);
}
// อัตรา OT ต่อชั่วโมง: รายเดือน = เงินเดือน÷วัน÷ชม. · รายวัน = ค่าจ้าง/วัน÷ชม.
function otRate(emp){
  const h=DB.otHours||8;
  if(emp && emp.payType==='daily') return salaryFor(emp, PERIOD)/h;
  const d=DB.otDays||30; return (emp?salaryFor(emp, PERIOD):0)/d/h;
}
function otAmount(emp,hours,mult){ return Math.round(otRate(emp)*Number(hours||0)*Number(mult||0)*100)/100; }
/* OT หลายแถว — เดือนหนึ่งมี OT หลายแบบปนกัน (วันธรรมดา / วันหยุด / ล่วงเวลาวันหยุด)
   ของเดิมเก็บได้แถวเดียวใน otHours + otMult จึงย้ายมาเป็นแถวแรกให้อัตโนมัติ */
const OT_MULTS=[['1','1× ทำงานวันหยุด (ในเวลา)'],['1.5','1.5× ล่วงเวลาวันทำงานปกติ'],['2','2× ค่าทำงานวันหยุด'],['2.5','2.5×'],['3','3× ล่วงเวลาในวันหยุด']];
function otRowsOf(r){
  if(!Array.isArray(r.earn.otRows)){
    const h=Number(r.earn.otHours||0), m=Number(r.earn.otMult||1.5);
    r.earn.otRows = h>0 ? [{h:h,m:m}] : [{h:0,m:1.5}];
  }
  if(!r.earn.otRows.length) r.earn.otRows.push({h:0,m:1.5});
  return r.earn.otRows;
}
function otTotal(emp,r){
  return Math.round(otRowsOf(r).reduce(function(s,x){ return s+otAmount(emp,x.h,x.m); },0)*100)/100;
}

// ภาษีเงินได้บุคคลธรรมดา — อัตราก้าวหน้า (ขั้นบันได)
const TAX_BRACKETS=[[150000,0],[300000,.05],[500000,.10],[750000,.15],[1000000,.20],[2000000,.25],[5000000,.30],[Infinity,.35]];
function progressiveTax(net){
  let tax=0, low=0;
  for(const [cap,rate] of TAX_BRACKETS){ if(net<=low) break; tax+=(Math.min(net,cap)-low)*rate; low=cap; }
  return Math.round(tax*100)/100;
}
// จำนวนเดือนที่ทำงานในปีภาษี (คำนึงถึงวันเริ่มงาน)
function monthsEmployedInYear(emp, year){
  let startM=1, endM=12;
  if(emp.startDate){ const [sy,sm]=emp.startDate.split('-').map(Number); if(sy>year) return 0; if(sy===year) startM=sm; }
  if(emp.resignDate){ const [ry,rm]=emp.resignDate.split('-').map(Number); if(ry<year) return 0; if(ry===year) endM=rm; }
  return Math.max(0, endM - startM + 1);   // นับจากเดือนเริ่ม → เดือนลาออก (หรือ ธ.ค.)
}
// ประมาณการภาษีหัก ณ ที่จ่ายรายเดือน (อิงเงินได้ทั้งหมด + จำนวนเดือนที่ทำงานจริงในปีภาษี)
function estTax(emp, year, rec){
  year = year || new Date().getFullYear();
  const months=monthsEmployedInYear(emp, year);              // เดือนที่ทำงานในปีภาษี
  const earn = (rec && rec.earn) || {};
  const wage = monthlyWage(emp, rec);                        // ค่าจ้าง/เดือน (รายวัน = ค่าจ้าง×วัน)
  /* ค่าจ้างที่ "ได้รับจริง" ของแต่ละเดือนในปีภาษี — ใช้ basePay ตัวเดียวกับที่จ่ายจริง
     เดือนที่เข้างานหรือลาออกกลางเดือนถูกหารตามวันทำงาน ภาษีจึงไม่คิดจากเงินที่ยังไม่ได้รับ */
  let mStart=1, mEnd=12;
  if(emp.startDate){ const [sy,sm]=emp.startDate.split('-').map(Number); if(sy===year) mStart=sm; }
  if(emp.resignDate){ const [ry,rm]=emp.resignDate.split('-').map(Number); if(ry===year) mEnd=rm; }
  const wages=[];
  for(let m=mStart;m<=mEnd;m++){
    const mp = year+'-'+String(m).padStart(2,'0');
    wages.push(emp.payType==='daily' ? wage : basePay(emp, null, mp));
  }
  const wageSum = wages.reduce((a,b)=>a+b,0);
  const extras = ['ot','commission','diligence','travel','position','other'].reduce((s,k)=>s+Number(earn[k]||0),0);
  const recurringMonthly = (months>0?wageSum/months:wage) + extras;   // เฉลี่ย/เดือน (ไว้แสดงในกล่องวิธีคำนวณ)
  const bonus = Number(earn.bonus||0);                       // โบนัส = จ่ายครั้งเดียว บวกครั้งเดียว
  const inc=wageSum + extras*months + bonus;                 // เงินได้ทั้งปี (รวมเงินได้ทุกประเภท)
  const expense=Math.min(inc*0.5,100000);                    // ค่าใช้จ่าย 50% สูงสุด 100,000
  const personal=60000;                                      // ลดหย่อนส่วนตัว (ไม่เฉลี่ยตามเดือน)
  const spouse=(+emp.spouse)?60000:0;                        // คู่สมรส
  const children=(Number(emp.children||0))*30000;            // บุตรคนละ 30,000
  const ssoCap=autoSSO(DB.ssoMaxBase)*12;                     // เพดาน ปกส./ปี = 875 × 12 = 10,500
  const sso=Math.min(wages.reduce((s,w)=>s+autoSSO(w),0), ssoCap);   // ประกันสังคม (คิดจากค่าจ้างจริงรายเดือน)
  const pvd=Math.min(wageSum*(emp.pvdRate||0)/100,500000);     // กสล.
  const other=Number(emp.otherAllow||0);                     // ลดหย่อนอื่น
  const totalDed=expense+personal+spouse+children+sso+pvd+other;
  const net=Math.max(0,inc-totalDed);                        // เงินได้สุทธิ (ฐานภาษี)
  const annual=progressiveTax(net);
  const monthly=months>0 ? Math.round(annual/months*100)/100 : 0; // เฉลี่ยตามเดือนที่ทำงาน
  return {months,recurringMonthly,bonus,inc,expense,personal,spouse,children,sso,pvd,other,totalDed,net,annual,monthly};
}
function calc(emp, p){
  const r = readRec(p, emp.id);
  const base = basePay(emp, r, p);
  const earnTotal = EARN_FIELDS.reduce((s,[k])=>s+Number(r.earn[k]||0),0);
  const gross = base + earnTotal;                 // รายได้รวม
  const dedTotal = DED_FIELDS.reduce((s,[k])=>s+Number(r.ded[k]||0),0);
  const net = gross - dedTotal;                   // เงินสุทธิ
  return {base, earnTotal, gross, dedTotal, net, r};
}
function periodTotals(p){
  const [py,pm]=p.split('-').map(Number);
  let salary=0, earn=0, gross=0, ded=0, net=0, tax=0, count=0;
  // แยกยอดรายรายการ เพื่อบอกในแดชบอร์ดว่าตัวเลขรวมมาจากอะไร
  const earnBy={}, dedBy={};
  let salMonthly=0, salDaily=0, nMonthly=0, nDaily=0;
  /* นับเฉพาะคนที่อยู่ในงวดนี้ ให้ตรงกับรายชื่อในหน้า "คำนวณเงินได้/เงินหัก" เป๊ะ ๆ
     เดิมรวมเงินของทุกคนในระบบ ยอดรวมจึงไม่เท่ากับผลบวกของตารางที่ผู้ใช้เห็น */
  DB.employees.filter(e=>activeInMonth(e,py,pm)).forEach(e=>{ const c=calc(e,p); const r=readRec(p,e.id);
    salary+=c.base; earn+=c.earnTotal; gross+=c.gross; ded+=c.dedTotal; net+=c.net; tax+=Number(r.ded.tax||0);
    EARN_FIELDS.forEach(([k])=>{ earnBy[k]=(earnBy[k]||0)+Number(r.earn[k]||0); });
    DED_FIELDS.forEach(([k])=>{ dedBy[k]=(dedBy[k]||0)+Number(r.ded[k]||0); });
    count++;
    if(e.payType==='daily'){ salDaily+=c.base; nDaily++; } else { salMonthly+=c.base; nMonthly++; }
  });
  return {count, salary, earn, gross, ded, net, tax, earnBy, dedBy, salMonthly, salDaily, nMonthly, nDaily};
}

