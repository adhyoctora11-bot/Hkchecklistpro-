// npm run seed -- admin@hotel.com PasswordKuat123   (butuh env SUPABASE_URL & SUPABASE_SERVICE_ROLE_KEY)
import { createClient } from '@supabase/supabase-js'; import bcrypt from 'bcryptjs';
const [email, pass] = process.argv.slice(2); if (!email || !pass) { console.log('usage: seed.mjs email password'); process.exit(1); }
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { error } = await db.from('users').upsert({ name: 'Super Admin', email: email.toLowerCase(), password_hash: await bcrypt.hash(pass, 10), role: 'Super Admin', department: 'Management', status: 'Active' }, { onConflict: 'email' });
console.log(error ? error.message : 'Super Admin dibuat: ' + email);
