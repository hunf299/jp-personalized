import { readPomodoroRaw, writePomodoroRaw } from '../../lib/server/db';
function derive(rec){
  const now=Date.now(); const last=new Date(rec.updated_at).getTime();
  let remaining=rec.remaining; if(rec.running){ const elapsed=Math.floor((now-last)/1000); remaining=Math.max(0, remaining - elapsed); }
  return { remaining, running: rec.running };
}
export default async function handler(req,res){
  try{
    if(req.method==='GET'){ const rec=await readPomodoroRaw(); const d=derive(rec); return res.json(d); }
    if(req.method==='POST'){
      const body=typeof req.body==='string'? JSON.parse(req.body):req.body;
      const rec=await readPomodoroRaw(); const d=derive(rec);
      if(body.action==='start'){ await writePomodoroRaw({ id:1, remaining:d.remaining, running:true, updated_at:new Date().toISOString() }); }
      else if(body.action==='pause'){ await writePomodoroRaw({ id:1, remaining:d.remaining, running:false, updated_at:new Date().toISOString() }); }
      else if(body.action==='reset'){ await writePomodoroRaw({ id:1, remaining:7200, running:false, updated_at:new Date().toISOString() }); }
      const next=await readPomodoroRaw(); const out=derive(next); return res.json(out);
    }
    return res.status(405).end();
  }catch(e){ res.status(500).json({ error:String(e) }); }
}
