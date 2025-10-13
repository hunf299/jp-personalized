import React from 'react';
const TOTAL = 120*60;
async function apiGet(){ const r = await fetch('/api/pomodoro'); return r.json(); }
async function apiPost(body){ const r = await fetch('/api/pomodoro', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body)}); return r.json(); }
function usePomodoro(){
  const [state, setState] = React.useState({ remaining: TOTAL, running:false, syncedAt: Date.now() });
  React.useEffect(()=>{
    let mounted=true;
    (async()=>{ try{ const s=await apiGet(); if(mounted) setState({ ...s, syncedAt: Date.now() }); }catch{} })();
    const sync=setInterval(async()=>{ try{ const s=await apiGet(); setState(prev=> ({ ...s, syncedAt: Date.now() })); }catch{} }, 5000);
    return ()=>{ mounted=false; clearInterval(sync); };
  }, []);
  React.useEffect(()=>{
    const id=setInterval(()=>{
      setState(prev=>{
        if(!prev.running) return prev;
        const elapsed = Math.floor((Date.now()-prev.syncedAt)/1000);
        const next = Math.max(0, prev.remaining - elapsed);
        return { ...prev, _displayRemain: next };
      });
    },1000); return ()=>clearInterval(id);
  }, [state.running, state.syncedAt, state.remaining]);
  const remainingDisplay = state.running && state._displayRemain!=null ? state._displayRemain : state.remaining;
  const start = async()=>{ await apiPost({ action:'start' }); const s=await apiGet(); setState({ ...s, syncedAt: Date.now() }); };
  const pause = async()=>{ await apiPost({ action:'pause' }); const s=await apiGet(); setState({ ...s, syncedAt: Date.now() }); };
  const reset = async()=>{ await apiPost({ action:'reset' }); const s=await apiGet(); setState({ ...s, syncedAt: Date.now() }); };
  return { ...state, remainingDisplay, start, pause, reset };
}
export default function Pomodoro({ mode='compact' }){
  const { remainingDisplay, running, start, pause, reset } = usePomodoro();
  const mins = String(Math.floor(remainingDisplay/60)).padStart(2,'0');
  const secs = String(remainingDisplay%60).padStart(2,'0');
  if (mode==='compact') {
    return (<div style={{ display:'flex', alignItems:'center', gap:8, color:'#d94b4b' }}>
      <span style={{ fontWeight:700 }}>{mins}:{secs}</span>
      {!running ? (<button onClick={start} title="Start">▶</button>) : (<button onClick={pause} title="Pause">⏸</button>)}
      <button onClick={reset} title="Reset 2h">⟲</button>
    </div>);
  }
  return (<div style={{ maxWidth: 560, margin:'0 auto' }}>
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
      <h2 style={{ margin:0 }}>Pomodoro · 2 giờ</h2>
      <div>{!running ? <button onClick={start}>Start</button> : <button onClick={pause}>Pause</button>}<button onClick={reset} style={{ marginLeft:8 }}>Reset 2h</button></div>
    </div>
    <div style={{ marginTop:12, border:'1px solid #ffd6d6', borderRadius:12, padding:16, background:'#fff' }}>
      <div style={{ fontSize:48, fontWeight:800, textAlign:'center', color:'#d94b4b' }}>{mins}:{secs}</div>
      <div style={{ textAlign:'center', opacity:.7 }}>Đồng bộ giữa thiết bị qua Supabase</div>
    </div>
  </div>);
}
