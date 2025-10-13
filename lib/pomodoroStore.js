// lib/pomodoroStore.js
import React, {
  createContext, useContext, useEffect, useMemo, useRef, useState,
} from 'react';
import { createClient } from '@supabase/supabase-js';
import { sendNotification, notifyPermission } from './notify';

// Thêm 2 hằng số này ở gần đầu file, cùng chỗ với STORAGE_KEY
const NOTIFY_DEBOUNCE_KEY = 'jp_pomo_notify_debounce_v1';
const NOTIFY_DEBOUNCE_MS = 2000; // 2 giây

// =========== Notify helper ===========
function notifyPhaseChange(prevPhase, nextPhase) {
  if (typeof window === 'undefined') return;

  // --- PHẦN CODE MỚI ĐỂ CHỐNG DỘI ---
  try {
    const now = Date.now();
    const raw = localStorage.getItem(NOTIFY_DEBOUNCE_KEY);
    if (raw) {
      const last = JSON.parse(raw);
      // Nếu có 1 thông báo cùng loại được gửi trong khoảng thời gian chống dội -> HỦY
      if (last.phase === nextPhase && (now - last.ts) < NOTIFY_DEBOUNCE_MS) {
        console.log('[Pomodoro] Notification debounced to prevent duplicate.');
        return;
      }
    }
    // Nếu không bị hủy, ghi lại dấu vết để các tab khác biết
    localStorage.setItem(NOTIFY_DEBOUNCE_KEY, JSON.stringify({ phase: nextPhase, ts: now }));
  } catch (e) {
    console.error('[Pomodoro] Debounce check failed', e);
  }
  // --- KẾT THÚC PHẦN CODE MỚI ---

  if (notifyPermission() !== 'granted') return;

  try {
    document.title =
        nextPhase === 'break' ? '⏸ Nghỉ · Pomodoro' :
            nextPhase === 'focus' ? '▶ Focus · Pomodoro' :
                '✔ Hoàn tất · Pomodoro';
  } catch {}

  if (nextPhase === 'break') {
    sendNotification('Pomodoro: Nghỉ 5 phút', {
      body: 'Thư giãn mắt và duỗi tay nhé. Sẽ tự chuyển lại Focus.',
      tag: 'pomodoro-phase',
      renotify: true,
    });
  } else if (nextPhase === 'focus') {
    sendNotification('Pomodoro: Bắt đầu Focus 25 phút', {
      body: 'Quay lại tập trung nào!',
      tag: 'pomodoro-phase',
      renotify: true,
    });
  } else if (nextPhase === 'done' || nextPhase === 'finished') {
    sendNotification('Pomodoro hoàn tất', {
      body: 'Bạn đã hoàn thành đủ chu kỳ Pomodoro (2 tiếng). 🎉',
      tag: 'pomodoro-done',
      renotify: true,
    });
  }
}

// =========== Context ===========
const PomoCtx = createContext(null);

// =========== Cấu hình Pomodoro ===========
const CYCLES = 4;                 // 4 × (25' + 5') = 120'
const FOCUS_SEC = 25 * 60;
const BREAK_SEC = 5 * 60;

const STORAGE_KEY = 'jp_pomodoro_v7'; // bump key để né rác cũ
const DEVICE_KEY  = 'jp_pomo_device_id';
const TAB_KEY     = 'jp_pomo_tab_id';
const POLL_MS     = 1000;         // fallback polling 1s

// Lịch 4 chu kỳ focus/break
const schedule = Array.from({ length: CYCLES }, (_, i) => [
  { type: 'focus', dur: FOCUS_SEC, cycle: i + 1 },
  { type: 'break', dur: BREAK_SEC, cycle: i + 1 },
]).flat();

// =========== Supabase client (client-side) ===========
const url  = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supa = (url && anon) ? createClient(url, anon) : null;

// =========== Helpers ===========
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const pad = (n) => String(n).padStart(2, '0');
const fmt = (s) => {
  const x = Math.max(0, Math.floor(s));
  return `${pad(Math.floor(x / 60))}:${pad(x % 60)}`;
};

function getOrMakeDeviceId() {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = (crypto?.randomUUID?.() || Math.random().toString(36).slice(2)).replace(/-/g, '');
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch { return 'dev'; }
}
function getOrMakeTabId() {
  try {
    let id = sessionStorage.getItem(TAB_KEY);
    if (!id) {
      id = (crypto?.randomUUID?.() || Math.random().toString(36).slice(2)).replace(/-/g, '');
      sessionStorage.setItem(TAB_KEY, id);
    }
    return id;
  } catch { return Math.random().toString(36).slice(2); }
}

