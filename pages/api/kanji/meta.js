// pages/api/kanji/meta.js
import { getKanjiMeta, similarKanjiByRadicals } from '../../../lib/kanjiMeta';
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res){
    try{
        const { char, similarPool } = req.query;
        if (!char) return res.status(400).json({ error:'Missing ?char=' });

        if (req.method === 'GET'){
            const meta = await getKanjiMeta(char);
            if (similarPool){
                // lấy pool = tất cả kanji của user (type='kanji')
                const supa = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
                const { data: cards } = await supa.from('cards').select('front').eq('type','kanji').eq('deleted', false);
                const pool = (cards||[]).map(x=>x.front).filter(Boolean);
                const sims = await similarKanjiByRadicals(char, pool);
                return res.json({ ...meta, similar: sims });
            }
            return res.json(meta);
        }

        res.setHeader('Allow', 'GET'); return res.status(405).end();
    }catch(e){
        res.status(500).json({ error:String(e) });
    }
}
