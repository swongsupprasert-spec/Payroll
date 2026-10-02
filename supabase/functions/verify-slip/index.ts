// ============================================================
//  Edge Function: verify-slip
//  ตรวจสลิปกับธนาคารจริงผ่าน EasySlip แล้วจึงต่ออายุให้
//  หน้าเว็บ "ขอ" ได้เท่านั้น — การตัดสินใจทั้งหมดอยู่ที่นี่
// ============================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL   = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY       = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_KEY    = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const EASYSLIP_TOKEN = Deno.env.get('EASYSLIP_TOKEN') ?? '';
// เลขบัญชี/พร้อมเพย์ปลายทาง — ใส่เฉพาะตัวท้ายที่สลิปไม่ปิดบัง เช่น "5166"
const PAYEE_TAIL     = Deno.env.get('PAYEE_ACCOUNT_TAIL') ?? '';
// สลิปต้องไม่เก่ากว่ากี่วัน
const MAX_AGE_DAYS   = Number(Deno.env.get('SLIP_MAX_AGE_DAYS') ?? '3');
// จำกัดจำนวนครั้งที่ยิงตรวจต่อคนต่อวัน (กันยิงมั่วเปลืองเครดิต)
const MAX_TRIES_DAY  = Number(Deno.env.get('SLIP_MAX_TRIES_PER_DAY') ?? '10');

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-client-info, apikey',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const fail = (code: string, msg_th: string, msg_en: string, status = 400) =>
  json({ ok: false, code, message: msg_th, message_en: msg_en }, status);

// ---- ตารางราคา (ต้องตรงกับหน้าเว็บ — คิดราคาฝั่งนี้เท่านั้น) ----
const TIERS = [
  { min: 1,   max: 10,  price: 0,    prem: 590 },   // มาตรฐาน 1-10 คน = ฟรี (ไม่ต้องชำระ)
  { min: 11,  max: 30,  price: 590,  prem: 790 },
  { min: 31,  max: 50,  price: 990,  prem: 1490 },
  { min: 51,  max: 80,  price: 1490, prem: 2290 },
  { min: 81,  max: 100, price: 2290, prem: 2990 },
  { min: 101, max: 150, price: 2990, prem: 4490 },
];
const YEAR_MONTHS = 10;

