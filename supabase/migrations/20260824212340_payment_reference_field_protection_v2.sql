create or replace function private.protect_payment_reference_update()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if private.is_admin(auth.uid()) then return new; end if;

  if old.operator_id=auth.uid() then
    if new.id is distinct from old.id
      or new.booking_id is distinct from old.booking_id
      or new.trip_booking_batch_id is distinct from old.trip_booking_batch_id
      or new.traveler_id is distinct from old.traveler_id
      or new.operator_id is distinct from old.operator_id
      or new.listing_id is distinct from old.listing_id
      or new.payment_method is distinct from old.payment_method
      or new.payment_reference is distinct from old.payment_reference
      or new.amount is distinct from old.amount
      or new.currency is distinct from old.currency
      or new.payment_date is distinct from old.payment_date
      or new.customer_note is distinct from old.customer_note
      or new.proof_path is distinct from old.proof_path
      or new.created_at is distinct from old.created_at then
      raise exception 'Operators can only review the payment status and add an operator note';
    end if;

    if new.status is distinct from old.status then
      if not (
        (old.status='submitted' and new.status in ('confirmed','rejected'))
        or (old.status='rejected' and new.status='confirmed')
      ) then
        raise exception 'Invalid payment reference status transition';
      end if;
    end if;

    if new.confirmed_at is distinct from old.confirmed_at then
      if new.status='confirmed' and new.confirmed_at is not null then null;
      elsif new.status<>'confirmed' and new.confirmed_at is null then null;
      else raise exception 'confirmed_at must match the confirmed payment status';
      end if;
    end if;
    return new;
  end if;

  raise exception 'Payment reference updates are not allowed for this account';
end;
$$;

drop trigger if exists payment_references_10_protect_fields on public.payment_references;
create trigger payment_references_10_protect_fields
before update on public.payment_references
for each row execute function private.protect_payment_reference_update();