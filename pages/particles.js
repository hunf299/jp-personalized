// pages/particles.js
import React, { useEffect, useMemo, useState } from 'react';
import { Container, Typography, TextField, Grid, Card, CardContent, Chip, Stack } from '@mui/material';

const COMPARES = [
  { left:'は', right:'が', note:'は = chủ đề; が = chủ ngữ/nhấn mạnh' },
  { left:'に', right:'で', note:'に = nơi tồn tại/điểm đến; で = nơi diễn ra hành động' },
];

export default function ParticlesPage() {
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState('');

  useEffect(()=>{ (async()=>{
    const r = await fetch('/api/cards'); const all = await r.json();
    const ps = (Array.isArray(all)? all:[]).filter(x=>x.type==='particle');
    setRows(ps);
  })(); },[]);

  const list = useMemo(()=>{
    const s = q.trim().toLowerCase();
    return !s? rows : rows.filter(r=>
      (r.front||'').toLowerCase().includes(s) || (r.back||'').toLowerCase().includes(s)
    );
  }, [rows, q]);

  return (
    <Container>
      <Typography variant="h5" sx={{ fontWeight:700, mb:2 }}>Trợ từ</Typography>
      <TextField fullWidth placeholder="Tìm trợ từ hoặc ý nghĩa..." value={q} onChange={e=>setQ(e.target.value)} sx={{ mb:2 }} />

      <Grid container spacing={2}>
        {list.map((r)=>(
          <Grid item xs={12} md={6} key={r.id}>
            <Card sx={{ borderRadius:3 }}>
              <CardContent>
                <Stack className="responsive-stack" direction="row" spacing={1} alignItems="center" sx={{ mb:1 }}>
                  <Chip color="primary" label={r.front}/>
                  <Chip label={r.category||'trợ từ'} />
                </Stack>
                <Typography sx={{ textAlign: { xs: 'center', sm: 'left' } }}>{r.back}</Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Typography variant="h6" sx={{ mt:3, mb:1 }}>Cặp dễ lẫn</Typography>
      <Grid container spacing={2}>
        {COMPARES.map((c, idx)=>(
          <Grid item xs={12} md={6} key={idx}>
            <Card sx={{ borderRadius:3, background:'linear-gradient(180deg,#fff 0%,#e1f5fe 100%)' }}>
              <CardContent>
                <Stack className="responsive-stack" direction="row" spacing={1} sx={{ mb:1 }}>
                  <Chip color="secondary" label={c.left}/>
                  <Chip color="success" label={c.right}/>
                </Stack>
                <Typography sx={{ textAlign: { xs: 'center', sm: 'left' } }}>{c.note}</Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Container>
  );
}
