const crypto = require('node:crypto');

const DEFAULT_TTL_MS = 30 * 60 * 1000;
const DEFAULT_MAX_CONVERSATIONS = 5000;
const DEFAULT_MAX_TURNS = 12;

function validConversationId(value) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
        .test(String(value || ''));
}

class AskConversationStore {
    constructor({ ttlMs = DEFAULT_TTL_MS, maxConversations = DEFAULT_MAX_CONVERSATIONS, maxTurns = DEFAULT_MAX_TURNS } = {}) {
        this.ttlMs = ttlMs;
        this.maxConversations = maxConversations;
        this.maxTurns = maxTurns;
        this.conversations = new Map();
    }

    sweep(now = Date.now()) {
        for (const [id, conversation] of this.conversations) {
            if (conversation.expiresAt <= now) this.conversations.delete(id);
        }
        while (this.conversations.size >= this.maxConversations) {
            this.conversations.delete(this.conversations.keys().next().value);
        }
    }

    get(id, series) {
        if (!validConversationId(id)) return null;
        const conversation = this.conversations.get(id);
        if (!conversation || conversation.expiresAt <= Date.now()) {
            if (conversation) this.conversations.delete(id);
            return null;
        }
        if (conversation.series !== series) return null;
        return conversation;
    }

    remember({ id, series, query, answer, context, tool }) {
        const now = Date.now();
        this.sweep(now);
        const existing = this.get(id, series);
        const conversation = existing || {
            id: crypto.randomUUID(),
            series,
            createdAt: now,
            turns: []
        };
        conversation.context = { ...context };
        conversation.turns.push({
            query: String(query || '').slice(0, 300),
            answer: String(answer || '').slice(0, 500),
            intent: context?.intent || null,
            tool: tool || null
        });
        conversation.turns = conversation.turns.slice(-this.maxTurns);
        conversation.updatedAt = now;
        conversation.expiresAt = now + this.ttlMs;
        this.conversations.delete(conversation.id);
        this.conversations.set(conversation.id, conversation);
        return conversation;
    }

    publicView(conversation) {
        return {
            id: conversation.id,
            turnCount: conversation.turns.length,
            expiresInSeconds: Math.max(0, Math.round((conversation.expiresAt - Date.now()) / 1000)),
            turns: conversation.turns.map(({ query, answer, intent, tool }) => ({ query, answer, intent, tool }))
        };
    }

    delete(id) {
        if (!validConversationId(id)) return false;
        return this.conversations.delete(id);
    }
}

module.exports = { AskConversationStore, validConversationId };
