// pages/pomo-debug.js
import React from 'react';
import { createClient } from '@supabase/supabase-js';

const url  = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supa = (url && anon) ? createClient(url, anon) : null;

export default function PomoDebug() {
    const [log, setLog] = React.useState([]);
    const add = (m) => setLog((l) => [`[${new Date().toLocaleTimeString()}] ${m}`, ...l].slice(0, 200));

    React.useEffect(() => {
        if (!supa) { add('No supabase client (missing NEXT_PUBLIC env)'); return; }
        const bus = supa.channel('pomo_bus', { config: { broadcast: { self: false } } });
        bus.on('broadcast', { event: 'ping' }, (msg) => add(`got ping: ${JSON.stringify(msg.payload)}`));
        bus.subscribe((st) => add(`broadcast status: ${st}`));

        const wal = supa.channel('pomo_wal_dbg')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'pomodoro_state', filter: 'id=eq.1' },
                (p) => add(`WAL: ${p.eventType} → ${JSON.stringify(p.new || p.record)}`))
            .subscribe((st) => add(`wal status: ${st}`));

        return () => { supa.removeChannel(bus); supa.removeChannel(wal); };
    }, []);

    const sendPing = async () => {
        if (!supa) return;
        await supa.channel('pomo_bus').send({ type: 'broadcast', event: 'ping', payload: { ts: Date.now(), rand: Math.random() } });
        add('sent ping');
    };

    const readServer = async () => {
        const r = await fetch('/api/pomodoro/state'); add('GET: ' + (await r.text()));
    };
    const writeServer = async () => {
        const r = await fetch('/api/pomodoro/state', { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phaseIndex: 0, secLeft: 1495, paused: false, updatedBy: 'debug' }) });
        add('POST: ' + (await r.text()));
    };

    return (
        <div style={{ padding: 16, fontFamily: 'monospace' }}>
            <h3>Pomodoro Realtime Debug</h3>
            <p>URL: {String(url)} · ANON len: {(anon||'').length}</p>
            <button onClick={sendPing}>Broadcast Ping</button>
            <button onClick={readServer} style={{ marginLeft: 8 }}>GET state</button>
            <button onClick={writeServer} style={{ marginLeft: 8 }}>POST state</button>
            <pre style={{ marginTop: 12, background: '#f7f7f7', padding: 12, maxHeight: 400, overflow: 'auto' }}>
        {log.join('\n')}
      </pre>
        </div>
    );
}
