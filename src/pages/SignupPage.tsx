import { useState, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link, useNavigate } from 'react-router-dom';
import { useDropzone } from 'react-dropzone';
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  User,
  Calendar,
  MapPin,
  Building2,
  Hash,
  FileCheck,
  Upload,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  Shield,
  Loader2,
  Camera,
  CreditCard,
  X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import { useAuthStore } from '../store/authStore';

// ---------------------------------------------------------------------------
// Validation Schemas
// ---------------------------------------------------------------------------

const accountSchema = z
  .object({
    email: z.string().min(1, 'Email is required').email('Enter a valid email'),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .regex(/[A-Z]/, 'Must contain an uppercase letter')
      .regex(/[a-z]/, 'Must contain a lowercase letter')
      .regex(/[0-9]/, 'Must contain a number')
      .regex(/[^A-Za-z0-9]/, 'Must contain a special character'),
    confirmPassword: z.string().min(1, 'Please confirm your password'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

const personalSchema = z.object({
  firstName: z
    .string()
    .min(1, 'First name is required')
    .min(2, 'At least 2 characters'),
  lastName: z
    .string()
    .min(1, 'Last name is required')
    .min(2, 'At least 2 characters'),
  dateOfBirth: z
    .string()
    .min(1, 'Date of birth is required')
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

const addressSchema = z.object({
  addressLine1: z.string().min(1, 'Address is required'),
  addressLine2: z.string().optional(),
  city: z.string().min(1, 'City is required'),
  state: z.string().min(1, 'State is required'),
  zipCode: z
    .string()
    .min(1, 'ZIP code is required')
    .regex(/^\d{5}(-\d{4})?$/, 'Enter a valid ZIP code'),
  country: z.string().min(1, 'Country is required'),
});

const identitySchema = z.object({
  ssn: z
    .string()
    .min(1, 'SSN is required')
    .regex(/^\d{3}-?\d{2}-?\d{4}$/, 'Enter a valid SSN (XXX-XX-XXXX)'),
  documentType: z.enum(['drivers_license', 'passport'], {
    required_error: 'Select a document type',
  }),
});

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------

type AccountValues = z.infer<typeof accountSchema>;
type PersonalValues = z.infer<typeof personalSchema>;
type AddressValues = z.infer<typeof addressSchema>;
type IdentityValues = z.infer<typeof identitySchema>;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STEPS = ['Account', 'Personal', 'Address', 'Identity'] as const;

const COUNTRIES = [
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

const ACCEPTED_FILE_TYPES: Record<string, string[]> = {
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'application/pdf': ['.pdf'],
};

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

// ---------------------------------------------------------------------------
// Style tokens (mirroring LoginPage)
// ---------------------------------------------------------------------------

const INPUT_BASE = clsx(
  'w-full bg-[var(--bg-tertiary)] border border-[var(--border-primary)]',
  'text-[var(--text-primary)] placeholder:text-[var(--text-muted)]',
  'rounded-xl px-4 py-3 pl-11',
  'outline-none transition-all duration-200',
  'focus:border-[var(--accent-primary)] focus:ring-1 focus:ring-[var(--accent-primary)]',
);

const INPUT_NO_ICON = clsx(
  'w-full bg-[var(--bg-tertiary)] border border-[var(--border-primary)]',
  'text-[var(--text-primary)] placeholder:text-[var(--text-muted)]',
  'rounded-xl px-4 py-3',
  'outline-none transition-all duration-200',
  'focus:border-[var(--accent-primary)] focus:ring-1 focus:ring-[var(--accent-primary)]',
);

const SELECT_BASE = clsx(
  'w-full bg-[var(--bg-tertiary)] border border-[var(--border-primary)]',
  'text-[var(--text-primary)]',
  'rounded-xl px-4 py-3 pl-11',
  'outline-none transition-all duration-200 appearance-none',
  'focus:border-[var(--accent-primary)] focus:ring-1 focus:ring-[var(--accent-primary)]',
);

const ICON_LEFT =
  'pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-[18px] w-[18px] text-[var(--text-muted)]';

const LABEL =
  'block text-sm font-medium text-[var(--text-secondary)] mb-1.5';

const ERROR_TEXT = 'mt-1.5 text-xs text-[var(--danger)]';

// ---------------------------------------------------------------------------
// Step Indicator
// ---------------------------------------------------------------------------

function StepIndicator({ currentStep }: { currentStep: number }) {
  return (
    <div className="flex items-center justify-center mb-8">
      {STEPS.map((label, index) => {
        const isCompleted = index < currentStep;
        const isCurrent = index === currentStep;
        const isFuture = index > currentStep;

        return (
          <div key={label} className="flex items-center">
            {/* Step circle */}
            <div className="flex flex-col items-center">
              <div
                className={clsx(
                  'flex items-center justify-center w-10 h-10 rounded-full',
                  'text-sm font-semibold transition-all duration-300',
                  isCompleted && [
                    'bg-gradient-to-r from-indigo-600 to-purple-600',
                    'text-white shadow-lg shadow-indigo-500/20',
                  ],
                  isCurrent && [
                    'bg-gradient-to-r from-indigo-600 to-purple-600',
                    'text-white shadow-lg shadow-indigo-500/30',
                    'ring-4 ring-indigo-500/20',
                  ],
                  isFuture && [
                    'bg-[var(--bg-tertiary)] border-2 border-[var(--border-primary)]',
                    'text-[var(--text-muted)]',
                  ],
                )}
              >
                {isCompleted ? (
                  <CheckCircle2 className="h-5 w-5" />
                ) : (
                  <span>{index + 1}</span>
                )}
              </div>
              <span
                className={clsx(
                  'mt-2 text-xs font-medium transition-colors duration-200',
                  isCompleted && 'text-[var(--accent-primary)]',
                  isCurrent && 'text-[var(--text-primary)]',
                  isFuture && 'text-[var(--text-muted)]',
                )}
              >
                {label}
              </span>
            </div>

            {/* Connecting line */}
            {index < STEPS.length - 1 && (
              <div
                className={clsx(
                  'w-12 sm:w-16 h-[2px] mx-2 mb-6 rounded-full transition-colors duration-300',
                  index < currentStep
                    ? 'bg-gradient-to-r from-indigo-600 to-purple-600'
                    : 'bg-[var(--border-primary)]',
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SSN Input (masked display)
// ---------------------------------------------------------------------------

function formatSSNDisplay(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length <= 3) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5, 9)}`;
}

function maskSSN(formatted: string): string {
  // Show dots for everything except the last 4 digits
  const digits = formatted.replace(/\D/g, '');
  if (digits.length <= 4) return formatted;

  const masked = formatted.split('').map((char, i) => {
    if (char === '-') return '-';
    // Count the digit position (ignoring dashes)
    const digitsBefore = formatted.slice(0, i + 1).replace(/\D/g, '').length;
    const totalDigits = digits.length;
    if (digitsBefore <= totalDigits - 4) return '\u2022';
    return char;
  });
  return masked.join('');
}

// ---------------------------------------------------------------------------
// SignupPage
// ---------------------------------------------------------------------------

export default function SignupPage() {
  const navigate = useNavigate();
  const authRegister = useAuthStore((s) => s.register);
  const uploadDocument = useAuthStore((s) => s.uploadDocument);
  const submitKYC = useAuthStore((s) => s.submitKYC);

  // ---- Wizard state -------------------------------------------------------

  const [currentStep, setCurrentStep] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Cross-step data storage
  const [accountData, setAccountData] = useState<AccountValues | null>(null);
  const [personalData, setPersonalData] = useState<PersonalValues | null>(null);
  const [addressData, setAddressData] = useState<AddressValues | null>(null);

  // Document upload
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [documentPreview, setDocumentPreview] = useState<string | null>(null);

  // Password visibility
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // SSN masking state
  const [ssnFocused, setSsnFocused] = useState(false);

  // ---- Step 1: Account form -----------------------------------------------

  const accountForm = useForm<AccountValues>({
    resolver: zodResolver(accountSchema),
    defaultValues: {
      email: accountData?.email ?? '',
      password: accountData?.password ?? '',
      confirmPassword: accountData?.confirmPassword ?? '',
    },
  });

  // ---- Step 2: Personal form ----------------------------------------------

  const personalForm = useForm<PersonalValues>({
    resolver: zodResolver(personalSchema),
    defaultValues: {
      firstName: personalData?.firstName ?? '',
      lastName: personalData?.lastName ?? '',
      dateOfBirth: personalData?.dateOfBirth ?? '',
    },
  });

  // ---- Step 3: Address form -----------------------------------------------

  const addressForm = useForm<AddressValues>({
    resolver: zodResolver(addressSchema),
    defaultValues: {
      addressLine1: addressData?.addressLine1 ?? '',
      addressLine2: addressData?.addressLine2 ?? '',
      city: addressData?.city ?? '',
      state: addressData?.state ?? '',
      zipCode: addressData?.zipCode ?? '',
      country: addressData?.country ?? 'United States',
    },
  });

  // ---- Step 4: Identity form ----------------------------------------------

  const identityForm = useForm<IdentityValues>({
    resolver: zodResolver(identitySchema),
    defaultValues: {
      ssn: '',
      documentType: undefined,
    },
  });

  // ---- Document dropzone --------------------------------------------------

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      const file = acceptedFiles[0];
      if (!file) return;

      if (file.size > MAX_FILE_SIZE) {
        toast.error('File must be under 10 MB');
        return;
      }

      setDocumentFile(file);

      // Generate preview for images
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = () => {
          setDocumentPreview(reader.result as string);
        };
        reader.readAsDataURL(file);
      } else {
        // PDF -- no image preview
        setDocumentPreview(null);
      }
    },
    [],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED_FILE_TYPES,
    maxFiles: 1,
    maxSize: MAX_FILE_SIZE,
    onDropRejected: (rejections) => {
      const rejection = rejections[0];
      if (rejection) {
        const error = rejection.errors[0];
        if (error?.code === 'file-too-large') {
          toast.error('File must be under 10 MB');
        } else if (error?.code === 'file-invalid-type') {
          toast.error('Only JPG, PNG, and PDF files are accepted');
        } else {
          toast.error(error?.message ?? 'Invalid file');
        }
      }
    },
  });

  const removeDocument = useCallback(() => {
    setDocumentFile(null);
    setDocumentPreview(null);
  }, []);

  // ---- Navigation ---------------------------------------------------------

  const goBack = () => {
    if (currentStep === 1) {
      setPersonalData(personalForm.getValues());
    } else if (currentStep === 2) {
      setAddressData(addressForm.getValues());
    }
    setCurrentStep((prev) => Math.max(0, prev - 1));
  };

  const handleAccountNext = accountForm.handleSubmit((values) => {
    setAccountData(values);
    setCurrentStep(1);
  });

  const handlePersonalNext = personalForm.handleSubmit((values) => {
    setPersonalData(values);
    setCurrentStep(2);
  });

  const handleAddressNext = addressForm.handleSubmit((values) => {
    setAddressData(values);
    setCurrentStep(3);
  });

  // ---- Final submission ---------------------------------------------------

  const handleFinalSubmit = identityForm.handleSubmit(async (identityValues) => {
    if (!documentFile) {
      toast.error('Please upload an identity document');
      return;
    }

    if (!accountData || !personalData || !addressData) {
      toast.error('Missing information from a previous step');
      return;
    }

    setIsSubmitting(true);

    try {
      // 1. Register the account
      await authRegister({
        email: accountData.email,
        password: accountData.password,
      });

      // 2. Upload the identity document
      await uploadDocument(documentFile, identityValues.documentType);

      // 3. Submit KYC data
      await submitKYC({
        firstName: personalData.firstName,
        lastName: personalData.lastName,
        dateOfBirth: personalData.dateOfBirth,
        ssn: identityValues.ssn,
        addressLine1: addressData.addressLine1,
        addressLine2: addressData.addressLine2,
        city: addressData.city,
        state: addressData.state,
        zipCode: addressData.zipCode,
        country: addressData.country,
        documentType: identityValues.documentType,
      });

      toast.success('Account created! Your identity verification is being reviewed.');
      navigate('/pending-approval');
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Registration failed. Please try again.';
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  });

  // ---- SSN helpers --------------------------------------------------------

  const handleSSNChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, '').slice(0, 9);
    const formatted = formatSSNDisplay(raw);
    identityForm.setValue('ssn', formatted, { shouldValidate: true });
  };

  const ssnValue = identityForm.watch('ssn');
  const displaySSN = ssnFocused ? ssnValue : maskSSN(ssnValue);

  // ---- Step renderers -----------------------------------------------------

  const renderStep1 = () => (
    <form onSubmit={handleAccountNext} noValidate className="space-y-5">
      {/* Email */}
      <div>
        <label htmlFor="email" className={LABEL}>
          Email address
        </label>
        <div className="relative">
          <Mail className={ICON_LEFT} />
          <input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            className={clsx(
              INPUT_BASE,
              accountForm.formState.errors.email && 'border-[var(--danger)]',
            )}
            {...accountForm.register('email')}
          />
        </div>
        {accountForm.formState.errors.email && (
          <p className={ERROR_TEXT}>
            {accountForm.formState.errors.email.message}
          </p>
        )}
      </div>

      {/* Password */}
      <div>
        <label htmlFor="password" className={LABEL}>
          Password
        </label>
        <div className="relative">
          <Lock className={ICON_LEFT} />
          <input
            id="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            placeholder="Create a strong password"
            className={clsx(
              INPUT_BASE,
              'pr-11',
              accountForm.formState.errors.password && 'border-[var(--danger)]',
            )}
            {...accountForm.register('password')}
          />
          <button
            type="button"
            tabIndex={-1}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            onClick={() => setShowPassword((v) => !v)}
            className={clsx(
              'absolute right-3 top-1/2 -translate-y-1/2',
              'text-[var(--text-muted)] hover:text-[var(--text-secondary)]',
              'transition-colors duration-150',
            )}
          >
            {showPassword ? (
              <EyeOff className="h-[18px] w-[18px]" />
            ) : (
              <Eye className="h-[18px] w-[18px]" />
            )}
          </button>
        </div>
        {accountForm.formState.errors.password && (
          <p className={ERROR_TEXT}>
            {accountForm.formState.errors.password.message}
          </p>
        )}
      </div>

      {/* Confirm Password */}
      <div>
        <label htmlFor="confirmPassword" className={LABEL}>
          Confirm password
        </label>
        <div className="relative">
          <Lock className={ICON_LEFT} />
          <input
            id="confirmPassword"
            type={showConfirm ? 'text' : 'password'}
            autoComplete="new-password"
            placeholder="Re-enter your password"
            className={clsx(
              INPUT_BASE,
              'pr-11',
              accountForm.formState.errors.confirmPassword &&
                'border-[var(--danger)]',
            )}
            {...accountForm.register('confirmPassword')}
          />
          <button
            type="button"
            tabIndex={-1}
            aria-label={
              showConfirm ? 'Hide confirm password' : 'Show confirm password'
            }
            onClick={() => setShowConfirm((v) => !v)}
            className={clsx(
              'absolute right-3 top-1/2 -translate-y-1/2',
              'text-[var(--text-muted)] hover:text-[var(--text-secondary)]',
              'transition-colors duration-150',
            )}
          >
            {showConfirm ? (
              <EyeOff className="h-[18px] w-[18px]" />
            ) : (
              <Eye className="h-[18px] w-[18px]" />
            )}
          </button>
        </div>
        {accountForm.formState.errors.confirmPassword && (
          <p className={ERROR_TEXT}>
            {accountForm.formState.errors.confirmPassword.message}
          </p>
        )}
      </div>

      {/* Navigation */}
      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          className={clsx(
            'flex-1 flex items-center justify-center gap-2',
            'bg-gradient-to-r from-indigo-600 to-purple-600',
            'hover:from-indigo-500 hover:to-purple-500',
            'text-white font-semibold',
            'rounded-xl px-4 py-3',
            'transition-all duration-200',
            'shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/30',
          )}
        >
          <span>Continue</span>
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </form>
  );

  const renderStep2 = () => (
    <form onSubmit={handlePersonalNext} noValidate className="space-y-5">
      {/* First Name */}
      <div>
        <label htmlFor="firstName" className={LABEL}>
          First name
        </label>
        <div className="relative">
          <User className={ICON_LEFT} />
          <input
            id="firstName"
            type="text"
            autoComplete="given-name"
            placeholder="John"
            className={clsx(
              INPUT_BASE,
              personalForm.formState.errors.firstName &&
                'border-[var(--danger)]',
            )}
            {...personalForm.register('firstName')}
          />
        </div>
        {personalForm.formState.errors.firstName && (
          <p className={ERROR_TEXT}>
            {personalForm.formState.errors.firstName.message}
          </p>
        )}
      </div>

      {/* Last Name */}
      <div>
        <label htmlFor="lastName" className={LABEL}>
          Last name
        </label>
        <div className="relative">
          <User className={ICON_LEFT} />
          <input
            id="lastName"
            type="text"
            autoComplete="family-name"
            placeholder="Doe"
            className={clsx(
              INPUT_BASE,
              personalForm.formState.errors.lastName &&
                'border-[var(--danger)]',
            )}
            {...personalForm.register('lastName')}
          />
        </div>
        {personalForm.formState.errors.lastName && (
          <p className={ERROR_TEXT}>
            {personalForm.formState.errors.lastName.message}
          </p>
        )}
      </div>

      {/* Date of Birth */}
      <div>
        <label htmlFor="dateOfBirth" className={LABEL}>
          Date of birth
        </label>
        <div className="relative">
          <Calendar className={ICON_LEFT} />
          <input
            id="dateOfBirth"
            type="date"
            autoComplete="bday"
            className={clsx(
              INPUT_BASE,
              '[color-scheme:dark]',
              personalForm.formState.errors.dateOfBirth &&
                'border-[var(--danger)]',
            )}
            {...personalForm.register('dateOfBirth')}
          />
        </div>
        {personalForm.formState.errors.dateOfBirth && (
          <p className={ERROR_TEXT}>
            {personalForm.formState.errors.dateOfBirth.message}
          </p>
        )}
      </div>

      {/* Navigation */}
      <div className="flex gap-3 pt-2">
        <button
          type="button"
          onClick={goBack}
          className={clsx(
            'flex items-center justify-center gap-2',
            'bg-[var(--bg-tertiary)] border border-[var(--border-primary)]',
            'text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
            'hover:border-[var(--border-hover)]',
            'font-semibold rounded-xl px-5 py-3',
            'transition-all duration-200',
          )}
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back</span>
        </button>
        <button
          type="submit"
          className={clsx(
            'flex-1 flex items-center justify-center gap-2',
            'bg-gradient-to-r from-indigo-600 to-purple-600',
            'hover:from-indigo-500 hover:to-purple-500',
            'text-white font-semibold',
            'rounded-xl px-4 py-3',
            'transition-all duration-200',
            'shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/30',
          )}
        >
          <span>Continue</span>
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </form>
  );

  const renderStep3 = () => (
    <form onSubmit={handleAddressNext} noValidate className="space-y-5">
      {/* Address Line 1 */}
      <div>
        <label htmlFor="addressLine1" className={LABEL}>
          Address line 1
        </label>
        <div className="relative">
          <MapPin className={ICON_LEFT} />
          <input
            id="addressLine1"
            type="text"
            autoComplete="address-line1"
            placeholder="123 Main Street"
            className={clsx(
              INPUT_BASE,
              addressForm.formState.errors.addressLine1 &&
                'border-[var(--danger)]',
            )}
            {...addressForm.register('addressLine1')}
          />
        </div>
        {addressForm.formState.errors.addressLine1 && (
          <p className={ERROR_TEXT}>
            {addressForm.formState.errors.addressLine1.message}
          </p>
        )}
      </div>

      {/* Address Line 2 */}
      <div>
        <label htmlFor="addressLine2" className={LABEL}>
          Address line 2{' '}
          <span className="text-[var(--text-muted)] font-normal">
            (optional)
          </span>
        </label>
        <div className="relative">
          <Building2 className={ICON_LEFT} />
          <input
            id="addressLine2"
            type="text"
            autoComplete="address-line2"
            placeholder="Apt, Suite, Unit, etc."
            className={INPUT_BASE}
            {...addressForm.register('addressLine2')}
          />
        </div>
      </div>

      {/* City & State row */}
      <div className="grid grid-cols-2 gap-4">
        {/* City */}
        <div>
          <label htmlFor="city" className={LABEL}>
            City
          </label>
          <input
            id="city"
            type="text"
            autoComplete="address-level2"
            placeholder="New York"
            className={clsx(
              INPUT_NO_ICON,
              addressForm.formState.errors.city && 'border-[var(--danger)]',
            )}
            {...addressForm.register('city')}
          />
          {addressForm.formState.errors.city && (
            <p className={ERROR_TEXT}>
              {addressForm.formState.errors.city.message}
            </p>
          )}
        </div>

        {/* State */}
        <div>
          <label htmlFor="state" className={LABEL}>
            State
          </label>
          <input
            id="state"
            type="text"
            autoComplete="address-level1"
            placeholder="NY"
            className={clsx(
              INPUT_NO_ICON,
              addressForm.formState.errors.state && 'border-[var(--danger)]',
            )}
            {...addressForm.register('state')}
          />
          {addressForm.formState.errors.state && (
            <p className={ERROR_TEXT}>
              {addressForm.formState.errors.state.message}
            </p>
          )}
        </div>
      </div>

      {/* ZIP & Country row */}
      <div className="grid grid-cols-2 gap-4">
        {/* ZIP Code */}
        <div>
          <label htmlFor="zipCode" className={LABEL}>
            ZIP code
          </label>
          <div className="relative">
            <Hash className={ICON_LEFT} />
            <input
              id="zipCode"
              type="text"
              autoComplete="postal-code"
              placeholder="10001"
              maxLength={10}
              className={clsx(
                INPUT_BASE,
                addressForm.formState.errors.zipCode &&
                  'border-[var(--danger)]',
              )}
              {...addressForm.register('zipCode')}
            />
          </div>
          {addressForm.formState.errors.zipCode && (
            <p className={ERROR_TEXT}>
              {addressForm.formState.errors.zipCode.message}
            </p>
          )}
        </div>

        {/* Country */}
        <div>
          <label htmlFor="country" className={LABEL}>
            Country
          </label>
          <div className="relative">
            <MapPin className={ICON_LEFT} />
            <select
              id="country"
              autoComplete="country-name"
              className={clsx(
                SELECT_BASE,
                addressForm.formState.errors.country &&
                  'border-[var(--danger)]',
              )}
              {...addressForm.register('country')}
            >
              {COUNTRIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          {addressForm.formState.errors.country && (
            <p className={ERROR_TEXT}>
              {addressForm.formState.errors.country.message}
            </p>
          )}
        </div>
      </div>

      {/* Navigation */}
      <div className="flex gap-3 pt-2">
        <button
          type="button"
          onClick={goBack}
          className={clsx(
            'flex items-center justify-center gap-2',
            'bg-[var(--bg-tertiary)] border border-[var(--border-primary)]',
            'text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
            'hover:border-[var(--border-hover)]',
            'font-semibold rounded-xl px-5 py-3',
            'transition-all duration-200',
          )}
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back</span>
        </button>
        <button
          type="submit"
          className={clsx(
            'flex-1 flex items-center justify-center gap-2',
            'bg-gradient-to-r from-indigo-600 to-purple-600',
            'hover:from-indigo-500 hover:to-purple-500',
            'text-white font-semibold',
            'rounded-xl px-4 py-3',
            'transition-all duration-200',
            'shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/30',
          )}
        >
          <span>Continue</span>
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </form>
  );

  const renderStep4 = () => (
    <form onSubmit={handleFinalSubmit} noValidate className="space-y-5">
      {/* SSN */}
      <div>
        <label htmlFor="ssn" className={LABEL}>
          Social Security Number
        </label>
        <div className="relative">
          <CreditCard className={ICON_LEFT} />
          <input
            id="ssn"
            type="text"
            autoComplete="off"
            placeholder="XXX-XX-XXXX"
            maxLength={11}
            value={displaySSN}
            onFocus={() => setSsnFocused(true)}
            onBlur={() => setSsnFocused(false)}
            onChange={handleSSNChange}
            className={clsx(
              INPUT_BASE,
              'tracking-widest',
              identityForm.formState.errors.ssn && 'border-[var(--danger)]',
            )}
          />
        </div>
        {identityForm.formState.errors.ssn && (
          <p className={ERROR_TEXT}>
            {identityForm.formState.errors.ssn.message}
          </p>
        )}
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          Your SSN is encrypted and stored securely. Only the last 4 digits are
          displayed.
        </p>
      </div>

      {/* Document Type */}
      <div>
        <label className={LABEL}>Identity document type</label>
        <div className="grid grid-cols-2 gap-3 mt-1">
          {(
            [
              {
                value: 'drivers_license' as const,
                label: "Driver's License",
                icon: CreditCard,
              },
              {
                value: 'passport' as const,
                label: 'Passport',
                icon: FileCheck,
              },
            ] as const
          ).map(({ value, label, icon: Icon }) => {
            const selected = identityForm.watch('documentType') === value;
            return (
              <label
                key={value}
                className={clsx(
                  'relative flex items-center gap-3 p-4 rounded-xl cursor-pointer',
                  'border transition-all duration-200',
                  selected
                    ? 'border-[var(--accent-primary)] bg-[var(--accent-primary)]/10 ring-1 ring-[var(--accent-primary)]'
                    : 'border-[var(--border-primary)] bg-[var(--bg-tertiary)] hover:border-[var(--border-hover)]',
                )}
              >
                <input
                  type="radio"
                  value={value}
                  className="sr-only"
                  {...identityForm.register('documentType')}
                />
                <Icon
                  className={clsx(
                    'h-5 w-5 shrink-0',
                    selected
                      ? 'text-[var(--accent-primary)]'
                      : 'text-[var(--text-muted)]',
                  )}
                />
                <span
                  className={clsx(
                    'text-sm font-medium',
                    selected
                      ? 'text-[var(--text-primary)]'
                      : 'text-[var(--text-secondary)]',
                  )}
                >
                  {label}
                </span>
                {selected && (
                  <CheckCircle2 className="absolute top-2 right-2 h-4 w-4 text-[var(--accent-primary)]" />
                )}
              </label>
            );
          })}
        </div>
        {identityForm.formState.errors.documentType && (
          <p className={ERROR_TEXT}>
            {identityForm.formState.errors.documentType.message}
          </p>
        )}
      </div>

      {/* Document Upload */}
      <div>
        <label className={LABEL}>Upload identity document</label>

        {!documentFile ? (
          <div
            {...getRootProps()}
            className={clsx(
              'mt-1 flex flex-col items-center justify-center gap-3',
              'p-8 rounded-xl cursor-pointer',
              'border-2 border-dashed transition-all duration-200',
              isDragActive
                ? 'border-[var(--accent-primary)] bg-[var(--accent-primary)]/5'
                : 'border-[var(--border-primary)] bg-[var(--bg-tertiary)] hover:border-[var(--border-hover)]',
            )}
          >
            <input {...getInputProps()} />
            <div
              className={clsx(
                'flex items-center justify-center w-12 h-12 rounded-full',
                'bg-[var(--accent-primary)]/10',
              )}
            >
              <Upload
                className={clsx(
                  'h-6 w-6',
                  isDragActive
                    ? 'text-[var(--accent-primary)]'
                    : 'text-[var(--text-muted)]',
                )}
              />
            </div>
            <div className="text-center">
              <p className="text-sm text-[var(--text-secondary)]">
                {isDragActive ? (
                  <span className="text-[var(--accent-primary)] font-medium">
                    Drop your file here
                  </span>
                ) : (
                  <>
                    <span className="text-[var(--accent-primary)] font-medium">
                      Click to upload
                    </span>{' '}
                    or drag and drop
                  </>
                )}
              </p>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                JPG, PNG, or PDF up to 10 MB
              </p>
            </div>
          </div>
        ) : (
          <div
            className={clsx(
              'mt-1 relative rounded-xl overflow-hidden',
              'border border-[var(--border-primary)] bg-[var(--bg-tertiary)]',
              'p-4',
            )}
          >
            {/* Remove button */}
            <button
              type="button"
              onClick={removeDocument}
              className={clsx(
                'absolute top-3 right-3 z-10',
                'flex items-center justify-center w-8 h-8 rounded-full',
                'bg-[var(--bg-primary)]/80 backdrop-blur-sm',
                'border border-[var(--border-primary)]',
                'text-[var(--text-muted)] hover:text-[var(--danger)]',
                'transition-colors duration-150',
              )}
              aria-label="Remove document"
            >
              <X className="h-4 w-4" />
            </button>

            {/* Preview */}
            {documentPreview ? (
              <div className="flex flex-col items-center gap-3">
                <div className="relative w-full max-h-48 rounded-lg overflow-hidden bg-black/20 flex items-center justify-center">
                  <img
                    src={documentPreview}
                    alt="Document preview"
                    className="max-h-48 object-contain rounded-lg"
                  />
                </div>
                <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                  <Camera className="h-4 w-4 text-[var(--accent-primary)]" />
                  <span className="truncate max-w-[250px]">
                    {documentFile.name}
                  </span>
                  <span className="text-[var(--text-muted)] text-xs">
                    ({(documentFile.size / 1024 / 1024).toFixed(2)} MB)
                  </span>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3 py-2">
                <div
                  className={clsx(
                    'flex items-center justify-center w-10 h-10 rounded-lg',
                    'bg-[var(--accent-primary)]/10',
                  )}
                >
                  <FileCheck className="h-5 w-5 text-[var(--accent-primary)]" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[var(--text-primary)] truncate">
                    {documentFile.name}
                  </p>
                  <p className="text-xs text-[var(--text-muted)]">
                    PDF &middot;{' '}
                    {(documentFile.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                </div>
                <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex gap-3 pt-2">
        <button
          type="button"
          onClick={goBack}
          disabled={isSubmitting}
          className={clsx(
            'flex items-center justify-center gap-2',
            'bg-[var(--bg-tertiary)] border border-[var(--border-primary)]',
            'text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
            'hover:border-[var(--border-hover)]',
            'font-semibold rounded-xl px-5 py-3',
            'transition-all duration-200',
            'disabled:opacity-50 disabled:cursor-not-allowed',
          )}
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back</span>
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className={clsx(
            'flex-1 flex items-center justify-center gap-2',
            'bg-gradient-to-r from-indigo-600 to-purple-600',
            'hover:from-indigo-500 hover:to-purple-500',
            'text-white font-semibold',
            'rounded-xl px-4 py-3',
            'transition-all duration-200',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            'shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/30',
          )}
        >
          {isSubmitting ? (
            <>
              <Loader2 className="h-[18px] w-[18px] animate-spin" />
              <span>Creating account...</span>
            </>
          ) : (
            <>
              <Shield className="h-[18px] w-[18px]" />
              <span>Submit Verification</span>
            </>
          )}
        </button>
      </div>
    </form>
  );

  // ---- Step metadata for header -------------------------------------------

  const stepMeta = [
    {
      title: 'Create your account',
      description: 'Start with your email and a secure password',
    },
    {
      title: 'Personal information',
      description: 'Tell us a bit about yourself',
    },
    {
      title: 'Your address',
      description: 'We need this for regulatory compliance',
    },
    {
      title: 'Identity verification',
      description: 'Final step -- verify your identity for KYC',
    },
  ] as const;

  const stepRenderers = [renderStep1, renderStep2, renderStep3, renderStep4];

  // ---- Main render --------------------------------------------------------

  return (
    <div className="gradient-bg-subtle min-h-screen flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg">
        {/* Branding */}
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold tracking-tight">
            <span className="bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
              Fueki
            </span>
          </h1>
          <p className="mt-1.5 text-sm text-[var(--text-muted)] tracking-wide">
            Tokenization Platform
          </p>
        </div>

        {/* Step Indicator */}
        <StepIndicator currentStep={currentStep} />

        {/* Card */}
        <div
          className={clsx(
            'w-full',
            'bg-[var(--bg-secondary)]/80 backdrop-blur-xl',
            'border border-[var(--border-primary)]',
            'rounded-2xl shadow-2xl',
            'p-8 sm:p-10',
          )}
        >
          {/* Step heading */}
          <div className="mb-6">
            <h2 className="text-xl font-semibold text-[var(--text-primary)]">
              {stepMeta[currentStep].title}
            </h2>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              {stepMeta[currentStep].description}
            </p>
          </div>

          {/* Step content */}
          {stepRenderers[currentStep]()}

          {/* Footer link */}
          <p className="mt-6 text-center text-sm text-[var(--text-muted)]">
            Already have an account?{' '}
            <Link
              to="/login"
              className="font-medium text-[var(--accent-primary)] hover:text-indigo-300 transition-colors duration-150"
            >
              Sign in
            </Link>
          </p>

          {/* Security badge */}
          <div className="mt-6 flex items-center justify-center gap-1.5 text-[var(--text-muted)]">
            <Shield className="h-3.5 w-3.5" />
            <span className="text-xs">
              Secured with end-to-end encryption
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
