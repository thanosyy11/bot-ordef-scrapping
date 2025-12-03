require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { chromium } = require('playwright');
const cron = require('node-cron'); 

// --- IMPORT MODUL BARU ---
// Kita tidak lagi pakai fs/users.json, tapi pakai modul database
const { User, Product, Cart } = require('./database/db');
const Queue = require('./lib/queue'); 
const { cariProduk } = require('./lib/fuzzy');
const DB_PRODUK_GLOBAL = require('./db_produk'); 

// --- KONFIGURASI ---
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
if (!TELEGRAM_TOKEN) {
    console.error("❌ ERROR: Token belum diisi di .env");
    process.exit(1);
}
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

console.log('🚀 BotJahat v3.0 (Database Integrated) Berjalan...');

// --- HELPER PRODUK ---
function getAllProducts(chatId) {
    // 1. Ambil produk global (bawaan file)
    const globalItems = DB_PRODUK_GLOBAL.map(item => ({...item, type: 'GLOBAL'}));
    
    // 2. Ambil produk custom dari DATABASE
    const customItemsRaw = Product.list(chatId);
    const customItems = customItemsRaw.map(item => ({
        ...item,
        type: 'CUSTOM'
    }));

    return [...globalItems, ...customItems];
}

// --- TAMPILAN MENU ---
const mainMenu = 
    `🤖 *MENU BOT OTOMASI v3.0 (SQLite)*\n\n` +
    `🔐 *AKUN & TOKO:*\n` +
    `👉 /register [email]|[pass]|[toko]\n` +
    `👉 /akunterdaftar - Cek Info Akun\n\n` +
    `📦 *PRODUK & CATALOG:*\n` +
    `👉 /cekkey - Kelola List Produk\n\n` +
    `🛒 *ORDERAN (Auto-Save):*\n` +
    `👉 /order - Cara Input Barang\n` +
    `👉 /cek - Lihat Keranjang\n` +
    `👉 /hapus [no] - Hapus Item\n` +
    `👉 /reset - Kosongkan Keranjang\n` +
    `👉 /proses - Checkout Sekarang!\n\n` +
    `⏰ *FITUR AUTO:*\n` +
    `Cek stok otomatis setiap *07:55 WIB*.`;

// --- KONFIGURASI QUEUE ---
// Ini yang dijalankan saat giliran antrian tiba
Queue.on('process', async (task) => {
    const { user, cartItems } = task;
    
    // Beritahu user kalau order sedang diproses
    bot.sendMessage(user.chatId, '⏳ *Giliran Anda tiba!* Sedang membuka sistem...', {parse_mode: 'Markdown'});
    
    // Jalankan fungsi checkout yang berat
    await jalankanCheckout(user, cartItems);
    
    // Wajib panggil ini agar antrian lanjut ke orang berikutnya
    Queue.done();
});

