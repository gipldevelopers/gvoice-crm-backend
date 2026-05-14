const prisma = require('../src/database/prisma');

async function main() {
    const users = await prisma.user.findMany({
        take: 5,
        select: { id: true, role: true, department: true, fullName: true, companyId: true }
    });
    console.log(JSON.stringify(users, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
