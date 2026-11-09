// ===============================================
// 1. URL WEB APP APPS SCRIPT (BERAKHIRAN /exec)
// ===============================================
const SCRIPT_URL_SIMPAN = "https://script.google.com/macros/s/AKfycbzJo9BoqVnoNO9ddaj1nbHHb0Xo6bF80o7k3piGT50laI4_wC7QHv1wTk7iqBW9KNFw/exec";

// ===============================================
// 2. URL CSV MASTER DATA (BERAKHIRAN output=csv)
// ===============================================
const URL_MASTER_CSV = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRXvQwzAcegLkM99evCsAN10ms8GWBMmteCax4aUSVaPoPpHWt8L3UcI6PSb6lbTuAPynVj2QVzy8c-/pub?gid=0&single=true&output=csv";

// ===============================================
// 3. MASTER DATA PIC (MANUAL SESUAI EXCEL JADWAL FITTER)
// ===============================================
const dataPIC = [
    { nama: "Grup A (Teguh dkk)", mesin: ["FC121", "NP 002", "NP 316", "NP 320", "TW 002", "TW 404", "TW 405", "TW 411", "NP 322"] },
    { nama: "Grup B (Okky dkk)", mesin: ["FC118", "NP 313", "NP 314", "NP 315", "NP 321", "TW 408", "TW 409", "FC103", "NP 324"] },
    { nama: "Grup C (Agus dkk)", mesin: ["FC122", "TW 406", "HRT 001", "HRT 002", "HRT 003", "JRT 005", "JRT 006", "TL 204", "NP 323", "HRT 004"] },
    { nama: "Grup D (Slamet dkk)", mesin: ["NP 007", "NP 317", "NP 318", "NP 319", "TW 407", "TW 410", "TW 412", "TW 413", "FC108"] }
];

let semuaJobAbnormal = [];
let semuaRiwayat = [];
let globalJobCounter = 0;

// Variabel untuk menyimpan filter apa yang sedang aktif
let picAktifSekarang = "ALL"; 
let prioritasAktifSekarang = "ALL"; 

// Fungsi untuk menghilangkan spasi dan huruf besar (contoh: "TW 409" jadi "tw409")
const normalisasiTeks = (teks) => (teks || "").replace(/\s+/g, '').toLowerCase();

function previewImage(event) {
    var reader = new FileReader();
    reader.onload = function() {
        var output = document.getElementById('preview');
        output.src = reader.result;
        output.style.display = 'block';
    }
    if (event.target.files[0]) {
        reader.readAsDataURL(event.target.files[0]);
    }
}

// ===============================================
// FUNGSI MENGIRIM DATA PENGERJAAN KE APPS SCRIPT
// ===============================================
async function simpanDataPengerjaan() {
    const teknisi = document.getElementById('inputTeknisi').value.trim();
    const tindakan = document.getElementById('inputTindakan').value.trim();
    const idUnikJob = document.getElementById('hiddenJobName').value.trim(); 
    const line = document.getElementById('hiddenLine').value.trim();
    const idCard = document.getElementById('hiddenIdCard').value;
    const judulJobUI = document.getElementById('judulModalForm').getAttribute('data-namamurni') || document.getElementById('judulModalForm').innerText; 

    if(!teknisi || !tindakan) {
        alert("Mohon isi Nama Teknisi dan Tindakan Perbaikan!");
        return;
    }

    const btnSimpan = document.getElementById('btnSimpan');
    btnSimpan.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Menyimpan...';
    btnSimpan.disabled = true;

    const fotoInput = document.getElementById('fotoBukti');
    let base64String = "";
    if(fotoInput.files.length > 0) {
        base64String = document.getElementById('preview').src; 
    }

    const payload = {
        idUnik: idUnikJob,
        line: line,
        namaJob: judulJobUI, 
        teknisi: teknisi,
        tindakan: tindakan,
        fotoBase64: base64String
    };

    try {
        const response = await fetch(SCRIPT_URL_SIMPAN, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(payload)
        });
        
        const result = await response.json();
        
        if (result.status === "sukses") {
            alert("Berhasil! Job selesai dan tersimpan ke Sheet.");
            
            let waktuSekarang = new Date().toLocaleString('id-ID'); 
            semuaRiwayat.push({
                waktu: waktuSekarang,
                line: line,
                namaJob: judulJobUI,
                teknisi: teknisi,
                tindakan: tindakan,
                linkFoto: result.fileUrl || (base64String ? "Tersimpan di Google Drive" : "Tidak ada")
            });
            renderRiwayatUI(); 

            // Hapus Job dari memori
            semuaJobAbnormal = semuaJobAbnormal.filter(j => j.idUnik.trim() !== idUnikJob);
            
            // Refresh Tombol PIC, Filter Line, dan Ranking Mesin
            renderTombolPIC(); 
            terapkanFilterLine(); 
            renderRankingMesin();

            var myModalEl = document.getElementById('modalKerjakan');
            var modal = bootstrap.Modal.getInstance(myModalEl);
            modal.hide();
            
            document.getElementById('formPengerjaan').reset();
            document.getElementById('preview').style.display = 'none';
            document.getElementById('preview').src = '';
        } else {
            alert("Gagal menyimpan: " + result.pesan);
        }
    } catch (error) {
        alert("Terjadi error koneksi ke Google. Pesan: " + error.message);
    } finally {
        btnSimpan.innerHTML = '<i class="fas fa-paper-plane me-1"></i> Simpan Selesai';
        btnSimpan.disabled = false;
    }
}

