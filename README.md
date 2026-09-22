# PFRO — Pastoral Files Record Office

The staff-facing half of the church management system. Pastors and treasurers
(*wahazini*) use it to manage churches, enrol members, record giving, and read
financial reports. Swahili UI, mobile-first, offline-tolerant.

Its counterpart is [`../Congregant`](../Congregant), the member-facing app. They
share one Supabase project and no code — see [`../README.md`](../README.md).

## Running it

```bash
npm install
```

Create `.env.local` from [`.env.example`](.env.example), then:

```bash
npm run dev
```

Serves on **port 3001** (the Congregant app uses 3000, so both can run at once).

| Script | Does |
|---|---|
| `npm run dev` | Vite dev server on :3001 |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Serve the built output |
| `npm run lint` | `tsc --noEmit` |

## Roles

| Role | Scope |
|---|---|
| `pastor` | Owns churches. Full access within them; can invite and manage treasurers. |
| `mhazini` | Treasurer for one assigned church. Records giving, reads reports. |
| `superadmin` | Support and licensing. |
| `mshiriki` | Ordinary member — belongs to the Congregant app, not this one. |

Anyone who signs up here becomes a `pastor`. Treasurers arrive through the
invitation flow: a pastor invites an email address, and the invitation is
resolved on that person's next sign-in
([`AuthContext.tsx`](src/features/auth/AuthContext.tsx)).

`profile.church_ids` — the array every screen filters on — is the union of
churches assigned via `user_churches` and churches owned via `churches.pastor_id`.

## Offline support

[`src/lib/supabase.ts`](src/lib/supabase.ts) wraps the Supabase client in a
`Proxy` that intercepts `.from()`. Every read is mirrored into `localStorage`,
and while offline reads are replayed against that cache and writes are queued.
The queue drains on reconnect and on a 15-second timer.

Three keys matter:

| Key | Contents |
|---|---|
| `supabase_cache_<table>` | Mirrored rows, used for offline reads |
| `supabase_offline_sync_queue` | Writes waiting to reach the server |
| `supabase_offline_sync_failed` | Writes the server **rejected** |

The last one is a dead-letter list. A write refused for a non-transient reason
(a constraint violation, an RLS denial) is parked there instead of being
dropped, and the count is surfaced in the top banner.

## Licensing

Each church has a row in `licenses`. When the selected church's licence is
expired or suspended, [`Layout.tsx`](src/components/Layout.tsx) replaces the
whole UI with a lock screen, leaving only `/profile` and a church switcher
reachable.

New churches get a trial of `TRIAL_LICENSE_DAYS`, exported from
[`src/lib/supabase.ts`](src/lib/supabase.ts). Import it rather than writing the
number again — the online grant and the offline placeholder previously disagreed.

## How giving is stored

`contributions.type` only accepts `Zaka` and `Sadaka`. Everything else —
Majengo, Makambi, any custom label — is written as `type: 'Sadaka'` with the
real label in `payment_method`.

**Every read must resolve `payment_method` before `type`:**

```ts
const category = c.payment_method ? c.payment_method : c.type;
```

Stored values are capitalised (`'Zaka'`, not `'zaka'`); compare accordingly.
Full explanation in [`../database/schema.sql`](../database/schema.sql).

## Layout

```
src/
├── App.tsx                     routes
├── components/
│   ├── Layout.tsx              shell, nav, connectivity + licence gate
│   └── ProtectedRoute.tsx
├── features/
│   ├── auth/                   AuthContext, Login
│   ├── dashboard/              PastorDashboard
│   ├── congregants/            list, details, add, select
│   ├── finances/               AddContribution, FinancesPage, FinancialReportPage
│   ├── analytics/              AnalyticsPage
│   ├── churches/               ManageChurches
│   └── profile/                ProfilePage, ManageMhaziniPage
└── lib/supabase.ts             offline-aware Supabase proxy
```

`_archive/` holds files that are no longer part of the build; see its README.

## Database

Schema and access policies live in [`../database`](../database). The former
`supabase.sql` in this directory was an incomplete snapshot and has been moved
to `../database/_legacy/`.
