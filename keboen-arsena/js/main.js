/**
 * main.js
 * ----------------------------------------------------------------------------
 * Entry point aplikasi. Berisi:
 *   - `state`  : state global aplikasi (di-export supaya ui.js bisa membaca)
 *   - alur init: cek sesi login -> muat data -> render -> berlangganan realtime
 *   - seluruh "business logic" (simpan batch, catat pengeluaran, dst.) yang
 *     menggabungkan panggilan api.js + pembaruan state + render ulang UI.
 * ----------------------------------------------------------------------------
 */

import * as api from './api.js';
import { toast, setSyncStatus, today, addDays } from './utils.js';
import {
  renderAll,
  renderKeuangan,
  renderRencana,
  showLoginScreen,
  showApp,
  tick,
} from './ui.js';

// ============================================================================
// STATE GLOBAL
// ============================================================================

export const state = {
  batches: [],
  expenses: [],
  sales: [],
  rencana: [],
  saldo: { amount: 0, note: '', updatedAt: null },
  batchCounter: 0,
  pindahTarget: null,
  harvestTarget: null,
  keuTab: 'general',
};

let realtimeChannels = [];

// ============================================================================
// INIT / BOOTSTRAP
// ============================================================================

async function boot() {
  tick();
  setInterval(tick, 1000);

  window.addEventListener('offline', () => setSyncStatus('offline', 'Tidak ada koneksi internet'));
  window.addEventListener('online', () => setSyncStatus('online', 'Tersambung kembali…'));

  const { data: session } = await api.getSession();
  if (session) {
    await startApp(session.user);
  } else {
    showLoginScreen();
  }

  // Pantau perubahan status login (login di tab lain, token expired, dsb.)
  api.onAuthStateChange(async (event, session2) => {
    if (event === 'SIGNED_IN' && session2) {
      await startApp(session2.user);
    } else if (event === 'SIGNED_OUT') {
      teardownRealtime();
      showLoginScreen();
    }
  });
}

async function startApp(user) {
  showApp(user.email);
  setSyncStatus('loading', 'Menyinkronkan Data...');
  await loadInitialData();
  subscribeAllRealtime();
}

/** Mengambil seluruh data awal dari Supabase (dipanggil sekali saat login/reload). */
async function loadInitialData() {
  try {
    const [resBatches, resExpenses, resSales, resRencana, resSaldo] = await Promise.all([
      api.fetchAll('batches', { orderBy: 'batch_no', ascending: false }),
      api.fetchAll('expenses', { orderBy: 'createdAt', ascending: false }),
      api.fetchAll('sales', { orderBy: 'createdAt', ascending: false }),
      api.fetchAll('rencana', { orderBy: 'createdAt', ascending: false }),
      api.fetchSaldo(),
    ]);

    const anyError = resBatches.error || resExpenses.error || resSales.error || resRencana.error || resSaldo.error;
    if (anyError) throw new Error(anyError);

    state.batches = (resBatches.data || []).map((d) => ({ ...d, _id: d.id }));
    state.expenses = (resExpenses.data || []).map((d) => ({ ...d, _id: d.id }));
    state.sales = (resSales.data || []).map((d) => ({ ...d, _id: d.id }));
    state.rencana = (resRencana.data || []).map((d) => ({ ...d, _id: d.id }));
    state.saldo = resSaldo.data || { amount: 0, note: '', updatedAt: null };

    state.batchCounter = state.batches.length ? Math.max(...state.batches.map((b) => b.batch_no || 0)) : 0;

    document.getElementById('loadingScreen').classList.add('hidden');
    setSyncStatus('online', 'Tersinkron dengan Supabase');
    renderAll();
  } catch (e) {
    console.error('Init data error:', e);
    setSyncStatus('error', 'Gagal memuat data');
    toast('❌ Gagal memuat data: ' + e.message, 'error');
    document.getElementById('loadingScreen').classList.add('hidden');
    renderAll();
  }
}

/** Berlangganan realtime untuk seluruh tabel agar dashboard update otomatis. */
function subscribeAllRealtime() {
  teardownRealtime();
  const tables = ['batches', 'expenses', 'sales', 'rencana'];
  realtimeChannels = tables.map((table) =>
    api.subscribeRealtime(table, (payload) => handleRealtimeChange(table, payload))
  );
}

