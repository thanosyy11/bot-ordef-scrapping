// lib/queue.js
const EventEmitter = require('events');

class SimpleQueue extends EventEmitter {
    constructor(concurrency = 1) {
        super();
        this.queue = [];
        this.processing = 0;
        this.concurrency = concurrency; // Berapa browser boleh buka sekaligus (Saran: 1)
    }

    add(taskData) {
        this.queue.push(taskData);
        this.next();
    }

    async next() {
        // Jika sedang penuh atau antrian kosong, berhenti
        if (this.processing >= this.concurrency || this.queue.length === 0) {
            return;
        }

        const task = this.queue.shift(); // Ambil tugas paling depan
        this.processing++;

        try {
            // Beritahu bot.js bahwa ada tugas yang harus dikerjakan
            this.emit('process', task); 
        } catch (err) {
            console.error('Queue Error:', err);
            this.processing--;
            this.next();
        }
    }

    // Panggil ini dari bot.js kalau checkout sudah selesai (sukses/gagal)
    done() {
        this.processing--;
        this.next(); // Lanjut ke tugas berikutnya
    }

    getLength() {
        return this.queue.length;
    }
}

module.exports = new SimpleQueue(1); // Default 1 proses sekaligus