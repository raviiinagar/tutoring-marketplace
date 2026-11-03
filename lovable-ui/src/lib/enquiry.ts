const contactPattern =
  /(?:https?:\/\/|www\.|[\w.+-]+@[\w.-]+\.[a-z]{2,}|\+?\d[\d\s().-]{8,}\d|(?:whatsapp|telegram|instagram)\s*[:@]|@[a-z][\w.]{2,})/i;
export function enquiryTextError(value: string, min: number, max: number): string | undefined {
  const text = value.trim();
  if (text.length < min || text.length > max) return `Use ${min}–${max} characters.`;
  if (contactPattern.test(text))
    return "Keep emails, phone numbers, social handles and links out of the enquiry.";
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text))
    return "Remove control characters.";
  return undefined;
}
/** Only a local public Tutor slug can be resumed after sign-in, never a URL. */
export function enquiryTarget(value: unknown): string | undefined {
  return typeof value === "string" &&
    /^[a-z][a-z0-9-]{0,119}-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(
      value,
    )
    ? value
    : undefined;
}
