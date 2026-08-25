-- Include accepted/confirmed/completed/no-show bookings in the finance queue,
-- even when a customer has not submitted a payment reference yet.

create or replace function public.operator_finance_payment_queue(p_business_id uuid)
returns table(
  payment_id uuid,booking_id uuid,booking_reference text,listing_title text,requested_date date,
  booking_status public.enquiry_status,booking_payment_status text,quoted_total numeric,quote_currency character(3),
  amount numeric,currency character(3),payment_method text,payment_date date,payment_reference text,proof_path text,
  customer_note text,reference_status text,operator_note text,reference_created_at timestamptz,
  service_payment_received_at timestamptz,service_payment_note text
)
language plpgsql security definer set search_path=''
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not (
    private.has_business_permission(p_business_id,'finance',auth.uid())
    or private.has_business_permission(p_business_id,'reservations',auth.uid())
    or private.is_admin(auth.uid())
  ) then raise exception 'Finance access denied'; end if;
  return query
  select p.id,e.id,e.booking_reference,coalesce(e.listing_title_snapshot,l.title,'Booking')::text,
         e.requested_date,e.status,e.payment_status,e.quoted_total,e.quote_currency,p.amount,p.currency,
         p.payment_method,p.payment_date,p.payment_reference,p.proof_path,p.customer_note,p.status,
         p.operator_note,p.created_at,e.operator_payment_confirmed_at,e.operator_payment_note
  from public.booking_enquiries e
  left join public.payment_references p on p.booking_id=e.id
  left join public.listings l on l.id=e.listing_id
  where e.business_id=p_business_id
    and e.status in ('accepted','confirmed','completed','no_show')
  order by e.requested_date desc,p.created_at desc nulls last;
end;
$$;
revoke all on function public.operator_finance_payment_queue(uuid) from public,anon;
grant execute on function public.operator_finance_payment_queue(uuid) to authenticated;
