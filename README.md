# ระบบเงินเดือน Payroll (Supabase + Vercel)

เว็บแอปเงินเดือน แบบมีระบบล็อกอิน เก็บข้อมูลบนคลาวด์ (Supabase) แยกตามผู้ใช้

## โครงสร้าง
- `app.html` — โครงหน้าตัวโปรแกรม (มีชั้นล็อกอิน + ซิงก์คลาวด์ในตัว) · `checkin.html` — หน้าลงเวลาผ่านมือถือของพนักงาน
- `assets/app/` — โค้ดของโปรแกรม แยกตามเมนู (`01-core.js` สูตรเงินเดือน … `16-cloud-boot.js` เริ่มระบบ) + `app.css`
  **ไฟล์โหลดตามเลขลำดับและพึ่งกัน** — ฟังก์ชันที่เรียกตอนโหลดหน้าต้องอยู่ในไฟล์เลขเดียวกันหรือน้อยกว่า
- `index.html`, `pricing.html`, `article-*.html` ฯลฯ — หน้าเว็บสาธารณะ
- `partials/` — เมนูบน/ส่วนท้ายที่ใช้ร่วมทุกหน้า → แก้แล้วรัน `npm run build:partials`
- `assets/css/` — CSS ที่ใช้ร่วมกัน (บทความ / หน้าทั่วไป)
- `sql/` — ไฟล์ SQL ของ Supabase เรียงตามลำดับที่ต้องรัน (ดู `sql/README.md`)
- `supabase/functions/` — Edge Functions
- `api/line-webhook.mjs` — บอทตอบอัตโนมัติใน LINE OA @esimpayroll (ฟรี: reply message + ตอบจากคลังความรู้ ไม่ใช้ AI ภายนอก)
  คลังความรู้ `api/_kb.json` สร้างจาก FAQ / บทความ / ตารางราคาบนเว็บ → แก้เนื้อหาแล้วรัน `npm run build:bot`
  ต้องตั้ง env ใน Vercel: `LINE_CHANNEL_SECRET`, `LINE_CHANNEL_ACCESS_TOKEN`
- `tests/` — ทดสอบสูตรเงินเดือน (`payroll.test.mjs`) และตัวเลขในเอกสารราชการ กท.20 ก / สปส.1-10 / 50 ทวิ / ภ.ง.ด.1 (`documents.test.mjs`) และบอท LINE (`bot.test.mjs`) → `npm test`
- `motion*.html` — หน้าสำหรับเรนเดอร์วิดีโอโปรโมต (ไม่ขึ้นเว็บ)
- `vercel.json` — ตั้งค่า deploy · `.vercelignore` — ไฟล์ที่ไม่ขึ้นเว็บ

---

## ขั้นตอน Deploy (ทำครั้งเดียว)

### 1) ตั้งค่า Supabase
1. เข้า https://sfzzswzyoqshlppsturd.supabase.co → **SQL Editor**
2. รันไฟล์ในโฟลเดอร์ `sql/` ทีละไฟล์ตามเลขลำดับ ตั้งแต่ `01-supabase-schema.sql` (สร้างตาราง `payroll_stores` + RLS) จนถึงไฟล์สุดท้าย — รายละเอียดแต่ละไฟล์อยู่ใน `sql/README.md`
3. ไปที่ **Project Settings → API** คัดลอก **Project URL** และ **anon / publishable key**
4. เปิด `app.html` แก้บรรทัด:
   ```js
   const SB_ANON='__PASTE_SUPABASE_ANON_KEY_HERE__';
   ```
   วาง anon key แทนข้อความ `__PASTE...__` (URL ตั้งไว้ให้แล้ว)
5. (แนะนำ) Supabase → **Authentication → Providers → Email** เปิดใช้งาน
   - ปิด "Confirm email" ได้ถ้าอยากให้สมัครแล้วเข้าใช้ได้เลย

### 2) ขึ้น GitHub
```bash
git remote add origin https://github.com/<username>/<repo>.git
git branch -M main
git push -u origin main
```

### 3) Deploy บน Vercel
- เข้า https://vercel.com → **Add New → Project** → เลือก repo นี้
- Framework preset: **Other** (เป็น static ไม่ต้อง build)
- กด **Deploy** → ได้ URL ใช้งานทันที

> หรือใช้ CLI: `vercel login` แล้ว `vercel --prod`

---

## หมายเหตุ
- anon key เปิดเผยใน frontend ได้ (ความปลอดภัยมาจาก Row-Level Security ที่ตั้งไว้)
- ข้อมูลของแต่ละผู้ใช้แยกกันด้วย RLS — เห็นเฉพาะของตัวเอง
- ข้อมูลเงินเดือนเป็นข้อมูลอ่อนไหว (PDPA) ควรมีนโยบายความเป็นส่วนตัวก่อนเปิดใช้จริง
