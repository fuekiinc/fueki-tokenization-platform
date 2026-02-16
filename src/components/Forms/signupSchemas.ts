import { z } from 'zod';

// ---------------------------------------------------------------------------
// Validation Schemas
// ---------------------------------------------------------------------------

export const accountSchema = z
  .object({
    email: z.string().min(1, 'Enter your email address').email('Enter a valid email address'),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .regex(/[A-Z]/, 'Password must contain an uppercase letter')
      .regex(/[a-z]/, 'Password must contain a lowercase letter')
      .regex(/[0-9]/, 'Password must contain a number')
      .regex(/[^A-Za-z0-9]/, 'Password must contain a special character'),
    confirmPassword: z.string().min(1, 'Please confirm your password'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export const personalSchema = z.object({
  firstName: z
    .string()
    .min(1, 'Enter your first name')
    .min(2, 'First name must be at least 2 characters'),
  lastName: z
    .string()
    .min(1, 'Enter your last name')
    .min(2, 'Last name must be at least 2 characters'),
  dateOfBirth: z
    .string()
    .min(1, 'Enter your date of birth')
    .refine(
      (val) => {
        const dob = new Date(val);
        const now = new Date();
        let age = now.getFullYear() - dob.getFullYear();
        const monthDiff = now.getMonth() - dob.getMonth();
        if (
          monthDiff < 0 ||
          (monthDiff === 0 && now.getDate() < dob.getDate())
        ) {
          age--;
        }
        return age >= 18;
      },
      'You must be at least 18 years old',
    ),
});

export const addressSchema = z.object({
  addressLine1: z.string().min(1, 'Enter your street address'),
  addressLine2: z.string().optional(),
  city: z.string().min(1, 'Enter your city'),
  state: z.string().min(1, 'Enter your state or region'),
  zipCode: z
    .string()
    .min(1, 'Enter your ZIP code')
    .regex(/^\d{5}(-\d{4})?$/, 'Enter a valid ZIP code (e.g., 10001 or 10001-1234)'),
  country: z.string().min(1, 'Select your country'),
});

export const identitySchema = z.object({
  ssn: z
    .string()
    .min(1, 'Enter your Social Security Number')
    .regex(/^\d{3}-?\d{2}-?\d{4}$/, 'Enter a valid SSN in the format 000-00-0000'),
  documentType: z.enum(['drivers_license', 'passport'], {
    required_error: 'Select a document type',
  }),
});

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------

export type AccountValues = z.infer<typeof accountSchema>;
export type PersonalValues = z.infer<typeof personalSchema>;
export type AddressValues = z.infer<typeof addressSchema>;
export type IdentityValues = z.infer<typeof identitySchema>;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const SIGNUP_STEPS = [
  { label: 'Account', description: 'Email & password' },
  { label: 'Personal', description: 'Your information' },
  { label: 'Address', description: 'Residential address' },
  { label: 'Identity', description: 'Verification' },
] as const;

export const COUNTRIES = [
  'United States',
  'Canada',
  'United Kingdom',
  'Germany',
  'France',
  'Japan',
  'Australia',
  'Singapore',
  'Switzerland',
  'Netherlands',
  'Sweden',
  'Norway',
  'South Korea',
  'Brazil',
  'India',
  'Mexico',
  'Ireland',
  'New Zealand',
  'Italy',
  'Spain',
] as const;

export const STEP_META = [
  {
    title: 'Create your account',
    description: 'Start with your email and a secure password',
  },
  {
    title: 'Personal information',
    description: 'Tell us about yourself for identity verification',
  },
  {
    title: 'Your address',
    description: 'Required for regulatory compliance',
  },
  {
    title: 'Identity verification',
    description: 'Final step -- verify your identity',
  },
] as const;
