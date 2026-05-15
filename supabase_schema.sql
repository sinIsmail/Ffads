create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  barcode text not null unique,
  name text not null,
  brand text,
  category text,
  ingredients jsonb not null default '[]'::jsonb,
  ingredients_raw text,
  nutrition jsonb not null default '{}'::jsonb,
  source text not null default 'manual',
  nutriscore text,
  nova_group integer,
  scanned_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.product_ai_data (
  barcode text primary key references public.products(barcode) on delete cascade,
  animal_content_flag boolean not null default false,
  animal_content_details text,
  harmful_chemicals jsonb not null default '[]'::jsonb,
  ai_score numeric,
  ai_recommendation text,
  gemini_model text,
  analysis_mode text,
  status text not null default 'pending',
  analyzed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.product_images (
  id uuid primary key default gen_random_uuid(),
  barcode text not null references public.products(barcode) on delete cascade,
  image_type text not null,
  url text,
  storage_path text,
  created_at timestamptz not null default now(),
  unique (barcode, image_type)
);

create table if not exists public.user_profiles (
  id uuid primary key default gen_random_uuid(),
  device_id text not null unique,
  allergies jsonb not null default '[]'::jsonb,
  diet text,
  gemini_model text,
  analysis_mode text,
  health_mode text,
  off_enabled boolean not null default true,
  ai_fallback boolean not null default true,
  offline_mode boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_scans (
  id uuid primary key default gen_random_uuid(),
  barcode text not null references public.products(barcode) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  user_email text,
  scanned_at timestamptz not null default now()
);

create table if not exists public.user_contributions (
  id uuid primary key default gen_random_uuid(),
  barcode text,
  product_name text,
  contributor_email text,
  raw_ocr_text text,
  ai_filtered_data jsonb,
  gemini_filtered_data jsonb,
  front_photo_uploaded boolean not null default false,
  back_photo_ocrd boolean not null default false,
  ingredients jsonb,
  status text not null default 'approved',
  cleanup_trace jsonb not null default '[]'::jsonb,
  provider_route jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.processing_events (
  id uuid primary key default gen_random_uuid(),
  job_id text,
  event_type text not null,
  stage text,
  status text not null default 'info',
  barcode text,
  personal_product_id uuid,
  owner_email text,
  provider_id text,
  provider_label text,
  model text,
  masked_key text,
  route_id text,
  attempt_number integer,
  message text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.generate_ffadz_code()
returns text
language plpgsql
as $$
declare
  next_code text;
begin
  loop
    next_code := 'FFADZ-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 5));
    exit when not exists (
      select 1
      from public.personal_products
      where ffadz_code = next_code
    );
  end loop;

  return next_code;
end;
$$;

create table if not exists public.personal_products (
  id uuid primary key default gen_random_uuid(),
  ffadz_code text not null unique,
  owner_id uuid not null references auth.users(id) on delete cascade,
  owner_email text not null,
  product_name text not null,
  brand text not null default '',
  description text not null default '',
  ingredients jsonb not null default '[]'::jsonb,
  ingredients_raw text not null default '',
  nutrition jsonb not null default '{}'::jsonb,
  qr_status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.assign_ffadz_code()
returns trigger
language plpgsql
as $$
begin
  if new.ffadz_code is null or btrim(new.ffadz_code) = '' then
    new.ffadz_code := public.generate_ffadz_code();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_assign_ffadz_code on public.personal_products;
create trigger trg_assign_ffadz_code
before insert on public.personal_products
for each row
execute function public.assign_ffadz_code();

create table if not exists public.personal_product_images (
  id uuid primary key default gen_random_uuid(),
  personal_product_id uuid not null references public.personal_products(id) on delete cascade,
  image_type text not null,
  storage_provider text not null default 'cloudinary',
  storage_path text,
  public_url text not null,
  provider_public_id text,
  provider_asset_id text,
  provider_version text,
  width integer,
  height integer,
  bytes bigint,
  format text,
  upload_mode text not null default 'signed',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (personal_product_id, image_type)
);

create table if not exists public.personal_product_scans (
  id uuid primary key default gen_random_uuid(),
  personal_product_id uuid not null references public.personal_products(id) on delete cascade,
  ffadz_code text not null,
  scanned_by_user_id uuid references auth.users(id) on delete set null,
  scanned_by_email text,
  source text not null default 'qr',
  created_at timestamptz not null default now()
);

alter table public.personal_products
  alter column ffadz_code drop default;

alter table public.personal_product_images
  add column if not exists storage_provider text not null default 'cloudinary',
  add column if not exists provider_public_id text,
  add column if not exists provider_asset_id text,
  add column if not exists provider_version text,
  add column if not exists width integer,
  add column if not exists height integer,
  add column if not exists bytes bigint,
  add column if not exists format text,
  add column if not exists upload_mode text not null default 'signed';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'processing_events_personal_product_id_fkey'
  ) then
    alter table public.processing_events
      add constraint processing_events_personal_product_id_fkey
      foreign key (personal_product_id) references public.personal_products(id) on delete set null;
  end if;
end $$;

create index if not exists idx_products_scanned_at on public.products (scanned_at desc);
create index if not exists idx_user_scans_user_email on public.user_scans (user_email, scanned_at desc);
create index if not exists idx_user_contributions_email on public.user_contributions (contributor_email, created_at desc);
create index if not exists idx_processing_events_job_id on public.processing_events (job_id, created_at desc);
create index if not exists idx_processing_events_barcode on public.processing_events (barcode, created_at desc);
create index if not exists idx_personal_products_owner_email on public.personal_products (owner_email, created_at desc);
create index if not exists idx_personal_products_ffadz_code on public.personal_products (ffadz_code);
create index if not exists idx_personal_product_scans_product_id on public.personal_product_scans (personal_product_id, created_at desc);

drop trigger if exists trg_products_updated_at on public.products;
create trigger trg_products_updated_at
before update on public.products
for each row
execute function public.set_updated_at();

drop trigger if exists trg_product_ai_data_updated_at on public.product_ai_data;
create trigger trg_product_ai_data_updated_at
before update on public.product_ai_data
for each row
execute function public.set_updated_at();

drop trigger if exists trg_user_profiles_updated_at on public.user_profiles;
create trigger trg_user_profiles_updated_at
before update on public.user_profiles
for each row
execute function public.set_updated_at();

drop trigger if exists trg_personal_products_updated_at on public.personal_products;
create trigger trg_personal_products_updated_at
before update on public.personal_products
for each row
execute function public.set_updated_at();

drop trigger if exists trg_personal_product_images_updated_at on public.personal_product_images;
create trigger trg_personal_product_images_updated_at
before update on public.personal_product_images
for each row
execute function public.set_updated_at();

alter table public.personal_products enable row level security;
alter table public.personal_product_images enable row level security;
alter table public.personal_product_scans enable row level security;

drop policy if exists personal_products_public_read on public.personal_products;
create policy personal_products_public_read
on public.personal_products
for select
using (true);

drop policy if exists personal_products_owner_insert on public.personal_products;
create policy personal_products_owner_insert
on public.personal_products
for insert
with check (auth.uid() = owner_id);

drop policy if exists personal_products_owner_update on public.personal_products;
create policy personal_products_owner_update
on public.personal_products
for update
using (auth.uid() = owner_id)
with check (auth.uid() = owner_id);

drop policy if exists personal_products_owner_delete on public.personal_products;
create policy personal_products_owner_delete
on public.personal_products
for delete
using (auth.uid() = owner_id);

drop policy if exists personal_product_images_public_read on public.personal_product_images;
create policy personal_product_images_public_read
on public.personal_product_images
for select
using (true);

drop policy if exists personal_product_images_owner_insert on public.personal_product_images;
create policy personal_product_images_owner_insert
on public.personal_product_images
for insert
with check (
  exists (
    select 1
    from public.personal_products
    where personal_products.id = personal_product_images.personal_product_id
      and personal_products.owner_id = auth.uid()
  )
);

drop policy if exists personal_product_images_owner_update on public.personal_product_images;
create policy personal_product_images_owner_update
on public.personal_product_images
for update
using (
  exists (
    select 1
    from public.personal_products
    where personal_products.id = personal_product_images.personal_product_id
      and personal_products.owner_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.personal_products
    where personal_products.id = personal_product_images.personal_product_id
      and personal_products.owner_id = auth.uid()
  )
);

drop policy if exists personal_product_images_owner_delete on public.personal_product_images;
create policy personal_product_images_owner_delete
on public.personal_product_images
for delete
using (
  exists (
    select 1
    from public.personal_products
    where personal_products.id = personal_product_images.personal_product_id
      and personal_products.owner_id = auth.uid()
  )
);

drop policy if exists personal_product_scans_insert_any on public.personal_product_scans;
create policy personal_product_scans_insert_any
on public.personal_product_scans
for insert
with check (true);

drop policy if exists personal_product_scans_owner_read on public.personal_product_scans;
create policy personal_product_scans_owner_read
on public.personal_product_scans
for select
using (
  exists (
    select 1
    from public.personal_products
    where personal_products.id = personal_product_scans.personal_product_id
      and personal_products.owner_id = auth.uid()
  )
);
