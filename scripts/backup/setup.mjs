// ตั้งค่าสำรองข้อมูลครั้งแรก — รันเองในเทอร์มินัล: node scripts/backup/setup.mjs
// รหัสผ่านทุกตัวพิมพ์ที่นี่เท่านั้น (ซ่อนตัวอักษร) — ไม่ต้องส่งให้ใคร
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { CONF_DIR, CONF_FILE, PUB_KEY, ask, encrypt, decrypt } from './lib.mjs';
import { dumpAll } from './backup.mjs';

const say = (s = '') => console.log(s);
const lockDown = (p) => { try { execFileSync('icacls', [p, '/inheritance:r', '/grant:r', `${os.userInfo().username}:F`], { stdio: 'ignore' }); } catch { /* ไม่ใช่ Windows */ } };

say('\n=== ตั้งค่าสำรองข้อมูล eSimPayroll ===\n');

// 1) การเชื่อมต่อฐานข้อมูล (บัญชีอ่านอย่างเดียว backup_reader จาก sql/33)
say('1) วางลิงก์เชื่อมต่อฐานข้อมูล (Supabase → Connect → Session pooler) แล้วแก้ให้เป็นบัญชี backup_reader');
say('   รูปแบบ: postgresql://backup_reader.sfzzswzyoqshlppsturd:รหัสผ่าน@aws-0-xxx.pooler.supabase.com:5432/postgres');
const dbUrl = await ask('   ลิงก์ (ตัวอักษรถูกซ่อน): ', { hidden: true });
if (!/^postgres(ql)?:\/\/backup_reader\./.test(dbUrl)) { say('❌ ต้องเป็นลิงก์ของบัญชี backup_reader (ขึ้นต้น postgresql://backup_reader.) — เริ่มใหม่อีกครั้ง'); process.exit(1); }
say('   กำลังทดสอบเชื่อมต่อ…');
let tables;
try { tables = await dumpAll(dbUrl); }
catch (e) { say(`❌ เชื่อมต่อไม่ได้: ${e.message}`); process.exit(1); }
const rows = Object.values(tables).reduce((s, t) => s + t.count, 0);
say(`   ✅ อ่านได้ ${Object.keys(tables).length} ตาราง ${rows} แถว (payroll_stores ${tables.payroll_stores?.count ?? 0} แถว)`);
if (!tables.payroll_stores?.count) say('   ⚠️ payroll_stores ว่าง — ถ้ามีลูกค้าใช้งานอยู่ แปลว่าบัญชียังอ่านข้ามสิทธิ์ไม่ได้ ตรวจผล sql/33 อีกครั้ง');

// 2) ที่เก็บไฟล์ — โฟลเดอร์ใน Google Drive (ผ่านโปรแกรม Google Drive for desktop ที่ซิงก์ขึ้นคลาวด์ให้เอง)
say('\n2) ที่เก็บไฟล์สำรอง (โฟลเดอร์ใน Google Drive)');
const drives = 'GHIJKLMNOPQRSTUVWXYZ'.split('').map((l) => `${l}:\\My Drive`).filter((p) => { try { return fs.existsSync(p); } catch { return false; } });
if (drives.length) say(`   พบ Google Drive ที่ ${drives[0]}`);
else say('   ⚠️ ยังไม่พบ Google Drive for desktop — ติดตั้งและล็อกอินก่อน แล้วรัน setup ใหม่ (หรือวางที่อยู่โฟลเดอร์เองด้านล่าง)');
say('   เปิด File Explorer → Google Drive → เข้าไปที่โฟลเดอร์ที่จะเก็บ → คลิกแถบที่อยู่ด้านบน → คัดลอกมาวาง');
let outDir = '';
while (!outDir) {
  outDir = (await ask(`   ที่อยู่โฟลเดอร์${drives[0] ? ` (เช่น ${drives[0]}\\eSimPayroll-backups)` : ''}: `)).replace(/^"|"$/g, '');
  if (outDir && !fs.existsSync(path.parse(outDir).root || outDir)) { say('   ไม่พบไดรฟ์นี้ ลองใหม่'); outDir = ''; }
}
const copyDir = '';

