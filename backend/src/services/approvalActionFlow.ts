import crypto from 'node:crypto';
import { type Response } from 'express';
import { z } from 'zod';
import { config } from '../config';

export type ApprovalAction = 'approve' | 'reject';
export type ApprovalScope = 'kyc' | 'mint' | 'security-token';

interface ActionDetail {
  label: string;
  value: string;
}

interface ActionPageOptions {
  status?: number;
  title: string;
  message: string;
  accent?: string;
  details?: ActionDetail[];
}

interface ConfirmationPageOptions extends ActionPageOptions {
  action: ApprovalAction;
  formAction: string;
  payload: string;
  signature: string;
}

const confirmationPayloadSchema = z.object({
  token: z.string().min(1),
  action: z.enum(['approve', 'reject']),
  scope: z.enum(['kyc', 'mint', 'security-token']),
  confirmBy: z.number().int().positive(),
});

const CONFIRMATION_PAGE_TTL_MS = 15 * 60 * 1000;
const HMAC_SIGNATURE_HEX_LENGTH = 64;

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function actionAccent(action: ApprovalAction): string {
  return action === 'approve' ? '#059669' : '#dc2626';
}

function confirmationSecret(): string {
  return `${config.jwt.accessSecret}:${config.jwt.refreshSecret}`;
}

function signPayload(encodedPayload: string): string {
  return crypto.createHmac('sha256', confirmationSecret()).update(encodedPayload).digest('hex');
}

function setActionPageHeaders(res: Response): void {
  res.set({
    'Cache-Control': 'no-store, max-age=0',
    Expires: '0',
    Pragma: 'no-cache',
    'Referrer-Policy': 'no-referrer',
    'X-Robots-Tag': 'noindex, nofollow',
  });
}

function renderDetails(details: ActionDetail[]): string {
  if (details.length === 0) {
    return '';
  }

  const rows = details
    .map(
      ({ label, value }) => `
          <tr>
            <td style="padding:8px 0;color:#6b7280;font-size:13px;width:180px;vertical-align:top;">${escapeHtml(label)}</td>
            <td style="padding:8px 0;color:#111827;font-size:14px;font-weight:600;word-break:break-word;">${escapeHtml(value)}</td>
          </tr>`,
    )
    .join('');

  return `
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0 0;background:#f8fafc;border:1px solid #e5e7eb;border-radius:10px;padding:18px;">
${rows}
        </table>`;
}

function renderShell({
  title,
  body,
  accent,
}: {
  title: string;
  body: string;
  accent: string;
}): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex,nofollow,noarchive" />
    <title>${escapeHtml(title)}</title>
  </head>
  <body style="margin:0;background:#f3f4f6;color:#111827;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;">
      <div style="max-width:680px;width:100%;background:#ffffff;border:1px solid #e5e7eb;border-radius:18px;padding:32px;box-shadow:0 24px 60px rgba(15,23,42,0.12);">
        <div style="display:inline-flex;align-items:center;justify-content:center;width:52px;height:52px;border-radius:999px;background:${accent}18;color:${accent};font-weight:700;font-size:20px;margin-bottom:18px;">F</div>
        ${body}
      </div>
    </div>
  </body>
