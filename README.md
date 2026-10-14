# Trinika Labs

Platform belajar dan pengembangan IoT open source lintas board, dengan arah pengembangan workspace 2D/3D, coding, simulasi, dan koneksi perangkat asli.

## Status

Proyek berada pada tahap fondasi. Domain sudah memodelkan proyek, terminal, koneksi, junction, dan topologi rangkaian yang independen dari UI. Validasi saat ini bersifat struktural; belum menghitung tegangan/arus atau menjalankan firmware. Halaman web masih halaman starter Next.js.

Baca [rancangan arsitektur](docs/ARCHITECTURE.md) untuk keputusan, batas modul, roadmap, dan status implementasi. Dukungan board nyata belum tersedia. Kebijakan lisensi distribusi perlu ditetapkan sebelum rilis publik.

## Menjalankan proyek

Gunakan Node.js 20.19 atau lebih baru yang kompatibel dengan paket Next.js terpasang.

```sh
npm install
npm run dev
```

Buka [localhost:3000](http://localhost:3000).

## Pemeriksaan

```sh
npm test
npm run typecheck
npm run lint
```

Tes mengompilasi `src/core/` ke `.test-build/` yang diabaikan Git, lalu menjalankan Node.js test runner. Fixture sintetis mencakup net, junction, breadboard, identitas terminal, layout independen, dan command koneksi atomik. Tidak membutuhkan simulator atau layanan eksternal.

## Struktur saat ini

```text
app/                        Routing dan halaman Next.js
src/core/domain/            Dokumen proyek dan analisis topologi
src/core/application/       Command/use case koneksi
tests/                      Pengujian domain dan use case
docs/ARCHITECTURE.md         Acuan pengembangan
```

Sebelum mengubah kode Next.js, ikuti `AGENTS.md` dan baca panduan terkait dalam `node_modules/next/dist/docs/`.