// ===============================================
// LOAD SEMUA DATA DARI MASTER CSV
// ===============================================
async function loadSemuaData() {
    document.getElementById('loading-indicator').style.display = 'block';
    
    try {
        const response = await fetch(URL_MASTER_CSV + "&t=" + new Date().getTime());
        if (!response.ok) throw new Error("Gagal mengambil data dari Master CSV");
        
        const csvText = await response.text();
        
        Papa.parse(csvText, {
            header: false,
            skipEmptyLines: true,
            complete: function(results) {
                const data = results.data;
                semuaJobAbnormal = [];
                semuaRiwayat = [];
                
                for (let baris = 1; baris < data.length; baris++) {
                    let values = data[baris];
                    if(values.length < 11) continue; 
                    
                    let idUnikMaster = (values[0] || "").trim();
                    if (idUnikMaster === "") continue;

                    let statusJob = (values[10] || "").trim();
                    let namaJobLengkap = values[5] || "-";     
                    let tipeJob = namaJobLengkap.includes("Temuan Lain") ? "Temuan Lain" : "Aktivitas";

                    // DETEKSI KATEGORI PRIORITAS DARI KETERANGAN
                    let ketAwal = values[8] || "-";
                    let ketLower = ketAwal.toLowerCase(); 
                    let kategoriPrioritas = "Belum Dikategorikan";
                    let badgeWarna = "bg-secondary"; 

                    if (ketLower.includes("(p1)")) {
                        kategoriPrioritas = "P1 - Major Urgent";
                        badgeWarna = "bg-danger"; 
                    } else if (ketLower.includes("(p2)")) {
                        kategoriPrioritas = "P2 - Minor Urgent";
                        badgeWarna = "bg-warning text-dark"; 
                    } else if (ketLower.includes("(p3)")) {
                        kategoriPrioritas = "P3 - Major Non Urgent";
                        badgeWarna = "bg-primary"; 
                    } else if (ketLower.includes("(p4)")) {
                        kategoriPrioritas = "P4 - Minor Non Urgent";
                        badgeWarna = "bg-info text-dark"; 
                    }

                    if (statusJob === "Belum Dikerjakan") {
                        semuaJobAbnormal.push({
                            idUnik: idUnikMaster, 
                            tipe: tipeJob,
                            tanggal: values[1] || "-",         
                            shift: values[2] || "-",           
                            line: values[3] || "-",            
                            pelapor: values[4] || "-",         
                            namaJob: namaJobLengkap,
                            cond: values[6] || "-",            
                            rep: values[7] || "-",             
                            ket: ketAwal,             
                            lamp: values[9] || "",
                            prioritas: kategoriPrioritas,
                            warnaPrioritas: badgeWarna
                        });
                    } else if (statusJob === "Selesai") {
                        semuaRiwayat.push({
                            waktu: values[13] || "-",          
                            line: values[3] || "-",            
                            namaJob: namaJobLengkap,
                            teknisi: values[11] || "-",        
                            tindakan: values[12] || "-",       
                            linkFoto: values[14] || ""         
                        });
                    }
                }
                
                document.getElementById('loading-indicator').style.display = 'none';
                
                renderTombolPIC(); 
                inisialisasiFilterLine();
                terapkanFilterLine();
                renderRiwayatUI();
                renderRankingMesin(); // Menjalankan fitur ranking otomatis saat load
            },
            error: function(err) { 
                console.log("Error Parsing:", err);
                document.getElementById('loading-indicator').style.display = 'none';
            }
        });
    } catch (error) {
        console.log("Gagal memuat Master Data:", error);
        document.getElementById('loading-indicator').style.display = 'none';
    }
}

