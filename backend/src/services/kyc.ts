import { encrypt } from './encryption';
import { sendKYCReviewEmail } from './email';
import { prisma } from '../prisma';

interface KYCInput {
  userId: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  ssn: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
  documentType: string;
  documentPath: string;
  documentOrigName: string;
  documentMimeType?: string;
  documentBackPath?: string;
  documentBackOrigName?: string;
  documentBackMimeType?: string;
  liveVideoPath: string;
  liveVideoOrigName: string;
  liveVideoMimeType?: string;
  subscriptionPlan: string;
}

export async function submitKYC(input: KYCInput) {
  // Encrypt all PII fields
  const data = {
    userId: input.userId,
    encryptedFirstName: encrypt(input.firstName),
    encryptedLastName: encrypt(input.lastName),
    encryptedDOB: encrypt(input.dateOfBirth),
    encryptedSSN: encrypt(input.ssn),
    encryptedAddress1: encrypt(input.addressLine1),
    encryptedAddress2: input.addressLine2 ? encrypt(input.addressLine2) : null,
    encryptedCity: encrypt(input.city),
    encryptedState: encrypt(input.state),
    encryptedZipCode: encrypt(input.zipCode),
    encryptedCountry: encrypt(input.country),
    documentType: input.documentType,
    documentPath: input.documentPath,
    documentOrigName: input.documentOrigName,
    documentMimeType: input.documentMimeType ?? null,
    documentBackPath: input.documentBackPath ?? null,
    documentBackOrigName: input.documentBackOrigName ?? null,
    documentBackMimeType: input.documentBackMimeType ?? null,
    liveVideoPath: input.liveVideoPath,
    liveVideoOrigName: input.liveVideoOrigName,
    liveVideoMimeType: input.liveVideoMimeType ?? null,
    subscriptionPlan: input.subscriptionPlan,
  };

  // Upsert KYC data
  const kycData = await prisma.kYCData.upsert({
    where: { userId: input.userId },
    create: data,
    update: data,
  });

  // Update user KYC status to pending
  const user = await prisma.user.update({
    where: { id: input.userId },
    data: { kycStatus: 'pending' },
  });

  // Send admin notification email (fire-and-forget). Per ADR-004, we only
  // pass the fields actually rendered in the email body — no PII leaves this
  // process via email.
  sendKYCReviewEmail({
    userId: input.userId,
    documentType: input.documentType,
    subscriptionPlan: input.subscriptionPlan,
    submittedAt: new Date().toISOString(),
  }).catch((err) => {
    console.error('Failed to send KYC review email:', err);
  });

  return kycData;
}

export async function getKYCStatus(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { kycStatus: true },
  });

  const kycData = await prisma.kYCData.findUnique({
    where: { userId },
    select: { submittedAt: true, reviewedAt: true, reviewNotes: true },
  });

  return {
    status: user?.kycStatus || 'not_submitted',
    submittedAt: kycData?.submittedAt?.toISOString(),
    reviewedAt: kycData?.reviewedAt?.toISOString(),
    message: kycData?.reviewNotes || undefined,
  };
}

export async function approveKYC(userId: string, notes?: string) {
  await prisma.user.update({
    where: { id: userId },
    data: { kycStatus: 'approved', demoUsed: false, demoActive: false },
  });

  await prisma.kYCData.update({
    where: { userId },
    data: {
      reviewedAt: new Date(),
      reviewNotes: notes || 'Approved',
    },
  });
}

export async function rejectKYC(userId: string, reason: string) {
  await prisma.user.update({
    where: { id: userId },
    data: { kycStatus: 'rejected' },
  });

  await prisma.kYCData.update({
    where: { userId },
    data: {
      reviewedAt: new Date(),
      reviewNotes: reason,
    },
  });
}

// Re-export from storage module for backward compatibility
export { saveEncryptedDocument } from './storage';
