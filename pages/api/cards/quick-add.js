// pages/api/cards/quick-add.js (category optional / missing-safe)
import { createClient } from '@supabase/supabase-js';
const url  = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const key  = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
const supa = createClient(url, key, { auth: { persistSession: false } });

export default async function handler(req,res){
  if (req.method!=='POST') return res.status(405).end();
  try{
    const { type='vocab', front, back='', category=null } = req.body||{};
    if(!front) return res.status(400).json({ error:'Missing front' });

    // Try insert with category; if column missing, retry without
    let ins = await supa.from('cards').insert({ type, front, back, category }).select().maybeSingle();
    if (ins.error && /column .*category.* does not exist/i.test(ins.error.message||'')) {
      ins = await supa.from('cards').insert({ type, front, back }).select().maybeSingle();
    }
    if (ins.error) throw ins.error;

    await supa.from('memory_levels').upsert({ card_id: ins.data.id, type, level: 0, last_learned_at: new Date().toISOString() });
    return res.status(200).json({ ok:true, id: ins.data.id });
  }catch(e){ 
    return res.status(500).json({ error:String(e) }); 
  }
}
