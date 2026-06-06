class ManajerKeuanganRumah {
    constructor() {
        this.db = { transaksi: [], tabungan: [] };
        this.chart = null;
        this.txFilterType = 'semua'; // 'semua', 'pemasukan', 'pengeluaran'
        this.searchQuery = '';
        
        // Inisialisasi Kategori Wajib dari localStorage atau default
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
        
        // Perbaikan inisialisasi tab mobile & desktop
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
        const dayName = days[skrg.getDay()];
        const date = skrg.getDate();
        const monthName = months[skrg.getMonth()];
        const year = skrg.getFullYear();
        return `${dayName}, ${date} ${monthName} ${year}`;
    }

    showLoader(show) {
        document.getElementById('loadingOverlay').style.display = show ? 'flex' : 'none';
    }

    initFilterTahun() {
        const select = document.getElementById('filterTahun');
        if (!select) return;
        select.innerHTML = '';
        const thnSekarang = new Date().getFullYear();
        
        // Buat set tahun default
        const yearsSet = new Set([thnSekarang - 1, thnSekarang, thnSekarang + 1]);
        
        // Tambahkan tahun dari transaksi jika ada
        this.db.transaksi.forEach(t => {
            if (t.tanggal) {
                const y = new Date(t.tanggal).getFullYear();
                if (!isNaN(y)) yearsSet.add(y);
            }
        });

        // Urutkan tahun
        const sortedYears = Array.from(yearsSet).sort((a, b) => b - a);
        sortedYears.forEach(i => {
            let opt = document.createElement('option');
            opt.value = i; opt.textContent = i;
            if (i === thnSekarang) opt.selected = true;
            select.appendChild(opt);
        });
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

    async sinkronisasiDataSheets() {
        this.showLoader(true);
        try {
            const response = await fetch(`${CONFIG.API_URL}?action=get_all`);
            const resJson = await response.json();
            if (resJson.status === "success") {
                this.db.transaksi = resJson.data.transaksi || [];
                this.db.tabungan = resJson.data.tabungan || [];
                
                this.initFilterTahun();
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

    prosesDanRenderTampilan() {
        const { bln, thn } = this.getPeriodeTerpilih();
        
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
            statKasAktifEl.style.color = totalKasAktif < 0 ? '#f43f5e' : '#f59e0b';
        }

        // 2. Saring Transaksi Berdasarkan Filter Global (Tahun & Bulan)
        let txFilter = this.db.transaksi;
        if (thn) {
            txFilter = txFilter.filter(t => {
                if (!t.tanggal) return false;
                return new Date(t.tanggal).getFullYear().toString() === thn;
            });
        }
        if (bln && bln !== "all") {
            txFilter = txFilter.filter(t => {
                if (!t.tanggal) return false;
                const m = String(new Date(t.tanggal).getMonth() + 1).padStart(2, '0');
                return m === bln;
            });
        }

        // 3. Hitung Statistik Tersaring (Pendapatan & Pengeluaran Bulan/Tahun Ini)
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

        // 4. Hitung Total Dana Terkumpul Tabungan (Dari seluruh celengan aktif)
        let totalTabunganTerkumpul = 0;
        this.db.tabungan.forEach(tb => {
            totalTabunganTerkumpul += Number(tb.terkumpul || 0);
        });
        const statTabunganTerkumpulEl = document.getElementById('statTabunganTerkumpul');
        if (statTabunganTerkumpulEl) statTabunganTerkumpulEl.textContent = this.formatRupiah(totalTabunganTerkumpul);

        // 5. Render Komponen Tampilan
        this.renderChecklistWajib(txFilter);
        this.renderDaftarTransaksi(txFilter);
        this.renderGrafikDonut(txFilter);
        this.renderDaftarTabungan(totalKasAktif);
    }

    renderChecklistWajib(txFilter) {
        const container = document.getElementById('checklistWajib');
        if (!container) return;
        container.innerHTML = '';

        const keys = Object.keys(this.kategoriWajib);
        if (keys.length === 0) {
            container.innerHTML = `
                <div style="text-align: center; padding: 1.5rem; color: var(--text-muted); font-size: 0.8rem;">
                    Belum ada iuran wajib bulanan. Klik tombol roda gigi di tab "Riwayat & Filter" untuk menambah.
                </div>
            `;
            return;
        }

        keys.forEach(kat => {
            const item = this.kategoriWajib[kat];
            const ditemukan = txFilter.find(t => t.kategori === kat && t.tipe === "Pengeluaran");
            
            let statusHtml = '';
            let rightHtml = '';
            
            if (ditemukan) {
                statusHtml = `<span class="checklist-item-status lunas"><i class="fa-solid fa-circle-check"></i> Sudah Dibayar</span>`;
                rightHtml = `<span class="checklist-item-right">${this.formatRupiah(ditemukan.nominal)}</span>`;
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
        
        const { bln, thn } = this.getPeriodeTerpilih();
        let txFilter = this.db.transaksi;
        if (thn) {
            txFilter = txFilter.filter(t => {
                if (!t.tanggal) return false;
                return new Date(t.tanggal).getFullYear().toString() === thn;
            });
        }
        if (bln && bln !== "all") {
            txFilter = txFilter.filter(t => {
                if (!t.tanggal) return false;
                const m = String(new Date(t.tanggal).getMonth() + 1).padStart(2, '0');
                return m === bln;
            });
        }
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

        const terurut = [...filtered].sort((a,b) => new Date(b.tanggal) - new Date(a.tanggal));

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

        // Tampilkan 2-3 celengan terdekat
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

        txFilter.forEach(t => {
            if (t.tipe === "Pengeluaran" && summaryKategori[t.kategori] !== undefined) {
                summaryKategori[t.kategori] += Number(t.nominal);
            }
        });

        const activeKategori = Object.keys(summaryKategori);
        const data = activeKategori.map(k => summaryKategori[k]);
        const totalBulanIni = data.reduce((a, b) => a + b, 0);

        if (this.chart) { this.chart.destroy(); }

        // Render Legend List Dinamis di Sisi Kanan (Meskipun nominal 0, tetap tampilkan agar visualnya penuh seperti mock)
        legendList.innerHTML = '';
        const colors = ['#00c49f', '#ef4444', '#3b82f6', '#f97316', '#eab308', '#a855f7', '#64748b', '#ec4899', '#6366f1'];
        
        this.semuaKategoriPengeluaran.forEach((k, idx) => {
            const color = colors[idx] || '#64748b';
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

        // Hanya masukkan data bernilai > 0 ke ChartJS agar tidak merusak grafis donat
        const filteredLabels = activeKategori.filter(k => summaryKategori[k] > 0);
        const filteredData = filteredLabels.map(k => summaryKategori[k]);
        const filteredColors = filteredLabels.map(k => {
            const idx = this.semuaKategoriPengeluaran.indexOf(k);
            return colors[idx] || '#64748b';
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
                    legend: { 
                        display: false // Sembunyikan legenda internal Chart.js karena kita pakai kustom legend di kanan
                    },
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

        const blnThn = tgl.substring(0, 7);
        const payload = {
            action: "add_transaksi",
            id: 'TX-' + Date.now(),
            tanggal: tgl,
            kategori: kat,
            tipe: tipe,
            nominal: nom,
            keterangan: ket,
            bulan_tahun: blnThn
        };

        const sukses = await this.postToSheets(payload);
        if (sukses) {
            document.getElementById('txNominal').value = '';
            document.getElementById('txKeterangan').value = '';
            Swal.fire("Berhasil", "Data transaksi sukses disimpan ke Google Sheets", "success");
            this.switchTab('dasbor'); // Kembali ke dasbor setelah mencatat
        }
    }

    async rekamCepatWajib(kategori) {
        const tgl = new Date().toISOString().split('T')[0];
        const blnThn = tgl.substring(0, 7);

        const { value: nominal } = await Swal.fire({
            title: `Input Pembayaran ${kategori}`,
            input: 'number',
            inputLabel: 'Masukkan Jumlah Nominal Pembayaran',
            inputPlaceholder: 'Contoh: 150000',
            showCancelButton: true,
            confirmButtonColor: '#00c49f',
            cancelButtonColor: '#64748b',
            confirmButtonText: 'Bayar Sekarang',
            inputValidator: (value) => { if (!value) { return 'Nominal uang tidak boleh kosong!' } }
        });

        if (nominal) {
            const payload = {
                action: "add_transaksi",
                id: 'TX-' + Date.now(),
                tanggal: tgl,
                kategori: kategori,
                tipe: "Pengeluaran",
                nominal: nominal,
                keterangan: "Pembayaran Cepat Bulanan",
                bulan_tahun: blnThn
            };
            await this.postToSheets(payload);
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
            this.switchTab('dasbor'); // Kembali ke dasbor
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

            // Langkah 1: Kirim Log Pengurangan Saldo di tabel Transaksi
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

            // Langkah 2: Perbarui Jumlah Terkumpul di tabel Tabungan
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

            // Catat Pemasukan
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

            // Hapus celengan
            await this.postToSheets({ action: "delete_tabungan", id: id });
            Swal.fire("Pencairan Berhasil", "Dana berhasil dikembalikan ke kas utama dan celengan diarsipkan.", "success");

        } else if (tanya.isDenied) {
            // Cukup hapus tabungan
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
        // Sembunyikan seluruh section view
        document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active'));
        
        // Tampilkan section view terpilih
        const targetView = document.getElementById('view' + tabId.charAt(0).toUpperCase() + tabId.slice(1));
        if (targetView) targetView.classList.add('active');
        
        // Reset kelas active di navigasi atas & mobile
        document.querySelectorAll('.nav-tab-item').forEach(el => el.classList.remove('active'));
        document.querySelectorAll('.mobile-nav-item').forEach(el => el.classList.remove('active'));
        
        // Aktifkan tombol navigasi atas
        const headerBtn = document.getElementById('tabBtn-' + tabId);
        if (headerBtn) headerBtn.classList.add('active');
        
        // Aktifkan tombol navigasi mobile bawah
        const mobileBtn = document.getElementById('mobileTabBtn-' + tabId);
        if (mobileBtn) mobileBtn.classList.add('active');
    }

    formatRupiah(angka) {
        return 'Rp ' + Number(angka).toLocaleString('id-ID');
    }

    formatTanggalIndo(stringTanggal) {
        if(!stringTanggal) return '-';
        const dateObj = new Date(stringTanggal);
        if (isNaN(dateObj.getTime())) return stringTanggal;
        
        const opsi = { day: 'numeric', month: 'short', year: 'numeric' };
        return dateObj.toLocaleDateString('id-ID', opsi);
    }
}

// Jalankan Aplikasi saat DOM siap
const aplikasi = new ManajerKeuanganRumah();
window.addEventListener('DOMContentLoaded', () => aplikasi.init());
