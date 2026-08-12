-- DW AdSign CRM V12.2: quotation, commission, design and completion workflow upgrade
-- Safe to run once. Existing 0015-0018 migrations remain unchanged.

-- ── 1. Quotations: richer financial/document controls ───────────────────
alter table quotations add column if not exists quotation_status text not null default 'draft';
alter table quotations drop constraint if exists quotations_status_check;
alter table quotations add constraint quotations_status_check
  check (quotation_status in ('draft', 'sent', 'accepted', 'rejected', 'expired', 'superseded'));

alter table quotations add column if not exists discount_type text not null default 'none';
alter table quotations drop constraint if exists quotations_discount_type_check;
alter table quotations add constraint quotations_discount_type_check
  check (discount_type in ('none', 'percentage', 'fixed'));
alter table quotations add column if not exists discount_value numeric(12,2) not null default 0;
alter table quotations add column if not exists discount_amount numeric(12,2) not null default 0;
alter table quotations add column if not exists tax_enabled boolean not null default false;
alter table quotations add column if not exists tax_rate numeric(6,3) not null default 0;
alter table quotations add column if not exists tax_amount numeric(12,2) not null default 0;
alter table quotations add column if not exists other_charges numeric(12,2) not null default 0;
alter table quotations add column if not exists other_charges_note text;
alter table quotations add column if not exists additional_notes text;
alter table quotations add column if not exists supersedes_quotation_id uuid references quotations(quotation_id);

-- Keep old documents usable: calculate their stored subtotal/discount/tax fields
-- from the current total only where no richer data exists. New documents are
-- calculated by the application before insert/update.
update quotations
set discount_type = coalesce(discount_type, 'none'),
    discount_value = coalesce(discount_value, 0),
    discount_amount = coalesce(discount_amount, 0),
    tax_enabled = coalesce(tax_enabled, false),
    tax_rate = coalesce(tax_rate, 0),
    tax_amount = coalesce(tax_amount, 0),
    other_charges = coalesce(other_charges, 0),
    quotation_status = case
      when sent_at is not null then 'sent'
      else 'draft'
    end
where true;

-- ── 2. Commissions: Admin chooses percentage OR fixed amount ────────────
alter table job_commissions add column if not exists commission_type text not null default 'percentage';
alter table job_commissions drop constraint if exists job_commissions_type_check;
alter table job_commissions add constraint job_commissions_type_check
  check (commission_type in ('percentage', 'fixed'));
alter table job_commissions add column if not exists commission_value numeric(12,2) not null default 10.00;

-- Preserve the existing commission_rate for compatibility/history. New
-- calculations use commission_type + commission_value.
update job_commissions
set commission_type = 'percentage',
    commission_value = coalesce(commission_rate, 10.00)
where commission_type is null or commission_value is null;

create or replace function calc_commission_amount(p_job_id uuid) returns void as $$
begin
  update job_commissions jc
  set amount = round(
    (
      case
        when jc.commission_type = 'fixed' then coalesce(jc.commission_value, 0)
        else coalesce((select final_value from jobs where job_id = p_job_id), 0)
          * coalesce(jc.commission_value, 0) / 100
      end
    ) * coalesce(jc.split_pct, 100) / 100,
    2
  )
  where jc.job_id = p_job_id and jc.status not in ('paid', 'void');
end;
$$ language plpgsql security definer;

create or replace function job_commission_config_trigger() returns trigger as $$
begin
  if new.commission_type = 'percentage' then
    new.commission_rate = new.commission_value;
  else
    -- Keep the legacy field meaningful without pretending a fixed amount is a rate.
    new.commission_rate = case when TG_OP = 'UPDATE' then coalesce(old.commission_rate, 0) else 0 end;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists job_commissions_config_before_change on job_commissions;
create trigger job_commissions_config_before_change
before insert or update of commission_type, commission_value on job_commissions
for each row execute function job_commission_config_trigger();

