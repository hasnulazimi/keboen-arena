/**
 * ui.js
 * ----------------------------------------------------------------------------
 * Semua fungsi yang menyentuh DOM: render tabel/kartu, navigasi antar
 * halaman, buka/tutup modal, badge status. Tidak ada panggilan Supabase
 * langsung di sini — data selalu dibaca dari `state` (lihat main.js).
 * ----------------------------------------------------------------------------
 */

import { state } from './main.js';
import { fmt, fmtRp, today, addDays, daysDiff } from './utils.js';

// ============================================================================
// NAVIGASI
// ============================================================================

const pageTitles = {
  dashboard: 'Dashboard',
  batch: 'Batch Tanam',
  keuangan: 'Laporan Keuangan',
  pengeluaran: 'Pengeluaran',
  penjualan: 'Penjualan',
  tempo: 'Hutang Tempo',
};

window.nav = function (id, el) {
  document.querySelectorAll('.page-section').forEach((s) => s.classList.remove('active'));
  const sec = document.getElementById('sec-' + id);
  if (sec) sec.classList.add('active');
  document.querySelectorAll('.nav-item').forEach((n) => n.classList.remove('active'));
  if (el && el.classList && el.classList.contains('nav-item')) el.classList.add('active');
  document.getElementById('pageTitle').textContent = pageTitles[id] || id;
  syncBottomNav(id);

  try {
    if (id === 'dashboard') renderDashboard();
    else if (id === 'batch') renderBatch();
    else if (id === 'keuangan') renderKeuangan();
    else if (id === 'pengeluaran') renderPengeluaran();
    else if (id === 'penjualan') renderSales();
    else if (id === 'tempo') renderTempo();
    else if (id === 'rencanabulan') {
      populateRencanaSelect();
      renderRencana();
    }
  } catch (e) {
    console.error('nav render error:', id, e.message);
  }
};

function syncBottomNav(pageId) {
  document.querySelectorAll('.bn-item').forEach((b) => b.classList.toggle('active', b.dataset.page === pageId));
}

// ============================================================================
// MODAL
// ============================================================================

window.openModal = function (id) {
  document.getElementById(id).classList.add('open');
  if (id === 'modal-batch') {
    document.getElementById('b-date').valueAsDate = new Date();
    document.getElementById('batchPreview').style.display = 'none';
  }
  if (id === 'modal-expense') {
    document.getElementById('e-date').valueAsDate = new Date();
  }
  if (id === 'modal-sale') {
    document.getElementById('s-date').valueAsDate = new Date();
    document.getElementById('tempo-fields').style.display = 'none';
    document.getElementById('s-totalPreview').style.display = 'none';
    window.autoSetDue();
    const now = new Date();
    const yy = String(now.getFullYear()).slice(2);
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const seq = String(state.sales.length + 1).padStart(3, '0');
    document.getElementById('s-invoice').value = 'KA-' + yy + mm + '-' + seq;
  }
  if (id === 'modal-saldo') {
    document.getElementById('saldo-input').value = state.saldo?.amount || '';
    document.getElementById('saldo-note').value = state.saldo?.note || '';
  }
  if (id === 'modal-rencana') {
    document.getElementById('r-edit-id').value = '';
    document.getElementById('r-modal-title').textContent = '📅 Tambah Rencana Pengeluaran';
    document.getElementById('r-month').value = today().slice(0, 7);
    document.getElementById('r-amount').value = '';
    document.getElementById('r-desc').value = '';
  }
};

window.closeModal = function (id) {
  document.getElementById(id).classList.remove('open');
};

// ============================================================================
// FORM HELPERS (interaksi form murni, tanpa DB)
// ============================================================================

window.previewBatch = function () {
  const d = document.getElementById('b-date').value;
  const q = parseInt(document.getElementById('b-qty').value) || 0;
  if (!d || !q) {
    document.getElementById('batchPreview').style.display = 'none';
    return;
  }
  document.getElementById('p-pindah').textContent = fmt(addDays(d, 14));
  document.getElementById('p-panen').textContent = fmt(addDays(d, 49));
  document.getElementById('p-hasil').textContent = (q * 0.2).toFixed(1) + ' kg (estimasi)';
  document.getElementById('batchPreview').style.display = 'block';
};

window.updateSaleTotal = function () {
  const q = parseFloat(document.getElementById('s-qty').value) || 0;
  const p = parseFloat(document.getElementById('s-price').value) || 0;
  const box = document.getElementById('s-totalPreview');
  if (q && p) {
    document.getElementById('s-totalNum').textContent = fmtRp(q * p);
    box.style.display = 'block';
  } else box.style.display = 'none';
};

window.toggleTempo = function () {
  const v = document.getElementById('s-pay').value;
  document.getElementById('tempo-fields').style.display = v === 'tempo' ? 'block' : 'none';
  if (v === 'tempo') window.autoSetDue();
};