// 3) กุญแจเข้ารหัส
say('\n3) กุญแจเข้ารหัส');
let privateOut = null;
if (fs.existsSync(PUB_KEY) && (await ask('   มีกุญแจเดิมอยู่แล้ว ใช้ต่อไหม? [Y/n]: ')).toLowerCase() !== 'n') {
  say('   ใช้กุญแจเดิม');
} else {
  say('   ตั้ง "รหัสผ่านกุญแจ" สำหรับเปิดไฟล์สำรองตอนกู้คืน (อย่างน้อย 12 ตัว)');
  say('   ⚠️ ลืมรหัสนี้ หรือทำไฟล์กุญแจหาย = เปิดไฟล์สำรองไม่ได้อีกเลย จดเก็บไว้ในที่ปลอดภัย');
  let pass;
  for (;;) {
    pass = await ask('   รหัสผ่านกุญแจ: ', { hidden: true });
    if (pass.length < 12) { say('   สั้นไป ต้องอย่างน้อย 12 ตัว'); continue; }
    if ((await ask('   พิมพ์ซ้ำอีกครั้ง: ', { hidden: true })) !== pass) { say('   ไม่ตรงกัน ลองใหม่'); continue; }
    break;
  }
  say('   กำลังสร้างกุญแจ (RSA 4096 บิต)…');
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 4096,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem', cipher: 'aes-256-cbc', passphrase: pass },
  });
  // ทดสอบไปกลับก่อนบันทึก
  const probe = crypto.randomBytes(64);
  if (!decrypt(encrypt(probe, publicKey), privateKey, pass).equals(probe)) throw new Error('ทดสอบกุญแจไม่ผ่าน');
  fs.mkdirSync(CONF_DIR, { recursive: true });
  fs.writeFileSync(PUB_KEY, publicKey);
  privateOut = path.join(os.homedir(), 'Desktop', 'eSimPayroll-กุญแจกู้คืน-เก็บแยก.pem');
  fs.writeFileSync(privateOut, privateKey);
  say(`   ✅ สร้างกุญแจแล้ว`);
}

// 4) บันทึกค่าตั้ง (เฉพาะผู้ใช้ Windows นี้อ่านได้)
fs.mkdirSync(CONF_DIR, { recursive: true });
fs.writeFileSync(CONF_FILE, JSON.stringify({ db_url: dbUrl, out_dir: outDir, copy_dir: copyDir || null, keep_days: 30, keep_months: 12 }, null, 2));
lockDown(CONF_DIR);
say(`\n4) บันทึกค่าตั้งไว้ที่ ${CONF_FILE} (เฉพาะผู้ใช้ ${os.userInfo().username} อ่านได้)`);

// 5) สำรองครั้งแรกทันที
say('\n5) สำรองครั้งแรก…');
const here = path.dirname(fileURLToPath(import.meta.url));
try { execFileSync(process.execPath, [path.join(here, 'backup.mjs')], { stdio: 'inherit' }); }
catch { say('❌ สำรองครั้งแรกไม่สำเร็จ — ดูข้อความด้านบน'); process.exit(1); }

// 6) ตั้งเวลารันทุกวัน
say('\n6) ตั้งเวลาให้สำรองอัตโนมัติทุกวัน 12:30 น. (ถ้าเครื่องปิดอยู่ จะรันทันทีที่เปิดเครื่องครั้งถัดไป)');
if ((await ask('   ตั้งเวลาเลยไหม? [Y/n]: ')).toLowerCase() !== 'n') {
  const ps = `$a=New-ScheduledTaskAction -Execute '${process.execPath}' -Argument '"${path.join(here, 'backup.mjs')}"' -WorkingDirectory '${path.resolve(here, '..', '..')}';` +
    `$t=New-ScheduledTaskTrigger -Daily -At 12:30;` +
    `$s=New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 30) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries;` +
    `Register-ScheduledTask -TaskName 'eSimPayroll Backup' -Action $a -Trigger $t -Settings $s -Description 'สำรองข้อมูล eSimPayroll แบบเข้ารหัส (scripts/backup)' -Force | Out-Null`;
  try { execFileSync('powershell', ['-NoProfile', '-Command', ps], { stdio: 'inherit' }); say('   ✅ ตั้งเวลาแล้ว (ดู/แก้ได้ใน Task Scheduler → eSimPayroll Backup)'); }
  catch { say('   ❌ ตั้งเวลาไม่สำเร็จ — รันสำรองเองได้ด้วย: node scripts/backup/backup.mjs'); }
}

say('\n=== เสร็จแล้ว ===');
if (privateOut) {
  say(`\n🔑 สำคัญมาก: ไฟล์กุญแจกู้คืนอยู่ที่\n   ${privateOut}`);
  say('   1) คัดลอกไปเก็บใน USB หรือที่ปลอดภัยนอกเครื่องนี้ (อย่างน้อย 2 ที่)');
  say('   2) แล้ว "ลบไฟล์นี้ออกจาก Desktop" — เครื่องนี้ไม่จำเป็นต้องมีกุญแจปลดล็อก');
  say('   3) จดรหัสผ่านกุญแจเก็บแยกจากไฟล์กุญแจ');
}
