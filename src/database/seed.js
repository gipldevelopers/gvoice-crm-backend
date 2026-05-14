const prisma = require('./prisma');
const bcrypt = require('bcryptjs');

async function main() {
  // 1. Create Platform Company (for Super Admin)
  const platformCompanyName = 'Gvoice Platform';
  const platformCompanyEmail = 'platform@gvoice.com';

  let platformCompany = await prisma.company.findFirst({
    where: { name: platformCompanyName }
  });

  if (!platformCompany) {
    platformCompany = await prisma.company.create({
      data: {
        name: platformCompanyName,
        email: platformCompanyEmail,
        address: 'Platform HQ',
        status: 'active'
      }
    });
    console.log(`Platform company "${platformCompanyName}" created.`);
  } else {
    console.log('Platform company already exists.');
  }

  // 2. Create Super Admin User
  const superAdminEmail = 'superadmin@gvoice.com';
  const superAdminPassword = 'SuperAdmin@123';
  const superAdminHashedPassword = await bcrypt.hash(superAdminPassword, 10);

  const existingSuperAdmin = await prisma.user.findUnique({
    where: { email: superAdminEmail }
  });

  if (!existingSuperAdmin) {
    await prisma.user.create({
      data: {
        username: 'gvoice_super',
        fullName: 'Gvoice Admin',
        email: superAdminEmail,
        phone: '0000000000',
        password: superAdminHashedPassword,
        department: null,
        role: 'super_admin',
        companyId: platformCompany.id
      },
    });
    console.log(`Super admin user ${superAdminEmail} created.`);
  } else {
    await prisma.user.update({
      where: { email: superAdminEmail },
      data: {
        companyId: platformCompany.id,
        role: 'super_admin'
      }
    });
    console.log(`Super admin user ${superAdminEmail} updated.`);
  }

  // 3. Create Default Company
  const companyEmail = 'developer@gohilinfotech.com';

  let company = await prisma.company.findFirst({
    where: { name: 'Gohil Infotech' }
  });

  if (!company) {
    company = await prisma.company.create({
      data: {
        name: 'Gohil Infotech',
        email: companyEmail,
        address: '123 Tech Park, Silicon Valley',
        logo: 'https://gohilinfotech.com/logo.png',
        gstNo: '24ABCDE1234F1Z5'
      }
    });
    console.log('Default company "Gohil Infotech" created.');
  } else {
    console.log('Default company already exists.');
  }

  // 4. Create Company Admin User
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
        role: 'company_admin',
        companyId: company.id
      },
    });
    console.log(`Company admin user ${adminEmail} created.`);
  } else {
    await prisma.user.update({
      where: { email: adminEmail },
      data: {
        companyId: company.id,
        role: 'company_admin'
      }
    });
    console.log(`Company admin user ${adminEmail} updated.`);
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
