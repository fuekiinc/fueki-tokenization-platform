import nodemailer from 'nodemailer';
import { config } from '../config';

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
