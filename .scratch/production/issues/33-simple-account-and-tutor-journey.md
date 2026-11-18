# 33: Simple account and Tutor journey

Status: ready-for-agent
Type: task
Blocked by: 32 — Assisted Tutor onboarding

On 18 November 2026 the owner asked for a simple path to becoming a Tutor: sign up, open My Account, add a photo, choose Learn, Teach or Both, then choose between sending details to the team (highlighted) and creating the ad yourself. Photo review is off, and visitors can report a photo. The decisions are recorded in ADR0021.

## Acceptance criteria

- [x] After the first sign-in (password or Google), a new account opens My Account. My Account asks "Learn / Teach / Both" once, with nothing preselected; the answer is saved and can be changed later. Existing accounts are not asked.
- [x] Every account adds and removes its profile photo in My Account, without a Tutor profile. The photo appears publicly only on a published Tutor profile and its ads.
- [x] Learn shows only learning tools. Teach-only has no learner dashboard and no "Switch to learning". The Tutor level, Tutor Pro and Evaluations wait until an ad is online.
- [x] A new Tutor sees "Become a Tutor" with "Send to our team" (recommended, opening the team form straight away) and "Create it myself" (the one-form setup). Looking creates nothing; a started one-form setup resumes directly.
- [x] Signed-in visitors report a published Tutor's photo with a reason, once each. A Tutor cannot report their own photo. Staff see report counts in Portrait reviews and can remove the photo. Privacy export and deletion cover reports.
- [ ] Hosted API runs with `PHOTO_REVIEW_REQUIRED=false` (operator change at deployment).
