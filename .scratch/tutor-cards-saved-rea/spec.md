# Tutor cards and Saved Tutors from REA evidence

Use existing public Tutor projections and the account-specific Saved Tutors API. Preserve photo-led compact cards with name/location overlay, short subject/biography, stated hourly tuition and separate heart controls. No invented reviews, qualification badges or free trials. Exact-offer review/trial metadata stays confined to actual teaching offers.

Observed: Superprof card layout and signed-out heart opens a Tutor-specific Favourites sign-up/login modal. REA MCP passive snapshots/screenshots verify these states; ordinary Playwright actions were used because REA's scenario runner failed. Authenticated competitor persistence/shortlist management remains unobserved.

Implement accessible Tutor-specific sign-in modal, clear server-confirmed saved/removed feedback and shortcut to Saved Tutors; shared pending save state, current account isolation, same existing API and 50-item limit. Improve Saved Tutors page with count, name/subject/city search, Subject filter, browse action, empty/error/unavailable states, removal announcement/focus recovery. Keep own branding/light-yellow accents. Improve public cards using existing photos/data and predictable image/name/heart presentation. Offer cards do not receive a fabricated profile ID or inferred save target: their current projection lacks the public profile identifier.

Keep all authoritative backend/privacy/paid-access semantics. Desktop/mobile, keyboard/focus and server-error/account-switch cases need acceptance evidence. No new backend or schema needed.