// ==========================================
// 1. HANDLE MESSAGE (TEXT)
// ==========================================
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    
    // Handle Reply untuk Tambah/Edit Produk
    if (msg.reply_to_message && msg.reply_to_message.text.includes('Silakan REPLY/BALAS pesan ini')) {
        handleProductInput(msg);
        return;
    }

    if (!text) return;

    // --- NAVIGASI ---
    if (text.startsWith('/start') || text.startsWith('/help') || text.startsWith('/menu') || text.startsWith('/back')) {
        bot.sendMessage(chatId, mainMenu, { parse_mode: 'Markdown' });
        return;
    }

    // --- MANAJEMEN PRODUK INTERAKTIF (/cekkey) ---
    if (text.startsWith('/cekkey') || text.startsWith('/listproduk')) {
        const allProducts = getAllProducts(chatId);

        let list = '📜 *DAFTAR PRODUK ANDA:*\n\n';
        if (allProducts.length === 0) list += "_Belum ada produk._\n";
        
        allProducts.forEach((item) => {
            const icon = item.type === 'CUSTOM' ? '👤' : '🔹';
            // Keywords di database disimpan string, tapi di db.js sudah dikonversi jadi array
            const keys = Array.isArray(item.keywords) ? item.keywords.join(', ') : item.keywords;
            list += `${icon} *${item.name}* (Key: ${keys})\n`;
        });
        
        list += '\n🔹: Global | 👤: Pribadi\n👇 *KELOLA DATA:*';

        const options = {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: '➕ Tambah Baru', callback_data: 'act_add' },
                        // Fitur edit/delete kita simpan dulu logikanya agar rapi, fokus add dulu
                        { text: '🗑️ Hapus Custom', callback_data: 'act_del' }
                    ]
                ]
            }
        };
        bot.sendMessage(chatId, list, options);
        return;
    }

    // --- REGISTRASI (DATABASE) ---
    if (text.startsWith('/register')) {
        const parts = text.replace('/register', '').trim().split('|');
        if (parts.length !== 3) return bot.sendMessage(chatId, '❌ Format: `/register email|pass|toko`', {parse_mode: 'Markdown'});
        
        try {
            // Simpan ke Database (Password otomatis dienkripsi di db.js)
            User.add({
                chatId, 
                email: parts[0].trim(), 
                password: parts[1].trim(), 
                storeName: parts[2].trim(),
                joinedAt: new Date().toISOString()
            });
            bot.sendMessage(chatId, '✅ *Register Sukses ke Database!*\nData aman & terenkripsi.\nSilakan /cekkey untuk atur produk.');
        } catch (err) {
            console.error(err);
            bot.sendMessage(chatId, '❌ Gagal simpan data. Mungkin format salah.');
        }
        return;
    }

    // --- CEK AKUN (DATABASE) ---
    if (text.startsWith('/akunterdaftar')) {
        const user = User.get(chatId); // Ambil dari DB
        if (user) {
            // Password yang tampil disini sudah didekripsi oleh db.js
            bot.sendMessage(chatId, `👤 Toko: *${user.storeName}*\n📧 ${user.email}\n🔑 Pass: (Terproteksi)`, {parse_mode: 'Markdown'});
        } else {
            bot.sendMessage(chatId, '⚠️ Belum terdaftar di database baru.');
        }
        return;
    }

    // --- CART SYSTEM (DATABASE) ---
    // Sekarang cart diambil langsung dari DB setiap kali ada request
    
    if (text.startsWith('/order')) {
        bot.sendMessage(chatId, '📝 Ketik format: `Jumlah Keyword`\nContoh:\n`5 Black Forest`\n\nBot akan otomatis menyimpan ke database.', {parse_mode: 'Markdown'});
        return;
    }

    if (text.startsWith('/cek')) {
        const cartItems = Cart.get(chatId); // Ambil dari DB
        if (cartItems.length === 0) return bot.sendMessage(chatId, '🛒 Keranjang kosong.');
        
        let list = '📋 *KERANJANG (Database):*\n';
        cartItems.forEach((item, i) => list += `${i+1}. ${item.productName} (${item.quantity})\n`);
        list += '\n🚀 *Sudah Pas?*\nKlik 👉 /proses';
        bot.sendMessage(chatId, list, { parse_mode: 'Markdown' });
        return;
    }

    if (text.startsWith('/reset')) {
        Cart.clear(chatId); // Hapus dari DB
        bot.sendMessage(chatId, '🗑️ Keranjang database dikosongkan.');
        return;
    }

    if (text.startsWith('/hapus')) {
        const cartItems = Cart.get(chatId);
        const index = parseInt(text.split(' ')[1]);
        if (!index || index > cartItems.length) return bot.sendMessage(chatId, '❌ Contoh: /hapus 1');
        
        const itemToDelete = cartItems[index-1];
        Cart.remove(itemToDelete.id); // Hapus by ID database
        
        bot.sendMessage(chatId, `✅ ${itemToDelete.productName} dihapus.\n\nKlik 👉 /cek untuk lihat sisa.`);
        return;
    }

if (text.startsWith('/proses')) {
        const user = User.get(chatId);
        if (!user) return bot.sendMessage(chatId, '❌ Register dulu (Database Baru).');
        
        const cartItems = Cart.get(chatId);
        if (cartItems.length === 0) return bot.sendMessage(chatId, '❌ Keranjang kosong.');
        
        const formattedCart = cartItems.map(item => ({
            produk: { name: item.productName, url: item.productUrl },
            qty: item.quantity
        }));

        // --- PERUBAHAN DI SINI ---
        // Jangan langsung jalankanCheckout. Masukkan ke antrian!
        Queue.add({ user, cartItems: formattedCart });

        const antrian = Queue.getLength();
        if (antrian > 0) {
            bot.sendMessage(chatId, `✅ *Masuk Antrian.*\nPosisi Anda: Ke-${antrian}.\nMohon tunggu, bot akan memproses otomatis.`, {parse_mode: 'Markdown'});
        } else {
            bot.sendMessage(chatId, `🚀 *Memproses...*\nAnda di urutan pertama.`, {parse_mode: 'Markdown'});
        }
        return;
    }

