-- Accounting expense editing and audit support.
-- Existing accounting_expenses rows remain intact.

alter table accounting_expenses
  add column if not exists updated_at timestamptz not null default now();

create or replace function set_accounting_expense_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists accounting_expense_updated_at on accounting_expenses;
create trigger accounting_expense_updated_at
before update on accounting_expenses
for each row execute function set_accounting_expense_updated_at();

-- Reuse the existing audit logger created by migration 0020.
drop trigger if exists audit_accounting_expenses on accounting_expenses;
create trigger audit_accounting_expenses
after insert or update or delete on accounting_expenses
for each row execute function write_audit_log('expense_id');
