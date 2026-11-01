# Subject, class location and Tutor availability

Owner decision, 1 November 2026: extend the India marketplace to online and in-person teaching; search by city/area with an Online option; show whether Tutors accept new students and their usual weekly teaching slots. Preserve the larger Tutor portraits and light-yellow Lovable UI.

Save public coarse location, teaching modes and weekly availability independently of identity onboarding, with optimistic revision checks. No house address, precise coordinates or identity-document address is collected for public search. All weekly slots use explicit Asia/Kolkata/IST, validate day/time and reject overlap. These are self-declared preferences, not bookings or proof that a Tutor is free at a particular instant.

Profiles remain public after identity approval even without Tutor Pro. Profiles show declared location/availability honestly; existing profiles with no saved settings show availability not shared. Published offers, paid checkout and new enquiries additionally require accepting status and the offer's supported mode. In-person offers require a saved city; changing a published in-person location or disabling its mode requires offer resubmission. A pause on accepting new students does not invalidate existing covered enquiries or safe Connections. Existing identity, safety, payment, Guardian and public-contact rules remain authoritative.

Search has accessible subject/exam suggestions, city/area suggestions from eligible public Tutor profiles, Online choice, persisted URL filters, and optional preferred day/time in IST. No paid geocoding account, GPS permission or fabricated distance is needed for city/area matching. Filters apply to profile and offer results; exact-offer taxonomy matching remains separate from profile Subject declarations.

Acceptance: real PostgreSQL tests for location/mode/time filters, invalid and stale writes, privacy, publication, pause versus existing-enquiry behavior, and offline enquiry mode; UI and desktop/mobile/keyboard browser checks; sandbox then main deployment with migration/backup evidence. Preserve Super Admin boundaries, the current testing-MFA cutoff and compute deadline.
