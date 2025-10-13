// pages/api/memory/level.js
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase =
    url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });
    if (!supabase) return res.status(500).json({ ok: false, error: 'Missing SUPABASE env' });

    try {
        const {
            card_id,
            type: clientType,
            new_level,
            base_level,
            auto_active,
            source,
            final,
            quality: qualityFromClient,
        } = req.body || {};

        if (!card_id) return res.status(400).json({ ok: false, error: 'card_id required' });

        const lvl = Number(new_level);
        const base = Number.isFinite(Number(base_level)) ? Number(base_level) : null;
        if (!Number.isFinite(lvl)) {
            return res.status(400).json({ ok: false, error: 'new_level must be a number' });
        }

        // Chọn quality: ưu tiên client gửi lên, nếu thiếu thì suy ra từ base -> lvl
        let quality = Number(qualityFromClient);
        if (!Number.isFinite(quality)) {
            if (base === null) quality = lvl >= 4 ? 5 : (lvl >= 2 ? 3 : 1);
            else quality = lvl > base ? 5 : (lvl === base ? 3 : 1);
        }

        // 1) Upsert memory_levels
        const now = new Date().toISOString();
        const upsertRow = {
            card_id: String(card_id),
            type: clientType || null,
            level: lvl,
            last_reviewed_at: now,
            updated_at: now,
        };

        const { data: up, error: upErr } = await supabase
            .from('memory_levels')
            .upsert(upsertRow, { onConflict: 'card_id' })
            .select('card_id, level')
            .single();
        if (upErr) throw upErr;

        // 2) Ghi log review (không chặn flow nếu lỗi log)
        await supabase.from('review_logs').insert({
            card_id: String(card_id),
            quality,
            meta: {
                source: source || null,
                auto_active: !!auto_active,
                base_level: base,
                new_level: lvl,
                final: Number.isFinite(Number(final)) ? Number(final) : null,
            },
        });

        // 3) Trả lại hàng memory_levels mới nhất để client làm tươi UI
        const { data: memory, error: mlErr } = await supabase
            .from('memory_levels')
            .select('*')
            .eq('card_id', card_id)
            .limit(1)
            .maybeSingle();
        if (mlErr) throw mlErr;

        return res.status(200).json({ ok: true, quality, memory });
    } catch (e) {
        console.error('[api/memory/level]', e);
        return res.status(500).json({ ok: false, error: e.message || String(e) });
    }
}
