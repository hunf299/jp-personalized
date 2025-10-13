// pages/api/cards/query.js (no hard dependency on 'category')
import { createClient } from '@supabase/supabase-js';

const url  = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const key  = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
const supa = createClient(url, key, { auth: { persistSession: false } });

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const type = String(req.query.type || 'vocab');
    const n    = Math.max(1, Math.min(200, Number(req.query.n || 10)));
    const dRaw = req.query.since_days != null ? Number(req.query.since_days) : null;
    const d    = Number.isFinite(dRaw) ? dRaw : null;

    let q = supa.from('memory_levels')
      .select(`card_id, level, last_reviewed_at, cards:card_id(id, type, front, back)`)
      .eq('type', type);

    if (Number.isFinite(d) && d>0) {
      const dt = new Date(Date.now() - d*86400000).toISOString();
      q = q.gte('last_reviewed_at', dt);
    }
    q = q.order('updated_at', { ascending: false }).limit(n);
    const { data, error } = await q;
    if (error) throw error;

    const rows = (data||[]).map(r => ({
      id: r.cards?.id,
      type: r.cards?.type,
      front: r.cards?.front,
      back: r.cards?.back,
      _level: r.level,
      _last_reviewed_at: r.last_reviewed_at,
    }));
    return res.status(200).json(rows);
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
}
