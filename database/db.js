const Database = require('better-sqlite3');
const { encrypt, decrypt } = require('../lib/crypto');
const path = require('path');

// Buat file database otomatis
const dbPath = path.join(__dirname, 'bot_data.db');
const db = new Database(dbPath); // verbose: console.log untuk debug query

// --- 1. INISIALISASI TABEL (Schema) ---
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    chatId INTEGER PRIMARY KEY,
    email TEXT NOT NULL,
    password TEXT NOT NULL,
    storeName TEXT,
    joinedAt TEXT
  );

  CREATE TABLE IF NOT EXISTS custom_products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chatId INTEGER,
    name TEXT,
    url TEXT,
    keywords TEXT,
    FOREIGN KEY(chatId) REFERENCES users(chatId)
  );

  CREATE TABLE IF NOT EXISTS cart (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chatId INTEGER,
    productName TEXT,
    productUrl TEXT,
    quantity INTEGER,
    status TEXT DEFAULT 'pending'
  );
`);

console.log('📦 Database SQLite siap digunakan di:', dbPath);

// --- 2. FUNGSI USER ---
const User = {
    add: (data) => {
        const stmt = db.prepare('INSERT OR REPLACE INTO users (chatId, email, password, storeName, joinedAt) VALUES (?, ?, ?, ?, ?)');
        // Enkripsi password sebelum masuk DB
        const securePass = encrypt(data.password);
        return stmt.run(data.chatId, data.email, securePass, data.storeName, data.joinedAt);
    },

    get: (chatId) => {
        const stmt = db.prepare('SELECT * FROM users WHERE chatId = ?');
        const user = stmt.get(chatId);
        if (user) {
            // Dekripsi password saat diambil
            user.password = decrypt(user.password);
        }
        return user;
    },
    
    getAll: () => {
        const stmt = db.prepare('SELECT * FROM users');
        const users = stmt.all();
        return users.map(u => ({ ...u, password: decrypt(u.password) }));
    }
};

// --- 3. FUNGSI PRODUK CUSTOM ---
const Product = {
    add: (chatId, name, url, keywords) => {
        const stmt = db.prepare('INSERT INTO custom_products (chatId, name, url, keywords) VALUES (?, ?, ?, ?)');
        return stmt.run(chatId, name, url, keywords);
    },

    list: (chatId) => {
        const stmt = db.prepare('SELECT * FROM custom_products WHERE chatId = ?');
        const rows = stmt.all(chatId);
        // Convert string keywords kembali ke array agar format sama dengan kode lama
        return rows.map(r => ({ ...r, keywords: r.keywords.split(',') }));
    },

    delete: (id) => {
        const stmt = db.prepare('DELETE FROM custom_products WHERE id = ?');
        return stmt.run(id);
    }
};

// --- 4. FUNGSI KERANJANG (CART) ---
// Ini menggantikan variable 'sessions' di RAM
const Cart = {
    add: (chatId, product, qty) => {
        const stmt = db.prepare('INSERT INTO cart (chatId, productName, productUrl, quantity) VALUES (?, ?, ?, ?)');
        return stmt.run(chatId, product.name, product.url, qty);
    },

    get: (chatId) => {
        const stmt = db.prepare('SELECT * FROM cart WHERE chatId = ?');
        return stmt.all(chatId);
    },

    remove: (id) => {
        const stmt = db.prepare('DELETE FROM cart WHERE id = ?');
        return stmt.run(id);
    },

    clear: (chatId) => {
        const stmt = db.prepare('DELETE FROM cart WHERE chatId = ?');
        return stmt.run(chatId);
    }
};

module.exports = { db, User, Product, Cart };