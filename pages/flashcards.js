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

// ---------- helpers ----------
const safeArray = (x) => (Array.isArray(x) ? x : []);
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
  const { hv, on, kun } = getKanjiMeta(card);
  const onPart  = on ? `on:${on}`   : 'on:—';
  const kunPart = kun? `kun:${kun}` : 'kun:—';
  return hv ? `${hv} · ${onPart} · ${kunPart}` : `${onPart} · ${kunPart}`;
}

// ---------- Warmup MCQ ----------
function WarmupMCQ({ card, deck, isKanji, onCheck, examples }) {
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

  const exampleList = Array.isArray(examples) ? examples : [];

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
            {checked && exampleList.length > 0 && (
                <Stack spacing={0.5} sx={{ textAlign: { xs: 'center', sm: 'left' } }}>
                  <Divider sx={{ my: 1 }} />
                  <Typography variant="subtitle2">Ví dụ liên quan:</Typography>
                  {exampleList.map((ex, idx) => (
                      <Typography key={idx} sx={{ fontSize: 14 }}>
                        <b>{ex.front}</b>{ex.back ? ` · ${ex.back}` : ''}
                      </Typography>
                  ))}
                </Stack>
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
  const isKanji = typeFilter === 'kanji';
  const enableExamples = isKanji;

  // data + session
  const [allCards, setAllCards] = useState([]);
  const [order, setOrder] = useState([]);
  const [batch, setBatch] = useState([]);
  const [phase, setPhase] = useState('idle'); // idle | warmup | warmup_summary | recall | done
  const [index, setIndex] = useState(0);

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
    setAnswer('');
    setMode(isKanji ? 'handwrite' : 'typing');
    setExampleDeck([]); setExampleIndex(0); setExampleAnswers({});
  }, [typeFilter]); // eslint-disable-line

  // pool theo loại
  useEffect(() => {
    const next = safeArray(allCards).filter((c) => {
      if (!c || c.type !== typeFilter) return false;
      return true;
    });
    setOrder(next);
  }, [allCards, typeFilter]);

  useEffect(() => {
    if (!enableExamples) {
      setExampleDeck([]);
      setExampleIndex(0);
      setExampleAnswers({});
      return;
    }

    const list = [];
    safeArray(batch).forEach((item) => {
      const examples = safeArray(item?.exampleCards);
      examples.forEach((ex) => {
        list.push({
          ...ex,
          parentId: item.id,
          parentFront: item.front ?? '',
          parentBack: item.back ?? '',
        });
      });
    });
    setExampleDeck(list);
    setExampleIndex(0);
    setExampleAnswers({});
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
          setBatch(cards); setPhase('warmup'); setIndex(0);
          setWarmupScores({}); setRecallScores({});
          return;
        }
      }
      const offRes = await getJSON(`/api/offsets?type=${encodeURIComponent(typeFilter)}`);
      const offset = Number(offRes?.offset || 0);
      const ids = [];
      for (let i=0;i<CHUNK_SIZE;i++){ const idx=(offset+i)%order.length; if(order[idx]) ids.push(order[idx].id); }
      const cards = ids.map(id => order.find(c => c.id === id)).filter(Boolean);
      setBatch(cards); setPhase('warmup'); setIndex(0);
      setWarmupScores({}); setRecallScores({});
    })();
  }, [router.isReady, router.query?.sessionId, hasTypeData, order, typeFilter]);

  const card = batch[index] || null;
  const currentExamples = useMemo(() => safeArray(card?.exampleCards), [card]);
  const exampleCard = exampleDeck[exampleIndex] || null;
  const examplePool = useMemo(() => safeArray(exampleLookup?.pool), [exampleLookup]);

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

  const nextExample = () => {
    if (!exampleCard) return;
    ensureExampleRecorded(exampleCard);
    if (exampleIndex + 1 < exampleDeck.length) setExampleIndex(i => i + 1);
    else setPhase('done');
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
      if (enableExamples && exampleDeck.length > 0) {
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
      if (!map[entry.parentId]) map[entry.parentId] = [];
      const sc = Number.isFinite(Number(res.score)) ? Number(res.score) : 0;
      map[entry.parentId].push(sc);
    });
    return map;
  }, [exampleDeck, exampleAnswers]);

  const aggregated = useMemo(() => {
    const rows = batch.map(b => {
      // đảm bảo lấy score là number
      const w = Number.isFinite(Number(warmupScores[b.id]?.score)) ? Number(warmupScores[b.id].score) : 0;
      const r = Number.isFinite(Number(recallScores[b.id]?.score)) ? Number(recallScores[b.id].score) : 0;
      const exampleScores = safeArray(exampleScoresByCard[b.id]);
      const expectsExample = enableExamples && String(b?.type || '').toLowerCase() === 'kanji' && safeArray(b?.exampleCards).length > 0;
      const e = exampleScores.length
          ? Math.round(exampleScores.reduce((sum, val) => sum + Number(val || 0), 0) / exampleScores.length)
          : (expectsExample ? 0 : null);
      const final = floorAvg(w, r);

      return {
        id: String(b.id),
        card_id: String(b.id),   // **bắt buộc**: server dùng card_id
        front: b.front ?? null,
        back: b.back ?? null,
        warmup: Number(w),
        recall: Number(r),
        example: e != null ? Number(e) : null,
        final: Number(final)
      };
    });

    const dist = [0,1,2,3,4,5].map(v => rows.filter(x => x.final === v).length);
    return { rows, dist };
  }, [batch, warmupScores, recallScores, exampleScoresByCard]);

  const warmupDist = useMemo(() => {
    const dist = [0,1,2,3,4,5].map(()=>0);
    for (const b of batch) {
      const sc = warmupScores[b.id]?.score;
      if (Number.isInteger(sc) && sc>=0 && sc<=5) dist[sc] += 1;
    }
    return dist;
  }, [batch, warmupScores]);

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

  const totalSteps = (batch.length * 2) + (enableExamples ? exampleDeck.length : 0);
  const completedSteps = (() => {
    if (!batch.length) return 0;
    if (phase === 'warmup') return index + 1;
    if (phase === 'warmup_summary') return batch.length;
    if (phase === 'recall') return batch.length + index + 1;
    if (phase === 'example') return (batch.length * 2) + Math.min(exampleIndex + 1, exampleDeck.length || 0);
    if (phase === 'done') return totalSteps;
    return 0;
  })();
  const progressPct = totalSteps ? Math.round((completedSteps / totalSteps) * 100) : 0;

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
                {phase==='warmup' && <>Warm-up {index+1}/{batch.length}</>}
                {phase==='recall' && <>Điền đáp án {index+1}/{batch.length}</>}
                {phase==='example' && <>Ví dụ {exampleIndex+1}/{exampleDeck.length}</>}
              </Typography>

              {phase==='warmup' && card && (
                  <>
                    <WarmupMCQ
                        key={card.id}
                        card={card}
                        deck={batch}
                        isKanji={isKanji}
                        examples={currentExamples}
                        onCheck={onWarmupChecked}
                    />
                    <Stack className="responsive-stack" direction="row" spacing={1} sx={{ mt:2 }}>
                      <Button variant="outlined" onClick={nextWarmup} fullWidth>Tiếp</Button>
                    </Stack>
                  </>
              )}

              {phase==='warmup_summary' && (
                  <Card sx={{ borderRadius:3, border:'1px solid #ffe0e0', background:'#fff' }}>
                    <CardContent>
                      <Typography variant="h6" sx={{ mb:1, color:'#a33b3b' }}>Tổng quan Warm-up (10 thẻ)</Typography>
                      <Stack direction="row" spacing={1} flexWrap="wrap">
                        {[0,1,2,3,4,5].map(v => <Chip key={v} label={`Mức ${v}: ${warmupDist[v]}`} />)}
                      </Stack>
                      <Divider sx={{ my:2 }} />
                      <Button variant="contained" onClick={()=>{ setPhase('recall'); setIndex(0); setAnswer(''); }}>
                        Bắt đầu (lặp lại 10 thẻ)
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
                              Điền KANJI cho: <b>{kanjiLabel(card)}</b>
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
                                (recallScores[card.id].mode === 'handwrite')
                                    ? (<Typography>Đáp án đúng (KANJI): <b>{card.front}</b></Typography>)
                                    : (
                                        <Typography>
                                          Kết quả: {recallScores[card.id].correct ? 'Đúng' : <>Sai · Đúng là: <b>{card.front}</b></>}
                                        </Typography>
                                    )
                            ) : (
                                <Typography>
                                  Kết quả: {recallScores[card.id].correct ? 'Đúng' : <>Sai · Đúng là: <b>{card.back}</b></>}
                                </Typography>
                            )}

                            {currentExamples.length > 0 && (
                                <Stack spacing={0.5} sx={{ mt:1 }}>
                                  <Typography variant="subtitle2">Ví dụ liên quan:</Typography>
                                  {currentExamples.map((ex, idx) => (
                                      <Typography key={idx} sx={{ fontSize: 14 }}>
                                        <b>{ex.front}</b>{ex.back ? ` · ${ex.back}` : ''}
                                      </Typography>
                                  ))}
                                </Stack>
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

              {phase==='example' && exampleDeck.length > 0 && exampleCard && (
                  <Card sx={{ borderRadius:3, border:'1px solid #ffe0e0', background:'#fff' }}>
                    <CardContent>
                      <Typography variant="h6" sx={{ mb:1, color:'#a33b3b' }}>
                        Ví dụ {exampleIndex + 1}/{exampleDeck.length}
                      </Typography>
                      {exampleCard.parentFront && (
                          <Typography sx={{ mb:1 }}>
                            Thuộc Kanji: <b>{exampleCard.parentFront}</b>
                            {exampleCard.parentBack ? ` · ${exampleCard.parentBack}` : ''}
                          </Typography>
                      )}
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

              {phase==='done' && (
                  <Card sx={{ borderRadius:3, border:'1px solid #ffe0e0', background:'#fff' }}>
                    <CardContent>
                      <Typography variant="h6" sx={{ mb:1, color:'#a33b3b' }}>
                        Tổng quan session (10 thẻ · Warm-up + Recall{enableExamples ? ' + Ví dụ' : ''})
                      </Typography>

                      <Typography variant="subtitle2" sx={{ mt:1, mb:1 }}>Từ trong session & mức nhớ gộp:</Typography>
                      <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mb:1 }}>
                        {aggregated.rows.map(row => (
                            <Chip
                                key={row.id}
                                label={`${row.front ?? '—'} (${row.final})${row.example != null ? ` · Ví dụ:${row.example}` : ''}`}
                                sx={{ mr:1, mb:1 }}
                            />
                        ))}
                      </Stack>

                      <Typography variant="subtitle2">Phân bố mức nhớ gộp:</Typography>
                      <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mb:1 }}>
                        {[0,1,2,3,4,5].map(v => <Chip key={v} label={`Mức ${v}: ${aggregated.dist[v]}`} />)}
                      </Stack>

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
                              setBatch(cards); setPhase('warmup'); setIndex(0);
                              setWarmupScores({}); setRecallScores({}); setAnswer('');
                              setExampleDeck([]); setExampleIndex(0); setExampleAnswers({});
                            }}
                            fullWidth
                        >Tiếp 20 lượt (10 thẻ mới)</Button>
                        <Button onClick={()=>{ setPhase('warmup'); setIndex(0); setWarmupScores({}); setRecallScores({}); setAnswer(''); setExampleIndex(0); setExampleAnswers({}); }} fullWidth>
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
