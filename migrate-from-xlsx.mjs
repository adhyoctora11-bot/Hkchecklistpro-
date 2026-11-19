// Impor SEMUA sheet CHECKLIST_HK.xlsx -> Supabase.
//   npm run migrate -- ./CHECKLIST_HK.xlsx --dry     (cek saja, tanpa menulis)
//   npm run migrate -- ./CHECKLIST_HK.xlsx           (impor sungguhan; aman diulang / idempoten)
import ExcelJS from 'exceljs'; import bcrypt from 'bcryptjs'; import { createClient } from '@supabase/supabase-js';
const file = process.argv[2], DRY = process.argv.includes('--dry');
if (!file) { console.log('usage: migrate-from-xlsx.mjs file.xlsx [--dry]'); process.exit(1); }
const db = DRY ? null : createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const p2 = (n) => String(n).padStart(2, '0');
function raw(v) { // normalisasi nilai sel exceljs
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date) return `${v.getUTCFullYear()}-${p2(v.getUTCMonth() + 1)}-${p2(v.getUTCDate())} ${p2(v.getUTCHours())}:${p2(v.getUTCMinutes())}:${p2(v.getUTCSeconds())}`;
  if (typeof v === 'object') { if ('result' in v) return raw(v.result); if ('text' in v) return raw(v.text); if (v.richText) return v.richText.map(t => t.text).join(''); return String(v); }
  return v;
}
const S = (v) => { v = raw(v); if (v === null) return null; if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(v); return String(v); };
const N = (v) => { v = raw(v); if (v === null) return null; const n = Number(v); return isNaN(n) ? null : n; };
const I = (v) => { const n = N(v); return n === null ? null : Math.round(n); };
const B = (v) => { v = raw(v); return v === true || String(v).toLowerCase() === 'true'; };
const TS = (v) => { v = raw(v); if (v === null) return null; const m = String(v).match(/^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2})(?::(\d{2}))?)?/); return m ? `${m[1]} ${m[2] || '00:00'}:${m[3] || '00'}+07` : null; };
const D = (v) => { v = raw(v); if (v === null) return null; const m = String(v).match(/^(\d{4}-\d{2}-\d{2})/); return m ? m[1] : null; };
const J = (v) => { v = raw(v); if (v === null) return {}; try { return JSON.parse(String(v)); } catch { return {}; } };
const photos = (v) => { v = raw(v); if (v === null) return []; const t = String(v).trim(); if (t.startsWith('[')) { try { const a = JSON.parse(t); if (Array.isArray(a)) return a; } catch {} } return [t]; };

const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(file);
const rows = (name) => { const ws = wb.getWorksheet(name); if (!ws) return []; const out = []; ws.eachRow({ includeEmpty: false }, (r, i) => { if (i === 1) return; const a = Array.from(r.values).slice(1); while (a.length < ws.columnCount) a.push(null); if (raw(a[0]) !== null) out.push(a); }); return out; };

const APPR = new Set(['Approved', 'Pending', 'Rejected']);
function recMap(r) { // dukung layout BARU (V..Y) dan LAMA (U..X yang bergeser 1 kolom)
  const legacy = !APPR.has(S(r[23])) && APPR.has(S(r[22]));
  const sup = legacy ? { id: S(r[20]), name: S(r[21]), st: S(r[22]), at: TS(r[23]), docf: null } : { id: S(r[21]), name: S(r[22]), st: S(r[23]) || 'Pending', at: TS(r[24]), docf: S(r[20]) };
  return { id: S(r[0]), date: D(r[1]), location_id: S(r[2]), location_name: S(r[3]), staff_id: S(r[4]), staff_name: S(r[5]), session_id: S(r[6]), item_id: S(r[7]), item_no: I(r[8]), item_name: S(r[9]), category: S(r[10]), status: S(r[11]) || 'Normal', remarks: S(r[12]), photo1: S(r[13]), photo2: S(r[14]), photo3: S(r[15]), document: S(r[16]), photo1_file_id: S(r[17]), photo2_file_id: S(r[18]), photo3_file_id: S(r[19]), document_file_id: sup.docf, supervisor_id: sup.id, supervisor_name: sup.name, approval_status: sup.st, approved_at: sup.at, created_at: TS(r[25]) };
}
const itemMap = (r) => ({ id: S(r[0]), no: I(r[1]), category: S(r[2]), item_name: S(r[3]), required: B(r[4]), status: S(r[5]) || 'Active', created_at: TS(r[6]), created_by: S(r[7]) });

