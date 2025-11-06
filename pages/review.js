// pages/review.js
import React from 'react';
import { useRouter } from 'next/router';
import {
  Container, Card, CardContent, Typography, Stack, Button,
  LinearProgress, Chip, ToggleButtonGroup, ToggleButton, TextField, Divider
} from '@mui/material';
import HandwritingCanvas from '../components/HandwritingCanvas';
import ExampleMCQ from '../components/ExampleMCQ';
import { createExampleLookup, exampleKey } from '../lib/example-utils';

// Busy (fallback an toàn nếu không có GlobalBusy)
import { useBusy as _useBusy } from '../components/GlobalBusy';
const useBusy = _useBusy || (() => ({ start(){}, finish(){} }));

// Settings (fallback)
import { useSettings as _useSettings } from '../lib/useSettings';
const useSettings = _useSettings || (() => ({
  settings: { review_mode:'FSRS', auto_flip:'off', cards_per_session:10, card_orientation:'normal', recency_days:null, due_mode:'due-priority' },
}));

// ---------- utils ----------
const safeArray = (x) => Array.isArray(x) ? x : [];
const getJSON = async (u) => { const r = await fetch(u); try { return await r.json(); } catch { return null; } };
const msToSec = (ms) => Math.max(0, Math.round(ms/100)/10);
const DAY_MS = 86400000;
const DUE_SOON_DAYS = 3;

function shuffle(arr) {
  const copy = Array.isArray(arr) ? [...arr] : [];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// MCQ -> level (mode=level) theo thời gian trả lời
function timeToScoreSec(t){
  if(t<=3) return 5;
  if(t<=5) return 4;
  if(t<=7) return 3;
  if(t<=10) return 2;
  return 1;
}

// Auto-flip config
function parseAuto(auto){
  if(!auto || auto==='off') return null;
  const map = { '2+3':[2,3], '4+5':[4,5], '6+7':[6,7] };
  const p = map[auto];
  return p ? { mcq:p[0], recall:p[1] } : null;
}
function gainForAuto(auto){
  if(auto==='2+3') return 5;
  if(auto==='4+5') return 4;
  if(auto==='6+7') return 3;
  return null;
}

function normalizeSpellLabel(spell) {
  if (spell == null) return '';
  const raw = String(spell || '');
  const parts = raw
      .split(/[\n,;|·•・／、]/)
      .map((item) => item.trim())
      .filter(Boolean);
  if (!parts.length) return '';
  const seen = new Set();
  const uniq = [];
  parts.forEach((part) => {
    const key = part.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      uniq.push(part);
    }
  });
  return uniq.join(' · ');
}

function makeMcqOptions(answer, otherOptions = []) {
  const list = [answer, ...otherOptions]
      .map((opt) => (opt == null ? '' : String(opt)))
      .filter(Boolean);
  if (!list.length) list.push('—');
  const seen = new Set();
  const uniq = [];
  list.forEach((opt) => {
    if (!seen.has(opt)) {
      seen.add(opt);
      uniq.push(opt);
    }
  });
  if (uniq.length < 2) uniq.push('—');
  return uniq.sort(() => Math.random() - 0.5);
}