window.autoSetDue = function () {
  const d = document.getElementById('s-date').value || today();
  const dur = document.getElementById('s-tempodur')?.value;
  if (dur && dur !== 'custom') document.getElementById('s-duedate').valueAsDate = addDays(d, parseInt(dur));
};

window.autoFillPanen = function () {
  const semai = document.getElementById('eb-dateSemai').value;
  if (!semai) return;
  document.getElementById('eb-datePindah').value = addDays(semai, 14).toISOString().split('T')[0];
  document.getElementById('eb-datePanen').value = addDays(semai, 49).toISOString().split('T')[0];
};

window.checkCatatAmount = function () {
  const amt = parseFloat(document.getElementById('cr-amount').value) || 0;
  const rId = document.getElementById('cr-rencana-id').value;
  const r = state.rencana.find((x) => String(x._id) === String(rId));
  if (!r) return;
  const terpakai = state.expenses.filter((e) => String(e.rencanaId) === String(rId)).reduce((s, e) => s + e.amount, 0);
  const sisa = Math.max(0, r.amount - terpakai);
  const warn = document.getElementById('cr-warn');
  if (amt > sisa) {
    warn.textContent = '⚠️ Melebihi sisa anggaran ' + fmtRp(sisa);
    warn.style.display = 'block';
  } else warn.style.display = 'none';
};

// ============================================================================
// BADGE HELPERS
// ============================================================================

export function getBatchStatus(b) {
  if (b.status === 'panen') return 'panen';
  if (b.status === 'rakit') return today() >= b.datePanen ? 'siap-panen' : 'rakit';
  return today() >= b.datePindah ? 'pindah-siap' : 'semai';
}

export function batchBadge(b) {
  return {
    panen: '<span class="badge b-gray">✅ Sudah Panen</span>',
    'siap-panen': '<span class="badge b-info">🌾 Siap Panen!</span>',
    rakit: '<span class="badge b-green">🪴 Di Rakit Apung</span>',
    'pindah-siap': '<span class="badge b-warn">🔄 Siap Dipindah</span>',
    semai: '<span class="badge b-blue">🌱 Penyemaian</span>',
  }[getBatchStatus(b)];
}

function saleBadge(s) {
  return (
    {
      lunas: '<span class="badge b-green">✅ Lunas</span>',
      'pending-approval': '<span class="badge b-warn">⏳ Approval</span>',
      'tempo-aktif': '<span class="badge b-tempo">🕐 Tempo</span>',
      ditolak: '<span class="badge b-danger">❌ Ditolak</span>',
    }[s.status] || ''
  );
}

// ============================================================================
// RENDER — DASHBOARD & HALAMAN LAIN
// ============================================================================

export function renderAll() {
  const fns = {
    dashboard: renderDashboard,
    batch: renderBatch,
    pengeluaran: renderPengeluaran,
    keuangan: renderKeuangan,
    penjualan: renderSales,
    tempo: renderTempo,
  };
  Object.entries(fns).forEach(([name, fn]) => {
    try {
      fn();
    } catch (e) {
      console.error('renderAll ' + name + ':', e);
    }
  });
  try {
    populateRencanaSelect();
    renderRencana();
  } catch (e) {
    /* halaman belum aktif, aman diabaikan */
  }
  try {
    updateTempoCount();
  } catch (e) {
    /* elemen belum ada di DOM, aman diabaikan */
  }
}

