# Retire child profiles; parents book from their own adult account

On 9 November 2026 the owner asked to simplify the account model by removing the child Learner / Guardian accounts. This supersedes ADR0002 (Guardian-controlled child access) and ADR0006 (Guardian verification before child processing).

Every account is an adult account. A Learner profile is an adult's own profile, created with the existing 18-or-older attestation. Under-18 learning continues through a parent: the parent's adult account is the Learner, the parent books and pays, and Tutors communicate only with the parent. No child profile, child name, age band or Guardian evidence is collected. The enquiry and profile copy tell parents to describe the level and goal without the child's name, school or other identifying details. The owner kept the existing attestation point (Learner profile and Tutor introduction) rather than adding an age check at sign-up.

Child-profile creation, consent renewal, Guardian verification submission and the staff Guardian review queue are retired: their API routes answer 410 `CHILD_PROFILES_RETIRED`, and no verifier can be configured, so no child profile can become usable again. Production never enabled child-data collection (ADR0006's gate stayed closed), so no live child data is expected. Any rows from before this decision are kept read-only and untouched: no table, column or row is dropped or rewritten, and no migration is needed. Such a profile can never be used for an enquiry or a Connection; its owner can still withdraw the consent they gave, and privacy export and erasure still include it.

Any future Community Chat or other open discussion feature admits only eligible adult accounts until a separate minor-safe community design is approved. Adult-only chat within Connections is unchanged.

This decision does not settle legal applicability. Before relying on parent booking at scale, the owner should confirm with legal advice that it meets the Digital Personal Data Protection Act 2023 duties for children's data, given that free-text enquiries can still mention a child.
