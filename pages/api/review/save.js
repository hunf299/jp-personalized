// /api/review/save.js
import { supabase } from '../../lib/supabase';
import { planNext } from '../../lib/fsrs';

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

    try {
        const { cards, type } = req.body;
        if (!Array.isArray(cards)) return res.status(400).json({ ok: false, error: 'Invalid payload' });

        const updates = cards.map((c) => {
            const next = planNext(c, c.final ?? 0);
            return {
                card_id: c.card_id,
                type,
                level: next.level,
                stability: next.stability,
                difficulty: next.difficulty,
                last_reviewed_at: next.last_reviewed_at,
                due: next.due,
            };
        });

        // Upsert vào memory_levels
        const { error } = await supabase
            .from('memory_levels')
            .upsert(updates, { onConflict: 'card_id' });

        if (error) throw error;
        return res.json({ ok: true, count: updates.length });
    } catch (err) {
        console.error('[save]', err);
        return res.status(500).json({ ok: false, error: err.message || String(err) });
    }
}
