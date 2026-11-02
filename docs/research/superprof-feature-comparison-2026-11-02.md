# Superprof comparison and implemented discovery batch

Requested by the owner on 2 November 2026. Target: Superprof public website compared with the existing tutoring marketplace, using the REA skill and browser scenario provider plus primary-source public documentation. This is a bounded feature comparison, not a reconstruction of Superprof's private account, payment or administration systems.

## Evidence and scope

| Evidence | Observation | Limit |
|---|---|---|
| REA `ev_9c2b5635db5fff405887db857651f023a3561feecbde11aa3c3f9f01a2a8b5a6` | A controlled temporary Edge browser navigated to Superprof India. DOM contained a DataDome CAPTCHA iframe. | Homepage interactions and authenticated features could not be inspected. No CAPTCHA bypass was attempted. |
| REA `ev_729a4b59650893b3954cec86f77a5eeb9fbad2c7ede6f00d42afc3526733e311` | The selected Australian help page was also challenged in the browser. | Its content is corroborated by the public indexed documentation below, not by successful live UI execution. |
| REA `ev_8d704e4156f2e83b5ac1e789ac975718a0d3c4b9a5295946920fa76a52dbfa85` | Our deployed `/tutors` page exposed subject/location and detailed filters, identity-reviewed profile cards, rates and availability. | Anonymous before-change capture only; no private account inspected. |
| Local source, baseline `1dce430` | Strict discovery supported UUID ordering, location/time and price ranges; offers already had FREE/PAID/NONE trials. No shortlist store, saved page or share controls existed. | Repository evidence establishes our implementation, not competitor internals. |

Captured pages are untrusted data. No target page text was used as operational instructions. REA owned and terminated its temporary browser processes. The accessible surface is incomplete; absence of a feature from a capture is not proof the competitor lacks it.

## Comparison

| Feature | Superprof source | Our before state | Action |
|---|---|---|---|
| Saved favourites | [Official account help](https://www.superprof.com.au/help/students/my-account/create-an-account/29/) documents adding Tutors to favourites after account creation. The owner's earlier India screenshot also showed hearts. | Missing account-owned shortlist. | Add private Saved Tutors, hearts and saved page with current eligibility/privacy checks. |
| Free introductory classes | [India Mathematics listings](https://www.superprof.co.in/lessons/mathematics/bengaluru/primary-school/3/) show individual Tutor free-class offers. | Exact trial terms already stored and rendered; no FREE filter. | Add filter for actual reviewed FREE offer terms, retaining duration and separate Access Pass disclosure. No universal free lesson claim. |
| Profile/class detail | [Official example profile](https://www.superprof.co.in/math-enthusiast-and-experienced-tutor-offering-lessons-for-all-levels-personalized-and-structured-approach.html) describes the teacher, class and teaching languages. | Identity-reviewed introduction, exact offers, languages, rates, evidence labels and availability already exist. | Preserve these features and honest self-declared labels; do not duplicate onboarding. |
| Reviews and location | Public India listings display review information and online/in-person locations. | Connection-linked moderated reviews and city/area discovery already exist. | Preserve; invent no ratings, response speed or distance. |
| Sharing and price ordering | Useful product additions based on our comparison; their exact competitor UI behavior was not verified through CAPTCHA. | Missing share control and sort choices; price ranges require one rate unit. | Add safe canonical profile sharing and ascending/descending exact-offer price order with unit-safe keyset pagination. These are adopted design defaults, not claims of observed competitor behavior. |

Additional areas remain outside this batch: provider-specific social sign-in needs actual OAuth setup; integrated tuition collection, recurring plans, package discounts and embedded video require separate product/provider decisions; paid/promotional rankings and performance badges require explicit rules and genuine evidence. The current pass pricing, contact consent, Guardian access, MFA policy and commercial launch gates are unchanged.

## Implementation and acceptance

The [feature spec](../../.scratch/superprof-discovery/spec.md) defines the implemented batch. Saved Tutors are private to a signed-in account and do not notify a Tutor or establish contact. Saves hold only profile references/timestamps, not public contact or identity snapshots. Reads recheck publication, identity/safety and blocks. Export and full erasure include the new relationship, including references to an erased Tutor. Sharing sends the canonical public profile link only after an explicit user action.

Tests and hosted acceptance are recorded in the deployment evidence for this feature. No assertion here implies authenticated Superprof runtime coverage or complete platform parity.
