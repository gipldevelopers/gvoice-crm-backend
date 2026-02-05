const prisma = require('./prisma');
const bcrypt = require('bcryptjs');

async function main() {
  // 1. Create Default Company
  const companyEmail = 'developer@gohilinfotech.com';

  let company = await prisma.company.findFirst({
    where: { name: 'Gohil Infotech' }
  });

  if (!company) {
    company = await prisma.company.create({
      data: {
        name: 'Gohil Infotech',
        address: '123 Tech Park, Silicon Valley',
        logo: 'https://gohilinfotech.com/logo.png',
        gstNo: '24ABCDE1234F1Z5'
      }
    });
    console.log('Default company "Gohil Infotech" created.');
  } else {
    console.log('Default company already exists.');
  }

  // 2. Create Admin User
  const adminEmail = 'developer@gohilinfotech.com';
  const hashedPassword = await bcrypt.hash('Admin@123', 10);

  const existingUser = await prisma.user.findUnique({
    where: { email: adminEmail }
  });

  if (!existingUser) {
    await prisma.user.create({
      data: {
        username: 'gipl_admin',
        fullName: 'GIPL admin',
        email: adminEmail,
        phone: '1234567890',
        password: hashedPassword,
        department: 'Management',
        role: 'admin',
        companyId: company.id
      },
    });
    console.log(`Admin user ${adminEmail} is created.`);
  } else {
    // Update existing user to ensure company link and role
    await prisma.user.update({
      where: { email: adminEmail },
      data: {
        companyId: company.id,
        role: 'admin'
      }
    });
    console.log(`Admin user ${adminEmail} updated.`);
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