// pages/progress.js
import React from 'react';
import {
  Container, Typography, Grid, Card, CardContent, Chip, Divider,
  Stack, Button, Collapse, IconButton, FormControl, InputLabel, Select, MenuItem, Slider, Box
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';

import ReviewSettings from '../components/ReviewSettings';
import { useSettings as _useSettings } from '../lib/useSettings';
const useSettings = _useSettings || (() => ({
  settings: {
    cards_per_session: 10,
    auto_flip: 'off',
    review_mode: 'FSRS',
    recency_days: null,
  },
  saveSettings: () => {},
}));

// Helpers
function toArray(x) { return Array.isArray(x) ? x : []; }
const safeArray = (x) => (Array.isArray(x) ? x : []);
async function getJSON(url) {
  try { const r = await fetch(url); return await r.json(); }
  catch { return null; }
}
function isTodayUTC(iso) {
  const d = new Date(iso);
  const now = new Date();
  return d.toDateString() === now.toDateString();
}

export default function ProgressPage() {
  const { settings, saveSettings } = useSettings();
  const dueMode = settings?.due_mode || 'due-priority';

  const [typeFilter, setTypeFilter] = React.useState('vocab');
  const [stats, setStats] = React.useState({});
  const [sessions, setSessions] = React.useState([]);
  const [expanded, setExpanded] = React.useState({});
  const [openSettings, setOpenSettings] = React.useState(false);
  const [omniCount, setOmniCount] = React.useState(settings?.cards_per_session || 10);
  const [openLevelsOmni, setOpenLevelsOmni] = React.useState({});

  // Memory-level snapshot (nguồn dữ liệu chuẩn)
  const [mem, setMem] = React.useState({ rows: [], dist: [0, 0, 0, 0, 0, 0], total: 0 });

  React.useEffect(() => {
    setOmniCount(settings?.cards_per_session || 10);
  }, [settings?.cards_per_session]);

  const currentLevelOf = React.useCallback((card_id, fallback) => {
    const row = mem.rows.find(r => r.card_id === card_id);
    if (Number.isFinite(row?.level)) return row.level;
    if (Number.isFinite(Number(fallback))) return Number(fallback);
    return fallback ?? null;
  }, [mem.rows]);


  // Tổng số từ từng loại
  React.useEffect(() => {
    (async () => {
      const j = await getJSON('/api/stats');
      setStats(j || {});
    })();
  }, []);

  // Lịch sử sessions (chỉ để hiển thị)
  React.useEffect(() => {
    (async () => {
      const j = await getJSON('/api/sessions');
      setSessions(toArray(j));
    })();
  }, []);

  // Snapshot memory_levels (nguồn số liệu thật)
  React.useEffect(() => {
    (async () => {
      const j = await getJSON(`/api/memory/all?type=${encodeURIComponent(typeFilter)}`);
      if (j?.ok || j?.rows) {
        setMem({
          rows: j.rows || [],
          dist: j.dist || [0, 0, 0, 0, 0, 0],
          total: j.total || (j.rows?.length || 0),
        });
      } else {
        setMem({ rows: [], dist: [0, 0, 0, 0, 0, 0], total: 0 });
      }
    })();
  }, [typeFilter]);

  const memCardMap = React.useMemo(() => {
    const map = new Map();
    toArray(mem.rows).forEach((r) => {
      if (r?.card_id) map.set(r.card_id, r);
    });
    return map;
  }, [mem.rows]);



  // Tổng kết hôm nay
  const todayCards = React.useMemo(() => {
    const arr = [];
    toArray(sessions).forEach((s) => {
      if (s?.created_at && isTodayUTC(s.created_at)) {
        toArray(s.cards).forEach((c) => arr.push(c));
      }
    });
    return arr;
  }, [sessions]);
  const todayAvg = todayCards.length
      ? Math.round(todayCards.reduce((a, b) => a + (b.final || 0), 0) / todayCards.length)
      : 0;

  // Sessions theo loại
  const sessionsOfType = React.useMemo(
      () => toArray(sessions).filter((s) => s.type === typeFilter),
      [sessions, typeFilter]
  );
  const latest = sessionsOfType[0] || null;

  // Phân bố theo điểm session cho “Session gần nhất”
  const latestSessionDist = React.useMemo(() => {
    if (!latest) return [0, 0, 0, 0, 0, 0];
    const dist = [0, 0, 0, 0, 0, 0];
    toArray(latest.cards).forEach((c) => {
      const finalScore = Number.isFinite(Number(c?.final)) ? Number(c.final) : null;
      const recallScore = Number.isFinite(Number(c?.recall)) ? Number(c.recall) : null;
      const warmupScore = Number.isFinite(Number(c?.warmup)) ? Number(c.warmup) : null;
      const cardId = c?.card_id ?? c?.cardId ?? c?.id ?? null;
      const fallbackLevel = cardId ? currentLevelOf(cardId, null) : null;
      const level =
          finalScore ?? recallScore ?? warmupScore ?? (Number.isFinite(fallbackLevel) ? fallbackLevel : null);
      if (level != null && level >= 0 && level <= 5) dist[level] += 1;
    });
    return dist;
  }, [latest, currentLevelOf]);


  // Số liệu chính (memory_levels)
  // --- load live memory levels and compute stats ---
  const [memRows, setMemRows] = React.useState(null); // null = loading

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const url = `/api/memory/all?type=${encodeURIComponent(typeFilter || 'vocab')}`;
        const j = await getJSON(url);
        if (cancelled) return;
        const rows = Array.isArray(j?.rows) ? j.rows : (Array.isArray(j?.items) ? j.items : []);
        setMemRows(rows);
      } catch (e) {
        if (!cancelled) setMemRows([]);
      }
    })();
    return () => { cancelled = true; };
  }, [typeFilter, /* add dependencies when you want auto-refresh e.g. a 'refreshKey' */]);

