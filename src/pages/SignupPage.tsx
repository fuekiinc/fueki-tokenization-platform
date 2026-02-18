import { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Shield } from 'lucide-react';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import { useAuthStore } from '../store/authStore';
import StepIndicator from '../components/Auth/StepIndicator';
import {
  AccountStep,
  PersonalStep,
  AddressStep,
  IdentityStep,
  SIGNUP_STEPS,
  STEP_META,
} from '../components/Forms';
import type {
  AccountValues,
  PersonalValues,
  AddressValues,
  IdentityValues,
} from '../components/Forms';

// ---------------------------------------------------------------------------
// SignupPage -- Orchestrator for the 4-step registration wizard
// ---------------------------------------------------------------------------

export default function SignupPage() {
  const navigate = useNavigate();
  const authRegister = useAuthStore((s) => s.register);
  const uploadDocument = useAuthStore((s) => s.uploadDocument);
  const submitKYC = useAuthStore((s) => s.submitKYC);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  // If already authenticated, skip account creation step -- go straight to KYC
  const isKycOnly = isAuthenticated;
  const initialStep = isKycOnly ? 1 : 0;

  // ---- Wizard state ---------------------------------------------------------

  const [currentStep, setCurrentStep] = useState(initialStep);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Cross-step data storage
  const [accountData, setAccountData] = useState<AccountValues | null>(null);
  const [personalData, setPersonalData] = useState<PersonalValues | null>(null);
  const [addressData, setAddressData] = useState<AddressValues | null>(null);

  // Document upload
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [documentPreview, setDocumentPreview] = useState<string | null>(null);

  // Track whether any data has been entered (for beforeunload warning)
  const hasUnsavedData = accountData !== null || personalData !== null || addressData !== null || documentFile !== null;

  // Step heading ref for focus management
  const stepHeadingRef = useRef<HTMLHeadingElement>(null);

  // ---- Beforeunload warning -------------------------------------------------

  useEffect(() => {
    if (!hasUnsavedData) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [hasUnsavedData]);

  // ---- Focus management on step change --------------------------------------

  useEffect(() => {
    // Focus the step heading when the step changes (after initial render)
    if (currentStep > 0) {
      stepHeadingRef.current?.focus();
    }
  }, [currentStep]);

  // ---- Navigation -----------------------------------------------------------

  const goToStep = useCallback((step: number) => {
    setCurrentStep(step);
  }, []);

  const handleStepClick = useCallback((stepIndex: number) => {
    // Only allow navigating to completed steps (lower index than current)
    if (stepIndex < currentStep) {
      setCurrentStep(stepIndex);
    }
  }, [currentStep]);

  // Step handlers
  const handleAccountNext = useCallback((values: AccountValues) => {
    setAccountData(values);
    setCurrentStep(1);
  }, []);

  const handlePersonalNext = useCallback((values: PersonalValues) => {
    setPersonalData(values);
    setCurrentStep(2);
  }, []);

  const handlePersonalBack = useCallback(() => {
    if (!isKycOnly) goToStep(0);
  }, [goToStep, isKycOnly]);

  const handleAddressNext = useCallback((values: AddressValues) => {
    setAddressData(values);
    setCurrentStep(3);
  }, []);

  const handleAddressBack = useCallback(() => {
    goToStep(1);
  }, [goToStep]);

  const handleIdentityBack = useCallback(() => {
    goToStep(2);
  }, [goToStep]);

  const handleDocumentSelect = useCallback((file: File | null, preview: string | null) => {
    setDocumentFile(file);
    setDocumentPreview(preview);
  }, []);

  // ---- Final submission -----------------------------------------------------

  const handleFinalSubmit = useCallback(async (identityValues: IdentityValues) => {
    if (!documentFile) {
      toast.error('Please upload an identity document to continue.');
      return;
    }

    if (!isAuthenticated && !accountData) {
      toast.error('Some required fields from an earlier step are missing. Please go back and complete all fields.');
      return;
    }

    if (!personalData || !addressData) {
      toast.error('Some required fields from an earlier step are missing. Please go back and complete all fields.');
      return;
    }

    setIsSubmitting(true);

    try {
      // 1. Register the account (skip if already authenticated, e.g. KYC re-submission)
      if (!isAuthenticated && accountData) {
        await authRegister({
          email: accountData.email,
          password: accountData.password,
        });
      }

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

      toast.success(isKycOnly
        ? 'Verification submitted. Your identity is being reviewed.'
        : 'Account created. Your identity verification is being reviewed.',
      );
      navigate('/pending-approval');
    } catch (err: any) {
      const code = err?.response?.data?.error?.code;
      const serverMessage = err?.response?.data?.error?.message;

      if (code === 'EMAIL_EXISTS') {
        toast.error('An account with this email already exists. Please log in instead.');
        useAuthStore.getState().clearAuth();
        navigate('/login');
        return;
      }

      toast.error(serverMessage || (err instanceof Error ? err.message : 'Registration could not be completed. Please try again.'));
    } finally {
      setIsSubmitting(false);
    }
  }, [isAuthenticated, accountData, personalData, addressData, documentFile, authRegister, uploadDocument, submitKYC, navigate]);

  // ---- Step renderers -------------------------------------------------------

  const renderCurrentStep = () => {
    switch (currentStep) {
      case 0:
        return (
          <AccountStep
            defaultValues={accountData}
            onNext={handleAccountNext}
          />
        );
      case 1:
        return (
          <PersonalStep
            defaultValues={personalData}
            onNext={handlePersonalNext}
            onBack={isKycOnly ? undefined : handlePersonalBack}
          />
        );
      case 2:
        return (
          <AddressStep
            defaultValues={addressData}
            onNext={handleAddressNext}
            onBack={handleAddressBack}
          />
        );
      case 3:
        return (
          <IdentityStep
            documentFile={documentFile}
            documentPreview={documentPreview}
            onDocumentSelect={handleDocumentSelect}
            onSubmit={handleFinalSubmit}
            onBack={handleIdentityBack}
            isSubmitting={isSubmitting}
          />
        );
      default:
        return null;
    }
  };

  // ---- Main render ----------------------------------------------------------

  return (
    <div className="w-full max-w-[520px] mx-auto animate-page-fade-in">
      {/* Branding */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-600 to-purple-600 shadow-xl shadow-indigo-500/25 mb-4">
          <Shield className="h-7 w-7 text-white" aria-hidden="true" />
        </div>
        <h1 className="text-3xl font-bold tracking-tight">
          <span className="bg-gradient-to-r from-indigo-400 via-purple-400 to-indigo-300 bg-clip-text text-transparent">
            Fueki
          </span>
        </h1>
        <p className="mt-1.5 text-sm text-[var(--text-muted)] tracking-widest uppercase font-medium">
          {isKycOnly ? 'Complete verification' : 'Create your account'}
        </p>
      </div>

      {/* Step Indicator */}
      <div className="mb-8">
        <StepIndicator
          steps={[...SIGNUP_STEPS]}
          currentStep={currentStep}
          onStepClick={handleStepClick}
        />
      </div>

      {/* Progress save indicator */}
      {hasUnsavedData && currentStep > 0 && (
        <div className="mb-4 flex items-center justify-center gap-2 text-xs text-[var(--text-muted)]">
          <div className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" aria-hidden="true" />
          <span>Progress saved for this session</span>
        </div>
      )}

      {/* Card */}
      <div
        className={clsx(
          'w-full',
          'bg-[var(--bg-secondary)]/80 backdrop-blur-2xl',
          'border border-[var(--border-primary)]',
          'rounded-3xl shadow-2xl shadow-black/20',
          'p-8 sm:p-10',
        )}
      >
        {/* Step heading */}
        <div className="mb-6">
          <h2
            ref={stepHeadingRef}
            tabIndex={-1}
            className="text-xl font-semibold text-[var(--text-primary)] outline-none"
          >
            {STEP_META[currentStep].title}
          </h2>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            {STEP_META[currentStep].description}
          </p>
        </div>

        {/* Step content */}
        {renderCurrentStep()}

        {/* Footer link */}
        {!isKycOnly && (
          <p className="mt-6 text-center text-sm text-[var(--text-muted)]">
            Already have an account?{' '}
            <Link
              to="/login"
              className="font-medium text-[var(--accent-primary)] hover:text-indigo-300 transition-colors duration-150"
            >
              Sign in
            </Link>
          </p>
        )}

        {/* Security badge */}
        <div className="mt-6 flex items-center justify-center gap-2 text-[var(--text-muted)]">
          <Shield className="h-4 w-4" aria-hidden="true" />
          <span className="text-xs font-medium tracking-wide">
            Your connection is encrypted
          </span>
        </div>
      </div>
    </div>
  );
}