export function renderDashboard() {
  const active = state.batches.filter((b) => b.status !== 'panen');
  const bibit = active.reduce((a, b) => a + (b.qtyRakit != null ? b.qtyRakit : b.qty), 0);
  const siap = state.batches.filter((b) => getBatchStatus(b) === 'siap-panen').length;
  const income = state.sales.filter((s) => s.status === 'lunas').reduce((a, s) => a + s.total, 0);
  const pending = state.sales.filter((s) => s.status === 'tempo-aktif').reduce((a, s) => a + s.total, 0);
  const expense = state.expenses.reduce((a, e) => a + e.amount, 0);
  const profit = income - expense;

  document.getElementById('dashStats').innerHTML = `
    <div class="stat-card"><div class="stat-label">Batch Aktif</div><div class="stat-val">${active.length}</div><div class="stat-sub">${state.batches.filter((b) => b.status === 'panen').length} sudah panen</div></div>
    <div class="stat-card"><div class="stat-label">Bibit di Rakit</div><div class="stat-val">${bibit.toLocaleString('id-ID')}</div><div class="stat-sub">≈ ${(bibit * 0.2).toFixed(1)} kg estimasi</div></div>
    <div class="stat-card"><div class="stat-label">Siap Panen</div><div class="stat-val" style="color:${siap ? 'var(--green-accent)' : 'var(--text)'}">${siap}</div><div class="stat-sub">batch bisa dipanen</div></div>
    <div class="stat-card"><div class="stat-label">Piutang Tempo</div><div class="stat-val" style="color:${pending ? 'var(--warn)' : 'var(--text)'}">${fmtRp(pending)}</div><div class="stat-sub">belum terbayar</div></div>`;

  const aktif5 = [...active].sort((a, b) => new Date(a.datePanen) - new Date(b.datePanen)).slice(0, 5);
  document.getElementById('dashBatchCount').textContent = active.length ? active.length + ' batch' : '—';
  document.getElementById('dashBatchTable').innerHTML = aktif5.length
    ? aktif5
        .map(
          (b) =>
            `<tr><td><strong>#${b.batch_no}</strong>${b.note ? ` <span style="font-size:10px;color:var(--text-muted)">${b.note}</span>` : ''}</td><td class="mono">${fmt(b.dateSemai)}</td><td>${(b.qtyRakit != null ? b.qtyRakit : b.qty).toLocaleString('id-ID')}</td><td class="mono" style="color:var(--green);font-weight:700">${fmt(b.datePanen)}</td><td>${batchBadge(b)}</td></tr>`
        )
        .join('')
    : '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:20px">Belum ada batch.</td></tr>';

  document.getElementById('d-income').textContent = fmtRp(income);
  document.getElementById('d-pending').textContent = fmtRp(pending) + ' piutang tempo';
  document.getElementById('d-expense').textContent = fmtRp(expense);
  const dp = document.getElementById('d-profit');
  dp.textContent = fmtRp(profit);
  dp.style.color = profit >= 0 ? 'var(--green)' : 'var(--danger)';
  const dpn = document.getElementById('d-profit-note');
  dpn.textContent = profit >= 0 ? '✅ Laba' : '⚠️ Merugi';
  dpn.style.color = profit >= 0 ? 'var(--green-accent)' : 'var(--warn)';

  const saldo = state.saldo || {};
  const saldoAwal = saldo.amount || 0;
  const saldoAkhir = saldoAwal + income - expense;
  document.getElementById('d-saldo').textContent = fmtRp(saldoAkhir);
  document.getElementById('d-saldo-date').textContent = saldoAwal > 0 ? 'Awal: ' + fmtRp(saldoAwal) : '(belum ada saldo awal)';

  const bln = today().slice(0, 7);
  const rencanaItems = state.rencana.filter((r) => r.month === bln);
  const aktualMap = {};
  state.expenses.filter((e) => e.date && e.date.startsWith(bln)).forEach((e) => {
    aktualMap[e.cat] = (aktualMap[e.cat] || 0) + e.amount;
  });
  const totalPlan = rencanaItems.reduce((a, r) => a + r.amount, 0);
  const totalReal = rencanaItems.reduce((a, r) => a + (aktualMap[r.cat] || 0), 0);
  const sisaRencana = totalPlan - totalReal;
  const pctRencana = totalPlan ? Math.min((totalReal / totalPlan) * 100, 100) : 0;
  const drs = document.getElementById('d-rencana-sisa');
  drs.textContent = totalPlan ? fmtRp(sisaRencana) : '—';
  drs.style.color = sisaRencana < 0 ? 'var(--danger)' : sisaRencana < totalPlan * 0.2 ? 'var(--warn)' : 'var(--green)';
  document.getElementById('d-rencana-sub').textContent = totalPlan ? Math.round(pctRencana) + '% terpakai dari ' + fmtRp(totalPlan) : 'Belum ada rencana';
  document.getElementById('d-rencana-bar').style.width = pctRencana + '%';
  document.getElementById('d-rencana-bar').style.background = pctRencana > 90 ? 'var(--danger)' : pctRencana > 70 ? 'var(--warn)' : 'var(--green)';
  const bulanLabel = new Date(bln + '-01').toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
  document.getElementById('d-rencana-month').textContent = bulanLabel;
  document.getElementById('d-rencana-table').innerHTML = rencanaItems.length
    ? rencanaItems
        .map((r) => {
          const real = aktualMap[r.cat] || 0;
          const selisih = r.amount - real;
          const pct2 = r.amount ? Math.round((real / r.amount) * 100) : 0;
          return `<tr>
      <td><span class="badge b-gray">${r.cat}</span><div style="font-size:11px;color:var(--text-muted);margin-top:2px">${r.desc || ''}</div></td>
      <td style="font-weight:700">${fmtRp(r.amount)}</td>
      <td style="color:var(--warn);font-weight:700">${fmtRp(real)}</td>
      <td style="color:${selisih < 0 ? 'var(--danger)' : 'var(--green)'};font-weight:700">${selisih >= 0 ? '+' : ''}${fmtRp(selisih)}</td>
      <td><div style="display:flex;align-items:center;gap:6px">
        <div class="prog-bar" style="width:60px"><div class="prog-fill" style="width:${Math.min(pct2, 100)}%;background:${pct2 > 100 ? 'var(--danger)' : pct2 > 80 ? 'var(--warn)' : 'var(--green)'}"></div></div>
        <span style="font-size:11px;color:var(--text-muted)">${pct2}%</span>
      </div></td>
    </tr>`;
        })
        .join('')
    : '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:16px">Belum ada rencana pengeluaran bulan ini.<br><small style="color:var(--text-muted)">Tambah di menu Rencana Bulanan</small></td></tr>';
}

