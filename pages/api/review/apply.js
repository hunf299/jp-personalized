// pages/api/review/apply.js
// Ghi đè điểm vào session gần nhất + cập nhật memory_levels
import { createClient } from '@supabase/supabase-js';

// ---- NẠP ENV AN TOÀN VỚI NHIỀU TÊN BIẾN KHẢ DỤNG ----
function getEnv() {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_URL ||                   // fallback tên khác
    '';

  // service role: thử nhiều tên
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE ||
    process.env.SUPABASE_SERVICE_KEY ||
    '';

  // anon: phòng khi không có service role vẫn cho chạy (nếu RLS cho phép)
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    '';

  // Ưu tiên serviceRoleKey, fallback anonKey
  const adminKey = serviceRoleKey || anonKey;

  return { url, serviceRoleKey, anonKey, adminKey };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res
      .status(405)
      .json({ error: 'Method not allowed', hint: 'Use POST' });
  }

  const { url, serviceRoleKey, anonKey, adminKey } = getEnv();

  // Thiếu URL hoặc cả 2 key đều trống → báo rõ biến nào có/không có
  if (!url || !adminKey) {
    return res.status(500).json({
      error: 'Missing SUPABASE env (URL or KEY)',
      have: {
        NEXT_PUBLIC_SUPABASE_URL: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
        SUPABASE_URL: Boolean(process.env.SUPABASE_URL),
        SUPABASE_SERVICE_ROLE_KEY: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
        SUPABASE_SERVICE_ROLE: Boolean(process.env.SUPABASE_SERVICE_ROLE),
        SUPABASE_SERVICE_KEY: Boolean(process.env.SUPABASE_SERVICE_KEY),
        NEXT_PUBLIC_SUPABASE_ANON_KEY: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
        SUPABASE_ANON_KEY: Boolean(process.env.SUPABASE_ANON_KEY),
      },
      note:
        'Ưu tiên đặt SUPABASE_SERVICE_ROLE_KEY (server-only). Nếu không có, route sẽ fallback sang ANON_KEY nhưng cần RLS cho phép update/upsert.',
    });
  }

  const supabase = createClient(url, adminKey, { auth: { persistSession: false } });

  try {
    const { type, rows } = (req.body || {});
    const list = Array.isArray(rows) ? rows : [];
    if (!type || !list.length) {
      return res.status(400).json({ error: 'Missing type or rows' });
    }

    let updated = 0, skipped = 0;
    for (const row of list) {
      const cardId = row?.card_id;
      const score = Number(row?.score ?? 0);
      if (!cardId) { skipped++; continue; }

      // Tìm session gần nhất chứa card này
      const { data: found, error: qerr } = await supabase
        .from('session_cards')
        .select('session_id, card_id, sessions!inner(id, type, created_at)')
        .eq('card_id', cardId)
        .order('created_at', { foreignTable: 'sessions', ascending: false })
        .limit(1);

      if (qerr) {
        skipped++;
        continue;
      }

      const latest = (found && found[0]) || null;
      if (latest?.session_id) {
        // Ghi đè điểm cuối
        const { error: uerr } = await supabase
          .from('session_cards')
          .update({ final: score })
          .eq('session_id', latest.session_id)
          .eq('card_id', cardId);
        if (uerr) { skipped++; continue; }
        updated++;
      } else {
        skipped++;
      }

      // Cập nhật bảng tổng hợp mức nhớ hiện tại
      const { error: lerr } = await supabase
        .from('memory_levels')
        .upsert(
          { card_id: cardId, level: score, updated_at: new Date().toISOString() },
          { onConflict: 'card_id' }
        );
      // Không làm fail toàn bộ nếu lỗi upsert
      if (lerr) {
        // eslint-disable-next-line no-console
        console.error('memory_levels upsert error:', lerr);
      }
    }

    return res.status(200).json({ ok: true, updated, skipped, using: serviceRoleKey ? 'service_role' : 'anon_key' });
  } catch (e) {
    return res.status(500).json({ error: String(e?.message || e) });
  }
}
