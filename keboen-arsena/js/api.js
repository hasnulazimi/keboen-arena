/**
 * api.js
 * ----------------------------------------------------------------------------
 * SEMUA komunikasi dengan Supabase (query database, auth, realtime) hidup
 * di file ini. Modul lain (main.js, ui.js) tidak boleh memanggil `supabase`
 * secara langsung — mereka memanggil fungsi-fungsi di file ini.
 *
 * Setiap fungsi query mengembalikan objek konsisten: { data, error }
 * sehingga pemanggil selalu tahu cara menangani hasilnya tanpa exception
 * tak terduga (try/catch tetap dipakai untuk error jaringan/tak terduga).
 * ----------------------------------------------------------------------------
 */

import { supabase } from './supabase.js';

// ============================================================================
// AUTHENTICATION
// ============================================================================

/**
 * Login dengan email & password.
 * @returns {Promise<{data:object|null, error:string|null}>}
 */
export async function signIn(email, password) {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { data: null, error: error.message };
    return { data, error: null };
  } catch (e) {
    console.error('[api.signIn]', e);
    return { data: null, error: 'Tidak bisa terhubung ke server. Periksa koneksi internet.' };
  }
}

/** Logout dari sesi saat ini. */
export async function signOut() {
  try {
    const { error } = await supabase.auth.signOut();
    if (error) return { error: error.message };
    return { error: null };
  } catch (e) {
    console.error('[api.signOut]', e);
    return { error: 'Gagal logout, coba lagi.' };
  }
}

/** Mengambil sesi aktif saat ini (dipakai untuk session restore saat reload). */
export async function getSession() {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) return { data: null, error: error.message };
    return { data: data.session, error: null };
  } catch (e) {
    console.error('[api.getSession]', e);
    return { data: null, error: 'Gagal memuat sesi.' };
  }
}

/**
 * Mendaftarkan callback saat status auth berubah (login/logout/token refresh).
 * @param {(event:string, session:object|null)=>void} callback
 * @returns {{unsubscribe: Function}}
 */
export function onAuthStateChange(callback) {
  const { data } = supabase.auth.onAuthStateChange((event, session) => callback(event, session));
  return data.subscription;
}

// ============================================================================
// GENERIC CRUD — dipakai oleh semua tabel (batches, expenses, sales, rencana)
// ============================================================================

/**
 * Mengambil seluruh baris milik user yang sedang login dari sebuah tabel.
 * RLS di Supabase otomatis membatasi hasil hanya milik user_id = auth.uid(),
 * tapi kita tetap eksplisit agar query jelas dan bisa memakai index.
 * @param {string} table
 * @param {{orderBy?:string, ascending?:boolean}} [opts]
 */
export async function fetchAll(table, opts = {}) {
  try {
    let query = supabase.from(table).select('*');
    if (opts.orderBy) query = query.order(opts.orderBy, { ascending: !!opts.ascending });
    const { data, error } = await query;
    if (error) return { data: null, error: error.message };
    return { data: data || [], error: null };
  } catch (e) {
    console.error(`[api.fetchAll:${table}]`, e);
    return { data: null, error: 'Gagal memuat data. Periksa koneksi internet Anda.' };
  }
}

/**
 * Insert satu baris baru. user_id otomatis diisi lewat default auth.uid()
 * di database, jadi tidak perlu dikirim dari client.
 * @param {string} table
 * @param {object} payload
 */
export async function insertRow(table, payload) {
  try {
    const row = { ...payload, createdAt: new Date().toISOString() };
    const { data, error } = await supabase.from(table).insert([row]).select();
    if (error) return { data: null, error: error.message };
    return { data: data[0], error: null };
  } catch (e) {
    console.error(`[api.insertRow:${table}]`, e);
    return { data: null, error: 'Gagal menyimpan data ke server.' };
  }
}

/**
 * Update satu baris berdasarkan id.
 * @param {string} table
 * @param {number|string} id
 * @param {object} payload
 */
export async function updateRow(table, id, payload) {
  try {
    const { data, error } = await supabase.from(table).update(payload).eq('id', id).select();
    if (error) return { data: null, error: error.message };
    return { data: data[0], error: null };
  } catch (e) {
    console.error(`[api.updateRow:${table}]`, e);
    return { data: null, error: 'Gagal memperbarui data.' };
  }
}

/**
 * Hapus satu baris berdasarkan id.
 * @param {string} table
 * @param {number|string} id
 */
export async function deleteRow(table, id) {
  try {
    const { error } = await supabase.from(table).delete().eq('id', id);
    if (error) return { error: error.message };
    return { error: null };
  } catch (e) {
    console.error(`[api.deleteRow:${table}]`, e);
    return { error: 'Gagal menghapus data.' };
  }
}

// ============================================================================
// SALDO — tabel khusus 1 baris per user (upsert, bukan insert biasa)
// ============================================================================

/** Mengambil saldo awal milik user yang sedang login (bisa null jika belum diatur). */
export async function fetchSaldo() {
  try {
    const { data, error } = await supabase.from('saldo').select('*').maybeSingle();
    if (error) return { data: null, error: error.message };
    return { data, error: null };
  } catch (e) {
    console.error('[api.fetchSaldo]', e);
    return { data: null, error: 'Gagal memuat saldo.' };
  }
}

/**
 * Simpan/perbarui saldo awal (upsert berdasarkan user_id sebagai primary key).
 * @param {{amount:number, note:string, updatedAt:string}} payload
 */
export async function upsertSaldo(payload) {
  try {
    const { data: userData } = await supabase.auth.getUser();
    const user_id = userData?.user?.id;
    const { data, error } = await supabase
      .from('saldo')
      .upsert([{ user_id, ...payload }], { onConflict: 'user_id' })
      .select();
    if (error) return { data: null, error: error.message };
    return { data: data[0], error: null };
  } catch (e) {
    console.error('[api.upsertSaldo]', e);
    return { data: null, error: 'Gagal menyimpan saldo.' };
  }
}

// ============================================================================
// REALTIME
// ============================================================================

/**
 * Berlangganan perubahan realtime (insert/update/delete) pada sebuah tabel
 * lewat postgres_changes, supaya data di dashboard update otomatis tanpa
 * perlu refresh manual — misalnya saat diubah dari device/tab lain.
 * @param {string} table
 * @param {(payload: object) => void} onChange
 * @returns {import('@supabase/supabase-js').RealtimeChannel}
 */
export function subscribeRealtime(table, onChange) {
  return supabase
    .channel(`realtime:${table}`)
    .on('postgres_changes', { event: '*', schema: 'public', table }, (payload) => onChange(payload))
    .subscribe();
}

/** Berhenti berlangganan sebuah channel realtime. */
export function unsubscribeRealtime(channel) {
  if (channel) supabase.removeChannel(channel);
}
