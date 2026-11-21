/**
 * How Tutors reach the team for assisted onboarding (ADR0018). Set `email` to the team
 * address once there is one; the pages show only the channels set here.
 */
export const teamContact = {
  /** WhatsApp number in international form, digits only, for wa.me links. */
  whatsapp: "918233598649",
  whatsappDisplay: "+91 82335 98649",
  email: "veer.work.localtest@gmail.com" as string | null,
};

export function whatsappLink(message: string) {
  return `https://wa.me/${teamContact.whatsapp}?text=${encodeURIComponent(message)}`;
}
