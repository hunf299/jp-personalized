
import React from 'react';
import { Container, Typography, Card, CardContent, Stack, Button, Chip, TextField, MenuItem } from '@mui/material';

async function importCSV(rowsText, typeOverride) {
  const res = await fetch('/api/import/csv', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ csv: rowsText, type: typeOverride || null }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || 'Import thất bại');
  return data;
}

export default function Home() {
  const [stats, setStats] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [types, setTypes] = React.useState({ vocab:'vocab', kanji:'kanji', grammar:'grammar', particle:'particle' });

  const refresh = React.useCallback(async ()=>{
    const r = await fetch('/api/stats'); const s = await r.json(); setStats(s);
  }, []);
  React.useEffect(()=>{ refresh(); }, [refresh]);

  const handleFile = (type) => async (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    setBusy(true);
    try { const text = await f.text(); await importCSV(text, types[type]); await refresh(); alert('Import thành công!'); }
    catch (err) { alert(err.message); }
    finally { setBusy(false); e.target.value = ''; }
  };

  const hasAny = ['vocab','kanji','grammar','particle'].some(k => (stats?.[k]||0) > 0);

  return (
    <Container>
      <Typography variant="h5" sx={{ fontWeight:700, mb:1 }}>Cập nhật dữ liệu trước khi học</Typography>
      <Typography sx={{ mb:2, color:'text.secondary' }}>Tải CSV (headers: <b>front,back,category</b>). Có thể chỉ định type ở ô chọn.</Typography>

      <Stack direction={{ xs:'column', md:'row' }} spacing={2}>
        {['vocab','kanji','grammar','particle'].map(key => (
          <Card key={key} sx={{ flex:1, borderRadius:3, background:'linear-gradient(180deg,#fff 0%,#f3e5f5 100%)' }}>
            <CardContent>
              <Stack className="responsive-stack" direction="row" justifyContent="space-between" alignItems="center">
                <Typography variant="h6">{key}</Typography>
                <Chip label={`${stats?.[key]||0} mục`} color={(stats?.[key]||0)?'success':'default'} />
              </Stack>
              <Stack className="responsive-stack" direction="row" spacing={1} sx={{ mt:1 }}>
                <TextField
                  select
                  size="small"
                  fullWidth
                  label="type"
                  value={types[key]}
                  onChange={e=> setTypes(t=> ({...t,[key]: e.target.value}))}
                >
                  <MenuItem value="vocab">vocab</MenuItem><MenuItem value="kanji">kanji</MenuItem><MenuItem value="grammar">grammar</MenuItem><MenuItem value="particle">particle</MenuItem>
                </TextField>
                <Button component="label" variant="contained" disabled={busy} fullWidth>
                  Upload CSV
                  <input hidden accept=".csv" type="file" onChange={handleFile(key)} />
                </Button>
              </Stack>
            </CardContent>
          </Card>
        ))}
      </Stack>

      <Stack className="responsive-stack" direction="row" spacing={2} sx={{ mt:3 }}>
        <Button href="/menu" variant="contained" size="large" disabled={!hasAny}>Bắt đầu học</Button>
        {!hasAny && (
          <Typography
            sx={{
              alignSelf: { xs: 'stretch', sm: 'center' },
              textAlign: { xs: 'center', sm: 'left' },
              color: 'text.secondary',
            }}
          >
            (Hãy import ít nhất một loại dữ liệu để mở menu)
          </Typography>
        )}
      </Stack>
    </Container>
  );
}
