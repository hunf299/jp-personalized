// pages/api/review/log.js
// Ghi log mỗi lần chấm điểm để trigger cập nhật memory_levels qua trigger DB
import { createClient } from '@supabase/supabase-js';

function resolveEnv() {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    '';

  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE ||
    process.env.SUPABASE_SERVICE_KEY ||
    '';

  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    '';

  const adminKey = serviceRoleKey || anonKey;

  return { url, adminKey, have: {
    NEXT_PUBLIC_SUPABASE_URL: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    SUPABASE_URL: Boolean(process.env.SUPABASE_URL),
    SUPABASE_SERVICE_ROLE_KEY: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    SUPABASE_SERVICE_ROLE: Boolean(process.env.SUPABASE_SERVICE_ROLE),
    SUPABASE_SERVICE_KEY: Boolean(process.env.SUPABASE_SERVICE_KEY),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    SUPABASE_ANON_KEY: Boolean(process.env.SUPABASE_ANON_KEY),
  } };
}

const { url, adminKey, have } = resolveEnv();
const supabase = url && adminKey
  ? createClient(url, adminKey, { auth: { persistSession: false } })
  : null;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  if (!supabase) {
    return res.status(500).json({
      ok: false,
      error: 'Missing SUPABASE env (URL or KEY)',
      have,
    });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const card = body?.card || {};

    const cardId = card?.id || card?.card_id || body?.card_id;
    if (!cardId) {
      return res.status(400).json({ ok: false, error: 'card_id required' });
    }

    let quality = Number(body?.quality ?? card?.quality);
    if (!Number.isFinite(quality)) quality = 0;
    quality = Math.max(0, Math.min(5, Math.round(quality)));

    const meta = {
      type: card?.type ?? null,
      front: card?.front ?? null,
      back: card?.back ?? null,
      warmup: card?.warmup ?? null,
      recall: card?.recall ?? null,
      final: card?.final ?? null,
    };

    const { data, error } = await supabase
      .from('review_logs')
      .insert({ card_id: String(cardId), quality, meta })
      .select('id, created_at')
      .single();

    if (error) throw error;

    return res.status(200).json({ ok: true, id: data.id, created_at: data.created_at, quality });
  } catch (e) {
    console.error('[api/review/log]', e);
    return res.status(500).json({ ok: false, error: e.message || String(e) });
  }
}
