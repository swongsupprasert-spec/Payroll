// ตัวช่วยร่วมของระบบสำรองข้อมูล: ที่เก็บค่าตั้ง, การเข้ารหัสแบบกุญแจคู่, ถามรหัสแบบซ่อนตัวอักษร
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import readline from 'node:readline';

// ค่าตั้งและกุญแจล็อกเก็บนอก repo (ในโปรไฟล์ผู้ใช้ Windows) — ไม่ขึ้น GitHub ไม่ขึ้นเว็บ
export const CONF_DIR = path.join(os.homedir(), '.esim-backup');
export const CONF_FILE = path.join(CONF_DIR, 'config.json');
export const PUB_KEY = path.join(CONF_DIR, 'public-key.pem');
export const LOG_FILE = path.join(CONF_DIR, 'backup.log');

export function loadConfig() {
  if (!fs.existsSync(CONF_FILE)) throw new Error(`ยังไม่ได้ตั้งค่า — รัน: node scripts/backup/setup.mjs`);
  return JSON.parse(fs.readFileSync(CONF_FILE, 'utf8'));
}

/* ไฟล์สำรองเข้ารหัสแบบ "กุญแจคู่":
   - ทุกไฟล์สุ่มกุญแจ AES-256-GCM ใหม่ แล้วล็อกกุญแจนั้นด้วยกุญแจสาธารณะ RSA (RSA-OAEP-SHA256)
   - เครื่องที่สำรองมีแค่กุญแจล็อก (public) → เปิดอ่านไฟล์ของตัวเองไม่ได้ ต้องใช้กุญแจปลดล็อก (private + รหัสผ่าน) ที่คุณเก็บแยก
   รูปแบบไฟล์: "ESIMBK1\n" + JSON หัวไฟล์ 1 บรรทัด + ข้อมูลที่เข้ารหัส */
const MAGIC = 'ESIMBK1\n';
export function encrypt(buf, publicPem) {
  const key = crypto.randomBytes(32), iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([c.update(buf), c.final()]);
  const head = {
    alg: 'RSA-OAEP-256+AES-256-GCM',
    key: crypto.publicEncrypt({ key: publicPem, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, key).toString('base64'),
    iv: iv.toString('base64'), tag: c.getAuthTag().toString('base64'),
  };
  return Buffer.concat([Buffer.from(MAGIC + JSON.stringify(head) + '\n'), body]);
}
export function decrypt(file, privatePem, passphrase) {
  const s = file.indexOf(10, MAGIC.length);
  if (file.subarray(0, MAGIC.length).toString() !== MAGIC || s < 0) throw new Error('ไม่ใช่ไฟล์สำรองของ eSimPayroll');
  const head = JSON.parse(file.subarray(MAGIC.length, s).toString());
  const key = crypto.privateDecrypt({ key: privatePem, passphrase, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
    Buffer.from(head.key, 'base64'));
  const d = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(head.iv, 'base64'));
  d.setAuthTag(Buffer.from(head.tag, 'base64'));
  return Buffer.concat([d.update(file.subarray(s + 1)), d.final()]);   // ไฟล์ถูกแก้/เสีย → final() โยน error
}

// ถามข้อความ (hidden = ไม่แสดงตัวอักษรที่พิมพ์ — ใช้กับรหัสผ่าน)
export function ask(q, { hidden = false } = {}) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) rl._writeToOutput = (s) => { if (s.includes(q)) rl.output.write(s); else if (!s.includes('\n')) rl.output.write('*'); };
    rl.question(q, (a) => { rl.close(); if (hidden) process.stdout.write('\n'); resolve(a.trim()); });
  });
}

export function log(line) {
  const t = new Date().toISOString();
  try { fs.mkdirSync(CONF_DIR, { recursive: true }); fs.appendFileSync(LOG_FILE, `${t} ${line}\n`); } catch { /* ไม่ให้ log ทำให้สำรองล้ม */ }
  console.log(line);
}
