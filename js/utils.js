/**
 * utils.js
 * ----------------------------------------------------------------------------
 * Kumpulan fungsi bantu murni (formatting tanggal/uang, toast, dsb).
 * Tidak ada logika Supabase di file ini.
 * ----------------------------------------------------------------------------
 */

/** Menambahkan n hari ke tanggal s, mengembalikan objek Date. */
export const addDays = (s, n) => {
  const d = new Date(s);
  d.setDate(d.getDate() + n);
  return d;
};

/** Format tanggal ke gaya Indonesia: "14 Jul 2026". */
export const fmt = (d) => {
  if (!d) return '—';
  return (typeof d === 'string' ? new Date(d) : d).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};

/** Format angka ke Rupiah: "Rp 150.000". */
export const fmtRp = (n) => 'Rp ' + Math.round(n || 0).toLocaleString('id-ID');

/** Tanggal hari ini dalam format YYYY-MM-DD. */
export const today = () => new Date().toISOString().split('T')[0];

/** Selisih hari antara tanggal s dan hari ini (positif = di masa depan). */
export const daysDiff = (s) => {
  const d = new Date(s);
  const n = new Date();
  n.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.round((d - n) / 86400000);
};

/** Menampilkan notifikasi toast singkat di pojok layar. */
export function toast(msg, type = '') {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.className = type === 'error' ? 'show error' : 'show';
  setTimeout(() => (t.className = ''), 3500);
}

/**
 * Memperbarui indikator status sinkronisasi di sidebar.
 * @param {'online'|'offline'|'error'|'loading'} state
 * @param {string} text
 */
export function setSyncStatus(state, text) {
  const dot = document.getElementById('syncDot');
  const txt = document.getElementById('syncText');
  if (!dot || !txt) return;
  dot.className = 'sync-dot' + (state === 'offline' ? ' offline' : state === 'error' ? ' error' : '');
  txt.textContent = text;
}

/** Menaik/turunkan nilai input number stepper (dipakai tombol +/-). */
export function adjustCounter(id, step) {
  const el = document.getElementById(id);
  if (!el) return;
  el.value = Math.max(0, Math.round(((parseFloat(el.value) || 0) + step) * 10) / 10);
  el.dispatchEvent(new Event('input'));
}
