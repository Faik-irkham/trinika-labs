# Trinika Labs

Platform belajar dan pengembangan IoT open source lintas board, dengan arah pengembangan workspace 2D/3D, coding, simulasi, dan koneksi perangkat asli.

## Status

Proyek berada pada tahap fondasi. Domain sudah memodelkan proyek, terminal, koneksi, junction, dan topologi rangkaian yang independen dari UI. Registry berversi mencatat kemampuan board/component secara terpisah. Parser dan serializer JSON memeriksa bentuk dokumen, referensi rangkaian, target, dan layout sebelum impor/ekspor.

Halaman utama sekarang berisi workspace MVVM: katalog, kanvas wiring 2D, panel properti, editor teks file kode, undo/redo, penyimpanan lokal manual, serta impor/ekspor JSON. Katalog awal menyediakan papan latihan generik, LED, resistor, tombol, dan satu baris breadboard.

Validasi saat ini bersifat struktural; belum menghitung tegangan/arus atau menjalankan firmware. Papan latihan tidak mengklaim pinout MCU nyata. Renderer 3D, compiler, simulator, dan upload belum tersedia.

Baca [rancangan arsitektur](docs/ARCHITECTURE.md) untuk keputusan, batas modul, roadmap, dan status implementasi. Dukungan board nyata belum tersedia. Kebijakan lisensi distribusi perlu ditetapkan sebelum rilis publik.

## Menjalankan proyek

Gunakan Node.js 20.19 atau lebih baru yang kompatibel dengan paket Next.js terpasang.

```sh
npm install
npm run dev
```

Buka [localhost:3000](http://localhost:3000).

Klik kartu katalog untuk menambah komponen. Pilih dua terminal untuk membuat kabel. Geser komponen atau gunakan tombol panah saat komponen mendapat fokus; panel properti juga menyediakan koordinat X/Y. Daftar “Di rangkaian” dapat memilih komponen yang berada di luar viewport.

Simpan lokal memakai penyimpanan browser ini; ekspor JSON untuk cadangan. Perubahan field diterapkan saat kehilangan fokus, Enter untuk input, atau sebelum shortcut simpan. `Ctrl/Cmd+S` menyimpan lokal; `Ctrl/Cmd+Z` dan `Ctrl/Cmd+Shift+Z` mengelola riwayat di luar field teks. Escape membatalkan pilihan pin. Impor dapat dibatalkan melalui Undo. Tidak ada autosave pada tahap ini.

## Pemeriksaan

```sh
npm test
npm run typecheck
npm run lint
npm run build
```

Tes mengompilasi core dan controller/projection workspace ke `.test-build/` yang diabaikan Git, lalu menjalankan Node.js test runner. Pengujian mencakup topologi, registry, format proyek, riwayat edit, koneksi, projection pin, dan kegagalan penyimpanan. Tidak membutuhkan simulator atau layanan eksternal.

Pada lingkungan yang memblokir port internal Turbopack, pemeriksaan build alternatif menggunakan `npm run build -- --webpack`. Aplikasi memakai font sistem agar build tidak membutuhkan unduhan font.

## Struktur saat ini

```text
app/                        Routing dan halaman Next.js
src/core/domain/            Dokumen proyek, topologi, dan registry
src/core/application/       Command/use case koneksi
src/core/project-format/    Decoder, parser, dan serializer JSON
src/core/catalog/           Definisi dan simbol generik awal
src/features/workspace/     Views, controller ViewModel, dan hook React
tests/                      Pengujian domain dan use case
docs/ARCHITECTURE.md         Acuan pengembangan
```

Sebelum mengubah kode Next.js, ikuti `AGENTS.md` dan baca panduan terkait dalam `node_modules/next/dist/docs/`.
