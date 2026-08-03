// ============================================================
//  Edge Function: omise-charge
//  สร้างรายการชำระเงินพร้อมเพย์กับ Omise แล้วคืน QR ให้หน้าเว็บ
//  ราคาคิดที่นี่เท่านั้น — ยอดที่หน้าเว็บส่งมาไม่ถูกใช้
// ============================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY     = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const OMISE_SECRET = Deno.env.get('OMISE_SECRET_KEY') ?? '';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-client-info, apikey',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });
const fail = (code: string, th: string, en: string, s = 400) =>
  json({ ok: false, code, message: th, message_en: en }, s);

// ---- ตารางราคา (ต้องตรงกับหน้าเว็บ — คิดที่นี่เท่านั้น) ----
const TIERS = [
  { min: 1,   max: 10,  price: 590,  prem: 790 },
  { min: 11,  max: 30,  price: 990,  prem: 1590 },
  { min: 31,  max: 50,  price: 1490, prem: 2490 },
  { min: 51,  max: 80,  price: 2490, prem: 3490 },
  { min: 81,  max: 100, price: 2990, prem: 4490 },
];
const YEAR_MONTHS = 10;
// แพ็กเกจสำนักงานบัญชี — คิดตามจำนวนบริษัทลูกค้า พนักงานไม่จำกัด
const FIRM_TIERS = [
  { min: 1,  max: 10, price: 4900 },
  { min: 11, max: 30, price: 9900 },
];
function priceFor(count: number, cycle: string, ptype: string, edition: string) {
  if (edition === 'firm') {
    const t = FIRM_TIERS.find(t => count >= t.min && count <= t.max);
    if (!t) return null;                       // เกิน 30 บริษัท = ขอใบเสนอราคา
    return { plan: `${t.min}-${t.max} บริษัท · สำนักงานบัญชี`,
             amount: cycle === 'yearly' ? t.price * YEAR_MONTHS : t.price };
  }
  const t = TIERS.find(t => count >= t.min && count <= t.max);
  if (!t) return null;
  const mo = ptype === 'premium' ? t.prem : t.price;
  return { plan: `${t.min}-${t.max} คน${ptype === 'premium' ? ' · พรีเมี่ยม' : ''}`,
           amount: cycle === 'yearly' ? mo * YEAR_MONTHS : mo };
}

