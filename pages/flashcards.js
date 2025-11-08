// pages/flashcards.js
import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import {
  Container, Typography, Stack, Button, ToggleButton, ToggleButtonGroup,
  TextField, Card, CardContent, LinearProgress, FormControl, InputLabel,
  Select, MenuItem, Divider, Chip
} from '@mui/material';
import HandwritingCanvas from '../components/HandwritingCanvas';
import ExampleMCQ from '../components/ExampleMCQ';
import { createExampleLookup, exampleKey, parseExampleRefs } from '../lib/example-utils';

const CHUNK_SIZE = 10;
const RECALL_FIRST_TYPES = new Set(['vocab', 'vocal', 'grammar', 'particle']);

// ---------- helpers ----------
const safeArray = (x) => (Array.isArray(x) ? x : []);
const normalizeType = (value) => (value == null ? '' : String(value).trim().toLowerCase());
const getJSON = async (url) => { try { const r = await fetch(url); return await r.json(); } catch { return null; } };

// điểm theo giây
function timeToScoreSec(sec) {
  const s = Math.max(0, Math.floor(sec));
  if (s <= 3)  return 5;
  if (s <= 6)  return 4;
  if (s <= 9)  return 3;
  if (s <= 12) return 2;
  if (s <= 15) return 1;
  return 0;
}
const floorAvg = (a,b)=> Math.floor((Number(a||0)+Number(b||0))/2);

