# HK Checklist Pro — Vercel + Supabase

1. **Frontend**: salin `index.html` lama (GAS) ke `public/index.html`, lalu tambahkan **satu baris** tepat sebelum `<script>` utama:
   `<script src="/gas-shim.js"></script>`
   (shim mengganti `google.script.run` → `POST /api/server`, sehingga seluruh UI tetap jalan.)
2. **Supabase**: buat project → SQL Editor → jalankan `supabase/schema.sql`.
3. **Env**: salin `.env.example` ke `.env.local`, isi URL & service-role key (Project Settings → API).
4. `npm i && npm run seed -- admin@hotel.com PasswordKuat123 && npm run dev`
5. **GitHub**: `git init && git add . && git commit -m "init" && git branch -M main && git remote add origin <repo> && git push -u origin main`
6. **Vercel**: Import repo → tambahkan env `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `STORAGE_BUCKET` → Deploy.
