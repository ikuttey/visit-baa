create table if not exists public.business_staff (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('manager','reservations','content','finance')),
  is_active boolean not null default true,
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(business_id,user_id)
);
create index if not exists business_staff_user_idx on public.business_staff(user_id,is_active);

create or replace function private.business_staff_role(p_business_id uuid,p_user_id uuid default auth.uid())
returns text language sql stable security definer set search_path='' as $$
  select bs.role from public.business_staff bs
  where bs.business_id=p_business_id and bs.user_id=coalesce(p_user_id,auth.uid()) and bs.is_active
  limit 1;
$$;

create or replace function private.has_business_permission(p_business_id uuid,p_permission text,p_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path='' as $$
  select private.is_admin(coalesce(p_user_id,auth.uid()))
  or exists(select 1 from public.businesses b where b.id=p_business_id and b.owner_id=coalesce(p_user_id,auth.uid()))
  or exists(
    select 1 from public.business_staff bs
    where bs.business_id=p_business_id and bs.user_id=coalesce(p_user_id,auth.uid()) and bs.is_active
      and (
        bs.role='manager'
        or (bs.role='reservations' and p_permission in ('reservations','messages','calendar','analytics'))
        or (bs.role='content' and p_permission in ('content','arrival'))
        or (bs.role='finance' and p_permission in ('finance','analytics'))
      )
  );
$$;

create or replace function public.operator_accessible_businesses()
returns table(id uuid,business_name text,island text,status text,is_active boolean,category text,access_role text)
language sql stable security definer set search_path='' as $$
  select b.id,b.business_name,b.island::text,b.status::text,b.is_active,b.category::text,
    case when b.owner_id=auth.uid() then 'owner' when private.is_admin(auth.uid()) then 'admin' else bs.role end
  from public.businesses b
  left join public.business_staff bs on bs.business_id=b.id and bs.user_id=auth.uid() and bs.is_active
  where auth.uid() is not null and (b.owner_id=auth.uid() or bs.user_id=auth.uid() or private.is_admin(auth.uid()))
  order by b.business_name;
$$;

create or replace function public.owner_list_business_staff(p_business_id uuid)
returns table(user_id uuid,full_name text,email text,role text,is_active boolean,created_at timestamptz)
language plpgsql security definer set search_path='' as $$
begin
  if not exists(select 1 from public.businesses b where b.id=p_business_id and (b.owner_id=auth.uid() or private.is_admin(auth.uid()))) then
    raise exception 'Only the business owner can manage staff';
  end if;
  return query
  select bs.user_id,coalesce(p.full_name,''),coalesce(u.email,''),bs.role,bs.is_active,bs.created_at
  from public.business_staff bs
  join auth.users u on u.id=bs.user_id
  left join public.profiles p on p.id=bs.user_id
  where bs.business_id=p_business_id
  order by bs.created_at;
end;
$$;

create or replace function public.owner_add_business_staff(p_business_id uuid,p_email text,p_role text)
returns public.business_staff language plpgsql security definer set search_path='' as $$
declare v_user uuid; v_row public.business_staff;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_role not in ('manager','reservations','content','finance') then raise exception 'Choose a valid staff role'; end if;
  if not exists(select 1 from public.businesses b where b.id=p_business_id and (b.owner_id=auth.uid() or private.is_admin(auth.uid()))) then raise exception 'Only the business owner can manage staff'; end if;
  select id into v_user from auth.users where lower(email)=lower(trim(p_email)) limit 1;
  if v_user is null then raise exception 'That email does not have a Visit Baa account yet'; end if;
  if exists(select 1 from public.businesses b where b.id=p_business_id and b.owner_id=v_user) then raise exception 'The business owner does not need a staff membership'; end if;
  insert into public.business_staff(business_id,user_id,role,is_active,invited_by)
  values(p_business_id,v_user,p_role,true,auth.uid())
  on conflict(business_id,user_id) do update set role=excluded.role,is_active=true,invited_by=excluded.invited_by,updated_at=now()
  returning * into v_row;
  insert into public.user_roles(user_id,role,granted_by)
  values(v_user,'operator'::public.app_role,auth.uid()) on conflict(user_id,role) do nothing;
  return v_row;
end;
$$;

create or replace function public.owner_update_business_staff(p_business_id uuid,p_user_id uuid,p_role text,p_active boolean default true)
returns public.business_staff language plpgsql security definer set search_path='' as $$
declare v_row public.business_staff;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_role not in ('manager','reservations','content','finance') then raise exception 'Choose a valid staff role'; end if;
  if not exists(select 1 from public.businesses b where b.id=p_business_id and (b.owner_id=auth.uid() or private.is_admin(auth.uid()))) then raise exception 'Only the business owner can manage staff'; end if;
  update public.business_staff set role=p_role,is_active=coalesce(p_active,true),updated_at=now()
  where business_id=p_business_id and user_id=p_user_id returning * into v_row;
  if v_row.id is null then raise exception 'Staff membership not found'; end if;
  return v_row;
end;
$$;

alter table public.business_staff enable row level security;
drop policy if exists business_staff_read on public.business_staff;
create policy business_staff_read on public.business_staff for select to authenticated
using (user_id=(select auth.uid()) or exists(select 1 from public.businesses b where b.id=business_id and b.owner_id=(select auth.uid())) or (select private.is_admin()));
revoke insert,update,delete on public.business_staff from anon,authenticated;
grant select on public.business_staff to authenticated;
revoke all on function public.operator_accessible_businesses() from public;
revoke all on function public.owner_list_business_staff(uuid) from public;
revoke all on function public.owner_add_business_staff(uuid,text,text) from public;
revoke all on function public.owner_update_business_staff(uuid,uuid,text,boolean) from public;
grant execute on function public.operator_accessible_businesses() to authenticated;
grant execute on function public.owner_list_business_staff(uuid) to authenticated;
grant execute on function public.owner_add_business_staff(uuid,text,text) to authenticated;
grant execute on function public.owner_update_business_staff(uuid,uuid,text,boolean) to authenticated;