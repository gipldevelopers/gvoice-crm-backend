const prisma = require('./database/prisma');

async function main() {
    try {
        const companies = await prisma.company.findMany();
        console.log("=== COMPANIES ===");
        console.log(JSON.stringify(companies, null, 2));
    } catch (err) {
        console.error("Error:", err);
    } finally {
        await prisma.$disconnect();
    }
}

main();
