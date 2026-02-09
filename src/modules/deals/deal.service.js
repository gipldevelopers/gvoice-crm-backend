const prisma = require('../../database/prisma');

class DealService {
    async createDeal(dealData, companyId) {
        try {
            const deal = await prisma.deal.create({
                data: {
                    title: dealData.title,
                    value: parseFloat(dealData.value),
                    stage: dealData.stage || 'New Deal',
                    closingDate: dealData.closingDate ? new Date(dealData.closingDate) : null,
                    probability: parseInt(dealData.probability) || 10,
                    notes: dealData.notes,
                    salespersonId: dealData.salespersonId || null,
                    customerId: dealData.customerId || null,
                    companyId: companyId,
                },
                include: {
                    salesperson: {
                        select: {
                            id: true,
                            fullName: true,
                            email: true,
                        },
                    },
                    customer: {
                        select: {
                            id: true,
                            name: true,
                        },
                    },
                },
            });
            return deal;
        } catch (error) {
            throw new Error(`Error creating deal: ${error.message}`);
        }
    }

    async getAllDeals(companyId, filters = {}) {
        try {
            const {
                search,
                stage,
                salespersonId,
                customerId,
                startDate,
                endDate,
                minValue,
                maxValue,
                page = 1,
                limit = 10
            } = filters;

            const where = {
                companyId: companyId,
                ...(stage && { stage }),
                ...(salespersonId && { salespersonId }),
                ...(customerId && { customerId }),
                ...(startDate && endDate && {
                    closingDate: {
                        gte: new Date(startDate),
                        lte: new Date(endDate),
                    },
                }),
                ...((minValue || maxValue) && {
                    value: {
                        ...(minValue && { gte: parseFloat(minValue) }),
                        ...(maxValue && { lte: parseFloat(maxValue) }),
                    },
                }),
                ...(search && {
                    OR: [
                        { title: { contains: search, mode: 'insensitive' } },
                        { customer: { name: { contains: search, mode: 'insensitive' } } },
                    ],
                }),
            };

            const [deals, total] = await Promise.all([
                prisma.deal.findMany({
                    where,
                    include: {
                        salesperson: {
                            select: {
                                id: true,
                                fullName: true,
                                email: true,
                            },
                        },
                        customer: {
                            select: {
                                id: true,
                                name: true,
                            },
                        },
                    },
                    orderBy: {
                        updatedAt: 'desc',
                    },
                    skip: (page - 1) * limit,
                    take: limit,
                }),
                prisma.deal.count({ where }),
            ]);

            return {
                deals,
                pagination: {
                    total,
                    page,
                    limit,
                    totalPages: Math.ceil(total / limit),
                },
            };
        } catch (error) {
            throw new Error(`Error fetching deals: ${error.message}`);
        }
    }

    async getDealById(dealId, companyId) {
        try {
            const deal = await prisma.deal.findFirst({
                where: {
                    id: dealId,
                    companyId: companyId,
                },
                include: {
                    salesperson: {
                        select: {
                            id: true,
                            fullName: true,
                            email: true,
                        },
                    },
                    customer: {
                        select: {
                            id: true,
                            name: true,
                        },
                    },
                },
            });

            if (!deal) {
                throw new Error('Deal not found');
            }

            return deal;
        } catch (error) {
            throw new Error(`Error fetching deal: ${error.message}`);
        }
    }

    async updateDeal(dealId, dealData, companyId) {
        try {
            const existingDeal = await prisma.deal.findFirst({
                where: {
                    id: dealId,
                    companyId: companyId,
                },
            });

            if (!existingDeal) {
                throw new Error('Deal not found');
            }

            const updatedDeal = await prisma.deal.update({
                where: {
                    id: dealId,
                },
                data: {
                    ...(dealData.title && { title: dealData.title }),
                    ...(dealData.value !== undefined && { value: parseFloat(dealData.value) }),
                    ...(dealData.stage && { stage: dealData.stage }),
                    ...(dealData.closingDate !== undefined && { closingDate: dealData.closingDate ? new Date(dealData.closingDate) : null }),
                    ...(dealData.probability !== undefined ? { probability: parseInt(dealData.probability) } : (dealData.stage && {
                        probability: {
                            'New Deal': 10,
                            'Requirement Shared': 30,
                            'Quotation Sent': 50,
                            'Follow-up': 60,
                            'Negotiation': 80,
                            'Won': 100,
                            'Lost': 0
                        }[dealData.stage] ?? existingDeal.probability
                    })),
                    ...(dealData.notes !== undefined && { notes: dealData.notes }),
                    ...(dealData.salespersonId !== undefined && { salespersonId: dealData.salespersonId }),
                    ...(dealData.customerId !== undefined && { customerId: dealData.customerId }),
                },
                include: {
                    salesperson: {
                        select: {
                            id: true,
                            fullName: true,
                            email: true,
                        },
                    },
                    customer: {
                        select: {
                            id: true,
                            name: true,
                        },
                    },
                },
            });

            return updatedDeal;
        } catch (error) {
            throw new Error(`Error updating deal: ${error.message}`);
        }
    }

    async deleteDeal(dealId, companyId) {
        try {
            const existingDeal = await prisma.deal.findFirst({
                where: {
                    id: dealId,
                    companyId: companyId,
                },
            });

            if (!existingDeal) {
                throw new Error('Deal not found');
            }

            await prisma.deal.delete({
                where: {
                    id: dealId,
                },
            });

            return { message: 'Deal deleted successfully' };
        } catch (error) {
            throw new Error(`Error deleting deal: ${error.message}`);
        }
    }
}

module.exports = new DealService();
