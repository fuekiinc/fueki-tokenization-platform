import assert from 'node:assert/strict';
import test from 'node:test';
import {
  accountSchema,
  getPasswordStrength,
  identitySchema,
  personalSchema,
} from '../../src/components/Forms/signupSchemas';

function toDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function dateYearsAgo(years: number): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  return toDateInputValue(d);
}

test('accountSchema validates required fields and matching passwords', () => {
  const valid = accountSchema.safeParse({
    email: 'issuer@fueki.example',
    password: 'FuekiPass123!',
    confirmPassword: 'FuekiPass123!',
    acceptTerms: true,
  });

  assert.equal(valid.success, true);

  const mismatch = accountSchema.safeParse({
    email: 'issuer@fueki.example',
    password: 'FuekiPass123!',
    confirmPassword: 'Different123!',
    acceptTerms: true,
  });

  assert.equal(mismatch.success, false);
  assert.equal(
    mismatch.error.issues.some((issue) => issue.message === 'Passwords do not match'),
    true,
  );

  const missingTerms = accountSchema.safeParse({
    email: 'issuer@fueki.example',
    password: 'FuekiPass123!',
    confirmPassword: 'FuekiPass123!',
    acceptTerms: false,
  });

  assert.equal(missingTerms.success, false);
  assert.equal(
    missingTerms.error.issues.some(
      (issue) => issue.message === 'You must accept the terms of service',
    ),
    true,
  );
});

test('personalSchema enforces age floor/ceiling and phone format', () => {
  const valid = personalSchema.safeParse({
    firstName: 'Alex',
    lastName: 'Rivera',
    dateOfBirth: dateYearsAgo(30),
    phone: '+12125551234',
    helpLevel: 'intermediate',
  });
  assert.equal(valid.success, true);

  const underage = personalSchema.safeParse({
    firstName: 'Alex',
    lastName: 'Rivera',
    dateOfBirth: dateYearsAgo(17),
    phone: '+12125551234',
    helpLevel: 'novice',
  });
  assert.equal(underage.success, false);
  assert.equal(
    underage.error.issues.some((issue) => issue.message === 'You must be at least 18 years old'),
    true,
  );

  const tooOld = personalSchema.safeParse({
    firstName: 'Alex',
    lastName: 'Rivera',
    dateOfBirth: dateYearsAgo(130),
    phone: '+12125551234',
    helpLevel: 'expert',
  });
  assert.equal(tooOld.success, false);
  assert.equal(
    tooOld.error.issues.some((issue) => issue.message === 'Please enter a valid date of birth'),
    true,
  );

  const invalidPhone = personalSchema.safeParse({
    firstName: 'Alex',
    lastName: 'Rivera',
    dateOfBirth: dateYearsAgo(30),
    phone: '555-123-9999',
    helpLevel: 'novice',
  });
  assert.equal(invalidPhone.success, false);
  assert.equal(
    invalidPhone.error.issues.some((issue) =>
      issue.message.includes('Enter a valid phone number'),
    ),
    true,
  );
});

test('identitySchema accepts masked formats and blocks malformed SSNs', () => {
  const dashed = identitySchema.safeParse({
    ssn: '123-45-6789',
    documentType: 'passport',
  });
  assert.equal(dashed.success, true);

  const undashed = identitySchema.safeParse({
    ssn: '123456789',
    documentType: 'drivers_license',
  });
  assert.equal(undashed.success, true);

  const invalid = identitySchema.safeParse({
    ssn: '12-345-678',
    documentType: 'national_id',
  });
  assert.equal(invalid.success, false);
  assert.equal(
    invalid.error.issues.some((issue) =>
      issue.message.includes('Enter a valid SSN in the format'),
    ),
    true,
  );
});

test('password strength helper returns weak/medium/strong tiers', () => {
  assert.equal(getPasswordStrength('short'), 'weak');
  assert.equal(getPasswordStrength('Longer123'), 'medium');
  assert.equal(getPasswordStrength('FuekiVeryStrong123!'), 'strong');
});
