import {z} from 'zod';

/**
 * A Tutor whose subject is not in the catalogue picks "Other" and types it (ADR0022).
 * The ad publishes immediately like any other ad; the typed name is public text, so it
 * carries the same no-contact rule as titles and descriptions and stays short.
 */
export const OTHER_SUBJECT_ID='subject-other';

const contactLike=/(?:https?|www\.|@|\.(?:com|in|net|org|io|co|me|app)\b)/i;
export const customSubjectText=z.string()
  .transform(value=>value.normalize('NFKC').replace(/\s+/g,' ').trim())
  .pipe(z.string()
    .min(2,'Type your subject in at least 2 characters.')
    .max(60,'Keep your subject under 60 characters.')
    .regex(/^[\p{L}\p{M}\p{N} &+.,'()/-]+$/u,'Use letters, numbers and simple punctuation for your subject.')
    .refine(value=>/\p{L}/u.test(value),'Your subject needs at least one letter.')
    .refine(value=>!contactLike.test(value)&&!/\d{5,}/.test(value.replace(/[\s().-]/g,'')),'Keep contact details and links out of your subject.'));

/** Case-insensitive key used to match one typed subject with another. */
export const customSubjectKey=(value:string)=>value.normalize('NFKC').toLowerCase().replace(/\s+/g,' ').trim();
