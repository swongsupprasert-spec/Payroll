# ระบบเงินเดือน Payroll (Supabase + Vercel)

เว็บแอปเงินเดือน แบบมีระบบล็อกอิน เก็บข้อมูลบนคลาวด์ (Supabase) แยกตามผู้ใช้

## โครงสร้าง
- `index.html` — ตัวโปรแกรม (มีชั้นล็อกอิน + ซิงก์คลาวด์ในตัว)
- `Payroll-tutorial.html` — วิดีโอสอนใช้งาน (16:9 + เสียงพากย์ไทย)
- `supabase-schema.sql` — สคีมาฐานข้อมูล (รันครั้งเดียวใน Supabase)
- `vercel.json` — ตั้งค่า deploy

---

## ขั้นตอน Deploy (ทำครั้งเดียว)

### 1) ตั้งค่า Supabase
1. เข้า https://sfzzswzyoqshlppsturd.supabase.co → **SQL Editor**
2. วางเนื้อหาไฟล์ `supabase-schema.sql` ทั้งหมด → **Run** (สร้างตาราง `payroll_stores` + RLS)
3. ไปที่ **Project Settings → API** คัดลอก **Project URL** และ **anon / publishable key**
4. เปิด `index.html` แก้บรรทัด:
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
