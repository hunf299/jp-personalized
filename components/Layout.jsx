// components/Layout.jsx
import React from 'react';
import Link from 'next/link';
import {
    AppBar, Toolbar, Typography, Box, Button, Stack, IconButton,
    Container, Chip, Drawer, List, ListItemButton, ListItemText, Divider
} from '@mui/material';
import NoSsr from '@mui/material/NoSsr';
import MenuIcon from '@mui/icons-material/Menu';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import VisibilityIcon from '@mui/icons-material/Visibility';
import PauseIcon from '@mui/icons-material/Pause';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import { useTheme } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import { usePomodoro } from '../lib/pomodoroStore';
import EnableNotifyButton from './EnableNotifyButton';

// components/Layout.jsx

// components/Layout.jsx

function MiniTimer() {
    // Lấy thêm 'phaseIndex' từ hook để xác định pha cuối cùng
    const {
        labelMini, paused, pause, resume,
        reset, phaseIndex, secLeft, current
    } = usePomodoro();

    // 1. Xác định trạng thái ban đầu (như cũ)
    const isInitialState = phaseIndex === 0 && paused && secLeft === current.dur;

    // 2. Xác định trạng thái kết thúc
    // Phiên Pomo có 8 pha (index từ 0 đến 7). Pha cuối cùng là index 7.
    // Trạng thái kết thúc là khi ở pha cuối, hết giờ và đang dừng.
    const isFinished = phaseIndex === 7 && secLeft === 0 && paused;

    // 3. Hiển thị nút nếu là trạng thái ban đầu HOẶC đã kết thúc
    if (isInitialState || isFinished) {
        return (
            <Button
                onClick={reset}
                size="small"
                variant="contained"
                sx={{
                    bgcolor: '#a43a3a',
                    color: 'white',
                    height: 30,
                    borderRadius: 99,
                    textTransform: 'none',
                    fontWeight: 'bold',
                    '&:hover': {
                        bgcolor: '#8e3131',
                    }
                }}
            >
                Bắt đầu Pomo
            </Button>
        );
    }

    // Nếu không, hiển thị đồng hồ mini như bình thường
    return (
        <Stack direction="row" spacing={1} alignItems="center" sx={{ ml: { xs: 0, md: 1 } }}>
            <Chip
                label={labelMini}
                sx={{
                    bgcolor: '#fff5f5',
                    color: '#a43a3a',
                    fontWeight: 700,
                    height: 30,
                    '& .MuiChip-label': { px: 1.2 },
                }}
            />
            <IconButton
                onClick={() => (paused ? resume() : pause())}
                size="small"
                sx={{ color: '#a43a3a' }}
                aria-label={paused ? 'Resume' : 'Pause'}
            >
                {paused ? <PlayArrowIcon /> : <PauseIcon />}
            </IconButton>
        </Stack>
    );
}

export default function Layout({ children }) {
    const theme = useTheme();
    const isMdUp = useMediaQuery(theme.breakpoints.up('md'));
    const [focus, setFocus] = React.useState(false);
    const [open, setOpen] = React.useState(false);

    const NavButtons = () => (
        <Stack direction="row" spacing={1} sx={{
            border: '1px solid #eee', borderRadius: 999, px: 1, py: 0.5, background: '#fff'
        }}>
            <Button component={Link} href="/" color="inherit">Cập nhật dữ liệu</Button>
            <Button component={Link} href="/menu" color="inherit">Chức năng</Button>
            <Button component={Link} href="/progress" color="inherit">Quá trình học</Button>
            <Button component={Link} href="/pomodoro" color="inherit">Pomodoro</Button>
        </Stack>
    );

    return (
        <Box sx={{
            minHeight: '100vh',
            background: 'linear-gradient(180deg,#fff3f3 0%, #fff 40%, #f7fbff 100%)'
        }}>
            {!focus && (
                <AppBar
                    position="sticky" elevation={0}
                    sx={{ background: '#fff', color: '#222', borderBottom: '1px solid #f1f1f1' }}
                >
                    <Toolbar disableGutters>
                        <Container maxWidth="lg" sx={{ display: 'flex', alignItems: 'center', gap: 2, py: 1 }}>
                            {/* Logo */}
                            <Typography variant="h6" sx={{ fontWeight: 800, color: '#a43a3a', mr: 1, whiteSpace: 'nowrap' }}>
                                Learn일본어です
                            </Typography>
                            {/* Desktop nav */}
                            {isMdUp && <NavButtons />}

                            <Box sx={{ flex: 1 }} />

                            {/* Mini Pomodoro + Nút bật thông báo — CHỈ render ở client để tránh hydration */}
                            <NoSsr defer>
                                <MiniTimer />
                                <EnableNotifyButton />
                            </NoSsr>

                            {/* Focus toggle */}
                            <IconButton color="default" onClick={() => setFocus(true)} title="Bật Focus Mode" sx={{ ml: 0.5 }}>
                                <VisibilityOffIcon />
                            </IconButton>

                            {/* Mobile hamburger */}
                            {!isMdUp && (
                                <IconButton sx={{ ml: 0.5 }} onClick={() => setOpen(true)} aria-label="Menu">
                                    <MenuIcon />
                                </IconButton>
                            )}
                        </Container>
                    </Toolbar>
                </AppBar>
            )}

            {/* Mobile Drawer */}
            <Drawer anchor="right" open={open} onClose={() => setOpen(false)}>
                <Box sx={{ width: 280 }} role="presentation" onClick={() => setOpen(false)}>
                    <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: 2, py: 2 }}>
                        <Typography sx={{ fontWeight: 800, color: '#a43a3a' }}>Menu</Typography>
                    </Stack>
                    <Divider />
                    <List>
                        <ListItemButton component={Link} href="/"><ListItemText primary="Cập nhật dữ liệu" /></ListItemButton>
                        <ListItemButton component={Link} href="/menu"><ListItemText primary="Chức năng" /></ListItemButton>
                        <ListItemButton component={Link} href="/progress"><ListItemText primary="Quá tình học" /></ListItemButton>
                        <ListItemButton component={Link} href="/pomodoro"><ListItemText primary="Pomodoro" /></ListItemButton>
                    </List>
                </Box>
            </Drawer>

            {/* Focus mode exit */}
            {focus && (
                <Box sx={{ position: 'fixed', top: 12, right: 12, zIndex: 5 }}>
                    <IconButton color="primary" onClick={() => setFocus(false)} title="Tắt Focus Mode">
                        <VisibilityIcon />
                    </IconButton>
                </Box>
            )}

            {/* Content */}
            <Container maxWidth="lg" sx={{ px: { xs: 1.5, sm: 2 }, py: { xs: 2, md: 3 } }}>
                {children}
            </Container>
        </Box>
    );
}
