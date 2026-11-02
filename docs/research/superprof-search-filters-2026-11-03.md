# Superprof search and filters: REA observations and project implementation

Inspected on 3 November 2026 IST using REA MCP against https://www.superprof.co.in/. The first temporary browser was challenged by DataDome. The owner opened a visible Chrome session and confirmed the search page was available; REA subsequently connected to that same loopback CDP session. No CAPTCHA bypass, login, account creation or contact/payment action was performed.

## Observed evidence

The [selected evidence excerpts](evidence/superprof-search-controls-2026-11-03.json) retain exact Evidence IDs, action outcomes, URLs and control accessibility text. The complete canonical REA bundle is retained locally under ignored `.local/rea-superprof-search-2026-11-03.json`; public excerpts omit cookies, bulk Tutor details and third-party scripts.

| Observation | REA evidence |
|---|---|
| Activating the homepage search reveals subject and location inputs; typing Maths produces a subject suggestion. | `ev_a4e290feb6a321dcf27f9c5ac5d6765c27badc12436085bde6b523b394d6cfac` |
| Selecting Maths and typing Mumbai produces city/area suggestions, with separate Online and Around me options. | `ev_88917ca87af0020b6ac2339c07580a76773da5834deddfd4ef2da9945855c8bf` |
| The resulting Maths/Mumbai page exposes a compact filter row and Tutor cards. | `ev_f9227e4320c05d4808b6743cde33061e4833729fca88a5458f7562485c8cca78` |
| Opened each panel: Type of class offers local/face-to-face/online choices; Distance has a range; Fee combines maximum budget and a free-first-class checkbox; Level offers learner stages; Response time offers a one-day checkbox. | `ev_ec97bda7819c49364565bdfb31aef59c92e760588ad5165d3e15743978145fb1` |
| Adjusting the Fee slider from 2350+ to 2349 and checking free class leaves the results unchanged until Apply. After Apply the URL gains `?pmax=2349&f=1` and displayed count changes from 7094 to 7017. These are observation-time competitor counts, not our supply. | `ev_fca2f7787ecdc7e3b4d02a9a3f6a1dabfb232b773c9a15f40092ef67feb04f37` |
| At a 390x844 viewport, Fee opens a mobile panel with the budget slider, checkbox and Cancel/Apply controls. | `ev_9cba35173689794cce04f69f66f28a953ce145a3290be9081d1f9013e1c5f879` |

Screenshots captured through REA:

- [Desktop Fee panel](evidence/superprof-fee-desktop.png), Evidence `ev_e29bd1eb865d1981e0dbd44ac213194a049830068c5efe5fbfe73aaaf7f88f7d`.
- [Mobile Fee panel](evidence/superprof-fee-mobile.png), Evidence `ev_6b3851a018ba79da3d40f289f871cc7a902d18a0c30b561ea2d4c476e0006535`.

## What this establishes and what remains unknown

These are successful declared browser scenarios and screenshots of the public interface. An initial action timed out before activating the hidden search inputs; the corrected action activates the visible search widget first. One Search click timed out during navigation, so the resulting URL was independently captured successfully afterward. We do not treat failed steps as successful execution.

The captures establish controls and the observed Fee query/result transition. They do not establish Superprof's backend algorithm, ranking formula, response-time measurement, geographic-distance implementation, result correctness for every Tutor, or authenticated behavior. The observed AI Search button was not invoked or reconstructed. REA disconnected from the external browser and left it open.

## Our implementation and deliberate differences

The existing NestJS API already supports exact-offer filtering, real free-trial terms, price ordering, city/area matching and declared availability. This frontend change makes those features easier to use:

- Compact Type of class, Budget, Level and More filters controls replace the long sidebar; additional learning and schedule preferences stay available.
- Changes are staged in accessible dialogs until Apply; Cancel/Escape discard. Focus returns to the opening control.
- Applied chips expose actual URL state, individual removal and clear-all; pagination clears when filters change. Browser Back/Forward restores applied state.
- Existing subject/location autocomplete remains; a new search preserves compatible refinements instead of discarding all of them.
- Budget supports explicit hourly/per-lesson units, min/max number inputs, a maximum slider and real free introductory offers. Our INR1-5000 quick-slider range is an adopted interface default, not a copy of competitor supply statistics. A higher imported maximum is preserved and editable numerically.
- Exact offer-only filters hide the separate public-introduction projection, preventing a profile from appearing to satisfy an unverified learning combination, trial or tuition-unit constraint.

We do not add a kilometer-distance filter or one-day response claim: our current model stores coarse stated locality and declared hours, without the corresponding geographic or response-time evidence. Price sort and removable chips are useful project design choices; their exact competitor equivalents were not established by this inspection. The Lovable components, large portraits, light-yellow theme, existing commercial rules and authoritative API remain in use.

## Validation

Acceptance results and hosted deployment are recorded in [the operations record](../ops/search-filters-2026-11-03.md).
