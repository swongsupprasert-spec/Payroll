// ============================================================
//  Edge Function: omise-webhook
//  Omise ยิงมาบอกว่าจ่ายแล้ว → ตรวจลายเซ็น → ยิงกลับไปถาม Omise เอง
//  ว่าจ่ายจริงไหม → ผ่านแล้วจึงต่ออายุให้
//
//  ⚠️ ต้อง deploy ด้วย --no-verify-jwt เพราะ Omise ไม่มี token ของ Supabase
// ============================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL   = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY    = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const OMISE_SECRET   = Deno.env.get('OMISE_SECRET_KEY') ?? '';
const WEBHOOK_SECRET = Deno.env.get('OMISE_WEBHOOK_SECRET') ?? '';

const ok  = (m = 'ok') => new Response(m, { status: 200 });
const bad = (m: string, s = 400) => new Response(m, { status: s });

// ---- ตรวจลายเซ็น HMAC-SHA256 ของ Omise ----
// signed payload = timestamp + raw body · secret ถอด base64 ก่อนใช้
async function verifySignature(raw: string, sig: string, ts: string): Promise<boolean> {
  if (!WEBHOOK_SECRET || !sig) return false;
  try {
    const keyBytes = Uint8Array.from(atob(WEBHOOK_SECRET), c => c.charCodeAt(0));
    const key = await crypto.subtle.importKey(
      'raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(ts + raw));
    const hex = [...new Uint8Array(mac)].map(b => b.toString(16).padStart(2, '0')).join('');
    const b64 = btoa(String.fromCharCode(...new Uint8Array(mac)));
    const given = sig.trim();
    // เทียบแบบไม่ให้เวลาที่ใช้บอกใบ้ (constant time)
    const eq = (a: string, b: string) => {
      if (a.length !== b.length) return false;
      let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
      return d === 0;
    };
    return eq(given, hex) || eq(given, b64);
  } catch { return false; }
}

// ถาม Omise เองว่ารายการนี้จ่ายจริงไหม — ไม่เชื่อข้อมูลที่ webhook ส่งมา
async function fetchCharge(id: string) {
  const r = await fetch('https://api.omise.co/charges/' + encodeURIComponent(id), {
    headers: { 'Authorization': 'Basic ' + btoa(OMISE_SECRET + ':') },
  });
  if (!r.ok) return null;
  return await r.json().catch(() => null);
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return bad('POST only', 405);
  if (!OMISE_SECRET) return bad('not configured', 503);

  const raw = await req.text();
  const sig = req.headers.get('omise-signature') ?? '';
  const ts  = req.headers.get('omise-signature-timestamp') ?? '';

  // ตั้งลายเซ็นไว้แล้วต้องผ่านเท่านั้น (ถ้ายังไม่ตั้ง จะไปพึ่งการถามกลับในขั้นถัดไป)
  if (WEBHOOK_SECRET && !(await verifySignature(raw, sig, ts)))
    return bad('bad signature', 401);

  let evt: any;
  try { evt = JSON.parse(raw); } catch { return bad('bad json'); }

  const chargeId = evt?.data?.id ?? evt?.data?.charge ?? null;
  if (!chargeId) return ok('ignored');                 // ไม่ใช่ event ที่เกี่ยวกับรายการชำระเงิน

  // ---------- ยืนยันกับ Omise โดยตรง ----------
  const charge = await fetchCharge(String(chargeId));
  if (!charge) return bad('charge not found', 404);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const { data: row } = await admin.from('payments').select('*').eq('charge_id', charge.id).maybeSingle();
  if (!row) return ok('unknown charge');               // ไม่ใช่รายการของเรา

  // จ่ายสำเร็จหรือยัง
  const paid = charge.status === 'successful' && charge.paid === true;
  if (!paid) {
    if (row.status === 'pending' && ['failed', 'expired'].includes(charge.status))
      await admin.from('payments').update({ status: charge.status }).eq('charge_id', charge.id);
    return ok('not paid');
  }

  // ---------- กันทำซ้ำ: ถ้าเคยต่ออายุไปแล้วก็จบ ----------
  if (row.status === 'successful') return ok('already processed');

  // ยอดต้องตรงกับที่เราตั้งไว้ (กันกรณีถูกแก้ยอด)
  if (Math.round(Number(row.amount) * 100) !== Number(charge.amount))
    return bad('amount mismatch', 409);

  // ---------- ต่ออายุให้ ----------
  const { data: until, error } = await admin.rpc('activate_verified_order', {
    p_user: row.user_id, p_employees: row.employees, p_cycle: row.cycle,
    p_amount: row.amount, p_plan: row.plan,
    p_name: row.buyer_name, p_email: row.buyer_email, p_phone: row.buyer_phone,
    p_btype: row.buyer_type, p_tax_id: row.tax_id, p_branch: row.branch, p_addr: row.address,
    p_slip: null, p_trans_ref: charge.id, p_ptype: row.ptype,
  });
  if (error) return bad('activate failed: ' + error.message, 500);

  await admin.from('payments')
    .update({ status: 'successful', paid_at: new Date().toISOString(), paid_until: until })
    .eq('charge_id', charge.id);

  return ok('activated');
});
