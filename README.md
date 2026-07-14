# Keboen Arsena — Dashboard (Supabase Edition)

Dashboard manajemen hidroponik selada keriting (Batch Tanam, Pengeluaran,
Penjualan, Rencana Anggaran, Hutang Tempo) — 100% berjalan di atas
**Supabase** (Postgres + Auth + Realtime), tanpa Firebase sama sekali.

Tampilan (UI/UX, warna, layout, animasi) **tidak diubah sama sekali**.
Yang diubah hanyalah backend, struktur file, dan integrasi database.

---

## 1. Struktur Folder

```
keboen-arsena/
├── index.html          <- Halaman utama (markup + memuat CSS & JS)
├── schema.sql           <- SQL lengkap: tabel, constraint, index, RLS
├── README.md             <- Dokumen ini
├── css/
│   └── style.css        <- Seluruh styling (dipindah apa adanya dari <style>)
└── js/
    ├── supabase.js       <- Inisialisasi Supabase Client (SATU-SATUNYA tempat)
    ├── api.js            <- Semua query Supabase: CRUD, auth, realtime
    ├── ui.js              <- Render tabel/kartu, navigasi, modal, badge
    ├── utils.js           <- Helper murni: format tanggal/uang, toast, dsb.
    └── main.js            <- State global, business logic, bootstrap app
```

---

## 2. Cara Membuat Project Supabase

1. Buka **https://supabase.com** → Sign in / Sign up.
2. Klik **New Project**.
3. Isi:
   - **Name**: bebas, misal `keboen-arsena`
   - **Database Password**: buat password kuat, simpan baik-baik
   - **Region**: pilih yang paling dekat (mis. Singapore untuk Indonesia)
4. Tunggu ± 1-2 menit sampai project selesai di-provision.

## 3. Cara Menjalankan SQL (schema.sql)

1. Di dashboard project Supabase, buka menu **SQL Editor** (ikon `</>`  di
   sidebar kiri).
2. Klik **New query**.
3. Buka file `schema.sql` dari project ini, salin **seluruh isinya**.
4. Tempel ke SQL Editor, lalu klik **Run** (atau `Ctrl/Cmd + Enter`).
5. Pastikan muncul pesan `Success. No rows returned`. Ini akan membuat:
   - Tabel `batches`, `rencana`, `expenses`, `sales`, `saldo`
   - Primary key, foreign key, default value, check constraint, index
   - Row Level Security (RLS) + policy untuk setiap tabel
   - Mengaktifkan Realtime untuk kelima tabel tersebut

> Jika muncul error `"relation ... is already member of publication"` saat
> bagian realtime dijalankan ulang, itu **aman diabaikan** — artinya sudah
> pernah diaktifkan sebelumnya.

### Menambahkan User Login Pertama

Karena aplikasi ini memakai **Supabase Auth**, kamu perlu membuat minimal
satu user untuk bisa login:

1. Buka menu **Authentication → Users** di dashboard Supabase.
2. Klik **Add user** → **Create new user**.
3. Isi email & password, lalu **jangan** centang "Auto Confirm User" jika
   ingin verifikasi email, atau **centang** jika ingin langsung bisa login
   tanpa verifikasi (paling praktis untuk dipakai sendiri/keluarga).
4. Gunakan email & password tersebut untuk login di aplikasi.

---

## 4. Cara Mengambil Project URL

1. Di dashboard Supabase, buka **Project Settings** (ikon gerigi) →  **API**.
2. Salin nilai di kolom **Project URL** (formatnya:
   `https://xxxxxxxxxxxx.supabase.co`).

## 5. Cara Mengambil Anon Key

1. Di halaman yang sama (**Project Settings → API**), scroll ke bagian
   **Project API keys**.
2. Salin nilai **`anon` `public`** key (JANGAN salin `service_role` key —
   itu rahasia dan tidak boleh dipakai di frontend).

## 6. Memasukkan URL & Anon Key ke Aplikasi

Buka `js/supabase.js`, lalu ganti dua baris berikut dengan milikmu:

```js
const SUPABASE_URL = 'https://MASUKKAN-PROJECT-ID.supabase.co';
const SUPABASE_ANON_KEY = 'MASUKKAN_ANON_KEY_DI_SINI';
```

Simpan file. Selesai — **hanya file ini** yang perlu diedit untuk konfigurasi
koneksi database, tidak ada kredensial yang di-hardcode di tempat lain.

---

## 7. Menjalankan Project Secara Lokal

Karena `index.html` memuat JavaScript sebagai **ES Module**
(`<script type="module">`), file **tidak bisa dibuka langsung** lewat
`file://` di browser (module butuh server HTTP). Jalankan salah satu:

```bash
# Opsi 1: Python (built-in di banyak sistem)
python3 -m http.server 8080

# Opsi 2: Node.js
npx serve .

# Opsi 3: VS Code
# Install extension "Live Server", klik kanan index.html -> "Open with Live Server"
```

Lalu buka `http://localhost:8080` (atau port yang ditampilkan) di browser.

