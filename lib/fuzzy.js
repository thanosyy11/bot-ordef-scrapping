// lib/fuzzy.js
const Fuse = require('fuse.js');

function cariProduk(query, listProduk) {
    // Konfigurasi seberapa "pintar" dia menebak
    const options = {
        includeScore: true,
        keys: ['name', 'keywords'], // Cari di Nama & Keyword
        threshold: 0.4, // 0.0 = Harus Sama Persis, 1.0 = Cocokin Apa Aja. 0.4 Ideal buat typo.
        ignoreLocation: true
    };

    const fuse = new Fuse(listProduk, options);
    const result = fuse.search(query);

    // Ambil hasil pertama (paling relevan) jika ada
    if (result.length > 0) {
        return result[0].item;
    }
    return null;
}

module.exports = { cariProduk };