export function renderBatch() {
  const active = [...state.batches.filter((b) => b.status !== 'panen')].sort((a, b) => new Date(a.datePanen) - new Date(b.datePanen));
  document.getElementById('batchActiveTable').innerHTML = active.length
    ? active
        .map((b) => {
          const s = getBatchStatus(b);
          const hari = Math.max(0, Math.floor((Date.now() - new Date(b.dateSemai)) / 86400000));
          const prog = Math.min((hari / 49) * 100, 100);
          let aksiUtama = '';
          if (s === 'pindah-siap') aksiUtama = `<button class="btn btn-sm btn-warn" onclick="openPindahModal('${b._id}')">🪴 Pindah</button>`;
          else if (s === 'rakit') aksiUtama = `<button class="btn btn-sm btn-warn" onclick="openPindahModal('${b._id}')">✏️ Edit Rakit</button>`;
          else if (s === 'siap-panen') aksiUtama = `<button class="btn btn-sm btn-primary" onclick="openHarvestModal('${b._id}')">🌾 Panen</button>`;
          return `<tr>
      <td><strong>#${b.batch_no}</strong>${b.note ? `<div style="font-size:10px;color:var(--text-muted)">${b.note}</div>` : ''}</td>
      <td class="mono">${fmt(b.dateSemai)}</td>
      <td>${b.qty.toLocaleString('id-ID')}</td>
      <td class="mono">${fmt(b.datePindah)}</td>
      <td>${b.qtyRakit != null ? `<strong>${b.qtyRakit.toLocaleString('id-ID')}</strong>` : '<span style="color:var(--text-muted)">Belum pindah</span>'}</td>
      <td class="mono" style="color:var(--green);font-weight:700">${fmt(b.datePanen)}</td>
      <td>${b.estKg} kg</td>
      <td><div style="font-size:10px;color:var(--text-muted);margin-bottom:3px">Hari ${hari}/49</div><div class="prog-bar" style="width:90px"><div class="prog-fill" style="width:${prog}%"></div></div></td>
      <td>${batchBadge(b)}</td>
      <td><div style="display:flex;gap:4px;flex-wrap:wrap">
        ${aksiUtama}
        <button class="btn btn-sm btn-outline" onclick="openEditBatch('${b._id}')">✏️ Edit</button>
      </div></td>
    </tr>`;
        })
        .join('')
    : '<tr><td colspan="10" style="text-align:center;color:var(--text-muted);padding:24px">Belum ada batch aktif.</td></tr>';

  const harvested = state.batches.filter((b) => b.status === 'panen');
  document.getElementById('batchHarvestTable').innerHTML = harvested.length
    ? [...harvested]
        .map((b) => {
          const qR = b.qtyRakit != null ? b.qtyRakit : b.qty;
          const selisih = (b.actualKg - parseFloat(b.estKg)).toFixed(1);
          return `<tr><td><strong>#${b.batch_no}</strong>${b.note ? `<div style="font-size:10px;color:var(--text-muted)">${b.note}</div>` : ''}</td><td class="mono">${fmt(b.dateSemai)}</td><td>${b.qty.toLocaleString('id-ID')}</td><td>${qR.toLocaleString('id-ID')}</td><td class="mono">${fmt(b.actualHarvestDate || b.datePanen)}</td><td>${b.estKg} kg</td><td style="color:var(--green);font-weight:700">${b.actualKg} kg</td><td style="color:${selisih >= 0 ? 'var(--green)' : 'var(--danger)'};font-weight:700">${selisih >= 0 ? '+' : ''}${selisih} kg</td><td style="font-size:12px;color:var(--text-muted)">${b.harvestNote || '—'}</td></tr>`;
        })
        .join('')
    : '<tr><td colspan="9" style="text-align:center;color:var(--text-muted);padding:24px">Belum ada riwayat panen.</td></tr>';
}

export function renderPengeluaran() {
  const total = state.expenses.reduce((a, e) => a + e.amount, 0);
  const m = today().slice(0, 7);
  const thisMonth = state.expenses.filter((e) => e.date.startsWith(m)).reduce((a, e) => a + e.amount, 0);
  document.getElementById('e-total').textContent = fmtRp(total);
  document.getElementById('e-thismonth').textContent = fmtRp(thisMonth);
  document.getElementById('e-count').textContent = state.expenses.length;
  document.getElementById('expenseTable').innerHTML = state.expenses.length
    ? state.expenses
        .map(
          (e) =>
            `<tr><td class="mono">${fmt(e.date)}</td><td><span class="badge b-gray">${e.cat}</span></td><td>${e.desc || '—'}</td><td style="color:var(--danger);font-weight:700">${fmtRp(e.amount)}</td><td><button class="btn btn-sm btn-danger" onclick="deleteExpense('${e._id}')">Hapus</button></td></tr>`
        )
        .join('')
    : '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:24px">Belum ada pengeluaran.</td></tr>';
}

