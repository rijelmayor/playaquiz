-- Optional company contact channels for quotation headers.
alter table quotation_settings
  add column if not exists social_media_account text not null default '',
  add column if not exists email_address text not null default '',
  add column if not exists website text not null default '';
