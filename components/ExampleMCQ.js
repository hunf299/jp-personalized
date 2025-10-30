import React from 'react';
import { Card, CardContent, Typography, Stack, Button, Divider } from '@mui/material';

export default function ExampleMCQ({ example, pool, onCheck, scoreFunc }) {
  const startRef = React.useRef(Date.now());
  const firstHitRef = React.useRef(null);
  const [chosen, setChosen] = React.useState(null);
  const [checked, setChecked] = React.useState(false);
  const [result, setResult] = React.useState(null);

  const correct = example?.back ?? '';

  const options = React.useMemo(() => {
    startRef.current = Date.now();
    firstHitRef.current = null;

    const basePool = Array.isArray(pool) ? pool : [];
    const others = basePool
        .filter((item) => item && item.back != null && item.back !== correct)
        .sort(() => Math.random() - 0.5)
        .slice(0, 3)
        .map((item) => item.back);
    const raw = [correct, ...others].filter(Boolean).sort(() => Math.random() - 0.5);
    const unique = [];
    const seen = new Set();
    raw.forEach((opt) => {
      if (!seen.has(opt)) {
        seen.add(opt);
        unique.push(opt);
      }
    });
    if (unique.length < 2) unique.push('—');
    return unique;
  }, [correct, pool]);

  const handlePick = (opt) => {
    setChosen(opt);
    if (opt === correct && firstHitRef.current == null) {
      const sec = Math.floor((Date.now() - startRef.current) / 1000);
      firstHitRef.current = Math.max(0, sec);
    }
  };

  const handleCheck = () => {
    if (!example) return;
    const ok = chosen === correct;
    const nowSec = Math.floor((Date.now() - startRef.current) / 1000);
    const sec = ok ? (firstHitRef.current ?? Math.max(0, nowSec)) : Math.max(0, nowSec);
    const score = typeof scoreFunc === 'function' ? scoreFunc(sec) : ok ? 5 : 0;
    const payload = { ok, timeSec: sec, score, chosen, correct };
    setChecked(true);
    setResult(payload);
    if (onCheck) onCheck(payload);
  };

  return (
      <Card sx={{ borderRadius: 3, border: '1px solid #ffe0e0', background: '#fff' }}>
        <CardContent>
          <Typography variant="h6" sx={{ mb: 1, color: '#a33b3b' }}>
            Chọn nghĩa đúng cho ví dụ:
          </Typography>
          <Typography sx={{ mb: 2, fontStyle: 'italic' }}>
            {example?.front || '—'}
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
          <Stack spacing={1} sx={{ mt: 2 }}>
            <Button variant="contained" onClick={handleCheck} disabled={!chosen}>Kiểm tra</Button>
          </Stack>
          {checked && (
              <>
                <Divider sx={{ my: 2 }} />
                <Typography>
                  {result?.ok ? 'Đúng' : <>Sai · Đáp án đúng: <b>{correct}</b></>}
                </Typography>
                {example?.front && (
                    <Typography sx={{ mt: 1 }}>
                      Ví dụ: <b>{example.front}</b>
                    </Typography>
                )}
                {example?.back && (
                    <Typography>
                      Nghĩa: <b>{example.back}</b>
                    </Typography>
                )}
              </>
          )}
        </CardContent>
      </Card>
  );
}
