// คำตอบที่แอดมินสอนบอท (ตาราง line_bot_learned, sql/40) — จับคู่คำถามลูกค้ากับคำถามที่เคยตอบ
// ภาษาไทยไม่เว้นวรรค → เทียบแบบ "ตัวอักษรคู่" (bigram) แล้ววัดความเหมือน Dice 0..1 · ฟรี ไม่ใช้ AI
const FILLER = /(ครับผม|ครับ|คับ|ค่ะ|คะ|ค่า|จ้า|จ้ะ|นะคะ|นะครับ|หน่อย|ด้วย|รบกวน|สอบถาม|ขอถาม|อยากทราบ|อยากถาม|แอดมิน|admin)/giu;

export function norm(s) {
  return String(s || '').toLowerCase().replace(FILLER, '').replace(/[^\p{L}\p{N}]+/gu, '');
}
function grams(s) {
  const g = new Map();
  for (let i = 0; i < s.length - 1; i++) { const k = s.slice(i, i + 2); g.set(k, (g.get(k) || 0) + 1); }
  return g;
}
export function similarity(a, b) {
  a = norm(a); b = norm(b);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const ga = grams(a), gb = grams(b);
  let hit = 0;
  for (const [k, n] of ga) hit += Math.min(n, gb.get(k) || 0);
  return (2 * hit) / (a.length - 1 + b.length - 1);
}
// คืนรายการที่ใกล้ที่สุด { row, score } · คำถามใส่หลายแบบได้ คั่นด้วย |
export function bestLearned(text, rows = []) {
  let best = null;
  for (const row of rows) {
    for (const q of String(row.question || '').split('|')) {
      const score = similarity(text, q);
      if (!best || score > best.score) best = { row, score };
    }
  }
  return best;
}
// ใช้คำตอบของแอดมินเมื่อ: เหมือนมาก (≥ .8) หรือ บอทตอบเองไม่ได้/ได้ไม่ตรง แล้วเหมือนพอสมควร (≥ .5)
export const STRONG = 0.8, WEAK = 0.5;
export function pickLearned(text, rows, botMissed) {
  const b = bestLearned(text, rows);
  if (!b) return null;
  if (b.score >= STRONG || (botMissed && b.score >= WEAK)) return b;
  return null;
}
