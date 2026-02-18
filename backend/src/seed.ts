import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { hashPassword } from './services/auth';

const prisma = new PrismaClient();

async function main() {
  const email = 'mark@fueki-tech.com';
  const password = 'M@rk3771$!';

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