</html>`;
}

export function parseApprovalAction(raw: string): ApprovalAction | null {
  return raw === 'approve' || raw === 'reject' ? raw : null;
}

export function createConfirmationFormState(input: {
  token: string;
  action: ApprovalAction;
  scope: ApprovalScope;
  expiresAt: Date;
}): { payload: string; signature: string } {
  const payload = confirmationPayloadSchema.parse({
    token: input.token,
    action: input.action,
    scope: input.scope,
    confirmBy: Math.min(input.expiresAt.getTime(), Date.now() + CONFIRMATION_PAGE_TTL_MS),
  });

  const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return {
    payload: encodedPayload,
    signature: signPayload(encodedPayload),
  };
}

export function verifyConfirmationFormState(input: {
  payload: string;
  signature: string;
  token: string;
  action: ApprovalAction;
  scope: ApprovalScope;
}): { ok: true } | { ok: false; reason: 'invalid' | 'expired' } {
  if (!input.payload || !input.signature) {
    return { ok: false, reason: 'invalid' };
  }

  const expectedSignature = signPayload(input.payload);
  if (
    input.signature.length !== HMAC_SIGNATURE_HEX_LENGTH ||
    !/^[a-f0-9]+$/i.test(input.signature) ||
    expectedSignature.length !== input.signature.length
  ) {
    return { ok: false, reason: 'invalid' };
  }

  const matches = crypto.timingSafeEqual(
    Buffer.from(expectedSignature, 'utf8'),
    Buffer.from(input.signature, 'utf8'),
  );
  if (!matches) {
    return { ok: false, reason: 'invalid' };
  }

  let decodedPayload: unknown;
  try {
    decodedPayload = JSON.parse(Buffer.from(input.payload, 'base64url').toString('utf8'));
  } catch {
    return { ok: false, reason: 'invalid' };
  }

  const parsed = confirmationPayloadSchema.safeParse(decodedPayload);
  if (!parsed.success) {
    return { ok: false, reason: 'invalid' };
  }

  if (
    parsed.data.token !== input.token ||
    parsed.data.action !== input.action ||
    parsed.data.scope !== input.scope
  ) {
    return { ok: false, reason: 'invalid' };
  }

  if (parsed.data.confirmBy < Date.now()) {
    return { ok: false, reason: 'expired' };
  }

  return { ok: true };
}

export function sendActionInfoPage(
  res: Response,
  {
    status = 200,
    title,
    message,
    accent = '#4f46e5',
    details = [],
  }: ActionPageOptions,
): void {
  setActionPageHeaders(res);
  res
    .status(status)
    .type('html')
    .send(
      renderShell({
        title,
        accent,
        body: `
        <h1 style="margin:0 0 10px;font-size:28px;color:#111827;">${escapeHtml(title)}</h1>
        <p style="margin:0;color:#4b5563;font-size:15px;line-height:1.7;">${escapeHtml(message)}</p>
${renderDetails(details)}
      `,
      }),
    );
}

export function sendActionConfirmationPage(
  res: Response,
  {
    status = 200,
    title,
    message,
    action,
    formAction,
    payload,
    signature,
    accent = actionAccent(action),
    details = [],
  }: ConfirmationPageOptions,
): void {
  const actionLabel = action === 'approve' ? 'approval' : 'rejection';

  setActionPageHeaders(res);
  res
    .status(status)
    .type('html')
    .send(
      renderShell({
        title,
        accent,
        body: `
        <div style="display:inline-flex;align-items:center;gap:8px;padding:6px 12px;border-radius:999px;background:${accent}12;color:${accent};font-size:12px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;">
          Review required
        </div>
        <h1 style="margin:16px 0 10px;font-size:28px;color:#111827;">${escapeHtml(title)}</h1>
        <p style="margin:0;color:#4b5563;font-size:15px;line-height:1.7;">${escapeHtml(message)}</p>
${renderDetails(details)}
        <div style="margin:20px 0 0;padding:16px 18px;border-radius:12px;background:#eff6ff;border:1px solid #bfdbfe;color:#1d4ed8;font-size:14px;line-height:1.6;">
          Opening this page does not change anything. The action is only applied after you press the confirmation button below.
        </div>
        <form method="post" action="${escapeHtml(formAction)}" style="margin-top:24px;">
          <input type="hidden" name="payload" value="${escapeHtml(payload)}" />
          <input type="hidden" name="signature" value="${escapeHtml(signature)}" />
          <div style="display:flex;flex-wrap:wrap;gap:12px;align-items:center;">
            <button type="submit" name="confirm" value="${action}" style="cursor:pointer;border:0;border-radius:12px;background:${accent};color:#ffffff;padding:14px 22px;font-size:15px;font-weight:700;">
              Confirm ${actionLabel}
            </button>
            <span style="color:#6b7280;font-size:13px;">This confirmation page expires automatically after a short period.</span>
          </div>
        </form>
      `,
      }),
    );
}
