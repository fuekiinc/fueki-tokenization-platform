import nodemailer from 'nodemailer';
import crypto from 'node:crypto';
import { config } from '../config';
import { prisma } from '../prisma';
import { hashToken } from './tokenHash';

/**
 * Create a reusable SMTP transporter.
 * In development (when SMTP_USER is empty), falls back to a no-op transport
 * that logs emails to the console instead of sending them.
 */
function createTransporter() {
  if (!config.smtp.user) {
    // Development: log emails to console instead of sending
    return nodemailer.createTransport({
      streamTransport: true,
      newline: 'unix',
    });
  }

  return nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.port === 465,
    auth: {
      user: config.smtp.user,
      pass: config.smtp.pass,
    },
  });
}

const transporter = createTransporter();

/**
 * Sends a password reset email to the specified address.
 *
 * @param email - The recipient email address
 * @param resetToken - The unique token used to validate the reset request
 */
export async function sendPasswordResetEmail(
  email: string,
  resetToken: string,
): Promise<void> {
  const resetUrl = `${config.frontendUrl}/reset-password?token=${resetToken}`;

  const htmlBody = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset Your Password</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f7;padding:40px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
          <!-- Header -->
          <tr>
            <td style="background-color:#1a1a2e;padding:32px 40px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:600;">Fueki</h1>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:40px;">
              <h2 style="margin:0 0 16px;color:#1a1a2e;font-size:20px;">Password Reset Request</h2>
              <p style="margin:0 0 24px;color:#51545e;font-size:16px;line-height:1.6;">
                We received a request to reset the password associated with this email address.
                Click the button below to set a new password. This link will expire in <strong>1 hour</strong>.
              </p>
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 24px;">
                <tr>
                  <td style="border-radius:6px;background-color:#4f46e5;">
                    <a href="${resetUrl}" target="_blank" style="display:inline-block;padding:14px 32px;color:#ffffff;font-size:16px;font-weight:600;text-decoration:none;">
                      Reset Password
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 16px;color:#51545e;font-size:14px;line-height:1.6;">
                If the button above does not work, copy and paste this URL into your browser:
              </p>
              <p style="margin:0 0 24px;word-break:break-all;color:#4f46e5;font-size:14px;">
                ${resetUrl}
              </p>
              <hr style="border:none;border-top:1px solid #eaeaec;margin:24px 0;" />
              <p style="margin:0;color:#9b9ba5;font-size:13px;line-height:1.5;">
                If you did not request a password reset, you can safely ignore this email.
                Your password will not be changed.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background-color:#f4f4f7;padding:24px 40px;text-align:center;">
              <p style="margin:0;color:#9b9ba5;font-size:12px;">
                &copy; ${new Date().getFullYear()} Fueki. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const textBody = `Password Reset Request

We received a request to reset the password associated with this email address.

Reset your password by visiting this link (expires in 1 hour):
${resetUrl}

If you did not request a password reset, you can safely ignore this email.

-- Fueki`;

  const info = await transporter.sendMail({
    from: config.smtp.from,
    to: email,
    subject: 'Reset Your Fueki Password',
    text: textBody,
    html: htmlBody,
  });

  // In development mode (streamTransport), log the message for debugging
  if (!config.smtp.user) {
    console.log('[DEV EMAIL] Password reset email for:', email);
    console.log('[DEV EMAIL] Reset URL:', resetUrl);
    console.log('[DEV EMAIL] Message ID:', info.messageId);
  }
}

// ---------------------------------------------------------------------------
// KYC Review Notification Email
// ---------------------------------------------------------------------------

interface KYCReviewEmailData {
  userId: string;
  userEmail: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  addressLine1: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
  documentType: string;
  subscriptionPlan: string;
  submittedAt: string;
}

