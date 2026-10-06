-- AH Student Hub: application process. Run in Supabase SQL editor.
create extension if not exists pg_cron;
create extension if not exists pg_net;

create table profiles(id uuid primary key references auth.users on delete cascade,
  full_name text, phone text, created_at timestamptz default now());
create function handle_new_user() returns trigger language plpgsql security definer as $$
begin insert into profiles(id,full_name,phone) values(new.id,new.raw_user_meta_data->>'full_name',new.raw_user_meta_data->>'phone'); return new; end $$;
create trigger on_signup after insert on auth.users for each row execute function handle_new_user();

create table intakes(id uuid primary key default gen_random_uuid(), label text not null,
  year int not null, month int not null, opens_at timestamptz, closes_at timestamptz, is_active bool default true);
create table courses(code text primary key, name text not null, category text not null, fee_ngn int not null, is_active bool default true);
create table intake_counters(intake_id uuid primary key references intakes, last_serial int not null default 0);

create table applications(id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id), intake_id uuid not null references intakes,
  status text not null default 'pending_payment' check(status in('pending_payment','paid','submitted','under_review','approved','rejected','expired')),
  total_ngn int not null, student_id text unique, form_data jsonb, passport_path text,
  idempotency_key text unique, pay_reference text unique, pay_bank text, pay_account text,
  created_at timestamptz default now(), paid_at timestamptz, submitted_at timestamptz);
create unique index one_live_app on applications(user_id,intake_id) where status not in('expired','rejected');
create table application_courses(application_id uuid references applications on delete cascade,
  course_code text references courses, fee_ngn int not null, primary key(application_id,course_code));
create table payments(id uuid primary key default gen_random_uuid(), application_id uuid references applications,
  reference text unique, expected_ngn int, paid_ngn int, raw_event jsonb, paid_at timestamptz default now());
create table sheet_outbox(id bigserial primary key, application_id uuid, done bool default false,
  attempts int default 0, last_error text, created_at timestamptz default now());

create function next_student_id(p_intake uuid) returns text language plpgsql as $$
declare s int; y int; m int; begin
  insert into intake_counters(intake_id) values(p_intake) on conflict do nothing;
  update intake_counters set last_serial=last_serial+1 where intake_id=p_intake returning last_serial into s;
  select year%100, month into y,m from intakes where id=p_intake;
  return 'AHCT'||lpad(y::text,2,'0')||m::text||lpad(s::text,4,'0'); end $$;

create function queue_sheet() returns trigger language plpgsql as $$
begin insert into sheet_outbox(application_id) values(new.id); return new; end $$;
create trigger app_to_sheet after insert or update of status on applications for each row execute function queue_sheet();

-- RLS: browser can only READ its own rows; every write goes through Edge Functions.
alter table profiles enable row level security; alter table applications enable row level security;
alter table application_courses enable row level security; alter table payments enable row level security;
alter table intakes enable row level security; alter table courses enable row level security;
alter table intake_counters enable row level security; alter table sheet_outbox enable row level security;
create policy own_profile on profiles for select using(id=auth.uid());
create policy own_app on applications for select using(user_id=auth.uid());
create policy own_ac on application_courses for select using(exists(select 1 from applications a where a.id=application_id and a.user_id=auth.uid()));
create policy read_intakes on intakes for select using(true);
create policy read_courses on courses for select using(true);

-- Passport bucket: private, 100 KB, jpeg/png, only after payment, only in own folder.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('passports','passports',false,102400,array['image/jpeg','image/png']) on conflict(id) do nothing;
create policy pp_write on storage.objects for insert to authenticated with check(bucket_id='passports'
  and (storage.foldername(name))[1]=auth.uid()::text
  and exists(select 1 from applications a where a.user_id=auth.uid() and a.id::text=(storage.foldername(name))[2] and a.status='paid'));
create policy pp_update on storage.objects for update to authenticated using(bucket_id='passports'
  and (storage.foldername(name))[1]=auth.uid()::text);

-- Expire unpaid applications after 48h.
select cron.schedule('expire-unpaid','0 * * * *',$$update applications set status='expired' where status='pending_payment' and created_at<now()-interval '48 hours'$$);
-- Sheet sync every minute: run once after deploying (replace <ref> and <SERVICE_ROLE_KEY>):
-- select cron.schedule('sheet-sync','* * * * *',$$select net.http_post('https://<ref>.supabase.co/functions/v1/sheet-sync',headers:='{"Authorization":"Bearer <SERVICE_ROLE_KEY>"}'::jsonb)$$);

-- Seed: EDIT to your real course codes, fees and intakes.
insert into courses(code,name,category,fee_ngn) values
('ACAD1','AutoCAD','Beginner',30000),('ACAD2','AutoCAD','Intermediate',40000),
('RVT1','Revit','Beginner',50000),('GRD1','Graphic Design','Beginner',30000) on conflict do nothing;
insert into intakes(label,year,month,opens_at,closes_at) values('October 2026',2026,10,now(),now()+interval '30 days');
