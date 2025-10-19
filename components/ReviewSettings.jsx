// components/ReviewSettings.jsx
import React from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Stack, Button, FormControl, InputLabel, Select, MenuItem, Slider, Typography
} from '@mui/material';

const RECENCY_OPTIONS = [
  { label: 'Tất cả', value: -1 },
  { label: '≥ 1 ngày', value: 1 },
  { label: '≥ 3 ngày', value: 3 },
  { label: '≥ 1 tuần', value: 7 },
  { label: '≥ 2 tuần', value: 14 },
  { label: '≥ 1 tháng', value: 30 },
];

const DUE_MODE_OPTIONS = [
  { value: 'due-priority', label: 'Ưu tiên thẻ đến hạn' },
  { value: 'due-only', label: 'Chỉ thẻ đến hạn' },
  { value: 'all', label: 'Ngẫu nhiên (mọi thẻ đã học)' },
];

export default function ReviewSettings({ open, onClose, value, onChange }) {
  // defaults
  const v = value || {};
  const [cardsPerSession, setCardsPerSession] = React.useState(v.cards_per_session ?? 10);
  const [autoFlip, setAutoFlip]               = React.useState(v.auto_flip ?? 'off'); // 'off'|'2+3'|'4+5'|'6+7'
  const [reviewMode, setReviewMode]           = React.useState(v.review_mode ?? 'FSRS');
  const [fontPx, setFontPx]                   = React.useState(v.font_px ?? 24);
  const [orientation, setOrientation]         = React.useState(v.card_orientation ?? 'normal');
  const [flipStab, setFlipStab]               = React.useState(
      v.flip_stabilize == null ? true : !!v.flip_stabilize
  );

  // 🆕 recency (ngày) cho OmniReview
  const [recencyDays, setRecencyDays]         = React.useState(
      Number.isFinite(v.recency_days) ? v.recency_days : -1
  );
  const [dueMode, setDueMode]                 = React.useState(v.due_mode || 'due-priority');

  React.useEffect(() => {
    if (!open) return;
    setCardsPerSession(v.cards_per_session ?? 10);
    setAutoFlip(v.auto_flip ?? 'off');
    setReviewMode(v.review_mode ?? 'FSRS');
    setFontPx(v.font_px ?? 24);
    setOrientation(v.card_orientation ?? 'normal');
    setFlipStab(v.flip_stabilize == null ? true : !!v.flip_stabilize);
    setRecencyDays(Number.isFinite(v.recency_days) ? v.recency_days : -1);
    setDueMode(v.due_mode || 'due-priority');
  }, [open]); // eslint-disable-line

  const handleSave = () => {
    onChange?.({
      ...v,
      cards_per_session: cardsPerSession,
      auto_flip: autoFlip,
      review_mode: reviewMode,
      font_px: fontPx,
      card_orientation: orientation,
      flip_stabilize: flipStab,
      // 🆕 gom vào settings
      recency_days: recencyDays,
      due_mode: dueMode,
    });
    onClose?.();
  };

  return (
      <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
        <DialogTitle>Cài đặt Review</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <FormControl size="small">
              <InputLabel>Review Mode</InputLabel>
              <Select value={reviewMode} label="Review Mode" onChange={e=>setReviewMode(e.target.value)}>
                <MenuItem value="FSRS">FSRS</MenuItem>
                <MenuItem value="Classic">Classic</MenuItem>
              </Select>
            </FormControl>

            <FormControl size="small">
              <InputLabel>Auto-flip</InputLabel>
              <Select value={autoFlip} label="Auto-flip" onChange={e=>setAutoFlip(e.target.value)}>
                <MenuItem value="off">Tắt</MenuItem>
                <MenuItem value="2+3">2s (MCQ) + 3s (Điền)</MenuItem>
                <MenuItem value="4+5">4s (MCQ) + 5s (Điền)</MenuItem>
                <MenuItem value="6+7">6s (MCQ) + 7s (Điền)</MenuItem>
              </Select>
            </FormControl>

            <FormControl size="small">
              <InputLabel>Khoảng ngày (OmniReview)</InputLabel>
              <Select value={recencyDays} label="Khoảng ngày (OmniReview)" onChange={e=>setRecencyDays(Number(e.target.value))}>
                {RECENCY_OPTIONS.map(o => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
              </Select>
            </FormControl>

            <FormControl size="small">
              <InputLabel>Ưu tiên thẻ (OmniReview)</InputLabel>
              <Select value={dueMode} label="Ưu tiên thẻ (OmniReview)" onChange={e=>setDueMode(e.target.value)}>
                {DUE_MODE_OPTIONS.map((o) => (
                  <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
                ))}
              </Select>
            </FormControl>

            <div>
              <Typography variant="body2" sx={{ mb: 0.5 }}>
                Cards per Session: {cardsPerSession}
              </Typography>
              <Slider min={5} max={100} step={5} value={cardsPerSession} onChange={(e,v)=>setCardsPerSession(v)} />
            </div>

            <FormControl size="small">
              <InputLabel>Card Orientation</InputLabel>
              <Select value={orientation} label="Card Orientation" onChange={e=>setOrientation(e.target.value)}>
                <MenuItem value="normal">Bình thường</MenuItem>
                <MenuItem value="reversed">Đảo mặt</MenuItem>
              </Select>
            </FormControl>

            <FormControl size="small">
              <InputLabel>Flip Stabilize</InputLabel>
              <Select value={flipStab ? 'on':'off'} label="Flip Stabilize" onChange={e=>setFlipStab(e.target.value==='on')}>
                <MenuItem value="on">Bật</MenuItem>
                <MenuItem value="off">Tắt</MenuItem>
              </Select>
            </FormControl>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Huỷ</Button>
          <Button variant="contained" onClick={handleSave}>Lưu</Button>
        </DialogActions>
      </Dialog>
  );
}
