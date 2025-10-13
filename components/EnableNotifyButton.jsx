// components/EnableNotifyButton.jsx
import React from 'react';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import NotificationsOffIcon from '@mui/icons-material/NotificationsOff';
import { IconButton, Tooltip } from '@mui/material';
import { notifyPermission, requestNotifyPermission } from '../lib/notify';

export default function EnableNotifyButton() {
    const [perm, setPerm] = React.useState('default');
    const [mounted, setMounted] = React.useState(false);

    React.useEffect(() => {
        setMounted(true);
        setPerm(notifyPermission());
    }, []);

    if (!mounted) return null; // tránh hydration error

    const granted = perm === 'granted';
    const title = granted ? 'Đã bật thông báo' : 'Bật thông báo Pomodoro';

    return (
        <Tooltip title={title}>
            <IconButton
                aria-label="notifications"
                onClick={async () => {
                    if (!granted) {
                        const p = await requestNotifyPermission();
                        setPerm(p);
                    }
                }}
                sx={{ color: granted ? '#a43a3a' : 'text.secondary' }}
            >
                {granted ? <NotificationsActiveIcon /> : <NotificationsOffIcon />}
            </IconButton>
        </Tooltip>
    );
}
