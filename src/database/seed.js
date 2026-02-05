const prisma = require('./prisma');

async function main() {
  const email = 'admin@project.com';

  const existingUser = await prisma.user.findUnique({
    where: { email }
  });

  if (!existingUser) {
    await prisma.user.create({
      data: {
        email,
        name: 'Admin User',
      },
    });
    console.log(`Admin user ${email} is created.`);
  } else {
    console.log(`Admin user ${email} already exists. Skipping.`);
  }
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });