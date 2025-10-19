import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
const supa = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { id } = body || {};
    if (!id) return res.status(400).json({ error: 'Missing id' });

    const { data: card, error: cardError } = await supa
      .from('cards')
      .select('id, deleted')
      .eq('id', id)
      .maybeSingle();
    if (cardError) throw cardError;
    if (!card) return res.status(404).json({ error: 'Card not found' });
    if (card.deleted) return res.json({ ok: true, alreadyDeleted: true });

    const { data: memoryRow, error: memoryError } = await supa
      .from('memory_levels')
      .select('is_leech, level')
      .eq('card_id', id)
      .maybeSingle();
    if (memoryError) throw memoryError;
    if (memoryRow?.is_leech) {
      return res.status(400).json({ error: 'Không thể xoá leech card' });
    }

    const levelValue = Number.isFinite(Number(memoryRow?.level))
      ? Number(memoryRow.level)
      : (memoryRow == null ? 0 : null);
    if (levelValue === 0 || levelValue === 1) {
      return res.status(400).json({ error: 'Không thể xoá thẻ mức nhớ 0 hoặc 1' });
    }

    const { error: updateError } = await supa
      .from('cards')
      .update({ deleted: true, deleted_at: new Date().toISOString() })
      .eq('id', id);
    if (updateError) throw updateError;

    return res.json({ ok: true });
  } catch (e) {
    const message = e?.message || String(e);
    return res.status(500).json({ error: message });
  }
}
