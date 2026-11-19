import { createClient } from '@supabase/supabase-js';
export const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
export const BUCKET = process.env.STORAGE_BUCKET || 'hk-files';
export const ok = (x: any = {}) => ({ success: true, ...x });
export const fail = (message: string, x: any = {}) => ({ success: false, message, ...x });
export const s = (v: any) => (v === null || v === undefined ? '' : String(v));
// Supabase membatasi 1000 baris/request -> ambil semua dengan paging
export async function fetchAll(table: string, cols = '*', build?: (q: any) => any) {
  const out: any[] = []; const size = 1000;
  for (let from = 0; ; from += size) {
    let q: any = db.from(table).select(cols).range(from, from + size - 1);
    if (build) q = build(q);
    const { data, error } = await q; if (error) throw error;
    out.push(...(data || [])); if (!data || data.length < size) break;
  }
  return out;
}