export function renderKeuangan() {
  const saldo = state.saldo || {};
  const saldoAwal = saldo.amount || 0;
  const income = state.sales.filter((s) => s.status === 'lunas').reduce((a, s) => a + s.total, 0);
  const expense = state.expenses.reduce((a, e) => a + e.amount, 0);
  const saldoAkhir = saldoAwal + income - expense;
  document.getElementById('k-saldo-display').textContent = fmtRp(saldoAkhir);
  document.getElementById('k-saldo-updated').textContent = saldoAwal > 0 ? 'Awal: ' + fmtRp(saldoAwal) : 'Atur saldo awal →';

  if (state.keuTab === 'bulan') {
    renderKeuBulan();
    return;
  }

  const pending = state.sales.filter((s) => s.status === 'tempo-aktif').reduce((a, s) => a + s.total, 0);
  const profit = income - expense;
  document.getElementById('k-income').textContent = fmtRp(income);
  document.getElementById('k-income-count').textContent = state.sales.filter((s) => s.status === 'lunas').length + ' transaksi';
  document.getElementById('k-expense').textContent = fmtRp(expense);
  document.getElementById('k-expense-count').textContent = state.expenses.length + ' transaksi';
  const kp = document.getElementById('k-profit');
  kp.textContent = fmtRp(profit);
  kp.style.color = profit >= 0 ? 'var(--green)' : 'var(--danger)';
  document.getElementById('k-profit-note').textContent = profit >= 0 ? '✅ Laba' : '⚠️ Rugi';
  document.getElementById('k-fin-income').textContent = fmtRp(income);
  document.getElementById('k-fin-pending').textContent = fmtRp(pending);
  document.getElementById('k-fin-expense').textContent = fmtRp(expense);
  document.getElementById('k-fin-potential').textContent = fmtRp(income + pending);
  const kfp = document.getElementById('k-fin-profit');
  kfp.textContent = fmtRp(profit);
  kfp.className = 'fin-val fin-total ' + (profit >= 0 ? 'fin-income' : 'fin-expense');

  const months = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    months.push(d.toISOString().slice(0, 7));
  }
  const incomes = months.map((m2) => state.sales.filter((s) => s.status === 'lunas' && s.date.startsWith(m2)).reduce((a, s) => a + s.total, 0));
  const expenses = months.map((m2) => state.expenses.filter((e) => e.date.startsWith(m2)).reduce((a, e) => a + e.amount, 0));
  const maxVal = Math.max(...incomes, ...expenses, 1);
  const mLabels = months.map((m2) => new Date(m2 + '-01').toLocaleDateString('id-ID', { month: 'short' }));
  const chartArea = document.getElementById('chartArea');
  if (!incomes.some((v) => v > 0) && !expenses.some((v) => v > 0)) {
    chartArea.innerHTML = '<div style="color:var(--text-muted);font-size:13px">Belum ada data cukup untuk grafik.</div>';
  } else {
    chartArea.innerHTML = `<div style="width:100%"><div style="display:flex;gap:12px;margin-bottom:10px;font-size:11px"><span style="display:flex;align-items:center;gap:4px"><span style="width:10px;height:10px;border-radius:2px;background:var(--green);display:inline-block"></span>Pemasukan</span><span style="display:flex;align-items:center;gap:4px"><span style="width:10px;height:10px;border-radius:2px;background:var(--danger);display:inline-block"></span>Pengeluaran</span></div><div style="display:flex;align-items:flex-end;gap:8px;height:100px;margin-bottom:8px">${months
      .map(
        (_, i) =>
          `<div style="flex:1;display:flex;gap:2px;align-items:flex-end;height:100%"><div style="flex:1;background:var(--green);border-radius:3px 3px 0 0;height:${Math.max(2, (incomes[i] / maxVal) * 100)}%;opacity:.85" title="${fmtRp(incomes[i])}"></div><div style="flex:1;background:var(--danger);border-radius:3px 3px 0 0;height:${Math.max(2, (expenses[i] / maxVal) * 100)}%;opacity:.7" title="${fmtRp(expenses[i])}"></div></div>`
      )
      .join('')}</div><div style="display:flex;gap:8px">${mLabels.map((l) => `<div style="flex:1;text-align:center;font-size:10px;color:var(--text-muted);font-family:'DM Mono',monospace">${l}</div>`).join('')}</div></div>`;
  }

  const cats = {};
  state.expenses.forEach((e) => {
    cats[e.cat] = (cats[e.cat] || 0) + e.amount;
  });
  const maxCat = Math.max(...Object.values(cats), 1);
  document.getElementById('keuCatBody').innerHTML = Object.keys(cats).length
    ? Object.entries(cats)
        .sort((a, b) => b[1] - a[1])
        .map(
          ([k, v]) =>
            `<div style="margin-bottom:12px"><div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px"><span>${k}</span><span class="mono" style="color:var(--danger)">${fmtRp(v)}</span></div><div class="prog-bar"><div class="prog-fill" style="width:${(v / maxCat) * 100}%;background:var(--danger)"></div></div></div>`
        )
        .join('')
    : '<div style="color:var(--text-muted);font-size:13px;text-align:center;padding:20px">Belum ada data pengeluaran.</div>';
}