---

## 8. Cara Deploy

Project ini adalah aplikasi statis (HTML/CSS/JS murni, tanpa build step),
jadi bisa langsung di-deploy ke berbagai platform:

### Vercel
1. Push folder ini ke repo GitHub.
2. Di **vercel.com** → **Add New Project** → pilih repo.
3. Framework preset: **Other** (tidak perlu build command).
4. Klik **Deploy**.

### Netlify
1. Push ke GitHub, atau langsung **drag & drop** folder `keboen-arsena/`
   ke **app.netlify.com/drop**.
2. Tidak perlu build command — Netlify akan menyajikan file statis apa
   adanya.

### Cloudflare Pages
1. **dash.cloudflare.com → Workers & Pages → Create → Pages → Connect to Git**.
2. Build command: kosongkan. Output directory: `/` (root).

### GitHub Pages
1. Push ke repo GitHub.
2. **Settings → Pages → Source**: pilih branch `main`, folder `/ (root)`.
3. Situs akan tersedia di `https://<username>.github.io/<repo>/`.

Tidak ada satupun langkah di atas yang memerlukan Firebase atau konfigurasi
server tambahan — cukup file statis + kredensial Supabase di `supabase.js`.

---

## 9. Menambah Tabel Baru

Contoh: menambah tabel `catatan_harian`.

1. Tambahkan `CREATE TABLE` baru di `schema.sql` mengikuti pola tabel yang
   sudah ada (kolom `id`, `user_id` dengan `default auth.uid()`, kolom data,
   `"createdAt"`).
2. Tambahkan index yang relevan (`CREATE INDEX ...`).
3. Aktifkan RLS: `ALTER TABLE public.catatan_harian ENABLE ROW LEVEL SECURITY;`
4. Buat 4 policy (select/insert/update/delete) seperti pola tabel lain,
   dengan `using (user_id = auth.uid())`.
5. (Opsional) Tambahkan ke realtime:
   `ALTER PUBLICATION supabase_realtime ADD TABLE public.catatan_harian;`
6. Jalankan ulang query tersebut di **SQL Editor**.
7. Di `js/main.js`, tambahkan tabel baru ke `Promise.all([...])` pada
   `loadInitialData()`, dan ke daftar `tables` di `subscribeAllRealtime()`.
8. Gunakan `api.fetchAll`, `api.insertRow`, `api.updateRow`, `api.deleteRow`
   yang sudah generik — tidak perlu menulis query Supabase baru, cukup
   panggil dengan nama tabel baru sebagai parameter.

---

## 10. Arsitektur Singkat

- **Autentikasi**: Supabase Auth (email/password). Sesi tersimpan otomatis
  di browser (`persistSession: true`) dan dipulihkan saat halaman di-reload
  (`getSession()` di `main.js`). Perubahan status login dipantau lewat
  `onAuthStateChange`.
- **Keamanan data**: setiap tabel memakai Row Level Security — user hanya
  bisa membaca/mengubah/menghapus baris miliknya sendiri (`user_id = auth.uid()`),
  dijamin di level database, bukan hanya di frontend.
- **Realtime**: setiap perubahan (insert/update/delete) pada tabel utama
  otomatis dipantulkan ke semua tab/perangkat yang sedang login lewat
  `supabase.channel(...).on('postgres_changes', ...)`, sehingga dashboard
  selalu sinkron tanpa perlu refresh manual.
- **Error handling**: semua pemanggilan Supabase dibungkus `try/catch` di
  `api.js` dan mengembalikan `{ data, error }` yang konsisten. Bila gagal,
  pengguna melihat toast merah berisi pesan error, status sinkronisasi di
  sidebar berubah menjadi merah ("error"), dan aplikasi tetap bisa dipakai
  (tidak crash).

---

## 11. Catatan Migrasi dari Versi Sebelumnya

- Kredensial Supabase sebelumnya di-hardcode langsung di dalam satu file
  HTML besar (`supabaseUrl` / `supabaseKey` di tengah `<script>`). Sekarang
  terpusat di satu tempat: `js/supabase.js`.
- Ditemukan **kode mati sisa integrasi Firestore lama** pada fungsi
  penyimpanan saldo (memanggil `setDoc`, `doc`, variabel `db`/`currentUser`/
  `appId` yang tidak pernah didefinisikan — sehingga fitur "Atur Saldo Awal"
  sebenarnya **tidak pernah benar-benar tersimpan ke server** di versi
  sebelumnya). Ini sudah diperbaiki: saldo kini disimpan lewat tabel
  `public.saldo` dengan `upsert` yang sesungguhnya.
- Nomor batch (`#1`, `#2`, dst.) sebelumnya memakai kolom `id` yang sama
  dengan primary key auto-generate Supabase — berisiko bentrok. Sekarang
  dipisah: `id` (primary key asli, auto) dan `batch_no` (nomor urut yang
  ditampilkan ke pengguna), dengan constraint `UNIQUE (user_id, batch_no)`.
