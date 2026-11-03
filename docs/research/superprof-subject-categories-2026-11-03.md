# Superprof subject categories and shortcuts: observed evidence

Inspected the public Indian site on 3 November 2026 through the existing Chrome 156 CDP session. The source is https://www.superprof.co.in/ and its public category/subject pages. No login, private API access, account submission or CAPTCHA bypass was performed.

## Findings and evidence

| Question | Observation | Evidence |
| --- | --- | --- |
| How do homepage shortcuts work? | Icon/name links expose specific Subjects including Maths, Hindi, Physics, French and Computer programming. The browser DOM contained 50 subject links in the shortcut container; this is a bounded page observation, not a claim about the full catalogue. | Current homepage passive REA snapshot `ev_aa66b8f44d57b902a7434a60d649e7fc4e0003c4e85017584b05b931e83af6f9`; ordinary Playwright read of `.search-quick-subject-container`. The earlier [homepage investigation](superprof-homepage-nav-2026-11-03.md) also recorded a successful Physics shortcut navigation. |
| How are broader categories exposed? | Homepage links include Computer Sciences, Languages, Music, Academic support and other broad groupings. Computer Sciences links to `/type-of-lessons/8/computer-sciences.html`. | Ordinary Playwright link/route observation; the destination is independently bound by the following REA capture. |
| What is inside a category? | Computer Sciences has Top disciplines, followed by Discover all disciplines. Groups include Programming languages, Database, Graphics and Web and Mobile Development. The top shortcuts include Computer programming, Basic computer, Python and HTML. | REA passive accessibility capture `ev_14d3b9312d30d4ceea1bb6211c9363b6bebdadb669f0753c144e4bd0983ae761`. [Screenshot](evidence/superprof-subject-category.png), screenshot Evidence `ev_889af8b2e34cce4c5f2db5c6f33f1a6b745b969138cc0799330066154fcf059b`. |
| Where does selecting a subject lead? | Selecting the category's Python link opened `/lessons/python/india/`, with the Python Tutor page title. | Ordinary Playwright click followed by REA passive destination capture `ev_a22f9633c66efc5059890997351ddca1d601cf4c5dd6307ed09793e5faefc878`. |

[Selected REA records](evidence/superprof-subject-categories-2026-11-03.json) include target identities, accessibility excerpts, completeness and limitations. The complete session export is retained locally in ignored `.local/rea-subject-categories-2026-11-03.json`.

## Reconstruction in Tutor Marketplace

The observed pattern is a short route from broad interest to a specific subject and then Tutor results. Our existing eight Learning Domains remain the authoritative broad grouping; they are not renamed to Superprof's taxonomy. The following are adopted project design choices rather than claims about Superprof internals:

- Keep the existing icon carousel and give All subjects a visible position outside its scrolling track. Reuse one shared shortcut definition for carousel and category ordering.
- Show a searchable subject directory with domain filter buttons and compact grouped subject/exam links. Alias matching uses Unicode normalization, so Maths and IIT-JEE resolve to canonical catalogue labels.
- Subject links submit `subject_id`; Exam Tracks submit `exam_id`. Include the selected domain to preserve valid catalogue combinations. View Tutors submits only the domain.
- Full learning-options dialogs also expose correctly typed Learner Level, Curriculum and Teaching Language links. Subjects and teaching languages remain distinct.
- Filter inactive terms, disclose catalogue versus actual supply, retain empty/retry states and avoid invented rankings, Tutor counts or availability.
- Consume the homepage SSR catalogue without an additional request from the category component. Existing unrelated directory/search components retain their own API requests.
- Preserve Tutor Marketplace identity, coral controls and the light-yellow theme. Desktop, 390px and 320px layouts and keyboard focus were exercised locally.

## Limits

REA's interactive scenario runner returned `execution_failure` before navigation. The installed REA 6.5.0 doctor confirmed the Codex registration/runtime alignment; it did not explain this execution error. Navigation and clicks were therefore performed through ordinary Playwright in the selected public tab. All Evidence IDs above refer to actual REA MCP passive observations or its screenshot, not to actions performed by REA. No claim is made about backend taxonomy models, personalization, shortcut ranking, experimentation or hidden subject counts. Desktop competitor evidence was inspected; this pass did not independently inspect its mobile category layout.
