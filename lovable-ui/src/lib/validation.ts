export type FieldErrors = { display_name?: string | undefined; email?: string | undefined; password?: string | undefined };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

export function validateDisplayName(raw: string): string | undefined {
  const v = raw.trim();
  if (!v) return "Enter your name.";
  if (v.length < 2) return "Name must be at least 2 characters.";
  if (v.length > 80) return "Name must be 80 characters or fewer.";
  return undefined;
}

export function validateEmail(raw: string): string | undefined {
  const v = raw.trim();
  if (!v) return "Enter your email address.";
  if (v.length > 254) return "Email must be 254 characters or fewer.";
  if (!EMAIL_RE.test(v)) return "Enter a valid email address, like name@example.com.";
  return undefined;
}

/** Passwords are never trimmed. */
export function validateNewPassword(pw: string): string | undefined {
  if (!pw) return "Enter a password.";
  if (pw.length < 12) return "Password must be at least 12 characters.";
  if (pw.length > 128) return "Password must be 128 characters or fewer.";
  return undefined;
}

export function validateSignInPassword(pw: string): string | undefined {
  if (!pw) return "Enter your password.";
  return undefined;
}

export function mergeServerFieldErrors(fe?: Record<string, string[]>): FieldErrors {
  const out: Record<string, string> = {};
  if (!fe) return out;
  for (const [k, v] of Object.entries(fe)) if (v?.length) out[k] = v.join(" ");
  return out as FieldErrors;
}

export function hasErrors(e: FieldErrors) {
  return Object.values(e).some(Boolean);
}
