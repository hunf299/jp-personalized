// pages/api/memory/bulk.js
import { createClient } from '@supabase/supabase-js';

const url  = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const key  = process.env.SUPABASE_SERVICE_ROLE_KEY; // server-only
const supa = url && key ? createClient(url, key) : null;

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        res.status(405).json({ ok: false, error: 'Method Not Allowed' });
        return;
    }
    if (!supa) {
        res.status(500).json({ ok:false, error: 'Missing SUPABASE env' });
        return;
    }

    try {
        const { items } = req.body || {};
        // items: [{ card_id, type, level }]
        if (!Array.isArray(items) || items.length === 0) {
            res.status(400).json({ ok:false, error:'Empty items' });
            return;
        }

        const nowIso = new Date().toISOString();
        const rows = items
            .map(it => ({
                card_id: it.card_id,
                type: String(it.type||'').trim(),
                level: Number(it.level),
                updated_at: nowIso,
                last_reviewed_at: nowIso,
            }))
            .filter(r => r.card_id && r.type && Number.isFinite(r.level));

        if (!rows.length) {
            res.status(400).json({ ok:false, error:'Invalid items' });
            return;
        }

        const { data, error } = await supa
            .from('memory_levels')
            .upsert(rows, { onConflict: 'card_id' })
            .select('card_id, type, level, updated_at');

        if (error) {
            res.status(500).json({ ok:false, error: error.message || String(error) });
            return;
        }

        res.status(200).json({ ok:true, count: data?.length || rows.length, data });
    } catch (e) {
        res.status(500).json({ ok:false, error: e?.message || String(e) });
    }
}
