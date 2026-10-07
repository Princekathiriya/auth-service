import { z } from 'zod';

const email = z.string().trim().toLowerCase().pipe(z.email());
// Max length matters: hashing a 1MB "password" is a cheap way to burn CPU.
const newPassword = z.string().min(8, 'Password must be at least 8 characters').max(128);
const token = z.string().min(20).max(200);

// z.object strips unknown keys, so a client sending { role: 'admin' } can't
// promote itself (a "mass assignment" attack).
export const registerSchema = z.object({
  email,
  name: z.string().trim().min(1).max(100),
  password: newPassword,
});

export const loginSchema = z.object({
  email,
  password: z.string().min(1).max(128),
});

export const verifyEmailSchema = z.object({ token });
export const forgotPasswordSchema = z.object({ email });
export const resetPasswordSchema = z.object({ token, password: newPassword });

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
