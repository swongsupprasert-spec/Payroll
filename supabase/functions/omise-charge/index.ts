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
  { min: 1,  max: 5,   price: 590,  prem: 790 },
  { min: 6,  max: 10,  price: 990,  prem: 1290 },
  { min: 11, max: 20,  price: 1590, prem: 2090 },
  { min: 21, max: 40,  price: 2990, prem: 3890 },
  { min: 41, max: 60,  price: 4290, prem: 5590 },
  { min: 61, max: 80,  price: 5590, prem: 7290 },
];
const YEAR_MONTHS = 10;
function priceFor(employees: number, cycle: string, ptype: string) {
  const t = TIERS.find(t => employees >= t.min && employees <= t.max);
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

  const employees = Number(b.employees ?? 0);
  const cycle     = String(b.cycle ?? '');
  const ptype     = String(b.ptype ?? 'standard');
  const name      = String(b.name ?? '').trim();
  const email     = String(b.email ?? '').trim();
  const phone     = String(b.phone ?? '').trim() || null;
  const btype     = String(b.btype ?? 'individual');
  const taxId     = String(b.tax_id ?? '').trim() || null;
  const branch    = String(b.branch ?? '').trim() || null;
  const addr      = String(b.addr ?? '').trim() || null;

  if (!['monthly', 'yearly'].includes(cycle))   return fail('cycle', 'รอบชำระไม่ถูกต้อง', 'Invalid billing cycle', 400);
  if (!['standard', 'premium'].includes(ptype)) return fail('ptype', 'ระดับแพ็กเกจไม่ถูกต้อง', 'Invalid plan type', 400);
  if (!name || !email) return fail('fields', 'กรุณากรอกชื่อและอีเมล', 'Name and email are required', 400);
  if (btype === 'juristic' && (!taxId || taxId.replace(/\D/g, '').length !== 13))
    return fail('taxid', 'เลขผู้เสียภาษีต้องมี 13 หลัก', 'Tax ID must be 13 digits', 400);

  // ---------- 3) ราคาคิดฝั่งเซิร์ฟเวอร์ ----------
  const quote = priceFor(employees, cycle, ptype);
  if (!quote) return fail('tier', 'จำนวนพนักงานเกินแพ็กเกจสำเร็จรูป กรุณาขอใบเสนอราคา',
                                 'Headcount exceeds standard plans — please request a quote', 400);
  const satang = Math.round(quote.amount * 100);   // Omise คิดเป็นสตางค์

  // ---------- 4) สร้าง source แล้ว charge ----------
  const src = await omise('/sources', { amount: String(satang), currency: 'THB', type: 'promptpay' });
  if (!src.ok || !src.data?.id)
    return fail('source_failed', 'สร้างรายการชำระเงินไม่สำเร็จ กรุณาลองใหม่',
                                 'Could not create the payment. Please try again.', 502);

  const chg = await omise('/charges', { amount: String(satang), currency: 'THB', source: src.data.id });
  if (!chg.ok || !chg.data?.id)
    return fail('charge_failed', 'สร้างรายการชำระเงินไม่สำเร็จ กรุณาลองใหม่',
                                 'Could not create the payment. Please try again.', 502);

  const qr = chg.data?.source?.scannable_code?.image?.download_uri ?? null;

  // ---------- 5) บันทึกรายการรอชำระ ----------
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const { error } = await admin.from('payments').insert({
    charge_id: chg.data.id, user_id: user.id,
    amount: quote.amount, currency: 'THB',
    employees, cycle, ptype, plan: quote.plan,
    buyer_name: name, buyer_email: email, buyer_phone: phone,
    buyer_type: btype, tax_id: taxId, branch, address: addr,
    status: 'pending', qr_uri: qr,
  });
  if (error) return fail('db', 'บันทึกรายการไม่สำเร็จ', 'Could not record the payment', 500);

  return json({
    ok: true, charge_id: chg.data.id, qr_uri: qr,
    amount: quote.amount, plan: quote.plan,
    expires_at: chg.data?.expires_at ?? null,
  });
});
