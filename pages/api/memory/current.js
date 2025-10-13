// pages/api/memory/current.js (env client + no 'category')
import { createClient } from '@supabase/supabase-js';
const url  = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const key  = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
const supa = createClient(url, key, { auth: { persistSession: false } });

function b(v) { return v === '1' || v === 'true' || v === true; }

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'Method not allowed' });
  try {
    const type = String(req.query.type || '').trim();
    const sinceDays = req.query.since_days != null ? Number(req.query.since_days) : null;
    const withCards = b(req.query.with_cards);
    if (!type) return res.status(400).json({ ok: false, error: 'Missing type' });

    let q = supa
      .from('memory_levels')
      .select('card_id, level, stability, difficulty, last_reviewed_at, due, cards:card_id(id,front,back,type)')
      .eq('type', type);

    if (Number.isFinite(sinceDays) && sinceDays > 0) {
      const dt = new Date(Date.now() - sinceDays * 86400000).toISOString();
      q = q.gte('last_reviewed_at', dt);
    }

    const { data, error } = await q;
    if (error) throw error;

    const rows = (data || []).map(r => ({
      card_id: r.card_id,
      level: Number(r.level ?? 0),
      stability: Number(r.stability ?? 1),
      difficulty: Number(r.difficulty ?? 5),
      last_reviewed_at: r.last_reviewed_at || null,
      due: r.due || null,
      front: r.cards?.front ?? null,
      back: r.cards?.back ?? null,
      type: r.cards?.type ?? null,
    }));

    const dist = [0,0,0,0,0,0];
    rows.forEach(r => { if (r.level >= 0 && r.level <= 5) dist[r.level] += 1; });

    const out = { ok: true, type, learned: rows.length, dist };
    if (withCards) out.cards = rows;
    return res.json(out);
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message || String(e) });
  }
}
