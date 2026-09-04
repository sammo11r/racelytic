class MemoryRateLimiter {
    constructor({ windowMs, limit, maxEntries = 10000 }) {
        this.windowMs = windowMs;
        this.limit = limit;
        this.maxEntries = maxEntries;
        this.entries = new Map();
        this.lastSweep = 0;
    }

    sweep(now) {
        if (now - this.lastSweep < this.windowMs && this.entries.size < this.maxEntries) return;
        for (const [key, entry] of this.entries) {
            if (entry.resetAt <= now) this.entries.delete(key);
        }
        this.lastSweep = now;
        if (this.entries.size >= this.maxEntries) {
            const overflow = this.entries.size - this.maxEntries + 1;
            [...this.entries.keys()].slice(0, overflow).forEach(key => this.entries.delete(key));
        }
    }

    consume(key) {
        const now = Date.now();
        this.sweep(now);
        const normalizedKey = String(key || 'unknown');
        const existing = this.entries.get(normalizedKey);
        const entry = !existing || existing.resetAt <= now
            ? { count: 0, resetAt: now + this.windowMs }
            : existing;
        entry.count += 1;
        this.entries.set(normalizedKey, entry);
        return entry.count > this.limit;
    }

    reset(key) {
        this.entries.delete(String(key || 'unknown'));
    }
}

module.exports = { MemoryRateLimiter };
