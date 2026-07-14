/**
 * supabase.js
 * ----------------------------------------------------------------------------
 * Satu-satunya tempat inisialisasi Supabase Client di seluruh aplikasi.
 * SEMUA file lain (api.js, main.js, ui.js) WAJIB mengimpor `supabase` dari
 * file ini — jangan pernah membuat createClient() di tempat lain.
 *
 * CARA MENGGANTI URL / ANON KEY:
 *   1. Buka project Supabase kamu -> Project Settings -> API.
 *   2. Salin "Project URL" ke SUPABASE_URL di bawah ini.
 *   3. Salin "anon public" key ke SUPABASE_ANON_KEY di bawah ini.
 *   Lihat README.md bagian "Cara Mengambil URL & Anon Key" untuk panduan
 *   bergambar langkah demi langkah.
 *
 * CATATAN KEAMANAN:
 *   Anon key AMAN untuk ditaruh di frontend (dibaca browser) selama Row Level
 *   Security (RLS) sudah diaktifkan di setiap tabel — lihat schema.sql.
 *   Jangan pernah menaruh "service_role key" di sini.
 * ----------------------------------------------------------------------------
 */

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// ==== GANTI DUA NILAI DI BAWAH INI DENGAN MILIK PROJECT SUPABASE-MU ====
const SUPABASE_URL = 'https://flyosefdtyinuyzctiqz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZseW9zZWZkdHlpbnV5emN0aXF6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5ODk0ODAsImV4cCI6MjA5OTU2NTQ4MH0.NIisxFpnNPGoxGZMdoL9HGCKmUrdpNoa6PDlfJ5WS70';
// =========================================================================

if (SUPABASE_URL.includes('MASUKKAN-PROJECT-ID') || SUPABASE_ANON_KEY.includes('MASUKKAN_ANON_KEY')) {
  // Peringatan tidak menghentikan aplikasi, tapi memberi tahu developer di console
  // bahwa kredensial belum diisi. UI akan menampilkan error saat mencoba konek.
  console.warn(
    '[supabase.js] SUPABASE_URL / SUPABASE_ANON_KEY belum diisi. ' +
    'Buka js/supabase.js dan isi dengan kredensial project Supabase-mu.'
  );
}

/** @type {import('@supabase/supabase-js').SupabaseClient} */
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
