// สำรองข้อมูล eSimPayroll (ทุกตารางใน public) → บีบอัด → เข้ารหัส → เก็บไว้ในเครื่อง (+สำเนาที่ 2 ถ้าตั้งไว้)
// รัน: node scripts/backup/backup.mjs   (Task Scheduler รันให้ทุกวันหลังตั้งค่าด้วย setup.mjs)
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import pg from 'pg';
import { loadConfig, encrypt, log, PUB_KEY } from './lib.mjs';

const PREFIX = 'esimpayroll-backup-';
const EXT = '.esb';

export async function dumpAll(dbUrl) {
  const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false }, statement_timeout: 120000 });
  await client.connect();
  try {
    await client.query('begin transaction isolation level repeatable read read only');   // ทุกตารางเป็นภาพ ณ เวลาเดียวกัน
    const { rows: tabs } = await client.query(
      `select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE' order by table_name`);
    const tables = {};
    for (const { table_name: t } of tabs) {
      const { rows } = await client.query(`select * from public."${t.replace(/"/g, '""')}"`);
      tables[t] = { count: rows.length, rows };
    }
    await client.query('commit');
    return tables;
  } finally { await client.end(); }
}

// เก็บ: ทุกไฟล์ใน N วันล่าสุด + ไฟล์แรกของแต่ละเดือนย้อนหลัง M เดือน · ลบเฉพาะไฟล์สำรองของเราในโฟลเดอร์นี้
export function prune(dir, keepDays = 30, keepMonths = 12, now = Date.now()) {
  const files = fs.readdirSync(dir).filter((f) => f.startsWith(PREFIX) && f.endsWith(EXT)).sort();
  const firstOfMonth = new Map();
  for (const f of files) { const m = f.slice(PREFIX.length, PREFIX.length + 7); if (!firstOfMonth.has(m)) firstOfMonth.set(m, f); }
  const months = [...firstOfMonth.keys()].sort().slice(-keepMonths);
  const removed = [];
  for (const f of files) {
    const d = Date.parse(f.slice(PREFIX.length, PREFIX.length + 10) + 'T00:00:00Z');
    const recent = now - d < keepDays * 864e5;
    const monthly = months.some((m) => firstOfMonth.get(m) === f);
    if (!recent && !monthly) { fs.unlinkSync(path.join(dir, f)); removed.push(f); }
  }
  return removed;
}

async function main() {
  const cfg = loadConfig();
  const started = Date.now();
  const tables = await dumpAll(cfg.db_url);
  const stamp = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 16).replace('T', '-').replace(':', '');   // เวลาไทย
  const payload = { app: 'eSimPayroll', format: 1, created_at: new Date().toISOString(), tables };
  const gz = zlib.gzipSync(Buffer.from(JSON.stringify(payload)), { level: 9 });
  const out = encrypt(gz, fs.readFileSync(PUB_KEY, 'utf8'));
  const name = `${PREFIX}${stamp}${EXT}`;
  const dirs = [cfg.out_dir, cfg.copy_dir].filter(Boolean);
  for (const dir of dirs) {
    fs.mkdirSync(dir, { recursive: true });
    const tmp = path.join(dir, name + '.tmp');
    fs.writeFileSync(tmp, out); fs.renameSync(tmp, path.join(dir, name));   // เขียนเสร็จจริงก่อนค่อยตั้งชื่อ — ไม่มีไฟล์ครึ่งๆ กลางๆ
    const removed = prune(dir, cfg.keep_days ?? 30, cfg.keep_months ?? 12);
    if (removed.length) log(`  ลบไฟล์เก่าใน ${dir}: ${removed.length} ไฟล์`);
  }
  const rows = Object.values(tables).reduce((s, t) => s + t.count, 0);
  log(`✅ สำรองสำเร็จ ${name} · ${Object.keys(tables).length} ตาราง ${rows} แถว · ${(out.length / 1024).toFixed(0)} KB · ${((Date.now() - started) / 1000).toFixed(1)} วิ → ${dirs.join(' และ ')}`);
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}` || process.argv[1].endsWith('backup.mjs')) {
  main().catch((e) => { log(`❌ สำรองไม่สำเร็จ: ${e.message}`); process.exit(1); });
}
