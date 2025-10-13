// pages/api/cards/bulk.js
import { createClient } from '@supabase/supabase-js';
import { parse } from 'csv-parse/sync';

export const config = { api: { bodyParser: { sizeLimit: '10mb' } } };

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(url, key, { auth: { persistSession: false } });

// tìm key theo alias, không phân biệt hoa thường, có trim
function findKey(keys, aliases) {
    const lower = keys.map(k => k.toLowerCase().trim());
    for (const a of aliases) {
        const i = lower.indexOf(a);
        if (i >= 0) return keys[i];
    }
    return null;
}

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

    const raw = typeof req.body === 'string' ? req.body : (req.body?.csv || '');
    if (!raw || typeof raw !== 'string') return res.status(400).json({ ok: false, error: 'Missing CSV string in body or body.csv' });

    let rows;
    try {
        const records = parse(raw, { columns: true, bom: true, skip_empty_lines: true, trim: true });
        const keys = Object.keys(records[0] || {});
        if (keys.length === 0) return res.status(400).json({ ok: false, error: 'CSV has no header' });

        const frontK = findKey(keys, ['front','word','term','japanese','kanji']) || 'front';
        const backK  = findKey(keys, ['back','meaning','translation','vi','en']) || 'back';
        const catK   = findKey(keys, ['category','categories','deck','topic','group']);
        const typeK  = findKey(keys, ['type','deck_type']);

        const out = [];
        for (const r of records) {
            const front = (r[frontK] ?? '').toString().trim();
            const back  = (r[backK]  ?? '').toString().trim();
            const category = catK ? (r[catK]?.toString().trim() || null) : null;
            const type = (r[typeK]?.toString().trim() || req.query.type || req.body?.type || 'vocab');

            if (!front || !back) continue; // bỏ dòng thiếu dữ liệu
            out.push({ type, front, back, category });
        }
        rows = out;
    } catch (e) {
        return res.status(400).json({ ok: false, error: 'CSV parse error: ' + e.message });
    }

    if (!rows?.length) return res.json({ ok: true, inserted: 0 });

    // ===== Chọn 1 trong 2: INSERT thường hoặc UPSERT nếu có unique (type,front,back)
    let resp;
    try {
        // Nếu bạn đã có unique index plain:  create unique index if not exists uniq_cards_triplet on public.cards(type, front, back) where deleted=false;
        resp = await supabase
            .from('cards')
            .upsert(rows, { onConflict: 'type,front,back', ignoreDuplicates: true })
            .select('*');
    } catch {
        // fallback: INSERT thường
        resp = await supabase.from('cards').insert(rows).select('*');
    }

    const { data, error } = resp;
    if (error) return res.status(500).json({ ok: false, error: error.message });
    return res.json({ ok: true, inserted: data?.length || 0 });
}
