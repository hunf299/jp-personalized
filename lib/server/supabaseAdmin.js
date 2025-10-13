// lib/supabase.js
// Dùng trong API routes (server) để truy DB bằng Service Role Key.
// Nếu bạn chỉ có NEXT_PUBLIC_* thì vẫn fallback.

import { createClient } from '@supabase/supabase-js';

const URL =
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    '';

const SERVICE_ROLE_KEY =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY || // fallback tên khác nếu bạn dùng
    '';

if (!URL || !SERVICE_ROLE_KEY) {
    // Log rõ ràng trên server; trả lỗi gọn cho client
    console.error('[supabase] Missing env: SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY');
}

/**
 * Client dành cho server (API routes) — có quyền bypass RLS.
 * TUYỆT ĐỐI KHÔNG import file này từ client-side (pages/components).
 */
export const supabase = createClient(URL, SERVICE_ROLE_KEY, {
    auth: {
        persistSession: false,
        autoRefreshToken: false,
    },
    global: {
        headers: { 'X-Client-Info': 'jp-personalized-app/server' },
    },
});