window.switchKeuTab = function (tab) {
  state.keuTab = tab;
  document.getElementById('tab-general').className = tab === 'general' ? 'btn btn-primary btn-sm' : 'btn btn-sm';
  document.getElementById('tab-general').style.cssText = 'border-radius:0;border:none' + (tab === 'general' ? '' : ';background:transparent;color:var(--text-muted)');
  document.getElementById('tab-bulan').className = tab === 'bulan' ? 'btn btn-primary btn-sm' : 'btn btn-sm';
  document.getElementById('tab-bulan').style.cssText = 'border-radius:0;border:none' + (tab === 'bulan' ? '' : ';background:transparent;color:var(--text-muted)');
  document.getElementById('keu-tab-general').style.display = tab === 'general' ? 'block' : 'none';
  document.getElementById('keu-tab-bulan').style.display = tab === 'bulan' ? 'block' : 'none';
  if (tab === 'bulan') renderKeuBulan();
  else renderKeuangan();
};

export function populateBulanSelect() {
  const sel = document.getElementById('bulan-select');
  if (!sel) return;
  const months = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - i);
    months.push(d.toISOString().slice(0, 7));
  }
  const cur = sel.value || today().slice(0, 7);
  sel.innerHTML = months
    .map((m) => {
      const d = new Date(m + '-01');
      return `<option value="${m}" ${m === cur ? 'selected' : ''}>${d.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}</option>`;
    })
    .reverse()
    .join('');
  if (!sel.value) sel.value = cur;
}
window.populateBulanSelect = populateBulanSelect;

export function renderKeuBulan() {
  populateBulanSelect();
  const sel = document.getElementById('bulan-select');
  if (!sel) return;
  const m = sel.value || today().slice(0, 7);
  const mSales = state.sales.filter((s) => s.date && s.date.startsWith(m) && s.status === 'lunas');
  const mExp = state.expenses.filter((e) => e.date && e.date.startsWith(m));
  const mIncome = mSales.reduce((a, s) => a + s.total, 0);
  const mExpTotal = mExp.reduce((a, e) => a + e.amount, 0);
  const mProfit = mIncome - mExpTotal;
  document.getElementById('bln-income').textContent = fmtRp(mIncome);
  document.getElementById('bln-income-sub').textContent = mSales.length + ' transaksi lunas';
  document.getElementById('bln-expense').textContent = fmtRp(mExpTotal);
  document.getElementById('bln-expense-sub').textContent = mExp.length + ' pos pengeluaran';
  const bp = document.getElementById('bln-profit');
  bp.textContent = fmtRp(mProfit);
  bp.style.color = mProfit >= 0 ? 'var(--green)' : 'var(--danger)';
  document.getElementById('bln-profit-note').textContent = mProfit >= 0 ? '✅ Untung bulan ini' : '⚠️ Merugi bulan ini';
  document.getElementById('bln-sale-table').innerHTML = mSales.length
    ? mSales.map((s) => `<tr><td class="mono" style="color:var(--green);font-size:11px;font-weight:700">${s.invoice || '—'}</td><td class="mono">${fmt(s.date)}</td><td>${s.buyer}</td><td style="font-weight:700;color:var(--green)">${fmtRp(s.total)}</td><td>${saleBadge(s)}</td></tr>`).join('')
    : '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:16px">Tidak ada penjualan bulan ini.</td></tr>';
  document.getElementById('bln-expense-table').innerHTML = mExp.length
    ? mExp.map((e) => `<tr><td class="mono">${fmt(e.date)}</td><td><span class="badge b-gray">${e.cat}</span></td><td style="color:var(--danger);font-weight:700">${fmtRp(e.amount)}</td></tr>`).join('')
    : '<tr><td colspan="3" style="text-align:center;color:var(--text-muted);padding:16px">Tidak ada pengeluaran bulan ini.</td></tr>';
}
window.renderKeuBulan = renderKeuBulan;

export function populateRencanaSelect() {
  const sel = document.getElementById('rencana-bulan-select');
  if (!sel) return;
  const prevVal = sel.value;
  const months = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - i);
    months.push(d.toISOString().slice(0, 7));
  }
  for (let i = 1; i <= 3; i++) {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() + i);
    months.push(d.toISOString().slice(0, 7));
  }
  const cur = prevVal || today().slice(0, 7);
  sel.innerHTML = [...new Set(months)]
    .sort()
    .reverse()
    .map((m) => {
      const d = new Date(m + '-01');
      return `<option value="${m}" ${m === cur ? 'selected' : ''}>${d.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}</option>`;
    })
    .join('');
  if (prevVal) sel.value = prevVal;
  else sel.value = cur;
}
window.populateRencanaSelect = populateRencanaSelect;