// --- INPUT ORDER (FUZZY + REGEX) ---
    if (!text.startsWith('/')) {
        const allProducts = getAllProducts(chatId);
        const lines = text.split('\n').filter(l => l.trim() !== '');
        let report = [];
        let count = 0;

        lines.forEach(line => {
            // 1. Deteksi Angka (Jumlah)
            const match = line.match(/(\d+)/);
            if (match) {
                const qty = parseInt(match[0]);
                
                // 2. Ambil sisa teks sebagai kata kunci
                // Contoh: "5 blck forest" -> keywordStr = "blck forest"
                const keywordStr = line.replace(match[0], '').trim(); 
                
                // 3. CARI PAKAI FUZZY SEARCH (Kecerdasan Baru)
                const produk = cariProduk(keywordStr, allProducts);
                
                if (produk) {
                    Cart.add(chatId, produk, qty);
                    report.push(`✅ ${produk.name} (${qty})`);
                    count++;
                } else {
                    // Jika benar-benar tidak ketemu
                    report.push(`❓ Tidak ketemu: "${keywordStr}"`);
                }
            }
        });
        
        if (report.length > 0) {
            let reply = `*Hasil Input:*\n` + report.join('\n');
            if (count > 0) {
                reply += `\n\nTotal Masuk DB: ${count} item.`;
                reply += `\n🚀 *Lanjut Checkout?*\nKlik 👉 /proses`;
            } else {
                reply += `\n\n⚠️ Tidak ada produk yang dikenali. Coba cek ejaan/keyword.`;
            }
            bot.sendMessage(chatId, reply, { parse_mode: 'Markdown' });
        }
    }
});

// ==========================================
// 2. HANDLE CALLBACK QUERY
// ==========================================
bot.on('callback_query', (callbackQuery) => {
    const chatId = callbackQuery.message.chat.id;
    const data = callbackQuery.data;

    // --- KLIK TAMBAH ---
    if (data === 'act_add') {
        const msg = 
            `➕ *TAMBAH PRODUK BARU*\n` +
            `Silakan REPLY/BALAS pesan ini dengan format:\n\n` +
            `Nama Produk | Link URL | Keyword1, Keyword2\n` +
            `_Contoh:_\n` +
            `Bolu Pisang | https://link... | pisang, bolpis`;
        
        bot.sendMessage(chatId, msg, { 
            parse_mode: 'Markdown', 
            reply_markup: { force_reply: true } 
        });
    }

    // --- KLIK HAPUS LIST ---
    if (data === 'act_del') {
        const customItems = Product.list(chatId);
        if (customItems.length === 0) {
            return bot.answerCallbackQuery(callbackQuery.id, { text: 'Belum ada produk pribadi.', show_alert: true });
        }
        
        const buttons = customItems.map((p) => {
            return [{ text: `❌ Hapus: ${p.name}`, callback_data: `del_db_${p.id}` }];
        });
        
        bot.sendMessage(chatId, '🗑️ *Pilih Produk Database yang dihapus:*', {
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: buttons }
        });
    }

    // --- EKSEKUSI HAPUS PER ITEM (DB) ---
    if (data.startsWith('del_db_')) {
        const id = parseInt(data.split('_')[2]);
        Product.delete(id);
        bot.sendMessage(chatId, `✅ Produk berhasil dihapus dari database.`);
    }
});

function handleProductInput(msg) {
    const chatId = msg.chat.id;
    const text = msg.text;
    const parts = text.split('|');
    
    if (parts.length < 3) return bot.sendMessage(chatId, '❌ Format salah. Gunakan (|).');
    
    const name = parts[0].trim();
    const url = parts[1].trim();
    const keywords = parts[2].trim(); // Simpan sebagai string di DB (comma separated)

    // Simpan ke SQLite
    try {
        Product.add(chatId, name, url, keywords);
        bot.sendMessage(chatId, `💾 *Disimpan ke Database!*\nProduk: ${name}\n\nCek di /cekkey.`);
    } catch (e) {
        bot.sendMessage(chatId, '❌ Gagal simpan DB: ' + e.message);
    }
}

// ==========================================
// 3. AUTO-STOCK & CHECKOUT
// ==========================================
cron.schedule('54 7 * * *', async () => {
    // Ambil semua user dari Database
    const users = User.getAll(); 
    console.log(`⏰ Menjalankan Cron untuk ${users.length} user...`);
    
    for (const user of users) {
        // Cek stok harian bisa menggunakan logika yang sama
        cekStokHarian(user);
    }
});