// ptype: 'standard' = เงินเดือนอย่างเดียว · 'premium' = + ลงเวลา/ลา/กะ/OT
function priceFor(employees: number, cycle: string, ptype: string) {
  const t = TIERS.find(t => employees >= t.min && employees <= t.max);
  if (!t) return null;                                   // เกิน 150 คน → ต้องขอใบเสนอราคา
  const mo = ptype === 'premium' ? t.prem : t.price;
  if (!mo) return null;                                  // แพ็กเกจฟรี ไม่ต้องชำระ
  return { plan: `${t.min}-${t.max} คน${ptype === 'premium' ? ' · พรีเมี่ยม' : ''}`,
           amount: cycle === 'yearly' ? mo * YEAR_MONTHS : mo };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST')    return fail('method', 'ต้องเป็น POST', 'POST required', 405);

  // ---------- 1) ต้องล็อกอิน ----------
  const auth = req.headers.get('Authorization') ?? '';
  if (!auth) return fail('no_auth', 'ต้องเข้าสู่ระบบก่อน', 'Sign-in required', 401);

  const asUser = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: auth } } });
  const { data: udata } = await asUser.auth.getUser();
  const user = udata?.user;
  if (!user) return fail('no_auth', 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่', 'Session expired, please sign in again', 401);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  // ---------- 2) อ่านคำขอ ----------
  let form: FormData;
  try { form = await req.formData(); }
  catch { return fail('bad_form', 'รูปแบบคำขอไม่ถูกต้อง', 'Malformed request', 400); }

  const slip      = form.get('slip');
  const employees = Number(form.get('employees') ?? 0);
  const cycle     = String(form.get('cycle') ?? '');
  const ptype     = String(form.get('ptype') ?? 'standard');
  const name      = String(form.get('name') ?? '').trim();
  const email     = String(form.get('email') ?? '').trim();
  const phone     = String(form.get('phone') ?? '').trim() || null;
  const btype     = String(form.get('btype') ?? 'individual');
  const taxId     = String(form.get('tax_id') ?? '').trim() || null;
  const branch    = String(form.get('branch') ?? '').trim() || null;
  const addr      = String(form.get('addr') ?? '').trim() || null;

  if (!(slip instanceof File)) return fail('no_slip', 'กรุณาแนบสลิป', 'Please attach a slip', 400);
  if (!/^image\//.test(slip.type)) return fail('slip_type', 'ต้องเป็นไฟล์รูปภาพ', 'Must be an image', 400);
  if (slip.size > 4 * 1024 * 1024) return fail('slip_size', 'ไฟล์ใหญ่เกิน 4 MB', 'File exceeds 4 MB', 400);
  if (!['monthly', 'yearly'].includes(cycle)) return fail('cycle', 'รอบชำระไม่ถูกต้อง', 'Invalid billing cycle', 400);
  if (!['standard', 'premium'].includes(ptype)) return fail('ptype', 'ระดับแพ็กเกจไม่ถูกต้อง', 'Invalid plan type', 400);
  if (!name || !email) return fail('fields', 'กรุณากรอกชื่อและอีเมล', 'Name and email are required', 400);
  if (btype === 'juristic' && (!taxId || taxId.replace(/\D/g, '').length !== 13))
    return fail('taxid', 'เลขผู้เสียภาษีต้องมี 13 หลัก', 'Tax ID must be 13 digits', 400);

  // ---------- 3) ราคาคิดจากฝั่งเซิร์ฟเวอร์ ----------
  if (ptype === 'standard' && employees >= 1 && employees <= 10)
    return fail('free', 'แพ็กเกจมาตรฐาน 1-10 คนใช้ฟรี ไม่ต้องชำระเงิน', 'The Standard plan for 1-10 employees is free — no payment needed', 400);
  const quote = priceFor(employees, cycle, ptype);
  if (!quote) return fail('tier', 'จำนวนพนักงานเกินแพ็กเกจสำเร็จรูป กรุณาขอใบเสนอราคา',
                                 'Headcount exceeds standard plans — please request a quote', 400);

  // ---------- 4) จำกัดจำนวนครั้งต่อวัน ----------
  const since = new Date(Date.now() - 864e5).toISOString();
  const { count: tries } = await admin.from('slip_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id).gte('created_at', since);
  if ((tries ?? 0) >= MAX_TRIES_DAY)
    return fail('rate', 'ตรวจสลิปเกินจำนวนครั้งที่อนุญาตต่อวัน กรุณาติดต่อทีมงาน',
                        'Too many verification attempts today — please contact support', 429);
  await admin.from('slip_attempts').insert({ user_id: user.id, employees, cycle, amount: quote.amount });

  // ---------- 5) ยังไม่ตั้งค่า EasySlip → ไม่เปิดใช้งาน (fail closed) ----------
  if (!EASYSLIP_TOKEN) {
    return fail('not_configured',
      'ระบบตรวจสลิปอัตโนมัติยังไม่ได้ตั้งค่า กรุณาติดต่อทีมงาน',
      'Automatic slip verification is not configured yet — please contact support', 503);
  }

  // ---------- 6) ส่งสลิปให้ EasySlip ตรวจกับธนาคาร ----------
  let es: any;
  try {
    const fd = new FormData();
    fd.append('image', slip, slip.name || 'slip.jpg');
    fd.append('checkDuplicate', 'true');
    fd.append('matchAmount', String(quote.amount));   // ยอดต้องตรงเป๊ะ
    fd.append('matchAccount', 'true');                // บัญชีปลายทางต้องเป็นบัญชีเรา
    const r = await fetch('https://api.easyslip.com/v2/verify/bank', {
      method: 'POST',
      headers: { Authorization: `Bearer ${EASYSLIP_TOKEN}` },
      body: fd,
    });
    es = await r.json().catch(() => ({}));
    if (!r.ok || es?.success !== true) {
      const c = String(es?.message ?? es?.code ?? 'verify_failed');
      // แปลรหัสที่พบบ่อยให้ผู้ใช้เข้าใจ
      const map: Record<string, [string, string]> = {
        amount_invalid:       ['ยอดในสลิปไม่ตรงกับยอดที่ต้องชำระ', 'Slip amount does not match the amount due'],
        account_invalid:      ['บัญชีปลายทางในสลิปไม่ใช่บัญชีของเรา', 'The receiving account on the slip is not ours'],
        duplicate_slip:       ['สลิปนี้ถูกใช้ไปแล้ว', 'This slip has already been used'],
        slip_not_found:       ['ตรวจไม่พบรายการนี้กับธนาคาร สลิปอาจไม่ใช่ของจริง', 'The bank has no record of this transfer — the slip may not be genuine'],
        qrcode_not_found:     ['อ่าน QR บนสลิปไม่ได้ กรุณาถ่าย/บันทึกสลิปให้ชัดขึ้น', 'Could not read the QR on the slip — please use a clearer image'],
        image_size_too_large: ['ไฟล์ใหญ่เกินไป', 'Image too large'],
      };
      const [th, en] = map[c] ?? ['ตรวจสลิปไม่ผ่าน: ' + c, 'Slip verification failed: ' + c];
      return fail(c, th, en, 422);
    }
  } catch (e) {
    return fail('verify_error', 'ติดต่อระบบตรวจสลิปไม่ได้ กรุณาลองใหม่',
                               'Could not reach the verification service — please try again', 502);
  }

  const raw      = es?.data?.rawSlip ?? {};
  const transRef = String(raw?.transRef ?? '').trim();
  const amount   = Number(raw?.amount?.amount ?? raw?.amount?.local?.amount ?? 0);
  const slipDate = raw?.date ? new Date(raw.date) : null;
  const recvAcct = String(raw?.receiver?.account?.bank?.account ?? raw?.receiver?.account?.name ?? '');

  // ---------- 7) ตรวจซ้ำด้วยตัวเอง ไม่พึ่งผู้ให้บริการเจ้าเดียว ----------
  if (!transRef) return fail('no_ref', 'สลิปไม่มีเลขอ้างอิง', 'Slip has no reference number', 422);
  if (es?.data?.isDuplicate === true) return fail('duplicate_slip', 'สลิปนี้ถูกใช้ไปแล้ว', 'This slip has already been used', 409);
  if (Math.abs(amount - quote.amount) > 0.009)
    return fail('amount_invalid',
      `ยอดในสลิป ${amount.toLocaleString()} บาท ไม่ตรงกับยอดที่ต้องชำระ ${quote.amount.toLocaleString()} บาท`,
      `Slip amount ${amount.toLocaleString()} does not match the ${quote.amount.toLocaleString()} due`, 422);
  if (PAYEE_TAIL && recvAcct && !recvAcct.replace(/\D/g, '').includes(PAYEE_TAIL.replace(/\D/g, '')))
    return fail('account_invalid', 'บัญชีปลายทางในสลิปไม่ใช่บัญชีของเรา',
                                   'The receiving account on the slip is not ours', 422);
  if (slipDate && Date.now() - slipDate.getTime() > MAX_AGE_DAYS * 864e5)
    return fail('slip_old', `สลิปเก่ากว่า ${MAX_AGE_DAYS} วัน กรุณาติดต่อทีมงาน`,
                            `Slip is older than ${MAX_AGE_DAYS} days — please contact support`, 422);

  // ---------- 8) กันใช้สลิปซ้ำในฐานข้อมูลเราเอง (primary key กันชนกัน) ----------
  const claim = await admin.from('used_slips')
    .insert({ trans_ref: transRef, user_id: user.id, amount, slip_date: slipDate?.toISOString() ?? null });
  if (claim.error) {
    if (String(claim.error.code) === '23505')
      return fail('duplicate_slip', 'สลิปนี้ถูกใช้ไปแล้ว', 'This slip has already been used', 409);
    return fail('db', 'บันทึกข้อมูลไม่สำเร็จ', 'Could not record the transaction', 500);
  }

  // ---------- 9) เก็บรูปสลิปไว้เป็นหลักฐาน ----------
  let slipPath: string | null = null;
  try {
    const ext = (slip.name.match(/\.[a-z0-9]+$/i)?.[0] ?? '.jpg').toLowerCase();
    slipPath = `${user.id}/${transRef}${ext}`;
    await admin.storage.from('slips').upload(slipPath, slip, { contentType: slip.type, upsert: true });
  } catch { /* เก็บรูปไม่ได้ก็ไม่บล็อกการเปิดใช้งาน — มี transRef เป็นหลักฐานแล้ว */ }

  // ---------- 10) ต่ออายุ (เฉพาะ service role เรียกได้) ----------
  const { data: until, error } = await admin.rpc('activate_verified_order', {
    p_user: user.id, p_employees: employees, p_cycle: cycle, p_amount: quote.amount, p_plan: quote.plan,
    p_name: name, p_email: email, p_phone: phone, p_btype: btype,
    p_tax_id: taxId, p_branch: branch, p_addr: addr,
    p_slip: slipPath, p_trans_ref: transRef, p_ptype: ptype,
  });
  if (error) {
    await admin.from('used_slips').delete().eq('trans_ref', transRef);  // คืนสิทธิ์ให้ลองใหม่ได้
    return fail('activate_failed', 'เปิดใช้งานไม่สำเร็จ: ' + error.message,
                                   'Activation failed: ' + error.message, 500);
  }

  return json({
    ok: true, paid_until: until, plan: quote.plan, amount: quote.amount,
    cycle, trans_ref: transRef, slip_date: slipDate?.toISOString() ?? null,
  });
});
