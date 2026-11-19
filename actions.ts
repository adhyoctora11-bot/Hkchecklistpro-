import bcrypt from 'bcryptjs';
import { db, ok, fail, s, fetchAll, BUCKET } from './db';
import { DEFAULT_MENU } from './menu';
type H = (p: any) => Promise<any>;
const sheetDate = (v: any) => s(v).slice(0, 10);

async function menuFor(role: string) {
  const { data } = await db.from('menu_access').select('menu_id,allowed').eq('role', role);
  let list = (data || []).filter((r: any) => r.allowed).map((r: any) => r.menu_id);
  if (!list.length) list = (DEFAULT_MENU[role] || []).slice();
  for (const m of ['dashboard', 'linen', 'profile']) if (!list.includes(m)) list.push(m);
  if (['Admin', 'Super Admin'].includes(role) && !list.includes('settings')) list.push('settings');
  if (['Supervisor', 'Manager', 'Admin', 'Super Admin'].includes(role) && !list.includes('approval')) list.push('approval');
  return list;
}
const userOut = (u: any, menuAccess: string[]) => ({ id: u.id, name: s(u.name), email: s(u.email), role: u.role || 'Staff', department: s(u.department), phone: s(u.phone), avatar: s(u.avatar), menuAccess });

const A: Record<string, H> = {
  async login(p) {
    const email = s(p.email).trim().toLowerCase();
    const { data: u } = await db.from('users').select('*').ilike('email', email).maybeSingle();
    if (!u) return fail('Email atau password salah.');
    if (u.status === 'Pending') return fail('Akun Anda masih menunggu aktivasi Super Admin.');
    if (u.status === 'Rejected') return fail('Pendaftaran akun Anda telah ditolak. Silakan hubungi administrator.');
    if (u.status !== 'Active') return fail('Akun Anda tidak aktif. Silakan hubungi administrator.');
    if (!p.googleLogin && !(await bcrypt.compare(s(p.password), s(u.password_hash)))) return fail('Email atau password salah.');
    await db.from('users').update({ last_login: new Date().toISOString() }).eq('id', u.id);
    return ok({ user: userOut(u, await menuFor(u.role)) });
  },
  async register(p) {
    const email = s(p.email).trim().toLowerCase();
    const { data: ex } = await db.from('users').select('id').ilike('email', email).maybeSingle();
    if (ex) return fail('Email sudah terdaftar.');
    const { error } = await db.from('users').insert({ name: s(p.name).trim(), email, password_hash: await bcrypt.hash(s(p.password), 10), role: 'Staff', department: p.department || 'Housekeeping', phone: p.phone || '', status: 'Pending' });
    if (error) return fail(error.message);
    return ok({ pendingActivation: true, message: 'Registrasi berhasil. Akun Anda menunggu aktivasi Super Admin sebelum dapat login.' });
  },
  async forgotPassword() { return fail('Reset password via email belum dimigrasi. Hubungi Admin.'); },
  async getUsers() {
    const { data, error } = await db.from('users').select('*').order('created_at'); if (error) return fail(error.message);
    return ok({ data: data!.map((u: any) => ({ id: u.id, name: s(u.name), email: s(u.email), role: u.role, department: s(u.department), phone: s(u.phone), status: u.status, createdAt: s(u.created_at), lastLogin: s(u.last_login) })) });
  },
  async saveUser(d) {
    const row: any = { name: d.name, email: s(d.email).trim().toLowerCase(), role: d.role, department: d.department || '', phone: d.phone || '', status: d.status || 'Active' };
    if (d.password) row.password_hash = await bcrypt.hash(d.password, 10);
    const r = d.id ? await db.from('users').update(row).eq('id', d.id) : await db.from('users').insert({ ...row, password_hash: row.password_hash || await bcrypt.hash('Pass@123', 10) });
    return r.error ? fail(r.error.message) : ok({ message: 'Pengguna berhasil disimpan.' });
  },
  async deleteUser(p) { await db.from('users').update({ status: 'Inactive' }).eq('id', p.id); return ok(); },
  async updateProfile(d) {
    const row: any = {}; if (d.name) row.name = d.name; if (d.department) row.department = d.department; if (d.phone !== undefined) row.phone = d.phone; if (d.avatar) row.avatar = d.avatar;
    if (d.password) row.password_hash = await bcrypt.hash(d.password, 10);
    const { error } = await db.from('users').update(row).eq('id', d.id);
    return error ? fail(error.message) : ok({ message: 'Profil diperbarui.' });
  },
  async getPublicAppConfig() {
    const { data } = await db.from('settings').select('*'); const m: any = {}; (data || []).forEach((r: any) => (m[r.key] = r.value));
    return ok({ data: { appName: m.app_name || 'HK Checklist Pro', companyName: m.company_name || m.hotel_name || 'Hotel' } });
  },
  async getSettings() { const { data } = await db.from('settings').select('*'); const m: any = {}; (data || []).forEach((r: any) => (m[r.key] = r.value)); return ok({ data: m }); },
  async checkDatabaseConnection() { const t = Date.now(); const { error } = await db.from('users').select('id').limit(1); return error ? { success: false, connected: false, message: error.message } : { success: true, connected: true, spreadsheetName: 'Supabase', latencyMs: Date.now() - t }; },
  async getLocations(p) {
    let q = db.from('locations').select('*').order('code'); if (p?.status) q = q.eq('status', p.status);
    const { data, error } = await q; if (error) return fail(error.message);
    return ok({ data: data!.map((r: any) => ({ id: r.id, code: s(r.code), name: s(r.name), floor: s(r.floor), type: s(r.type), desc: s(r.desc), status: r.status })) });
  },
  async saveLocation(d) {
    const row = { code: d.code, name: d.name, floor: d.floor, type: d.type, desc: d.desc || '', status: d.status || 'Active' };
    const r = d.id ? await db.from('locations').update(row).eq('id', d.id) : await db.from('locations').insert({ ...row, created_by: d.createdBy || '' });
    return r.error ? fail(r.error.message) : ok({ message: d.id ? 'Lokasi diperbarui.' : 'Lokasi ditambahkan.' });
  },
  async deleteLocation(p) { await db.from('locations').update({ status: 'Inactive' }).eq('id', p.id); return ok(); },
  async getLocCategories() { const { data } = await db.from('location_categories').select('*').order('created_at'); return ok({ data: (data || []).map((r: any) => ({ id: r.id, name: s(r.name), description: s(r.description), status: r.status, createdAt: s(r.created_at) })) }); },
  async saveLocCategory(d) { const row = { name: d.name, description: d.description || '', status: d.status || 'Active' }; const r = d.id ? await db.from('location_categories').update(row).eq('id', d.id) : await db.from('location_categories').insert({ ...row, created_by: d.createdBy || '' }); return r.error ? fail(r.error.message) : ok({ message: 'Kategori disimpan.' }); },
  async deleteLocCategory(p) { await db.from('location_categories').update({ status: 'Inactive' }).eq('id', p.id); return ok({ message: 'Kategori dinonaktifkan.' }); },
  async getChecklistItems() { return itemsOf('checklist_items', true); },
  async getAllChecklistItems() { return itemsOf('checklist_items', false); },
  async saveChecklistItem(d) { return saveItem('checklist_items', d); },
  async deleteChecklistItem(p) { await db.from('checklist_items').update({ status: 'Inactive' }).eq('id', p.id); return ok({ message: 'Item dinonaktifkan.' }); },
  async getRestroomItems() { return itemsOf('restroom_items', true); },
  async getAllRestroomItems() { return itemsOf('restroom_items', false); },
  async saveRestroomItem(d) { return saveItem('restroom_items', d); },
  async deleteRestroomItem(p) { await db.from('restroom_items').update({ status: 'Inactive' }).eq('id', p.id); return ok(); },
  async submitChecklist(p) { return submit('records', p); },
  async submitRestroomChecklist(p) { return submit('restroom_records', p); },
  async getSessionSummary(f) { return summary('records', f || {}); },
  async getRestroomSessionSummary(f) { return summary('restroom_records', f || {}); },
  async getSessionDetail(p) { return detail('records', p.sessionId); },
  async getRestroomSessionDetail(p) { return detail('restroom_records', p.sessionId); },
  async approveChecklist(p) { return approve('records', p); },
  async approveRestroomChecklist(p) { return approve('restroom_records', p); },
  async getInbox(p) {
    const { data } = await db.from('inbox').select('*').ilike('to_email', s(p?.email)).order('created_at', { ascending: false }).limit(100);
    return ok({ data: (data || []).map((r: any) => ({ id: r.id, to: r.to_email, subject: r.subject, message: r.message, type: r.type || 'System', isRead: !!r.is_read, sessionId: s(r.session_id), createdAt: s(r.created_at), actionStatus: '' })) });
  },
  async markInboxRead(p) { await db.from('inbox').update({ is_read: true }).eq('id', p.id); return ok(); },
  async uploadFile(p) {
    const path = `${s(p.sessionId) || 'misc'}/${Date.now()}_${s(p.name).replace(/[^\w.\-]/g, '_')}`;
    const { error } = await db.storage.from(BUCKET).upload(path, Buffer.from(p.data, 'base64'), { contentType: p.type, upsert: false });
    if (error) return fail(error.message);
    const url = db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
    await db.from('photos').insert({ session_id: p.sessionId, file_name: p.name, file_url: url, file_id: path, file_type: p.type, slot: p.slot, uploaded_by: p.uploader });
    return ok({ url, downloadUrl: url, fileId: path, fileName: p.name });
  },
};

