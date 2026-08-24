# Supabase database

The initial migration creates the complete tenant-scoped MVP schema, RLS
policies, explicit Data API grants, baseline workflow/templates, and the
Náutica project shell.

The later migrations add configurable workflows/sprints/technologies and an
append-only `audit_log`. Operational records may be deleted according to their
role and dependency policies, but audit rows and project activity reject
`UPDATE`, `DELETE`, and `TRUNCATE`, including privileged application roles.

## Local verification

With the current Supabase CLI and a container runtime installed:

```sh
supabase start
supabase db reset
supabase test db
supabase db lint --level warning --local
```

The pgTAP suite in `tests/database` covers schema presence, seed behavior,
tenant isolation, financial restrictions, integration restrictions, activity
actor integrity, calendar queue creation, deletion permissions, automatic
audit capture, sensitive-field filtering, and history immutability.

## First owner bootstrap

The seed intentionally creates no membership because migrations must not
contain a real Auth user ID or email. After the intended owner signs in with
Google once, add that Auth user to the seeded workspace from a trusted SQL
session (Dashboard SQL Editor or a migration with the real UUID):

```sql
begin;

insert into public.workspace_members (workspace_id, user_id, role, status)
values (
  '00000000-0000-4000-8000-000000000001',
  '<AUTH_USER_UUID>',
  'owner',
  'active'
);

update public.projects
set responsible_id = '<AUTH_USER_UUID>'
where id = '00000000-0000-4000-8000-000000000302'
  and responsible_id is null;

commit;
```

Do not expose a public "claim first owner" endpoint. It would allow the first
untrusted login to take ownership of the workspace.

## Sensitive integration data

Google OAuth token ciphertext is stored in
`private.calendar_credentials`. Trusted server code should use only these
service-role RPCs:

- `get_calendar_credentials(p_connection_id uuid)`
- `upsert_calendar_credentials(p_connection_id uuid,
  p_access_token_ciphertext text, p_refresh_token_ciphertext text,
  p_encryption_key_version text)`

Encrypt tokens in server code before calling the writer RPC. Never expose the
service role or the encryption key to browser code.

The seeded Náutica project includes its verified production site and GitHub
repository. The admin-panel slot remains `needed`; no credential or invented
URL is stored. Commercial values and subscriptions remain empty until the team
adds the real data.
