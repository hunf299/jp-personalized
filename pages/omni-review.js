// pages/omni-review.js
import React from 'react';
import {
    Container, Typography, Card, CardContent, Stack, Button,
    Select, MenuItem, Slider, Chip
} from '@mui/material';
import ReviewSettings from '../components/ReviewSettings';
import { useSettings } from '../lib/useSettings';
import { useRouter } from 'next/router';

export default function OmniReviewPage() {
    const router = useRouter();
    const { settings, saveSettings } = useSettings();
    const [open, setOpen] = React.useState(false);

    const [type, setType] = React.useState('vocab');   // vocab | kanji | particle | grammar
    const [level, setLevel] = React.useState(0);       // 0..5
    const [count, setCount] = React.useState(settings.cards_per_session || 10);
    const dueMode = settings?.due_mode || 'due-priority';

    React.useEffect(()=>{ setCount(settings.cards_per_session || 10); }, [settings.cards_per_session]);

    const start = () => {
        router.push(`/review?type=${encodeURIComponent(type)}&level=${level}&n=${count}`);
    };

    return (
        <Container sx={{ py: 3 }}>
            <Typography variant="h5" sx={{ fontWeight: 700, mb: 2 }}>OmniReview · Ôn theo mức nhớ</Typography>

            <Card sx={{ borderRadius: 3 }}>
                <CardContent>
                    <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
                        <Stack spacing={1} sx={{ minWidth: 220 }}>
                            <Typography variant="subtitle2">Loại thẻ</Typography>
                            <Select size="small" value={type} onChange={(e)=>setType(e.target.value)}>
                                <MenuItem value="vocab">Từ vựng</MenuItem>
                                <MenuItem value="kanji">Kanji</MenuItem>
                                <MenuItem value="particle">Trợ từ</MenuItem>
                                <MenuItem value="grammar">Ngữ pháp</MenuItem>
                            </Select>
                        </Stack>

                        <Stack spacing={1} sx={{ minWidth: 220 }}>
                            <Typography variant="subtitle2">Mức nhớ (0–5)</Typography>
                            <Stack className="responsive-stack" direction="row" spacing={1} flexWrap="wrap">
                                {[0,1,2,3,4,5].map(v=>(
                                    <Chip key={v}
                                          label={`Mức ${v}`}
                                          color={level===v?'primary':'default'}
                                          onClick={()=>setLevel(v)}
                                          sx={{ cursor:'pointer' }}
                                    />
                                ))}
                            </Stack>
                        </Stack>

                        <Stack spacing={1} sx={{ minWidth: 260 }}>
                            <Typography variant="subtitle2">Cards per Session: {count}</Typography>
                            <Slider min={5} max={100} step={5} value={count} onChange={(e,v)=>setCount(v)} />
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
                    </Stack>

                    <Stack className="responsive-stack" direction="row" spacing={1} sx={{ mt: 2 }}>
                        <Button variant="contained" onClick={start} fullWidth>Review</Button>
                        <Button variant="outlined" onClick={()=>setOpen(true)} fullWidth>Settings</Button>
                    </Stack>
                </CardContent>
            </Card>

            <ReviewSettings
                open={open}
                onClose={()=>setOpen(false)}
                value={settings}
                onChange={(next)=>{
                    saveSettings?.(next);
                    if (typeof next?.cards_per_session === 'number') {
                        setCount(next.cards_per_session);
                    }
                }}
            />
        </Container>
    );
}