export function renderRencana() {
  const sel = document.getElementById('rencana-bulan-select');
  if (!sel) return;
  const m = sel.value || today().slice(0, 7);
  const items = state.rencana.filter((r) => r.month === m);

  const totalPlan = items.reduce((a, r) => a + r.amount, 0);
  const totalReal = items.reduce((a, r) => {
    const terpakai = state.expenses.filter((e) => String(e.rencanaId) === String(r._id)).reduce((s, e) => s + e.amount, 0);
    return a + terpakai;
  }, 0);
  const sisa = totalPlan - totalReal;
  document.getElementById('r-total-plan').textContent = fmtRp(totalPlan);
  document.getElementById('r-total-real').textContent = fmtRp(totalReal);
  document.getElementById('r-real-pct').textContent = totalPlan ? Math.round((totalReal / totalPlan) * 100) + '% terealisasi' : '—';
  const rs = document.getElementById('r-sisa');
  rs.textContent = fmtRp(sisa);
  rs.style.color = sisa < 0 ? 'var(--danger)' : 'var(--green)';

  document.getElementById('rencanaTable').innerHTML = items.length
    ? items
        .map((r) => {
          const terpakai = state.expenses.filter((e) => String(e.rencanaId) === String(r._id)).reduce((s, e) => s + e.amount, 0);
          const sisaR = r.amount - terpakai;
          const pct = r.amount ? Math.min((terpakai / r.amount) * 100, 100) : 0;
          const progColor = pct >= 100 ? 'var(--danger)' : pct >= 80 ? 'var(--warn)' : 'var(--green)';
          const sisaColor = sisaR < 0 ? 'var(--danger)' : sisaR === 0 ? 'var(--text-muted)' : 'var(--green)';
          const catatBtn =
            sisaR <= 0
              ? `<button class="btn btn-sm" style="background:var(--border);color:var(--text-muted);cursor:default" disabled>✅ Habis</button>`
              : `<button class="btn btn-sm btn-primary" onclick="openCatatRencana('${r._id}')">+ Catat</button>`;
          return `<tr>
      <td><span class="badge b-gray">${r.cat}</span>${r.desc ? ` <span style="font-size:11px;color:var(--text-muted)">${r.desc}</span>` : ''}</td>
      <td style="font-weight:700">${fmtRp(r.amount)}</td>
      <td><div style="font-weight:700;color:${terpakai > 0 ? 'var(--warn)' : 'var(--text-muted)'}">${fmtRp(terpakai)}</div>${terpakai > 0 ? `<div style="font-size:10px;color:var(--text-muted)">${Math.round(pct)}% terpakai</div>` : ''}</td>
      <td style="font-weight:700;color:${sisaColor}">${fmtRp(sisaR)}</td>
      <td><div style="display:flex;align-items:center;gap:6px"><div class="prog-bar" style="width:70px;flex-shrink:0"><div class="prog-fill" style="width:${pct}%;background:${progColor}"></div></div><span style="font-size:11px;color:var(--text-muted)">${Math.round(pct)}%</span></div></td>
      <td><div style="display:flex;gap:4px;align-items:center">${catatBtn}<button class="btn btn-sm btn-warn" style="padding:4px 9px" onclick="editRencana('${r._id}')">✏️</button><button class="btn btn-sm btn-danger" style="padding:4px 9px" onclick="deleteRencana('${r._id}')">🗑️</button></div></td>
    </tr>`;
        })
        .join('')
    : '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:24px">Belum ada rencana pengeluaran untuk bulan ini.</td></tr>';
}
window.renderRencana = renderRencana;

export function renderSales() {
  const st = document.getElementById('saleTable');
  if (!st) return;
  st.innerHTML = state.sales.length
    ? state.sales
        .map((s) => {
          let aksi = '—';
          if (s.status === 'pending-approval') aksi = `<div style="display:flex;gap:4px"><button class="btn btn-sm btn-primary" onclick="approveSale('${s._id}')">Approve</button><button class="btn btn-sm btn-danger" onclick="rejectSale('${s._id}')">Tolak</button></div>`;
          else if (s.status === 'tempo-aktif') aksi = `<button class="btn btn-sm btn-outline" onclick="markPaid('${s._id}')">Lunas</button>`;
          return `<tr><td class="mono" style="color:var(--green);font-weight:700;font-size:11px">${s.invoice || '—'}</td><td class="mono">${fmt(s.date)}</td><td>${s.buyer}</td><td>${s.qty} kg</td><td>${fmtRp(s.price)}</td><td style="font-weight:700;color:var(--green)">${fmtRp(s.total)}</td><td>${{ tunai: '💵 Tunai', transfer: '🏦 Transfer', tempo: '🕐 Tempo' }[s.pay]}</td><td class="mono">${s.due ? fmt(s.due) : '—'}</td><td>${saleBadge(s)}</td><td>${aksi}</td></tr>`;
        })
        .join('')
    : '<tr><td colspan="10" style="text-align:center;color:var(--text-muted);padding:24px">Belum ada penjualan.</td></tr>';
}

