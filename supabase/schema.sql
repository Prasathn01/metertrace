-- MeterTrace database schema (Supabase / PostgreSQL 17)
-- All access goes through the "api" Edge Function using the service role.
-- Browser clients (anon / authenticated) have no direct table access.

create table if not exists users (
  id text primary key,
  email text unique not null,
  name text not null,
  role text not null check (role in ('installer','store','recycler','regulator')),
  org text not null,
  recycler_id text,
  salt text not null,
  pw_hash text not null
);

create table if not exists sessions (
  token text primary key,
  user_id text not null references users(id),
  expires_at timestamptz not null
);

create table if not exists recyclers (
  id text primary key,
  name text not null,
  state text not null,
  reg_no text not null,
  capacity_tpa int not null default 0,
  status text not null default 'pending' check (status in ('approved','pending','suspended'))
);

create table if not exists settings (
  id int primary key default 1 check (id = 1),
  data jsonb not null
);

-- The ledger: every business event is one row. Append-only, hash-chained.
create table if not exists records (
  seq bigint primary key,
  kind text not null,
  ref text not null,
  payload jsonb not null,
  corrects bigint references records(seq),
  created_by text not null,
  created_role text not null,
  created_at timestamptz not null,
  prev_hash text not null,
  hash text not null
);
create index if not exists records_ref_idx on records(ref);

create table if not exists alerts (
  id bigserial primary key,
  rule text not null,
  ref text not null,
  detail text not null,
  state text,
  division text,
  status text not null default 'open' check (status in ('open','under_review','closed')),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (rule, ref)
);

create table if not exists tamper_log (
  seq bigint primary key,
  original_payload jsonb not null
);

