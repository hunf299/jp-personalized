import { createClient } from '@supabase/supabase-js';
import { planNext } from '../fsrs';
const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
export const supabase = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });

export async function listCards() {
  const { data, error } = await supabase
      .from('cards')
      .select('*')
      .eq('deleted', false)
      .order('created_at', { ascending: true });
  if (error) throw error; return data||[];
}
export async function bulkInsertCards(rows) {
  if (!rows?.length) return { count: 0 };
  const { data, error } = await supabase.from('cards').insert(rows).select('id');
  if (error) throw error; return { count: data.length };
}
export async function countByType() {
  const { data, error } = await supabase.from('cards').select('id,type').eq('deleted', false);
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

  const rows = (cards || [])
      .map((c) => {
        const cardId = c?.card_id ?? c?.id ?? null;
        if (!cardId) return null;
        const norm = (value) => (Number.isFinite(Number(value)) ? Number(value) : null);
        return {
          session_id: session.id,
          card_id: cardId,
          front: c?.front ?? null,
          back: c?.back ?? null,
          warmup: norm(c?.warmup),
          recall: norm(c?.recall),
          final: norm(c?.final),
        };
      })
      .filter(Boolean);

  if (rows.length){
    const { error: e2 } = await supabase.from('session_cards').insert(rows);
    if (e2) throw e2;

    const now = new Date().toISOString();
    const updates = rows
        .map((r) => ({
          card_id: r.card_id,
          level: Number.isFinite(Number(r.final)) ? Math.max(0, Math.min(5, Number(r.final))) : null,
        }))
        .filter((r) => r.level != null);

    if (updates.length){
      const cardIds = updates.map((u) => u.card_id);
      const { data: existing, error: existingErr } = await supabase
          .from('memory_levels')
          .select('card_id, type, level, stability, difficulty, last_reviewed_at, last_learned_at, due')
          .in('card_id', cardIds);
      if (existingErr) throw existingErr;

      const existingMap = new Map();
      (existing || []).forEach((row) => {
        if (row?.card_id) existingMap.set(row.card_id, row);
      });

      const clampGrade = (value) => {
        const num = Number(value);
        if (!Number.isFinite(num)) return 0;
        return Math.max(0, Math.min(5, Math.round(num)));
      };

      const payload = updates.map((u) => {
        const prev = existingMap.get(u.card_id) || null;
        const baseState = {
          level: Number.isFinite(Number(prev?.level)) ? Number(prev.level) : 0,
          stability: Number.isFinite(Number(prev?.stability)) ? Number(prev.stability) : undefined,
          difficulty: Number.isFinite(Number(prev?.difficulty)) ? Number(prev.difficulty) : undefined,
          last_reviewed_at: prev?.last_reviewed_at || undefined,
        };
        const grade = clampGrade(u.level);
        const next = planNext(baseState, grade);

        const row = {
          card_id: u.card_id,
          level: next.level,
          stability: next.stability,
          difficulty: next.difficulty,
          last_reviewed_at: next.last_reviewed_at,
          due: next.due,
          last_learned_at: now,
          updated_at: now,
        };

        if (type) {
          row.type = type;
        } else if (prev?.type) {
          row.type = prev.type;
        }

        return row;
      });

      const { error: e3 } = await supabase.from('memory_levels').upsert(payload, { onConflict: 'card_id' });
      if (e3) throw e3;
    }
  }

  return session.id;
}
export async function listSessions(type){
  let q = supabase
      .from('sessions')
      .select('*')
      .eq('deleted', false)
      .order('created_at', { ascending: false });
  if (type) q = q.eq('type', type);
  const { data, error } = await q; if (error) throw error;
  if (!data?.length) return [];
  const ids = data.map(s=>s.id);
  const { data: sc, error: e2 } = await supabase
      .from('session_cards')
      .select('*, cards:card_id(id, front, back, deleted)')
      .in('session_id', ids);
  if (e2) throw e2;
  const map = new Map();
  (sc||[]).forEach(r=>{
    if (!r?.cards || r.cards.deleted) return;
    const normalized = {
      ...r,
      front: r?.front ?? r?.cards?.front ?? null,
      back: r?.back ?? r?.cards?.back ?? null,
      warmup: Number.isFinite(Number(r?.warmup)) ? Number(r.warmup) : null,
      recall: Number.isFinite(Number(r?.recall)) ? Number(r.recall) : null,
      final: Number.isFinite(Number(r?.final)) ? Number(r.final) : null,
    };
    delete normalized.cards;
    if(!map.has(r.session_id)) map.set(r.session_id, []);
    map.get(r.session_id).push(normalized);
  });
  return data.map(s => ({ ...s, cards: map.get(s.id)||[] }));
}
export async function readPomodoroRaw(){ const { data, error } = await supabase.from('pomodoro_state').select('*').eq('id',1).maybeSingle(); if (error) throw error; return data||{ id:1, remaining:7200, running:false, updated_at:new Date().toISOString() }; }
export async function writePomodoroRaw(next){ const { error } = await supabase.from('pomodoro_state').upsert({ id:1, ...next }); if (error) throw error; }
