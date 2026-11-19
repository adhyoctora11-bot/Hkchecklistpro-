-- Jalankan di Supabase > SQL Editor
create table if not exists users(id text primary key default gen_random_uuid()::text,name text,email text unique not null,password_hash text,role text default 'Staff',department text,phone text,avatar text,status text default 'Pending',created_at timestamptz default now(),last_login timestamptz);
create table if not exists locations(id text primary key default gen_random_uuid()::text,code text,name text,floor text,type text,"desc" text,status text default 'Active',created_at timestamptz default now(),created_by text);
create table if not exists location_categories(id text primary key default gen_random_uuid()::text,name text,description text,status text default 'Active',created_at timestamptz default now(),created_by text);
create table if not exists checklist_items(id text primary key default gen_random_uuid()::text,no int,category text,item_name text,required boolean default true,status text default 'Active',created_at timestamptz default now(),created_by text);
create table if not exists restroom_items(like checklist_items including all);
create table if not exists records(id text primary key default gen_random_uuid()::text,date text,location_id text,location_name text,staff_id text,staff_name text,session_id text,item_id text,item_no int,item_name text,category text,status text default 'Normal',remarks text,photo1 text,photo2 text,photo3 text,document text,supervisor_id text,supervisor_name text,approval_status text default 'Pending',approved_at timestamptz,created_at timestamptz default now());
create index if not exists records_session on records(session_id);
create table if not exists restroom_records(like records including all);
create table if not exists photos(id text primary key default gen_random_uuid()::text,session_id text,file_name text,file_url text,file_id text,file_type text,slot text,uploaded_by text,uploaded_at timestamptz default now());
create table if not exists inbox(id text primary key default gen_random_uuid()::text,to_email text,subject text,message text,type text,is_read boolean default false,session_id text,created_at timestamptz default now());
create table if not exists settings(key text primary key,value text,updated_at timestamptz default now());
create table if not exists menu_access(role text,menu_id text,allowed boolean default true,primary key(role,menu_id));
create table if not exists notification_settings(module text primary key,email_enabled boolean default true,inbox_enabled boolean default true);
create table if not exists app_categories(id bigserial primary key,module text,category text,status text default 'Active',sort_order int default 0);
create table if not exists projects(id text primary key default gen_random_uuid()::text,title text,description text,assigned_to text,assigned_names text,created_by text,created_by_name text,status text default 'Open',priority text default 'Normal',due_date text,done_at timestamptz,done_by text,notes text,created_at timestamptz default now(),done_photo1 text,done_photo2 text,done_photo3 text,verified_at timestamptz,verified_by text);
create table if not exists bin_card(id text primary key default gen_random_uuid()::text,article text,unit text,category text,stok_awal numeric default 0,total_masuk numeric default 0,total_keluar numeric default 0,total_stok numeric default 0,tgl_masuk date,tgl_keluar date,remarks_keluar text,remarks text,photo_url text,created_by text,created_at timestamptz default now(),updated_at timestamptz default now());
create table if not exists bin_card_log(id text primary key default gen_random_uuid()::text,bin_card_id text references bin_card(id) on delete cascade,type text,qty numeric,date date,remarks text,stock_before numeric,stock_after numeric,user_id text,user_name text,created_at timestamptz default now());
create table if not exists linen_types(id text primary key default gen_random_uuid()::text,linen_type text unique,status text default 'Active',sort_order int default 0);
create table if not exists linen_inventory(id text primary key default gen_random_uuid()::text,linen_type text unique,total_in int default 0,total_out int default 0,laundry_out int default 0,damaged_approved int default 0,current_stock int default 0,laundry_in int default 0,laundry_balance int default 0,last_updated timestamptz default now(),updated_by text);
create table if not exists linen_log(id text primary key default gen_random_uuid()::text,linen_id text,linen_type text,transaction_type text,qty int,date date,condition text,remarks text,stock_before int,stock_after int,approval_status text default 'Approved',requested_by_id text,requested_by_name text,requested_by_email text,created_at timestamptz default now(),decision_by_id text,decision_by_name text,decision_at timestamptz,decision_source text);
create table if not exists waste_housekeeping(id text primary key default gen_random_uuid()::text,date_time timestamptz,occupancy int,mice int,waste_qty numeric,unit text,photo_urls jsonb default '[]',remarks text,created_by text,created_by_name text,created_at timestamptz default now(),updated_at timestamptz default now(),waste_item text);
create table if not exists waste_kitchen(like waste_housekeeping including all);
alter table waste_kitchen add column if not exists meal_period text;
create table if not exists waste_reconcile(id text primary key default gen_random_uuid()::text,date_from date,date_to date,pickup_at timestamptz,vendor text,hk_summary jsonb,kitchen_summary jsonb,grand_summary jsonb,hk_records int,kitchen_records int,created_by text,created_by_name text,created_at timestamptz default now(),approval_status text default 'Pending',decision_by_id text,decision_by_name text,decision_at timestamptz,decision_source text);
create table if not exists waste_units(id bigserial primary key,unit text unique,status text default 'Active');
create table if not exists waste_vendors(id bigserial primary key,vendor text unique,status text default 'Active');
create table if not exists engineering_users(email text primary key,name text,status text default 'Active');
create table if not exists maintenance(id text primary key default gen_random_uuid()::text,date date,description text,location_id text,location_name text,category text,photo_url text,assigned_user_name text,assigned_user_email text,status text default 'Open',estimated_date date,created_by_id text,created_by_name text,created_by_email text,created_at timestamptz default now(),updated_at timestamptz default now(),progress_at timestamptz,completed_at timestamptz,status_source text);
-- RLS aktif tanpa policy: hanya service-role (server Next.js) yang bisa akses; browser tidak bisa langsung
do $$ declare t text; begin for t in select tablename from pg_tables where schemaname='public' loop execute format('alter table %I enable row level security',t); end loop; end $$;
insert into storage.buckets(id,name,public) values('hk-files','hk-files',true) on conflict do nothing;
insert into waste_units(unit) values ('Pcs'),('Pack'),('Bottle'),('Gram'),('Kg'),('Liter'),('Mililiter'),('Pail'),('Galon'),('Kaleng'),('Karton'),('Other') on conflict do nothing;
insert into waste_vendors(vendor) values ('Mapanji Gumilang') on conflict do nothing;
insert into location_categories(name) select unnest(array['Deluxe Room','Suite','Standard Room','Public Area','F&B Area','Back Office','Other']) where not exists(select 1 from location_categories);

-- ===== PATCH (sudah ikut dijalankan di migrasi hk_base_schema) =====
alter table records add column if not exists photo1_file_id text, add column if not exists photo2_file_id text, add column if not exists photo3_file_id text, add column if not exists document_file_id text;
alter table restroom_records add column if not exists photo1_file_id text, add column if not exists photo2_file_id text, add column if not exists photo3_file_id text, add column if not exists document_file_id text;
alter table photos add column if not exists record_id text;
alter table linen_types add column if not exists updated_at timestamptz;
alter table app_categories add column if not exists updated_at timestamptz;
alter table waste_reconcile add column if not exists updated_at timestamptz;
alter table engineering_users add column if not exists created_at timestamptz;
alter table menu_access add column if not exists updated_at timestamptz;
alter table notification_settings add column if not exists updated_at timestamptz;
create table if not exists maintenance_categories(id text primary key,category text,status text,created_at timestamptz);
alter table projects add column if not exists legacy_extra text;
