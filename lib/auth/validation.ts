import { z } from "zod";

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email({ error: "Enter a valid email address." }));

export const passwordSchema = z
  .string()
  .min(10, { error: "Use at least 10 characters." })
  .max(72, { error: "Use 72 characters or fewer." })
  .regex(/[A-Za-z]/, { error: "Include at least one letter." })
  .regex(/[0-9]/, { error: "Include at least one number." });

export const signUpSchema = z.object({ email: emailSchema, password: passwordSchema });
export const signInSchema = z.object({ email: emailSchema, password: z.string().min(1, { error: "Enter your password." }) });