// ===============================================
// FUNGSI RENDER TOMBOL PIC & HITUNG JOB
// ===============================================
function renderTombolPIC() {
    const container = document.getElementById('pic-filter-container');
    if(!container) return;
    container.innerHTML = ""; 

    let btnSemuaAktif = (picAktifSekarang === "ALL") ? "btn-primary active" : "btn-outline-primary";
    container.innerHTML += `
        <button class="btn ${btnSemuaAktif} btn-sm rounded-pill btn-filter-custom btn-pic" onclick="pilihPIC('ALL')">
            Semua Mesin <span class="badge rounded-pill" id="badge-pic-all">${semuaJobAbnormal.length}</span>
        </button>
    `;

    dataPIC.forEach((pic, index) => {
        let listMesinNormal = pic.mesin.map(m => normalisasiTeks(m));
        
        let jumlahJobPIC = semuaJobAbnormal.filter(job => {
            let isUrgent = job.prioritas.includes("P1") || job.prioritas.includes("P2");
            if (isUrgent) return true; 
            return listMesinNormal.includes(normalisasiTeks(job.line));
        }).length;

        let btnKelas = (picAktifSekarang === index) ? "btn-primary active" : "btn-outline-primary";
        container.innerHTML += `
            <button class="btn ${btnKelas} btn-sm rounded-pill btn-filter-custom btn-pic" onclick="pilihPIC(${index})">
                ${pic.nama} <span class="badge rounded-pill">${jumlahJobPIC}</span>
            </button>
        `;
    });
}

function pilihPIC(indexPIC) {
    picAktifSekarang = indexPIC;
    renderTombolPIC(); 
    inisialisasiFilterLine(); 
    terapkanFilterLine(); 
}

// ===============================================
// INISIALISASI LIST DROPDOWN LINE
// ===============================================
function inisialisasiFilterLine() {
    const filterSelect = document.getElementById('filterLine');
    if (!filterSelect) return;
    filterSelect.innerHTML = '<option value="ALL">Tampilkan Semua Line</option>';

    let unikLines = new Set();
    
    semuaJobAbnormal.forEach(job => {
        if (job.line && job.line !== "-" && job.line.trim() !== "") {
            
            if(picAktifSekarang !== "ALL") {
                let listMesinNormal = dataPIC[picAktifSekarang].mesin.map(m => normalisasiTeks(m));
                let isUrgent = job.prioritas.includes("P1") || job.prioritas.includes("P2");
                
                if(listMesinNormal.includes(normalisasiTeks(job.line)) || isUrgent) {
                    unikLines.add(job.line.toUpperCase().trim());
                }
            } else {
                unikLines.add(job.line.toUpperCase().trim());
            }
        }
    });

    let daftarLineUrut = Array.from(unikLines).sort();
    daftarLineUrut.forEach(line => {
        let opt = document.createElement('option');
        opt.value = normalisasiTeks(line); 
        opt.innerHTML = "Line: " + line;
        filterSelect.appendChild(opt);
    });
}

