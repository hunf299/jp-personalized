// pages/grammar.js
import React, { useEffect, useState } from 'react';
import { Container, Typography, Grid, Card, CardContent, Chip } from '@mui/material';
import { GrammarRule, getRelatedGrammarRules } from '../lib/srs';

export default function GrammarPage() {
  const [rules, setRules] = useState([]);
  const [active, setActive] = useState(null);

  useEffect(()=>{ (async()=>{
    const r = await fetch('/api/cards'); const all = await r.json();
    const gs = (Array.isArray(all)? all:[]).filter(x=>x.type==='grammar')
      .map(x=> new GrammarRule({ id:x.id, pattern:x.front, baseForm:(x.related_rules?.[0]||'')||null, description:x.back, related:x.related_rules||[] }));
    const demo = [
      new GrammarRule({ id:'g1', pattern:'Vてください', baseForm:'Vて', description:'Yêu cầu/nhờ vả' }),
      new GrammarRule({ id:'g2', pattern:'Vています', baseForm:'Vて', description:'Đang diễn ra' }),
      new GrammarRule({ id:'g3', pattern:'Vてもいいです', baseForm:'Vて', description:'Được phép' }),
      new GrammarRule({ id:'g4', pattern:'Vたら', baseForm:'Vた', description:'Nếu/khi…' }),
    ];
    const data = gs.length? gs : demo;
    setRules(data);
    setActive(data[0]?.id || null);
  })(); },[]);

  const cur = rules.find(r=>r.id===active);
  const related = cur ? getRelatedGrammarRules(rules, active) : [];

  return (
    <Container>
      <Typography variant="h5" sx={{ fontWeight:700, mb:2 }}>Sơ đồ ngữ pháp (liên kết theo dạng gốc)</Typography>
      <Grid container spacing={2}>
        <Grid item xs={12} md={5}>
          {rules.map(r=>(
            <Card key={r.id} sx={{ mb:1, borderRadius:3, outline: r.id===active? '2px solid #7c4dff': 'none', cursor:'pointer' }}
              onClick={()=>setActive(r.id)}>
              <CardContent>
                <Typography variant="subtitle1" sx={{ fontWeight:700 }}>{r.pattern}</Typography>
                {r.baseForm && <Chip size="small" label={`gốc: ${r.baseForm}`} sx={{ mt:1 }} />}
              </CardContent>
            </Card>
          ))}
        </Grid>
        <Grid item xs={12} md={7}>
          {cur ? (
            <Card sx={{ borderRadius:3 }}>
              <CardContent>
                <Typography variant="h6">{cur.pattern}</Typography>
                <Typography sx={{ mb:2 }}>{cur.description}</Typography>
                <Typography variant="subtitle2">Liên quan (dùng chung dạng gốc)</Typography>
                {related.map(r=>(
                  <Chip key={r.id} label={r.pattern} sx={{ mr:1, mt:1 }} />
                ))}
              </CardContent>
            </Card>
          ) : <Typography>Chọn một mẫu ở bên trái.</Typography>}
        </Grid>
      </Grid>
    </Container>
  );
}
