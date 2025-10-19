// pages/api/sessions/delete.js
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
const supa = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });

export default async function handler(req,res){
    if (req.method!=='POST') return res.status(405).end();
    try{
        const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
        const { id } = body||{};
        if (!id) return res.status(400).json({ error:'Missing id' });
        const up = await supa.from('sessions').update({ deleted:true, deleted_at: new Date().toISOString() }).eq('id', id);
        if (up.error) throw up.error;
        res.json({ ok:true });
    }catch(e){ res.status(500).json({ error:String(e) }); }
}
