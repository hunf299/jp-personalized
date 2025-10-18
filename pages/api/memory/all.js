// /pages/api/memory/all.js (env client + no 'category')
import { createClient } from '@supabase/supabase-js';
const url  = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const key  = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
const supa = createClient(url, key, { auth: { persistSession: false } });

export default async function handler(req, res) {
    try {
        const type = String(req.query.type || '');
        const { data, error } = await supa
            .from('memory_levels')
            .select('card_id, type, level, stability, difficulty, last_reviewed_at, due, leech_count, is_leech, cards:card_id(id,type,front,back)')
            .order('updated_at', { ascending: false });
        if (error) throw error;

        let rows = (data||[]).map(r => ({
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
            is_leech: !!r.is_leech,
        }));

        if (type) rows = rows.filter(r => r.type === type);

        const dist = [0,0,0,0,0,0];
        rows.forEach(r => { if (r.level >= 0 && r.level <= 5) dist[r.level] += 1; });

        res.json({ ok: true, type: type || null, total: rows.length, dist, rows });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message || String(e) });
    }
}