const isUrl = (v) => /^https?:/i.test(S(v) || '');
function projTail(r) { // layout baru: foto(14-16), verified_at(17), verified_by(18). Baris lama: nilai bergeser -> tidak dibuang
  const x = { done_photo1: isUrl(r[14]) ? S(r[14]) : null, done_photo2: isUrl(r[15]) ? S(r[15]) : null, done_photo3: isUrl(r[16]) ? S(r[16]) : null, verified_at: null, verified_by: null, legacy_extra: null };
  const extra = [];
  [14, 15, 16].forEach(i => { if (S(r[i]) && !isUrl(r[i])) extra.push(`kolom${i + 1}=${S(r[i])}`); });
  if (TS(r[17])) { x.verified_at = TS(r[17]); x.verified_by = S(r[18]); }
  else { x.verified_by = S(r[17]) || S(r[18]); }
  if (extra.length) x.legacy_extra = extra.join('; ');
  return x;
}
// [sheet, tabel, kolom-konflik, mapper, hapus-dulu?]
const PLAN = [
  ['Users', 'users', 'id', null], // diisi di bawah (async bcrypt)
  ['Settings', 'settings', 'key', r => ({ key: S(r[0]), value: S(r[1]), updated_at: TS(r[2]) })],
  ['MenuAccess', 'menu_access', 'role,menu_id', r => ({ role: S(r[0]), menu_id: S(r[1]), allowed: B(r[2]), updated_at: TS(r[3]) })],
  ['NotificationSettings', 'notification_settings', 'module', r => ({ module: S(r[0]), email_enabled: B(r[1]), inbox_enabled: B(r[2]), updated_at: TS(r[3]) })],
  ['AppCategories', 'app_categories', null, r => ({ module: S(r[0]), category: S(r[1]), status: S(r[2]) || 'Active', sort_order: I(r[3]), updated_at: TS(r[4]) }), true],
  ['MaintenanceCategories', 'maintenance_categories', 'id', r => ({ id: S(r[0]), category: S(r[1]), status: S(r[2]), created_at: TS(r[3]) })],
  ['Locations', 'locations', 'id', r => ({ id: S(r[0]), code: S(r[1]), name: S(r[2]), floor: S(r[3]), type: S(r[4]), desc: S(r[5]), status: S(r[6]) || 'Active', created_at: TS(r[7]), created_by: S(r[8]) })],
  ['LocationCategories', 'location_categories', 'id', r => ({ id: S(r[0]), name: S(r[1]), description: S(r[2]), status: S(r[3]) || 'Active', created_at: TS(r[4]), created_by: S(r[5]) })],
  ['ChecklistItems', 'checklist_items', 'id', itemMap],
  ['RestroomItems', 'restroom_items', 'id', itemMap],
  ['Records', 'records', 'id', recMap],
  ['RestroomRecords', 'restroom_records', 'id', recMap],
  ['Photos', 'photos', 'id', r => ({ id: S(r[0]), session_id: S(r[1]), file_name: S(r[2]), file_url: S(r[3]), file_id: S(r[4]), file_type: S(r[5]), slot: S(r[6]), uploaded_by: S(r[7]), uploaded_at: TS(r[8]), record_id: S(r[9]) })],
  ['Inbox', 'inbox', 'id', r => ({ id: S(r[0]), to_email: S(r[1]), subject: S(r[2]), message: S(r[3]), type: S(r[4]), is_read: B(r[5]), session_id: S(r[6]), created_at: TS(r[7]) })],
  ['Projects', 'projects', 'id', r => ({ id: S(r[0]), title: S(r[1]), description: S(r[2]), assigned_to: S(r[3]), assigned_names: S(r[4]), created_by: S(r[5]), created_by_name: S(r[6]), status: S(r[7]) || 'Open', priority: S(r[8]) || 'Normal', due_date: D(r[9]), done_at: TS(r[10]), done_by: S(r[11]), notes: S(r[12]), created_at: TS(r[13]), ...projTail(r) })],
  ['BinCard', 'bin_card', 'id', r => ({ id: S(r[0]), article: S(r[1]), unit: S(r[2]), stok_awal: N(r[3]), total_masuk: N(r[4]), total_keluar: N(r[5]), total_stok: N(r[6]), tgl_masuk: D(r[7]), tgl_keluar: D(r[8]), remarks_keluar: S(r[9]), remarks: S(r[10]), photo_url: S(r[11]), created_by: S(r[12]), created_at: TS(r[13]), updated_at: TS(r[14]), category: S(r[15]) })],
  ['BinCardLog', 'bin_card_log', 'id', r => ({ id: S(r[0]), bin_card_id: S(r[1]), type: S(r[2]), qty: N(r[3]), date: D(r[4]), remarks: S(r[5]), stock_before: N(r[6]), stock_after: N(r[7]), user_id: S(r[8]), user_name: S(r[9]), created_at: TS(r[10]) })],
  ['LinenTypes', 'linen_types', 'id', r => ({ id: S(r[0]), linen_type: S(r[1]), status: S(r[2]) || 'Active', sort_order: I(r[3]), updated_at: TS(r[4]) })],
  ['LinenInventory', 'linen_inventory', 'id', r => ({ id: S(r[0]), linen_type: S(r[1]), total_in: I(r[2]), total_out: I(r[3]), laundry_out: I(r[4]), damaged_approved: I(r[5]), current_stock: I(r[6]), last_updated: TS(r[7]), updated_by: S(r[8]), laundry_in: I(r[9]), laundry_balance: I(r[10]) })],
  ['LinenLog', 'linen_log', 'id', r => ({ id: S(r[0]), linen_id: S(r[1]), linen_type: S(r[2]), transaction_type: S(r[3]), qty: I(r[4]), date: D(r[5]), condition: S(r[6]), remarks: S(r[7]), stock_before: I(r[8]), stock_after: I(r[9]), approval_status: S(r[10]) || 'Approved', requested_by_id: S(r[11]), requested_by_name: S(r[12]), requested_by_email: S(r[13]), created_at: TS(r[14]), decision_by_id: S(r[15]), decision_by_name: S(r[16]), decision_at: TS(r[17]), decision_source: S(r[18]) })],
  ['Maintenance', 'maintenance', 'id', r => ({ id: S(r[0]), date: D(r[1]), description: S(r[2]), location_id: S(r[3]), location_name: S(r[4]), category: S(r[5]), photo_url: S(r[6]), assigned_user_name: S(r[7]), assigned_user_email: S(r[8]), status: S(r[9]) || 'Open', estimated_date: D(r[10]), created_by_id: S(r[11]), created_by_name: S(r[12]), created_by_email: S(r[13]), created_at: TS(r[14]), updated_at: TS(r[15]), progress_at: TS(r[16]), completed_at: TS(r[17]), status_source: S(r[18]) })],
  ['EngineeringUsers', 'engineering_users', 'email', r => ({ name: S(r[0]), email: S(r[1])?.toLowerCase(), status: S(r[2]) || 'Active', created_at: TS(r[3]) })],
  ['WasteHousekeeping', 'waste_housekeeping', 'id', r => ({ id: S(r[0]), date_time: TS(r[1]), occupancy: I(r[2]), mice: I(r[3]), waste_qty: N(r[4]), unit: S(r[5]), photo_urls: photos(r[6]), remarks: S(r[7]), created_by: S(r[8]), created_by_name: S(r[9]), created_at: TS(r[10]), updated_at: TS(r[11]), waste_item: S(r[12]) })],
  ['WasteKitchen', 'waste_kitchen', 'id', r => ({ id: S(r[0]), date_time: TS(r[1]), meal_period: S(r[2]), waste_qty: N(r[3]), occupancy: I(r[4]), mice: I(r[5]), unit: S(r[6]), photo_urls: photos(r[7]), remarks: S(r[8]), created_by: S(r[9]), created_by_name: S(r[10]), created_at: TS(r[11]), updated_at: TS(r[12]), waste_item: S(r[13]) })],
  ['WasteReconcile', 'waste_reconcile', 'id', r => ({ id: S(r[0]), date_from: D(r[1]), date_to: D(r[2]), pickup_at: TS(r[3]), vendor: S(r[4]), hk_summary: J(r[5]), kitchen_summary: J(r[6]), grand_summary: J(r[7]), hk_records: I(r[8]), kitchen_records: I(r[9]), created_by: S(r[10]), created_by_name: S(r[11]), created_at: TS(r[12]), updated_at: TS(r[13]), approval_status: S(r[14]) || 'Pending', decision_by_id: S(r[15]), decision_by_name: S(r[16]), decision_at: TS(r[17]), decision_source: S(r[18]) })],
  ['Units', 'waste_units', 'unit', r => ({ unit: S(r[1]), status: S(r[2]) || 'Active' })],
  ['WasteUnits', 'waste_units', 'unit', r => ({ unit: S(r[1]), status: S(r[2]) || 'Active' })],
  ['Vendor', 'waste_vendors', 'vendor', r => ({ vendor: S(r[1]), status: S(r[2]) || 'Active' })],
  ['WasteVendors', 'waste_vendors', 'vendor', r => ({ vendor: S(r[1]), status: S(r[2]) || 'Active' })],
];
const dedupe = (arr, key) => { const m = new Map(); arr.forEach(x => m.set(key.split(',').map(k => x[k]).join('|'), x)); return [...m.values()]; };

