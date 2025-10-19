// pages/menu.js
import React from 'react';
import Link from 'next/link';
import {
  Container,
  Typography,
  Grid,
  Card,
  CardActionArea,
  CardContent,
} from '@mui/material';

const items = [
  { href: '/flashcards', title: 'Flashcards', desc: 'Warm-up MCQ, gõ/viết tay', color: '#f0625d' },
  { href: '/kanji', title: 'Kanji', desc: 'Bộ thủ, luyện nét', color: '#ff8a80' },
  { href: '/grammar', title: 'Ngữ pháp', desc: 'Sơ đồ base-form', color: '#ffa4a2' },
  { href: '/particles', title: 'Trợ từ', desc: 'Tra cứu & so sánh', color: '#ffb3ae' },
  { href: '/progress', title: 'Quá trình học', desc: 'Tổng hợp, session, ôn theo mức', color: '#ffc5c2' },
  { href: '/pomodoro', title: 'Pomodoro', desc: 'Đồng hồ 2h toàn site', color: '#ffd6d6' },
];

export default function Menu() {
  return (
    <Container>
      <Typography variant="h5" sx={{ fontWeight: 700, mb: 2, color: '#d94b4b' }}>
        Chọn chức năng học
      </Typography>
      <Grid container spacing={2}>
        {items.map((it) => (
          <Grid item xs={12} md={6} key={it.href}>
            <Card
              sx={{
                borderRadius: 3,
                background: `linear-gradient(180deg, ${it.color}30 0%, #fff 100%)`,
                border: '1px solid #ffe8e8',
              }}
            >
              <CardActionArea component={Link} href={it.href}>
                <CardContent>
                  <Typography variant="h6" sx={{ fontWeight: 700, color: '#a33b3b' }}>
                    {it.title}
                  </Typography>
                  <Typography variant="body2" sx={{ opacity: 0.8 }}>
                    {it.desc}
                  </Typography>
                </CardContent>
              </CardActionArea>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Container>
  );
}
