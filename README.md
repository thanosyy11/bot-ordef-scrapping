# 🤖 BotJahat - Automated E-Commerce Assistant

![Node.js](https://img.shields.io/badge/Node.js-v18+-green.svg)
![Playwright](https://img.shields.io/badge/Playwright-Automation-orange.svg)
![SQLite](https://img.shields.io/badge/Database-SQLite-blue.svg)

**BotJahat** adalah bot Telegram berbasis Node.js yang dirancang untuk mengotomatisasi manajemen stok dan proses checkout pada platform e-commerce. Bot ini menggunakan arsitektur antrian (queueing system) untuk menangani pesanan konkruen secara efisien dan aman.

## ✨ Fitur Utama

- **🚀 Smart Automation**: Checkout otomatis menggunakan *headless browser* (Playwright).
- **🛡️ Secure Vault**: Penyimpanan kredensial user terenkripsi (AES-256).
- **🧠 Fuzzy Search Engine**: Pencarian produk cerdas yang toleran terhadap typo (menggunakan Fuse.js).
- **qq Queue Management**: Sistem antrian FIFO untuk mencegah *server overload* dan *rate-limiting*.
- **💾 Persistent Session**: Keranjang belanja tersimpan di database SQLite (tahan restart).
- **⏰ Scheduled Tasks**: Pengecekan stok otomatis setiap pagi (Cron Job).

## 🛠️ Instalasi & Penggunaan

### Prasyarat
- Node.js v18 atau lebih baru.
- Koneksi internet stabil (untuk Playwright).

### Langkah Instalasi

1. **Clone Repository**
   ```bash
   git clone 
   cd botjahat

- Install Dependencies
npm install
npx playwright install chromium
Konfigurasi Environment Buat file .env dan isi dengan kredensial Anda:
TELEGRAM_TOKEN=your_telegram_bot_token
SECRET_KEY=kunci_rahasia_untuk_enkripsi_password
npm start

📚 Struktur Project
/lib: Berisi logika inti (Scraper, Enkripsi, Fuzzy Search).

/database: Manajemen koneksi SQLite.

bot.js: Entry point untuk interface Telegram.

⚠️ Disclaimer
Project ini dibuat untuk tujuan edukasi dan penggunaan pribadi. Pengembang tidak bertanggung jawab atas penyalahgunaan bot ini untuk aktivitas yang melanggar ToS platform target.

Developed with by [DDput]
