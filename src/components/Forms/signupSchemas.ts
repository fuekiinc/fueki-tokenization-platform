import { z } from 'zod';
export { HELP_LEVEL_OPTIONS } from '../../lib/helpLevels';

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
    acceptTerms: z.literal(true, {
      message: 'You must accept the terms of service',
    }),
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
        return !isNaN(dob.getTime());
      },
      'Enter a valid date',
    )
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
    )
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
        return age <= 120;
      },
      'Please enter a valid date of birth',
    ),
  phone: z
    .string()
    .min(1, 'Enter your phone number')
    .regex(
      /^\+?[1-9]\d{1,14}$/,
      'Enter a valid phone number (e.g., +12125551234)',
    ),
  helpLevel: z.enum(['novice', 'intermediate', 'expert']),
});

export const addressSchema = z.object({
  addressLine1: z.string().min(1, 'Enter your street address'),
  addressLine2: z.string().optional(),
  city: z.string().min(1, 'Enter your city'),
  state: z.string().min(1, 'Enter your state or region'),
  zipCode: z
    .string()
    .min(1, 'Enter your postal code')
    .regex(
      /^[A-Za-z0-9\s\-]{3,10}$/,
      'Enter a valid postal code',
    ),
  country: z.string().min(1, 'Select your country'),
});

export const identitySchema = z.object({
  ssn: z
    .string()
    .min(1, 'Enter your Social Security Number')
    .regex(/^\d{3}-?\d{2}-?\d{4}$/, 'Enter a valid SSN in the format 000-00-0000'),
  documentType: z.enum(['drivers_license', 'passport', 'national_id'], {
    message: 'Select a document type',
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
// Password strength helper
// ---------------------------------------------------------------------------

export type PasswordStrength = 'weak' | 'medium' | 'strong';

export function getPasswordStrength(password: string): PasswordStrength {
  if (!password || password.length < 8) return 'weak';

  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[a-z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  if (score <= 3) return 'weak';
  if (score <= 5) return 'medium';
  return 'strong';
}

export const PASSWORD_STRENGTH_CONFIG: Record<
  PasswordStrength,
  { label: string; color: string; bgColor: string; width: string }
> = {
  weak: {
    label: 'Weak',
    color: 'text-red-400',
    bgColor: 'bg-red-500',
    width: 'w-1/3',
  },
  medium: {
    label: 'Medium',
    color: 'text-amber-400',
    bgColor: 'bg-amber-500',
    width: 'w-2/3',
  },
  strong: {
    label: 'Strong',
    color: 'text-emerald-400',
    bgColor: 'bg-emerald-500',
    width: 'w-full',
  },
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const SIGNUP_STEPS = [
  { label: 'Account', description: 'Email & password' },
  { label: 'Personal', description: 'Your information' },
  { label: 'Address', description: 'Residential address' },
  { label: 'Plan', description: 'Subscription plan' },
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

export const COUNTRY_PHONE_CODES: Record<string, string> = {
  'United States': '+1',
  'Canada': '+1',
  'United Kingdom': '+44',
  'Germany': '+49',
  'France': '+33',
  'Japan': '+81',
  'Australia': '+61',
  'Singapore': '+65',
  'Switzerland': '+41',
  'Netherlands': '+31',
  'Sweden': '+46',
  'Norway': '+47',
  'South Korea': '+82',
  'Brazil': '+55',
  'India': '+91',
  'Mexico': '+52',
  'Ireland': '+353',
  'New Zealand': '+64',
  'Italy': '+39',
  'Spain': '+34',
};

export const STEP_META = [
  {
    title: 'Create your account',
    description: 'Start with your email and password',
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
    title: 'Choose your plan',
    description: 'Select a subscription to access the platform',
  },
  {
    title: 'Identity verification',
    description: 'Final step -- verify your identity',
  },
] as const;
