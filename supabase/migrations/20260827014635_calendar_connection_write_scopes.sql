-- Aceita qualquer escopo de escrita do Google Agenda, não só calendar.app.created.
-- calendar.readonly e calendar.calendars.readonly não entram: não criam eventos.

alter table public.calendar_connections
  drop constraint calendar_connections_scope_check;

alter table public.calendar_connections
  add constraint calendar_connections_scope_check check (
    'https://www.googleapis.com/auth/calendar.app.created' = any(scopes)
    or 'https://www.googleapis.com/auth/calendar' = any(scopes)
    or 'https://www.googleapis.com/auth/calendar.calendars' = any(scopes)
  );

comment on column public.calendar_connections.scopes is
  'OAuth scopes granted by Google. Write access requires calendar, calendar.app.created, or calendar.calendars.';
