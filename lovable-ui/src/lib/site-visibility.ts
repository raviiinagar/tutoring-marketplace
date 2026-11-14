/**
 * Homepage sections the owner has hidden for now (14 November 2026). Nothing is deleted:
 * set a section back to `true` and redeploy the frontend to show it again.
 *
 * - `teachingOffers`: "Meet your next teacher", the grid of teaching offers.
 * - `howItWorks`: "A little curiosity. The right teacher." and the subject chips under it.
 * - `subjectExplorer`: "What would you like to learn?", the subject and exam browser.
 */
const owner = {
  teachingOffers: false,
  howItWorks: false,
  subjectExplorer: false,
};

export type HomepageSection = keyof typeof owner;

// The local browser test stack sets this so hidden features keep their end-to-end tests.
const showAll = import.meta.env["VITE_SHOW_HIDDEN_SECTIONS"] === "true";

export const homepageSections: Record<HomepageSection, boolean> = showAll
  ? { teachingOffers: true, howItWorks: true, subjectExplorer: true }
  : owner;
