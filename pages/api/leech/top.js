// pages/api/leech/top.js
import { createClient } from '@supabase/supabase-js';

const url =
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supa = createClient(url, key, { auth: { persistSession: false } });

export default async function handler(req, res) {
    try {
        const { type } = req.query || {};
        if (!type) {
            return res.status(400).json({ ok: false, error: 'Missing type' });
        }

        // 🎯 Lấy các thẻ ở mức 0 hoặc 1 (yếu nhất)
        const { data, error } = await supa
            .from('memory_levels')
            .select('card_id, level, leech_count, is_leech, cards(front, back)')
            .eq('type', type)
            .gte('leech_count', 1)
            .order('leech_count', { ascending: false })
            .limit(50);


        if (error) throw error;

        const rows = (data || [])
            .map((r) => ({
                card_id: r.card_id,
                front: r.cards?.front,
                back: r.cards?.back,
                level: Number.isFinite(Number(r.level)) ? Number(r.level) : null,
                leech_count: Number.isFinite(Number(r.leech_count)) ? Number(r.leech_count) : 0,
                is_leech: !!r.is_leech,
            }))
            .filter((r) => r.front && (r.level === 0 || r.level === 1));

        return res.json({ ok: true, rows });
    } catch (e) {
        return res
            .status(500)
            .json({ ok: false, error: e.message || String(e) });
    }
}
