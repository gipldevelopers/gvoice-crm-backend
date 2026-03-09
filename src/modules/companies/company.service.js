const prisma = require('../../database/prisma');

class CompanyService {
    async createCompany(companyData) {
        try {
            const company = await prisma.company.create({
                data: {
                    name: companyData.name,
                    email: companyData.email,
                    address: companyData.address,
                    logo: companyData.logo,
                    gstNo: companyData.gstNo,
                    status: companyData.status || 'active'
                }
            });
            return company;
        } catch (error) {
            throw new Error(`Error creating company: ${error.message}`);
        }
    }

    async getAllCompanies(filters = {}) {
        try {
            const { search, status, page = 1, limit = 10 } = filters;
            const skip = (page - 1) * limit;

            const where = {
                ...(search && {
                    OR: [
                        { name: { contains: search, mode: 'insensitive' } },
                        { gstNo: { contains: search, mode: 'insensitive' } }
                    ],
                }),
                ...(status && status !== 'all' && { status }),
            };

            const [companies, total] = await Promise.all([
                prisma.company.findMany({
                    where,
                    include: {
                        _count: {
                            select: { users: true }
                        }
                    },
                    skip: parseInt(skip),
                    take: parseInt(limit),
                    orderBy: { createdAt: 'desc' },
                }),
                prisma.company.count({ where }),
            ]);

            return {
                companies: companies.map(c => ({
                    ...c,
                    usersCount: c._count.users
                })),
                pagination: {
                    total,
                    page: parseInt(page),
                    limit: parseInt(limit),
                    totalPages: Math.ceil(total / limit),
                },
            };
        } catch (error) {
            throw new Error(`Error fetching companies: ${error.message}`);
        }
    }

    async getCompanyById(companyId) {
        try {
            const company = await prisma.company.findUnique({
                where: { id: companyId },
                include: {
                    _count: {
                        select: { users: true, deals: true }
                    },
                    users: {
                        select: {
                            id: true,
                            fullName: true,
                            email: true,
                            role: true
                        },
                        take: 5 // Just a few for the view
                    }
                }
            });

            if (!company) throw new Error('Company not found');
            return company;
        } catch (error) {
            throw new Error(`Error fetching company: ${error.message}`);
        }
    }

    async updateCompany(companyId, companyData) {
        try {
            const updatedCompany = await prisma.company.update({
                where: { id: companyId },
                data: {
                    ...(companyData.name && { name: companyData.name }),
                    ...(companyData.email && { email: companyData.email }),
                    ...(companyData.address && { address: companyData.address }),
                    ...(companyData.logo && { logo: companyData.logo }),
                    ...(companyData.gstNo && { gstNo: companyData.gstNo }),
                    ...(companyData.status && { status: companyData.status })
                },
            });
            return updatedCompany;
        } catch (error) {
            throw new Error(`Error updating company: ${error.message}`);
        }
    }

    async deleteCompany(companyId) {
        try {
            // Check if company has users before deleting? 
            // The user asked for "delete company functionality workable".
            // Since company is the root for many entities, deleting it should be handled carefully.
            // But for now, I'll implement a straight delete.

            await prisma.company.delete({
                where: { id: companyId },
            });
            return { message: 'Company deleted successfully' };
        } catch (error) {
            throw new Error(`Error deleting company: ${error.message}`);
        }
    }
}

module.exports = new CompanyService();
