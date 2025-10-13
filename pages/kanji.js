// pages/kanji.js
import React, { useEffect, useState } from 'react';
import { Container, Typography, Stack, TextField, Button, Card, CardContent, Chip } from '@mui/material';
import { KanjiCard, generateRadicalExercises } from '../lib/srs';
import StrokePractice from '../components/StrokePractice';
import { loadKanjiData } from '../lib/kanjivg';

export default function KanjiPage() {
  const [kanji, setKanji] = useState([]);
  const [exercises, setExercises] = useState([]);
  const [idx, setIdx] = useState(0);
  const [practiceChar, setPracticeChar] = useState('休');
  const [refStrokes, setRefStrokes] = useState([]);

  useEffect(()=>{ (async()=>{
    const r = await fetch('/api/cards'); const all = await r.json();
    const only = (Array.isArray(all)? all:[]).filter(r=>r.type==='kanji').map(r=> new KanjiCard(r));
    setKanji(only);
    setExercises(generateRadicalExercises(only.length? only : [
      new KanjiCard({ id:'k1', front:'休', back:'nghỉ', radicals:['人','木'] }),
      new KanjiCard({ id:'k3', front:'本', back:'gốc/sách', radicals:['木'] }),
      new KanjiCard({ id:'k2', front:'体', back:'cơ thể', radicals:['人','本'] }),
    ]));
  })(); },[]);

  useEffect(()=>{ (async()=>{
    try { const d = await loadKanjiData(practiceChar); setRefStrokes(d.strokes); } catch { setRefStrokes([]); }
  })(); },[practiceChar]);

  const ex = exercises[idx];
  return (
    <Container>
      <Typography variant="h5" sx={{ fontWeight:700, mb:2 }}>Kanji · Bộ thủ & luyện viết</Typography>

      {ex ? (
        <Card sx={{ borderRadius:3, mb:2 }}>
          <CardContent>
            <Typography sx={{ mb:1 }}>{ex.prompt}</Typography>
            <Stack direction="row" spacing={1} sx={{ mb:1 }}>
              {kanji.slice(0,6).map(k => <Chip key={k.id} label={`${k.front} · ${k.back}`} />)}
            </Stack>
            <Button onClick={()=> setIdx((idx+1)%exercises.length)}>Tiếp</Button>
          </CardContent>
        </Card>
      ) : (
        <Typography>Chưa có bài tập (cần import kanji có cột radicals).</Typography>
      )}

      <Card sx={{ borderRadius:3 }}>
        <CardContent>
          <Typography variant="h6" sx={{ mb:1 }}>Thực hành viết tay (nhận dạng nét)</Typography>
          <Stack direction="row" spacing={1} sx={{ mb:1 }}>
            <TextField label="Kanji" value={practiceChar} onChange={e=>setPracticeChar(e.target.value.trim())} sx={{ width:120 }} />
            <Typography sx={{ alignSelf:'center', opacity:.7 }}>Demo có: 休 / 本 / 体</Typography>
          </Stack>
          {refStrokes.length ? <StrokePractice refStrokes={refStrokes}/> : <Typography>Chưa có dữ liệu nét chuẩn cho chữ này.</Typography>}
        </CardContent>
      </Card>
    </Container>
  );
}
