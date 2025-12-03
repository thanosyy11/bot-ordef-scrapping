const crypto = require('crypto');
require('dotenv').config();

// --- LOGIKA FIX KEY ---
// Ambil text dari .env atau gunakan default
const secretRaw = process.env.SECRET_KEY || 'rahasia_dapur_bot_jahat_v3_siliwangi';

// MENGUBAH PASSWORD JADI 32 BYTE (HASHING)
// Tidak peduli seberapa panjang secretRaw, hasilnya akan selalu 32 byte.
const ENCRYPTION_KEY = crypto.createHash('sha256').update(secretRaw).digest(); 

const IV_LENGTH = 16; // AES selalu butuh 16 byte IV

function encrypt(text) {
    if (!text) return text;
    try {
        let iv = crypto.randomBytes(IV_LENGTH);
        let cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
        let encrypted = cipher.update(text);
        encrypted = Buffer.concat([encrypted, cipher.final()]);
        return iv.toString('hex') + ':' + encrypted.toString('hex');
    } catch (e) {
        console.error("Error Encrypt:", e.message);
        throw e;
    }
}

function decrypt(text) {
    if (!text) return text;
    try {
        let textParts = text.split(':');
        let iv = Buffer.from(textParts.shift(), 'hex');
        let encryptedText = Buffer.from(textParts.join(':'), 'hex');
        let decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
        let decrypted = decipher.update(encryptedText);
        decrypted = Buffer.concat([decrypted, decipher.final()]);
        return decrypted.toString();
    } catch (error) {
        // Jangan crash kalau gagal decrypt, return null atau text asli
        console.error("Gagal dekripsi (Key mungkin berubah):", error.message);
        return null; 
    }
}

module.exports = { encrypt, decrypt };