// เรียก Omise แบบ Basic auth (คีย์เป็น username รหัสผ่านว่าง)
async function omise(path: string, body: Record<string, string>) {
  const r = await fetch('https://api.omise.co' + path, {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + btoa(OMISE_SECRET + ':'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(body).toString(),
  });
  const data = await r.json().catch(() => ({}));
  return { ok: r.ok, data };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST')    return fail('method', 'ต้องเป็น POST', 'POST required', 405);

  if (!OMISE_SECRET) return fail('not_configured',
    'ยังไม่ได้ตั้งค่าระบบชำระเงิน กรุณาติดต่อทีมงาน',
    'Payment gateway is not configured yet — please contact support', 503);

  // ---------- 1) ต้องล็อกอิน ----------
  const auth = req.headers.get('Authorization') ?? '';
  if (!auth) return fail('no_auth', 'ต้องเข้าสู่ระบบก่อน', 'Sign-in required', 401);
  const asUser = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: auth } } });
  const { data: udata } = await asUser.auth.getUser();
  const user = udata?.user;
  if (!user) return fail('no_auth', 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่', 'Session expired', 401);

  // ---------- 2) อ่านคำขอ ----------
  let b: any;
  try { b = await req.json(); }
  catch { return fail('bad_body', 'รูปแบบคำขอไม่ถูกต้อง', 'Malformed request', 400); }

  const method    = String(b.method ?? 'promptpay');   // promptpay | card
  const cardToken = String(b.card_token ?? '').trim();
  const returnUri = String(b.return_uri ?? '').trim();
  const employees = Number(b.employees ?? 0);
  const cycle     = String(b.cycle ?? '');
  const ptype     = String(b.ptype ?? 'standard');
  const edition   = String(b.edition ?? 'single');
  const name      = String(b.name ?? '').trim();
  const email     = String(b.email ?? '').trim();
  const phone     = String(b.phone ?? '').trim() || null;
  const btype     = String(b.btype ?? 'individual');
  const taxId     = String(b.tax_id ?? '').trim() || null;
  const branch    = String(b.branch ?? '').trim() || null;
  const addr      = String(b.addr ?? '').trim() || null;

  if (!['promptpay', 'card'].includes(method))  return fail('method', 'ช่องทางชำระเงินไม่ถูกต้อง', 'Invalid payment method', 400);
  if (method === 'card' && !cardToken)          return fail('no_card', 'ไม่พบข้อมูลบัตร', 'Card token missing', 400);
  // กันคนส่ง return_uri มั่วเพื่อพาลูกค้าไปเว็บอื่นหลังยืนยัน 3-D Secure
  if (method === 'card' && returnUri && !/^https:\/\/(payroll-mtd\.vercel\.app|localhost:\d+)\//.test(returnUri))
    return fail('bad_return', 'ปลายทางหลังชำระเงินไม่ถูกต้อง', 'Invalid return URL', 400);
  if (!['monthly', 'yearly'].includes(cycle))   return fail('cycle', 'รอบชำระไม่ถูกต้อง', 'Invalid billing cycle', 400);
  if (!['standard', 'premium'].includes(ptype)) return fail('ptype', 'ระดับแพ็กเกจไม่ถูกต้อง', 'Invalid plan type', 400);
  if (!['single', 'firm'].includes(edition))    return fail('edition', 'ประเภทบัญชีไม่ถูกต้อง', 'Invalid account type', 400);
  if (!name || !email) return fail('fields', 'กรุณากรอกชื่อและอีเมล', 'Name and email are required', 400);
  if (btype === 'juristic' && (!taxId || taxId.replace(/\D/g, '').length !== 13))
    return fail('taxid', 'เลขผู้เสียภาษีต้องมี 13 หลัก', 'Tax ID must be 13 digits', 400);

  // ---------- 3) ราคาคิดฝั่งเซิร์ฟเวอร์ ----------
  const quote = priceFor(employees, cycle, ptype, edition);
  if (!quote) return fail('tier',
    edition === 'firm' ? 'จำนวนบริษัทเกินแพ็กเกจสำเร็จรูป กรุณาขอใบเสนอราคา'
                       : 'จำนวนพนักงานเกินแพ็กเกจสำเร็จรูป กรุณาขอใบเสนอราคา',
    edition === 'firm' ? 'Company count exceeds standard plans — please request a quote'
                       : 'Headcount exceeds standard plans — please request a quote', 400);
  const satang = Math.round(quote.amount * 100);   // Omise คิดเป็นสตางค์

  // ---------- 4) สร้าง source แล้ว charge ----------
  let chg;
  if (method === 'card') {
    // บัตรเครดิต — ใช้ token ที่เบราว์เซอร์สร้างไว้ (ข้อมูลบัตรไม่ผ่านเซิร์ฟเวอร์เรา)
    const p: Record<string,string> = { amount: String(satang), currency: 'THB', card: cardToken };
    if (returnUri) p.return_uri = returnUri;      // ปลายทางหลังยืนยัน 3-D Secure
    chg = await omise('/charges', p);
  } else {
    const src = await omise('/sources', { amount: String(satang), currency: 'THB', type: 'promptpay' });
    if (!src.ok || !src.data?.id)
      return fail('source_failed', 'สร้างรายการชำระเงินไม่สำเร็จ กรุณาลองใหม่',
                                   'Could not create the payment. Please try again.', 502);
    chg = await omise('/charges', { amount: String(satang), currency: 'THB', source: src.data.id });
  }
  if (!chg.ok || !chg.data?.id) {
    const msg = String(chg.data?.message ?? chg.data?.code ?? '');
    return fail('charge_failed',
      msg ? 'ชำระเงินไม่สำเร็จ: ' + msg : 'สร้างรายการชำระเงินไม่สำเร็จ กรุณาลองใหม่',
      msg ? 'Payment failed: ' + msg : 'Could not create the payment. Please try again.', 502);
  }

  // บัตรที่ถูกปฏิเสธตั้งแต่ต้น (เงินไม่พอ/บัตรผิด) — บอกลูกค้าเลย ไม่ต้องรอ webhook
  if (method === 'card' && chg.data.status === 'failed')
    return fail('card_declined',
      'บัตรถูกปฏิเสธ: ' + (chg.data.failure_message ?? chg.data.failure_code ?? ''),
      'Card declined: ' + (chg.data.failure_message ?? chg.data.failure_code ?? ''), 402);

  let qr: string | null = chg.data?.source?.scannable_code?.image?.download_uri ?? null;
  // ลิงก์ QR ของ Omise redirect ไป S3 ที่เซ็นชื่อไว้และหมดอายุใน 60 วินาที
  // อีกทั้งโดเมน S3 ไม่ได้อยู่ใน CSP ของหน้าเว็บ → ดึงรูปมาแปลงเป็น data URI ให้เลย
  if (qr) {
    try {
      const img = await fetch(qr, { redirect: 'follow' });
      if (img.ok) {
        const type = img.headers.get('content-type') ?? 'image/svg+xml';
        const buf = new Uint8Array(await img.arrayBuffer());
        let bin = ''; for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
        qr = 'data:' + type + ';base64,' + btoa(bin);
      }
    } catch { /* ดึงไม่ได้ก็ส่ง URL เดิมไป ให้เบราว์เซอร์ลองเอง */ }
  }
  const authorizeUri = chg.data?.authorize_uri ?? null;   // มีเมื่อบัตรต้องยืนยัน 3-D Secure

  // ---------- 5) บันทึกรายการรอชำระ ----------
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const { error } = await admin.from('payments').insert({
    charge_id: chg.data.id, user_id: user.id,
    amount: quote.amount, currency: 'THB',
    employees, cycle, ptype, edition, plan: quote.plan,
    buyer_name: name, buyer_email: email, buyer_phone: phone,
    buyer_type: btype, tax_id: taxId, branch, address: addr,
    status: chg.data.status === 'successful' ? 'successful' : 'pending',
    qr_uri: chg.data?.source?.scannable_code?.image?.download_uri ?? null, method,
  });
  if (error) return fail('db', 'บันทึกรายการไม่สำเร็จ', 'Could not record the payment', 500);

  return json({
    ok: true, method, charge_id: chg.data.id,
    qr_uri: qr, authorize_uri: authorizeUri,
    paid: chg.data.status === 'successful',      // บัตรที่ไม่ต้องทำ 3-D Secure จ่ายจบทันที
    amount: quote.amount, plan: quote.plan,
    expires_at: chg.data?.expires_at ?? null,
  });
});
