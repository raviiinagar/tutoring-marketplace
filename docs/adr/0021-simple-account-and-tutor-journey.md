# Simple account and Tutor journey

On 18 November 2026 the owner found becoming a Tutor confusing. "Become a Tutor", the teaching workspace, "Manage teaching offers" and "Complete your profile", which also contained ads, overlapped. The owner asked for one simple path and decided:

- photo review is turned off, with a "Report photo" button instead;
- Tutors add more ads later;
- a new account is asked "Learn, Teach or Both" on its first visit.

This amends ADR0019 (photo review is off in the hosted service) and ADR0014's photo rule. It does not change publication, identity or payment rules.

**After sign-up.** A new account opens My Account after its first sign-in, whether by password or Google. My Account shows:

- the name;
- the profile photo, with upload and remove;
- "I want to: Learn / Teach / Both".

Until the account answers, the question is highlighted and nothing is preselected. The answer is saved through `POST /v1/me/roles`, which now also records `users.roles_chosen_at`. `Account.roles_chosen` reports whether it is set. Existing accounts are backfilled as having chosen, because they already have their roles. Choosing is only a preference: the server still enforces every role-based permission. The answer can be changed at any time.

**One mode at a time.**
- A Learn account sees only learning tools.
- A Teach-only account has no learner dashboard. It goes to its teaching dashboard, or to "Become a Tutor" while it has no ad, and its teaching navigation has no "Switch to learning".
- Both keeps the switch.
- Within the teaching workspace, the Tutor level, Tutor Pro and Evaluations appear only once an ad is online. Day one shows the profile, ads and messages.

**Become a Tutor.** A new Tutor without a profile first chooses one of two ways to create the ad:
- "Send to our team" is highlighted and recommended. It opens the assisted-onboarding form (ADR0018) straight away.
- "Create it myself" opens the one-form setup: class title, rate per hour or per lesson, location, and online, in person or both.

Looking at the choice creates nothing. A Tutor who has already started the one-form setup goes straight back to it. The staff onboarding wizard is unchanged. More ads are added later from My ads.

**One photo per account.** The profile photo belongs to the account, not to a Tutor profile. Learners and Tutors manage it in My Account through the existing `/v1/me/tutor/photo` endpoints, which no longer require a Tutor profile. Migration 043 moves the photo's foreign key from `tutor_profiles` to `users`. A photo is still shown publicly only on a published Tutor profile and its ads. Scanning, processing, consent and removal are unchanged.

**Photo review off, reports on.**
- The hosted API runs with `PHOTO_REVIEW_REQUIRED=false`, so a clean, consented photo appears as soon as the Tutor publishes. The switch from ADR0019 remains and can be turned back on.
- A signed-in visitor can report a published Tutor's public photo with `POST /v1/tutor-profiles/:id/photo-reports`. The reason is one of `NOT_A_PORTRAIT`, `NOT_THE_TUTOR`, `INAPPROPRIATE` or `OTHER`.
- A visitor reports a photo once, and further reports are no-ops. A Tutor cannot report their own photo (409 `OWN_PHOTO`). Reports are limited to 20 per account per day and audited as `TUTOR_PHOTO_REPORTED`.
- Portrait reviews show the report count and list the most-reported photos first. Staff remove a photo with the existing `REJECT` review.
- Privacy export includes an account's reports. Account deletion removes its reports and the reports on its photos.

**Not changed.** Identity verification stays optional and separate. A photo, a role choice or a report never creates verification, badges or publication rights. Tuition, platform access and Tutor Pro are unchanged.

**Follow-up, 18 November 2026: one mode, one set of links.** An audit of what each kind of account sees found leftovers, which the owner asked to remove (feedback links stay as they are):
- **Header menu:**
  - a Teach-only account's menu shows only teaching links: Dashboard, My messages, My ads and My Account. There are no Saved Tutors, enquiries or heart icon, and its pages keep the teaching bar;
  - the link reads "Become a Tutor" and opens `/tutor` until the account has an ad online; from then on it reads "Teaching dashboard" and opens `/tutor/dashboard` (owner's choice).
- **New Tutor's dashboard:** with no profile and no ad, it shows one "Create your first ad" step instead of four empty panels.
- **The Tutor profile page:**
  - drops the team-help offer and the set-up steps once the profile is public;
  - shows Tutor Pro only then;
  - points to My Account for the photo instead of a second photo editor.
- **Naming:** "ads" is used consistently on the dashboard.
- **My Account:** Learners no longer see the identity-verification card, and receipts appear once (the tab).
- **Directory with no Tutors:** it no longer suggests changing filters that are not set.

**Decision, 19 November 2026: becoming a Tutor means a live ad.** The owner decided that the account is created at sign-up and is never public. Becoming a Tutor, whether the Tutor creates the ad or the team does, ends in one result: the first ad, published. Learners and Tutors never see the profile as a separate thing; the "About you" text is filled in within the same form and is shared by all of a Tutor's ads.
- **One name:** the teaching offer is called an "ad" everywhere on the site, including the admin console.
- **Team path:**
  - Staff fill in the same one form as "Create it myself", acting for the Tutor through the claimed request. It saves the profile and the ad together and publishes them.
  - `COMPLETE` succeeds only once the Tutor has at least one published ad (409 `AD_NOT_PUBLISHED`), so a team request can never end with a profile but no ad.
  - A completed request can be reopened (`REOPEN`). It returns to the staff member who reopens it, under the Tutor's original consent, so a missing or wrong ad can be fixed. The reopen is audited.
- **Visibility:**
  - With `DIRECTORY_REQUIRES_AD=true`, which the hosted site sets, only Tutors with an available ad appear in the directory, and a Tutor without one has no public profile page.
  - A Tutor without a live ad sees "Learners can't find you yet" on their dashboard, with a link to publish their first ad.
  - The Tutor's "send to our team" form stays available until the Tutor has an ad online.
- **Not changed:**
  - Enquiries are still made on an ad and still need access coverage.
  - Contacting a Tutor directly from a profile without an ad is out of scope.