export function renderTempo() {
  const tt = document.getElementById('tempoTable');
  if (!tt) return;
  const tempos = state.sales.filter((s) => s.status === 'tempo-aktif' || s.status === 'pending-approval');
  tt.innerHTML = tempos.length
    ? tempos
        .map((s) => {
          const sisa = s.due ? daysDiff(s.due) : null;
          let sisaTxt = '—';
          if (sisa !== null) {
            if (sisa < 0) sisaTxt = `<span class="badge b-danger">Lewat ${Math.abs(sisa)}hr</span>`;
            else if (sisa <= 7) sisaTxt = `<span class="badge b-warn">${sisa} hari lagi</span>`;
            else sisaTxt = `<span style="color:var(--text-muted)">${sisa} hari</span>`;
          }
          let aksi = '—';
          if (s.status === 'pending-approval') aksi = `<div style="display:flex;gap:4px"><button class="btn btn-sm btn-primary" onclick="approveSale('${s._id}')">Approve</button><button class="btn btn-sm btn-danger" onclick="rejectSale('${s._id}')">Tolak</button></div>`;
          else if (s.status === 'tempo-aktif') aksi = `<button class="btn btn-sm btn-outline" onclick="markPaid('${s._id}')">Lunas</button>`;
          return `<tr><td class="mono" style="color:var(--green);font-weight:700;font-size:11px">${s.invoice || '—'}</td><td><strong>${s.buyer}</strong>${s.note ? `<div style="font-size:10px;color:var(--text-muted)">${s.note}</div>` : ''}</td><td class="mono">${fmt(s.date)}</td><td>${s.qty} kg</td><td style="font-weight:700;color:var(--green)">${fmtRp(s.total)}</td><td class="mono">${s.due ? fmt(s.due) : '—'}</td><td>${sisaTxt}</td><td>${s.status === 'pending-approval' ? '<span class="badge b-warn">⏳ Menunggu</span>' : '<span class="badge b-tempo">🕐 Aktif</span>'}</td><td>${aksi}</td></tr>`;
        })
        .join('')
    : '<tr><td colspan="9" style="text-align:center;color:var(--text-muted);padding:24px">Tidak ada piutang tempo.</td></tr>';
  const active = state.sales.filter((s) => s.status === 'tempo-aktif');
  document.getElementById('tempoTotal').textContent = fmtRp(active.reduce((a, s) => a + s.total, 0));
  document.getElementById('tempoNear').textContent = active.filter((s) => s.due && daysDiff(s.due) >= 0 && daysDiff(s.due) <= 7).length;
  document.getElementById('tempoOver').textContent = active.filter((s) => s.due && daysDiff(s.due) < 0).length;
}

export function updateTempoCount() {
  const n = state.sales.filter((s) => s.status === 'pending-approval' || s.status === 'tempo-aktif').length;
  const el = document.getElementById('tempoCount');
  if (!el) return;
  el.textContent = n;
  el.style.display = n ? '' : 'none';
}

/** Jam realtime di topbar. */
export function tick() {
  const el = document.getElementById('clock');
  if (!el) return;
  const n = new Date();
  el.textContent = n.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) + ' WIB · ' + n.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ============================================================================
// LOGIN / LOGOUT UI (tampilan)
// ============================================================================

/** Menampilkan layar login, menyembunyikan dashboard. */
export function showLoginScreen(errorMsg) {
  document.getElementById('loadingScreen').classList.add('hidden');
  document.getElementById('loginScreen').classList.remove('hidden');
  document.querySelector('.sidebar').style.display = 'none';
  document.querySelector('.main').style.display = 'none';
  const bn = document.getElementById('bottomNav');
  if (bn) bn.style.display = 'none';
  const err = document.getElementById('loginError');
  if (err) {
    err.textContent = errorMsg || '';
    err.style.display = errorMsg ? 'block' : 'none';
  }
}

/** Menampilkan dashboard, menyembunyikan layar login. */
export function showApp(userEmail) {
  document.getElementById('loginScreen').classList.add('hidden');
  document.getElementById('loadingScreen').classList.add('hidden');
  document.querySelector('.sidebar').style.display = '';
  document.querySelector('.main').style.display = '';
  const bn = document.getElementById('bottomNav');
  if (bn) bn.style.display = '';
  const emailEl = document.getElementById('currentUserEmail');
  if (emailEl) emailEl.textContent = userEmail || '';
}
