const prisma = require('../../database/prisma');

class CustomerService {
    // Create a new customer
    async createCustomer(data, companyId) {
        try {
            const customer = await prisma.customer.create({
                data: {
                    ...data,
                    companyId,
                    // If leadId is provided, it connects automatically
                },
            });
            return customer;
        } catch (error) {
            if (error.code === 'P2002') {
                throw new Error('A customer with this email or phone already exists or Lead is already converted.');
            }
            throw new Error(`Error creating customer: ${error.message}`);
        }
    }

    // Get all customers with filters
    async getAllCustomers(companyId, filters = {}) {
        const { search, type, status } = filters;

        const where = {
            companyId,
            ...(type && { type }),
            ...(status && { status }),
            ...(search && {
                OR: [
                    { name: { contains: search, mode: 'insensitive' } },
                    { email: { contains: search, mode: 'insensitive' } },
                    { phone: { contains: search, mode: 'insensitive' } },
                    { gst: { contains: search, mode: 'insensitive' } },
                    { contactPerson: { contains: search, mode: 'insensitive' } },
                ],
            }),
        };

        try {
            const customers = await prisma.customer.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                include: {
                    lead: {
                        select: {
                            id: true,
                            value: true,
                            source: true,
                        }
                    },
                    deals: {
                        select: {
                            id: true,
                            value: true,
                        }
                    }
                }
            });

            // Calculate deals count and total revenue
            const evaluatedCustomers = customers.map(customer => {
                const totalRevenue = customer.deals.reduce((acc, deal) => acc + (deal.value || 0), 0);
                return {
                    ...customer,
                    deals: customer.deals.length,
                    totalRevenue: totalRevenue,
                };
            });

            return evaluatedCustomers;
        } catch (error) {
            throw new Error(`Error fetching customers: ${error.message}`);
        }
    }

    // Get customer by ID
    async getCustomerById(id, companyId) {
        try {
            const customer = await prisma.customer.findFirst({
                where: { id, companyId },
                include: {
                    lead: true,
                },
            });
            if (!customer) throw new Error('Customer not found');
            return customer;
        } catch (error) {
            throw new Error(`Error fetching customer: ${error.message}`);
        }
    }

    // Update customer
    async updateCustomer(id, data, companyId) {
        try {
            const customer = await prisma.customer.findFirst({ where: { id, companyId } });
            if (!customer) throw new Error('Customer not found');

            return await prisma.customer.update({
                where: { id },
                data,
            });
        } catch (error) {
            throw new Error(`Error updating customer: ${error.message}`);
        }
    }

    // Delete customer
    async deleteCustomer(id, companyId) {
        try {
            const customer = await prisma.customer.findFirst({ where: { id, companyId } });
            if (!customer) throw new Error('Customer not found');

            await prisma.customer.delete({ where: { id } });
            return { message: 'Customer deleted successfully' };
        } catch (error) {
            throw new Error(`Error deleting customer: ${error.message}`);
        }
    }

    // Convert Lead to Customer
    async convertLeadToCustomer(leadId, companyId, actorUserId = null) {
        try {
            const lead = await prisma.lead.findFirst({
                where: { id: leadId, companyId },
            });

            if (!lead) throw new Error('Lead not found');

            // Check if already converted
            const existingCustomer = await prisma.customer.findUnique({
                where: { leadId },
            });

            if (existingCustomer) {
                await prisma.leadAuditLog.create({
                    data: {
                        leadId: lead.id,
                        companyId,
                        actorUserId,
                        action: 'CONVERT_TO_CUSTOMER',
                        message: 'Lead already converted to customer',
                        changes: {
                            customerId: existingCustomer.id,
                            alreadyConverted: true,
                        },
                    },
                });

                return {
                    customer: existingCustomer,
                    alreadyConverted: true,
                };
            }

            // Create customer from lead data
            const customerData = {
                name: lead.name,
                email: lead.email || '',
                phone: lead.phone,
                type: 'Individual', // Default, can be updated later
                status: 'Active',
                notes: `Converted from lead source: ${lead.source}. ${lead.notes || ''}`,
                leadId: lead.id,
                companyId,
            };

            // Transaction to ensure atomicity
            const result = await prisma.$transaction(async (prisma) => {
                const customer = await prisma.customer.create({
                    data: customerData,
                });

                // Update lead status to Won if not already
                if (lead.status !== 'Converted' && lead.status !== 'Won') {
                    // Assuming 'Won' is the status for won leads, or we add 'Converted'
                    // The user said "when lead came and it is won then that lead becomes the customer"
                    await prisma.lead.update({
                        where: { id: leadId },
                        data: { status: 'Won' },
                    });
                }

                return customer;
            });

            await prisma.leadAuditLog.create({
                data: {
                    leadId: lead.id,
                    companyId,
                    actorUserId,
                    action: 'CONVERT_TO_CUSTOMER',
                    message: 'Lead converted to customer',
                    changes: {
                        customerId: result.id,
                        alreadyConverted: false,
                    },
                },
            });

            return {
                customer: result,
                alreadyConverted: false,
            };
        } catch (error) {
            console.error(error);
            throw new Error(`Error converting lead to customer: ${error.message}`);
        }
    }
}

module.exports = new CustomerService();