-- Recalculate immediately when Admin changes the commission rule.
create or replace function job_commissions_after_config_change() returns trigger as $$
begin
  perform calc_commission_amount(new.job_id);
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists job_commissions_after_config_change on job_commissions;
create trigger job_commissions_after_config_change
after update of commission_type, commission_value, split_pct on job_commissions
for each row execute function job_commissions_after_config_change();

-- ── 3. Designs: revision notes/audit metadata ──────────────────────────
alter table designs add column if not exists revision_note text;
alter table designs add column if not exists file_name text;
alter table designs add column if not exists uploaded_by uuid references users(user_id);
alter table designs add column if not exists approved_at timestamptz;
alter table designs add column if not exists approved_by uuid references users(user_id);

-- ── 4. Customer completion acknowledgment ──────────────────────────────
create table if not exists job_acknowledgments (
  acknowledgment_id uuid primary key default gen_random_uuid(),
  job_id uuid not null unique references jobs(job_id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'correction_requested')),
  customer_name text,
  authorized_representative text,
  signature_name text,
  remarks text,
  installation_checked boolean not null default false,
  project_received boolean not null default false,
  accepted_at timestamptz,
  created_by uuid references users(user_id),
  updated_by uuid references users(user_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table job_acknowledgments enable row level security;

drop policy if exists "admin full access job_acknowledgments" on job_acknowledgments;
create policy "admin full access job_acknowledgments" on job_acknowledgments for all
  using (current_user_role() = 'admin')
  with check (current_user_role() = 'admin');

drop policy if exists "sales reads own job_acknowledgments" on job_acknowledgments;
create policy "sales reads own job_acknowledgments" on job_acknowledgments for select
  using (current_user_role() = 'sales' and job_id in (
    select job_id from jobs where booked_by = current_user_id()
  ));

drop policy if exists "accounting reads job_acknowledgments" on job_acknowledgments;
create policy "accounting reads job_acknowledgments" on job_acknowledgments for select
  using (current_user_role() = 'accounting');

create or replace function set_acknowledgment_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists job_acknowledgments_set_updated_at on job_acknowledgments;
create trigger job_acknowledgments_set_updated_at
before update on job_acknowledgments
for each row execute function set_acknowledgment_updated_at();

-- Seed a pending acknowledgment row for jobs that are already installed,
-- so the Admin can immediately complete historical transactions.
insert into job_acknowledgments (job_id, status)
select j.job_id, 'pending'
from jobs j
where j.status in ('installed', 'paid', 'closed')
  and not exists (select 1 from job_acknowledgments a where a.job_id = j.job_id);

-- ── 5. Complete quotation/design RLS for the new cross-portal workflow ──
drop policy if exists "admin full access quotations" on quotations;
create policy "admin full access quotations" on quotations for all
  using (current_user_role() = 'admin')
  with check (current_user_role() = 'admin');

drop policy if exists "accounting reads quotations" on quotations;
create policy "accounting reads quotations" on quotations for select
  using (current_user_role() = 'accounting');

drop policy if exists "admin full access designs" on designs;
create policy "admin full access designs" on designs for all
  using (current_user_role() = 'admin')
  with check (current_user_role() = 'admin');

drop policy if exists "sales reads own designs" on designs;
create policy "sales reads own designs" on designs for select
  using (current_user_role() = 'sales' and job_id in (
    select job_id from jobs where booked_by = current_user_id()
  ));

create or replace function jobs_after_installed_create_acknowledgment() returns trigger as $$
begin
  if new.status = 'installed' and old.status is distinct from 'installed' then
    insert into job_acknowledgments (job_id, status)
    values (new.job_id, 'pending')
    on conflict (job_id) do nothing;
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists jobs_after_installed_acknowledgment on jobs;
create trigger jobs_after_installed_acknowledgment
after update of status on jobs
for each row execute function jobs_after_installed_create_acknowledgment();
