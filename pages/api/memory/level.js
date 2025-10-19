// pages/api/memory/level.js
import { createClient } from '@supabase/supabase-js';
import { planNext } from '../../../lib/fsrs';

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase =
    url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });
    if (!supabase) return res.status(500).json({ ok: false, error: 'Missing SUPABASE env' });

    try {
        const {
            card_id,
            type: clientType,
            new_level,
            base_level,
            auto_active,
            source,
            final,
            quality: qualityFromClient,
        } = req.body || {};

        if (!card_id) return res.status(400).json({ ok: false, error: 'card_id required' });

        const base = Number.isFinite(Number(base_level)) ? Number(base_level) : null;

        const clampLevel = (value) => Math.max(0, Math.min(5, Math.round(Number(value))));

        const hasNewLevel = Number.isFinite(Number(new_level));
        const hasFinal = Number.isFinite(Number(final));
        const hasQuality = Number.isFinite(Number(qualityFromClient));

        if (!hasNewLevel && !hasFinal && !hasQuality) {
            return res.status(400).json({ ok: false, error: 'Missing level/final/quality number' });
        }

        const lvl = hasNewLevel
            ? clampLevel(new_level)
            : hasFinal
            ? clampLevel(final)
            : clampLevel(qualityFromClient);

        // Chọn quality: ưu tiên client gửi lên, nếu thiếu thì suy ra từ base -> lvl
        let quality = Number(qualityFromClient);
        if (!Number.isFinite(quality)) {
            if (base === null) quality = lvl >= 4 ? 5 : (lvl >= 2 ? 3 : 1);
            else quality = lvl > base ? 5 : (lvl === base ? 3 : 1);
        }
        quality = Math.max(0, Math.min(5, Math.round(quality)));

        const resolvedFinal = hasNewLevel
            ? lvl
            : hasFinal
            ? clampLevel(final)
            : lvl;

        const now = new Date().toISOString();

        // Lấy thông tin hiện tại (nếu có) để giữ type/last_learned_at
        const { data: current, error: currentErr } = await supabase
            .from('memory_levels')
            .select(
                'card_id, type, level, stability, difficulty, due, last_reviewed_at, leech_count, is_leech, last_learned_at'
            )
            .eq('card_id', card_id)
            .maybeSingle();
        if (currentErr) throw currentErr;

        let resolvedType = clientType || current?.type || null;
        if (!resolvedType) {
            const { data: cardRow, error: cardErr } = await supabase
                .from('cards')
                .select('type')
                .eq('id', card_id)
                .maybeSingle();
            if (cardErr) throw cardErr;
            resolvedType = cardRow?.type || null;
        }

        // 1) Ghi log review để tạo lịch sử & trigger DB (nếu cần)
        const logPayload = {
            card_id: String(card_id),
            quality,
            meta: {
                source: source || null,
                auto_active: !!auto_active,
                base_level: base,
                new_level: lvl,
                final: resolvedFinal,
            },
        };
        const { error: logErr } = await supabase.from('review_logs').insert(logPayload);
        if (logErr) throw logErr;

        // 2) Tính lại leech_count dựa trên số lần trượt LIÊN TIẾP (bỏ qua lần trượt đầu tiên)
        const pageSize = 100;
        let offset = 0;
        let failStreak = 0;
        let shouldStop = false;

        while (!shouldStop) {
            const { data: logBatch, error: logsErr } = await supabase
                .from('review_logs')
                .select('quality')
                .eq('card_id', card_id)
                .order('created_at', { ascending: false })
                .range(offset, offset + pageSize - 1);
            if (logsErr) throw logsErr;

            if (!Array.isArray(logBatch) || logBatch.length === 0) {
                break;
            }

            for (const row of logBatch) {
                const value = Number.isFinite(Number(row?.quality))
                    ? Number(row.quality)
                    : null;

                if (value === null) {
                    shouldStop = true;
                    break;
                }

                if (value <= 1) {
                    failStreak += 1;
                } else {
                    shouldStop = true;
                    break;
                }
            }

            if (shouldStop || logBatch.length < pageSize) {
                break;
            }

            offset += pageSize;
        }

        const leechCount = Math.max(0, failStreak - 1);
        const isLeech = leechCount >= 3;

        // 3) Upsert memory_levels với mức nhớ mới + leech metadata chính xác
        const normalizeLevel = (value) => {
            const n = Number(value);
            return Number.isFinite(n) && n >= 0 ? n : 0;
        };
        const normalizePositive = (value) => {
            const n = Number(value);
            return Number.isFinite(n) && n > 0 ? n : undefined;
        };

        const baseCardState = {
            level: normalizeLevel(current?.level),
            stability: normalizePositive(current?.stability),
            difficulty: normalizePositive(current?.difficulty),
            last_reviewed_at: current?.last_reviewed_at || undefined,
        };

        const nextState = planNext(baseCardState, quality);

        const upsertRow = {
            card_id: String(card_id),
            type: resolvedType,
            level: nextState.level,
            stability: nextState.stability,
            difficulty: nextState.difficulty,
            due: nextState.due,
            last_reviewed_at: nextState.last_reviewed_at,
            leech_count: leechCount,
            is_leech: isLeech,
            updated_at: now,
        };
        if (!current?.last_learned_at) {
            upsertRow.last_learned_at = now;
        }

        const { data: memory, error: mlErr } = await supabase
            .from('memory_levels')
            .upsert(upsertRow, { onConflict: 'card_id' })
            .select('*')
            .single();
        if (mlErr) throw mlErr;

        // 4) Ghi đè điểm của session gần nhất (nếu có) để UI phản ánh đúng
        const { data: sessionCard, error: sessionLookupErr } = await supabase
            .from('session_cards')
            .select('session_id, card_id')
            .eq('card_id', card_id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
        if (!sessionLookupErr && sessionCard?.session_id) {
            const sessionId = sessionCard.session_id;
            const { error: sessionUpdateErr } = await supabase
                .from('session_cards')
                .update({ final: resolvedFinal })
                .eq('session_id', sessionId)
                .eq('card_id', card_id);
            if (sessionUpdateErr) {
                // eslint-disable-next-line no-console
                console.error('[api/memory/level] failed to update session card', sessionUpdateErr);
            }

            // attempt to refresh summary so UI reflects latest levels immediately
            try {
                const { data: sessionCards, error: cardsErr } = await supabase
                    .from('session_cards')
                    .select('final')
                    .eq('session_id', sessionId);
                if (cardsErr) throw cardsErr;

                const dist = [0, 0, 0, 0, 0, 0];
                let learned = 0;
                const total = Array.isArray(sessionCards) ? sessionCards.length : 0;

                (sessionCards || []).forEach((row) => {
                    const value = Number.isFinite(Number(row?.final)) ? Number(row.final) : 0;
                    if (value >= 0 && value <= 5) {
                        dist[value] += 1;
                        if (value >= 3) learned += 1;
                    }
                });

                const summaryUpdate = {
                    total,
                    learned,
                    left: Math.max(0, total - learned),
                    agg: dist,
                };

                const { error: summaryErr } = await supabase
                    .from('sessions')
                    .update({ summary: summaryUpdate })
                    .eq('id', sessionId);
                if (summaryErr) throw summaryErr;
            } catch (summaryError) {
                // eslint-disable-next-line no-console
                console.error('[api/memory/level] failed to refresh session summary', summaryError);
            }
        } else if (sessionLookupErr) {
            // eslint-disable-next-line no-console
            console.error('[api/memory/level] failed to locate session card', sessionLookupErr);
        }

        return res.status(200).json({ ok: true, quality, memory });
    } catch (e) {
        console.error('[api/memory/level]', e);
        return res.status(500).json({ ok: false, error: e.message || String(e) });
    }
}