async function itemsOf(table: string, onlyActive: boolean) {
  let q = db.from(table).select('*').order('no'); if (onlyActive) q = q.eq('status', 'Active');
  const { data, error } = await q; if (error) return fail(error.message);
  return ok({ data: data!.map((r: any) => ({ id: r.id, no: r.no || 0, category: s(r.category), name: s(r.item_name), required: !!r.required, status: r.status, createdAt: s(r.created_at), createdBy: s(r.created_by) })) });
}
async function saveItem(table: string, d: any) {
  const row: any = { no: d.no, category: d.category, item_name: d.name, required: d.required === true || d.required === 'true' };
  if (d.id) { row.status = d.status || 'Active'; const { error } = await db.from(table).update(row).eq('id', d.id); return error ? fail(error.message) : ok({ message: 'Item diperbarui.' }); }
  if (!row.no) { const { data } = await db.from(table).select('no').order('no', { ascending: false }).limit(1); row.no = ((data && data[0]?.no) || 0) + 1; }
  const { error } = await db.from(table).insert({ ...row, created_by: d.createdBy || '' });
  return error ? fail(error.message) : ok({ message: 'Item ditambahkan.' });
}
async function submit(table: string, p: any) {
  const sid = p.sessionId || crypto.randomUUID(); const items = p.items || [];
  const rows = items.map((i: any) => ({ date: p.date, location_id: p.locationId, location_name: p.locationName, staff_id: p.staffId, staff_name: p.staffName, session_id: sid, item_id: i.itemId, item_no: i.itemNo, item_name: i.itemName, category: i.category, status: i.status || 'Normal', remarks: i.remarks || '', photo1: i.photo1 || '', photo2: i.photo2 || '', photo3: i.photo3 || '', document: i.document || '', approval_status: 'Pending' }));
  const { error } = await db.from(table).insert(rows); if (error) return fail(error.message);
  const abn = items.filter((i: any) => ['Tidak Berfungsi', 'Mati', 'Lainnya'].includes(i.status)).length;
  return ok({ message: abn ? `Checklist disimpan. ${abn} item abnormal terdeteksi.` : 'Checklist berhasil disimpan. Menunggu approval Supervisor.', sessionId: sid, abnormalCount: abn });
}
async function summary(table: string, f: any) {
  const rows = await fetchAll(table, 'date,location_id,location_name,staff_id,staff_name,session_id,status,approval_status,supervisor_name,approved_at', (q) => {
    if (f.dateFrom) q = q.gte('date', f.dateFrom); if (f.dateTo) q = q.lte('date', f.dateTo);
    if (f.locationId) q = q.eq('location_id', f.locationId); if (f.staffId) q = q.eq('staff_id', f.staffId); return q;
  });
  const m: Record<string, any> = {};
  for (const r of rows) {
    const x = (m[r.session_id] ||= { sessionId: r.session_id, date: sheetDate(r.date), locationName: s(r.location_name), staffName: s(r.staff_name), approvalStatus: 'Approved', supervisorName: '', approvedAt: '', total: 0, normal: 0, damage: 0, other: 0, normalCount: 0, abnormalCount: 0, otherCount: 0 });
    x.total++; const st = r.status;
    if (st === 'Normal') { x.normal++; x.normalCount++; } else if (st === 'Tidak Berfungsi' || st === 'Mati') { x.damage++; x.abnormalCount++; } else { x.other++; x.otherCount++; }
    if (r.approval_status === 'Approved') { x.supervisorName ||= s(r.supervisor_name); x.approvedAt ||= s(r.approved_at); } else x.approvalStatus = 'Pending';
  }
  let out: any[] = Object.values(m); if (f.approvalStatus) out = out.filter((x) => x.approvalStatus === f.approvalStatus);
  out.sort((a, b) => b.date.localeCompare(a.date)); if (f.limit) out = out.slice(0, Number(f.limit));
  return ok({ data: out });
}
async function detail(table: string, sid: string) {
  const { data, error } = await db.from(table).select('*').eq('session_id', sid).order('item_no');
  if (error || !data?.length) return fail('Sesi tidak ditemukan.', { data: { sessionInfo: null, records: [] } });
  const r0 = data[0]; const pending = data.some((r: any) => r.approval_status !== 'Approved');
  return ok({ data: { sessionInfo: { sessionId: sid, date: sheetDate(r0.date), locationName: s(r0.location_name), staffName: s(r0.staff_name), approvalStatus: pending ? 'Pending' : 'Approved', supervisorName: s(r0.supervisor_name), approvedAt: s(r0.approved_at) }, records: data.map((r: any) => ({ itemNo: r.item_no, itemName: s(r.item_name), category: s(r.category), status: r.status, remarks: s(r.remarks), photo1: s(r.photo1), photo2: s(r.photo2), photo3: s(r.photo3), document: s(r.document) })) } });
}
async function approve(table: string, p: any) {
  const { data, error } = await db.from(table).update({ supervisor_id: p.supervisorId, supervisor_name: p.supervisorName, approval_status: 'Approved', approved_at: new Date().toISOString() }).eq('session_id', p.sessionId).select('id');
  return error ? fail(error.message) : ok({ message: `${data?.length || 0} item berhasil di-approve.`, count: data?.length || 0 });
}
export default A;
