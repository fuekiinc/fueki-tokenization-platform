/**
 * BespokeContractPage -- Intake form for custom smart contract requests.
 *
 * Captures user requirements and submits them through the support request
 * pipeline, which emails the Fueki team inbox.
 */

import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import axios from 'axios';
import clsx from 'clsx';
import { ArrowLeft, Loader2, Mail, Send, Sparkles } from 'lucide-react';
import toast from 'react-hot-toast';
import { Link } from 'react-router-dom';
import { submitSupportRequest } from '../lib/api/support';
import logger from '../lib/logger';
import { useAuthStore } from '../store/authStore';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface FormState {
  name: string;
  email: string;
  requirements: string;
  notes: string;
}

interface FormErrors {
  email?: string;
  requirements?: string;
  notes?: string;
}

const INITIAL_FORM: FormState = {
  name: '',
  email: '',
  requirements: '',
  notes: '',
};

export default function BespokeContractPage() {
  const user = useAuthStore((s) => s.user);
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedAt, setSubmittedAt] = useState<string | null>(null);

  const accountName = useMemo(() => {
    const first = user?.firstName?.trim();
    const last = user?.lastName?.trim();
    if (first && last) return `${first} ${last}`;
    return first || last || '';
  }, [user?.firstName, user?.lastName]);

  useEffect(() => {
    setForm((prev) => ({
      ...prev,
      name: prev.name || accountName,
      email: prev.email || user?.email || '',
    }));
  }, [accountName, user?.email]);

  const handleChange =
    <K extends keyof FormState>(key: K) =>
    (value: FormState[K]) => {
      setForm((prev) => ({ ...prev, [key]: value }));
      setErrors((prev) => ({ ...prev, [key]: undefined }));
    };

  const validate = (): boolean => {
    const next: FormErrors = {};
    const email = form.email.trim() || user?.email || '';
    const requirements = form.requirements.trim();
    const notes = form.notes.trim();

    if (!email) {
      next.email = 'Email is required.';
    } else if (!EMAIL_PATTERN.test(email)) {
      next.email = 'Enter a valid email address.';
    }

    if (requirements.length < 20) {
      next.requirements = 'Please provide at least 20 characters describing what the contract should do.';
    } else if (requirements.length > 4000) {
      next.requirements = 'Requirements must be 4,000 characters or fewer.';
    }

    if (notes.length > 2000) {
      next.notes = 'Additional notes must be 2,000 characters or fewer.';
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) return;
    if (!validate()) return;

    const contactName = form.name.trim() || accountName || undefined;
    const contactEmail = (form.email.trim() || user?.email || '').trim();
    const requirements = form.requirements.trim();
    const notes = form.notes.trim();

    const message = [
      'Bespoke smart contract request',
      '',
      `Requested by: ${contactName || 'Not provided'}`,
      `Contact email: ${contactEmail}`,
      `Account email: ${user?.email || 'Not available'}`,
      '',
      'Contract requirements:',
      requirements,
      '',
      'Additional notes:',
      notes || 'None',
    ].join('\n');

    setIsSubmitting(true);
    try {
      const response = await submitSupportRequest({
        name: contactName,
        email: contactEmail,
        subject: 'Bespoke Smart Contract Request',
        message,
        category: 'technical',
        route: '/contracts/bespoke',
      });

      setSubmittedAt(response.submittedAt);
      toast.success('Request submitted. The Fueki team will follow up by email.');
      setForm((prev) => ({
        ...prev,
        requirements: '',
        notes: '',
      }));
      setErrors({});
    } catch (error) {
      let messageText = 'Unable to submit your request right now. Please try again.';
      if (axios.isAxiosError(error)) {
        const apiMessage =
          (error.response?.data as { error?: { message?: string } } | undefined)?.error
            ?.message;
        if (apiMessage) {
          messageText = apiMessage;
        }
      }
      logger.error('Bespoke contract request submission failed', { error });
      toast.error(messageText);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="mb-8 flex items-center justify-between">
        <Link
          to="/contracts"
          className={clsx(
            'inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-[#0D0F14]/80 px-4 py-2 text-xs text-gray-400 transition-all',
            'hover:border-white/[0.15] hover:text-gray-200',
          )}
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Contract Deployer
        </Link>
      </div>

      <div
        className={clsx(
          'relative overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0D0F14]/85 p-6 sm:p-8',
          'backdrop-blur-xl',
        )}
      >
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-indigo-400/40 to-transparent" />

        <div className="mb-7">
          <span className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-indigo-400/30 bg-indigo-500/10 px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-indigo-200">
            <Sparkles className="h-3 w-3" />
            Bespoke Request
          </span>
          <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            Bespoke Smart Contract
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-gray-400">
            Tell us what your smart contract should do. Your request will be emailed to the
            Fueki team for review.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5" noValidate>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="bespoke-name" className="mb-1.5 block text-xs font-medium text-gray-400">
                Name
              </label>
              <input
                id="bespoke-name"
                type="text"
                value={form.name}
                onChange={(e) => handleChange('name')(e.target.value)}
                placeholder="Your name"
                className={clsx(
                  'w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-sm text-white',
                  'placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/40',
                )}
              />
            </div>

            <div>
              <label htmlFor="bespoke-email" className="mb-1.5 block text-xs font-medium text-gray-400">
                Contact Email
              </label>
              <input
                id="bespoke-email"
                type="email"
                value={form.email}
                onChange={(e) => handleChange('email')(e.target.value)}
                placeholder="you@company.com"
                className={clsx(
                  'w-full rounded-xl border bg-white/[0.03] px-3 py-2.5 text-sm text-white',
                  errors.email ? 'border-red-500/50' : 'border-white/[0.08]',
                  'placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/40',
                )}
              />
              {errors.email && (
                <p className="mt-1 text-xs text-red-400">{errors.email}</p>
              )}
            </div>
          </div>

          <div>
            <label htmlFor="bespoke-requirements" className="mb-1.5 block text-xs font-medium text-gray-400">
              What should the smart contract do?
            </label>
            <textarea
              id="bespoke-requirements"
              value={form.requirements}
              onChange={(e) => handleChange('requirements')(e.target.value)}
              placeholder="Describe your business flow, required permissions/roles, key actions, and any compliance logic."
              rows={8}
              className={clsx(
                'w-full rounded-xl border bg-white/[0.03] px-3 py-2.5 text-sm leading-relaxed text-white',
                errors.requirements ? 'border-red-500/50' : 'border-white/[0.08]',
                'placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/40',
              )}
            />
            <div className="mt-1 flex items-center justify-between">
              {errors.requirements ? (
                <p className="text-xs text-red-400">{errors.requirements}</p>
              ) : (
                <p className="text-xs text-gray-600">Minimum 20 characters.</p>
              )}
              <p className="text-xs text-gray-600">
                {form.requirements.trim().length}/4000
              </p>
            </div>
          </div>

          <div>
            <label htmlFor="bespoke-notes" className="mb-1.5 block text-xs font-medium text-gray-400">
              Additional Notes (optional)
            </label>
            <textarea
              id="bespoke-notes"
              value={form.notes}
              onChange={(e) => handleChange('notes')(e.target.value)}
              placeholder="Anything else that would help us scope this request (timeline, preferred network, integrations)."
              rows={4}
              className={clsx(
                'w-full rounded-xl border bg-white/[0.03] px-3 py-2.5 text-sm leading-relaxed text-white',
                errors.notes ? 'border-red-500/50' : 'border-white/[0.08]',
                'placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/40',
              )}
            />
            <div className="mt-1 flex items-center justify-between">
              {errors.notes ? (
                <p className="text-xs text-red-400">{errors.notes}</p>
              ) : (
                <p className="text-xs text-gray-600">Optional context for the Fueki team.</p>
              )}
              <p className="text-xs text-gray-600">
                {form.notes.trim().length}/2000
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] pt-5">
            <div className="inline-flex items-center gap-2 text-xs text-gray-500">
              <Mail className="h-3.5 w-3.5" />
              Sent to mark@fueki-tech.com
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className={clsx(
                'inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white transition-all',
                'bg-gradient-to-r from-indigo-600 to-cyan-600',
                'hover:from-indigo-500 hover:to-cyan-500',
                'disabled:cursor-not-allowed disabled:opacity-50',
              )}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Submitting...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  Submit Request
                </>
              )}
            </button>
          </div>

          {submittedAt && (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-xs text-emerald-300">
              Request submitted successfully at {new Date(submittedAt).toLocaleString()}.
            </div>
          )}
        </form>
      </div>
    </div>
  );
}