-- Hash of one record = SHA-256 over its fields + the previous record's hash
create or replace function mt_record_hash(
  p_seq bigint, p_kind text, p_ref text, p_payload jsonb, p_corrects bigint,
  p_by text, p_role text, p_at timestamptz, p_prev text
) returns text language sql stable set search_path = public as $$
  select encode(sha256(convert_to(concat_ws('|',
    p_seq::text, p_kind, p_ref, p_payload::text, coalesce(p_corrects::text, ''),
    p_by, p_role, to_char(p_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US'), p_prev
  ), 'UTF8')), 'hex')
$$;

-- Append one or more records atomically, chaining hashes. Serialised by an advisory lock.
create or replace function mt_append(p_items jsonb) returns setof records
language plpgsql security definer set search_path = public as $$
declare
  it jsonb; v_prev text; v_seq bigint; v_at timestamptz; r records;
begin
  perform pg_advisory_xact_lock(7701);
  select hash, seq into v_prev, v_seq from records order by seq desc limit 1;
  if v_prev is null then v_prev := repeat('0', 64); v_seq := 0; end if;
  for it in select value from jsonb_array_elements(p_items) loop
    v_seq := v_seq + 1;
    v_at := date_trunc('milliseconds', clock_timestamp());
    insert into records (seq, kind, ref, payload, corrects, created_by, created_role, created_at, prev_hash, hash)
    values (v_seq, it->>'kind', it->>'ref', it->'payload', (it->>'corrects')::bigint, it->>'by', it->>'role', v_at, v_prev,
            mt_record_hash(v_seq, it->>'kind', it->>'ref', it->'payload', (it->>'corrects')::bigint, it->>'by', it->>'role', v_at, v_prev))
    returning * into r;
    v_prev := r.hash;
    return next r;
  end loop;
end $$;

-- Walk the chain and report the first broken record
create or replace function mt_verify() returns jsonb
language plpgsql security definer set search_path = public as $$
declare r records; v_prev text := repeat('0', 64); n int := 0; calc text;
begin
  for r in select * from records order by seq loop
    n := n + 1;
    if r.prev_hash <> v_prev then
      return jsonb_build_object('ok', false, 'checked', n, 'total', (select count(*) from records), 'broken_seq', r.seq,
        'kind', r.kind, 'ref', r.ref, 'reason', 'Its link to the previous record does not match');
    end if;
    calc := mt_record_hash(r.seq, r.kind, r.ref, r.payload, r.corrects, r.created_by, r.created_role, r.created_at, r.prev_hash);
    if calc <> r.hash then
      return jsonb_build_object('ok', false, 'checked', n, 'total', (select count(*) from records), 'broken_seq', r.seq,
        'kind', r.kind, 'ref', r.ref, 'reason', 'Its contents were changed after it was saved',
        'stored_hash', r.hash, 'recomputed_hash', calc);
    end if;
    v_prev := r.hash;
  end loop;
  return jsonb_build_object('ok', true, 'checked', n, 'total', n, 'last_hash', v_prev);
end $$;

-- Append-only guard: block UPDATE / DELETE / TRUNCATE unless a demo maintenance flag is set in this transaction
create or replace function mt_block_change() returns trigger
language plpgsql set search_path = public as $$
begin
  if coalesce(current_setting('metertrace.maintenance', true), '') = 'on' then
    if tg_op = 'DELETE' then return old; elsif tg_op = 'TRUNCATE' then return null; else return new; end if;
  end if;
  raise exception 'MeterTrace records are append-only: % is not allowed. Add a correction record instead.', tg_op;
end $$;

drop trigger if exists records_no_change on records;
create trigger records_no_change before update or delete on records
  for each row execute function mt_block_change();
drop trigger if exists records_no_truncate on records;
create trigger records_no_truncate before truncate on records
  for each statement execute function mt_block_change();

-- DEMO ONLY: silently change one removal record's count (simulates someone editing the database directly)
create or replace function mt_demo_tamper() returns jsonb
language plpgsql security definer set search_path = public as $$
declare r records; v_old int; v_new int;
begin
  select * into r from records where kind = 'REMOVAL' and ref = 'LOT-BR-002' order by seq limit 1;
  if r.seq is null then
    select * into r from records where kind = 'REMOVAL' order by seq limit 1;
  end if;
  if r.seq is null then raise exception 'No records to tamper with'; end if;
  if exists (select 1 from tamper_log where seq = r.seq) then
    return jsonb_build_object('seq', r.seq, 'ref', r.ref, 'already', true);
  end if;
  insert into tamper_log (seq, original_payload) values (r.seq, r.payload);
  v_old := (r.payload->>'count')::int;
  v_new := v_old - 150;
  perform set_config('metertrace.maintenance', 'on', true);
  update records set payload = jsonb_set(payload, '{count}', to_jsonb(v_new)) where seq = r.seq;
  perform set_config('metertrace.maintenance', 'off', true);
  return jsonb_build_object('seq', r.seq, 'ref', r.ref, 'old_count', v_old, 'new_count', v_new);
end $$;

create or replace function mt_demo_untamper() returns int
language plpgsql security definer set search_path = public as $$
declare t tamper_log; n int := 0;
begin
  perform set_config('metertrace.maintenance', 'on', true);
  for t in select * from tamper_log loop
    update records set payload = t.original_payload where seq = t.seq;
    n := n + 1;
  end loop;
  delete from tamper_log where true;
  perform set_config('metertrace.maintenance', 'off', true);
  return n;
end $$;

create or replace function mt_demo_wipe() returns void
language plpgsql security definer set search_path = public as $$
begin
  perform set_config('metertrace.maintenance', 'on', true);
  delete from alerts where true;
  delete from tamper_log where true;
  delete from records where true;
  alter sequence alerts_id_seq restart with 1;
  perform set_config('metertrace.maintenance', 'off', true);
end $$;

-- Lock everything down: only the service role (used by the Edge Function) may touch data
alter table users enable row level security;
alter table sessions enable row level security;
alter table recyclers enable row level security;
alter table settings enable row level security;
alter table records enable row level security;
alter table alerts enable row level security;
alter table tamper_log enable row level security;

revoke all on users, sessions, recyclers, settings, records, alerts, tamper_log from anon, authenticated;
revoke execute on function mt_record_hash(bigint,text,text,jsonb,bigint,text,text,timestamptz,text) from public, anon, authenticated;
revoke execute on function mt_append(jsonb) from public, anon, authenticated;
revoke execute on function mt_verify() from public, anon, authenticated;
revoke execute on function mt_demo_tamper() from public, anon, authenticated;
revoke execute on function mt_demo_untamper() from public, anon, authenticated;
revoke execute on function mt_demo_wipe() from public, anon, authenticated;
grant execute on function mt_append(jsonb), mt_verify(), mt_demo_tamper(), mt_demo_untamper(), mt_demo_wipe(),
  mt_record_hash(bigint,text,text,jsonb,bigint,text,text,timestamptz,text) to service_role;

-- Demo users (password for all: demo123)
insert into users (id, email, name, role, org, recycler_id, salt, pw_hash)
select id, email, name, role, org, recycler_id, salt, encode(sha256(convert_to(salt || 'demo123', 'UTF8')), 'hex')
from (values
  ('u-installer', 'installer@metertrace.demo', 'Ravi Verma',      'installer', 'Shakti Meter Installations (contractor)', null,     'mt-s1'),
  ('u-store',     'store@metertrace.demo',     'Sunita Yadav',    'store',     'DISCOM Central Meter Store',              null,     'mt-s2'),
  ('u-rec1',      'recycler@metertrace.demo',  'Imran Qureshi',   'recycler',  'GreenCore E-Recyclers, Noida',            'REC-01', 'mt-s3'),
  ('u-regulator', 'regulator@metertrace.demo', 'Dr. Anjali Mehta','regulator', 'State Pollution Control Board',           null,     'mt-s4'),
  ('u-rec2',      'sahyadri@metertrace.demo',  'Pooja Kulkarni',  'recycler',  'Sahyadri Metal Recovery, Pune',           'REC-02', 'mt-s5'),
  ('u-rec3',      'ganga@metertrace.demo',     'Manoj Sinha',     'recycler',  'Ganga E-Waste Solutions, Patna',          'REC-03', 'mt-s6'),
  ('u-rec5',      'kaveri@metertrace.demo',    'Lakshmi Narayanan','recycler', 'Kaveri Green Tech, Chennai',              'REC-05', 'mt-s7')
) as v(id, email, name, role, org, recycler_id, salt)
on conflict (id) do nothing;

-- v1.2: account management (Regulator can create / deactivate users)
alter table users add column if not exists active boolean not null default true;
alter table users add column if not exists created_at timestamptz not null default now();
alter table users add column if not exists last_login timestamptz;
alter table users add column if not exists created_by text;
-- Administrator account (role: regulator). Its password is kept in DEMO-NOTES.md, not here.
