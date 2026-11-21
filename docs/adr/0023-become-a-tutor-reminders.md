# "Become a Tutor" reminder emails

On 21 November 2026 the owner asked to remind people who signed up to become Tutors, offering both ways to create an ad: by themselves, or with our team's help. The owner chose:

- **Recipients:** only accounts that chose **Teach** and have no published ad. Accounts that only learn are never emailed. The same day, "Become a Tutor" was hidden from them.
- **Design:** the branded email (design B) with a plain-text alternative.

A reminder to all members would be marketing. Marketing email is opt-in and off by default (docs/api/notifications.md), and no such campaign exists. These reminders are a narrow, service-like follow-up to an explicit choice to teach, with an easy opt-out.

## Behaviour

**Scheduling.** When an account gains the Tutor role, a database trigger queues two jobs in the existing notification outbox. The role can be gained by choosing Teach in My Account, by saving a first teaching draft, or through assisted onboarding.
- `TEACH_REMINDER_1` is due one day later; `TEACH_REMINDER_2` seven days later.
- The source keys are per account, so an account gets these reminders at most once, even if it switches roles back and forth.
- Accounts that already held the Tutor role when migration 046 ran are **not** emailed retrospectively.

**Delivery checks.** The worker re-checks everything when a reminder is due, and does not send it unless all of these still hold:
- the account is active with a verified email;
- it still holds the Tutor role;
- it has no published, unarchived ad;
- it has not turned the reminders off.

A withheld reminder is recorded as `SUPPRESSED` with the reason: `NOT_TEACHING`, `ALREADY_TEACHING` or `PREFERENCE_DISABLED`.

**Content.** The subjects are "Your Tutor ad is one step away" and "Learners can't find you yet". Each email offers:
1. Send your details to our team (WhatsApp and email), and the team creates the ad.
2. Create it yourself in one short form (`/tutor`).

It also says "Publishing an ad is free. Identity verification is optional." The HTML version uses the brand colours and buttons, and the same text is always sent as plain text. The only personal data used is the first name.
- **Team contact:** set with `TEAM_WHATSAPP` (international digits) and `TEAM_EMAIL`. If neither is set, the email links to `/tutor`, where "Send to our team" shows the configured channels.

**Opt-out.**
- **Stop link.** Every reminder ends with a signed "Stop these reminders" link (`/reminders/stop#token=…`). The token is bound to the account and its purpose, and needs no stored state. The page acts only when the button is pressed, so mail scanners cannot trigger it.
  - `POST /v1/me/teach-reminders/stop {token}` turns the preference off and withholds pending reminders.
- **Email settings.** "Reminders to create my Tutor ad" (`teaching_reminder_email`, default on) can be changed at any time. The field is optional in `POST /v1/me/notification-preferences`; older clients that omit it leave it unchanged.
- **Privacy:** the preference is included in the data export, and account erasure removes it as before.
