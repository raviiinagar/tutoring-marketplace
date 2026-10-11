import { z } from "zod";

export const RegistrationSchema = z.strictObject({
  display_name: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().max(254).pipe(z.email()),
  password: z.string().min(12).max(128),
});
export const LoginSchema = z.strictObject({
  email: z.string().trim().toLowerCase().max(254).pipe(z.email()),
  password: z.string().min(1).max(128),
});
export const VerificationSchema = z.strictObject({
  token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
});
export type Registration = z.infer<typeof RegistrationSchema>;
export type Login = z.infer<typeof LoginSchema>;
export const RecoverySchema = z.strictObject({ email: RegistrationSchema.shape.email });
export const PasswordResetSchema = z.strictObject({ token: VerificationSchema.shape.token, password: RegistrationSchema.shape.password });
export const RolesSchema = z.strictObject({ roles: z.array(z.enum(['LEARNER','TUTOR'])).min(1).max(2).refine(roles => new Set(roles).size === roles.length) });
export type AccountRole = 'LEARNER' | 'TUTOR';
export interface Account {
  id: string;
  display_name: string;
  email: string;
  email_verified: true;
  created_at: string;
  roles: AccountRole[];
}
export interface ApiError {
  code: string;
  message: string;
  correlation_id: string;
  field_errors?: Record<string, string[]>;
}

