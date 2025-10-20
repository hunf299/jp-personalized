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

        const { data: sessionRow, error: sessionErr } = await supa
            .from('sessions')
            .select('id, deleted')
            .eq('id', id)
            .maybeSingle();
        if (sessionErr) throw sessionErr;
        if (!sessionRow) return res.status(404).json({ error: 'Session not found' });
        if (sessionRow.deleted) return res.json({ ok: true, alreadyDeleted: true });

        const { data: cardRows, error: cardErr } = await supa
            .from('session_cards')
            .select('card_id')
            .eq('session_id', id);
        if (cardErr) throw cardErr;
        const cardIds = Array.from(new Set((cardRows || []).map(r => r?.card_id).filter(Boolean)));

        let cardsToSoftDelete = cardIds;
        if (cardIds.length){
            const { data: otherLinks, error: otherLinksErr } = await supa
                .from('session_cards')
                .select('card_id, session_id')
                .in('card_id', cardIds)
                .neq('session_id', id);
            if (otherLinksErr) throw otherLinksErr;
            const otherSessionIds = Array.from(new Set((otherLinks || []).map(r => r?.session_id).filter(Boolean)));
            let activeSessionIds = new Set();
            if (otherSessionIds.length){
                const { data: sessionsLookup, error: sessionsLookupErr } = await supa
                    .from('sessions')
                    .select('id, deleted')
                    .in('id', otherSessionIds);
                if (sessionsLookupErr) throw sessionsLookupErr;
                activeSessionIds = new Set((sessionsLookup || []).filter(s => !s?.deleted).map(s => s.id));
            }
            const reused = new Set((otherLinks || [])
                .filter(link => activeSessionIds.has(link?.session_id))
                .map(link => link.card_id)
                .filter(Boolean));
            cardsToSoftDelete = cardIds.filter(cardId => !reused.has(cardId));
        }

        const now = new Date().toISOString();
        if (cardsToSoftDelete.length){
            const { error: cardUpdateErr } = await supa
                .from('cards')
                .update({ deleted: true, deleted_at: now })
                .in('id', cardsToSoftDelete)
                .eq('deleted', false);
            if (cardUpdateErr) throw cardUpdateErr;

            const { error: memCleanupErr } = await supa
                .from('memory_levels')
                .delete()
                .in('card_id', cardsToSoftDelete);
            if (memCleanupErr) throw memCleanupErr;
        }

        const { error: sessionUpdateErr } = await supa
            .from('sessions')
            .update({ deleted:true, deleted_at: now })
            .eq('id', id);
        if (sessionUpdateErr) throw sessionUpdateErr;

        res.json({ ok:true, removed_cards: cardsToSoftDelete.length });
    }catch(e){ res.status(500).json({ error:String(e) }); }
}
