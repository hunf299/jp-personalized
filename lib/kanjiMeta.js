// lib/kanjiMeta.js
// Lấy stroke_count + radicals từ KanjiVG; fallback kanjiapi.dev nếu thiếu.
// Cache vào bảng public.kanji_meta.

import { createClient } from '@supabase/supabase-js';
import { loadKanjiData } from './kanjivg'; // bạn đã có sẵn
const supa = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

function uniq(a){ return Array.from(new Set(a)); }

// Rút gọn radicals từ nhóm KanjiVG (group labels): lấy group có class "radical" hoặc tên phần tử.
function extractRadicalsFromKanjiVG(strokesOrGroups){
    // tuỳ dữ liệu bạn đang trả từ loadKanjiData. Giả sử có d.strokes[] và d.groups[] với label.
    const groups = Array.isArray(strokesOrGroups?.groups) ? strokesOrGroups.groups : [];
    const rad = [];
    for (const g of groups){
        if (g.kind === 'radical' || /radical/i.test(g.label||'')) {
            if (g.text) rad.push(g.text);
            if (g.label) rad.push(g.label);
        }
    }
    return uniq(rad).filter(Boolean);
}

export async function getKanjiMeta(kanji){
    // 1) thử cache
    const { data:cache } = await supa.from('kanji_meta').select('*').eq('kanji', kanji).maybeSingle();
    if (cache) return cache;

    // 2) thử KanjiVG
    try{
        const d = await loadKanjiData(kanji); // { strokes, groups, ... }
        const stroke_count = Array.isArray(d?.strokes) ? d.strokes.length : null;
        const radicals = extractRadicalsFromKanjiVG(d);
        if (stroke_count){
            const row = { kanji, stroke_count, radicals, source:'kanjivg' };
            await supa.from('kanji_meta').upsert(row);
            return row;
        }
    }catch{}

    // 3) fallback kanjiapi.dev
    try{
        const r = await fetch(`https://kanjiapi.dev/v1/kanji/${encodeURIComponent(kanji)}`);
        if (r.ok){
            const j = await r.json();
            const row = {
                kanji,
                stroke_count: Number(j?.stroke_count) || null,
                radicals: [], // kanjiapi không luôn trả radicals; có 'radical' đơn lẻ tuỳ ký tự
                source:'kanjiapi'
            };
            await supa.from('kanji_meta').upsert(row);
            return row;
        }
    }catch{}

    return { kanji, stroke_count: null, radicals: [], source: null };
}

// Similar by radicals (Jaccard)
export async function similarKanjiByRadicals(kanji, poolChars){
    const base = await getKanjiMeta(kanji);
    const baseSet = new Set(base.radicals||[]);
    if (!baseSet.size) return [];

    // lấy meta của pool
    const { data: metas } = await supa.from('kanji_meta').select('*').in('kanji', poolChars);
    const need = (poolChars||[]).filter(k => !(metas||[]).some(m => m.kanji===k));
    // nạp thiếu
    for (const k of need){ await getKanjiMeta(k); }
    const { data: all } = await supa.from('kanji_meta').select('*').in('kanji', poolChars);

    const scored = (all||[]).map(m=>{
        const set = new Set(m.radicals||[]);
        const inter = [...set].filter(x=>baseSet.has(x)).length;
        const union = new Set([...set, ...baseSet]).size || 1;
        return { kanji:m.kanji, score: inter/union, stroke_count: m.stroke_count };
    }).filter(x=>x.kanji!==kanji).sort((a,b)=>b.score-a.score);

    return scored.slice(0, 10);
}