const report = [];
for (const [sheet, table, conflict, mapper, wipe] of PLAN) {
  const src = rows(sheet);
  let data;
  if (sheet === 'Users') data = await Promise.all(src.map(async r => ({ id: S(r[0]), name: S(r[1]), email: S(r[2])?.trim().toLowerCase(), password_hash: await bcrypt.hash(S(r[3]) || 'ChangeMe123', 10), role: S(r[4]) || 'Staff', department: S(r[5]), phone: S(r[6]), avatar: S(r[7]), status: S(r[8]) || 'Active', created_at: TS(r[9]), last_login: TS(r[10]) })));
  else data = src.map(mapper);
  if (conflict && conflict !== 'id') data = dedupe(data, conflict);
  if (DRY) { report.push([sheet, table, src.length, data.length]); if (['Records', 'Users', 'WasteReconcile', 'Projects'].includes(sheet)) console.log(sheet, JSON.stringify({ ...data[0], password_hash: data[0].password_hash ? '<bcrypt>' : undefined }).slice(0, 600)); continue; }
  if (wipe) { const { error } = await db.from(table).delete().gte('id', 0); if (error) throw new Error(table + ' wipe: ' + error.message); }
  const size = ['inbox'].includes(table) ? 150 : 500;
  for (let i = 0; i < data.length; i += size) {
    const chunk = data.slice(i, i + size);
    const q = conflict ? db.from(table).upsert(chunk, { onConflict: conflict }) : db.from(table).insert(chunk);
    const { error } = await q; if (error) throw new Error(`${table} baris ${i}: ${error.message}`);
    process.stdout.write(`\r${table}: ${Math.min(i + size, data.length)}/${data.length}      `);
  }
  console.log(`\r${table}: ${data.length} baris OK            `);
  report.push([sheet, table, src.length, data.length]);
}
console.log('\nSheet → Tabel | baris sheet | baris diimpor' + (DRY ? ' (dry-run)' : ''));
for (const [s, t, a, b] of report) console.log(`${s.padEnd(22)}→ ${t.padEnd(24)} ${String(a).padStart(6)} ${String(b).padStart(6)}`);
if (!DRY) { console.log('\nVerifikasi jumlah baris di database:'); for (const t of [...new Set(PLAN.map(x => x[1]))]) { const { count } = await db.from(t).select('*', { count: 'exact', head: true }); console.log(t.padEnd(24), count); } }
