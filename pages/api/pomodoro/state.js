
import { createClient } from '@supabase/supabase-js';

// CHÚ Ý: Ưu tiên SUPABASE_URL, fallback sang NEXT_PUBLIC_SUPABASE_URL
const url =
  process.env.SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  '';

const service =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE ||
  process.env.SUPABASE_SERVICE_KEY ||
  '';

const anon =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  '';

const key = service || anon;       // cần 1 trong 2 (ưu tiên service)
const ROW_ID = 1;

export default async function handler(req, res) {
  if (!url || !key) {
    return res.status(500).json({
      error: 'Missing Supabase env (URL or KEY)',
      have: {
        SUPABASE_URL: !!process.env.SUPABASE_URL,
        NEXT_PUBLIC_SUPABASE_URL: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      }
    });
  }

  const db = createClient(url, key, { auth: { persistSession: false } });

  if (req.method === 'GET') {
    const { data, error } = await db.from('pomodoro_state').select('*').eq('id', ROW_ID).maybeSingle();
    if (error && !data) return res.status(500).json({ error: String(error.message || error) });
    if (!data) {
      const { data: inserted, error: ierr } = await db
        .from('pomodoro_state')
        .upsert({ id: ROW_ID, phase_index: 0, sec_left: 25 * 60, paused: false })
        .select('*').single();
      if (ierr) return res.status(500).json({ error: String(ierr.message || ierr) });
      return res.json(inserted);
    }
    return res.json(data);
  }

  if (req.method === 'POST') {
    try {
      const { phaseIndex, secLeft, paused, updatedBy } = req.body || {};
      if (typeof phaseIndex !== 'number' || typeof secLeft !== 'number' || typeof paused !== 'boolean') {
        return res.status(400).json({ error: 'Invalid body' });
      }
      const { data, error } = await db
        .from('pomodoro_state')
        .upsert({
          id: ROW_ID,
          phase_index: phaseIndex,
          sec_left: secLeft,
          paused,
          updated_by: updatedBy || null,
          updated_at: new Date().toISOString(),
        })
        .select('*').single();
      if (error) return res.status(500).json({ error: String(error.message || error) });
      return res.json({ ok: true, using: service ? 'service_role' : 'anon_key', state: data });
    } catch (e) {
      return res.status(500).json({ error: String(e?.message || e) });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
