import { NextResponse } from 'next/server';
import A from '@/lib/actions';
export const runtime = 'nodejs';
export const maxDuration = 30;
export async function POST(req: Request) {
  try {
    const { action, payload } = await req.json();
    const h = (A as any)[action];
    if (!h) return NextResponse.json({ success: false, message: `Aksi "${action}" belum dimigrasi ke Supabase.` });
    return NextResponse.json(await h(payload || {}));
  } catch (e: any) { return NextResponse.json({ success: false, message: e.message }); }
}