// --- lấy meta Kanji: Hán Việt + on/kun (tự dò từ nhiều field, fallback an toàn)
function parseFromCategory(key, str='') {
  const m = new RegExp(`${key}\\s*:\\s*([^;|]+)`, 'i').exec(String(str));
  return m ? m[1].trim() : '';
}
function getKanjiMeta(card) {
  const hv = (card.hv || card.hanviet || card.back || '').trim();
  const on = (card.on || card?.readings?.on || parseFromCategory('on', card.category) || '').toString().trim();
  const kun = (card.kun || card?.readings?.kun || parseFromCategory('kun', card.category) || '').toString().trim();
  return { hv, on, kun };
}
function kanjiLabel(card) {
  const { hv } = getKanjiMeta(card);
  const meaning = (card?.back || hv || '').trim();
  const spellLabel = normalizeSpellLabel(card?.spell ?? '');
  if (meaning && spellLabel) return `${meaning} · ${spellLabel}`;
  if (meaning) return meaning;
  return spellLabel || '—';
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

const toNum = (v, d = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};

function computeLevelDistribution(values = []) {
  const dist = [0, 0, 0, 0, 0, 0];
  values.forEach((raw) => {
    const level = Math.max(0, Math.min(5, Math.round(toNum(raw, 0))));
    dist[level] += 1;
  });
  return { dist, total: values.length };
}

// ---------- Warmup MCQ ----------
function WarmupMCQ({ card, deck, isKanji, onCheck, spellLabel }) {
  const startRef = React.useRef(Date.now());
  const firstHitSecRef = React.useRef(null);

  // Tạo option + reset timer khi đổi câu
  const makeLabel = (c) => (isKanji ? kanjiLabel(c) : (c.back || ''));
  const correctLabel = makeLabel(card);

  const options = useMemo(() => {
    startRef.current = Date.now();
    firstHitSecRef.current = null;

    const others = deck.filter(c => c.id !== card.id);
    const pick = [...others].sort(() => Math.random() - 0.5).slice(0, 3);
    // label hoá + unique
    const raw = [correctLabel, ...pick.map(makeLabel)].sort(() => Math.random() - 0.5);
    const seen = new Set(); const uniq = [];
    for (const s of raw) { if (!seen.has(s)) { seen.add(s); uniq.push(s); } }
    if (uniq.length < 2) uniq.push('—'); // phòng ít dữ liệu
    return uniq;
    // eslint-disable-next-line
  }, [card?.id, deck, isKanji]);

  const [chosen, setChosen] = useState(null);
  const [checked, setChecked] = useState(false);
  const [result, setResult] = useState(null);

  const handlePick = (opt) => {
    setChosen(opt);
    if (opt === correctLabel && firstHitSecRef.current == null) {
      const sec = Math.floor((Date.now() - startRef.current) / 1000);
      firstHitSecRef.current = Math.max(0, sec);
    }
  };

  const handleCheck = () => {
    const ok = chosen === correctLabel;
    const nowSec = Math.floor((Date.now() - startRef.current) / 1000);
    const sec = ok ? (firstHitSecRef.current ?? Math.max(0, nowSec)) : Math.max(0, nowSec);
    const score = ok ? timeToScoreSec(sec) : 0;
    setChecked(true);
    setResult(ok);
    onCheck({ ok, timeSec: sec, score });
  };

  return (
      <Card sx={{ borderRadius: 3, border: '1px solid #ffe0e0', background: '#fff' }}>
        <CardContent>
          <Typography variant="h6" sx={{ mb: 1, color: '#a33b3b' }}>
            {isKanji ? <>Chọn “Hán Việt + on/kun” đúng cho: <b>{card.front}</b></> : <>Chọn nghĩa đúng: {card.front}</>}
          </Typography>
          <Stack spacing={1}>
            {options.map((opt, idx) => (
                <Button
                    key={idx}
                    variant={chosen === opt ? 'contained' : 'outlined'}
                    onClick={() => handlePick(opt)}
                >
                  {opt}
                </Button>
            ))}
          </Stack>
          <Stack spacing={1} sx={{ mt: 2 }} alignItems="stretch">
            <Button variant="contained" disabled={!chosen} onClick={handleCheck} fullWidth>Kiểm tra</Button>
            {checked && (
                <Typography sx={{ textAlign: { xs: 'center', sm: 'left' }, width: '100%' }}>
                  {result ? 'Đúng' : <>Sai · Đáp án đúng: <b>{correctLabel}</b></>}
                </Typography>
            )}
            {checked && isKanji && spellLabel && (
                <Typography sx={{ textAlign: { xs: 'center', sm: 'left' } }}>
                  On/Kun: <b>{spellLabel}</b>
                </Typography>
            )}
          </Stack>
        </CardContent>
      </Card>
  );
}

// ---------- Page ----------
export default function FlashcardsPage() {
  const router = useRouter();

  const [typeFilter, setTypeFilter] = useState('vocab');
  const normalizedTypeFilter = normalizeType(typeFilter);
  const isKanji = normalizedTypeFilter === 'kanji';
  const recallFirst = !isKanji && RECALL_FIRST_TYPES.has(normalizedTypeFilter);
  const enableExamples = isKanji;

  // data + session
  const [allCards, setAllCards] = useState([]);
  const [order, setOrder] = useState([]);
  const [batch, setBatch] = useState([]);
  const [phase, setPhase] = useState('idle'); // idle | write1 | warmup | warmup_summary | example | on_kun | recall | context | done
  const [index, setIndex] = useState(0);

  const [writePass1Scores, setWritePass1Scores] = useState({});
  const [showWrite1Answer, setShowWrite1Answer] = useState(false);

  const [onKunScores, setOnKunScores] = useState({});
  const [onKunSelected, setOnKunSelected] = useState(null);
  const [onKunChecked, setOnKunChecked] = useState(false);
  const [onKunResult, setOnKunResult] = useState(null);
  const [onKunStartTs, setOnKunStartTs] = useState(null);

  const [contextDeck, setContextDeck] = useState([]);
  const [contextIndex, setContextIndex] = useState(0);
  const [contextAnswers, setContextAnswers] = useState({});
  const [contextSelected, setContextSelected] = useState(null);
  const [contextChecked, setContextChecked] = useState(false);
  const [contextResult, setContextResult] = useState(null);
  const [contextStartTs, setContextStartTs] = useState(null);

  // recall input
  const [mode, setMode] = useState(isKanji ? 'handwrite' : 'typing'); // typing | handwrite (only kanji)
  useEffect(() => {
    setMode(isKanji ? 'handwrite' : 'typing');
  }, [isKanji]);
  const [answer, setAnswer] = useState('');

  // scoring
  const [warmupScores, setWarmupScores] = useState({});
  const [recallScores, setRecallScores] = useState({});
  const [exampleLookup, setExampleLookup] = useState({ byCardId: {}, pool: [], refsByCardId: {} });
  const [exampleDeck, setExampleDeck] = useState([]);
  const [exampleIndex, setExampleIndex] = useState(0);
  const [exampleAnswers, setExampleAnswers] = useState({});

  const processCardData = (rows) => {
    const arr = safeArray(rows);
    const lookup = createExampleLookup(arr);
    const enriched = arr.map((card) => ({
      ...card,
      exampleCards: lookup.byCardId?.[String(card.id)] || [],
      exampleRefs: lookup.refsByCardId?.[String(card.id)] || parseExampleRefs(card?.example),
    }));
    setAllCards(enriched);
    setExampleLookup(lookup);
  };

  // ui
  const [loading, setLoading] = useState(false);
  const [errMsg, setErrMsg] = useState('');

  // load
  useEffect(() => {
    (async () => {
      setLoading(true);
      setErrMsg('');
      const data = await getJSON('/api/cards');
      const arr = safeArray(data);
      if (!arr.length) {
        setErrMsg('Chưa có dữ liệu từ Supabase – đang dùng bộ demo 10 thẻ (vocab).');
        processCardData([
          { id: 'd1', type: 'vocab', front: '犬', back: 'chó', category: 'ĐV' },
          { id: 'd2', type: 'vocab', front: '猫', back: 'mèo', category: 'ĐV' },
          { id: 'd3', type: 'vocab', front: '水', back: 'nước', category: 'Cơ bản' },
          { id: 'd4', type: 'vocab', front: '火', back: 'lửa', category: 'Cơ bản' },
          { id: 'd5', type: 'vocab', front: '山', back: 'núi', category: 'Cơ bản' },
          { id: 'd6', type: 'vocab', front: '川', back: 'sông', category: 'Cơ bản' },
          { id: 'd7', type: 'vocab', front: '雨', back: 'mưa', category: 'Cơ bản' },
          { id: 'd8', type: 'vocab', front: '人', back: 'người', category: 'Cơ bản' },
          { id: 'd9', type: 'vocab', front: '口', back: 'miệng', category: 'Cơ bản' },
          { id: 'd10', type: 'vocab', front: '目', back: 'mắt', category: 'Cơ bản' },
        ]);
      } else {
        processCardData(arr);
      }
      setLoading(false);
    })();
  }, []);

  // reset khi đổi loại
  useEffect(() => {
    setPhase('idle'); setBatch([]); setIndex(0);
    setWarmupScores({}); setRecallScores({});
    setWritePass1Scores({});
    setOnKunScores({});
    setContextDeck([]);
    setContextIndex(0);
    setContextAnswers({});
    setAnswer('');
    setMode(isKanji ? 'handwrite' : 'typing');
    setExampleDeck([]); setExampleIndex(0); setExampleAnswers({});
    setShowWrite1Answer(false);
    setOnKunSelected(null);
    setOnKunChecked(false);
    setOnKunResult(null);
    setOnKunStartTs(null);
    setContextSelected(null);
    setContextChecked(false);
    setContextResult(null);
    setContextStartTs(null);
  }, [typeFilter]); // eslint-disable-line

  // pool theo loại
  useEffect(() => {
    const targetType = normalizedTypeFilter;
    const next = safeArray(allCards).filter((c) => {
      if (!c) return false;
      const cardType = normalizeType(c.type);
      if (targetType === 'kanji') {
        if (cardType !== 'kanji') return false;
      } else if (cardType !== targetType) {
        return false;
      }
      if (targetType === 'kanji') {
        const examples = safeArray(c?.exampleCards);
        if (!examples.length) return false;
      }
      return true;
    });
    setOrder(next);
  }, [allCards, normalizedTypeFilter, isKanji]);

  useEffect(() => {
    if (!enableExamples) {
      setExampleDeck([]);
      setExampleIndex(0);
      setExampleAnswers({});
      setContextDeck([]);
      setContextIndex(0);
      setContextAnswers({});
      setContextSelected(null);
      setContextChecked(false);
      setContextResult(null);
      setContextStartTs(null);
      return;
    }

    const list = [];
    safeArray(batch).forEach((item) => {
      const examples = safeArray(item?.exampleCards);
      examples.forEach((ex) => {
        if (normalizeType(ex?.type) !== 'example') return;
        list.push({
          ...ex,
          parentId: item.id != null ? String(item.id) : null,
          parentFront: item.front ?? '',
          parentBack: item.back ?? '',
        });
      });
    });
    setExampleDeck(list);
    setExampleIndex(0);
    setExampleAnswers({});
    const contextList = list
        .filter((entry) => normalizeType(entry?.type) === 'example')
        .filter((entry) => normalizeSpellLabel(entry?.spell ?? '').length > 0);
    setContextDeck(contextList);
    setContextIndex(0);
    setContextAnswers({});
    setContextSelected(null);
    setContextChecked(false);
    setContextResult(null);
    setContextStartTs(null);
  }, [batch, enableExamples]);

  const hasAnyData = allCards.length > 0;
  const hasTypeData = order.length > 0;

  // khởi tạo session theo offset (hoặc replay)
  useEffect(() => {
    if (!router.isReady || !hasTypeData) return;
    (async () => {
      const sessionIdFromQuery = router.query?.sessionId || null;
      if (sessionIdFromQuery) {
        const sessions = safeArray(await getJSON('/api/sessions'));
        const s = sessions.find(x => String(x.id) === String(sessionIdFromQuery));
        if (s) {
          const cards = safeArray(s.cards).map(row => order.find(c => c.id === row.card_id)).filter(Boolean);
          setBatch(cards); setPhase(isKanji ? 'write1' : (recallFirst ? 'recall' : 'warmup')); setIndex(0);
          setWarmupScores({}); setRecallScores({});
          setWritePass1Scores({});
          setOnKunScores({});
          return;
        }
      }
      const offRes = await getJSON(`/api/offsets?type=${encodeURIComponent(typeFilter)}`);
      const offset = Number(offRes?.offset || 0);
      const ids = [];
      for (let i=0;i<CHUNK_SIZE;i++){ const idx=(offset+i)%order.length; if(order[idx]) ids.push(order[idx].id); }
      const cards = ids.map(id => order.find(c => c.id === id)).filter(Boolean);
      setBatch(cards); setPhase(isKanji ? 'write1' : (recallFirst ? 'recall' : 'warmup')); setIndex(0);
      setWarmupScores({}); setRecallScores({});
      setWritePass1Scores({});
      setOnKunScores({});
    })();
  }, [router.isReady, router.query?.sessionId, hasTypeData, order, typeFilter, isKanji, recallFirst]);

  const card = batch[index] || null;
  const cardSpellLabel = isKanji && card ? normalizeSpellLabel(card?.spell ?? '') : '';
  const exampleCard = exampleDeck[exampleIndex] || null;
  const examplePool = useMemo(() => safeArray(exampleLookup?.pool), [exampleLookup]);
  const contextCard = contextDeck[contextIndex] || null;
  const contextCardKey = contextCard ? exampleKey(contextCard) : null;

  const onKunMcq = useMemo(() => {
    if (!isKanji) return null;
    if (!card) return null;
    const answer = normalizeSpellLabel(card?.spell ?? '') || '—';
    const pool = safeArray(batch)
        .filter((entry) => entry && entry.id !== card.id)
        .map((entry) => normalizeSpellLabel(entry?.spell ?? ''))
        .filter(Boolean)
        .sort(() => Math.random() - 0.5)
        .slice(0, 3);
    const opts = makeMcqOptions(answer, pool);
    return { question: card.front, correct: answer, opts };
  }, [isKanji, card, batch]);

  const contextMcq = useMemo(() => {
    if (!isKanji) return null;
    if (!contextCard) return null;
    const answer = normalizeSpellLabel(contextCard?.spell ?? '') || '—';
    const pool = safeArray(contextDeck)
        .filter((entry) => entry && entry !== contextCard)
        .map((entry) => normalizeSpellLabel(entry?.spell ?? ''))
        .filter(Boolean)
        .sort(() => Math.random() - 0.5)
        .slice(0, 3);
    const opts = makeMcqOptions(answer, pool);
    return {
      question: contextCard.front,
      correct: answer,
      opts,
      parentId: contextCard.parentId != null ? String(contextCard.parentId) : null,
      key: exampleKey(contextCard) || null,
      parentFront: contextCard.parentFront,
      parentBack: contextCard.parentBack,
    };
  }, [isKanji, contextCard, contextDeck]);

  useEffect(() => {
    if (phase === 'write1') {
      setShowWrite1Answer(false);
    }
  }, [phase, card?.id]);

  useEffect(() => {
    if (phase === 'on_kun') {
      setOnKunSelected(null);
      setOnKunChecked(false);
      setOnKunResult(null);
      setOnKunStartTs(Date.now());
    }
  }, [phase, card?.id]);

  useEffect(() => {
    if (phase === 'context') {
      setContextSelected(null);
      setContextChecked(false);
      setContextResult(null);
      setContextStartTs(Date.now());
    }
  }, [phase, contextCardKey]);

  // warm-up
  const onWarmupChecked = async ({ ok, timeSec, score }) => {
    if (!card) return;
    setWarmupScores(s => ({ ...s, [card.id]: { correct: ok, timeSec, score } }));
    try {
      await fetch('/api/review/log', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ card, quality: score }) });
    } catch {}
  };
  const nextWarmup = async () => {
    if (!card) return;
    if (!warmupScores[card.id]) {
      setWarmupScores(s => ({ ...s, [card.id]: { correct:false, timeSec:0, score:0 } }));
      try { await fetch('/api/review/log', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ card, quality: 0 }) }); } catch {}
    }
    if (index + 1 < batch.length) setIndex(i=>i+1);
    else setPhase('warmup_summary');
  };

  const handleWrite1Check = () => {
    setShowWrite1Answer(true);
  };

  const handleWrite1Score = (score) => {
    if (!card) return;
    const value = Number.isFinite(Number(score)) ? Number(score) : 0;
    setWritePass1Scores((prev) => ({ ...prev, [card.id]: value }));
  };

  const handleWrite1Next = () => {
    if (!card) return;
    if (!Object.prototype.hasOwnProperty.call(writePass1Scores, card.id)) {
      setWritePass1Scores((prev) => ({ ...prev, [card.id]: 0 }));
    }
    setShowWrite1Answer(false);
    if (index + 1 < batch.length) {
      setIndex((i) => i + 1);
    } else {
      setIndex(0);
      setPhase('warmup');
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
        parentId: exampleCard.parentId != null ? String(exampleCard.parentId) : null,
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
          parentId: entry.parentId != null ? String(entry.parentId) : null,
        },
      };
    });
  };

  const nextExample = () => {
    if (!exampleCard) return;
    ensureExampleRecorded(exampleCard);
    if (exampleIndex + 1 < exampleDeck.length) setExampleIndex(i => i + 1);
    else if (isKanji) {
      setPhase('on_kun');
      setIndex(0);
    } else {
      setPhase('done');
    }
  };

  const handleOnKunPick = (opt) => {
    setOnKunSelected(opt);
  };

  const ensureOnKunRecorded = () => {
    if (!card) return;
    if (onKunScores[card.id]) return;
    setOnKunScores((prev) => ({
      ...prev,
      [card.id]: {
        score: 0,
        ok: false,
        timeSec: null,
        skipped: true,
      },
    }));
  };

  const handleOnKunCheck = () => {
    if (!card || !onKunMcq) return;
    const ok = onKunSelected === onKunMcq.correct;
    const sec = Math.max(0, Math.floor(((Date.now() - (onKunStartTs || Date.now())) / 1000)));
    const score = ok ? timeToScoreSec(sec) : 0;
    const payload = {
      ok,
      score,
      timeSec: sec,
      chosen: onKunSelected,
      correct: onKunMcq.correct,
    };
    setOnKunChecked(true);
    setOnKunResult(payload);
    setOnKunScores((prev) => ({ ...prev, [card.id]: payload }));
  };

  const nextOnKun = () => {
    if (!card) return;
    if (!onKunChecked) {
      ensureOnKunRecorded();
    }
    setOnKunSelected(null);
    setOnKunChecked(false);
    setOnKunResult(null);
    setOnKunStartTs(Date.now());
    if (index + 1 < batch.length) {
      setIndex((i) => i + 1);
    } else {
      setIndex(0);
      setPhase('recall');
      setAnswer('');
    }
  };

  const ensureContextRecorded = (entry) => {
    if (!entry) return;
    const key = exampleKey(entry);
    if (!key) return;
    setContextAnswers((prev) => {
      if (prev[key]) return prev;
      return {
        ...prev,
        [key]: {
          score: 0,
          ok: false,
          timeSec: null,
          skipped: true,
          parentId: entry.parentId != null ? String(entry.parentId) : null,
        },
      };
    });
  };

  const handleContextPick = (opt) => {
    setContextSelected(opt);
  };

  const handleContextCheck = () => {
    if (!contextCard || !contextMcq) return;
    const ok = contextSelected === contextMcq.correct;
    const sec = Math.max(0, Math.floor(((Date.now() - (contextStartTs || Date.now())) / 1000)));
    const score = ok ? timeToScoreSec(sec) : 0;
    const payload = {
      ok,
      score,
      timeSec: sec,
      chosen: contextSelected,
      correct: contextMcq.correct,
      parentId: contextMcq.parentId,
    };
    setContextChecked(true);
    setContextResult(payload);
    if (contextMcq.key) {
      setContextAnswers((prev) => ({ ...prev, [contextMcq.key]: payload }));
    }
  };

  const nextContext = () => {
    if (!contextCard) return;
    if (!contextChecked) {
      ensureContextRecorded(contextCard);
    }
    setContextSelected(null);
    setContextChecked(false);
    setContextResult(null);
    setContextStartTs(Date.now());
    if (contextIndex + 1 < contextDeck.length) {
      setContextIndex((i) => i + 1);
    } else {
      setPhase('done');
    }
  };

  // recall
  const checkRecall = () => {
    if (!card) return;
    if (isKanji) {
      if (mode === 'typing') {
        const userAns = (answer || '').trim();
        const truth = (card.front || '').trim(); // kanji → đáp án là FRONT
        const ok = userAns.length > 0 && userAns === truth;
        const defaultScore = ok ? 3 : 0;
        setRecallScores(s => ({ ...s, [card.id]: { correct: ok, score: defaultScore, userAns: userAns, mode: 'typing' } }));
      } else {
        // handwrite: không chấm tự động
        setRecallScores(s => ({ ...s, [card.id]: { correct: null, score: 0, userAns: null, mode: 'handwrite' } }));
      }
    } else {
      // non-kanji: đáp án là BACK như cũ
      const userAns = (answer || '').trim().toLowerCase();
      const truth = (card.back || '').trim().toLowerCase();
      const ok = userAns.length > 0 && userAns === truth;
      const defaultScore = ok ? 3 : 0;
      setRecallScores(s => ({ ...s, [card.id]: { correct: ok, score: defaultScore, userAns: answer, mode: 'typing' } }));
    }
  };

  const gradeRecall = async (quality) => {
    if (!card) return;
    setRecallScores(s => ({ ...s, [card.id]: { ...(s[card.id]||{}), score: quality } }));
    try { await fetch('/api/review/log', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ card, quality }) }); } catch {}
    if (index + 1 < batch.length) { setIndex(i=>i+1); setAnswer(''); }
    else {
      setAnswer('');
      if (isKanji) {
        if (contextDeck.length > 0) {
          setContextIndex(0);
          setPhase('context');
        } else {
          setPhase('done');
        }
      } else if (recallFirst) {
        setIndex(0);
        setPhase('warmup');
      } else if (enableExamples && exampleDeck.length > 0) {
        setExampleIndex(0);
        setPhase('example');
      } else {
        setPhase('done');
      }
    }
  };

  // tổng hợp
  const exampleScoresByCard = useMemo(() => {
    const map = {};
    safeArray(exampleDeck).forEach((entry) => {
      const key = exampleKey(entry);
      if (!key) return;
      const res = exampleAnswers[key];
      if (!res) return;
      const parentKey = entry.parentId != null ? String(entry.parentId) : null;
      if (!parentKey) return;
      if (!map[parentKey]) map[parentKey] = [];
      const sc = Number.isFinite(Number(res.score)) ? Number(res.score) : 0;
      map[parentKey].push(sc);
    });
    return map;
  }, [exampleDeck, exampleAnswers]);

  const exampleParentIds = useMemo(() => {
    const set = new Set();
    safeArray(exampleDeck).forEach((entry) => {
      if (entry?.parentId == null) return;
      set.add(String(entry.parentId));
    });
    return Array.from(set);
  }, [exampleDeck]);

  const exampleAverages = useMemo(() => {
    const map = {};
    exampleParentIds.forEach((id) => {
      const arr = safeArray(exampleScoresByCard[id]);
      if (!arr.length) return;
      const avg = Math.round(arr.reduce((sum, val) => sum + Number(val || 0), 0) / arr.length);
      map[id] = avg;
    });
    return map;
  }, [exampleParentIds, exampleScoresByCard]);

  const contextScoresByCard = useMemo(() => {
    const map = {};
    Object.values(contextAnswers).forEach((entry) => {
      if (!entry) return;
      const parentKey = entry.parentId != null ? String(entry.parentId) : null;
      if (!parentKey) return;
      if (!map[parentKey]) map[parentKey] = [];
      const sc = Number.isFinite(Number(entry.score)) ? Number(entry.score) : 0;
      map[parentKey].push(sc);
    });
    return map;
  }, [contextAnswers]);

  const contextParentSet = useMemo(() => {
    const set = new Set();
    safeArray(contextDeck).forEach((entry) => {
      if (!entry) return;
      const key = entry.parentId != null ? String(entry.parentId) : null;
      if (key) set.add(key);
    });
    return set;
  }, [contextDeck]);

  const contextParentIds = useMemo(() => Array.from(contextParentSet), [contextParentSet]);

  const contextAverages = useMemo(() => {
    const map = {};
    contextParentIds.forEach((id) => {
      const arr = safeArray(contextScoresByCard[id]);
      if (!arr.length) return;
      const avg = Math.round(arr.reduce((sum, val) => sum + Number(val || 0), 0) / arr.length);
      map[id] = avg;
    });
    return map;
  }, [contextParentIds, contextScoresByCard]);

  const aggregated = useMemo(() => {
    const rows = batch.map(b => {
      // đảm bảo lấy score là number
      const idStr = String(b.id);
      const w = Number.isFinite(Number(warmupScores[b.id]?.score)) ? Number(warmupScores[b.id].score) : 0;
      const r = Number.isFinite(Number(recallScores[b.id]?.score)) ? Number(recallScores[b.id].score) : 0;

      if (isKanji) {
        const write1 = Number.isFinite(Number(writePass1Scores[b.id])) ? Number(writePass1Scores[b.id]) : 0;
        const exampleScores = safeArray(exampleScoresByCard[idStr]);
        const expectsExample = safeArray(b?.exampleCards).length > 0;
        const exampleAvg = exampleScores.length
            ? Math.round(exampleScores.reduce((sum, val) => sum + Number(val || 0), 0) / exampleScores.length)
            : (expectsExample ? 0 : null);
        const onKunScore = Number.isFinite(Number(onKunScores[b.id]?.score)) ? Number(onKunScores[b.id].score) : 0;
        const contextScores = safeArray(contextScoresByCard[idStr]);
        const expectsContext = contextParentSet.has(idStr);
        const contextAvg = contextScores.length
            ? Math.round(contextScores.reduce((sum, val) => sum + Number(val || 0), 0) / contextScores.length)
            : (expectsContext ? 0 : null);
        const exampleVal = Number.isFinite(Number(exampleAvg)) ? Number(exampleAvg) : 0;
        const contextVal = Number.isFinite(Number(contextAvg)) ? Number(contextAvg) : 0;
        const weighted = (
            write1 * 15 +
            w * 20 +
            exampleVal * 20 +
            onKunScore * 10 +
            r * 20 +
            contextVal * 5
        ) / 100;
        const final = Math.max(0, Math.min(5, Math.round(weighted)));

        return {
          id: idStr,
          card_id: idStr,
          front: b.front ?? null,
          back: b.back ?? null,
          write1,
          warmup: Number(w),
          example: exampleAvg != null ? Number(exampleAvg) : null,
          onKun: Number(onKunScore),
          recall: Number(r),
          context: contextAvg != null ? Number(contextAvg) : null,
          final,
        };
      }

      const exampleScores = safeArray(exampleScoresByCard[idStr]);
      const e = exampleScores.length
          ? Math.round(exampleScores.reduce((sum, val) => sum + Number(val || 0), 0) / exampleScores.length)
          : null;
      const final = floorAvg(w, r);

      return {
        id: idStr,
        card_id: idStr,   // **bắt buộc**: server dùng card_id
        front: b.front ?? null,
        back: b.back ?? null,
        write1: null,
        warmup: Number(w),
        example: e != null ? Number(e) : null,
        onKun: null,
        recall: Number(r),
        context: null,
        final: Number(final)
      };
    });

    const dist = [0,1,2,3,4,5].map(v => rows.filter(x => x.final === v).length);
    return { rows, dist };
  }, [batch, warmupScores, recallScores, exampleScoresByCard, isKanji, writePass1Scores, onKunScores, contextScoresByCard, contextParentSet]);

  const write1Summary = useMemo(() => {
    if (!isKanji) return null;
    if (!batch.length) return null;
    const values = [];
    for (const b of batch) {
      if (writePass1Scores[b.id] == null) return null;
      values.push(toNum(writePass1Scores[b.id], 0));
    }
    return computeLevelDistribution(values);
  }, [isKanji, batch, writePass1Scores]);

  const mcqSummary = useMemo(() => {
    if (!isKanji) return null;
    if (!batch.length) return null;
    const values = [];
    for (const b of batch) {
      const sc = warmupScores[b.id]?.score;
      if (!Number.isFinite(Number(sc))) return null;
      values.push(toNum(sc, 0));
    }
    return computeLevelDistribution(values);
  }, [isKanji, batch, warmupScores]);

  const exampleSummary = useMemo(() => {
    if (!isKanji) return null;
    if (!exampleParentIds.length) return null;
    const values = [];
    for (const id of exampleParentIds) {
      if (exampleAverages[id] == null) return null;
      values.push(toNum(exampleAverages[id], 0));
    }
    return computeLevelDistribution(values);
  }, [isKanji, exampleParentIds, exampleAverages]);

  const onKunSummary = useMemo(() => {
    if (!isKanji) return null;
    if (!batch.length) return null;
    const values = [];
    for (const b of batch) {
      const sc = onKunScores[b.id]?.score;
      if (!Number.isFinite(Number(sc))) return null;
      values.push(toNum(sc, 0));
    }
    return computeLevelDistribution(values);
  }, [isKanji, batch, onKunScores]);

  const recallSummary = useMemo(() => {
    if (!isKanji) return null;
    if (!batch.length) return null;
    const values = [];
    for (const b of batch) {
      const sc = recallScores[b.id]?.score;
      if (!Number.isFinite(Number(sc))) return null;
      values.push(toNum(sc, 0));
    }
    return computeLevelDistribution(values);
  }, [isKanji, batch, recallScores]);

  const contextSummary = useMemo(() => {
    if (!isKanji) return null;
    if (!contextParentIds.length) return null;
    const values = [];
    for (const id of contextParentIds) {
      if (contextAverages[id] == null) return null;
      values.push(toNum(contextAverages[id], 0));
    }
    return computeLevelDistribution(values);
  }, [isKanji, contextParentIds, contextAverages]);

  // save session + bump offset
  useEffect(() => {
    (async () => {
      if (phase !== 'done' || !batch.length || !order.length) return;
      try {
        const summary = (() => {
          const learned = aggregated.rows.filter(x => x.final>=3).length;
          const left = (batch.length||0) - learned;
          return { total: batch.length||0, learned, left, agg: aggregated.dist };
        })();
        await fetch('/api/sessions', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ type: typeFilter, cards: aggregated.rows, summary }) });
        const offRes = await getJSON(`/api/offsets?type=${encodeURIComponent(typeFilter)}`);
        const offset = Number(offRes?.offset || 0);
        const nextOff = order.length ? ((offset + CHUNK_SIZE) % order.length) : 0;
        await fetch('/api/offsets', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ type: typeFilter, offset: nextOff }) });
      } catch {}
    })();
  }, [phase, batch.length, aggregated, order.length, typeFilter]);

  const totalSteps = (() => {
    if (!batch.length) return 0;
    if (isKanji) {
      return (batch.length * 4) + exampleDeck.length + contextDeck.length;
    }
    return (batch.length * 2) + (enableExamples ? exampleDeck.length : 0);
  })();

  const completedSteps = (() => {
    if (!batch.length) return 0;
    if (isKanji) {
      if (phase === 'write1') return Math.min(index + 1, Math.max(batch.length, 1));
      if (phase === 'warmup') return batch.length + Math.min(index + 1, Math.max(batch.length, 1));
      if (phase === 'warmup_summary') return batch.length * 2;
      if (phase === 'example') return (batch.length * 2) + Math.min(exampleIndex + 1, Math.max(exampleDeck.length, 1));
      if (phase === 'on_kun') return (batch.length * 2) + exampleDeck.length + Math.min(index + 1, Math.max(batch.length, 1));
      if (phase === 'recall') return (batch.length * 3) + exampleDeck.length + Math.min(index + 1, Math.max(batch.length, 1));
      if (phase === 'context') return (batch.length * 4) + exampleDeck.length + Math.min(contextIndex + 1, Math.max(contextDeck.length, 1));
      if (phase === 'done') return totalSteps;
      return 0;
    }
    if (recallFirst) {
      if (phase === 'recall') return Math.min(index + 1, Math.max(batch.length, 1));
      if (phase === 'warmup') return batch.length + Math.min(index + 1, Math.max(batch.length, 1));
      if (phase === 'warmup_summary') return batch.length * 2;
      if (phase === 'done') return totalSteps;
      return 0;
    }
    if (phase === 'warmup') return Math.min(index + 1, Math.max(batch.length, 1));
    if (phase === 'warmup_summary') return batch.length;
    if (phase === 'recall') return batch.length + Math.min(index + 1, Math.max(batch.length, 1));
    if (phase === 'example') return (batch.length * 2) + Math.min(exampleIndex + 1, Math.max(exampleDeck.length, 1));
    if (phase === 'done') return totalSteps;
    return 0;
  })();
  const progressPct = totalSteps ? Math.round((completedSteps / totalSteps) * 100) : 0;

  const PHASE_ORDER = useMemo(() => ({
    write1: 0,
    warmup: 1,
    warmup_summary: 2,
    example: 3,
    on_kun: 4,
    recall: 5,
    context: 6,
    done: 7,
  }), []);
  const phaseOrderIndex = PHASE_ORDER[phase] ?? 0;

  const summaryCards = [];
  const pushSummaryCard = (key, title, summary, note) => {
    if (!summary || summary.total <= 0) return;
    summaryCards.push(
        <Card key={key} sx={{ borderRadius:3, border:'1px solid #ffe0e0', background:'#fff', mt:2 }}>
          <CardContent>
            <Typography variant="subtitle1" sx={{ fontWeight:600, mb:1 }}>{title}</Typography>
            <Typography sx={{ opacity:0.7, mb:1 }}>{note || `Tổng thẻ: ${summary.total}`}</Typography>
            <Stack direction="row" spacing={1} flexWrap="wrap">
              {summary.dist.map((count, level) => (
                  <Chip key={level} label={`Mức ${level}: ${count}`} />
              ))}
            </Stack>
          </CardContent>
        </Card>
    );
  };

  if (isKanji) {
    if (phaseOrderIndex > PHASE_ORDER.write1) {
      pushSummaryCard('summary-write1', 'Tổng kết · Viết nét lần 1', write1Summary);
    }
    if (phaseOrderIndex > PHASE_ORDER.warmup) {
      pushSummaryCard('summary-mcq', 'Tổng kết · MCQ', mcqSummary);
    }
    if (phaseOrderIndex > PHASE_ORDER.example) {
      pushSummaryCard('summary-example', 'Tổng kết · MCQ Ví dụ', exampleSummary, exampleSummary ? `Số thẻ có ví dụ: ${exampleSummary.total}` : null);
    }
    if (phaseOrderIndex > PHASE_ORDER.on_kun) {
      pushSummaryCard('summary-onkun', 'Tổng kết · MCQ Âm đọc On/Kun', onKunSummary);
    }
    if (phaseOrderIndex > PHASE_ORDER.recall) {
      pushSummaryCard('summary-recall', 'Tổng kết · Viết nét lần 2', recallSummary);
    }
    if (phaseOrderIndex > PHASE_ORDER.context) {
      pushSummaryCard('summary-context', 'Tổng kết · MCQ Ngữ cảnh', contextSummary, contextSummary ? `Số thẻ có ngữ cảnh: ${contextSummary.total}` : null);
    }
  }

  // render
  return (
      <Container>
        <Stack direction={{ xs:'column', md:'row' }} spacing={1} alignItems="center" sx={{ mb:2 }}>
          <Typography variant="h5" sx={{ fontWeight:700, flex:1, color:'#d94b4b' }}>Flashcards</Typography>
          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel>Loại thẻ</InputLabel>
            <Select value={typeFilter} label="Loại thẻ" onChange={(e)=>setTypeFilter(e.target.value)}>
              <MenuItem value="vocab">Từ vựng</MenuItem>
              <MenuItem value="kanji">Kanji</MenuItem>
              <MenuItem value="particle">Trợ từ</MenuItem>
              <MenuItem value="grammar">Ngữ pháp</MenuItem>
            </Select>
          </FormControl>
        </Stack>

        {loading && <Typography>Đang tải…</Typography>}

        {!loading && !!errMsg && <Typography sx={{ mb:1, color:'#a33b3b' }}>{errMsg}</Typography>}

        {!loading && hasAnyData && !hasTypeData && (
            <Card sx={{ borderRadius:3, border:'1px solid #ffe0e0', background:'#fff' }}>
              <CardContent><Typography>Không có thẻ cho loại “{typeFilter}”. Hãy import dữ liệu ở trang Home.</Typography></CardContent>
            </Card>
        )}

        {!loading && hasTypeData && batch.length>0 && (
            <>
              <LinearProgress variant="determinate" value={progressPct} sx={{ mb:2, height:8, borderRadius:10 }} />
              <Typography sx={{ mb:1, color:'text.secondary' }}>
                {isKanji && phase==='write1' && <>Phần 1 – Viết nét lần 1 {batch.length ? `${index+1}/${batch.length}` : ''}</>}
                {phase==='warmup' && (
                    isKanji
                        ? <>Phần 2 – MCQ nghĩa {batch.length ? `${index+1}/${batch.length}` : ''}</>
                        : <>Warm-up {batch.length ? `${index+1}/${batch.length}` : ''}</>
                )}
                {phase==='warmup_summary' && (
                    isKanji ? 'Tổng kết phần 2' : 'Tổng kết Warm-up'
                )}
                {phase==='example' && <>Phần 3 – Ví dụ {exampleDeck.length ? `${exampleIndex+1}/${exampleDeck.length}` : ''}</>}
                {isKanji && phase==='on_kun' && <>Phần 4 – On/Kun {batch.length ? `${index+1}/${batch.length}` : ''}</>}
                {phase==='recall' && (
                    isKanji
                        ? <>Phần 5 – Viết nét lần 2 {batch.length ? `${index+1}/${batch.length}` : ''}</>
                        : <>Điền đáp án {batch.length ? `${index+1}/${batch.length}` : ''}</>
                )}
                {isKanji && phase==='context' && <>Phần 6 – Ngữ cảnh {contextDeck.length ? `${contextIndex+1}/${contextDeck.length}` : ''}</>}
              </Typography>

              {summaryCards.map((node) => node)}

              {phase==='write1' && card && (
                  <Card sx={{ borderRadius:3, border:'1px solid #ffe0e0', background:'#fff' }}>
                    <CardContent>
                      <Typography variant="h6" sx={{ mb:1, color:'#a33b3b' }}>
                        Phần 1 – Viết nét lần 1: <b>{card.front}</b>
                      </Typography>
                      <Stack spacing={1}>
                        <HandwritingCanvas width={320} height={220} showGrid />
                        {showWrite1Answer && (
                            <Stack spacing={0.5}>
                              <Typography>Đáp án đúng: <b>{card.front}</b></Typography>
                              {card.back && (
                                  <Typography>
                                    Nghĩa: <b>{card.back}</b>{cardSpellLabel ? ` - ${cardSpellLabel}` : ''}
                                  </Typography>
                              )}
                              {!card.back && cardSpellLabel && (
                                  <Typography>On/Kun: <b>{cardSpellLabel}</b></Typography>
                              )}
                            </Stack>
                        )}
                      </Stack>
                      <Stack className="responsive-stack" direction="row" spacing={1} sx={{ mt:2 }}>
                        <Button variant="contained" onClick={handleWrite1Check} fullWidth>Kiểm tra</Button>
                      </Stack>
                      {showWrite1Answer && (
                          <>
                            <Divider sx={{ my:2 }} />
                            <Typography>Chọn điểm tự chấm (0–5):</Typography>
                            <Stack className="responsive-stack" direction="row" spacing={1}
                                   sx={{ mt:1, flexWrap:'nowrap', overflowX:'auto' }}>
                              {[0,1,2,3,4,5].map(v => (
                                  <Button
                                      key={v}
                                      variant={(writePass1Scores[card.id] ?? null) === v ? 'contained' : 'outlined'}
                                      onClick={() => handleWrite1Score(v)}
                                      sx={{ flex:1, minWidth:0 }}
                                  >
                                    {v}
                                  </Button>
                              ))}
                            </Stack>
                            <Stack className="responsive-stack" direction="row" spacing={1} sx={{ mt:2 }}>
                              <Button
                                  variant="outlined"
                                  onClick={handleWrite1Next}
                                  disabled={writePass1Scores[card.id] == null}
                                  fullWidth
                              >
                                {index + 1 < batch.length ? 'Lưu & tiếp Kanji' : 'Lưu & sang MCQ (Phần 2)'}
                              </Button>
                            </Stack>
                          </>
                      )}
                    </CardContent>
                  </Card>
              )}

              {phase==='warmup' && card && (
                  <>
                <WarmupMCQ
                    key={card.id}
                    card={card}
                    deck={batch}
                    isKanji={isKanji}
                    onCheck={onWarmupChecked}
                    spellLabel={cardSpellLabel}
                />
                    <Stack className="responsive-stack" direction="row" spacing={1} sx={{ mt:2 }}>
                      <Button variant="outlined" onClick={nextWarmup} fullWidth>Tiếp</Button>
                    </Stack>
                  </>
              )}

              {phase==='warmup_summary' && (
                  <Card sx={{ borderRadius:3, border:'1px solid #ffe0e0', background:'#fff' }}>
                    <CardContent>
                      <Typography variant="h6" sx={{ mb:1, color:'#a33b3b' }}>
                        {isKanji ? 'Tổng quan phần 2 – MCQ (20%)' : 'Tổng quan Warm-up (10 thẻ)'}
                      </Typography>
                      {mcqSummary && (
                          <>
                            <Typography sx={{ opacity:0.7, mb:1 }}>Tổng thẻ: {mcqSummary.total}</Typography>
                            <Stack direction="row" spacing={1} flexWrap="wrap">
                              {mcqSummary.dist.map((count, level) => (
                                  <Chip key={level} label={`Mức ${level}: ${count}`} />
                              ))}
                            </Stack>
                          </>
                      )}
                      <Divider sx={{ my:2 }} />
                      <Button
                          variant="contained"
                          onClick={() => {
                            if (isKanji) {
                              if (exampleDeck.length > 0) {
                                setPhase('example');
                                setExampleIndex(0);
                              } else {
                                setPhase('on_kun');
                                setIndex(0);
                              }
                            } else if (recallFirst) {
                              setPhase('done');
                            } else {
                              setPhase('recall');
                              setIndex(0);
                              setAnswer('');
                            }
                          }}
                      >
                        {isKanji
                            ? (exampleDeck.length > 0 ? 'Sang MCQ Ví dụ (Phần 3)' : 'Sang MCQ On/Kun (Phần 4)')
                            : (recallFirst ? 'Hoàn thành phiên' : 'Bắt đầu (lặp lại 10 thẻ)')}
                      </Button>
                    </CardContent>
                  </Card>
              )}

              {phase==='recall' && card && (
                  <Card sx={{ borderRadius:3, border:'1px solid #ffe0e0', background:'#fff' }}>
                    <CardContent>
                      <Stack className="responsive-stack" direction="row" justifyContent="space-between" alignItems="center" sx={{ mb:1 }}>
                        {isKanji ? (
                            <Typography variant="h6" sx={{ color:'#a33b3b', textAlign: { xs: 'center', sm: 'left' } }}>
                              Phần 5 – Viết nét lần 2: <b>{kanjiLabel(card)}</b>
                            </Typography>
                        ) : (
                            <Typography variant="h6" sx={{ color:'#a33b3b', textAlign: { xs: 'center', sm: 'left' } }}>{card.front}</Typography>
                        )}

                        <ToggleButtonGroup
                          size="small"
                          exclusive
                          value={mode}
                          onChange={(e,v)=>{
                          if (!v) return;
                          if (isKanji && v === 'typing') return;
                          setMode(v);
                        }}
                          sx={{ width: { xs: '100%', sm: 'auto' }, justifyContent: 'center' }}
                        >
                          <ToggleButton value="typing" disabled={isKanji}>Gõ</ToggleButton>
                          {isKanji && <ToggleButton value="handwrite">Viết tay</ToggleButton>}
                        </ToggleButtonGroup>
                      </Stack>

                      {(mode==='typing' && !isKanji) ? (
                          <Stack spacing={1}>
                            <TextField
                                label={isKanji ? 'Nhập chữ Kanji' : 'Đáp án của bạn'}
                                value={answer}
                                onChange={(e)=>setAnswer(e.target.value)}
                            />
                          </Stack>
                      ) : (
                          <Stack spacing={1}>
                            <HandwritingCanvas width={320} height={220} showGrid />
                            <Typography sx={{ opacity:.7, fontSize:12 }}>
                              * Viết tay: bấm <b>Kiểm tra</b> để hiện đáp án rồi chọn mức nhớ (không chấm tự động).
                            </Typography>
                          </Stack>
                      )}

                      <Stack className="responsive-stack" direction="row" spacing={1} sx={{ mt:2 }}>
                        <Button variant="contained" onClick={checkRecall} fullWidth>Kiểm tra</Button>
                      </Stack>

                      {recallScores[card.id] && (
                          <>
                            <Divider sx={{ my:2 }} />
                            {isKanji ? (
                                <>
                                  {recallScores[card.id].mode === 'handwrite'
                                      ? (<Typography>Đáp án đúng (KANJI): <b>{card.front}</b></Typography>)
                                      : (
                                          <Typography>
                                            Kết quả: {recallScores[card.id].correct ? 'Đúng' : <>Sai · Đúng là: <b>{card.front}</b></>}
                                          </Typography>
                                      )}
                                  {card.back && (
                                      <Typography>
                                        Nghĩa: <b>{card.back}</b>{cardSpellLabel ? ` - ${cardSpellLabel}` : ''}
                                      </Typography>
                                  )}
                                  {!card.back && cardSpellLabel && (
                                      <Typography>On/Kun: <b>{cardSpellLabel}</b></Typography>
                                  )}
                                </>
                            ) : (
                                <Typography>
                                  Kết quả: {recallScores[card.id].correct ? 'Đúng' : <>Sai · Đúng là: <b>{card.back}</b></>}
                                </Typography>
                            )}

                            <Typography sx={{ mt:1 }}>Chọn mức độ nhớ (0–5):</Typography>
                            <Stack className="responsive-stack" direction="row" spacing={1} sx={{ mt:1 }}>
                              {[0,1,2,3,4,5].map(q => (
                                  <Button key={q} variant="outlined" onClick={()=>gradeRecall(q)} fullWidth>{q}</Button>
                              ))}
                            </Stack>
                          </>
                      )}
                    </CardContent>
                  </Card>
              )}

              {phase==='context' && contextDeck.length > 0 && contextCard && contextMcq && (
                  <Card sx={{ borderRadius:3, border:'1px solid #ffe0e0', background:'#fff' }}>
                    <CardContent>
                      <Typography variant="h6" sx={{ mb:1, color:'#a33b3b' }}>
                        Phần 6 – MCQ ngữ cảnh
                      </Typography>
                      <Typography sx={{ mb:2, fontStyle:'italic' }}>
                        {contextMcq.question}
                      </Typography>
                      <Stack spacing={1}>
                        {contextMcq.opts.map((opt, idx) => (
                            <Button
                                key={idx}
                                variant={contextSelected === opt ? 'contained' : 'outlined'}
                                onClick={() => handleContextPick(opt)}
                            >
                              {opt}
                            </Button>
                        ))}
                      </Stack>
                      <Stack className="responsive-stack" direction="row" spacing={1} sx={{ mt:2 }}>
                        <Button variant="contained" onClick={handleContextCheck} disabled={!contextSelected} fullWidth>Kiểm tra</Button>
                        <Button variant="outlined" onClick={nextContext} fullWidth>Tiếp</Button>
                      </Stack>
                      {contextChecked && (
                          <>
                            <Divider sx={{ my:2 }} />
                            <Typography>
                              {contextResult?.ok ? 'Đúng' : <>Sai · Đáp án đúng: <b>{contextMcq.correct}</b></>}
                            </Typography>
                            {contextResult && (
                                <Chip
                                    sx={{ mt:1 }}
                                    size="small"
                                    color="info"
                                    label={`Điểm: ${contextResult.score}${contextResult.timeSec != null ? ` (${contextResult.timeSec}s)` : ''}`}
                                />
                            )}
                          </>
                      )}
                    </CardContent>
                  </Card>
              )}

              {phase==='example' && exampleDeck.length > 0 && exampleCard && (
                  <Card sx={{ borderRadius:3, border:'1px solid #ffe0e0', background:'#fff' }}>
                    <CardContent>
                      <Typography variant="h6" sx={{ mb:1, color:'#a33b3b' }}>
                        Phần 3 – Ví dụ {exampleIndex + 1}/{exampleDeck.length}
                      </Typography>
                      <ExampleMCQ
                          key={exampleKey(exampleCard) || `example-${exampleIndex}`}
                          example={exampleCard}
                          pool={examplePool}
                          onCheck={handleExampleChecked}
                          scoreFunc={timeToScoreSec}
                      />
                      <Stack className="responsive-stack" direction="row" spacing={1} sx={{ mt:2 }}>
                        <Button variant="outlined" onClick={nextExample} fullWidth>
                          {exampleIndex + 1 < exampleDeck.length ? 'Tiếp ví dụ' : 'Hoàn thành ví dụ'}
                        </Button>
                      </Stack>
                    </CardContent>
                  </Card>
              )}

              {phase==='on_kun' && card && onKunMcq && (
                  <Card sx={{ borderRadius:3, border:'1px solid #ffe0e0', background:'#fff' }}>
                    <CardContent>
                      <Typography variant="h6" sx={{ mb:1, color:'#a33b3b' }}>
                        Phần 4 – Chọn âm On/Kun cho: <b>{card.front}</b>
                      </Typography>
                      <Stack spacing={1}>
                        {onKunMcq.opts.map((opt, idx) => (
                            <Button
                                key={idx}
                                variant={onKunSelected === opt ? 'contained' : 'outlined'}
                                onClick={() => handleOnKunPick(opt)}
                            >
                              {opt}
                            </Button>
                        ))}
                      </Stack>
                      <Stack className="responsive-stack" direction="row" spacing={1} sx={{ mt:2 }}>
                        <Button variant="contained" onClick={handleOnKunCheck} disabled={!onKunSelected} fullWidth>Kiểm tra</Button>
                        <Button variant="outlined" onClick={nextOnKun} fullWidth>Tiếp</Button>
                      </Stack>
                      {onKunChecked && (
                          <>
                            <Divider sx={{ my:2 }} />
                            <Typography>
                              {onKunResult?.ok ? 'Đúng' : <>Sai · Đáp án đúng: <b>{onKunMcq.correct}</b></>}
                            </Typography>
                            {onKunResult && (
                                <Chip
                                    sx={{ mt:1 }}
                                    size="small"
                                    color="info"
                                    label={`Điểm: ${onKunResult.score}${onKunResult.timeSec != null ? ` (${onKunResult.timeSec}s)` : ''}`}
                                />
                            )}
                          </>
                      )}
                    </CardContent>
                  </Card>
              )}

              {phase==='done' && (
                  <Card sx={{ borderRadius:3, border:'1px solid #ffe0e0', background:'#fff' }}>
                    <CardContent>
                      <Typography variant="h6" sx={{ mb:1, color:'#a33b3b' }}>
                        {isKanji
                            ? `Tổng quan session Kanji (${aggregated.rows.length} thẻ · 6 phần trọng số)`
                            : `Tổng quan session (${aggregated.rows.length} thẻ · Warm-up + Recall${enableExamples ? ' + Ví dụ' : ''})`}
                      </Typography>

                      <Typography variant="subtitle2" sx={{ mt:1, mb:1 }}>Từ trong session & mức nhớ gộp:</Typography>
                      <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mb:1 }}>
                        {aggregated.rows.map(row => (
                            <Chip
                                key={row.id}
                                label={isKanji
                                    ? `${row.front ?? '—'} (Final: ${row.final})`
                                    : `${row.front ?? '—'} (${row.final})${row.example != null ? ` · Ví dụ:${row.example}` : ''}`}
                                sx={{ mr:1, mb:1 }}
                            />
                        ))}
                      </Stack>

                      <Typography variant="subtitle2">Phân bố mức nhớ gộp:</Typography>
                      <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mb:1 }}>
                        {[0,1,2,3,4,5].map(v => <Chip key={v} label={`Mức ${v}: ${aggregated.dist[v]}`} />)}
                      </Stack>

                      {isKanji && (
                          <>
                            <Typography variant="subtitle2" sx={{ mt:1 }}>Điểm chi tiết theo từng phần:</Typography>
                            <Stack spacing={1} sx={{ mb:2 }}>
                              {aggregated.rows.map((row) => (
                                  <Stack key={row.id} direction={{ xs:'column', md:'row' }} spacing={1}
                                         sx={{ border:'1px solid #eee', borderRadius:2, p:1 }}>
                                    <Typography sx={{ flex:1, textAlign:{ xs:'center', md:'left' } }}>
                                      <b>{row.front ?? '—'}</b>{row.back ? ` · ${row.back}` : ''}
                                    </Typography>
                                    <Stack direction="row" spacing={1} flexWrap="wrap" justifyContent={{ xs:'center', md:'flex-start' }}>
                                      <Chip size="small" label={`Viết1: ${Number.isFinite(Number(row.write1)) ? Number(row.write1) : '—'}`} />
                                      <Chip size="small" label={`MCQ: ${Number.isFinite(Number(row.warmup)) ? Number(row.warmup) : '—'}`} />
                                      <Chip size="small" label={`Ví dụ: ${Number.isFinite(Number(row.example)) ? Number(row.example) : '—'}`} />
                                      <Chip size="small" label={`On/Kun: ${Number.isFinite(Number(row.onKun)) ? Number(row.onKun) : '—'}`} />
                                      <Chip size="small" label={`Viết2: ${Number.isFinite(Number(row.recall)) ? Number(row.recall) : '—'}`} />
                                      <Chip size="small" label={`Ngữ cảnh: ${Number.isFinite(Number(row.context)) ? Number(row.context) : '—'}`} />
                                      <Chip size="small" color="primary" label={`Final: ${Number.isFinite(Number(row.final)) ? Number(row.final) : '—'}`} />
                                    </Stack>
                                  </Stack>
                              ))}
                            </Stack>
                          </>
                      )}

                      <Divider sx={{ my:2 }} />
                      <Stack className="responsive-stack" direction="row" spacing={1}>
                        <Button href="/progress" variant="contained" fullWidth>Xem Progress</Button>
                        <Button
                            variant="outlined"
                            onClick={async ()=>{
                              const offRes = await getJSON(`/api/offsets?type=${encodeURIComponent(typeFilter)}`);
                              const offset = Number(offRes?.offset || 0);
                              const ids = [];
                              for (let i=0;i<CHUNK_SIZE;i++){ const idx=(offset+i)%order.length; if(order[idx]) ids.push(order[idx].id); }
                              const cards = ids.map(id => order.find(c => c.id === id)).filter(Boolean);
                              setBatch(cards); setPhase(isKanji ? 'write1' : (recallFirst ? 'recall' : 'warmup')); setIndex(0);
                              setWarmupScores({}); setRecallScores({}); setAnswer('');
                              setExampleDeck([]); setExampleIndex(0); setExampleAnswers({});
                              setWritePass1Scores({}); setOnKunScores({});
                              setContextDeck([]); setContextIndex(0); setContextAnswers({});
                              setShowWrite1Answer(false);
                              setOnKunSelected(null); setOnKunChecked(false); setOnKunResult(null); setOnKunStartTs(null);
                              setContextSelected(null); setContextChecked(false); setContextResult(null); setContextStartTs(null);
                            }}
                            fullWidth
                        >Tiếp 20 lượt (10 thẻ mới)</Button>
                        <Button onClick={()=>{
                          setPhase(isKanji ? 'write1' : (recallFirst ? 'recall' : 'warmup'));
                          setIndex(0);
                          setWarmupScores({});
                          setRecallScores({});
                          setWritePass1Scores({});
                          setOnKunScores({});
                          setContextAnswers({});
                          if (!isKanji) {
                            setContextDeck([]);
                          }
                          setContextIndex(0);
                          setAnswer('');
                          setExampleIndex(0);
                          setExampleAnswers({});
                          setShowWrite1Answer(false);
                          setOnKunSelected(null); setOnKunChecked(false); setOnKunResult(null); setOnKunStartTs(null);
                          setContextSelected(null); setContextChecked(false); setContextResult(null); setContextStartTs(null);
                        }} fullWidth>
                          Học lại phiên này
                        </Button>
                      </Stack>
                    </CardContent>
                  </Card>
              )}
            </>
        )}
      </Container>
  );
}
