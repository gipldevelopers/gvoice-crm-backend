const prisma = require('./src/database/prisma');

async function checkData() {
    try {
        const userCount = await prisma.user.count();
        const companyCount = await prisma.company.count();
        console.log(`Users: ${userCount}, Companies: ${companyCount}`);

        const latestUsers = await prisma.user.findMany({ take: 5, orderBy: { createdAt: 'desc' } });
        console.log('Latest Users:', latestUsers.map(u => ({ id: u.id, fullName: u.fullName || 'No Name', createdAt: u.createdAt, companyId: u.companyId })));

        const latestCompanies = await prisma.company.findMany({ take: 5, orderBy: { createdAt: 'desc' } });
        console.log('Latest Companies:', latestCompanies.map(c => ({ id: c.id, name: c.name || 'No Name', createdAt: c.createdAt })));
    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

checkData();
