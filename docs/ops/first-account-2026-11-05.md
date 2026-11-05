# First-account workspace release

Reference inspection and owner-authorized changes: [research and implementation report](../research/first-account-superprof-2026-11-05.md). Project name retained; account styling and navigation follow the supplied Superprof reference more closely.

Both main and payment sandbox run **`first-account-20261105-12817186c2ec`**, source commit **`12817186c2ece63b291fd7dccadc99db15cb35c8`**. The verified Linux base is `direct-ads-20261104-aeae848157e4`. The four-file overlay updates only compiled app/auth modules. Package SHA256: `f5a2e37ad4bbad23fd7b2f47ecdf88046ecf31e96340f9b9657a972f5e0f7dc7`.

Sandbox was backed up and promoted before main. Main encrypted backups succeeded before and after promotion. Schema count remains **38**; no migration, table creation, deletion or data seeding occurred. Protected API configuration comparison passed excluding the intended release ID update. Existing passwords, sessions, authenticators, origins, payment settings, optional-ID publication rules and staff controls are retained. API/worker services are active in both environments and health returns200. The stop timer remains **10 November 2026 at 10:25:48 UTC / 15:55:48 IST**.

Cloudflare version: **`f77731a4-0fd5-4790-950c-ddd23295523d`** at https://tutor-marketplace-ravii-preview.tutoring-marketplace-ravii-preview.workers.dev . Netlify production was not deployed; the sandbox API is updated but its older Netlify frontend is not claimed to have the new account UI.

Validation: 16 backend HTTP/PostgreSQL tests, 41 UI tests, API build, UI typecheck, Cloudflare build and the [real Chrome desktop/mobile account journey](../research/evidence/first-account/browser-results.json). The [hosted smoke](../research/evidence/first-account/hosted-smoke.json) passed actual health, anonymous endpoint protection and sign-in redirects. Authenticated deployed-asset checks use read-only requests redirected exclusively to the isolated real API/PostgreSQL with fictional users; they are not hosted authenticated write tests.

The sandbox deliberately rejects the main frontend Origin. Its profile endpoint was verified with its existing approved sandbox Origin; no Origin policy was broadened to make a smoke test pass. Both environments reject anonymous profile editing with401 under their approved Origin.
