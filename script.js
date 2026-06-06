class ManajerKeuanganRumah {
    constructor() {
        this.db = { transaksi: [], tabungan: [] };
        this.chart = null;
        this.txFilterType = 'semua';
        this.searchQuery = '';
        this.isFirstLoad = true; // Flag agar filter hanya di-set otomatis saat pertama kali
        
        this.initKategoriWajib();
    }

    initKategoriWajib() {
        const DEFAULT_KATEGORI_WAJIB = {
            "SPP Sekolah Anak": { icon: "fa-graduation-cap", color: "#3b82f6" },
            "Bisyaroh Ngaji Anak": { icon: "fa-book-open-reader", color: "#f97316" },
            "Sumbangan Kematian RT": { icon: "fa-skull-crossbones", color: "#64748b" },
            "Tagihan Listrik Rumah": { icon: "fa-bolt", color: "#eab308" },
            "Tagihan Bulanan Wifi": { icon: "fa-wifi", color: "#ec4899" }
        };

        const saved = localStorage.getItem('griyaartha_kategori_wajib');
        if (saved) {
            try {
                this.kategoriWajib = JSON.parse(saved);
            } catch (e) {
                this.kategoriWajib = DEFAULT_KATEGORI_WAJIB;
            }
        } else {
            this.kategoriWajib = DEFAULT_KATEGORI_WAJIB;
            localStorage.setItem('griyaartha_kategori_wajib', JSON.stringify(this.kategoriWajib));
        }
        
        this.semuaKategoriPengeluaran = [...Object.keys(this.kategoriWajib), "Belanja Harian", "Lain-lain"];
    }

    simpanKategoriWajib() {
        localStorage.setItem('griyaartha_kategori_wajib', JSON.stringify(this.kategoriWajib));
        this.semuaKategoriPengeluaran = [...Object.keys(this.kategoriWajib), "Belanja Harian", "Lain-lain"];
        this.renderPilihanKategori();
        this.prosesDanRenderTampilan();
    }

    async init() {
        // Tampilkan Hari & Tanggal Saat Ini di Navbar
        const dateEl = document.getElementById('navMetaDate');
        if (dateEl) dateEl.textContent = this.getFormattedCurrentDate();

        this.initFilterTahun();
        this.setBulanTahunSaatIni();
        document.getElementById('txTanggal').valueAsDate = new Date();
        this.renderPilihanKategori();
        
        // Inisialisasi tab
        this.switchTab('dasbor');
        
        // Setup listener untuk search input
        const searchInput = document.getElementById('searchTransaksi');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.searchQuery = e.target.value.toLowerCase();
                this.prosesDanRenderTampilan();
            });
        }

        await this.sinkronisasiDataSheets();
    }

    getFormattedCurrentDate() {
        const days = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
        const months = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
        const skrg = new Date();
        return `${days[skrg.getDay()]}, ${skrg.getDate()} ${months[skrg.getMonth()]} ${skrg.getFullYear()}`;
    }

    showLoader(show) {
        document.getElementById('loadingOverlay').style.display = show ? 'flex' : 'none';
    }

    initFilterTahun() {
        const select = document.getElementById('filterTahun');
        if (!select) return;
        
        const currentVal = select.value; // Simpan nilai sekarang
        select.innerHTML = '';
        const thnSekarang = new Date().getFullYear();
        
        const yearsSet = new Set([thnSekarang - 1, thnSekarang, thnSekarang + 1]);
        
        // Tambahkan tahun dari transaksi jika ada
        this.db.transaksi.forEach(t => {
            const bt = this.extractBulanTahun(t);
            if (bt) {
                const y = parseInt(bt.split('-')[0]);
                if (!isNaN(y)) yearsSet.add(y);
            }
        });

        const sortedYears = Array.from(yearsSet).sort((a, b) => b - a);
        sortedYears.forEach(i => {
            let opt = document.createElement('option');
            opt.value = i; opt.textContent = i;
            select.appendChild(opt);
        });
        
        // Kembalikan pilihan sebelumnya jika ada, atau default ke tahun sekarang
        if (currentVal && Array.from(select.options).some(o => o.value === currentVal)) {
            select.value = currentVal;
        } else {
            select.value = thnSekarang;
        }
    }

    setBulanTahunSaatIni() {
        const skrg = new Date();
        const bln = String(skrg.getMonth() + 1).padStart(2, '0');
        const monthFilter = document.getElementById('filterBulan');
        if (monthFilter) monthFilter.value = bln;
    }

    getPeriodeTerpilih() {
        const bln = document.getElementById('filterBulan').value;
        const thn = document.getElementById('filterTahun').value;
        return { bln, thn };
    }

    /**
     * Ekstrak bulan_tahun yang konsisten dari transaksi.
     * Prioritaskan field bulan_tahun, lalu fallback ke tanggal.
     * Menangani kasus dimana Google Sheets auto-convert "2026-07" menjadi Date
     * dan gas.js mengembalikannya sebagai "2026-07-01" atau "2026-07".
     */
    extractBulanTahun(t) {
        if (t.bulan_tahun != null && String(t.bulan_tahun).trim() !== '') {
            const btStr = String(t.bulan_tahun).trim();
            
            // Format sempurna YYYY-MM
            if (/^\d{4}-\d{2}$/.test(btStr)) {
                return btStr;
            }
            // Format YYYY-MM-DD (Sheets mungkin auto-convert "2026-07" jadi date lalu dikembalikan sebagai "2026-07-01")
            const dateMatch = btStr.match(/^(\d{4})-(\d{2})-\d{2}/);
            if (dateMatch) {
                return `${dateMatch[1]}-${dateMatch[2]}`;
            }
        }
        // Fallback ke tanggal jika bulan_tahun tidak tersedia/invalid
        if (t.tanggal) {
            const tglStr = String(t.tanggal);
            const match = tglStr.match(/^(\d{4})-(\d{2})/);
            if (match) {
                return `${match[1]}-${match[2]}`;
            }
        }
        return null;
    }

    renderPilihanKategori() {
        const tipe = document.getElementById('txTipe').value;
        const select = document.getElementById('txKategori');
        if (!select) return;
        select.innerHTML = '';
        
        if (tipe === "Pengeluaran") {
            this.semuaKategoriPengeluaran.forEach(k => {
                select.innerHTML += `<option value="${k}">${k}</option>`;
            });
        } else {
            select.innerHTML += `<option value="Pemasukan Pokok / Gaji">Pemasukan Pokok / Gaji</option>`;
            select.innerHTML += `<option value="Pemasukan Tambahan">Pemasukan Tambahan</option>`;
        }
    }

    setBulanTahunKeTransaksiTerbaru() {
        if (this.db.transaksi.length === 0) return;
        
        let terbaru = null;
        this.db.transaksi.forEach(t => {
            const bt = this.extractBulanTahun(t);
            if (bt) {
                if (!terbaru || bt > terbaru) {
                    terbaru = bt;
                }
            }
        });
        
        if (terbaru) {
            const [y, m] = terbaru.split('-');
            
            const monthSelect = document.getElementById('filterBulan');
            const yearSelect = document.getElementById('filterTahun');
            
            if (monthSelect) monthSelect.value = m;
            
            if (yearSelect) {
                let found = false;
                for (let i = 0; i < yearSelect.options.length; i++) {
                    if (yearSelect.options[i].value === y) {
                        found = true;
                        break;
                    }
                }
                if (!found) {
                    const opt = document.createElement('option');
                    opt.value = y;
                    opt.textContent = y;
                    yearSelect.appendChild(opt);
                }
                yearSelect.value = y;
            }
        }
    }

    async sinkronisasiDataSheets() {
        this.showLoader(true);
        try {
            const response = await fetch(`${CONFIG.API_URL}?action=get_all`);
            const resJson = await response.json();
            if (resJson.status === "success") {
                this.db.transaksi = resJson.data.transaksi || [];
                this.db.tabungan = resJson.data.tabungan || [];
                
                this.initFilterTahun();
                
                // Hanya set filter otomatis pada load pertama
                if (this.isFirstLoad) {
                    this.setBulanTahunSaatIni(); // Set ke bulan & tahun sekarang
                    this.isFirstLoad = false;
                }
                
                this.prosesDanRenderTampilan();
                
                const Toast = Swal.mixin({
                    toast: true,
                    position: 'top-end',
                    showConfirmButton: false,
                    timer: 2000,
                    timerProgressBar: true
                });
                Toast.fire({
                    icon: 'success',
                    title: 'Sinkronisasi Cloud Berhasil'
                });
            } else {
                throw new Error(resJson.message);
            }
        } catch (err) {
            Swal.fire("Gagal Memuat Data", "Terjadi kegagalan komunikasi API G-Sheets: " + err.message, "error");
        } finally {
            this.showLoader(false);
        }
    }

    async postToSheets(payload) {
        this.showLoader(true);
        try {
            const response = await fetch(CONFIG.API_URL, {
                method: 'POST',
                mode: 'cors',
                headers: { 'Content-Type': 'text/plain' },
                body: JSON.stringify(payload)
            });
            const hasil = await response.json();
            if (hasil.status === "success") {
                await this.sinkronisasiDataSheets();
                return true;
            } else {
                Swal.fire("Sistem Eror", hasil.message, "error");
                return false;
            }
        } catch (e) {
            Swal.fire("Koneksi Putus", "Gagal mengirim data ke server Google. Cek setelan URL deployment.", "error");
            return false;
        } finally {
            this.showLoader(false);
        }
    }

    getFilteredTransaksi() {
        const { bln, thn } = this.getPeriodeTerpilih();
        let txFilter = this.db.transaksi;
        
        if (thn) {
            if (bln && bln !== "all") {
                const targetPeriode = `${thn}-${bln}`;
                txFilter = txFilter.filter(t => {
                    const bt = this.extractBulanTahun(t);
                    return bt === targetPeriode;
                });
            } else {
                txFilter = txFilter.filter(t => {
                    const bt = this.extractBulanTahun(t);
                    return bt && bt.startsWith(thn);
                });
            }
        }
        return txFilter;
    }

    /**
     * Mendapatkan label periode yang sedang aktif untuk ditampilkan di UI
     */
    getLabelPeriode() {
        const { bln, thn } = this.getPeriodeTerpilih();
        const namaBulan = ["", "Januari", "Februari", "Maret", "April", "Mei", "Juni",
            "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
        
        if (bln && bln !== "all") {
            return `${namaBulan[parseInt(bln)]} ${thn}`;
        }
        return `Tahun ${thn}`;
    }

    prosesDanRenderTampilan() {
        // 1. Hitung Saldo Kas Riil (Kumulatif Seluruh Waktu)
        let totalPemasukanSemua = 0;
        let totalPengeluaranSemua = 0;
        this.db.transaksi.forEach(t => {
            const nom = Number(t.nominal);
            if (t.tipe === "Pemasukan") totalPemasukanSemua += nom;
            else totalPengeluaranSemua += nom;
        });
        const totalKasAktif = totalPemasukanSemua - totalPengeluaranSemua;
        
        const statKasAktifEl = document.getElementById('statKasAktif');
        if (statKasAktifEl) {
            statKasAktifEl.textContent = this.formatRupiah(totalKasAktif);
            statKasAktifEl.style.color = totalKasAktif < 0 ? '#f43f5e' : '';
        }

        // 2. Saring Transaksi Berdasarkan Filter Global menggunakan extractBulanTahun
        const txFilter = this.getFilteredTransaksi();

        // 3. Hitung Statistik Tersaring
        let totalPendapatanFilter = 0;
        let totalPengeluaranFilter = 0;
        txFilter.forEach(t => {
            const nom = Number(t.nominal);
            if (t.tipe === "Pemasukan") totalPendapatanFilter += nom;
            else totalPengeluaranFilter += nom;
        });

        const statPendapatanEl = document.getElementById('statPendapatan');
        if (statPendapatanEl) statPendapatanEl.textContent = this.formatRupiah(totalPendapatanFilter);
        
        const statPengeluaranEl = document.getElementById('statPengeluaran');
        if (statPengeluaranEl) statPengeluaranEl.textContent = this.formatRupiah(totalPengeluaranFilter);

        // 4. Update label deskripsi stat card dengan periode aktif
        const labelPeriode = this.getLabelPeriode();
        const descPendapatan = document.getElementById('descPendapatan');
        const descPengeluaran = document.getElementById('descPengeluaran');
        if (descPendapatan) descPendapatan.textContent = `Periode: ${labelPeriode}`;
        if (descPengeluaran) descPengeluaran.textContent = `Periode: ${labelPeriode}`;

        // 5. Hitung Total Dana Terkumpul Tabungan
        let totalTabunganTerkumpul = 0;
        this.db.tabungan.forEach(tb => {
            totalTabunganTerkumpul += Number(tb.terkumpul || 0);
        });
        const statTabunganTerkumpulEl = document.getElementById('statTabunganTerkumpul');
        if (statTabunganTerkumpulEl) statTabunganTerkumpulEl.textContent = this.formatRupiah(totalTabunganTerkumpul);

        // 6. Render Komponen Tampilan
        this.renderChecklistWajib(txFilter);
        this.renderDaftarTransaksi(txFilter);
        this.renderGrafikDonut(txFilter);
        this.renderDaftarTabungan(totalKasAktif);
    }

    renderChecklistWajib(txFilter) {
        const container = document.getElementById('checklistWajib');
        if (!container) return;
        container.innerHTML = '';

        // Tampilkan label periode aktif
        const labelPeriode = this.getLabelPeriode();
        const periodBadge = document.createElement('div');
        periodBadge.className = 'checklist-period-badge';
        periodBadge.innerHTML = `<i class="fa-regular fa-calendar"></i> ${labelPeriode}`;
        container.appendChild(periodBadge);

        const keys = Object.keys(this.kategoriWajib);
        if (keys.length === 0) {
            container.innerHTML += `
                <div style="text-align: center; padding: 1.5rem; color: var(--text-muted); font-size: 0.8rem;">
                    Belum ada iuran wajib bulanan. Klik tombol <i class="fa-solid fa-gear"></i> untuk menambah.
                </div>
            `;
            return;
        }

        keys.forEach(kat => {
            const item = this.kategoriWajib[kat];
            // Cari SEMUA pembayaran untuk kategori ini dalam periode tersaring
            const pembayaranDitemukan = txFilter.filter(t => t.kategori === kat && t.tipe === "Pengeluaran");
            const jumlahBayar = pembayaranDitemukan.length;
            const totalNominal = pembayaranDitemukan.reduce((sum, t) => sum + Number(t.nominal), 0);
            
            let statusHtml = '';
            let rightHtml = '';
            
            if (jumlahBayar > 0) {
                const kaliLabel = jumlahBayar > 1 ? `(${jumlahBayar}x)` : '';
                statusHtml = `<span class="checklist-item-status lunas"><i class="fa-solid fa-circle-check"></i> Sudah Dibayar ${kaliLabel}</span>`;
                rightHtml = `<span class="checklist-item-right">${this.formatRupiah(totalNominal)}</span>`;
            } else {
                statusHtml = `<span class="checklist-item-status belum"><i class="fa-solid fa-circle-xmark"></i> Belum Dibayar</span>`;
                rightHtml = `<button class="checklist-item-pay-btn" onclick="aplikasi.rekamCepatWajib('${kat}')">Bayar</button>`;
            }

            container.innerHTML += `
                <div class="checklist-item-card">
                    <div class="checklist-item-left">
                        <div class="checklist-item-icon" style="background: ${item.color}15; color: ${item.color};">
                            <i class="fa-solid ${item.icon}"></i>
                        </div>
                        <div class="checklist-item-details">
                            <span class="checklist-item-name">${kat}</span>
                            ${statusHtml}
                        </div>
                    </div>
                    ${rightHtml}
                </div>
            `;
        });
    }

    setTxFilterType(type, btn) {
        this.txFilterType = type;
        document.querySelectorAll('.filter-btn').forEach(el => el.classList.remove('active'));
        if (btn) btn.classList.add('active');
        
        const txFilter = this.getFilteredTransaksi();
        this.renderDaftarTransaksi(txFilter);
    }

    renderDaftarTransaksi(txFilter) {
        const container = document.getElementById('daftarTransaksi');
        if (!container) return;
        container.innerHTML = '';

        let filtered = txFilter;
        if (this.txFilterType === 'pemasukan') {
            filtered = txFilter.filter(t => t.tipe === 'Pemasukan');
        } else if (this.txFilterType === 'pengeluaran') {
            filtered = txFilter.filter(t => t.tipe === 'Pengeluaran');
        }

        // Saring pencarian teks
        if (this.searchQuery.trim() !== '') {
            filtered = filtered.filter(t => 
                (t.kategori && t.kategori.toLowerCase().includes(this.searchQuery)) ||
                (t.keterangan && t.keterangan.toLowerCase().includes(this.searchQuery))
            );
        }

        if (filtered.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fa-regular fa-folder-open"></i>
                    <p>Tidak ada catatan transaksi ditemukan.</p>
                </div>
            `;
            return;
        }

        // Tampilkan jumlah transaksi
        const totalPemasukan = filtered.filter(t => t.tipe === 'Pemasukan').reduce((s, t) => s + Number(t.nominal), 0);
        const totalPengeluaran = filtered.filter(t => t.tipe !== 'Pemasukan').reduce((s, t) => s + Number(t.nominal), 0);
        
        container.innerHTML = `
            <div class="tx-summary-bar">
                <span>${filtered.length} transaksi ditemukan</span>
                <span class="tx-summary-amounts">
                    ${totalPemasukan > 0 ? `<span class="pemasukan">+${this.formatRupiah(totalPemasukan)}</span>` : ''}
                    ${totalPengeluaran > 0 ? `<span class="pengeluaran">-${this.formatRupiah(totalPengeluaran)}</span>` : ''}
                </span>
            </div>
        `;

        const terurut = [...filtered].sort((a, b) => {
            // Sort berdasarkan tanggal string agar konsisten
            const tglA = String(a.tanggal || '');
            const tglB = String(b.tanggal || '');
            return tglB.localeCompare(tglA);
        });

        terurut.forEach(t => {
            const simbol = t.tipe === "Pemasukan" ? "+" : "-";
            const kelasTipe = t.tipe === "Pemasukan" ? "pemasukan" : "pengeluaran";

            container.innerHTML += `
                <div class="tx-item">
                    <div class="tx-details">
                        <span class="tx-desc">${t.kategori} ${t.keterangan ? `<span class="tx-note">(${t.keterangan})</span>` : ''}</span>
                        <span class="tx-meta">${this.formatTanggalIndo(t.tanggal)}</span>
                    </div>
                    <div class="tx-amount-group">
                        <span class="tx-amount ${kelasTipe}">${simbol} ${this.formatRupiah(t.nominal)}</span>
                        <button class="btn-delete" onclick="aplikasi.hapusTransaksi('${t.id}')" title="Hapus"><i class="fa-regular fa-trash-can"></i></button>
                    </div>
                </div>
            `;
        });
    }

    renderDaftarTabungan(totalKasAktif) {
        this.renderTabunganRingkasan();
        this.renderTabunganLengkap(totalKasAktif);
    }

    renderTabunganRingkasan() {
        const container = document.getElementById('daftarTabunganRingkasan');
        if (!container) return;
        container.innerHTML = '';

        if (this.db.tabungan.length === 0) {
            container.innerHTML = `
                <div style="text-align: center; padding: 1rem; color: var(--text-muted); font-size: 0.8rem;">
                    Belum ada celengan rencana.
                </div>
            `;
            return;
        }

        const targets = this.db.tabungan.slice(0, 3);
        targets.forEach(tb => {
            const target = Number(tb.target);
            const terkumpul = Number(tb.terkumpul);
            let persen = Math.min(Math.round((terkumpul / target) * 100), 100);
            if (isNaN(persen)) persen = 0;

            container.innerHTML += `
                <div class="target-item">
                    <div class="target-meta">
                        <span class="target-meta-name">${tb.nama}</span>
                        <span class="target-meta-progress">${persen}% (${this.formatRupiah(target)})</span>
                    </div>
                    <div class="target-progress-track">
                        <div class="target-progress-fill" style="width: ${persen}%;"></div>
                    </div>
                </div>
            `;
        });
    }

    renderTabunganLengkap(totalKasAktif) {
        const container = document.getElementById('daftarTabunganLengkap');
        if (!container) return;
        container.innerHTML = '';

        if (this.db.tabungan.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fa-solid fa-piggy-bank"></i>
                    <p>Belum ada rencana celengan.</p>
                </div>
            `;
            return;
        }

        this.db.tabungan.forEach(tb => {
            const target = Number(tb.target);
            const terkumpul = Number(tb.terkumpul);
            let persen = Math.min(Math.round((terkumpul / target) * 100), 100);
            if (isNaN(persen)) persen = 0;

            const isSelesai = persen >= 100;
            
            let btnAksi = '';
            if (isSelesai) {
                btnAksi = `<button class="btn-claim" onclick="aplikasi.cairkanTabungan('${tb.id}', '${tb.nama}', ${terkumpul})"><i class="fa-solid fa-gift"></i> Cairkan</button>`;
            } else {
                btnAksi = `<button class="btn-topup" onclick="aplikasi.topUpTabungan('${tb.id}', ${terkumpul}, ${target}, ${totalKasAktif})"><i class="fa-solid fa-circle-arrow-up"></i> Top Up</button>`;
            }

            container.innerHTML += `
                <div class="saving-item">
                    <div class="saving-head">
                        <span><strong>${tb.nama}</strong></span>
                        <span class="saving-persen ${isSelesai ? 'selesai' : ''}">${persen}% ${isSelesai ? '<i class="fa-solid fa-circle-check"></i>' : ''}</span>
                    </div>
                    <div class="progress-bar">
                        <div class="progress-fill ${isSelesai ? 'selesai' : ''}" style="width: ${persen}%;"></div>
                    </div>
                    <div class="saving-foot">
                        <span>${this.formatRupiah(terkumpul)} / ${this.formatRupiah(target)}</span>
                        <div style="display: flex; gap: 4px;">
                            ${btnAksi}
                            <button class="btn-delete-saving" onclick="aplikasi.hapusTabungan('${tb.id}')" title="Hapus"><i class="fa-regular fa-trash-can"></i></button>
                        </div>
                    </div>
                    <div class="saving-deadline"><i class="fa-regular fa-calendar"></i> Target Batas: ${this.formatTanggalIndo(tb.deadline)}</div>
                </div>
            `;
        });
    }

    renderGrafikDonut(txFilter) {
        const canvas = document.getElementById('chartPengeluaran');
        const emptyState = document.getElementById('chartEmptyState');
        const legendList = document.getElementById('chartLegendList');
        if (!canvas || !emptyState || !legendList) return;
        
        const ctx = canvas.getContext('2d');
        
        // Kalkulasi total pengeluaran per kategori
        const summaryKategori = {};
        this.semuaKategoriPengeluaran.forEach(k => summaryKategori[k] = 0);

        // Tambahkan juga kategori yang ada di transaksi tapi tidak di daftar
        txFilter.forEach(t => {
            if (t.tipe === "Pengeluaran") {
                if (summaryKategori[t.kategori] === undefined) {
                    summaryKategori[t.kategori] = 0;
                }
                summaryKategori[t.kategori] += Number(t.nominal);
            }
        });

        const activeKategori = Object.keys(summaryKategori);
        const data = activeKategori.map(k => summaryKategori[k]);
        const totalBulanIni = data.reduce((a, b) => a + b, 0);

        if (this.chart) { this.chart.destroy(); }

        // Render Legend List
        legendList.innerHTML = '';
        const colors = ['#00c49f', '#ef4444', '#3b82f6', '#f97316', '#eab308', '#a855f7', '#64748b', '#ec4899', '#6366f1', '#14b8a6', '#8b5cf6', '#f59e0b'];
        
        activeKategori.forEach((k, idx) => {
            const color = colors[idx % colors.length];
            const nominal = summaryKategori[k] || 0;
            const percent = totalBulanIni > 0 ? ((nominal / totalBulanIni) * 100).toFixed(1) : '0.0';
            
            legendList.innerHTML += `
                <div class="donut-legend-item">
                    <div class="donut-legend-left">
                        <span class="donut-legend-bullet" style="background-color: ${color};"></span>
                        <span class="donut-legend-name">${k}</span>
                    </div>
                    <div class="donut-legend-values">
                        <span class="donut-legend-nominal">${this.formatRupiah(nominal)}</span>
                        <span class="donut-legend-percent">${percent}%</span>
                    </div>
                </div>
            `;
        });

        if (totalBulanIni === 0) {
            canvas.style.display = 'none';
            emptyState.style.display = 'block';
            return;
        }

        canvas.style.display = 'block';
        emptyState.style.display = 'none';

        const filteredLabels = activeKategori.filter(k => summaryKategori[k] > 0);
        const filteredData = filteredLabels.map(k => summaryKategori[k]);
        const filteredColors = filteredLabels.map(k => {
            const idx = activeKategori.indexOf(k);
            return colors[idx % colors.length];
        });

        this.chart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: filteredLabels,
                datasets: [{
                    data: filteredData,
                    backgroundColor: filteredColors,
                    borderWidth: 2,
                    borderColor: '#ffffff',
                    hoverOffset: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { 
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (context) => {
                                const val = context.raw;
                                return ` ${context.label}: Rp ${val.toLocaleString('id-ID')}`;
                            }
                        }
                    }
                },
                cutout: '70%'
            }
        });
    }

    async simpanTransaksi(e) {
        e.preventDefault();
        const tgl = document.getElementById('txTanggal').value;
        const tipe = document.getElementById('txTipe').value;
        const kat = document.getElementById('txKategori').value;
        const nom = document.getElementById('txNominal').value;
        const ket = document.getElementById('txKeterangan').value;
        
        if(!tgl || !nom) return;

        // Buat bulan_tahun dari tanggal yang dipilih user (bukan dari Date object)
        const blnThn = tgl.substring(0, 7);
        const payload = {
            action: "add_transaksi",
            id: 'TX-' + Date.now(),
            tanggal: tgl,
            kategori: kat,
            tipe: tipe,
            nominal: Number(nom),
            keterangan: ket,
            bulan_tahun: blnThn
        };

        const sukses = await this.postToSheets(payload);
        if (sukses) {
            document.getElementById('txNominal').value = '';
            document.getElementById('txKeterangan').value = '';
            Swal.fire("Berhasil", "Data transaksi sukses disimpan ke Google Sheets", "success");
            this.switchTab('dasbor');
        }
    }

    addMonthsToBulanTahun(bulanTahun, offset) {
        const [year, month] = bulanTahun.split('-').map(Number);
        const date = new Date(year, month - 1 + offset, 1);
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        return `${y}-${m}`;
    }

    async postMultipleToSheets(payloads) {
        this.showLoader(true);
        try {
            for (const payload of payloads) {
                const response = await fetch(CONFIG.API_URL, {
                    method: 'POST',
                    mode: 'cors',
                    headers: { 'Content-Type': 'text/plain' },
                    body: JSON.stringify(payload)
                });
                const hasil = await response.json();
                if (hasil.status !== "success") {
                    throw new Error(hasil.message || "Gagal menyimpan salah satu transaksi");
                }
            }
            await this.sinkronisasiDataSheets();
            return true;
        } catch (e) {
            Swal.fire("Koneksi Gagal", "Gagal mengirim data ke server Google: " + e.message, "error");
            return false;
        } finally {
            this.showLoader(false);
        }
    }

    async rekamCepatWajib(kategori) {
        const todayStr = new Date().toISOString().split('T')[0];
        const todayMonth = todayStr.substring(0, 7);
        const activePeriod = this.getPeriodeTerpilih();
        const defaultBulanTahun = activePeriod.bln !== "all" 
            ? `${activePeriod.thn}-${activePeriod.bln}` 
            : todayMonth;

        const { value: formValues } = await Swal.fire({
            title: `Input Pembayaran ${kategori}`,
            html: `
                <div style="text-align: left; padding: 0 0.5rem;">
                    <label style="font-size: 0.85rem; font-weight: 700; color: var(--text-muted); display: block; margin-bottom: 0.35rem;">Nominal per Bulan (Rp)</label>
                    <input id="swal-nominal" class="swal2-input" type="number" placeholder="Contoh: 600000" style="margin: 0 0 1.25rem 0; width: 100%; box-sizing: border-box; font-size: 0.9rem; padding: 0.65rem;">
                    
                    <label style="font-size: 0.85rem; font-weight: 700; color: var(--text-muted); display: block; margin-bottom: 0.35rem;">Bulan & Tahun Mulai Tagihan</label>
                    <input id="swal-bulan-tahun" class="swal2-input" type="month" value="${defaultBulanTahun}" style="margin: 0 0 1.25rem 0; width: 100%; box-sizing: border-box; font-size: 0.9rem; padding: 0.65rem;">
                    
                    <label style="font-size: 0.85rem; font-weight: 700; color: var(--text-muted); display: block; margin-bottom: 0.35rem;">Jumlah Bulan Dibayar</label>
                    <select id="swal-durasi" class="swal2-input" style="margin: 0; width: 100%; box-sizing: border-box; font-size: 0.9rem; padding: 0.65rem; height: auto;">
                        <option value="1">1 Bulan (Tagihan Bulan Ini)</option>
                        <option value="2">2 Bulan (Bulan ini & Bulan Depan)</option>
                        <option value="3">3 Bulan</option>
                        <option value="4">4 Bulan</option>
                        <option value="6">6 Bulan</option>
                        <option value="12">12 Bulan (1 Tahun)</option>
                    </select>
                </div>
            `,
            focusConfirm: false,
            showCancelButton: true,
            confirmButtonColor: '#00c49f',
            cancelButtonColor: '#64748b',
            confirmButtonText: 'Bayar Sekarang',
            cancelButtonText: 'Batal',
            preConfirm: () => {
                const nominal = document.getElementById('swal-nominal').value;
                const bulanTahun = document.getElementById('swal-bulan-tahun').value;
                const durasi = document.getElementById('swal-durasi').value;
                if (!nominal || Number(nominal) <= 0) {
                    Swal.showValidationMessage('Nominal uang tidak boleh kosong!');
                    return false;
                }
                if (!bulanTahun) {
                    Swal.showValidationMessage('Bulan & tahun tagihan harus diisi!');
                    return false;
                }
                return { nominal, bulanTahun, durasi: Number(durasi) };
            }
        });

        if (formValues) {
            const { nominal, bulanTahun, durasi } = formValues;
            const payloads = [];
            
            for (let i = 0; i < durasi; i++) {
                const targetBulanTahun = this.addMonthsToBulanTahun(bulanTahun, i);
                
                // Tanggal transaksi: gunakan tanggal 1 dari bulan target agar tersaring benar
                // Kecuali bulan saat ini, gunakan tanggal hari ini
                const tgl = (targetBulanTahun === todayMonth) ? todayStr : `${targetBulanTahun}-01`;
                
                let keterangan = "Pembayaran Cepat Bulanan";
                if (durasi > 1) {
                    keterangan += ` (Bulan ke-${i+1} dari ${durasi})`;
                }

                payloads.push({
                    action: "add_transaksi",
                    id: 'TX-' + Date.now() + '-' + i,
                    tanggal: tgl,
                    kategori: kategori,
                    tipe: "Pengeluaran",
                    nominal: Number(nominal),
                    keterangan: keterangan,
                    bulan_tahun: targetBulanTahun
                });
            }

            // Konfirmasi jika bayar banyak bulan
            if (durasi > 1) {
                const totalBayar = Number(nominal) * durasi;
                const konfirmasi = await Swal.fire({
                    title: 'Konfirmasi Pembayaran',
                    html: `
                        <div style="text-align: left; font-size: 0.9rem; line-height: 1.6;">
                            <p><strong>Kategori:</strong> ${kategori}</p>
                            <p><strong>Nominal per bulan:</strong> ${this.formatRupiah(nominal)}</p>
                            <p><strong>Jumlah bulan:</strong> ${durasi} bulan</p>
                            <p><strong>Mulai dari:</strong> ${bulanTahun}</p>
                            <hr style="margin: 0.5rem 0; border-color: #eee;">
                            <p><strong>Total Pembayaran:</strong> <span style="color: #f43f5e; font-size: 1.1rem; font-weight: 700;">${this.formatRupiah(totalBayar)}</span></p>
                            <p style="font-size: 0.8rem; color: #64748b; margin-top: 0.5rem;">Setiap bulan akan tercatat sebagai transaksi terpisah.</p>
                        </div>
                    `,
                    icon: 'info',
                    showCancelButton: true,
                    confirmButtonColor: '#00c49f',
                    cancelButtonColor: '#64748b',
                    confirmButtonText: 'Ya, Bayar Semua',
                    cancelButtonText: 'Batal'
                });
                
                if (!konfirmasi.isConfirmed) return;
            }
            
            const sukses = await this.postMultipleToSheets(payloads);
            if (sukses) {
                Swal.fire("Berhasil!", `${durasi} transaksi pembayaran "${kategori}" berhasil dicatat.`, "success");
            }
        }
    }

    async hapusTransaksi(id) {
        const tanya = await Swal.fire({
            title: 'Hapus Transaksi?',
            text: "Data pada Google Sheets akan ikut terhapus permanen.",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#ef4444',
            cancelButtonColor: '#64748b',
            confirmButtonText: 'Ya, Hapus!'
        });

        if (tanya.isConfirmed) {
            await this.postToSheets({ action: "delete_transaksi", id: id });
        }
    }

    async simpanTabungan(e) {
        e.preventDefault();
        const nama = document.getElementById('tbNama').value;
        const target = document.getElementById('tbTarget').value;
        const deadline = document.getElementById('tbDeadline').value;

        if(!nama || !target || !deadline) return;

        const payload = {
            action: "add_tabungan",
            id: 'TB-' + Date.now(),
            nama: nama,
            target: target,
            terkumpul: 0,
            deadline: deadline
        };

        const sukses = await this.postToSheets(payload);
        if(sukses) {
            document.getElementById('formTabungan').reset();
            Swal.fire("Rencana Dibuat", "Celengan impian berhasil disinkronkan ke Cloud.", "success");
            this.switchTab('dasbor');
        }
    }

    async topUpTabungan(id, danaSekarang, target, totalKasAktif) {
        const sisaKebutuhan = target - danaSekarang;
        const { value: topUpNominal } = await Swal.fire({
            title: 'Setor Dana Tabungan',
            input: 'number',
            inputLabel: `Sisa Kas Utama Anda: ${this.formatRupiah(totalKasAktif)}`,
            inputPlaceholder: `Contoh: ${Math.min(sisaKebutuhan, totalKasAktif)} (Butuh: ${this.formatRupiah(sisaKebutuhan)})`,
            showCancelButton: true,
            confirmButtonColor: '#f59e0b',
            cancelButtonColor: '#64748b',
            confirmButtonText: 'Setor',
            inputValidator: (value) => {
                if (!value || Number(value) <= 0) return 'Masukkan angka yang valid!';
                if (Number(value) > totalKasAktif) return 'Kas Anda tidak mencukupi!';
                if (Number(value) + danaSekarang > target) return 'Setoran melebihi limit target!';
            }
        });

        if (topUpNominal) {
            const nominalAngka = Number(topUpNominal);
            const tgl = new Date().toISOString().split('T')[0];
            const blnThn = tgl.substring(0, 7);

            await this.postToSheets({
                action: "add_transaksi",
                id: 'TX-' + Date.now(),
                tanggal: tgl,
                kategori: "Lain-lain",
                tipe: "Pengeluaran",
                nominal: nominalAngka,
                keterangan: `Alokasi Tabungan`,
                bulan_tahun: blnThn
            });

            await this.postToSheets({
                action: "update_tabungan",
                id: id,
                terkumpul: danaSekarang + nominalAngka
            });
            
            Swal.fire("Alokasi Berhasil", "Saldo kas dipindahkan ke tabungan rencana.", "success");
        }
    }

    async cairkanTabungan(id, nama, nominal) {
        const tanya = await Swal.fire({
            title: 'Cairkan Celengan Impian!',
            text: `Rencana "${nama}" telah terkumpul sebesar ${this.formatRupiah(nominal)}. Bagaimana Anda ingin memproses dana ini?`,
            icon: 'question',
            showCancelButton: true,
            showDenyButton: true,
            confirmButtonColor: '#10b981',
            denyButtonColor: '#3b82f6',
            cancelButtonColor: '#64748b',
            confirmButtonText: 'Kembalikan ke Kas Utama',
            denyButtonText: 'Belanjakan Langsung & Selesaikan',
            cancelButtonText: 'Batal'
        });

        if (tanya.isConfirmed) {
            const tgl = new Date().toISOString().split('T')[0];
            const blnThn = tgl.substring(0, 7);

            await this.postToSheets({
                action: "add_transaksi",
                id: 'TX-' + Date.now(),
                tanggal: tgl,
                kategori: "Pemasukan Tambahan",
                tipe: "Pemasukan",
                nominal: nominal,
                keterangan: `Pencairan Celengan: ${nama}`,
                bulan_tahun: blnThn
            });

            await this.postToSheets({ action: "delete_tabungan", id: id });
            Swal.fire("Pencairan Berhasil", "Dana berhasil dikembalikan ke kas utama dan celengan diarsipkan.", "success");

        } else if (tanya.isDenied) {
            await this.postToSheets({ action: "delete_tabungan", id: id });
            Swal.fire("Selesai!", "Celengan telah ditandai selesai dan diarsipkan.", "success");
        }
    }

    async hapusTabungan(id) {
        const tanya = await Swal.fire({
            title: 'Hapus Rencana?',
            text: "Data target impian ini akan dihapus dari sistem.",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#ef4444',
            cancelButtonColor: '#64748b',
            confirmButtonText: 'Ya, Hapus!'
        });
        if (tanya.isConfirmed) {
            await this.postToSheets({ action: "delete_tabungan", id: id });
        }
    }

    // Modal Manajemen Iuran Wajib Kustom
    bukaModalIuran() {
        const modal = document.getElementById('modalIuran');
        if (modal) {
            this.renderListIuranModal();
            modal.style.display = 'flex';
        }
    }

    tutupModalIuran() {
        const modal = document.getElementById('modalIuran');
        if (modal) {
            modal.style.display = 'none';
        }
    }

    renderListIuranModal() {
        const listContainer = document.getElementById('modalIuranList');
        if (!listContainer) return;
        
        listContainer.innerHTML = '';
        const keys = Object.keys(this.kategoriWajib);
        
        if (keys.length === 0) {
            listContainer.innerHTML = `<p style="text-align: center; color: var(--text-muted); font-size: 0.85rem; padding: 1rem;">Belum ada iuran wajib.</p>`;
            return;
        }

        keys.forEach(k => {
            const item = this.kategoriWajib[k];
            listContainer.innerHTML += `
                <div class="modal-iuran-item" style="display: flex; justify-content: space-between; align-items: center; padding: 0.5rem 0; border-bottom: 1px solid var(--card-light-border);">
                    <div style="display: flex; align-items: center; gap: 0.5rem;">
                        <i class="fa-solid ${item.icon}" style="color: ${item.color}; background: ${item.color}15; width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.8rem;"></i>
                        <span style="font-weight: 500; font-size: 0.85rem;">${k}</span>
                    </div>
                    <button onclick="aplikasi.hapusKategoriWajibKlik('${k}')" class="btn-delete" style="color: var(--danger);"><i class="fa-regular fa-trash-can"></i></button>
                </div>
            `;
        });
    }

    tambahKategoriWajibKlik(e) {
        e.preventDefault();
        const nama = document.getElementById('newIuranNama').value.trim();
        const icon = document.getElementById('newIuranIcon').value;
        const color = document.getElementById('newIuranColor').value;

        if (!nama) return;

        if (this.kategoriWajib[nama]) {
            Swal.fire("Gagal", "Nama iuran sudah terdaftar!", "warning");
            return;
        }

        this.kategoriWajib[nama] = { icon: icon, color: color };
        this.simpanKategoriWajib();
        
        document.getElementById('newIuranNama').value = '';
        this.renderListIuranModal();
        
        const Toast = Swal.mixin({
            toast: true,
            position: 'top-end',
            showConfirmButton: false,
            timer: 1500,
        });
        Toast.fire({
            icon: 'success',
            title: 'Iuran berhasil ditambahkan'
        });
    }

    hapusKategoriWajibKlik(nama) {
        Swal.fire({
            title: 'Hapus Iuran Wajib?',
            text: `Iuran "${nama}" akan dihapus dari checklist bulanan.`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#ef4444',
            cancelButtonColor: '#64748b',
            confirmButtonText: 'Ya, Hapus!'
        }).then((result) => {
            if (result.isConfirmed) {
                delete this.kategoriWajib[nama];
                this.simpanKategoriWajib();
                this.renderListIuranModal();
            }
        });
    }

    handleFilterChange() {
        this.prosesDanRenderTampilan();
    }

    switchTab(tabId) {
        document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active'));
        
        const targetView = document.getElementById('view' + tabId.charAt(0).toUpperCase() + tabId.slice(1));
        if (targetView) targetView.classList.add('active');
        
        document.querySelectorAll('.nav-tab-item').forEach(el => el.classList.remove('active'));
        document.querySelectorAll('.mobile-nav-item').forEach(el => el.classList.remove('active'));
        
        const headerBtn = document.getElementById('tabBtn-' + tabId);
        if (headerBtn) headerBtn.classList.add('active');
        
        const mobileBtn = document.getElementById('mobileTabBtn-' + tabId);
        if (mobileBtn) mobileBtn.classList.add('active');
    }

    formatRupiah(angka) {
        return 'Rp ' + Number(angka).toLocaleString('id-ID');
    }

    formatTanggalIndo(stringTanggal) {
        if(!stringTanggal) return '-';
        // Parse dari string langsung agar tidak kena UTC offset
        const tglStr = String(stringTanggal);
        const match = tglStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (match) {
            const months = ["", "Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
            const day = parseInt(match[3]);
            const month = months[parseInt(match[2])];
            const year = match[1];
            return `${day} ${month} ${year}`;
        }
        return stringTanggal;
    }
}

// Jalankan Aplikasi saat DOM siap
const aplikasi = new ManajerKeuanganRumah();
window.addEventListener('DOMContentLoaded', () => aplikasi.init());