// ------------------- Save API (sửa: trả JSON, log, lỗi rõ) -------------------
// ------------------- Save API (sửa: trả JSON, log, lỗi rõ) -------------------
async function saveLevelAPI({ card_id, type, new_level, base_level, auto_active, source, final, quality }){
  // ensure numeric
  const payload = {
    card_id,
    type,
    new_level: Number.isFinite(Number(new_level)) ? Number(new_level) : null,
    base_level: Number.isFinite(Number(base_level)) ? Number(base_level) : null,
    auto_active: !!auto_active,
    source: source || null
  };

  // include both field names some backends expect
  if (Number.isFinite(Number(final))) payload.final = Number(final);
  if (Number.isFinite(Number(quality))) payload.quality = Number(quality);

  const r = await fetch('/api/memory/level', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const text = await r.text().catch(() => null);
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch(e) { json = null; }

  if (!r.ok) {
    console.error('saveLevelAPI failed', r.status, json || text);
    throw new Error(`Save failed ${r.status}: ${String((json && (json.error||json.message)) || text || r.status)}`);
  }
  return json || { ok: true, card_id, level: new_level, final, quality };
}

// Ép số an toàn: mọi thứ không hợp lệ -> default (mặc định 0)
function toNum(v, d = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

// Tính FINAL an toàn (0..5), thống nhất cho UI & lưu
// mode = 'level' | 'omni'
// recProvided: boolean -> có phải recall được explicit cung cấp (bằng tay hoặc auto) hay không
function calcFinal(mode, base, mcq, rec, recProvided = false) {
  const b = toNum(base, 0);
  const m = toNum(mcq, 0);
  const r = toNum(rec, mode === 'level' ? 0 : b);

  const sum = m + r;
  const avg = Math.floor(sum / 2);
  const clamped = Math.max(0, Math.min(5, avg));

  if (mode === 'level') {
    return clamped;
  } else {
    // omni mode:
    // - nếu recall được explicit cung cấp (recProvided=true) => cho phép tăng/giảm theo clamped
    // - nếu không (recProvided=false) => chỉ cho phép tăng (không giảm dưới base)
    return recProvided ? clamped : Math.max(b, clamped);
  }
}

// ------------------- Page -------------------
export default function ReviewPage(){
  const router = useRouter();
  const busy = useBusy();
  const { settings } = useSettings();

  // ----- Query params (ổn định) -----
  const ready = router.isReady;
  const qp = ready ? router.query : {};
  const type  = String(qp?.type || 'vocab');
  const mode  = String(qp?.mode || (qp?.level != null ? 'level' : 'omni'));
  const levelParam = qp?.level!=null ? Number(qp.level) : null;
  const count = Number(qp?.n || settings?.cards_per_session || 10);
  const auto  = (qp?.auto || settings?.auto_flip || 'off') + '';

  const orientation = ((settings?.card_orientation || 'normal') + '').toLowerCase(); // normal|reversed
  const recencyDays = qp?.since_days!=null ? Number(qp.since_days) :
      (settings?.recency_days!=null ? Number(settings.recency_days) : null);
  const dueMode = String(settings?.due_mode || 'due-priority');

  const isLevelMode = mode === 'level';
  const enableExamples = type === 'kanji';

  const multiLevels = qp?.levels
      ? qp.levels.split(',').map(n => Number(n)).filter(n => n >= 0 && n <= 5)
      : (levelParam != null ? [levelParam] : []);

  // support card_ids (comma separated) — used by LeechList to open specific cards
  const cardIdsParam = qp?.card_ids
      ? String(qp.card_ids).split(',').map(s => s.trim()).filter(Boolean).map(s => String(s).toLowerCase())
      : null;

  // ----- State chính -----
  const [deck, setDeck] = React.useState([]);     // [{id, type, front, back, baseLv}]
  const [idx, setIdx] = React.useState(0);
  const [stage, setStage] = React.useState('mcq'); // dynamic stages
  const total = deck.length;

  // input mode
  const [modeInput, setModeInput] = React.useState(type === 'kanji' ? 'handwrite' : 'typing');
  React.useEffect(()=>{
    setModeInput(type === 'kanji' ? 'handwrite' : 'typing');
  }, [type]);

  // Khi viết tay (kanji) → bỏ auto-flip
  const disableAuto = (type==='kanji' && modeInput==='handwrite');
  const autoActive = (String(auto) !== 'off') && !disableAuto;
  const autoCfg = (!isLevelMode && !disableAuto) ? parseAuto(auto) : null;
  const autoGain = (!isLevelMode && !disableAuto) ? gainForAuto(auto) : null;

  // Trả lời/đánh dấu
  const [selected, setSelected] = React.useState(null); // MCQ đã chọn
  const [answer, setAnswer] = React.useState('');       // recall (typing)
  const [showAns, setShowAns] = React.useState(false);
  React.useEffect(()=>{
    if (type === 'kanji') {
      setAnswer('');
    }
  }, [type]);

  // Level hiện tại (base) & đề xuất/điểm
  const [baseLevels, setBaseLevels] = React.useState({}); // id -> base (lowercase id keys)
  const [proposed, setProposed] = React.useState({});     // id -> level (recall)
  const [proposedSource, setProposedSource] = React.useState({}); // id -> 'auto' | 'manual'
  const [mcqScores, setMcqScores] = React.useState({});   // id -> { timeSec, score }
  const [cardMetaMap, setCardMetaMap] = React.useState({});
  const [exampleLookup, setExampleLookup] = React.useState({ byCardId: {}, pool: [], refsByCardId: {} });
  const [examplesReady, setExamplesReady] = React.useState(false);
  const [exampleDeck, setExampleDeck] = React.useState([]);
  const [exampleIdx, setExampleIdx] = React.useState(0);
  const [exampleAnswers, setExampleAnswers] = React.useState({});
  const [contextIdx, setContextIdx] = React.useState(0);
  const [contextAnswers, setContextAnswers] = React.useState({});
  const [writeScoresPass1, setWriteScoresPass1] = React.useState({});
  const [onKunScores, setOnKunScores] = React.useState({});

  // Chấm thời gian ở MCQ
  const [mcqStartTs, setMcqStartTs] = React.useState(null);

  const autoVal = String(router?.query?.auto || settings?.auto_flip || 'off');
  // autoNoDowngrade chỉ áp dụng cho auto-flip ở omni-review.
  // Manual mode (review theo mức) vẫn cho phép giảm mức nhớ như bình thường.
  const autoNoDowngrade = (autoVal !== 'off') && !disableAuto && !isLevelMode;

  // ----- Load deck (từ /api/memory/all – nguồn sự thật) -----
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = safeArray(await getJSON('/api/cards'));
        if (cancelled) return;
        const meta = {};
        rows.forEach((row) => {
          if (!row || row.id == null) return;
          meta[String(row.id)] = row;
        });
        setCardMetaMap(meta);
        setExampleLookup(createExampleLookup(rows));
      } catch (e) {
        console.warn('Không thể tải cards cho ví dụ', e);
      } finally {
        if (!cancelled) {
          setExamplesReady(true);
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  React.useEffect(()=>{
    if(!ready) return;
    if(type === 'kanji' && !examplesReady) return;
    let cancelled = false;
    (async()=>{
      try{
        // Lấy snapshot hiện tại
        const url = new URL('/api/memory/all', window.location.origin);
        url.searchParams.set('type', type);
        if (!isLevelMode && Number.isFinite(recencyDays) && recencyDays>=0) {
          url.searchParams.set('since_days', String(recencyDays));
        }
        if (!isLevelMode && dueMode === 'due-only') {
          url.searchParams.set('due_only', '1');
        }
        const j = await getJSON(url.toString());
        const items = safeArray(j?.rows || j?.items || [])
            .filter(it => it && it.card_id)
            .map(it => {
              const dueStr = it.due || null;
              const dueTs = Number.isFinite(Number(it.due_ts))
                ? Number(it.due_ts)
                : (() => {
                  const parsed = dueStr ? Date.parse(dueStr) : NaN;
                  return Number.isFinite(parsed) ? parsed : null;
                })();
              return {
                id: String(it.card_id),
                idLower: String(it.card_id).toLowerCase(),
                type,
                front: typeof it.front === 'object' ? it.front?.front ?? '' : (it.front ?? ''),
                back:  typeof it.back  === 'object' ? it.back?.back  ?? '' : (it.back  ?? ''),
                baseLv: Number.isFinite(it.level) ? Number(it.level) : -1,
                due: dueStr,
                dueTs,
              };
            });

        // Debug quick: uncomment if needed
        // console.log('items loaded', items.length, 'multiLevels', multiLevels, 'cardIdsParam', cardIdsParam);

        // Lọc theo cardIdsParam (ưu tiên)
        let pool = items;
        if (type === 'kanji') {
          pool = pool.filter((entry) => {
            const refs = safeArray(exampleLookup.refsByCardId?.[String(entry.id)]);
            return refs.length > 0;
          });
        }
        if (Array.isArray(cardIdsParam) && cardIdsParam.length) {
          const idSet = new Set(cardIdsParam.map(x => x.toLowerCase()));
          pool = items.filter(c => idSet.has(c.idLower));
        } else if (isLevelMode && multiLevels.length) {
          // Dùng trực tiếp baseLv từ items để lọc
          pool = items.filter((c) => Number.isFinite(c.baseLv) && multiLevels.includes(Number(c.baseLv)));
        } else {
          // Omni: chỉ lấy thẻ đã học (baseLv >= 0)
          pool = items.filter((x) => Number(x.baseLv) >= 0);
        }

        // Lọc những thẻ có đủ 2 mặt để hiển thị
        pool = pool.filter(x => (x.front && x.back));

        const targetCount = Number.isFinite(count) ? count : 10;

        // Bốc ngẫu nhiên tối đa count (nếu cardIdsParam đã chỉ định 1 thẻ, giữ nguyên thứ tự)
        let pick;
        if (Array.isArray(cardIdsParam) && cardIdsParam.length) {
          // duy trì order theo cardIdsParam
          const idSet = new Set(cardIdsParam.map(x => x.toLowerCase()));
          pick = items.filter(c => idSet.has(c.idLower)).slice(0, targetCount);
        } else {
          let candidate = pool;
          if (!isLevelMode) {
            if (dueMode === 'due-only') {
              const nowTs = Date.now();
              candidate = shuffle(pool.filter((c) => Number.isFinite(c.dueTs) && c.dueTs <= nowTs));
            } else if (dueMode === 'due-priority') {
              const nowTs = Date.now();
              const soonThreshold = nowTs + DUE_SOON_DAYS * DAY_MS;
              const dueList = [];
              const soonList = [];
              const futureList = [];
              const noDueList = [];
              pool.forEach((c) => {
                if (Number.isFinite(c.dueTs)) {
                  if (c.dueTs <= nowTs) dueList.push(c);
                  else if (c.dueTs <= soonThreshold) soonList.push(c);
                  else futureList.push(c);
                } else {
                  noDueList.push(c);
                }
              });
              candidate = [
                ...shuffle(dueList),
                ...shuffle(soonList),
                ...shuffle(futureList),
                ...shuffle(noDueList),
              ];
              if (!candidate.length) candidate = shuffle(pool);
            } else {
              candidate = shuffle(pool);
            }
          } else {
            candidate = shuffle(pool);
          }
          pick = candidate.slice(0, targetCount);
        }

        if (cancelled) return;

        // Gán baseLevels (khớp deck đã pick) - keys lowercase for robust lookup
        const base = {};
        pick.forEach(c => { base[String(c.id).toLowerCase()] = Number.isFinite(c.baseLv) ? Number(c.baseLv) : -1; });
        setBaseLevels(base);

        // Reset trạng thái
        setDeck(pick.map((p) => {
          const meta = cardMetaMap[String(p.id)] || {};
          return {
            id: p.id,
            type: p.type,
            front: p.front,
            back: p.back,
            baseLv: p.baseLv,
            due: p.due ?? null,
            spell: meta?.spell ?? '',
          };
        }));
        setIdx(0);
        const initialStage = pick.length ? (type === 'kanji' ? 'write1' : 'mcq') : 'done';
        setStage(initialStage);
        setSelected(null);
        setAnswer('');
        setShowAns(false);
        setProposed({});
        setProposedSource({});
        setMcqScores({});
        setMcqStartTs(Date.now());
        setContextIdx(0);
        setContextAnswers({});
        setWriteScoresPass1({});
        setOnKunScores({});
      }catch(e){
        console.error('load deck error', e);
        if (!cancelled) {
          setDeck([]);
          setBaseLevels({});
          setStage('done');
        }
      }
    })();
    return ()=> { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, type, isLevelMode, levelParam, count, settings?.recency_days, router.query?.since_days, orientation, dueMode, qp?.levels, qp?.card_ids, examplesReady, exampleLookup, cardMetaMap]);

  const exampleTotal = exampleDeck.length;
  const contextDeck = React.useMemo(
      () => exampleDeck.filter((entry) => ((entry?.spell || '').toString().trim().length > 0)),
      [exampleDeck]
  );
  const contextTotal = contextDeck.length;
  const progressTotal = stage === 'mcqExample'
      ? exampleTotal
      : stage === 'mcqContext'
          ? contextTotal
          : total;
  const progressCurrent = stage === 'mcqExample'
      ? Math.min(exampleIdx + 1, Math.max(exampleTotal, 1))
      : stage === 'mcqContext'
          ? Math.min(contextIdx + 1, Math.max(contextTotal, 1))
          : Math.min(idx + 1, Math.max(total, 1));

  const card = deck[idx] || null;
  const currentExamples = React.useMemo(() => safeArray(exampleLookup.byCardId?.[String(card?.id)]), [exampleLookup, card]);
  const exampleCard = exampleDeck[exampleIdx] || null;
  const contextCard = contextDeck[contextIdx] || null;
  const examplePool = React.useMemo(() => safeArray(exampleLookup.pool), [exampleLookup]);
  const hasExampleStage = enableExamples && exampleDeck.length > 0;
  const hasContextStage = enableExamples && contextDeck.length > 0;
  const hasOnKunStage = type === 'kanji';
  React.useEffect(() => {
    if (!enableExamples) {
      setExampleDeck([]);
      setExampleIdx(0);
      setExampleAnswers({});
      return;
    }
    const list = [];
    deck.forEach((c) => {
      const examples = safeArray(exampleLookup.byCardId?.[String(c.id)]);
      examples.forEach((ex) => {
        list.push({
          ...ex,
          parentId: c.id,
          parentFront: c.front,
          parentBack: c.back,
        });
      });
    });
    setExampleDeck(list);
    setExampleIdx(0);
    setExampleAnswers({});
  }, [deck, exampleLookup, enableExamples]);

  // ======= Helper: chọn mặt hỏi/đáp theo orientation & loại =======
  // Trả về {q: question, a: answer} cho MCQ
  const qaForMCQ = React.useCallback((c) => {
    if (!c) return { q: '', a: '' };
    if (type === 'kanji') {
      // MCQ hỏi front, đáp án back (luôn vậy)
      return { q: c.front, a: c.back };
    }
    if (orientation === 'reversed') return { q: c.back, a: c.front };
    return { q: c.front, a: c.back };
  }, [type, orientation]);
  // Trả về {q: question, a: answer} cho RECALL
  const qaForRecall = React.useCallback((c) => {
    if (!c) return { q: '', a: '' };
    if (type === 'kanji') {
      return { q: c.back, a: c.front };
    }
    if (orientation === 'reversed') return { q: c.back, a: c.front };
    return { q: c.front, a: c.back };
  }, [type, orientation]);

  // MCQ options
  const mcq = React.useMemo(()=>{
    if(!card) return null;
    const { q, a } = qaForMCQ(card);
    // Sinh phương án từ mặt "a" của các thẻ khác
    const others = deck.filter(c=>c.id!==card.id);
    const pick = [...others].sort(()=>Math.random()-0.5).slice(0,3);
    const opts = [a, ...pick.map(x=> qaForMCQ(x).a)].sort(()=>Math.random()-0.5);
    return { question:q, correct:a, opts };
  }, [card, deck, qaForMCQ]);

  const onKunMcq = React.useMemo(() => {
    if (type !== 'kanji') return null;
    if (!card) return null;
    const meta = cardMetaMap[String(card.id)] || {};
    const rawSpell = card?.spell ?? meta?.spell ?? '';
    const correct = normalizeSpellLabel(rawSpell) || '—';
    const pool = deck
        .filter((entry) => entry.id !== card.id)
        .map((entry) => {
          const metaEntry = cardMetaMap[String(entry.id)] || {};
          const raw = entry?.spell ?? metaEntry?.spell ?? '';
          return normalizeSpellLabel(raw);
        })
        .filter(Boolean)
        .sort(() => Math.random() - 0.5)
        .slice(0, 3);
    const opts = makeMcqOptions(correct, pool);
    return { question: card.front, correct, opts };
  }, [type, card, deck, cardMetaMap]);

  const contextMcq = React.useMemo(() => {
    if (type !== 'kanji') return null;
    if (!contextCard) return null;
    const correct = normalizeSpellLabel(contextCard?.spell ?? '') || '—';
    const pool = contextDeck
        .filter((entry) => entry !== contextCard)
        .map((entry) => normalizeSpellLabel(entry?.spell ?? ''))
        .filter(Boolean)
        .sort(() => Math.random() - 0.5)
        .slice(0, 3);
    const opts = makeMcqOptions(correct, pool);
    return {
      question: contextCard.front,
      correct,
      opts,
      parentId: contextCard.parentId,
      key: exampleKey(contextCard) || null,
    };
  }, [type, contextCard, contextDeck]);

  // ----- Auto-flip -----
  React.useEffect(() => {
    if (!autoCfg) return;
    let t;
    if ((stage === 'mcq' || stage === 'mcqOnKun') && card) {
      t = setTimeout(() => setShowAns(true), autoCfg.mcq * 1000);
    } else if (stage === 'mcqContext' && contextCard) {
      t = setTimeout(() => setShowAns(true), autoCfg.mcq * 1000);
    } else if (stage === 'recall' && card) {
      t = setTimeout(() => setShowAns(true), autoCfg.recall * 1000);
    }
    return () => clearTimeout(t);
  }, [autoCfg, stage, card, contextCard]);

  // Sau khi show đáp án 2s → chuyển bước
  React.useEffect(() => {
    if (!autoCfg || !showAns) return;
    const handle = setTimeout(() => {
      if (stage === 'mcq' && card && mcq) {
        const ok = selected != null && selected === mcq.correct;
        const tsec = msToSec(Date.now() - (mcqStartTs || Date.now()));
        const score = ok ? timeToScoreSec(tsec) : 0;
        setMcqScores((s) => ({ ...s, [card.id]: { timeSec: tsec, score } }));
        setSelected(null);
        setShowAns(false);
        if (idx + 1 < deck.length) {
          setIdx((i) => i + 1);
          setMcqStartTs(Date.now());
        } else {
          if (hasExampleStage) {
            setStage('mcqExample');
            setIdx(0);
            setExampleIdx(0);
          } else if (hasOnKunStage) {
            setStage('mcqOnKun');
            setIdx(0);
          } else {
            setStage('recall');
            setIdx(0);
          }
        }
      } else if (stage === 'mcqOnKun' && card && onKunMcq) {
        const ok = selected != null && selected === onKunMcq.correct;
        const tsec = msToSec(Date.now() - (mcqStartTs || Date.now()));
        const score = ok ? timeToScoreSec(tsec) : 0;
        setOnKunScores((s) => ({ ...s, [card.id]: { timeSec: tsec, score } }));
        setSelected(null);
        setShowAns(false);
        if (idx + 1 < deck.length) {
          setIdx((i) => i + 1);
          setMcqStartTs(Date.now());
        } else {
          setStage('recall');
          setIdx(0);
        }
      } else if (stage === 'mcqContext' && contextCard && contextMcq) {
        const ok = selected != null && selected === contextMcq.correct;
        const tsec = msToSec(Date.now() - (mcqStartTs || Date.now()));
        const score = ok ? timeToScoreSec(tsec) : 0;
        if (contextMcq.key) {
          setContextAnswers((prev) => ({
            ...prev,
            [contextMcq.key]: {
              timeSec: tsec,
              score,
              ok,
              chosen: selected,
              correct: contextMcq.correct,
              parentId: contextMcq.parentId,
            },
          }));
        }
        setSelected(null);
        setShowAns(false);
        if (contextIdx + 1 < contextDeck.length) {
          setContextIdx((i) => i + 1);
          setMcqStartTs(Date.now());
        } else {
          setStage('done');
        }
      } else if (stage === 'recall' && card) {
        if (!isLevelMode && autoGain != null) {
          const ans = (answer || '').trim().toLowerCase();
          const sol = (qaForRecall(card).a || '').trim().toLowerCase();
          const ok = !!ans && ans === sol;
          if (ok) {
            const curLv = baseLevels[String(card.id).toLowerCase()] ?? -1;
            const next = curLv >= 0 ? Math.max(curLv, autoGain) : autoGain;
            setProposed((p) => ({ ...p, [card.id]: next }));
            setProposedSource((s) => ({ ...s, [card.id]: 'auto' }));
          }
        }
        setAnswer('');
        setShowAns(false);
        if (idx + 1 < deck.length) {
          setIdx((i) => i + 1);
        } else {
          setIdx(0);
          if (hasContextStage) {
            setStage('mcqContext');
            setContextIdx(0);
          } else {
            setStage('done');
          }
        }
      }
    }, 2000);
    return () => clearTimeout(handle);
  }, [autoCfg, showAns, stage, card, mcq, onKunMcq, contextMcq, idx, deck.length, selected, hasExampleStage, hasOnKunStage, exampleDeck.length, onKunScores, contextDeck.length, contextIdx, contextCard, mcqStartTs, isLevelMode, autoGain, answer, qaForRecall, baseLevels, hasContextStage]);

  // ----- Manual actions -----
  React.useEffect(() => {
    if (stage === 'mcq' || stage === 'mcqOnKun') setMcqStartTs(Date.now());
  }, [stage, idx]);

  React.useEffect(() => {
    if (stage === 'mcqContext') setMcqStartTs(Date.now());
  }, [stage, contextIdx]);

  const checkMCQ_Manual = () => {
    setShowAns(true);

    if (stage === 'mcq' && card && mcq) {
      const ok = selected != null && selected === mcq.correct;
      const tsec = msToSec(Date.now() - (mcqStartTs || Date.now()));
      const score = ok ? timeToScoreSec(tsec) : 0;
      setMcqScores((s) => ({ ...s, [card.id]: { timeSec: tsec, score } }));
    } else if (stage === 'mcqOnKun' && card && onKunMcq) {
      const ok = selected != null && selected === onKunMcq.correct;
      const tsec = msToSec(Date.now() - (mcqStartTs || Date.now()));
      const score = ok ? timeToScoreSec(tsec) : 0;
      setOnKunScores((s) => ({ ...s, [card.id]: { timeSec: tsec, score } }));
    } else if (stage === 'mcqContext' && contextCard && contextMcq) {
      const ok = selected != null && selected === contextMcq.correct;
      const tsec = msToSec(Date.now() - (mcqStartTs || Date.now()));
      const score = ok ? timeToScoreSec(tsec) : 0;
      if (contextMcq.key) {
        setContextAnswers((prev) => ({
          ...prev,
          [contextMcq.key]: {
            timeSec: tsec,
            score,
            ok,
            chosen: selected,
            correct: contextMcq.correct,
            parentId: contextMcq.parentId,
          },
        }));
      }
    }
  };

  const nextMCQ_Manual = () => {
    setSelected(null);
    setShowAns(false);

    if (stage === 'mcq') {
      if (idx + 1 < deck.length) {
        setIdx((i) => i + 1);
        setMcqStartTs(Date.now());
      } else {
        if (hasExampleStage) {
          setStage('mcqExample');
          setIdx(0);
          setExampleIdx(0);
        } else if (hasOnKunStage) {
          setStage('mcqOnKun');
          setIdx(0);
        } else {
          setStage('recall');
          setIdx(0);
        }
      }
    } else if (stage === 'mcqOnKun') {
      if (idx + 1 < deck.length) {
        setIdx((i) => i + 1);
        setMcqStartTs(Date.now());
      } else {
        setStage('recall');
        setIdx(0);
      }
    } else if (stage === 'mcqContext') {
      if (contextIdx + 1 < contextDeck.length) {
        setContextIdx((i) => i + 1);
        setMcqStartTs(Date.now());
      } else {
        setStage('done');
      }
    }
  };

  const checkRecall_Manual = ()=> setShowAns(true);

  const handleWrite1Check = () => {
    setShowAns(true);
  };

  const handleWrite1Score = (score) => {
    if (!card) return;
    const value = Number.isFinite(Number(score)) ? Number(score) : 0;
    setWriteScoresPass1((prev) => ({ ...prev, [card.id]: value }));
  };

  const handleWrite1Next = () => {
    if (!card) return;
    setShowAns(false);
    setSelected(null);
    if (idx + 1 < deck.length) {
      setIdx((i) => i + 1);
    } else {
      setIdx(0);
      setStage('mcq');
      setMcqStartTs(Date.now());
    }
  };

  const handleExampleChecked = (payload) => {
    if (!exampleCard) return;
    const key = exampleKey(exampleCard);
    if (!key) return;
    setExampleAnswers(prev => ({
      ...prev,
      [key]: {
        ...(payload || {}),
        parentId: exampleCard.parentId,
      },
    }));
  };

  const ensureExampleRecorded = (entry) => {
    if (!entry) return;
    const key = exampleKey(entry);
    if (!key) return;
    setExampleAnswers(prev => {
      if (prev[key]) return prev;
      return {
        ...prev,
        [key]: {
          score: 0,
          ok: false,
          timeSec: null,
          skipped: true,
          parentId: entry.parentId,
        },
      };
    });
  };

  const nextExampleStage = () => {
    if (!exampleCard) return;
    ensureExampleRecorded(exampleCard);
    if (exampleIdx + 1 < exampleDeck.length) setExampleIdx(i => i + 1);
    else {
      if (hasOnKunStage) {
        setStage('mcqOnKun');
        setIdx(0);
      } else {
        setStage('recall');
        setIdx(0);
      }
    }
  };

  const exampleScoresByCard = React.useMemo(() => {
    const map = {};
    exampleDeck.forEach((entry) => {
      const key = exampleKey(entry);
      if (!key) return;
      const res = exampleAnswers[key];
      if (!res) return;
      if (!map[entry.parentId]) map[entry.parentId] = [];
      const sc = Number.isFinite(Number(res.score)) ? Number(res.score) : 0;
      map[entry.parentId].push(sc);
    });
    return map;
  }, [exampleDeck, exampleAnswers]);

  const exampleAverages = React.useMemo(() => {
    const map = {};
    deck.forEach((c) => {
      const arr = safeArray(exampleScoresByCard[c.id]);
      if (!arr.length) return;
      const avg = Math.round(arr.reduce((sum, val) => sum + Number(val || 0), 0) / arr.length);
      map[c.id] = avg;
    });
    return map;
  }, [deck, exampleScoresByCard]);

  const contextScoresByCard = React.useMemo(() => {
    const map = {};
    Object.values(contextAnswers).forEach((entry) => {
      if (!entry || entry.parentId == null) return;
      const list = map[entry.parentId] || (map[entry.parentId] = []);
      const value = Number.isFinite(Number(entry.score)) ? Number(entry.score) : 0;
      list.push(value);
    });
    return map;
  }, [contextAnswers]);

  const contextAverages = React.useMemo(() => {
    const map = {};
    deck.forEach((c) => {
      const arr = safeArray(contextScoresByCard[c.id]);
      if (!arr.length) return;
      const avg = Math.round(arr.reduce((sum, val) => sum + Number(val || 0), 0) / arr.length);
      map[c.id] = avg;
    });
    return map;
  }, [deck, contextScoresByCard]);

  // --- FINAL LEVELS (UI & summary) ---
  const finalLevels = React.useMemo(() => {
    const out = {};
    deck.forEach((c) => {
      const base = toNum(baseLevels[String(c.id).toLowerCase()], -1);
      const mcq = toNum(mcqScores[c.id]?.score, 0);
      const hasProposed = Object.prototype.hasOwnProperty.call(proposed, c.id);

      if (type === 'kanji') {
        const write1 = toNum(writeScoresPass1[c.id], 0);
        const exampleScore = toNum(exampleAverages[c.id], 0);
        const onKun = toNum(onKunScores[c.id]?.score, 0);
        const recallScore = hasProposed ? toNum(proposed[c.id], 0) : 0;
        const contextScore = toNum(contextAverages[c.id], 0);
        const weighted = (
            write1 * 15 +
            mcq * 20 +
            exampleScore * 20 +
            onKun * 10 +
            recallScore * 20 +
            contextScore * 5
        ) / 100;
        let fin = Math.max(0, Math.min(5, Math.round(weighted)));
        if (autoNoDowngrade && proposedSource[c.id] === 'auto' && fin < base) fin = base;
        out[c.id] = fin;
      } else {
        if (isLevelMode) {
          const rec = toNum(proposed[c.id], 0);
          const fin = calcFinal('level', base, mcq, rec, hasProposed);
          out[c.id] = fin;
        } else {
          const rec = hasProposed ? toNum(proposed[c.id], base) : base;
          const fin = calcFinal('omni', base, mcq, rec, hasProposed);
          out[c.id] = fin;
        }
      }
    });
    return out;
  }, [deck, baseLevels, isLevelMode, mcqScores, proposed, type, writeScoresPass1, exampleAverages, onKunScores, contextAverages, autoNoDowngrade, proposedSource]);

  const finalDist = React.useMemo(() => {
    const d = [0,0,0,0,0,0];
    Object.values(finalLevels).forEach((v) => {
      if (Number.isFinite(v) && v >= 0 && v <= 5) d[v] += 1;
    });
    return d;
  }, [finalLevels]);

  const detailLabel = type === 'kanji'
      ? 'Chi tiết (Kanji: Base · Viết1 · MCQ · Ví dụ · On/Kun · Viết 2 · Ngữ cảnh'
      : `Chi tiết (mỗi thẻ: Base · MCQ · Recall${enableExamples ? ' · Ví dụ' : ''}`;

  // ===== Render =====
  return (
      <Container sx={{ py:3 }}>
        <Stack direction={{ xs:'column', md:'row' }} alignItems="center" spacing={1} sx={{ mb:2 }}>
          <Typography variant="h5" sx={{ fontWeight:700, flex:1 }}>
            {isLevelMode ? `Ôn theo mức nhớ · ${type}${levelParam!=null?` · Mức ${levelParam}`:''}` : `OmniReview · ${type}`}
          </Typography>
          <Chip label={`Review Mode: ${settings?.review_mode || 'FSRS'}`} sx={{ mr:1 }} />
          <Chip label={(!isLevelMode && !disableAuto && parseAuto(auto)) ? 'Auto-flip' : 'Manual'} />
          <Chip label={`Card: ${progressCurrent}/${progressTotal || 0}`} />
        </Stack>

        {stage!=='done' && (
            <LinearProgress variant="determinate"
                            value={progressTotal ? Math.round(progressCurrent / progressTotal * 100) : 0}
                            sx={{ mb:2, height:8, borderRadius:10 }}
            />
        )}

        {/* Empty deck (khi số thẻ < n hoặc không có) */}
        {stage==='done' && total===0 && (
            <Card sx={{ borderRadius:3 }}>
              <CardContent>
                <Typography variant="h6" sx={{ mb:1 }}>Không có thẻ để ôn</Typography>
                <Typography sx={{ opacity:.8, mb:2 }}>
                  {isLevelMode
                      ? 'Mức này chưa có thẻ hoặc số thẻ ít hơn chỉ tiêu. Bạn vẫn có thể quay lại Progress để chọn mức khác.'
                      : 'Không có thẻ phù hợp bộ lọc hiện tại.'}
                </Typography>
                <Stack className="responsive-stack" direction="row" spacing={1}>
                  <Button variant="contained" href="/progress" fullWidth>Về Progress</Button>
                  <Button variant="outlined" onClick={()=>window.location.reload()} fullWidth>Thử lại</Button>
                </Stack>
              </CardContent>
            </Card>
        )}

        {/* Write pass 1 */}
        {stage==='write1' && card && (
            <Card sx={{ borderRadius:3 }}>
              <CardContent>
                <Typography variant="h6" sx={{ mb:1 }}>
                  Viết nét (Lần 1): <b>{card.front}</b>
                </Typography>
                <Stack spacing={1}>
                  <HandwritingCanvas width={260} height={180} />
                  {showAns && (
                      <Stack spacing={0.5}>
                        <Typography>Đáp án đúng: <b>{card.front}</b></Typography>
                        {card.back && <Typography>Nghĩa: <b>{card.back}</b></Typography>}
                      </Stack>
                  )}
                </Stack>

                <Button sx={{ mt:2 }} variant="contained" onClick={handleWrite1Check} fullWidth>
                  Kiểm tra
                </Button>

                {showAns && (
                    <>
                      <Divider sx={{ my:2 }} />
                      <Typography>Chọn điểm tự chấm (0–5):</Typography>
                      <Stack className="responsive-stack" direction="row" spacing={1} sx={{ mt:1 }} flexWrap="wrap">
                        {[0,1,2,3,4,5].map(v=>(
                            <Button
                                key={v}
                                variant={(writeScoresPass1[card.id] ?? null)===v ? 'contained':'outlined'}
                                onClick={()=> handleWrite1Score(v)}
                                fullWidth
                            >
                              {v}
                            </Button>
                        ))}
                      </Stack>
                      <Stack className="responsive-stack" direction="row" spacing={1} sx={{ mt:2 }}>
                        <Button
                            variant="outlined"
                            onClick={handleWrite1Next}
                            disabled={writeScoresPass1[card.id] == null}
                            fullWidth
                        >
                          {idx+1<deck.length ? 'Lưu & Tiếp' : 'Lưu & Sang MCQ'}
                        </Button>
                      </Stack>
                    </>
                )}
              </CardContent>
            </Card>
        )}

        {/* MCQ */}
        {(stage==='mcq' || stage==='mcqOnKun') && card && ((stage==='mcq' && mcq) || (stage==='mcqOnKun' && onKunMcq)) && (
            <Card sx={{ borderRadius:3 }}>
              <CardContent>
                <Typography variant="h6" sx={{ mb:1 }}>
                  {stage==='mcqOnKun'
                      ? <>Chọn âm On/Kun đúng cho: <b>{card.front}</b></>
                      : mcq.question}
                </Typography>
                <Stack spacing={1}>
                  {(stage==='mcq' ? mcq.opts : onKunMcq.opts).map((opt, i)=>(
                      <Button key={i}
                              variant={selected===opt ? 'contained' : 'outlined'}
                              onClick={()=> setSelected(opt)}
                              disabled={!!parseAuto(auto) && !isLevelMode && !disableAuto && showAns}
                      >
                        {opt}
                      </Button>
                  ))}
                </Stack>
                <Stack className="responsive-stack" direction="row" spacing={1} sx={{ mt:2 }} alignItems="center">
                  {(!parseAuto(auto) || isLevelMode || disableAuto) && (
                      <>
                        <Button variant="contained" onClick={checkMCQ_Manual} fullWidth>Kiểm tra</Button>
                        <Button variant="outlined" onClick={nextMCQ_Manual} fullWidth>Tiếp</Button>
                      </>
                  )}
                  {showAns && <Typography sx={{ ml:1 }}>Đáp án: <b>{stage==='mcq' ? mcq.correct : onKunMcq.correct}</b></Typography>}
                  {showAns && stage==='mcq' && mcqScores[card.id] &&
                      <Chip sx={{ ml:1 }} size="small" color="info"
                            label={`MCQ: ${mcqScores[card.id].score}${mcqScores[card.id].timeSec!=null?` (${mcqScores[card.id].timeSec.toFixed(1)}s)`:''}`} />}
                  {showAns && stage==='mcqOnKun' && onKunScores[card.id] &&
                      <Chip sx={{ ml:1 }} size="small" color="info"
                            label={`On/Kun: ${onKunScores[card.id].score}${onKunScores[card.id].timeSec!=null?` (${onKunScores[card.id].timeSec.toFixed(1)}s)`:''}`} />}
                  {showAns && currentExamples.length>0 && (
                      <Stack spacing={0.5} sx={{ ml:1, mt:1 }}>
                        <Typography variant="subtitle2">Ví dụ liên quan:</Typography>
                        {currentExamples.map((ex, i) => (
                            <Typography key={i} sx={{ fontSize: 14 }}>
                              <b>{ex.front}</b>{ex.back ? ` · ${ex.back}` : ''}
                            </Typography>
                        ))}
                      </Stack>
                  )}
                </Stack>
              </CardContent>
            </Card>
        )}

        {/* RECALL */}
        {stage==='recall' && card && (
            <Card sx={{ borderRadius:3, mt:2 }}>
              <CardContent>
                <Typography variant="h6" sx={{ mb:1 }}>
                  {qaForRecall(card).q}
                </Typography>

                <ToggleButtonGroup size="small" exclusive value={modeInput} onChange={(e,v)=>{
                  if (!v) return;
                  if (type === 'kanji' && v === 'typing') return;
                  setModeInput(v);
                }}>
                  <ToggleButton value="typing" disabled={type==='kanji'}>Gõ</ToggleButton>
                  <ToggleButton value="handwrite" disabled={type!=='kanji'}>Viết tay</ToggleButton>
                </ToggleButtonGroup>

                {(modeInput==='handwrite' || type==='kanji') ? (
                    <Stack spacing={1} sx={{ mt:1 }}>
                      <HandwritingCanvas width={260} height={180} />
                      {showAns && <Typography>Đáp án đúng: <b>{qaForRecall(card).a}</b></Typography>}
                    </Stack>
                ) : (
                    <Stack spacing={1} sx={{ mt:1 }}>
                      <TextField
                          label="Đáp án"
                          value={answer}
                          onChange={(e)=> setAnswer(e.target.value)}
                          onKeyDown={(e)=>{ if((!autoCfg || disableAuto || isLevelMode) && e.key==='Enter') setShowAns(true); }}
                          disabled={type==='kanji' || (!!parseAuto(auto) && !disableAuto && showAns)}
                      />
                      {showAns && (
                          <Typography>Đáp án đúng: <b>{qaForRecall(card).a}</b></Typography>
                      )}
                    </Stack>
                )}

                {((!autoCfg) || disableAuto || isLevelMode) && (
                    <Button sx={{ mt:2 }} variant="contained" onClick={checkRecall_Manual} fullWidth>Kiểm tra</Button>
                )}

                {showAns && (
                    <>
                      <Divider sx={{ my:2 }} />
                      <Typography>Chọn mức nhớ (Recall) cho thẻ này:</Typography>
                      {currentExamples.length>0 && (
                          <Stack spacing={0.5} sx={{ mt:1 }}>
                            <Typography variant="subtitle2">Ví dụ liên quan:</Typography>
                            {currentExamples.map((ex, i) => (
                                <Typography key={i} sx={{ fontSize: 14 }}>
                                  <b>{ex.front}</b>{ex.back ? ` · ${ex.back}` : ''}
                                </Typography>
                            ))}
                          </Stack>
                      )}
                      <Stack className="responsive-stack" direction="row" spacing={1} sx={{ mt:1 }} flexWrap="wrap">
                        {[0,1,2,3,4,5].map(v=>(
                            <Button
                                key={v}
                                variant={(proposed[card.id] ?? (baseLevels[String(card.id).toLowerCase()] ?? -1))===v ? 'contained':'outlined'}
                                onClick={()=>{
                                  setProposed(p => ({ ...p, [card.id]: v }));
                                  setProposedSource(s => ({ ...s, [card.id]: 'manual' }));
                                }}
                                fullWidth
                            >
                              {v}
                            </Button>
                        ))}
                      </Stack>
                      <Stack className="responsive-stack" direction="row" spacing={1} sx={{ mt:2 }}>
                        <Button variant="outlined" onClick={()=>{
                          setAnswer('');
                          setShowAns(false);
                          if(idx+1<deck.length) {
                            setIdx(i=>i+1);
                          } else {
                            setIdx(0);
                            if (hasContextStage) {
                              setContextIdx(0);
                              setStage('mcqContext');
                            } else {
                              setStage('done');
                            }
                          }
                        }}>
                          {idx+1<deck.length ? 'Lưu & Tiếp' : (hasContextStage ? 'Lưu & MCQ Ngữ cảnh' : 'Lưu & Kết thúc')}
                        </Button>
                      </Stack>
                    </>
                )}
              </CardContent>
            </Card>
        )}

        {/* MCQ Context */}
        {stage==='mcqContext' && contextCard && contextMcq && (
            <Card sx={{ borderRadius:3, mt:2 }}>
              <CardContent>
                <Typography variant="h6" sx={{ mb:1 }}>
                  Chọn âm Hán Việt phù hợp với ngữ cảnh:
                </Typography>
                <Typography sx={{ mb:2, fontStyle:'italic' }}>
                  {contextMcq.question}
                </Typography>
                <Stack spacing={1}>
                  {contextMcq.opts.map((opt, i) => (
                      <Button
                          key={i}
                          variant={selected===opt ? 'contained' : 'outlined'}
                          onClick={()=> setSelected(opt)}
                          disabled={!!parseAuto(auto) && !isLevelMode && !disableAuto && showAns}
                      >
                        {opt}
                      </Button>
                  ))}
                </Stack>
                <Stack className="responsive-stack" direction="row" spacing={1} sx={{ mt:2 }} alignItems="center">
                  {(!parseAuto(auto) || isLevelMode || disableAuto) && (
                      <>
                        <Button variant="contained" onClick={checkMCQ_Manual} fullWidth>Kiểm tra</Button>
                        <Button variant="outlined" onClick={nextMCQ_Manual} fullWidth>Tiếp</Button>
                      </>
                  )}
                  {showAns && (
                      <Typography sx={{ ml:1 }}>Đáp án: <b>{contextMcq.correct}</b></Typography>
                  )}
                  {showAns && contextMcq.key && contextAnswers[contextMcq.key] && (
                      <Chip sx={{ ml:1 }} size="small" color="info"
                            label={`Ngữ cảnh: ${contextAnswers[contextMcq.key].score}${contextAnswers[contextMcq.key].timeSec!=null?` (${contextAnswers[contextMcq.key].timeSec.toFixed(1)}s)`:''}`} />
                  )}
                </Stack>
              </CardContent>
            </Card>
        )}

        {enableExamples && stage==='mcqExample' && exampleDeck.length>0 && exampleCard && (
            <Card sx={{ borderRadius:3, mt:2 }}>
              <CardContent>
                <Typography variant="h6" sx={{ mb:1 }}>
                  Ví dụ {exampleIdx + 1}/{exampleDeck.length}
                </Typography>
                {exampleCard.parentFront && (
                    <Typography sx={{ mb:1 }}>
                      Thuộc Kanji: <b>{exampleCard.parentFront}</b>
                      {exampleCard.parentBack ? ` · ${exampleCard.parentBack}` : ''}
                    </Typography>
                )}
                <ExampleMCQ
                    key={exampleKey(exampleCard) || `example-${exampleIdx}`}
                    example={exampleCard}
                    pool={examplePool}
                    onCheck={handleExampleChecked}
                    scoreFunc={timeToScoreSec}
                />
                <Stack className="responsive-stack" direction="row" spacing={1} sx={{ mt:2 }}>
                  <Button variant="outlined" onClick={nextExampleStage} fullWidth>
                    {exampleIdx + 1 < exampleDeck.length ? 'Tiếp ví dụ' : 'Hoàn thành ví dụ'}
                  </Button>
                </Stack>
              </CardContent>
            </Card>
        )}

        {/* DONE + SUMMARY */}
        {stage==='done' && total>0 && (
            <Card sx={{ borderRadius:3, mt:2 }}>
              <CardContent>
                <Typography variant="h6" sx={{ mb:1 }}>Tổng kết phiên ôn</Typography>

                {/* Tổng hợp phân bố theo FINAL */}
                <Stack className="responsive-stack" direction="row" spacing={1} flexWrap="wrap" sx={{ mb:2 }}>
                  {[0,1,2,3,4,5].map(v=>(
                      <Chip key={v} label={`Mức ${v}: ${finalDist[v]}`} />
                  ))}
                </Stack>

                {/* Bảng chi tiết: Base · MCQ · Recall · Final */}
                <Typography variant="subtitle2" sx={{ mb:1 }}>
                  {detailLabel} · <b>Final</b>):
                </Typography>
                <Stack spacing={1}>
                  {deck.map((c) => {
                    const baseKey = String(c.id).toLowerCase();
                    const base = toNum(baseLevels[baseKey], 0);
                    const mcqVal = toNum(mcqScores[c.id]?.score, 0);
                    const hasProposed = Object.prototype.hasOwnProperty.call(proposed, c.id);
                    const source = proposedSource[c.id];
                    let fin = toNum(finalLevels[c.id], 0);
                    if (autoNoDowngrade && source === 'auto' && fin < base) fin = base;

                    if (type === 'kanji') {
                      const write1Val = toNum(writeScoresPass1[c.id], 0);
                      const exampleValRaw = exampleAverages[c.id];
                      const exampleDisplay = Number.isFinite(Number(exampleValRaw)) ? toNum(exampleValRaw, 0) : '—';
                      const onKunVal = toNum(onKunScores[c.id]?.score, 0);
                      const recallVal = hasProposed ? toNum(proposed[c.id], 0) : 0;
                      const contextValRaw = contextAverages[c.id];
                      const contextDisplay = Number.isFinite(Number(contextValRaw)) ? toNum(contextValRaw, 0) : '—';

                      return (
                          <Stack key={c.id} direction={{ xs:'column', md:'row' }} spacing={1} alignItems="center"
                                 sx={{ border:'1px solid #eee', borderRadius:2, p:1 }}>
                            <Typography sx={{ flex:1, textAlign:{ xs:'center', md:'left' } }}>
                              <b>{c.front}</b>{c.back ? ` · ${c.back}` : ''}
                            </Typography>
                            <Stack className="responsive-stack" direction="row" spacing={1} flexWrap="wrap" alignItems="center">
                              <Chip size="small" label={`Base: ${base}`} />
                              <Chip size="small" label={`Viết1: ${write1Val}`} />
                              <Chip size="small" label={`MCQ: ${mcqVal}`} />
                              <Chip size="small" label={`Ví dụ: ${exampleDisplay}`} />
                              <Chip size="small" label={`On/Kun: ${onKunVal}`} />
                              <Chip size="small" label={`Viết2: ${recallVal}`} />
                              <Chip size="small" label={`Ngữ cảnh: ${contextDisplay}`} />
                              <Chip size="small" color="success" label={`Final: ${fin}`} />
                            </Stack>
                          </Stack>
                      );
                    }

                    const exampleScore = exampleAverages[c.id];
                    const displayExampleScore = enableExamples ? (exampleScore != null ? toNum(exampleScore, 0) : '—') : null;
                    const rec = isLevelMode
                        ? (hasProposed ? toNum(proposed[c.id], 0) : 0)
                        : (hasProposed ? toNum(proposed[c.id], base) : base);

                    return (
                        <Stack key={c.id} direction={{ xs:'column', md:'row' }} spacing={1} alignItems="center"
                               sx={{ border:'1px solid #eee', borderRadius:2, p:1 }}>
                          <Typography sx={{ flex:1, textAlign:{ xs:'center', md:'left' } }}>
                            <b>{c.front}</b>{c.back ? ` · ${c.back}` : ''}
                          </Typography>
                          <Stack className="responsive-stack" direction="row" spacing={1} flexWrap="wrap" alignItems="center">
                            <Chip size="small" label={`Base: ${base}`} />
                            <Chip size="small" label={`MCQ: ${mcqVal}`} />
                            <Chip size="small" label={`Recall: ${rec}`} />
                            {enableExamples && (
                                <Chip size="small" label={`Ví dụ: ${displayExampleScore != null ? displayExampleScore : '—'}`} />
                            )}
                            <Chip size="small" color="success" label={`Final: ${fin}`} />
                          </Stack>
                        </Stack>
                    );
                  })}
                </Stack>

                <Stack className="responsive-stack" direction="row" spacing={1} sx={{ mt:2 }}>
                  <Button
                      variant="contained" color="success"
                      fullWidth
                      onClick={async ()=>{
                        try{
                          // Build save rows
                          // Build save rows — per-card we include source and make auto_active
                          const rows = deck.map((c) => {
                            const base = toNum(baseLevels[String(c.id).toLowerCase()], 0);
                            const source = proposedSource[c.id];
                            let lvl = toNum(finalLevels[c.id], 0);
                            if (autoNoDowngrade && source === 'auto' && lvl < base) lvl = base;

                            const final = Number(lvl);
                            const quality = Number(lvl);

                            return {
                              card_id: c.id,
                              type,
                              new_level: lvl,
                              base_level: base,
                              auto_active: !!(autoNoDowngrade && source === 'auto'),
                              source: source || null,
                              final,
                              quality
                            };
                          });

                          if (!rows.length) { alert('Không có thẻ để lưu'); return; }

                          busy.start('Đang lưu kết quả…');

                          const results = [];
                          for (const item of rows) {
                            try {
                              const res = await saveLevelAPI(item);
                              console.log('saved', item.card_id, res);
                              results.push({ id: item.card_id, ok: true, res });
                            } catch (err) {
                              console.error('save failed for', item.card_id, err);
                              results.push({ id: item.card_id, ok: false, error: String(err) });
                            }
                          }

                          busy.finish('Đã lưu!');

                          const failed = results.filter(r => !r.ok);
                          if (failed.length) {
                            alert(`Một số thẻ lưu lỗi: ${failed.length}. Xem console để biết chi tiết.`);
                            // do not redirect so user can retry / inspect
                            return;
                          }

                          // Optional: fetch memory/all to ensure DB updated
                          try {
                            const memNow = await getJSON(`/api/memory/all?type=${encodeURIComponent(type)}`);
                            console.log('memory now sample', memNow?.rows?.slice(0,10));
                          } catch (e) {
                            console.warn('could not fetch memory/all after save', e);
                          }

                          // All good -> redirect
                          window.location.href = '/progress';
                        }catch(e){
                          console.error(e);
                          busy.finish(String(e.message||e), 'error');
                          alert(`Lỗi lưu: ${e.message||e}`);
                        }
                      }}
                  >
                    Lưu tất cả & Kết thúc
                  </Button>
                  <Button variant="outlined" onClick={()=>{ window.location.href = '/progress'; }} fullWidth>
                    Kết thúc (không lưu)
                  </Button>
                </Stack>
              </CardContent>
            </Card>
        )}
      </Container>
  );
}