function teardownRealtime() {
  realtimeChannels.forEach((ch) => api.unsubscribeRealtime(ch));
  realtimeChannels = [];
}

function handleRealtimeChange(table, payload) {
  const list = state[table];
  if (payload.eventType === 'INSERT') {
    const exists = list.some((x) => x._id === payload.new.id);
    if (!exists) list.unshift({ ...payload.new, _id: payload.new.id });
  } else if (payload.eventType === 'UPDATE') {
    const idx = list.findIndex((x) => x._id === payload.new.id);
    if (idx >= 0) list[idx] = { ...payload.new, _id: payload.new.id };
  } else if (payload.eventType === 'DELETE') {
    const idx = list.findIndex((x) => x._id === payload.old.id);
    if (idx >= 0) list.splice(idx, 1);
  }
  renderAll();
}

// ============================================================================
// GENERIC DB HELPERS (dipakai fungsi-fungsi bisnis di bawah)
// ============================================================================

async function dbAdd(table, data) {
  const { data: inserted, error } = await api.insertRow(table, data);
  if (error) {
    toast('Gagal menyimpan ke server: ' + error, 'error');
    return null;
  }
  const newItem = { ...inserted, _id: inserted.id };
  state[table].unshift(newItem);
  renderAll();
  return newItem;
}

async function dbUpdate(table, _id, data) {
  const { error } = await api.updateRow(table, _id, data);
  if (error) {
    toast('Gagal update data: ' + error, 'error');
    return;
  }
  const idx = state[table].findIndex((x) => String(x._id) === String(_id));
  if (idx >= 0) state[table][idx] = { ...state[table][idx], ...data };
  renderAll();
}

async function dbDelete(table, _id) {
  const { error } = await api.deleteRow(table, _id);
  if (error) {
    toast('Gagal hapus data: ' + error, 'error');
    return;
  }
  state[table] = state[table].filter((x) => String(x._id) !== String(_id));
  renderAll();
}

// ============================================================================
// LOGIN / LOGOUT
// ============================================================================

window.doLogin = async function () {
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  if (!email || !password) {
    showLoginScreen('⚠️ Isi email & password!');
    return;
  }
  const btn = document.getElementById('btnLogin');
  btn.textContent = 'Masuk…';
  btn.classList.add('btn-disabled');
  const { data, error } = await api.signIn(email, password);
  btn.textContent = 'Masuk';
  btn.classList.remove('btn-disabled');
  if (error) {
    showLoginScreen('❌ ' + error);
    return;
  }
  await startApp(data.user);
};

window.doLogout = async function () {
  await api.signOut();
  teardownRealtime();
  state.batches = [];
  state.expenses = [];
  state.sales = [];
  state.rencana = [];
  state.saldo = { amount: 0, note: '', updatedAt: null };
  showLoginScreen();
};

// ============================================================================
// LOGIKA BATCH
// ============================================================================

window.saveBatch = async function () {
  const d = document.getElementById('b-date').value;
  const q = parseInt(document.getElementById('b-qty').value) || 0;
  if (!d || !q) {
    toast('⚠️ Isi tanggal semai & jumlah bibit!');
    return;
  }
  const btn = document.getElementById('btnSaveBatch');
  btn.textContent = 'Menyimpan…';
  btn.classList.add('btn-disabled');
  state.batchCounter++;
  const batch = {
    batch_no: state.batchCounter,
    dateSemai: d,
    qty: q,
    note: document.getElementById('b-note').value,
    datePindah: addDays(d, 14).toISOString().split('T')[0],
    datePanen: addDays(d, 49).toISOString().split('T')[0],
    qtyRakit: null,
    pindahNote: '',
    estKg: (q * 0.2).toFixed(1),
    status: 'semai',
    actualKg: null,
    harvestNote: '',
    actualHarvestDate: null,
  };
  const saved = await dbAdd('batches', batch);
  window.closeModal('modal-batch');
  ['b-qty', 'b-note'].forEach((id) => (document.getElementById(id).value = ''));
  document.getElementById('batchPreview').style.display = 'none';
  btn.textContent = 'Simpan Batch';
  btn.classList.remove('btn-disabled');
  if (saved) toast('✅ Batch #' + saved.batch_no + ' ditambahkan!');
};

