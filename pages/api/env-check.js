try { require('dotenv').config({ path: '.env.local' }); } catch {}

export default function handler(req, res) {
  res.status(200).json({
    ok: true,
    vars: {
      SUPABASE_URL: !!process.env.SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_URL: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    },
    lengths: {
      SUPABASE_URL_len: (process.env.SUPABASE_URL || '').length,
      NEXT_PUBLIC_SUPABASE_URL_len: (process.env.NEXT_PUBLIC_SUPABASE_URL || '').length,
      NEXT_PUBLIC_SUPABASE_ANON_KEY_len: (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').length,
      SUPABASE_SERVICE_ROLE_KEY_len: (process.env.SUPABASE_SERVICE_ROLE_KEY || '').length,
    },
    cwd: process.cwd(),
  });
}
