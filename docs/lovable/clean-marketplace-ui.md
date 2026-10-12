# Clean marketplace visual refresh

On 12 October 2026 the owner supplied a SuperProf homepage screenshot as the visual reference. The product now uses a compact name-only header, centered two-line heading, soft white-to-pink gradient hero, pill search and horizontally scrollable subject shortcuts. Tutor offers use rounded cover cards, concise evidence/offer text and visible tuition/trial terms. The owner's styled Tutor Marketplace wordmark remains; no competitor branding, photographs, ratings or supply counts are copied.

The homepage reads the existing catalogue and six currently eligible offers through `src/lib/api.ts`. Subject/exam labels and aliases such as Maths and JEE route to real discovery filters; unknown queries lead to catalogue exploration with an explanation. Catalogue exploration has its own labelled search. Empty/loading/error states remain explicit and do not fabricate Teachers. Cards currently use initials and subject-based gradient covers because public Tutor photo upload has not been implemented; no stock portrait is presented as a real Tutor.

White surfaces, softer borders, compact navigation, coral controls, consistent spacing and responsive cards apply to the existing UI. Existing entrance/hover effects remain bounded and reduced-motion overrides disable the new motion. The public card redesign retains approved-offer links and exact rate/trial details. Private account/staff authorization and all backend rules are unchanged.

Verification:

- Root typecheck and production build passed; all 9 UI unit tests passed.
- Desktop (1440×1050) and mobile (390×844) screenshots were inspected; neither layout had horizontal overflow. Local previews are ignored under `.local/ui-preview/`.
- All seven browser journeys have passing evidence: six passed in the initial full run and the Guardian journey passed on a fresh isolated rerun (33.8 seconds). The initial Guardian signup timed out during an unusually long interruption (29-minute test duration); no claimed application fix was needed. The catalogue test now targets its dedicated exploration field, and mobile discovery checks the new homepage Maths alias search. Existing real offer/detail, privacy, availability, account and staff flows also passed.

This is a UI refresh, separate from the numbered production implementation tickets. Task 09 remains the next dependency-ready marketplace slice. Real Tutor photos, Reviews/favourites and launch dependencies remain separate features rather than decorative fake controls or data.