// Compute stats from memRows
  const liveStats = React.useMemo(() => {
    if (!Array.isArray(memRows)) return { totalCards: null, learnedUnique: 0, dist:[0,0,0,0,0,0] };

    const dist = [0,0,0,0,0,0];
    let learnedUnique = 0;
    memRows.forEach(r=>{
      const lv = Number.isFinite(Number(r.level)) ? Number(r.level) : null;
      if (lv !== null && lv >= 0) {
        learnedUnique += 1;
        if (lv >=0 && lv <=5) dist[lv] += 1;
      }
    });

    return {
      learnedUnique,
      dist,
      totalCards: null // optional: fetch separately from /api/cards/count if you want
    };
  }, [memRows]);

  const totalWordsOfType = Number(stats?.[typeFilter] || 0);
  const learnedCount = Number(liveStats.learnedUnique || 0);
  const remaining = Math.max(0, totalWordsOfType - learnedCount);
  const globalDistOmni = mem.dist;
  const wordsByLevelOmni = (lvl) =>
      mem.rows.filter((r) => Number(r.level) === lvl && (r.front || r.back));
  const toggleLevelOmni = (lvl) =>
      setOpenLevelsOmni((prev) => ({ ...prev, [lvl]: !prev?.[lvl] }));


  // Điều hướng Review
  const goReviewLevel = (type, level, n) => {
    const qs = new URLSearchParams({ mode: 'level', type, level: String(level), n: String(n || 10) });
    window.location.href = `/review?${qs.toString()}`;
  };
  const goOmni = (type, n) => {
    const qs = new URLSearchParams({ mode: 'omni', type, n: String(n || 10) });
    const d = Number(settings?.recency_days);
    if (Number.isFinite(d) && d >= 0) qs.set('since_days', String(d));
    window.location.href = `/review?${qs.toString()}`;
  };

  function LeechList({ type = 'vocab', mem = { rows: [], dist:[0,0,0,0,0,0] } }) {
    const [leechRows, setLeechRows] = React.useState([]);
    const [loading, setLoading] = React.useState(false);
    const [memRowsLocal, setMemRowsLocal] = React.useState(null); // fallback if mem.rows not provided

    // helper
    const shuffle = (arr) => { const a=[...arr]; for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]];} return a; };
    const interleave = (a,b,n) => { const out=[]; const aa=[...a]; const bb=[...b]; while((aa.length||bb.length) && out.length<n){ if(aa.length) out.push(aa.shift()); if(out.length>=n) break; if(bb.length) out.push(bb.shift()); } while(out.length<n && aa.length) out.push(aa.shift()); while(out.length<n && bb.length) out.push(bb.shift()); return out.slice(0,n); };

    // load leech/top (server-side leech metadata)
    React.useEffect(()=>{
      let cancelled=false;
      (async()=>{
        try{
          const url = `/api/leech/top?type=${encodeURIComponent(type)}`;
          const j = await getJSON(url);
          const items = Array.isArray(j?.rows) ? j.rows : safeArray(j?.items||[]);
          const norm = items.map(x=>({
            card_id: String(x.card_id),
            front: x.front || x.card_front || '',
            back: x.back || x.card_back || '',
            leech_count: Number.isFinite(Number(x.leech_count)) ? Number(x.leech_count) : 0,
            is_leech: !!x.is_leech,
            level: Number.isFinite(Number(x.level)) ? Number(x.level) : null,
          }));
          norm.sort((a,b)=> (b.leech_count||0) - (a.leech_count||0));
          if(!cancelled) setLeechRows(norm);
        }catch(e){
          console.error('LeechList load error', e);
          if(!cancelled) setLeechRows([]);
        }
      })();
      return ()=> { cancelled=true; };
    }, [type]);

    // If caller didn't pass mem.rows, fetch memory/all here as fallback
    React.useEffect(()=>{
      let cancelled=false;
      if (Array.isArray(mem?.rows) && mem.rows.length) {
        setMemRowsLocal(null); // not needed
        return;
      }
      (async()=>{
        try{
          setLoading(true);
          const url = `/api/memory/all?type=${encodeURIComponent(type)}`;
          const j = await getJSON(url);
          const rows = Array.isArray(j?.rows) ? j.rows : safeArray(j?.items||[]);
          if(!cancelled) setMemRowsLocal(rows);
        }catch(e){
          console.warn('LeechList fallback memory/all fail', e);
          if(!cancelled) setMemRowsLocal([]);
        }finally{ if(!cancelled) setLoading(false); }
      })();
      return ()=> { cancelled=true; };
    }, [type, mem]);

    // choose memRows: prefer mem.rows, else local fetched rows
    const memRows = Array.isArray(mem?.rows) && mem.rows.length ? mem.rows : (Array.isArray(memRowsLocal) ? memRowsLocal : []);

    // build liveLeech = intersection leechRows ∩ memRows with liveLevel 0/1
    const liveLeech = React.useMemo(()=>{
      const memList = Array.isArray(memRows) ? memRows : [];
      const memMap = new Map(memList.map(r => [String(r.card_id), r]));
      const merged = [];
      const seen = new Set();

      const normalizeLevel = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);
      const normalizeCount = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

      toArray(leechRows).forEach((row) => {
        const cardId = String(row.card_id);
        const memRow = memMap.get(cardId) || null;
        const level = memRow ? normalizeLevel(memRow.level) : normalizeLevel(row.level);
        const leechCount = memRow ? normalizeCount(memRow.leech_count) : normalizeCount(row.leech_count);
        const shouldShow = level === 0 || level === 1;
        if (!shouldShow) return;
        merged.push({
          card_id: cardId,
          front: row.front || memRow?.front || '',
          back: row.back || memRow?.back || '',
          leech_count: leechCount,
          is_leech: row.is_leech || !!memRow?.is_leech || false,
          liveLevel: level,
          memRow,
        });
        seen.add(cardId);
      });

      memList.forEach((memRow) => {
        const cardId = String(memRow.card_id);
        if (seen.has(cardId)) return;
        const level = normalizeLevel(memRow.level);
        const leechCount = normalizeCount(memRow.leech_count);
        const shouldShow = level === 0 || level === 1;
        const flagged = leechCount > 0 || !!memRow.is_leech;
        if (shouldShow && flagged) {
          merged.push({
            card_id: cardId,
            front: memRow.front || '',
            back: memRow.back || '',
            leech_count: leechCount,
            is_leech: !!memRow.is_leech,
            liveLevel: level,
            memRow,
          });
        }
      });

      merged.sort((a, b) => {
        const diff = (b.leech_count || 0) - (a.leech_count || 0);
        if (diff !== 0) return diff;
        return (a.front || '').localeCompare(b.front || '');
      });

      return merged;
    }, [leechRows, memRows]);

    const has0 = ( (mem?.dist && mem.dist[0]) || (Array.isArray(memRows) && memRows.some(r=>Number(r.level)===0)) ) > 0;
    const has1 = ( (mem?.dist && mem.dist[1]) || (Array.isArray(memRows) && memRows.some(r=>Number(r.level)===1)) ) > 0;
    if (!has0 && !has1) return null;

    const buildQuickReviewIds = (n=20) => {
      const list0 = liveLeech.filter(r => r.liveLevel === 0).map(r => r.card_id);
      const list1 = liveLeech.filter(r => r.liveLevel === 1).map(r => r.card_id);
      if (list0.length && list1.length) return interleave(shuffle(list0), shuffle(list1), n);
      const pool = shuffle(list0.length ? list0 : list1);
      return pool.slice(0, n);
    };

    const goQuickReviewAll = () => {
      const ids = buildQuickReviewIds(20);
      if (!ids.length) { alert('Không có thẻ mức 0/1 để ôn nhanh leech.'); return; }
      const qs = new URLSearchParams({ mode:'level', type, card_ids: ids.join(','), n: String(ids.length) });
      window.location.href = `/review?${qs.toString()}`;
    };
    const goQuickReviewCard = (cardId) => {
      const qs = new URLSearchParams({ mode:'level', type, card_ids: String(cardId), n:'1' });
      window.location.href = `/review?${qs.toString()}`;
    };

    return (
        <Card sx={{ borderRadius: 3, mt: 2, border: '1px solid #ffe0e0', background: '#fff' }}>
          <CardContent>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Typography variant="h6">Leech board</Typography>
              <Stack direction="row" spacing={1} alignItems="center">
                <Button variant="outlined" onClick={goQuickReviewAll} disabled={liveLeech.length===0}>ÔN NHANH LEECH</Button>
              </Stack>
            </Stack>

            <Divider sx={{ my: 1 }} />

            {loading && <Typography sx={{ opacity:.7 }}>Đang load...</Typography>}
            {!loading && liveLeech.length===0 && <Typography sx={{ opacity:.7 }}>Hiện không có thẻ leech ở mức 0 hoặc 1.</Typography>}

            <Stack spacing={1} sx={{ mt:1 }}>
              {liveLeech.map(r => (
                  <Stack key={r.card_id} direction="row" spacing={1} alignItems="center" sx={{ border:'1px solid #f1f1f1', p:1, borderRadius:2 }}>
                    <Chip label={`×${r.leech_count||0}`} color={(r.leech_count||0)>0?'error':'default'} size="small" />
                    <Typography sx={{ flex:1 }}><b>{r.front}</b>{r.back?` · ${r.back}`:''}</Typography>
                    <Chip size="small" label={`Lv ${r.liveLevel ?? '—'}`} />
                    <Button size="small" variant="outlined" onClick={()=> goQuickReviewCard(r.card_id)}>Ôn</Button>
                  </Stack>
              ))}
            </Stack>
          </CardContent>
        </Card>
    );
  }

  return (
      <Container>
        <Typography
            variant="h5"
            sx={{ fontWeight: 700, mb: 2, color: '#d94b4b' }}
        >
          Quá trình học
        </Typography>

        {/* Bộ lọc loại thẻ */}
        <Stack
            direction={{ xs: 'column', md: 'row' }}
            spacing={1}
            sx={{ mb: 2 }}
            alignItems="center"
        >
          <FormControl size="small" sx={{ minWidth: 200 }}>
            <InputLabel>Loại thẻ</InputLabel>
            <Select
                value={typeFilter}
                label="Loại thẻ"
                onChange={(e) => setTypeFilter(e.target.value)}
            >
              <MenuItem value="vocab">Từ vựng</MenuItem>
              <MenuItem value="kanji">Kanji</MenuItem>
              <MenuItem value="particle">Trợ từ</MenuItem>
              <MenuItem value="grammar">Ngữ pháp</MenuItem>
            </Select>
          </FormControl>
        </Stack>

        {/* Tổng kết hôm nay */}
        <Card sx={{ border: '1px solid #ffe0e0', borderRadius: 3, mb: 2 }}>
          <CardContent>
            <Typography variant="h6">Tổng kết hôm nay (mọi loại)</Typography>
            <Stack direction="row" spacing={2} sx={{ mt: 1 }} flexWrap="wrap">
              <Chip label={`Từ đã ôn: ${todayCards.length}`} color="success" />
              <Chip label={`Mức nhớ TB: ${todayAvg}`} />
            </Stack>
          </CardContent>
        </Card>

        {/* Tổng quan (memory_levels) */}
        <Grid container spacing={2}>
          {[
            { label: 'Tổng từ', value: totalWordsOfType },
            { label: 'Đã học (unique)', value: learnedCount },
            { label: 'Còn lại', value: remaining },
          ].map((it, i) => (
              <Grid item xs={12} md={4} key={i}>
                <Card
                    sx={{
                      borderRadius: 3,
                      border: '1px solid #ffe0e0',
                      background: '#fff',
                    }}
                >
                  <CardContent>
                    <Typography variant="h6">{it.label}</Typography>
                    <Chip
                        label={String(it.value)}
                        color={i === 2 ? 'warning' : i === 1 ? 'success' : 'default'}
                        sx={{ mt: 1 }}
                    />
                  </CardContent>
                </Card>
              </Grid>
          ))}
        </Grid>

        {/* OmniReview */}
        <Typography variant="h6" sx={{ mt: 3, mb: 1 }}>
          OmniReview · Ôn tập
        </Typography>
        <Card sx={{ borderRadius: 3, border: '1px solid #ffe0e0' }}>
          <CardContent>
            <Box
                sx={{
                  display: 'grid',
                  gap: 1,
                  mb: 2,
                  gridTemplateColumns: {
                    xs: 'repeat(1, minmax(0, 1fr))',
                    sm: 'repeat(3, minmax(0, 1fr))',
                    md: 'repeat(6, minmax(0, 1fr))',
                  },
                }}
            >
              {[0, 1, 2, 3, 4, 5].map((lvl) => {
                const list = wordsByLevelOmni(lvl);
                const isOpen = !!openLevelsOmni[lvl];
                const count = globalDistOmni?.[lvl] || 0;
                return (
                    <React.Fragment key={lvl}>
                      <Button
                          variant="outlined"
                          onClick={() => toggleLevelOmni(lvl)}
                          endIcon={isOpen ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                          disabled={list.length === 0}
                          size="small"
                          sx={{
                            justifyContent: 'space-between',
                            gridColumn: { xs: '1 / -1', sm: 'auto' },
                            px: 1.25,
                            py: 0.5,
                            minHeight: 34,
                            fontSize: '0.75rem',
                          }}
                      >
                        Mức {lvl}: {count}
                      </Button>
                      <Collapse
                          in={isOpen && list.length > 0}
                          timeout="auto"
                          unmountOnExit
                          sx={{ gridColumn: '1 / -1' }}
                      >
                        <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', mt: 1 }}>
                          {list.map((item, idx) => {
                            const label = (item.front && item.front.trim())
                              || (item.back && item.back.trim())
                              || item.card_id
                              || `item-${lvl}-${idx}`;
                            return (
                                <Chip key={item.card_id || `${lvl}-${idx}`} label={label} sx={{ mb: 1 }} />
                            );
                          })}
                        </Stack>
                      </Collapse>
                    </React.Fragment>
                );
              })}
            </Box>

            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems="center">
              <Stack spacing={1} sx={{ minWidth: 260 }}>
                <Typography variant="body2">
                  Cards per Session: {omniCount}
                </Typography>
                <Slider
                    min={5}
                    max={100}
                    step={5}
                    value={omniCount}
                    onChange={(e, v) => setOmniCount(v)}
                />
                <Typography variant="caption" sx={{ opacity: 0.7 }}>
                  Ưu tiên thẻ: {
                    dueMode === 'due-only'
                      ? 'Chỉ ôn thẻ đến hạn'
                      : dueMode === 'due-priority'
                        ? 'Ưu tiên thẻ quá hạn/đến hạn trước'
                        : 'Ngẫu nhiên mọi thẻ đã học'
                  }
                </Typography>
              </Stack>
              <Stack direction="row" spacing={1}>
                <Button variant="contained" onClick={() => goOmni(typeFilter, omniCount)}>
                  Review (Omni)
                </Button>
                <Button variant="outlined" onClick={() => setOpenSettings(true)}>
                  Settings
                </Button>
              </Stack>
            </Stack>

            <Divider sx={{ my: 2 }} />

            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              Ôn theo mức nhớ · {typeFilter}
            </Typography>
            <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
              {[0, 1, 2, 3, 4, 5].map((lvl) => {
                const list = wordsByLevelOmni(lvl);
                return (
                    <Button
                        key={lvl}
                        variant="outlined"
                        disabled={list.length === 0}
                        onClick={() => goReviewLevel(typeFilter, lvl, omniCount)}
                    >
                      Mức {lvl} ({list.length})
                    </Button>
                );
              })}
            </Stack>
          </CardContent>
        </Card>

        {/* Leech board (single) */}
        <LeechList type={typeFilter} mem={liveStats} />

        {/* Session gần nhất */}
        {latest && (
            <Card sx={{ borderRadius: 3, mt: 2, border: '1px solid #ffe0e0' }}>
              <CardContent>
                <Stack
                    direction="row"
                    justifyContent="space-between"
                    alignItems="center"
                >
                  <Typography variant="h6">
                    Session gần nhất ·{' '}
                    {new Date(latest.created_at).toLocaleString('vi-VN')}
                  </Typography>
                  <Button
                      variant="outlined"
                      href={`/flashcards?sessionId=${encodeURIComponent(latest.id)}`}
                  >
                    Học lại
                  </Button>
                </Stack>

                <Typography sx={{ opacity: 0.7, mb: 1 }}>
                  Đã học (session): {latest?.summary?.learned ?? 0} /{' '}
                  {latest?.summary?.total ?? 0}
                </Typography>

                <Typography variant="subtitle2" sx={{ mt: 1 }}>
                  Từ & mức nhớ:
                </Typography>
                <Stack direction="row" spacing={1} flexWrap="wrap">
                  {toArray(latest.cards).map((c, idx) => {
                    const cardId = c.card_id ?? c.cardId ?? c.id ?? null;
                    const memoRow = cardId ? memCardMap.get(cardId) : null;
                    const front = c.front ?? memoRow?.front ?? null;
                    const back = c.back ?? memoRow?.back ?? null;
                    const labelText = front && back
                        ? `${front} · ${back}`
                        : (front || back || cardId || 'Thẻ');
                    const finalScore = Number.isFinite(Number(c?.final)) ? Number(c.final) : null;
                    const recallScore = Number.isFinite(Number(c?.recall)) ? Number(c.recall) : null;
                    const warmupScore = Number.isFinite(Number(c?.warmup)) ? Number(c.warmup) : null;
                    const fallbackLevel = cardId ? currentLevelOf(cardId, memoRow?.level ?? null) : null;
                    const level = finalScore ?? recallScore ?? warmupScore ?? fallbackLevel ?? 0;
                    return (
                        <Chip
                            key={c.id || cardId || `latest-card-${idx}`}
                            label={`${labelText} (${level})`}
                            sx={{ mr: 1, mb: 1 }}
                        />
                    );
                  })}
                </Stack>

                <Divider sx={{ my: 2 }} />
                <Typography variant="subtitle2">Phân bố mức nhớ:</Typography>
                <Stack direction="row" spacing={1} flexWrap="wrap">
                  {latestSessionDist.map((n, i)=> (
                      <Chip key={i} label={`Mức ${i}: ${n}`} />
                  ))}
                </Stack>
              </CardContent>
            </Card>
        )}

        {/* Session trước */}
        {toArray(sessionsOfType).length > 1 && (
            <Card sx={{ borderRadius: 3, mt: 2, border: '1px solid #ffe0e0' }}>
              <CardContent>
                <Typography variant="h6">Các session trước đó</Typography>
                {toArray(sessionsOfType)
                    .slice(1)
                    .map((s, idx) => (
                        <div key={s.id}>
                          {idx > 0 && <Divider sx={{ my: 1 }} />}
                          <Stack
                              direction="row"
                              justifyContent="space-between"
                              alignItems="center"
                          >
                            <Typography>
                              <b>{new Date(s.created_at).toLocaleString('vi-VN')}</b>
                            </Typography>
                            <Stack direction="row" spacing={1} alignItems="center">
                              <Button
                                  variant="outlined"
                                  href={`/flashcards?sessionId=${encodeURIComponent(s.id)}`}
                              >
                                Học lại
                              </Button>
                              <IconButton
                                  onClick={() =>
                                      setExpanded((e) => ({ ...e, [s.id]: !e[s.id] }))
                                  }
                              >
                                {expanded[s.id] ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                              </IconButton>
                            </Stack>
                          </Stack>
                          <Collapse in={!!expanded[s.id]}>
                            <Typography variant="subtitle2" sx={{ mt: 1 }}>
                              Từ & mức nhớ:
                            </Typography>
                            <Stack
                                direction="row"
                                spacing={1}
                                flexWrap="wrap"
                                sx={{ mb: 1 }}
                            >
                              {toArray(s.cards).map((c, cIdx) => {
                                const cardId = c.card_id ?? c.cardId ?? c.id ?? null;
                                const memoRow = cardId ? memCardMap.get(cardId) : null;
                                const front = c.front ?? memoRow?.front ?? '';
                                const back = c.back ?? memoRow?.back ?? '';
                                const finalScore = Number.isFinite(Number(c?.final)) ? Number(c.final) : null;
                                const recallScore = Number.isFinite(Number(c?.recall)) ? Number(c.recall) : null;
                                const warmupScore = Number.isFinite(Number(c?.warmup)) ? Number(c.warmup) : null;
                                const fallbackLevel = cardId ? currentLevelOf(cardId, memoRow?.level ?? null) : null;
                                const level = finalScore ?? recallScore ?? warmupScore ?? fallbackLevel ?? 0;
                                const labelFront = front || memoRow?.front || cardId || 'Thẻ';
                                const labelBack = back ? ` · ${back}` : '';
                                return (
                                    <Chip
                                        key={c.id || cardId || `prev-card-${cIdx}`}
                                        label={`${labelFront}${labelBack} (${level})`}
                                        sx={{ mr: 1, mb: 1 }}
                                    />
                                );
                              })}
                            </Stack>
                          </Collapse>
                        </div>
                    ))}
              </CardContent>
            </Card>
        )}

        <ReviewSettings
            open={openSettings}
            onClose={() => setOpenSettings(false)}
            value={settings}
            onChange={(next) => {
              saveSettings?.(next);
              if (typeof next?.cards_per_session === 'number')
                setOmniCount(next.cards_per_session);
            }}
            options={{
              autoFlip: ['off', '2+3', '4+5', '6+7'],
              reviewModes: ['FSRS', 'Classic'],
              orientations: ['Normal', 'Reversed'],
              showFlipStab: true,
              showRecencyDays: true,
            }}
        />
      </Container>
  );
}