window.openPindahModal = function (id) {
  const b = state.batches.find((x) => String(x._id) === String(id));
  if (!b) return;
  state.pindahTarget = id;
  document.getElementById('pindah-info').innerHTML = `Batch <strong>#${b.batch_no}</strong> · Semai <strong>${b.qty.toLocaleString('id-ID')} bibit</strong> pada ${b.dateSemai}<br>Masukkan jumlah bibit yang berhasil dipindah ke rakit apung.`;
  document.getElementById('pindah-qty').value = b.qty;
  document.getElementById('pindah-note').value = '';
  document.getElementById('pindah-diff').textContent = '';
  window.openModal('modal-pindah');
  document.getElementById('pindah-qty').oninput = function () {
    const q = parseInt(this.value) || 0;
    const diff = q - b.qty;
    const el = document.getElementById('pindah-diff');
    if (diff === 0) el.textContent = '';
    else if (diff > 0) el.innerHTML = `<span style="color:var(--green)">+${diff} bibit (tambah dari luar)</span>`;
    else el.innerHTML = `<span style="color:var(--danger)">${diff} bibit (tidak lolos semai)</span>`;
  };
};

window.confirmPindah = async function () {
  const b = state.batches.find((x) => String(x._id) === String(state.pindahTarget));
  if (!b) return;
  const q = parseInt(document.getElementById('pindah-qty').value) || 0;
  if (!q) {
    toast('⚠️ Masukkan jumlah bibit!');
    return;
  }
  await dbUpdate('batches', b._id, { qtyRakit: q, pindahNote: document.getElementById('pindah-note').value, status: 'rakit', estKg: (q * 0.2).toFixed(1) });
  window.closeModal('modal-pindah');
  toast('🪴 Batch #' + b.batch_no + ' dipindah ke rakit apung!');
};

window.openHarvestModal = function (id) {
  const b = state.batches.find((x) => String(x._id) === String(id));
  if (!b) return;
  state.harvestTarget = id;
  const bAktif = b.qtyRakit != null ? b.qtyRakit : b.qty;
  document.getElementById('harvest-info').innerHTML = `Batch <strong>#${b.batch_no}</strong> · <strong>${bAktif.toLocaleString('id-ID')} tanaman</strong> di rakit apung<br>Estimasi: <strong>${b.estKg} kg</strong>`;
  document.getElementById('h-actual').value = b.estKg;
  document.getElementById('h-date').valueAsDate = new Date();
  document.getElementById('h-note').value = '';
  document.getElementById('harvest-diff').textContent = '';
  window.openModal('modal-harvest');
  document.getElementById('h-actual').oninput = function () {
    const v = parseFloat(this.value) || 0;
    const est = parseFloat(b.estKg);
    const diff = (v - est).toFixed(1);
    const el = document.getElementById('harvest-diff');
    if (Math.abs(diff) < 0.01) el.textContent = '';
    else if (diff > 0) el.innerHTML = `<span style="color:var(--green)">+${diff} kg dari estimasi 🎉</span>`;
    else el.innerHTML = `<span style="color:var(--danger)">${diff} kg dari estimasi</span>`;
  };
};

window.confirmHarvest = async function () {
  const b = state.batches.find((x) => String(x._id) === String(state.harvestTarget));
  if (!b) return;
  const actual = document.getElementById('h-actual').value;
  const hdate = document.getElementById('h-date').value;
  if (!actual || !hdate) {
    toast('⚠️ Isi hasil & tanggal panen!');
    return;
  }
  await dbUpdate('batches', b._id, { status: 'panen', actualKg: parseFloat(actual), actualHarvestDate: hdate, harvestNote: document.getElementById('h-note').value });
  window.closeModal('modal-harvest');
  toast('🌾 Panen Batch #' + b.batch_no + ' dicatat · ' + actual + ' kg');
};

window.openEditBatch = function (id) {
  const b = state.batches.find((x) => String(x._id) === String(id));
  if (!b) return;
  document.getElementById('eb-id').value = id;
  document.getElementById('eb-info').textContent = 'Batch #' + b.batch_no + (b.note ? ' · ' + b.note : '') + ' · Status: ' + (b.status || 'semai');
  document.getElementById('eb-dateSemai').value = b.dateSemai || '';
  document.getElementById('eb-qty').value = b.qty || 0;
  document.getElementById('eb-datePindah').value = b.datePindah || '';
  document.getElementById('eb-datePanen').value = b.datePanen || '';
  document.getElementById('eb-note').value = b.note || '';
  window.openModal('modal-edit-batch');
};