// ===============================================
// LOGIKA UTAMA FILTERING (PIC, LINE, PRIORITAS)
// ===============================================
function terapkanFilterLine() {
    let pilihanLine = document.getElementById('filterLine') ? document.getElementById('filterLine').value : "ALL"; 
    let dataTerfilter = [];

    semuaJobAbnormal.forEach(job => {
        let lineJobNormal = normalisasiTeks(job.line);
        let masukKriteriaPIC = false;
        let masukKriteriaLine = false;
        let masukKriteriaPrioritas = false;

        // 1. FILTER PRIORITAS (Dari tombol P1-P4)
        if (prioritasAktifSekarang === "ALL") {
            masukKriteriaPrioritas = true;
        } else if (prioritasAktifSekarang === "BELUM" && job.prioritas === "Belum Dikategorikan") {
            masukKriteriaPrioritas = true;
        } else if (job.prioritas.includes(prioritasAktifSekarang)) {
            masukKriteriaPrioritas = true;
        }

        // 2. FILTER PIC (RULE: P1 dan P2 masuk ke SEMUA PIC secara otomatis!)
        let isUrgent = job.prioritas.includes("P1") || job.prioritas.includes("P2");
        if (picAktifSekarang === "ALL" || isUrgent) {
            masukKriteriaPIC = true;
        } else {
            let listMesinPICNormal = dataPIC[picAktifSekarang].mesin.map(m => normalisasiTeks(m));
            if (listMesinPICNormal.includes(lineJobNormal)) {
                masukKriteriaPIC = true;
            }
        }

        // 3. FILTER LINE SPESIFIK
        if (pilihanLine === "ALL") {
            masukKriteriaLine = true;
        } else {
            if (lineJobNormal === pilihanLine) {
                masukKriteriaLine = true;
            }
        }

        if (masukKriteriaPIC && masukKriteriaLine && masukKriteriaPrioritas) {
            dataTerfilter.push(job);
        }
    });
    
    renderJobsUI(dataTerfilter);
}

// ===============================================
// INISIALISASI EVENT KLIK UNTUK TOMBOL PRIORITAS
// ===============================================
function inisialisasiTombolPrioritas() {
    const tombolPrioritas = document.querySelectorAll('#prioritas-filter-container .btn');
    if(!tombolPrioritas.length) return;

    tombolPrioritas.forEach(btn => {
        btn.addEventListener('click', function() {
            tombolPrioritas.forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            prioritasAktifSekarang = this.getAttribute('data-prioritas');
            terapkanFilterLine();
        });
    });
}

