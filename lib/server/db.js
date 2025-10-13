import { createClient } from '@supabase/supabase-js';
const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
export const supabase = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });

export async function listCards() {
  const { data, error } = await supabase.from('cards').select('*').order('created_at', { ascending: true });
  if (error) throw error; return data||[];
}
export async function bulkInsertCards(rows) {
  if (!rows?.length) return { count: 0 };
  const { data, error } = await supabase.from('cards').insert(rows).select('id');
  if (error) throw error; return { count: data.length };
}
export async function countByType() {
  const { data, error } = await supabase.from('cards').select('id,type');
  if (error) throw error;
  const counts = { total: 0 };
  (data||[]).forEach(r=>{ counts.total++; counts[r.type]=(counts[r.type]||0)+1; });
  return counts;
}
export async function getOffset(type){ const { data, error } = await supabase.from('offsets').select('offset_value').eq('type', type).maybeSingle(); if (error) throw error; return data?.offset_value||0; }
export async function setOffset(type, offset){ const { error } = await supabase.from('offsets').upsert({ type, offset_value: offset }); if (error) throw error; }
export async function saveSession({ type, cards, summary }){
  const { data: session, error } = await supabase.from('sessions').insert({ type, summary }).select('*').single();
  if (error) throw error;
  const rows = (cards || []).map((c) => ({
    session_id: session.id,
    card_id: c.card_id ?? c.id ?? null,
    front: c.front ?? null,
    back: c.back ?? null,
    warmup: c.warmup ?? null,
    recall: c.recall ?? null,
    final: c.final ?? null,
  }));
  if (rows.length){ const { error: e2 } = await supabase.from('session_cards').insert(rows); if (e2) throw e2; }
  return session.id;
}
export async function listSessions(type){
  let q = supabase.from('sessions').select('*').order('created_at', { ascending: false });
  if (type) q = q.eq('type', type);
  const { data, error } = await q; if (error) throw error;
  if (!data?.length) return [];
  const ids = data.map(s=>s.id);
  const { data: sc, error: e2 } = await supabase.from('session_cards').select('*').in('session_id', ids);
  if (e2) throw e2;
  const map = new Map(); (sc||[]).forEach(r=>{ if(!map.has(r.session_id)) map.set(r.session_id, []); map.get(r.session_id).push(r); });
  return data.map(s => ({ ...s, cards: map.get(s.id)||[] }));
}
export async function readPomodoroRaw(){ const { data, error } = await supabase.from('pomodoro_state').select('*').eq('id',1).maybeSingle(); if (error) throw error; return data||{ id:1, remaining:7200, running:false, updated_at:new Date().toISOString() }; }
export async function writePomodoroRaw(next){ const { error } = await supabase.from('pomodoro_state').upsert({ id:1, ...next }); if (error) throw error; }
