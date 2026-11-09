create table if not exists public.profile_first_access_tokens (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now()
);

create index if not exists profile_first_access_tokens_profile_idx
  on public.profile_first_access_tokens(profile_id);

create index if not exists profile_first_access_tokens_expiry_idx
  on public.profile_first_access_tokens(expires_at)
  where used_at is null;

alter table public.profile_first_access_tokens enable row level security;

revoke all on table public.profile_first_access_tokens from anon, authenticated;
grant select, insert, update, delete on table public.profile_first_access_tokens to service_role;

comment on table public.profile_first_access_tokens is
'One-time server-only setup tokens for MOTIL first access. Stores only SHA-256 token digests; raw tokens are never persisted.';
