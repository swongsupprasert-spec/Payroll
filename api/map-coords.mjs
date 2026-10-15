// แปลงลิงก์ Google Maps (รวมลิงก์ย่อที่กด "แชร์" จากมือถือ เช่น maps.app.goo.gl/xxxx) เป็นพิกัด
// https://esimpayroll.com/api/map-coords?u=<ลิงก์>  →  {"lat":13.75,"lng":100.5}
// เบราว์เซอร์เปิดลิงก์ย่อเองไม่ได้ (ข้ามโดเมน) จึงให้เซิร์ฟเวอร์ตามลิงก์ให้
// ตามได้เฉพาะโดเมนของ Google Maps เท่านั้น (กันการใช้เป็นตัวกลางยิงไปเว็บอื่น)
const ALLOWED = [/^maps\.app\.goo\.gl$/, /^goo\.gl$/, /^g\.co$/, /^maps\.google\.[a-z.]+$/, /^(www\.)?google\.[a-z.]+$/];
const okHost = u => u.protocol === 'https:' && ALLOWED.some(r => r.test(u.hostname));

function coordsIn(text) {
  let t = String(text || '');
  try { t = decodeURIComponent(t); } catch { t = t.replace(/%2C/gi, ','); }   // เนื้อหน้าเว็บมี % ที่ถอดไม่ได้ปนอยู่
  const pats = [/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/, /@(-?\d+\.\d+),\s*(-?\d+\.\d+)/,
    /[?&](?:q|query|ll|center|destination)=(-?\d+\.\d+),\s*\+?(-?\d+\.\d+)/, /\/search\/(-?\d+\.\d+),\s*\+?(-?\d+\.\d+)/];
  for (const p of pats) {
    const m = t.match(p);
    if (m) { const lat = +m[1], lng = +m[2]; if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) return { lat, lng }; }
  }
  return null;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  let u;
  try { u = new URL(String((req.query && req.query.u) || '').trim()); } catch { return res.status(400).json({ error: 'bad_url' }); }
  if (!okHost(u)) return res.status(400).json({ error: 'not_google_maps' });

  const direct = coordsIn(u.href);
  if (direct) return res.status(200).json(direct);

  try {
    // ตามการเปลี่ยนเส้นทางเองทีละขั้น ตรวจโดเมนทุกครั้ง
    for (let hop = 0; hop < 6; hop++) {
      const r = await fetch(u.href, { redirect: 'manual', headers: { 'User-Agent': 'Mozilla/5.0 (eSimPayroll map-coords)', 'Accept-Language': 'th,en' },
        signal: AbortSignal.timeout(8000) });
      const loc = r.headers.get('location');
      if (r.status >= 300 && r.status < 400 && loc) {
        const next = new URL(loc, u);
        const c = coordsIn(next.href);
        if (c) return res.status(200).json(c);
        if (!okHost(next)) return res.status(404).json({ error: 'no_coords' });
        u = next; continue;
      }
      // ปลายทางไม่มีพิกัดในลิงก์ (เช่นแชร์ "ชื่อสถานที่") — ไม่เดาจากเนื้อหน้าเว็บ เพราะอาจได้พิกัดผิดที่
      return res.status(404).json({ error: 'no_coords', place: true });
    }
    return res.status(404).json({ error: 'no_coords' });
  } catch {
    return res.status(502).json({ error: 'fetch_failed' });
  }
}