// API POST state -> /api/pomodoro/state
async function postState({ phaseIndex, secLeft, paused, updatedBy, keepalive = false }) {
  try {
    const body = JSON.stringify({ phaseIndex, secLeft, paused, updatedBy });
    if (keepalive && typeof navigator !== 'undefined' && navigator.sendBeacon) {
      navigator.sendBeacon('/api/pomodoro/state', new Blob([body], { type: 'application/json' }));
      return true;
    }
    const r = await fetch('/api/pomodoro/state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: keepalive ? true : undefined,
    });
    if (!r.ok) {
      console.error('[Pomodoro] POST failed', r.status, await r.text().catch(() => ''));
      return false;
    }
    return true;
  } catch (e) {
    console.error('[Pomodoro] POST error', e);
    return false;
  }
}

// =========== Provider ===========
export function PomodoroProvider({ children }) {
  // Core state
  const [phaseIndex, setPhaseIndex] = useState(0);
  const [secLeft, setSecLeft] = useState(schedule[0].dur);
  const [paused, setPaused] = useState(true);

  // Gating/hydration flags
  const [ready, setReady] = useState(false);  // true sau khi sync lần đầu
  const [booting, setBooting] = useState(true);

  // Refs
  const readyRef = useRef(false);
  const bootRef = useRef(true);

  const deviceIdRef = useRef('dev');
  const tabIdRef = useRef('tab');

  const lastTsRef = useRef(0);   // mốc remote mới nhất đã áp
  const localTsRef = useRef(0);  // mốc local persist

  const bcRef = useRef(null);    // supabase broadcast
  const walRef = useRef(null);   // supabase WAL (realtime db)

  // Tick mượt theo wall clock
  const tickIdRef = useRef(null);
  const lastWallRef = useRef(0);
  const carryMsRef = useRef(0);

  // ===== Boot: chỉ đọc dấu vết để biết ts; chưa hydrate state UI =====
  useEffect(() => {
    deviceIdRef.current = getOrMakeDeviceId();
    tabIdRef.current = getOrMakeTabId();
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      localTsRef.current = raw ? Number(JSON.parse(raw).ts || 0) : 0;
    } catch {
      localTsRef.current = 0;
    }
  }, []);

  // ===== Initial sync: SERVER LUÔN THẮNG khi GET thành công =====
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const r = await fetch('/api/pomodoro/state');
        const data = await r.json();
        if (!mounted || !data || data.error) {
          // Fallback local
          const raw = localStorage.getItem(STORAGE_KEY);
          if (raw) {
            const s = JSON.parse(raw);
            const pi = clamp(Number(s.phaseIndex ?? 0), 0, schedule.length - 1);
            const maxDur = schedule[pi].dur;
            setPhaseIndex(pi);
            setSecLeft(clamp(Number(s.secLeft ?? maxDur), 0, maxDur));
            setPaused(Boolean(s.paused ?? true));
            lastTsRef.current = Number(s.ts || 0);
          } else {
            setPhaseIndex(0); setSecLeft(schedule[0].dur); setPaused(true);
            lastTsRef.current = Date.now();
          }
        } else {
          const pi = clamp(Number(data.phase_index ?? 0), 0, schedule.length - 1);
          const maxDur = schedule[pi].dur;
          setPhaseIndex(pi);
          setSecLeft(clamp(Number(data.sec_left ?? maxDur), 0, maxDur));
          setPaused(Boolean(data.paused ?? true));
          lastTsRef.current = new Date(data.updated_at || Date.now()).getTime();
        }
      } catch {
        // Fallback local
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const s = JSON.parse(raw);
          const pi = clamp(Number(s.phaseIndex ?? 0), 0, schedule.length - 1);
          const maxDur = schedule[pi].dur;
          setPhaseIndex(pi);
          setSecLeft(clamp(Number(s.secLeft ?? maxDur), 0, maxDur));
          setPaused(Boolean(s.paused ?? true));
          lastTsRef.current = Number(s.ts || 0);
        } else {
          setPhaseIndex(0); setSecLeft(schedule[0].dur); setPaused(true);
          lastTsRef.current = Date.now();
        }
      }
      // unlock
      bootRef.current = false;
      setBooting(false);
      setReady(true);
      readyRef.current = true;
    })();
    return () => { mounted = false; };
  }, []);

  // ===== Tick theo wall-clock (mượt, không nhảy 2s) + notify tại thời điểm đổi pha =====
  useEffect(() => {
    if (!ready || paused) return;
    lastWallRef.current = Date.now();
    carryMsRef.current = 0;

    tickIdRef.current = setInterval(() => {
      const now = Date.now();
      let delta = now - lastWallRef.current;
      if (delta < 0) delta = 0;
      lastWallRef.current = now;

      carryMsRef.current += delta;
      while (carryMsRef.current >= 1000) {
        carryMsRef.current -= 1000;
        setSecLeft((s) => {
          if (s > 1) return s - 1;

          // s <= 1 => chuyển pha & bắn notify ngay tại đây
          setPhaseIndex((i) => {
            const next = i + 1;
            const prevType = (schedule[i] || { type: 'focus' }).type;

            if (next >= schedule.length) {
              if (readyRef.current && !bootRef.current) {
                notifyPhaseChange(prevType, 'done');
              }
              setPaused(true);
              return schedule.length - 1;
            }

            const nextType = schedule[next].type;
            if (readyRef.current && !bootRef.current) {
              notifyPhaseChange(prevType, nextType);
            }
            setSecLeft(schedule[next].dur);
            return next;
          });
          return 0;
        });
      }
    }, 250);

    return () => { clearInterval(tickIdRef.current); tickIdRef.current = null; };
  }, [ready, paused]);

  // ===== Persist LOCAL khi state đổi (sau boot) =====
  useEffect(() => {
    if (!readyRef.current || bootRef.current) return;
    const ts = Date.now();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ phaseIndex, secLeft, paused, ts }));
    } catch {}
    localTsRef.current = ts;
  }, [phaseIndex, secLeft, paused]);

  // ===== Helper: áp remote an toàn + notify khi pha thay đổi =====
  function applyRemoteSafe({ pi, sl, pz, ts }) {
    if (ts <= lastTsRef.current) return; // cũ hơn → bỏ
    const curPi = phaseIndex;
    const curSl = secLeft;

    // Nếu cùng pha và chênh < 2s → bỏ qua để tránh nháy
    if (pi === curPi && Math.abs(sl - curSl) < 2) {
      lastTsRef.current = ts;
      return;
    }

    // Áp remote
    lastTsRef.current = ts;
    const prevType = (schedule[curPi] || { type: 'focus' }).type;
    const nextType = (schedule[pi] || { type: 'focus' }).type;

    setPhaseIndex(pi);
    setSecLeft(sl);
    setPaused(Boolean(pz));

    // Reset wall-clock tick để không “trừ đúp”
    lastWallRef.current = Date.now();
    carryMsRef.current = 0;

    // // Bắn notify khi nhận pha mới từ remote
    // if (readyRef.current && !bootRef.current && prevType !== nextType) {
    //   notifyPhaseChange(prevType, nextType);
    // }
  }

  // ===== Supabase WAL (realtime DB) =====
  useEffect(() => {
    if (!supa) return;
    const ch = supa.channel('pomo_wal')
        .on('postgres_changes',
            { event: '*', schema: 'public', table: 'pomodoro_state', filter: 'id=eq.1' },
            (ev) => {
              if (!readyRef.current) return;
              const row = ev.new || ev.record || {};
              const ts = new Date(row.updated_at || Date.now()).getTime();
              if (row.updated_by && row.updated_by === deviceIdRef.current) return;
              const pi = clamp(Number(row.phase_index ?? 0), 0, schedule.length - 1);
              const maxDur = schedule[pi].dur;
              applyRemoteSafe({
                pi,
                sl: clamp(Number(row.sec_left ?? maxDur), 0, maxDur),
                pz: Boolean(row.paused ?? true),
                ts,
              });
            })
        .subscribe();
    walRef.current = ch;
    return () => { if (walRef.current) supa.removeChannel(walRef.current); };
  }, []);

  // ===== Supabase Broadcast (giữa tab/trình duyệt) =====
  useEffect(() => {
    if (!supa) return;
    const ch = supa.channel('pomo_bus', { config: { broadcast: { self: false } } });
    ch.on('broadcast', { event: 'pomo' }, (msg) => {
      if (!readyRef.current) return;
      const p = msg?.payload || {};
      const ts = Number(p.ts || 0);
      if (p.fromTab && p.fromTab === tabIdRef.current) return;
      if (!Number.isFinite(ts)) return;
      const pi = clamp(Number(p.phaseIndex ?? 0), 0, schedule.length - 1);
      const maxDur = schedule[pi].dur;
      applyRemoteSafe({
        pi,
        sl: clamp(Number(p.secLeft ?? maxDur), 0, maxDur),
        pz: Boolean(p.paused ?? true),
        ts,
      });
    });
    ch.subscribe();
    bcRef.current = ch;
    return () => { if (bcRef.current) supa.removeChannel(bcRef.current); };
  }, []);

  // ===== Polling fallback (sau khi ready) =====
  useEffect(() => {
    if (!readyRef.current) return;
    let killed = false;
    const poll = async () => {
      try {
        const r = await fetch('/api/pomodoro/state');
        const data = await r.json();
        if (killed || !data || data.error) return;
        const ts = new Date(data.updated_at || Date.now()).getTime();
        const pi = clamp(Number(data.phase_index ?? 0), 0, schedule.length - 1);
        const maxDur = schedule[pi].dur;
        applyRemoteSafe({
          pi,
          sl: clamp(Number(data.sec_left ?? maxDur), 0, maxDur),
          pz: Boolean(data.paused ?? true),
          ts,
        });
      } catch {}
    };
    const id = setInterval(poll, POLL_MS);
    return () => { killed = true; clearInterval(id); };
  }, [ready]);

  // ===== Push khi state đổi (broadcast + POST) =====
  useEffect(() => {
    if (bootRef.current || !readyRef.current) return;
    const ts = Date.now();

    // broadcast cho các tab/thiết bị
    if (bcRef.current) {
      bcRef.current.send({
        type: 'broadcast',
        event: 'pomo',
        payload: { ts, from: deviceIdRef.current, fromTab: tabIdRef.current, phaseIndex, secLeft, paused },
      }).catch(() => {});
    }

    // debounce POST về server
    const t = setTimeout(() => {
      postState({ phaseIndex, secLeft, paused, updatedBy: deviceIdRef.current })
          .then(ok => { if (ok) lastTsRef.current = Date.now(); });
    }, 1200);

    return () => clearTimeout(t);
  }, [phaseIndex, secLeft, paused]);

  // ===== Flush khi đóng/reload =====
  useEffect(() => {
    const onHide = () => {
      if (bootRef.current || !readyRef.current) return;
      postState({ phaseIndex, secLeft, paused, updatedBy: deviceIdRef.current, keepalive: true });
    };
    window.addEventListener('pagehide', onHide);
    window.addEventListener('beforeunload', onHide);
    return () => {
      window.removeEventListener('pagehide', onHide);
      window.removeEventListener('beforeunload', onHide);
    };
  }, [phaseIndex, secLeft, paused]);

  // ===== Actions =====
  const pause = () => {
    setPaused(true);
    if (readyRef.current && !bootRef.current)
      postState({ phaseIndex, secLeft, paused: true, updatedBy: deviceIdRef.current });
  };
  const resume = () => {
    setPaused(false);
    if (readyRef.current && !bootRef.current)
      postState({ phaseIndex, secLeft, paused: false, updatedBy: deviceIdRef.current });
  };
  const reset = () => {
    const pi = 0, sl = schedule[0].dur, pz = false;
    const prevType = (schedule[phaseIndex] || { type: 'focus' }).type;
    setPhaseIndex(pi); setSecLeft(sl); setPaused(pz);
    if (readyRef.current && !bootRef.current) {
      // notify chuyển về focus
      notifyPhaseChange(prevType, 'focus');
      postState({ phaseIndex: pi, secLeft: sl, paused: pz, updatedBy: deviceIdRef.current });
    }
  };

  // ===== Derived =====
  const totalSec = useMemo(() => schedule.reduce((a, p) => a + p.dur, 0), []);
  const remainingTotal = useMemo(() => {
    let rest = secLeft;
    for (let i = phaseIndex + 1; i < schedule.length; i++) rest += schedule[i].dur;
    return rest;
  }, [secLeft, phaseIndex]);
  const progress = useMemo(() => {
    const el = totalSec - remainingTotal;
    return Math.max(0, Math.min(100, Math.round((el / totalSec) * 100)));
  }, [totalSec, remainingTotal]);
  const current = schedule[phaseIndex] || { type: 'focus', dur: FOCUS_SEC, cycle: 1 };

  const cycles = useMemo(() => {
    const list = [];
    for (let i = 0; i < CYCLES; i++) {
      const f = i * 2, b = f + 1;
      list.push({
        index: i + 1,
        focusDone: phaseIndex > f || (phaseIndex === f && secLeft === 0),
        breakDone: phaseIndex > b || (phaseIndex === b && secLeft === 0),
        active: phaseIndex === f || phaseIndex === b,
      });
    }
    return list;
  }, [phaseIndex, secLeft]);

  const value = {
    current, phaseIndex, secLeft, paused, progress, cycles,
    totalSec, remainingTotal,
    labelMMSS: booting ? '--:--' : fmt(secLeft),
    labelMini: booting ? '…' : `${current.type === 'focus' ? 'F' : 'B'}${current.cycle}/${CYCLES} ${fmt(secLeft)}`,
    pause, resume, reset, ready: !booting && ready,
  };

  return <PomoCtx.Provider value={value}>{children}</PomoCtx.Provider>;
}

// Hook tiêu dùng
export function usePomodoro() {
  const ctx = useContext(PomoCtx);
  if (!ctx) throw new Error('usePomodoro must be used within <PomodoroProvider/>');
  return ctx;
}
