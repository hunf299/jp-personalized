// pages/api/settings/index.js
import { createClient } from '@supabase/supabase-js';
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
const supa = createClient(url, key, { auth: { persistSession: false } });

function daysToInterval(days){
    if (days == null || days < 0) return null; // all
    return `${days} days`; // Postgres interval literal
}

export default async function handler(req, res){
    if (req.method === 'GET') {
        const { data, error } = await supa.from('user_settings').select('*').eq('id',1).maybeSingle();
        if (error) return res.status(500).json({ error: String(error.message||error) });
        // Map interval -> number days (thô, best-effort)
        let recency_days = -1;
        const iv = data?.recency_cutoff;
        if (iv && typeof iv === 'string') {
            // '7 days', '14 days'...
            const m = iv.match(/(\d+)\s+day/);
            if (m) recency_days = Number(m[1]);
        }
        return res.json({ ...data, recency_days });
    }

    if (req.method === 'POST') {
        try{
            const body = req.body ?? {};
            const recency_days = Number.isFinite(body.recency_days) ? body.recency_days : -1;
            const recency_cutoff = daysToInterval(recency_days);

            const payload = {
                review_mode: body.review_mode ?? 'FSRS',
                auto_flip: body.auto_flip ?? 'off',
                cards_per_session: body.cards_per_session ?? 10,
                font_px: body.font_px ?? 24,
                card_orientation: body.card_orientation ?? 'normal',
                flip_stabilize: body.flip_stabilize ?? true,
                // lưu interval; client sẽ nhận kèm recency_days từ GET
                recency_cutoff,
            };

            const { error } = await supa
                .from('user_settings')
                .upsert({ id:1, ...payload }, { onConflict: 'id' });

            if (error) throw error;
            return res.json({ ok:true });
        }catch(e){
            return res.status(500).json({ ok:false, error: String(e.message||e) });
        }
    }

    return res.status(405).json({ error: 'Method not allowed' });
}
