# First ads for profiles without one (ADR0021)

Some Tutors published a profile before "becoming a Tutor means a live ad" (ADR0021) and have no available ad. With `DIRECTORY_REQUIRES_AD=true` they are hidden: learners cannot find or contact them. The owner confirmed that these Tutors consented to the team publishing their first ad. This command gives each one that ad.

The ad is built from the Tutor's own profile:
- subject: the first subject on the profile;
- rate: the hourly rate, per hour;
- About text: the profile biography;
- teaching mode: online if the Tutor teaches online, otherwise in person;
- title: generated from the subject and name.

Languages default to Hindi and English. **The owner supplies the class level**, the board (school) or exam (entrance), and the subject area when a subject belongs to more than one.

Every ad is created and published through the normal ad service, acting as the Tutor. Every ad, photo, safety and catalogue rule still applies. A Tutor without a usable photo cannot be published; nothing is left behind and the result says why. Each Tutor's ad is audited as `TUTOR_FIRST_AD_BY_OPERATOR` under the operator's staff account, with the reason. The Tutor owns the ad afterwards like any other and can change or pause it in My ads.

## Steps

Run these on the API host with the production environment loaded.

1. **Plan (read-only).** This writes nothing.

   ```
   npm run profile-ads:operator -- plan --environment production --out first-ads.json
   ```

   It prints each candidate, the proposed ad, what is missing, and the catalogue choices for level, board and exam. It writes a template to `first-ads.json` (mode 600).
2. **Owner fills in the template.** For each Tutor, set `level_id`, plus `curriculum_id` for school or `exam_id` for entrance, using ids from the printed choices. Optionally also set `domain_id`, `language_ids`, `teaching_mode`, `title` or `description`. Remove any Tutor who should not get an ad.
3. **Apply.**

   ```
   npm run profile-ads:operator -- apply --environment production --file first-ads.json \
     --operator-email <enabled staff email> --reason "<owner's consent confirmation, 10-240 characters>" --confirm yes
   ```

   It prints one result per Tutor: `PUBLISHED`, `SKIPPED` (already has an available ad, or unknown) or `FAILED` (with the rule that refused it). It is safe to re-run: Tutors who already have an ad are skipped.
4. **Delete `first-ads.json`** after the run.
