// pages/api/levels.js
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!url || !serviceRoleKey) return res.status(500).json({ error: 'Missing SUPABASE env' });

  const supabase = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
  try {
    const { type } = req.query;
    // lấy levels + join cards để lọc theo type nếu có
    let q = supabase.from('memory_levels').select('card_id, level, updated_at, cards:card_id(id, type, front, back)');
    const { data, error } = await q;
    if (error) return res.status(500).json({ error: String(error.message || error) });

    const rows = (data || []).filter(r => !type || r.cards?.type === type);
    const counts = [0,1,2,3,4,5].map(()=>0);
    for (const r of rows) {
      const lv = Number(r.level ?? 0);
      if (lv>=0 && lv<=5) counts[lv] += 1;
    }

    res.json({
      total: rows.length,
      counts,
      items: rows.map(r => ({ id: r.card_id, type: r.cards?.type, front: r.cards?.front, back: r.cards?.back, level: r.level }))
    });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
}
