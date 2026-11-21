# Typed subjects and ads for both teaching modes

On 20 November 2026 the owner asked for two changes to the ad form:

- A Tutor whose subject is not listed can type it. The typed subject counts as the ad's subject.
- An ad can be online, in person, or both.

Asked whether a typed subject should wait for staff approval, the owner chose: **publish immediately**, like any other free ad.

This amends ADR0014's "catalogue rules still apply" for the subject of an ad only. Domains, levels, curricula, exams, languages, publication, identity, payment and Connection rules are unchanged.

## Typed subjects

**Catalogue.** Migration `045-custom-subject.sql` adds one catalogue term, `subject-other` ("Other subject"), in every Learning Domain. All typed subjects use it, so the existing catalogue checks keep working. The typed name is stored on the ad as `offer.custom_subject`.
- The public catalogue (`GET /v1/catalogue`) does not list the term. It never appears in search suggestions, filters or onboarding.
- The staff catalogue lists it. **Staff can deactivate it to switch the option off.** Typed-subject ads then leave discovery and the option disappears from the ad form, exactly as for any inactive subject.

**Who can use it.** "Other" is never a declared profile subject: the introduction refuses it. A Tutor whose profile may publish ads (one-step onboarding, at least one active declared subject) may also publish ads for a typed subject. `GET /v1/me/listings` then adds `subject-other` to `eligible_subject_ids`. Legacy evidence-based profiles (onboarding version 1) cannot use it, because their eligibility is per approved subject.

**The typed name.** It is public text, so it follows the same no-contact rule as titles and descriptions. The name:
- has 2–60 characters after spaces are collapsed;
- uses letters from any script, digits, spaces and `& + . , ' ( ) / -`;
- contains at least one letter;
- has no links, email addresses or long digit runs.

`custom_subject` is required with `subject-other` and refused with any other subject.

**Showing and finding.**
- Wherever an ad's subject is shown, it shows the typed name.
- `GET /v1/discovery?subject_text=` matches the typed names (case-insensitive substring) of typed-subject ads only.
- In the learner search box, words that match no listed subject or exam search the typed subjects, instead of showing an error. Words matching a listed subject still use that subject.
- Typed-subject ads have no subject category page, and "Similar Tutors" only matches the same typed name.

**Safety.** Nothing is reviewed before publication, as with every free ad (ADR0014). The existing reporting and staff safety actions on listings apply.

## Ads for both modes

`offer.teaching_mode` accepts `BOTH` as well as `ONLINE` and `IN_PERSON`. Existing ads are unchanged.

- **Publishing.** An ad for both modes needs both modes saved on the Tutor's teaching preferences and a public city, like an in-person ad. The ad form saves them when the Tutor chooses "Online and in person".
- **Search and location.** The ad appears in both online and in-person searches, and shows its public city like an in-person ad.
- **Preference changes.** If the Tutor later removes either mode, or changes the city, from their preferences, the ad returns for an update, as in-person ads already do.
- **Enquiries.** An enquiry names the ad's mode, which may be `BOTH`.

The first ad created by onboarding still uses a single mode.

**Amendment on 21 November 2026.** Online and In person are the two choices in the ad editor, including the staff-assisted form.
- The API contract still accepts `BOTH`, and existing `BOTH` ads are unchanged.
- Editing an existing `BOTH` ad shows that it is currently online and in person, with neither single mode selected. It keeps `BOTH` when unrelated fields are saved, and the Tutor may switch it to one mode.
- Search, filters, enquiries and labels still describe the saved mode truthfully.
- Teaching preferences still let a Tutor tick online and in person separately.
