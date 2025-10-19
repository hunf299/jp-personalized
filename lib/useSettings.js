// lib/useSettings.js
import { useEffect, useState, useCallback } from 'react';

const KEY = 'jp_settings_v1';
const DEFAULTS = {
    review_mode: 'FSRS',
    auto_flip: 'off',
    cards_per_session: 10,
    font_px: 24,
    card_orientation: 'normal',
    flip_stabilize: true,
    // 🆕
    recency_days: -1, // -1 = Tất cả
    due_mode: 'due-priority',
};

function readLS() {
    try {
        const raw = localStorage.getItem(KEY);
        if (!raw) return { ...DEFAULTS };
        const parsed = JSON.parse(raw);
        return { ...DEFAULTS, ...(parsed || {}) };
    } catch {
        return { ...DEFAULTS };
    }
}
function writeLS(obj) {
    try { localStorage.setItem(KEY, JSON.stringify(obj || DEFAULTS)); } catch {}
}

export function useSettings() {
    const [settings, setSettings] = useState(DEFAULTS);

    // load
    useEffect(() => {
        setSettings(readLS());
    }, []);

    // sync cross-tab
    useEffect(() => {
        const onStorage = (e) => {
            if (e.key === KEY) setSettings(readLS());
        };
        window.addEventListener('storage', onStorage);
        return () => window.removeEventListener('storage', onStorage);
    }, []);

    const saveSettings = useCallback((next) => {
        const merged = { ...settings, ...(next || {}) };
        setSettings(merged);
        writeLS(merged);
    }, [settings]);

    return { settings, saveSettings };
}