window.saveEditBatch = async function () {
  const id = document.getElementById('eb-id').value;
  const dateSemai = document.getElementById('eb-dateSemai').value;
  const qty = parseInt(document.getElementById('eb-qty').value) || 0;
  const datePindah = document.getElementById('eb-datePindah').value;
  const datePanen = document.getElementById('eb-datePanen').value;
  const note = document.getElementById('eb-note').value;
  if (!dateSemai || !qty) {
    toast('⚠️ Isi tanggal semai & jumlah bibit!');
    return;
  }
  const estKg = (qty * 0.2).toFixed(1);
  await dbUpdate('batches', id, { dateSemai, qty, datePindah, datePanen, note, estKg });
  window.closeModal('modal-edit-batch');
  toast('✅ Batch diperbarui!');
};

// ============================================================================
// PENGELUARAN
// ============================================================================

window.saveExpense = async function () {
  const d = document.getElementById('e-date').value;
  const a = parseFloat(document.getElementById('e-amount').value) || 0;
  if (!d || !a) {
    toast('⚠️ Isi tanggal & jumlah!');
    return;
  }
  await dbAdd('expenses', { date: d, cat: document.getElementById('e-cat').value, desc: document.getElementById('e-desc').value, amount: a });
  window.closeModal('modal-expense');
  document.getElementById('e-amount').value = '';
  document.getElementById('e-desc').value = '';
  toast('✅ Pengeluaran dicatat!');
};

window.deleteExpense = async function (id) {
  if (!confirm('Hapus pengeluaran ini?')) return;
  await dbDelete('expenses', id);
  toast('🗑️ Pengeluaran dihapus');
};

// ============================================================================
// PENJUALAN
// ============================================================================

window.saveSale = async function () {
  const d = document.getElementById('s-date').value;
  const buyer = document.getElementById('s-buyer').value.trim();
  const qty = parseFloat(document.getElementById('s-qty').value) || 0;
  const price = parseFloat(document.getElementById('s-price').value) || 0;
  const pay = document.getElementById('s-pay').value;
  if (!d || !buyer || !qty || !price) {
    toast('⚠️ Lengkapi data penjualan!');
    return;
  }
  let due = '';
  let status = pay === 'tempo' ? 'pending-approval' : 'lunas';
  if (pay === 'tempo') {
    due = document.getElementById('s-duedate').value;
    if (!due) {
      toast('⚠️ Isi tanggal jatuh tempo!');
      return;
    }
  }
  const invoice = document.getElementById('s-invoice').value;
  await dbAdd('sales', { invoice, date: d, buyer, qty, price, total: qty * price, pay, due: due || null, note: document.getElementById('s-note').value, status });
  window.closeModal('modal-sale');
  ['s-buyer', 's-qty', 's-price', 's-note'].forEach((id) => (document.getElementById(id).value = ''));
  document.getElementById('s-totalPreview').style.display = 'none';
  toast(pay === 'tempo' ? '⏳ Tempo menunggu approval' : '✅ Penjualan dicatat!');
};

window.approveSale = async function (id) {
  await dbUpdate('sales', id, { status: 'tempo-aktif' });
  toast('✅ Tempo disetujui!');
};
window.rejectSale = async function (id) {
  if (!confirm('Tolak transaksi ini?')) return;
  await dbUpdate('sales', id, { status: 'ditolak' });
  toast('❌ Ditolak');
};
window.markPaid = async function (id) {
  await dbUpdate('sales', id, { status: 'lunas', paidDate: today() });
  toast('💵 Lunas!');
};

// ============================================================================
// SALDO & RENCANA
// ============================================================================

window.saveSaldo = async function () {
  const amount = parseFloat(document.getElementById('saldo-input').value) || 0;
  const note = document.getElementById('saldo-note').value;
  const updatedAt = today();
  const { data, error } = await api.upsertSaldo({ amount, note, updatedAt });
  if (error) {
    toast('Gagal menyimpan saldo: ' + error, 'error');
    return;
  }
  state.saldo = data;
  window.closeModal('modal-saldo');
  renderKeuangan();
  toast('💰 Saldo diperbarui: Rp ' + Math.round(amount).toLocaleString('id-ID'));
};

