// pages/api/cards/import.js
// CSV Importer (category optional). If DB doesn't have 'category' column, it will be ignored.
import { createClient } from '@supabase/supabase-js';
import { parse } from 'csv-parse/sync';

export const config = { api: { bodyParser: { sizeLimit: '20mb' } } };

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
const supa = createClient(url, key, { auth: { persistSession: false } });

function findKey(keys, aliases) {
  const lower = keys.map(k => k.toLowerCase().trim());
  for (const a of aliases) {
    const i = lower.indexOf(a);
    if (i >= 0) return keys[i];
  }
  return null;
}

function makeKey(row) {
  return `${row.type}||${row.front}||${row.back}`;
}

function escapeForOr(value) {
  const escaped = value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"');
  return `"${escaped}"`;
}

async function findExistingKeys(rows, { hasDeletedColumn }) {
  const existing = new Set();
  const chunkSize = 20;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const orConditions = chunk
      .map(r => `and(type.eq.${escapeForOr(r.type)},front.eq.${escapeForOr(r.front)},back.eq.${escapeForOr(r.back)})`)
      .join(',');
    if (!orConditions) continue;
    let query = supa
      .from('cards')
      .select('type,front,back');
    if (hasDeletedColumn) {
      query = query.eq('deleted', false);
    }
    const { data, error } = await query.or(orConditions);
    if (error) throw error;
    for (const row of data || []) {
      existing.add(makeKey(row));
    }
  }
  return existing;
}

async function tableHasColumn(table, column) {
  // Try selecting the column; if it errors, assume not present.
  const { error } = await supa.from(table).select(column).limit(1);
  return !error;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok:false, error: 'Method not allowed' });
  try {
    const raw = typeof req.body === 'string' ? req.body : (req.body?.csv || '');
    const typeDefault = String(req.query.type || req.body?.type || 'vocab');
    if (!raw || typeof raw !== 'string') return res.status(400).json({ ok:false, error: 'Missing CSV string in body or body.csv' });

    const records = parse(raw, { columns: true, bom: true, skip_empty_lines: true, trim: true });
    if (!records.length) return res.json({ ok:true, inserted: 0 });

    const keys = Object.keys(records[0]);
    const kFront = findKey(keys, ['front','word','term','japanese','kanji']);
    const kBack  = findKey(keys, ['back','meaning','translation','vi','en']);
    const kType  = findKey(keys, ['type','deck_type']);
    const kCat   = findKey(keys, ['category','categories','deck','topic','group']);

    if (!kFront || !kBack) {
      return res.status(400).json({ ok:false, error: `CSV must include front/back (aliases supported). Got headers: ${keys.join(', ')}` });
    }

    const hasCategoryColumn = await tableHasColumn('cards', 'category');
    const hasDeletedColumn = await tableHasColumn('cards', 'deleted');

    const rows = [];
    const seen = new Set();
    for (const r of records) {
      const front = (r[kFront] ?? '').toString().trim();
      const back  = (r[kBack]  ?? '').toString().trim();
      if (!front || !back) continue;
      const type = (r[kType]?.toString().trim()) || typeDefault;
      const row = { type, front, back };
      if (hasCategoryColumn && kCat) {
        const category = (r[kCat]?.toString().trim()) || null;
        row.category = category || null;
      }
      const key = makeKey(row);
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push(row);
    }

    if (!rows.length) return res.json({ ok:true, inserted: 0 });

    // Prefer upsert to avoid duplicates (requires unique index on (type,front,back) when deleted=false)
    let resp;
    resp = await supa.from('cards').upsert(rows, { onConflict: 'type,front,back', ignoreDuplicates: true }).select('id');

    if (resp.error && /no unique or exclusion constraint/i.test(resp.error.message || '')) {
      const existing = await findExistingKeys(rows, { hasDeletedColumn });
      const filtered = rows.filter(row => !existing.has(makeKey(row)));
      if (!filtered.length) {
        return res.json({ ok:true, inserted: 0 });
      }
      resp = await supa.from('cards').insert(filtered).select('id');
    }
    if (resp.error) throw resp.error;
    const inserted = Array.isArray(resp.data) ? resp.data.length : 0;
    return res.json({ ok:true, inserted });
  } catch (e) {
    return res.status(500).json({ ok:false, error: String(e.message || e) });
  }
}
