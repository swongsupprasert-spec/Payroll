// เปิดไฟล์สำรอง (.esb) → ได้ไฟล์ JSON ข้อมูลทุกตาราง
// รัน: node scripts/backup/restore.mjs "D:\eSimPayroll-backups\esimpayroll-backup-2569....esb"
// ต้องมีไฟล์กุญแจกู้คืน (.pem) และรหัสผ่านกุญแจ · ไฟล์ที่ได้เป็นข้อมูลอ่อนไหว ใช้เสร็จควรลบทิ้ง
import fs from 'node:fs';
import zlib from 'node:zlib';
import { ask, decrypt } from './lib.mjs';

const file = process.argv[2];
if (!file || !fs.existsSync(file)) { console.log('ใส่ที่อยู่ไฟล์ .esb ด้วย เช่น node scripts/backup/restore.mjs "D:\\eSimPayroll-backups\\esimpayroll-backup-....esb"'); process.exit(1); }
const keyPath = (await ask('ที่อยู่ไฟล์กุญแจกู้คืน (.pem): ')).replace(/^"|"$/g, '');
const pass = await ask('รหัสผ่านกุญแจ: ', { hidden: true });
let json;
try { json = zlib.gunzipSync(decrypt(fs.readFileSync(file), fs.readFileSync(keyPath, 'utf8'), pass)); }
catch (e) { console.log(`❌ เปิดไม่ได้: ${/bad decrypt|unsupported|passphrase/i.test(e.message) ? 'รหัสผ่านกุญแจหรือไฟล์กุญแจไม่ถูกต้อง' : e.message}`); process.exit(1); }
const data = JSON.parse(json);
const out = file.replace(/\.esb$/i, '') + '.json';
fs.writeFileSync(out, json);
console.log(`✅ เปิดสำเร็จ — สำรองเมื่อ ${data.created_at}`);
for (const [t, v] of Object.entries(data.tables)) console.log(`   ${t}: ${v.count} แถว`);
console.log(`\nบันทึกเป็น ${out}\n⚠️ ไฟล์นี้ไม่ได้เข้ารหัส มีข้อมูลเงินเดือนลูกค้า — ใช้เสร็จแล้วลบทิ้ง`);
