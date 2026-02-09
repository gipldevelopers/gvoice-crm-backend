const prisma = require('../../database/prisma');

class LeadService {
    // Create a new lead
    async createLead(leadData, companyId) {
        try {
            const lead = await prisma.lead.create({
                data: {
                    name: leadData.name,
                    phone: leadData.phone,
                    email: leadData.email,
                    source: leadData.source,
                    value: parseFloat(leadData.value),
                    status: leadData.status || 'New',
                    notes: leadData.notes,
                    salespersonId: leadData.salespersonId || null,
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
                    company: {
                        select: {
                            id: true,
                            name: true,
                        },
                    },
                },
            });
            return lead;
        } catch (error) {
            throw new Error(`Error creating lead: ${error.message}`);
        }
    }

    // Get all leads for a company
    async getAllLeads(companyId, filters = {}) {
        try {
            const { search, status, source, salespersonId } = filters;

            const where = {
                companyId: companyId,
                ...(status && { status }),
                ...(source && { source }),
                ...(salespersonId && { salespersonId }),
                ...(search && {
                    OR: [
                        { name: { contains: search, mode: 'insensitive' } },
                        { email: { contains: search, mode: 'insensitive' } },
                        { phone: { contains: search, mode: 'insensitive' } },
                    ],
                }),
            };

            const leads = await prisma.lead.findMany({
                where,
                include: {
                    salesperson: {
                        select: {
                            id: true,
                            fullName: true,
                            email: true,
                        },
                    },
                },
                orderBy: {
                    createdAt: 'desc',
                },
            });
            return leads;
        } catch (error) {
            throw new Error(`Error fetching leads: ${error.message}`);
        }
    }

    // Get a single lead by ID
    async getLeadById(leadId, companyId) {
        try {
            const lead = await prisma.lead.findFirst({
                where: {
                    id: leadId,
                    companyId: companyId,
                },
                include: {
                    salesperson: {
                        select: {
                            id: true,
                            fullName: true,
                            email: true,
                            phone: true,
                        },
                    },
                    company: {
                        select: {
                            id: true,
                            name: true,
                        },
                    },
                },
            });

            if (!lead) {
                throw new Error('Lead not found');
            }

            return lead;
        } catch (error) {
            throw new Error(`Error fetching lead: ${error.message}`);
        }
    }

    // Update a lead
    async updateLead(leadId, leadData, companyId) {
        try {
            // First verify the lead belongs to the company
            const existingLead = await prisma.lead.findFirst({
                where: {
                    id: leadId,
                    companyId: companyId,
                },
            });

            if (!existingLead) {
                throw new Error('Lead not found');
            }

            const updatedLead = await prisma.lead.update({
                where: {
                    id: leadId,
                },
                data: {
                    ...(leadData.name && { name: leadData.name }),
                    ...(leadData.phone && { phone: leadData.phone }),
                    ...(leadData.email !== undefined && { email: leadData.email }),
                    ...(leadData.source && { source: leadData.source }),
                    ...(leadData.value !== undefined && { value: parseFloat(leadData.value) }),
                    ...(leadData.status && { status: leadData.status }),
                    ...(leadData.notes !== undefined && { notes: leadData.notes }),
                    ...(leadData.salespersonId !== undefined && { salespersonId: leadData.salespersonId }),
                },
                include: {
                    salesperson: {
                        select: {
                            id: true,
                            fullName: true,
                            email: true,
                        },
                    },
                },
            });

            return updatedLead;
        } catch (error) {
            throw new Error(`Error updating lead: ${error.message}`);
        }
    }

    // Delete a lead
    async deleteLead(leadId, companyId) {
        try {
            // First verify the lead belongs to the company
            const existingLead = await prisma.lead.findFirst({
                where: {
                    id: leadId,
                    companyId: companyId,
                },
            });

            if (!existingLead) {
                throw new Error('Lead not found');
            }

            await prisma.lead.delete({
                where: {
                    id: leadId,
                },
            });

            return { message: 'Lead deleted successfully' };
        } catch (error) {
            throw new Error(`Error deleting lead: ${error.message}`);
        }
    }

    // Get lead statistics for dashboard
    async getLeadStats(companyId, filters = {}) {
        try {
            const { startDate, endDate } = filters;

            const where = {
                companyId: companyId,
                ...(startDate && endDate && {
                    createdAt: {
                        gte: new Date(startDate),
                        lte: new Date(endDate),
                    },
                }),
            };

            const [
                totalLeads,
                newLeads,
                contactedLeads,
                qualifiedLeads,
                lostLeads,
                totalValue,
            ] = await Promise.all([
                prisma.lead.count({ where }),
                prisma.lead.count({ where: { ...where, status: 'New' } }),
                prisma.lead.count({ where: { ...where, status: 'Contacted' } }),
                prisma.lead.count({ where: { ...where, status: 'Qualified' } }),
                prisma.lead.count({ where: { ...where, status: 'Lost' } }),
                prisma.lead.aggregate({
                    where,
                    _sum: {
                        value: true,
                    },
                }),
            ]);

            return {
                totalLeads,
                newLeads,
                contactedLeads,
                qualifiedLeads,
                lostLeads,
                totalValue: totalValue._sum.value || 0,
                conversionRate: totalLeads > 0 ? ((qualifiedLeads / totalLeads) * 100).toFixed(2) : 0,
            };
        } catch (error) {
            throw new Error(`Error fetching lead statistics: ${error.message}`);
        }
    }

    // Get leads by salesperson
    async getLeadsBySalesperson(salespersonId, companyId) {
        try {
            const leads = await prisma.lead.findMany({
                where: {
                    salespersonId: salespersonId,
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
                },
                orderBy: {
                    createdAt: 'desc',
                },
            });
            return leads;
        } catch (error) {
            throw new Error(`Error fetching leads by salesperson: ${error.message}`);
        }
    }

    // Assign a lead to a salesperson
    async assignLead(leadId, salespersonId, companyId) {
        try {
            // First verify the lead belongs to the company
            const existingLead = await prisma.lead.findFirst({
                where: {
                    id: leadId,
                    companyId: companyId,
                },
            });

            if (!existingLead) {
                throw new Error('Lead not found');
            }

            // Verify salesperson exists and belongs to company (optional but recommended)
            if (salespersonId) {
                const salesperson = await prisma.user.findFirst({
                    where: {
                        id: salespersonId,
                        companyId: companyId,
                    },
                });

                if (!salesperson) {
                    throw new Error('Salesperson not found');
                }
            }

            const updatedLead = await prisma.lead.update({
                where: {
                    id: leadId,
                },
                data: {
                    salespersonId: salespersonId,
                },
                include: {
                    salesperson: {
                        select: {
                            id: true,
                            fullName: true,
                            email: true,
                        },
                    },
                },
            });

            return updatedLead;
        } catch (error) {
            throw new Error(`Error assigning lead: ${error.message}`);
        }
    }

    // Update lead status
    async updateStatus(leadId, status, companyId) {
        try {
            // First verify the lead belongs to the company
            const existingLead = await prisma.lead.findFirst({
                where: {
                    id: leadId,
                    companyId: companyId,
                },
            });

            if (!existingLead) {
                throw new Error('Lead not found');
            }

            const updatedLead = await prisma.lead.update({
                where: {
                    id: leadId,
                },
                data: {
                    status: status,
                },
                include: {
                    salesperson: {
                        select: {
                            id: true,
                            fullName: true,
                            email: true,
                        },
                    },
                },
            });

            return updatedLead;
        } catch (error) {
            throw new Error(`Error updating lead status: ${error.message}`);
        }
    }
}

module.exports = new LeadService();
