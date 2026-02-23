import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import axios from 'axios';
import clsx from 'clsx';
import { datadogRum } from '@datadog/browser-rum';
import { LifeBuoy, Loader2, Send, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { useLocation } from 'react-router-dom';
import { useTheme } from '../../hooks/useTheme';
import { submitSupportRequest } from '../../lib/api/support';
import logger from '../../lib/logger';
import { useAuthStore } from '../../store/authStore';
import type { SupportRequestCategory } from '../../types/support';

const SUPPORT_CATEGORIES: Array<{
  value: SupportRequestCategory;
  label: string;
}> = [
  { value: 'general', label: 'General question' },
  { value: 'technical', label: 'Technical issue' },
  { value: 'wallet', label: 'Wallet / connect issue' },
  { value: 'swap', label: 'Swap / exchange issue' },
  { value: 'compliance', label: 'Compliance / security token issue' },
  { value: 'billing', label: 'Billing issue' },
];

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface SupportFormState {
  name: string;
  email: string;
  subject: string;
  message: string;
  category: SupportRequestCategory;
}

interface SupportFormErrors {
  name?: string;
  email?: string;
  subject?: string;
  message?: string;
}

const DEFAULT_FORM_STATE: SupportFormState = {
  name: '',
  email: '',
  subject: '',
  message: '',
  category: 'general',
};

export default function SupportWidget() {
  const user = useAuthStore((s) => s.user);
  const location = useLocation();
  const { isDark } = useTheme();

  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState<SupportFormState>(DEFAULT_FORM_STATE);
  const [errors, setErrors] = useState<SupportFormErrors>({});

  const containerRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const subjectRef = useRef<HTMLInputElement | null>(null);

  const panelId = 'support-widget-panel';
  const titleId = 'support-widget-title';
  const descId = 'support-widget-desc';

  const accountName = useMemo(() => {
    const first = user?.firstName?.trim();
    const last = user?.lastName?.trim();
    if (first && last) return `${first} ${last}`;
    return first || last || '';
  }, [user?.firstName, user?.lastName]);

  useEffect(() => {
    if (!isOpen) return;

    setForm((prev) => ({
      ...prev,
      name: prev.name || accountName,
      email: prev.email || user?.email || '',
    }));

    window.requestAnimationFrame(() => {
      subjectRef.current?.focus();
    });
  }, [accountName, isOpen, user?.email]);

  useEffect(() => {
    if (!isOpen) return;

    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setIsOpen(false);
    };

    const onClickOutside = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (containerRef.current?.contains(target)) return;
      setIsOpen(false);
    };

    window.addEventListener('keydown', onEscape);
    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('touchstart', onClickOutside);

    return () => {
      window.removeEventListener('keydown', onEscape);
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('touchstart', onClickOutside);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    try {
      datadogRum.addAction('support_widget_opened', {
        eventName: 'support_widget_opened',
        route: location.pathname,
        isAuthenticated: Boolean(user),
      });
    } catch (error) {
      logger.warn('Failed to send support_widget_opened analytics event', {
        error,
      });
    }
  }, [isOpen, location.pathname, user]);

  const onChange =
    <K extends keyof SupportFormState>(key: K) =>
    (
      event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
    ) => {
      const value = event.target.value;
      setForm((prev) => ({ ...prev, [key]: value }));
      setErrors((prev) => ({ ...prev, [key]: undefined }));
    };

  const validate = (): boolean => {
    const nextErrors: SupportFormErrors = {};

    const name = form.name.trim();
    const email = form.email.trim();
    const subject = form.subject.trim();
    const message = form.message.trim();
    const hasAccountEmail = Boolean(user?.email);

    if (name.length > 120) {
      nextErrors.name = 'Name must be 120 characters or fewer.';
    }

    if (!hasAccountEmail && !email) {
      nextErrors.email = 'Email is required when you are not signed in.';
    } else if (email && !EMAIL_PATTERN.test(email)) {
      nextErrors.email = 'Enter a valid email address.';
    }

    if (subject.length < 4) {
      nextErrors.subject = 'Subject must be at least 4 characters.';
    } else if (subject.length > 160) {
      nextErrors.subject = 'Subject must be 160 characters or fewer.';
    }

    if (message.length < 20) {
      nextErrors.message = 'Please include at least 20 characters.';
    } else if (message.length > 4000) {
      nextErrors.message = 'Message must be 4,000 characters or fewer.';
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) return;
    if (!validate()) return;

    const payload = {
      name: form.name.trim() || undefined,
      email: form.email.trim() || undefined,
      subject: form.subject.trim(),
      message: form.message.trim(),
      category: form.category,
      route: location.pathname,
    };

    setIsSubmitting(true);
    try {
      await submitSupportRequest(payload);

      try {
        datadogRum.addAction('support_request_submitted', {
          eventName: 'support_request_submitted',
          route: location.pathname,
          category: form.category,
          isAuthenticated: Boolean(user),
        });
      } catch (error) {
        logger.warn('Failed to send support_request_submitted analytics event', {
          error,
        });
      }

      toast.success('Support request sent. We will follow up by email.');
      setForm((prev) => ({
        ...prev,
        subject: '',
        message: '',
        category: 'general',
      }));
      setErrors({});
      setIsOpen(false);
      triggerRef.current?.focus();
    } catch (error) {
      let message = 'Unable to send support request right now. Please try again.';
      if (axios.isAxiosError(error)) {
        const apiMessage =
          (error.response?.data as { error?: { message?: string } } | undefined)?.error
            ?.message;
        if (apiMessage) {
          message = apiMessage;
        }
      }

      logger.error('Support request submission failed', {
        error,
        route: location.pathname,
      });
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggle = () => {
    setIsOpen((prev) => !prev);
  };

  return (
    <div
      ref={containerRef}
      className="fixed z-[320] flex flex-col items-end gap-3 bottom-[max(1rem,env(safe-area-inset-bottom))] right-[max(1rem,env(safe-area-inset-right))]"
    >
      {isOpen && (
        <section
          id={panelId}
          role="dialog"
          aria-modal="false"
          aria-labelledby={titleId}
          aria-describedby={descId}
          className={clsx(
            'w-[min(92vw,24rem)] rounded-2xl border border-[var(--border-primary)]',
            isDark
              ? 'bg-[color:rgba(5,25,39,0.92)] shadow-2xl shadow-black/30'
              : 'bg-[color:rgba(255,255,255,0.96)] shadow-2xl shadow-slate-900/10',
            'backdrop-blur-xl',
            'px-4 py-4 sm:px-5 sm:py-5',
          )}
        >
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <h2
                id={titleId}
                className="text-sm font-semibold tracking-wide text-[var(--text-primary)]"
              >
                Support
              </h2>
              <p
                id={descId}
                className="mt-1 text-xs leading-relaxed text-[var(--text-secondary)]"
              >
                Share the issue and we will email you back.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="rounded-lg border border-transparent p-1.5 text-[var(--text-muted)] transition hover:border-[var(--border-primary)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-focus)]"
              aria-label="Close support panel"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3" noValidate>
            <div>
              <label
                htmlFor="support-category"
                className="mb-1 block text-xs font-medium text-[var(--text-secondary)]"
              >
                Issue type
              </label>
              <select
                id="support-category"
                value={form.category}
                onChange={onChange('category')}
                className={clsx(
                  'w-full rounded-lg border border-[var(--border-primary)] bg-[var(--bg-input)] px-3 py-2 text-xs text-[var(--text-primary)]',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-focus)]',
                )}
              >
                {SUPPORT_CATEGORIES.map((category) => (
                  <option key={category.value} value={category.value}>
                    {category.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="support-subject"
                className="mb-1 block text-xs font-medium text-[var(--text-secondary)]"
              >
                Subject
              </label>
              <input
                ref={subjectRef}
                id="support-subject"
                type="text"
                maxLength={160}
                value={form.subject}
                onChange={onChange('subject')}
                aria-invalid={Boolean(errors.subject)}
                aria-describedby={errors.subject ? 'support-subject-error' : undefined}
                className={clsx(
                  'w-full rounded-lg border bg-[var(--bg-input)] px-3 py-2 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)]',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-focus)]',
                  errors.subject
                    ? 'border-red-500/70 focus-visible:ring-red-500/30'
                    : 'border-[var(--border-primary)]',
                )}
                placeholder="Short summary"
              />
              {errors.subject && (
                <p id="support-subject-error" className="mt-1 text-[11px] text-red-300">
                  {errors.subject}
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor="support-message"
                className="mb-1 block text-xs font-medium text-[var(--text-secondary)]"
              >
                Message
              </label>
              <textarea
                id="support-message"
                rows={4}
                maxLength={4000}
                value={form.message}
                onChange={onChange('message')}
                aria-invalid={Boolean(errors.message)}
                aria-describedby={errors.message ? 'support-message-error' : undefined}
                className={clsx(
                  'w-full resize-y rounded-lg border bg-[var(--bg-input)] px-3 py-2 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)]',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-focus)]',
                  errors.message
                    ? 'border-red-500/70 focus-visible:ring-red-500/30'
                    : 'border-[var(--border-primary)]',
                )}
                placeholder="What happened and what did you expect?"
              />
              {errors.message && (
                <p id="support-message-error" className="mt-1 text-[11px] text-red-300">
                  {errors.message}
                </p>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="support-name"
                  className="mb-1 block text-xs font-medium text-[var(--text-secondary)]"
                >
                  Name (optional)
                </label>
                <input
                  id="support-name"
                  type="text"
                  maxLength={120}
                  value={form.name}
                  onChange={onChange('name')}
                  aria-invalid={Boolean(errors.name)}
                  aria-describedby={errors.name ? 'support-name-error' : undefined}
                  className={clsx(
                    'w-full rounded-lg border bg-[var(--bg-input)] px-3 py-2 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)]',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-focus)]',
                    errors.name
                      ? 'border-red-500/70 focus-visible:ring-red-500/30'
                      : 'border-[var(--border-primary)]',
                  )}
                  placeholder="Your name"
                />
                {errors.name && (
                  <p id="support-name-error" className="mt-1 text-[11px] text-red-300">
                    {errors.name}
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="support-email"
                  className="mb-1 block text-xs font-medium text-[var(--text-secondary)]"
                >
                  Email {user?.email ? '(optional)' : '(required)'}
                </label>
                <input
                  id="support-email"
                  type="email"
                  maxLength={320}
                  value={form.email}
                  onChange={onChange('email')}
                  aria-invalid={Boolean(errors.email)}
                  aria-describedby={errors.email ? 'support-email-error' : undefined}
                  className={clsx(
                    'w-full rounded-lg border bg-[var(--bg-input)] px-3 py-2 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)]',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-focus)]',
                    errors.email
                      ? 'border-red-500/70 focus-visible:ring-red-500/30'
                      : 'border-[var(--border-primary)]',
                  )}
                  placeholder={user?.email ?? 'you@example.com'}
                />
                {errors.email && (
                  <p id="support-email-error" className="mt-1 text-[11px] text-red-300">
                    {errors.email}
                  </p>
                )}
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className={clsx(
                'mt-1 inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold text-white',
                'bg-gradient-to-r from-cyan-600 to-blue-600 transition hover:from-cyan-500 hover:to-blue-500',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70',
                'disabled:cursor-not-allowed disabled:opacity-60',
              )}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  Send request
                </>
              )}
            </button>
          </form>
        </section>
      )}

      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-controls={panelId}
        onClick={toggle}
        className={clsx(
          'group inline-flex h-12 w-12 items-center justify-center rounded-full',
          'border border-[var(--border-accent)]',
          isDark
            ? 'bg-[color:rgba(12,36,53,0.94)] text-[var(--accent-secondary)] shadow-lg shadow-black/30'
            : 'bg-[color:rgba(255,255,255,0.96)] text-[var(--accent-primary)] shadow-lg shadow-slate-900/10',
          'transition-transform hover:-translate-y-0.5 hover:shadow-xl',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-focus)]',
        )}
      >
        {isOpen ? (
          <X className="h-5 w-5" aria-hidden="true" />
        ) : (
          <LifeBuoy className="h-5 w-5" aria-hidden="true" />
        )}
        <span className="sr-only">{isOpen ? 'Close support' : 'Open support'}</span>
      </button>
    </div>
  );
}