function formatSubscriptionPlanForEmail(plan: string): string {
  switch (plan) {
    case 'annual':
      return '$1,800/year (Annual)';
    case 'monthly':
      return '$200/month (Monthly)';
    case 'full_service':
      return 'Full Service (Bespoke pricing - invoice based on requirements)';
    case 'contract_deployment_monthly':
      return '$70/month (Smart Contract Deployment Only) + per-contract fee';
    case 'contract_deployment_annual':
      return '$600/year (Smart Contract Deployment Only) + per-contract fee';
    case 'contract_deployment_white_glove':
      return 'White Glove Smart Contract Deployment (Bespoke pricing - invoice estimate based on requirements)';
    default:
      return plan;
  }
}

export async function sendKYCReviewEmail(data: KYCReviewEmailData): Promise<void> {
  if (config.adminEmails.length === 0) {
    console.warn('[EMAIL] No ADMIN_EMAILS configured, skipping KYC review notification');
    return;
  }

  // Generate one-time action tokens (7-day expiry)
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const approveToken = crypto.randomUUID();
  const rejectToken = crypto.randomUUID();

  await Promise.all([
    prisma.adminActionToken.create({
      data: {
        userId: data.userId,
        action: 'approve',
        token: hashToken(approveToken),
        expiresAt,
      },
    }),
    prisma.adminActionToken.create({
      data: {
        userId: data.userId,
        action: 'reject',
        token: hashToken(rejectToken),
        expiresAt,
      },
    }),
  ]);

  const approveUrl = `${config.backendUrl}/api/admin/kyc/action/${approveToken}`;
  const rejectUrl = `${config.backendUrl}/api/admin/kyc/action/${rejectToken}`;

  const htmlBody = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>New KYC Submission</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f7;padding:40px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
          <!-- Header -->
          <tr>
            <td style="background-color:#1a1a2e;padding:32px 40px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:600;">Fueki</h1>
              <p style="margin:8px 0 0;color:#a5b4fc;font-size:14px;">KYC Review Required</p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:40px;">
              <h2 style="margin:0 0 8px;color:#1a1a2e;font-size:20px;">New KYC Submission</h2>
              <p style="margin:0 0 24px;color:#51545e;font-size:15px;">
                A new identity verification application requires your review.
              </p>

              <!-- Applicant Details -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8f9fa;border-radius:8px;margin-bottom:24px;">
                <tr>
                  <td style="padding:20px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding:6px 0;color:#6b7280;font-size:13px;width:120px;">Email</td>
                        <td style="padding:6px 0;color:#1a1a2e;font-size:14px;font-weight:600;">${data.userEmail}</td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;color:#6b7280;font-size:13px;">Name</td>
                        <td style="padding:6px 0;color:#1a1a2e;font-size:14px;font-weight:600;">${data.firstName} ${data.lastName}</td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;color:#6b7280;font-size:13px;">Date of Birth</td>
                        <td style="padding:6px 0;color:#1a1a2e;font-size:14px;">${data.dateOfBirth}</td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;color:#6b7280;font-size:13px;">Address</td>
                        <td style="padding:6px 0;color:#1a1a2e;font-size:14px;">${data.addressLine1}, ${data.city}, ${data.state} ${data.zipCode}, ${data.country}</td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;color:#6b7280;font-size:13px;">Document</td>
                        <td style="padding:6px 0;color:#1a1a2e;font-size:14px;">${data.documentType === 'drivers_license' ? "Driver's License" : 'Passport'}</td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;color:#6b7280;font-size:13px;">Subscription</td>
                        <td style="padding:6px 0;color:#1a1a2e;font-size:14px;font-weight:700;">${formatSubscriptionPlanForEmail(data.subscriptionPlan)}</td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;color:#6b7280;font-size:13px;">Submitted</td>
                        <td style="padding:6px 0;color:#1a1a2e;font-size:14px;">${data.submittedAt}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Action Buttons -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding:0 8px 0 0;">
                    <a href="${approveUrl}" target="_blank" style="display:inline-block;padding:14px 40px;background-color:#059669;color:#ffffff;font-size:16px;font-weight:600;text-decoration:none;border-radius:6px;">
                      Approve
                    </a>
                  </td>
                  <td align="center" style="padding:0 0 0 8px;">
                    <a href="${rejectUrl}" target="_blank" style="display:inline-block;padding:14px 40px;background-color:#dc2626;color:#ffffff;font-size:16px;font-weight:600;text-decoration:none;border-radius:6px;">
                      Deny
                    </a>
                  </td>
                </tr>
              </table>

              <hr style="border:none;border-top:1px solid #eaeaec;margin:32px 0 16px;" />
              <p style="margin:0;color:#9b9ba5;font-size:12px;line-height:1.5;">
                These action links expire in 7 days and can only be used once.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background-color:#f4f4f7;padding:24px 40px;text-align:center;">
              <p style="margin:0;color:#9b9ba5;font-size:12px;">
                &copy; ${new Date().getFullYear()} Fueki. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const textBody = `New KYC Submission - Review Required

Applicant: ${data.firstName} ${data.lastName}
Email: ${data.userEmail}
DOB: ${data.dateOfBirth}
Address: ${data.addressLine1}, ${data.city}, ${data.state} ${data.zipCode}, ${data.country}
Document: ${data.documentType === 'drivers_license' ? "Driver's License" : 'Passport'}
Subscription Plan: ${formatSubscriptionPlanForEmail(data.subscriptionPlan)}
Submitted: ${data.submittedAt}

Approve: ${approveUrl}
Deny: ${rejectUrl}

These links expire in 7 days and can only be used once.

-- Fueki`;

  const info = await transporter.sendMail({
    from: config.smtp.from,
    to: config.adminEmails.join(', '),
    subject: `KYC Review: ${data.firstName} ${data.lastName} (${data.userEmail})`,
    text: textBody,
    html: htmlBody,
  });

  if (!config.smtp.user) {
    console.log('[DEV EMAIL] KYC review notification sent');
    console.log('[DEV EMAIL] Approve URL:', approveUrl);
    console.log('[DEV EMAIL] Reject URL:', rejectUrl);
    console.log('[DEV EMAIL] Message ID:', info.messageId);
  }
}

// ---------------------------------------------------------------------------
// Mint Approval Request Email
// ---------------------------------------------------------------------------

interface MintApprovalRequestEmailData {
  requestId: string;
  requesterUserId: string;
  requesterEmail: string;
  chainId: number;
  tokenName: string;
  tokenSymbol: string;
  mintAmount: string;
  recipient: string;
  documentHash: string;
  documentType: string;
  originalValue: string;
  currency: string;
  submittedAtIso: string;
  approveUrl: string;
  rejectUrl: string;
  attachmentFileName: string;
  attachmentMimeType: string;
  attachmentContent: Buffer;
}

function escapeHtmlForEmail(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export async function sendMintApprovalRequestEmail(
  data: MintApprovalRequestEmailData,
): Promise<void> {
  const recipient = config.mintApproval.requestRecipient;
  const escapedTokenName = escapeHtmlForEmail(data.tokenName);
  const escapedTokenSymbol = escapeHtmlForEmail(data.tokenSymbol);
  const escapedRecipient = escapeHtmlForEmail(data.recipient);
  const escapedDocHash = escapeHtmlForEmail(data.documentHash);
  const escapedDocType = escapeHtmlForEmail(data.documentType);
  const escapedCurrency = escapeHtmlForEmail(data.currency);
  const escapedFileName = escapeHtmlForEmail(data.attachmentFileName);
  const escapedRequesterEmail = escapeHtmlForEmail(data.requesterEmail);
  const escapedRequesterUserId = escapeHtmlForEmail(data.requesterUserId);

  const subjectLine =
    `[Mint Approval] ${data.tokenName} (${data.tokenSymbol}) ` +
    `on chain ${data.chainId} by ${data.requesterEmail}`;

  const htmlBody = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Mint Approval Request</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f7;padding:36px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="700" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 2px 10px rgba(0,0,0,0.08);">
          <tr>
            <td style="background-color:#0f172a;padding:28px 36px;">
              <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;">Fueki Mint Approval Request</h1>
              <p style="margin:10px 0 0;color:#93c5fd;font-size:13px;">Request ID: ${data.requestId}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 36px;">
              <p style="margin:0 0 18px;color:#374151;font-size:14px;line-height:1.6;">
                A user submitted a wrapped-asset mint request. Review the details below and use an action button.
              </p>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#f8fafc;border:1px solid #e5e7eb;border-radius:8px;padding:14px;">
                <tr><td style="padding:7px 0;color:#6b7280;font-size:13px;width:170px;">Requester Email</td><td style="padding:7px 0;color:#111827;font-size:14px;font-weight:600;">${escapedRequesterEmail}</td></tr>
                <tr><td style="padding:7px 0;color:#6b7280;font-size:13px;">Requester User ID</td><td style="padding:7px 0;color:#111827;font-size:14px;">${escapedRequesterUserId}</td></tr>
                <tr><td style="padding:7px 0;color:#6b7280;font-size:13px;">Submitted At</td><td style="padding:7px 0;color:#111827;font-size:14px;">${escapeHtmlForEmail(data.submittedAtIso)}</td></tr>
                <tr><td style="padding:7px 0;color:#6b7280;font-size:13px;">Network (chainId)</td><td style="padding:7px 0;color:#111827;font-size:14px;">${data.chainId}</td></tr>
                <tr><td style="padding:7px 0;color:#6b7280;font-size:13px;">Token Name</td><td style="padding:7px 0;color:#111827;font-size:14px;font-weight:600;">${escapedTokenName}</td></tr>
                <tr><td style="padding:7px 0;color:#6b7280;font-size:13px;">Token Symbol</td><td style="padding:7px 0;color:#111827;font-size:14px;font-weight:600;">${escapedTokenSymbol}</td></tr>
                <tr><td style="padding:7px 0;color:#6b7280;font-size:13px;">Mint Amount</td><td style="padding:7px 0;color:#111827;font-size:14px;">${escapeHtmlForEmail(data.mintAmount)} ${escapedCurrency}</td></tr>
                <tr><td style="padding:7px 0;color:#6b7280;font-size:13px;">Original Document Value</td><td style="padding:7px 0;color:#111827;font-size:14px;">${escapeHtmlForEmail(data.originalValue)} ${escapedCurrency}</td></tr>
                <tr><td style="padding:7px 0;color:#6b7280;font-size:13px;">Recipient</td><td style="padding:7px 0;color:#111827;font-size:14px;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,'Courier New',monospace;">${escapedRecipient}</td></tr>
                <tr><td style="padding:7px 0;color:#6b7280;font-size:13px;">Document Type</td><td style="padding:7px 0;color:#111827;font-size:14px;">${escapedDocType}</td></tr>
                <tr><td style="padding:7px 0;color:#6b7280;font-size:13px;">Document Hash</td><td style="padding:7px 0;color:#111827;font-size:13px;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,'Courier New',monospace;word-break:break-all;">${escapedDocHash}</td></tr>
                <tr><td style="padding:7px 0;color:#6b7280;font-size:13px;">Attached File</td><td style="padding:7px 0;color:#111827;font-size:14px;">${escapedFileName}</td></tr>
              </table>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px;">
                <tr>
                  <td align="center" style="padding-right:8px;">
                    <a href="${data.approveUrl}" target="_blank" style="display:inline-block;padding:12px 32px;background:#059669;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:700;">
                      Approve Mint
                    </a>
                  </td>
                  <td align="center" style="padding-left:8px;">
                    <a href="${data.rejectUrl}" target="_blank" style="display:inline-block;padding:12px 32px;background:#dc2626;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:700;">
                      Reject Mint
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:20px 0 0;color:#6b7280;font-size:12px;">
                Action links are one-time use and expire automatically.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const textBody = `Mint Approval Request

Request ID: ${data.requestId}
Requester: ${data.requesterEmail} (${data.requesterUserId})
Submitted At: ${data.submittedAtIso}
Chain ID: ${data.chainId}

Token Name: ${data.tokenName}
Token Symbol: ${data.tokenSymbol}
Mint Amount: ${data.mintAmount} ${data.currency}
Original Value: ${data.originalValue} ${data.currency}
Recipient: ${data.recipient}

Document Type: ${data.documentType}
Document Hash: ${data.documentHash}
Attachment: ${data.attachmentFileName}

Approve: ${data.approveUrl}
Reject: ${data.rejectUrl}
`;

  const info = await transporter.sendMail({
    from: config.smtp.from,
    to: recipient,
    replyTo: data.requesterEmail,
    subject: subjectLine,
    text: textBody,
    html: htmlBody,
    attachments: [
      {
        filename: data.attachmentFileName,
        content: data.attachmentContent,
        contentType: data.attachmentMimeType,
      },
    ],
  });

  if (!config.smtp.user) {
    console.log('[DEV EMAIL] Mint approval request sent');
    console.log('[DEV EMAIL] Recipient:', recipient);
    console.log('[DEV EMAIL] Approve URL:', data.approveUrl);
    console.log('[DEV EMAIL] Reject URL:', data.rejectUrl);
    console.log('[DEV EMAIL] Message ID:', info.messageId);
  }
}

// ---------------------------------------------------------------------------
// Security Token Deployment Approval Request Email
// ---------------------------------------------------------------------------

interface SecurityTokenApprovalRequestEmailData {
  requestId: string;
  requesterUserId: string;
  requesterEmail: string;
  chainId: number;
  tokenName: string;
  tokenSymbol: string;
  decimals: number;
  totalSupply: string;
  maxTotalSupply: string;
  minTimelockAmount: string;
  maxReleaseDelayDays: number;
  originalValue: string;
  documentHash: string;
  documentType: string;
  hashSource: string;
  submittedAtIso: string;
  approveUrl: string;
  rejectUrl: string;
  attachmentFileName?: string | null;
  attachmentMimeType?: string | null;
  attachmentContent?: Buffer | null;
}

export async function sendSecurityTokenApprovalRequestEmail(
  data: SecurityTokenApprovalRequestEmailData,
): Promise<void> {
  const recipient = config.securityTokenApproval.requestRecipient;
  const escapedTokenName = escapeHtmlForEmail(data.tokenName);
  const escapedTokenSymbol = escapeHtmlForEmail(data.tokenSymbol);
  const escapedDocHash = escapeHtmlForEmail(data.documentHash);
  const escapedDocType = escapeHtmlForEmail(data.documentType);
  const escapedHashSource = escapeHtmlForEmail(data.hashSource);
  const escapedRequesterEmail = escapeHtmlForEmail(data.requesterEmail);
  const escapedRequesterUserId = escapeHtmlForEmail(data.requesterUserId);
  const escapedAttachmentFileName = escapeHtmlForEmail(
    data.attachmentFileName || 'No attachment provided',
  );

  const subjectLine =
    `[Security Token Approval] ${data.tokenName} (${data.tokenSymbol}) ` +
    `on chain ${data.chainId} by ${data.requesterEmail}`;

  const htmlBody = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Security Token Deployment Approval Request</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f7;padding:36px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="720" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 2px 10px rgba(0,0,0,0.08);">
          <tr>
            <td style="background-color:#0f172a;padding:28px 36px;">
              <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;">Fueki Security Token Deployment Approval</h1>
              <p style="margin:10px 0 0;color:#93c5fd;font-size:13px;">Request ID: ${data.requestId}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 36px;">
              <p style="margin:0 0 18px;color:#374151;font-size:14px;line-height:1.6;">
                A user submitted a security token deployment request. Review the configuration below and choose an action.
              </p>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#f8fafc;border:1px solid #e5e7eb;border-radius:8px;padding:14px;">
                <tr><td style="padding:7px 0;color:#6b7280;font-size:13px;width:190px;">Requester Email</td><td style="padding:7px 0;color:#111827;font-size:14px;font-weight:600;">${escapedRequesterEmail}</td></tr>
                <tr><td style="padding:7px 0;color:#6b7280;font-size:13px;">Requester User ID</td><td style="padding:7px 0;color:#111827;font-size:14px;">${escapedRequesterUserId}</td></tr>
                <tr><td style="padding:7px 0;color:#6b7280;font-size:13px;">Submitted At</td><td style="padding:7px 0;color:#111827;font-size:14px;">${escapeHtmlForEmail(data.submittedAtIso)}</td></tr>
                <tr><td style="padding:7px 0;color:#6b7280;font-size:13px;">Network (chainId)</td><td style="padding:7px 0;color:#111827;font-size:14px;">${data.chainId}</td></tr>
                <tr><td style="padding:7px 0;color:#6b7280;font-size:13px;">Token Name</td><td style="padding:7px 0;color:#111827;font-size:14px;font-weight:600;">${escapedTokenName}</td></tr>
                <tr><td style="padding:7px 0;color:#6b7280;font-size:13px;">Token Symbol</td><td style="padding:7px 0;color:#111827;font-size:14px;font-weight:600;">${escapedTokenSymbol}</td></tr>
                <tr><td style="padding:7px 0;color:#6b7280;font-size:13px;">Decimals</td><td style="padding:7px 0;color:#111827;font-size:14px;">${data.decimals}</td></tr>
                <tr><td style="padding:7px 0;color:#6b7280;font-size:13px;">Initial Supply</td><td style="padding:7px 0;color:#111827;font-size:14px;">${escapeHtmlForEmail(data.totalSupply)}</td></tr>
                <tr><td style="padding:7px 0;color:#6b7280;font-size:13px;">Max Supply</td><td style="padding:7px 0;color:#111827;font-size:14px;">${escapeHtmlForEmail(data.maxTotalSupply)}</td></tr>
                <tr><td style="padding:7px 0;color:#6b7280;font-size:13px;">Min Timelock Amount</td><td style="padding:7px 0;color:#111827;font-size:14px;">${escapeHtmlForEmail(data.minTimelockAmount)}</td></tr>
                <tr><td style="padding:7px 0;color:#6b7280;font-size:13px;">Max Release Delay</td><td style="padding:7px 0;color:#111827;font-size:14px;">${data.maxReleaseDelayDays} days</td></tr>
                <tr><td style="padding:7px 0;color:#6b7280;font-size:13px;">Original Value</td><td style="padding:7px 0;color:#111827;font-size:14px;">${escapeHtmlForEmail(data.originalValue)}</td></tr>
                <tr><td style="padding:7px 0;color:#6b7280;font-size:13px;">Document Type</td><td style="padding:7px 0;color:#111827;font-size:14px;">${escapedDocType}</td></tr>
                <tr><td style="padding:7px 0;color:#6b7280;font-size:13px;">Hash Source</td><td style="padding:7px 0;color:#111827;font-size:14px;">${escapedHashSource}</td></tr>
                <tr><td style="padding:7px 0;color:#6b7280;font-size:13px;">Document Hash</td><td style="padding:7px 0;color:#111827;font-size:13px;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,'Courier New',monospace;word-break:break-all;">${escapedDocHash}</td></tr>
                <tr><td style="padding:7px 0;color:#6b7280;font-size:13px;">Attachment</td><td style="padding:7px 0;color:#111827;font-size:14px;">${escapedAttachmentFileName}</td></tr>
              </table>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px;">
                <tr>
                  <td align="center" style="padding-right:8px;">
                    <a href="${data.approveUrl}" target="_blank" style="display:inline-block;padding:12px 32px;background:#059669;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:700;">
                      Approve Deployment
                    </a>
                  </td>
                  <td align="center" style="padding-left:8px;">
                    <a href="${data.rejectUrl}" target="_blank" style="display:inline-block;padding:12px 32px;background:#dc2626;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:700;">
                      Reject Deployment
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:20px 0 0;color:#6b7280;font-size:12px;">
                Action links are one-time use and expire automatically.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const textBody = `Security Token Deployment Approval Request

Request ID: ${data.requestId}
Requester: ${data.requesterEmail} (${data.requesterUserId})
Submitted At: ${data.submittedAtIso}
Chain ID: ${data.chainId}

Token Name: ${data.tokenName}
Token Symbol: ${data.tokenSymbol}
Decimals: ${data.decimals}
Initial Supply: ${data.totalSupply}
Max Supply: ${data.maxTotalSupply}
Min Timelock Amount: ${data.minTimelockAmount}
Max Release Delay: ${data.maxReleaseDelayDays} days
Original Value: ${data.originalValue}
Document Type: ${data.documentType}
Hash Source: ${data.hashSource}
Document Hash: ${data.documentHash}
Attachment: ${data.attachmentFileName || 'No attachment provided'}

Approve: ${data.approveUrl}
Reject: ${data.rejectUrl}
`;

  const attachments =
    data.attachmentFileName && data.attachmentMimeType && data.attachmentContent
      ? [
          {
            filename: data.attachmentFileName,
            content: data.attachmentContent,
            contentType: data.attachmentMimeType,
          },
        ]
      : [];

  const info = await transporter.sendMail({
    from: config.smtp.from,
    to: recipient,
    replyTo: data.requesterEmail,
    subject: subjectLine,
    text: textBody,
    html: htmlBody,
    attachments,
  });

  if (!config.smtp.user) {
    console.log('[DEV EMAIL] Security token approval request sent');
    console.log('[DEV EMAIL] Recipient:', recipient);
    console.log('[DEV EMAIL] Approve URL:', data.approveUrl);
    console.log('[DEV EMAIL] Reject URL:', data.rejectUrl);
    console.log('[DEV EMAIL] Message ID:', info.messageId);
  }
}

// ---------------------------------------------------------------------------
// Support Request Email
// ---------------------------------------------------------------------------

export type SupportRequestCategory =
  | 'general'
  | 'technical'
  | 'wallet'
  | 'swap'
  | 'compliance'
  | 'billing';

interface SupportRequestEmailData {
  subject: string;
  message: string;
  category: SupportRequestCategory;
  contactEmail: string;
  contactName?: string;
  route?: string;
  userId?: string;
  accountEmail?: string;
  userAgent?: string;
  ipAddress?: string;
  submittedAtIso: string;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function categoryLabel(category: SupportRequestCategory): string {
  switch (category) {
    case 'technical':
      return 'Technical Issue';
    case 'wallet':
      return 'Wallet / Connection';
    case 'swap':
      return 'Swap / Exchange';
    case 'compliance':
      return 'Compliance / Security Token';
    case 'billing':
      return 'Billing';
    case 'general':
    default:
      return 'General Question';
  }
}

export async function sendSupportRequestEmail(
  data: SupportRequestEmailData,
): Promise<void> {
  const safeSubject = data.subject.trim();
  const safeMessage = data.message.trim();
  const safeName = data.contactName?.trim() || 'Not provided';
  const safeRoute = data.route?.trim() || 'Not provided';
  const safeUserId = data.userId?.trim() || 'Anonymous';
  const safeAccountEmail = data.accountEmail?.trim() || 'Not authenticated';
  const safeUserAgent = data.userAgent?.trim() || 'Not provided';
  const safeIp = data.ipAddress?.trim() || 'Not provided';
  const category = categoryLabel(data.category);

  const subjectLine = `[Fueki Support] ${category} - ${safeSubject}`;

  const htmlBody = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>New Support Request</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f7;padding:40px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="680" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
          <tr>
            <td style="background-color:#0f172a;padding:28px 36px;">
              <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;">Fueki Support Request</h1>
              <p style="margin:10px 0 0;color:#93c5fd;font-size:13px;">${escapeHtml(data.submittedAtIso)}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 36px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
                <tr>
                  <td style="padding:7px 0;color:#6b7280;font-size:13px;width:180px;">Category</td>
                  <td style="padding:7px 0;color:#111827;font-size:14px;font-weight:600;">${escapeHtml(category)}</td>
                </tr>
                <tr>
                  <td style="padding:7px 0;color:#6b7280;font-size:13px;">Subject</td>
                  <td style="padding:7px 0;color:#111827;font-size:14px;font-weight:600;">${escapeHtml(safeSubject)}</td>
                </tr>
                <tr>
                  <td style="padding:7px 0;color:#6b7280;font-size:13px;">Contact Name</td>
                  <td style="padding:7px 0;color:#111827;font-size:14px;">${escapeHtml(safeName)}</td>
                </tr>
                <tr>
                  <td style="padding:7px 0;color:#6b7280;font-size:13px;">Contact Email</td>
                  <td style="padding:7px 0;color:#111827;font-size:14px;">${escapeHtml(data.contactEmail)}</td>
                </tr>
                <tr>
                  <td style="padding:7px 0;color:#6b7280;font-size:13px;">Authenticated Account Email</td>
                  <td style="padding:7px 0;color:#111827;font-size:14px;">${escapeHtml(safeAccountEmail)}</td>
                </tr>
                <tr>
                  <td style="padding:7px 0;color:#6b7280;font-size:13px;">User ID</td>
                  <td style="padding:7px 0;color:#111827;font-size:14px;">${escapeHtml(safeUserId)}</td>
                </tr>
                <tr>
                  <td style="padding:7px 0;color:#6b7280;font-size:13px;">Route</td>
                  <td style="padding:7px 0;color:#111827;font-size:14px;">${escapeHtml(safeRoute)}</td>
                </tr>
                <tr>
                  <td style="padding:7px 0;color:#6b7280;font-size:13px;">IP Address</td>
                  <td style="padding:7px 0;color:#111827;font-size:14px;">${escapeHtml(safeIp)}</td>
                </tr>
                <tr>
                  <td style="padding:7px 0;color:#6b7280;font-size:13px;">User Agent</td>
                  <td style="padding:7px 0;color:#111827;font-size:14px;word-break:break-word;">${escapeHtml(safeUserAgent)}</td>
                </tr>
              </table>
              <hr style="border:none;border-top:1px solid #e5e7eb;margin:22px 0;" />
              <h2 style="margin:0 0 10px;color:#111827;font-size:16px;">Issue Details</h2>
              <pre style="margin:0;background:#f8fafc;border:1px solid #e5e7eb;border-radius:8px;padding:14px;color:#111827;white-space:pre-wrap;word-break:break-word;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,'Liberation Mono','Courier New',monospace;font-size:13px;line-height:1.55;">${escapeHtml(safeMessage)}</pre>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const textBody = `Fueki Support Request

Submitted At: ${data.submittedAtIso}
Category: ${category}
Subject: ${safeSubject}
Contact Name: ${safeName}
Contact Email: ${data.contactEmail}
Authenticated Account Email: ${safeAccountEmail}
User ID: ${safeUserId}
Route: ${safeRoute}
IP Address: ${safeIp}
User Agent: ${safeUserAgent}

Issue Details:
${safeMessage}
`;

  const info = await transporter.sendMail({
    from: config.smtp.from,
    to: config.support.requestRecipient,
    replyTo: data.contactEmail,
    subject: subjectLine,
    text: textBody,
    html: htmlBody,
  });

  if (!config.smtp.user) {
    console.log('[DEV EMAIL] Support request email sent');
    console.log('[DEV EMAIL] Recipient:', config.support.requestRecipient);
    console.log('[DEV EMAIL] Message ID:', info.messageId);
  }
}
