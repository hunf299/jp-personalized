// /pages/api/memory/all.js (env client + no 'category')
import { createClient } from '@supabase/supabase-js';
const url  = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const key  = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
const supa = createClient(url, key, { auth: { persistSession: false } });

const normalizeBoolean = (value) => {
    if (value === true || value === false) return value;
    if (value === 1 || value === '1') return true;
    if (value === 0 || value === '0') return false;
    if (typeof value === 'string') {
        const lower = value.toLowerCase();
        if (['t', 'true', 'yes', 'y'].includes(lower)) return true;
        if (['f', 'false', 'no', 'n'].includes(lower)) return false;
    }
    return Boolean(value);
};

export default async function handler(req, res) {
    try {
        const type = String(req.query.type || '');
        const sinceDaysRaw = req.query.since_days != null ? Number(req.query.since_days) : null;
        const dueOnly = ['1', 'true', 'yes'].includes(String(req.query.due_only || '').toLowerCase());

        let query = supa
            .from('memory_levels')
            .select('card_id, type, level, stability, difficulty, last_reviewed_at, due, leech_count, is_leech, cards:card_id(id,type,front,back,deleted)')
            .eq('cards.deleted', false)
            .order('due', { ascending: true })
            .order('updated_at', { ascending: false });

        if (type) query = query.eq('type', type);
        if (Number.isFinite(sinceDaysRaw) && sinceDaysRaw >= 0) {
            const threshold = new Date(Date.now() - sinceDaysRaw * 86400000).toISOString();
            query = query.gte('last_reviewed_at', threshold);
        }
        if (dueOnly) {
            query = query.lte('due', new Date().toISOString());
        }

        const { data, error } = await query;
        if (error) throw error;

        let rows = (data||[])
            .filter(r => r?.cards && !r.cards.deleted)
            .map(r => ({
            card_id: r.card_id,
            type: r.type || r.cards?.type || null,
            level: Number(r.level ?? 0),
            stability: Number(r.stability ?? 1),
            difficulty: Number(r.difficulty ?? 5),
            last_reviewed_at: r.last_reviewed_at || null,
            due: r.due || null,
            front: r.cards?.front ?? null,
            back: r.cards?.back ?? null,
            leech_count: Number.isFinite(Number(r.leech_count)) ? Number(r.leech_count) : 0,
            is_leech: normalizeBoolean(r.is_leech),
        }));

        if (type) rows = rows.filter(r => r.type === type);

        const dist = [0,0,0,0,0,0];
        rows.forEach(r => { if (r.level >= 0 && r.level <= 5) dist[r.level] += 1; });

        res.json({ ok: true, type: type || null, total: rows.length, dist, rows });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message || String(e) });
    }
}
