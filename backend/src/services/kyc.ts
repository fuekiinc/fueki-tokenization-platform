import { PrismaClient } from '@prisma/client';
import { encrypt } from './encryption';
import { saveEncryptedDocument } from './storage';

const prisma = new PrismaClient();

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
  };

  // Upsert KYC data
  const kycData = await prisma.kYCData.upsert({
    where: { userId: input.userId },
    create: data,
    update: data,
  });

  // Update user KYC status to pending
  await prisma.user.update({
    where: { id: input.userId },
    data: { kycStatus: 'pending' },
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
    data: { kycStatus: 'approved' },
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