// ===============================================
// RENDER UI UNTUK TAB JOB AKTIF 
// ===============================================
function renderJobsUI(dataJobs) {
    document.getElementById('count-job').innerText = dataJobs.length;
    const container = document.getElementById('job-container');
    container.innerHTML = ""; 

    if (dataJobs.length === 0) {
        container.innerHTML = `<div class="col-12"><div class="alert alert-success text-center"><i class="fas fa-check-circle me-2"></i>Tidak ada job untuk kriteria ini.</div></div>`;
        return;
    }

    dataJobs.forEach(job => {
        globalJobCounter++;
        let cardId = "jobCard-" + globalJobCounter;
        let linkLampiranHtml = job.lamp !== "" && job.lamp !== "-" ? `<a href="${job.lamp}" target="_blank" class="text-primary text-decoration-underline ms-1"><i class="fas fa-external-link-alt"></i> Buka File</a>` : "<span class='text-muted ms-1'>Tidak ada</span>";
        let kondisiHTML = job.tipe === "Temuan Lain" ? `<p class="mb-1 small">Status: <span class="badge bg-warning text-dark">${job.cond}</span></p>` : `<p class="mb-1 small">Kondisi: <span class="text-danger fw-bold">${job.cond}</span> | Replace: <span class="text-danger fw-bold">${job.rep}</span></p>`;
        let namaTampilUI = job.namaJob.replace(/"/g, '&quot;').replace(/\n/g, ' ');
        let safeLine = String(job.line).replace(/"/g, '&quot;').replace(/\n/g, ' ');
        let safeIdUnik = encodeURIComponent(job.idUnik);

        let borderClass = "border-secondary";
        if (job.warnaPrioritas === "bg-danger") borderClass = "border-danger";
        else if (job.warnaPrioritas === "bg-warning text-dark") borderClass = "border-warning";
        else if (job.warnaPrioritas === "bg-primary") borderClass = "border-primary";
        else if (job.warnaPrioritas === "bg-info text-dark") borderClass = "border-info";

        let cardHTML = `
            <div class="col-md-6 col-12" id="${cardId}">
                <div class="card card-job shadow-sm border-start-4 ${borderClass}">
                    <div class="card-body">
                        <div class="d-flex justify-content-between align-items-start mb-2">
                            <h6 class="card-title text-primary fw-bold mb-0">
                                <i class="fas ${job.tipe === 'Temuan Lain' ? 'fa-exclamation-triangle text-warning' : 'fa-wrench'} me-1"></i> 
                                ${namaTampilUI}
                            </h6>
                            <div class="text-end" style="min-width: fit-content;">
                                <span class="badge bg-danger badge-status mb-1">Menunggu</span><br>
                                <span class="badge ${job.warnaPrioritas} badge-status">${job.prioritas}</span>
                            </div>
                        </div>
                        <p class="text-muted mb-2" style="font-size: 0.8rem;">
                            <i class="fas fa-industry me-1"></i> Line: <strong class="text-dark">${job.line}</strong> | 
                            <i class="fas fa-calendar-alt ms-1 me-1"></i> ${job.tanggal} (Shift ${job.shift}) |
                            <i class="fas fa-user ms-1 me-1"></i> By: ${job.pelapor}
                        </p>
                        <div class="detail-box">
                            ${kondisiHTML}
                            <p class="mb-1 small"><strong>Keterangan:</strong> <br><span class="text-dark">${job.ket.replace(/\n/g, '<br>')}</span></p>
                            <p class="mb-0 small"><strong>Lampiran Pelapor:</strong> ${linkLampiranHtml}</p>
                        </div>
                        
                        <button class="btn btn-primary w-100 btn-sm" data-bs-toggle="modal" data-bs-target="#modalKerjakan" data-job="${safeIdUnik}" data-namauntukui="${namaTampilUI}" data-line="${safeLine}" data-cardid="${cardId}" onclick="siapkanForm(this)">
                            <i class="fas fa-tools me-1"></i> Kerjakan
                        </button>
                    </div>
                </div>
            </div>
        `;
        container.innerHTML += cardHTML;
    });
}

function siapkanForm(tombolDipencet) {
    let idUnik = decodeURIComponent(tombolDipencet.getAttribute('data-job')); 
    let namaJobUI = tombolDipencet.getAttribute('data-namauntukui'); 
    let line = tombolDipencet.getAttribute('data-line');
    let idCard = tombolDipencet.getAttribute('data-cardid');

    document.getElementById('hiddenJobName').value = idUnik; 
    document.getElementById('hiddenLine').value = line;
    document.getElementById('hiddenIdCard').value = idCard;
    
    let elJudul = document.getElementById('judulModalForm');
    elJudul.innerText = "Line " + line + " - " + namaJobUI;
    elJudul.setAttribute('data-namamurni', namaJobUI); 
}

// ===============================================
// RENDER UI UNTUK TAB RIWAYAT SELESAI
// ===============================================
function renderRiwayatUI() {
    const container = document.getElementById('pills-done');
    
    if (semuaRiwayat.length === 0) {
        container.innerHTML = `<div class="alert alert-info">Belum ada riwayat pekerjaan yang diselesaikan.</div>`;
        return;
    }

    let html = `<div class="table-responsive"><table class="table table-hover table-bordered mt-2 bg-white">
                    <thead class="table-dark">
                        <tr>
                            <th>Waktu Selesai</th>
                            <th>Line</th>
                            <th>Nama Job</th>
                            <th>Teknisi</th>
                            <th>Tindakan</th>
                            <th>Bukti Foto</th>
                        </tr>
                    </thead>
                    <tbody>`;
    
    let reversedRiwayat = [...semuaRiwayat].reverse();

    reversedRiwayat.forEach(item => {
        let fotoHtml = (item.linkFoto && item.linkFoto.includes("http")) 
            ? `<a href="${item.linkFoto}" target="_blank" class="btn btn-sm btn-info text-white"><i class="fas fa-image"></i> Lihat</a>` 
            : `<span class="text-muted small">${item.linkFoto || "Tidak ada"}</span>`;

        html += `<tr>
                    <td>${item.waktu}</td>
                    <td>${item.line}</td>
                    <td>${item.namaJob}</td>
                    <td>${item.teknisi}</td>
                    <td>${item.tindakan}</td>
                    <td>${fotoHtml}</td>
                 </tr>`;
    });

    html += `</tbody></table></div>`;
    container.innerHTML = html;
}

// ===============================================
// LOGIKA BARU: RANKING / PERINGKAT MESIN
// ===============================================
function renderRankingMesin() {
    const container = document.getElementById('ranking-container');
    if (!container) return;

    let hitunganLine = {};

    // 1. Looping semua job untuk menghitung P1, P2, P4
    semuaJobAbnormal.forEach(job => {
        let prioritas = job.prioritas;
        let isTarget = prioritas.includes("P1") || prioritas.includes("P2") || prioritas.includes("P4");

        if (isTarget && job.line && job.line !== "-") {
            let namaLine = job.line.toUpperCase().trim();
            
            if (!hitunganLine[namaLine]) {
                // Buat objek awal jika Line belum ada di hash map
                hitunganLine[namaLine] = { total: 0, p1: 0, p2: 0, p4: 0 };
            }
            
            // Tambah hitungan total
            hitunganLine[namaLine].total += 1;
            
            // Tambah hitungan spesifik
            if (prioritas.includes("P1")) hitunganLine[namaLine].p1 += 1;
            if (prioritas.includes("P2")) hitunganLine[namaLine].p2 += 1;
            if (prioritas.includes("P4")) hitunganLine[namaLine].p4 += 1;
        }
    });

    // 2. Ubah format objek menjadi array agar bisa di-sort
    let arrayRanking = [];
    for (let line in hitunganLine) {
        arrayRanking.push({
            line: line,
            total: hitunganLine[line].total,
            p1: hitunganLine[line].p1,
            p2: hitunganLine[line].p2,
            p4: hitunganLine[line].p4
        });
    }

    // 3. Sorting (urutan) dari total terbesar ke terkecil
    arrayRanking.sort((a, b) => b.total - a.total);

    // 4. Render ke UI
    if (arrayRanking.length === 0) {
        container.innerHTML = `<div class="alert alert-success mt-3 text-center"><i class="fas fa-check-circle me-2"></i>Tidak ada data masalah P1, P2, atau P4 saat ini. Mesin aman!</div>`;
        return;
    }

    let html = `
        <div class="table-responsive mt-3">
            <table class="table table-hover table-bordered bg-white shadow-sm">
                <thead class="table-danger">
                    <tr class="text-center">
                        <th width="10%">Peringkat</th>
                        <th width="30%" class="text-start">Line Mesin</th>
                        <th width="15%">Total Masalah (P1,P2,P4)</th>
                        <th>Detail Breakdown</th>
                    </tr>
                </thead>
                <tbody>
    `;

    arrayRanking.forEach((data, index) => {
        let nomor = index + 1;
        let badgePeringkat = `<span class="fw-bold">${nomor}</span>`;
        let textTebal = "";

        // Highlight top 3 menggunakan icon
        if (nomor === 1) { badgePeringkat = `<i class="fas fa-medal text-warning medal-icon"></i>`; textTebal = "fw-bold text-danger"; }
        if (nomor === 2) { badgePeringkat = `<i class="fas fa-medal text-secondary medal-icon"></i>`; textTebal = "fw-bold text-danger"; }
        if (nomor === 3) { badgePeringkat = `<i class="fas fa-medal medal-icon" style="color: #cd7f32;"></i>`; textTebal = "fw-bold text-danger"; }

        html += `
            <tr class="ranking-row text-center align-middle">
                <td>${badgePeringkat}</td>
                <td class="text-start ${textTebal}">LINE: ${data.line}</td>
                <td><span class="badge bg-danger fs-6">${data.total}</span> Kasus</td>
                <td class="text-start">
                    <span class="badge bg-danger me-1">P1: ${data.p1}</span>
                    <span class="badge bg-warning text-dark me-1">P2: ${data.p2}</span>
                    <span class="badge bg-info text-dark">P4: ${data.p4}</span>
                </td>
            </tr>
        `;
    });

    html += `</tbody></table></div>`;
    container.innerHTML = html;
}

// ===============================================
// PERINTAH SAAT WEBSITE PERTAMA KALI DIBUKA
// ===============================================
window.onload = () => { 
    loadSemuaData(); 
    inisialisasiTombolPrioritas(); 
};