async function cekStokHarian(user) {
    let browser = null;
    try {
        bot.sendMessage(user.chatId, '🌅 *Cek Stok Pagi (07:55)*...', {parse_mode: 'Markdown'});
        browser = await chromium.launch({ headless: true });
        const context = await browser.newContext();
        const page = await context.newPage();

        await page.goto('https://siliwangibolukukus.com/my-account/');
        await page.fill('#username', user.email);
        await page.fill('#password', user.password); // Password sudah didekripsi otomatis oleh User.get/getAll
        await page.click('button[name="login"]');
        await page.waitForLoadState('networkidle');

        let ready = [], empty = [];
        const products = getAllProducts(user.chatId);

        for (const item of products) {
            try {
                await page.goto(item.url);
                if (await page.locator('.stock.out-of-stock').isVisible()) empty.push(item.name);
                else ready.push(item.name);
            } catch (e) {}
        }

        let msg = `📊 *LAPORAN STOK HARIAN*\n🏢 ${user.storeName}\n\n`;
        if (ready.length) msg += `✅ *READY:*\n${ready.join('\n')}\n\n`;
        if (empty.length) msg += `❌ *HABIS:*\n${empty.join('\n')}\n`;
        bot.sendMessage(user.chatId, msg, {parse_mode: 'Markdown'});
    } catch (e) { console.error(e); } 
    finally { if (browser) await browser.close(); }
}

async function jalankanCheckout(user, cartData) {
    
    let browser = null;
    try {
        browser = await chromium.launch({ headless: true }); // Ubah ke false jika ingin lihat browser
        const context = await browser.newContext();
        const page = await context.newPage();

        // Login
        await page.goto('https://siliwangibolukukus.com/my-account/');
        await page.fill('#username', user.email);
        await page.fill('#password', user.password); // Password decrypted
        await page.click('button[name="login"]');
        await page.waitForLoadState('networkidle');

        // Bersihkan Keranjang Web Dulu (Agar sinkron dengan bot)
        await page.goto('https://siliwangibolukukus.com/cart/');
        let retry = 0;
        while (await page.locator('.cart .product-remove a.remove').count() > 0 && retry < 10) {
            await page.locator('.cart .product-remove a.remove').first().click();
            await page.waitForTimeout(1000);
            retry++;
        }

        let sukses = [];
        let partial = [];
        let gagal = [];

        for (const item of cartData) {
            try {
                await page.goto(item.produk.url);
                
                // Cek Stok Habis
                if (await page.locator('.stock.out-of-stock').isVisible()) {
                    gagal.push(`❌ ${item.produk.name} (Stok Habis)`);
                    continue;
                }

                // Cek Max Order
                const qtyInput = page.locator('input.qty');
                const maxStock = await qtyInput.getAttribute('max');
                
                let inputQty = item.qty;
                let isPartial = false;

                if (maxStock && parseInt(maxStock) < item.qty) {
                    inputQty = parseInt(maxStock);
                    isPartial = true;
                }

                await qtyInput.fill(inputQty.toString());
                
                const btn = page.locator('button[name="add-to-cart"], button.single_add_to_cart_button').first();
                if (await btn.isVisible()) {
                    await btn.click();
                    await page.waitForTimeout(1500); // Tunggu animasi cart
                    
                    if (isPartial) {
                        partial.push(`⚠️ ${item.produk.name} (Req: ${item.qty} ➔ Dapat: ${inputQty})`);
                    } else {
                        sukses.push(`✅ ${item.produk.name} (${inputQty})`);
                    }
                } else {
                    gagal.push(`❌ ${item.produk.name} (Tombol Beli Hilang)`);
                }
            } catch (e) { 
                gagal.push(`❌ ${item.produk.name} (Error Load)`); 
            }
        }

        // Laporan
        let report = `🏁 *ORDER SELESAI*\n\n`;
        if (sukses.length > 0) report += `*BERHASIL:*\n${sukses.join('\n')}\n\n`;
        if (partial.length > 0) report += `*STOK TERBATAS:*\n${partial.join('\n')}\n\n`;
        if (gagal.length > 0) report += `*GAGAL:*\n${gagal.join('\n')}\n`;
        
        report += `\nSilakan cek website untuk pembayaran.`;

        bot.sendMessage(user.chatId, report, {parse_mode: 'Markdown'});
        
        // Kosongkan keranjang di database bot setelah checkout sukses
        Cart.clear(user.chatId);

    } catch (e) { 
        console.error(e);
        bot.sendMessage(user.chatId, `❌ Error System: ${e.message}`); 
    }
    finally { if (browser) await browser.close(); }
}