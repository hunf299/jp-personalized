// pages/pomodoro.js
import React from 'react';
import { Container, Typography, Stack, Button, Card, CardContent, LinearProgress, Box } from '@mui/material';
import { usePomodoro } from '../lib/pomodoroStore';

export default function PomodoroPage() {
  const { current, secLeft, paused, progress, cycles, labelMMSS, pause, resume, reset } = usePomodoro();

  return (
    <Container>
      <Typography variant="h4" sx={{ fontWeight: 800, mb: 1, color: '#a43a3a' }}>
        Pomodoro · 2 giờ
      </Typography>
      <Typography sx={{ mb: 2, color: 'text.secondary' }}>
        Chu kỳ chuẩn: <b>50’ tập trung</b> + <b>10’ nghỉ</b> × 2
      </Typography>

      <Card sx={{ borderRadius: 4, border: '1px solid #ffdddd', background: '#fff' }}>
        <CardContent>
          <Stack className="responsive-stack" direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
            <Typography variant="h5" sx={{ fontWeight: 700, color: current.type === 'focus' ? '#c33' : '#888' }}>
              {current.type === 'focus' ? `Tập trung · Chu kỳ ${current.cycle}/2` : `Nghỉ · Chu kỳ ${current.cycle}/2`}
            </Typography>
            <Stack className="responsive-stack" direction="row" spacing={1}>
              {paused ? (
                <Button variant="contained" onClick={resume} fullWidth>Resume</Button>
              ) : (
                <Button variant="outlined" onClick={pause} fullWidth>Pause</Button>
              )}
              <Button variant="contained" color="warning" onClick={reset} fullWidth>Reset 2h</Button>
            </Stack>
          </Stack>

          <Typography
            sx={{
              fontSize: { xs: 56, md: 72 },
              fontWeight: 800,
              textAlign: 'center',
              color: '#a43a3a',
              mb: 1,
            }}
          >
            {labelMMSS}
          </Typography>

          <LinearProgress
            variant="determinate"
            value={progress}
            sx={{ height: 10, borderRadius: 20, backgroundColor: '#ffe9e9' }}
          />

          {/* timeline 2 chu kỳ (focus/break) */}
          <Stack className="responsive-stack" direction="row" spacing={2} justifyContent="center" sx={{ mt: 3 }}>
            {cycles.map((c) => (
              <Stack key={c.index} spacing={1} alignItems="center">
                <Box
                  sx={{
                    width: 90, height: 10, borderRadius: 20,
                    background: c.focusDone ? '#f6b1b1' : (c.active && current.type === 'focus' ? '#ffd6d6' : '#f2f2f2'),
                  }}
                />
                <Box
                  sx={{
                    width: 90, height: 10, borderRadius: 20,
                    background: c.breakDone ? '#c7e8ff' : (c.active && current.type === 'break' ? '#e6f5ff' : '#f2f2f2'),
                  }}
                />
              </Stack>
            ))}
          </Stack>

          <Typography sx={{ mt: 2, color: 'text.secondary', textAlign: 'center' }}>
            Mỗi chu kỳ = 50’ tập trung + 10’ nghỉ · Tổng 2 chu kỳ = 2 giờ.
          </Typography>
        </CardContent>
      </Card>
    </Container>
  );
}
