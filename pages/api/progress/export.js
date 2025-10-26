import { countByType, countRemainingByType, listSessions, supabase } from '../../../lib/server/db';

const parseBoolean = (value, defaultValue = false) => {
  if (value == null) return defaultValue;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['1', 'true', 't', 'yes', 'y'].includes(normalized)) return true;
    if (['0', 'false', 'f', 'no', 'n'].includes(normalized)) return false;
  }
  return Boolean(value);
};

const parseNumber = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

async function readMemorySnapshot({ type, sinceDays, dueOnly }) {
  let query = supabase
    .from('memory_levels')
    .select('card_id, type, level, stability, difficulty, last_reviewed_at, due, leech_count, is_leech, cards:card_id(id,type,front,back,deleted)')
    .eq('cards.deleted', false)
    .order('due', { ascending: true })
    .order('updated_at', { ascending: false });

  if (type) query = query.eq('type', type);
  if (Number.isFinite(sinceDays) && sinceDays >= 0) {
    const threshold = new Date(Date.now() - sinceDays * 86400000).toISOString();
    query = query.gte('last_reviewed_at', threshold);
  }
  if (dueOnly) {
    query = query.lte('due', new Date().toISOString());
  }

  const { data, error } = await query;
  if (error) throw error;

  const rows = (data || [])
    .filter((row) => row?.cards && !row.cards.deleted)
    .map((row) => {
      const dueRaw = row.due || null;
      const dueTsParsed = dueRaw ? Date.parse(dueRaw) : NaN;
      return {
        card_id: row.card_id,
        type: row.type || row.cards?.type || null,
        level: Number(row.level ?? 0),
        stability: Number(row.stability ?? 1),
        difficulty: Number(row.difficulty ?? 5),
        last_reviewed_at: row.last_reviewed_at || null,
        due: dueRaw,
        due_ts: Number.isFinite(dueTsParsed) ? dueTsParsed : null,
        front: row.cards?.front ?? null,
        back: row.cards?.back ?? null,
        leech_count: Number.isFinite(Number(row.leech_count)) ? Number(row.leech_count) : 0,
        is_leech: parseBoolean(row.is_leech, false),
      };
    });

  const dist = [0, 0, 0, 0, 0, 0];
  rows.forEach((row) => {
    if (row.level >= 0 && row.level <= 5) dist[row.level] += 1;
  });

  return { total: rows.length, dist, rows };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
  }

  try {
    const type = req.query?.type ? String(req.query.type) : '';
    const sinceDays = parseNumber(req.query?.since_days);
    const dueOnly = parseBoolean(req.query?.due_only, false);

    const statsPromise = countByType();

    const [stats, remainingByType, sessions, memory] = await Promise.all([
      statsPromise,
      statsPromise.then((resolvedStats) => countRemainingByType(resolvedStats)),
      listSessions(type || null),
      readMemorySnapshot({ type: type || null, sinceDays, dueOnly }),
    ]);

    res.setHeader('Cache-Control', 'no-store');
    res.json({
      ok: true,
      generated_at: new Date().toISOString(),
      filters: {
        type: type || null,
        since_days: sinceDays,
        due_only: dueOnly,
      },
      stats,
      sessions,
      remaining_by_type: remainingByType,
      memory,
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: error?.message || String(error) });
  }
}