window.saveRencana = async function () {
  const month = document.getElementById('r-month').value;
  const amount = parseFloat(document.getElementById('r-amount').value) || 0;
  if (!month || !amount) {
    toast('⚠️ Isi bulan & jumlah anggaran!');
    return;
  }
  const editId = document.getElementById('r-edit-id').value;
  if (editId) {
    await dbUpdate('rencana', editId, { month, cat: document.getElementById('r-cat').value, desc: document.getElementById('r-desc').value, amount });
    toast('✅ Rencana diperbarui!');
  } else {
    await dbAdd('rencana', { month, cat: document.getElementById('r-cat').value, desc: document.getElementById('r-desc').value, amount });
    toast('✅ Rencana pengeluaran disimpan!');
  }
  window.closeModal('modal-rencana');
  document.getElementById('r-amount').value = '';
  document.getElementById('r-desc').value = '';
  document.getElementById('r-edit-id').value = '';
  document.getElementById('r-modal-title').textContent = '📅 Tambah Rencana Pengeluaran';
  renderRencana();
};

window.editRencana = function (id) {
  const r = state.rencana.find((x) => String(x._id) === String(id));
  if (!r) return;
  document.getElementById('r-edit-id').value = id;
  document.getElementById('r-modal-title').textContent = '✏️ Edit Rencana Pengeluaran';
  document.getElementById('r-month').value = r.month;
  document.getElementById('r-cat').value = r.cat;
  document.getElementById('r-desc').value = r.desc || '';
  document.getElementById('r-amount').value = r.amount;
  window.openModal('modal-rencana');
};

window.deleteRencana = async function (id) {
  if (!confirm('Hapus rencana ini?')) return;
  await dbDelete('rencana', id);
  renderRencana();
  toast('🗑️ Rencana dihapus');
};

window.openCatatRencana = function (rencanaId) {
  const r = state.rencana.find((x) => String(x._id) === String(rencanaId));
  if (!r) return;
  const terpakai = state.expenses.filter((e) => String(e.rencanaId) === String(rencanaId)).reduce((s, e) => s + e.amount, 0);
  const sisaAnggaran = Math.max(0, r.amount - terpakai);
  document.getElementById('cr-rencana-id').value = rencanaId;
  document.getElementById('cr-cat').value = r.cat;
  document.getElementById('cr-info-kat').textContent = r.cat + (r.desc ? ' · ' + r.desc : '');
  document.getElementById('cr-info-anggaran').textContent = 'Rp ' + Math.round(r.amount).toLocaleString('id-ID');
  document.getElementById('cr-info-terpakai').textContent = 'Rp ' + Math.round(terpakai).toLocaleString('id-ID');
  document.getElementById('cr-info-sisa').textContent = 'Rp ' + Math.round(sisaAnggaran).toLocaleString('id-ID');
  const pct = r.amount ? Math.min((terpakai / r.amount) * 100, 100) : 0;
  document.getElementById('cr-prog').style.width = pct + '%';
  document.getElementById('cr-prog').style.background = pct >= 80 ? 'var(--warn)' : 'var(--green)';
  document.getElementById('cr-amount').value = sisaAnggaran || '';
  document.getElementById('cr-date').valueAsDate = new Date();
  document.getElementById('cr-desc').value = r.desc || '';
  document.getElementById('cr-warn').style.display = 'none';
  window.openModal('modal-catat-rencana');
};

window.saveCatatRencana = async function () {
  const rencanaId = document.getElementById('cr-rencana-id').value;
  const cat = document.getElementById('cr-cat').value;
  const amt = parseFloat(document.getElementById('cr-amount').value) || 0;
  const date = document.getElementById('cr-date').value;
  const desc = document.getElementById('cr-desc').value;
  if (!amt || !date) {
    toast('⚠️ Isi tanggal & jumlah!');
    return;
  }
  const r = state.rencana.find((x) => String(x._id) === String(rencanaId));
  if (!r) return;
  if (amt > r.amount && !confirm('Jumlah melebihi total anggaran Rp ' + Math.round(r.amount).toLocaleString('id-ID') + '. Lanjutkan?')) return;
  await dbAdd('expenses', { date, cat, desc: desc || r.desc || r.cat, amount: amt, rencanaId });
  window.closeModal('modal-catat-rencana');
  toast('✅ Pengeluaran dicatat!');
};

// ============================================================================
// START
// ============================================================================

document.addEventListener('DOMContentLoaded', boot);
