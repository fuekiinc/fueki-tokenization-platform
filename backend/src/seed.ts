import 'dotenv/config';
import { hashPassword } from './services/auth';
import { prisma } from './prisma';

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL || 'admin@fueki-tech.com';
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!password) {
    console.error(
      'FATAL: SEED_ADMIN_PASSWORD environment variable is required.\n' +
      'Set it before running the seed script:\n' +
      '  SEED_ADMIN_PASSWORD="YourSecurePassword" npx ts-node src/seed.ts',
    );
    process.exit(1);
  }

  const passwordHash = await hashPassword(password);

  const user = await prisma.user.upsert({
    where: { email },
    update: {
      passwordHash,
      role: 'admin',
      kycStatus: 'approved',
    },
    create: {
      email,
      passwordHash,
      role: 'admin',
      kycStatus: 'approved',
    },
  });

  console.log(`Admin account ready: ${user.email} (id: ${user.id}, role: ${user.role}, kycStatus: ${user.kycStatus})`);
}

main()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
