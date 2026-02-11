const prisma = require('../../database/prisma');

const LEAD_TIMER_DAYS = 15;
const MILLISECONDS_IN_DAY = 24 * 60 * 60 * 1000;
const LEAD_WIN_PROBABILITY = {
    New: 10,
    Contacted: 25,
    Qualified: 40,
    'Requirement Shared': 50,
    'Quotation Sent': 60,
    'Follow-up': 70,
    Negotiation: 85,
    Won: 100,
    Lost: 0,
};

class LeadService {
    async createAuditLog({ leadId, companyId, actorUserId = null, action, message = null, changes = null }) {
        await prisma.leadAuditLog.create({
            data: {
                leadId,
                companyId,
                actorUserId,
                action,
                message,
                changes,
            },
        });
    }

    getChangedFields(before, after, fields) {
        const changes = {};
        fields.forEach((field) => {
            if (before[field] !== after[field]) {
                changes[field] = {
                    from: before[field] ?? null,
                    to: after[field] ?? null,
                };
            }
        });
        return changes;
    }

    getLeadTimerData(createdAt) {
        const timerStartAt = new Date(createdAt);
        const timerEndAt = new Date(timerStartAt.getTime() + (LEAD_TIMER_DAYS * MILLISECONDS_IN_DAY));
        const remainingMilliseconds = timerEndAt.getTime() - Date.now();

        return {
            leadTimerStartAt: timerStartAt,
            leadTimerEndAt: timerEndAt,
            leadTimerTotalDays: LEAD_TIMER_DAYS,
            leadTimerDaysRemaining: Math.max(0, Math.ceil(remainingMilliseconds / MILLISECONDS_IN_DAY)),
            leadTimerExpired: remainingMilliseconds <= 0,
        };
    }

    attachLeadTimerData(lead) {
        if (!lead) return lead;
        return {
            ...lead,
            ...this.getLeadTimerData(lead.createdAt),
            leadWinProbability: LEAD_WIN_PROBABILITY[lead.status] ?? 0,
        };
    }

    attachLeadTimerDataToList(leads) {
        return leads.map((lead) => this.attachLeadTimerData(lead));
    }

    // Create a new lead
    async createLead(leadData, companyId, defaultSalespersonId = null, actorUserId = null) {
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
                    salespersonId: leadData.salespersonId || defaultSalespersonId || null,
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
            await this.createAuditLog({
                leadId: lead.id,
                companyId,
                actorUserId: actorUserId || defaultSalespersonId || null,
                action: 'CREATE',
                message: 'Lead created',
                changes: {
                    name: lead.name,
                    phone: lead.phone,
                    email: lead.email,
                    source: lead.source,
                    value: lead.value,
                    status: lead.status,
                    salespersonId: lead.salespersonId,
                },
            });
            return this.attachLeadTimerData(lead);
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
            return this.attachLeadTimerDataToList(leads);
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
                    auditLogs: {
                        include: {
                            actorUser: {
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
                    },
                },
            });

            if (!lead) {
                throw new Error('Lead not found');
            }

            return this.attachLeadTimerData(lead);
        } catch (error) {
            throw new Error(`Error fetching lead: ${error.message}`);
        }
    }

    // Update a lead
    async updateLead(leadId, leadData, companyId, actorUserId = null) {
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

            const changes = this.getChangedFields(existingLead, updatedLead, [
                'name',
                'phone',
                'email',
                'source',
                'value',
                'status',
                'notes',
                'salespersonId',
            ]);

            if (Object.keys(changes).length > 0) {
                await this.createAuditLog({
                    leadId,
                    companyId,
                    actorUserId,
                    action: 'UPDATE',
                    message: 'Lead details updated',
                    changes,
                });
            }

            return this.attachLeadTimerData(updatedLead);
        } catch (error) {
            throw new Error(`Error updating lead: ${error.message}`);
        }
    }

    // Delete a lead
    async deleteLead(leadId, companyId, actorUserId = null) {
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

            await this.createAuditLog({
                leadId,
                companyId,
                actorUserId,
                action: 'DELETE',
                message: 'Lead deleted',
                changes: {
                    name: existingLead.name,
                    status: existingLead.status,
                    salespersonId: existingLead.salespersonId,
                },
            });

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
            return this.attachLeadTimerDataToList(leads);
        } catch (error) {
            throw new Error(`Error fetching leads by salesperson: ${error.message}`);
        }
    }

    // Assign a lead to a salesperson
    async assignLead(leadId, salespersonId, companyId, actorUserId = null) {
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

            await this.createAuditLog({
                leadId,
                companyId,
                actorUserId,
                action: 'ASSIGN_CHANGE',
                message: salespersonId ? 'Lead owner changed' : 'Lead unassigned',
                changes: {
                    salespersonId: {
                        from: existingLead.salespersonId ?? null,
                        to: updatedLead.salespersonId ?? null,
                    },
                },
            });

            return this.attachLeadTimerData(updatedLead);
        } catch (error) {
            throw new Error(`Error assigning lead: ${error.message}`);
        }
    }

    // Update lead status
    async updateStatus(leadId, status, companyId, actorUserId = null) {
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

            if (existingLead.status !== updatedLead.status) {
                await this.createAuditLog({
                    leadId,
                    companyId,
                    actorUserId,
                    action: 'STATUS_CHANGE',
                    message: `Lead status changed to ${updatedLead.status}`,
                    changes: {
                        status: {
                            from: existingLead.status,
                            to: updatedLead.status,
                        },
                    },
                });
            }

            return this.attachLeadTimerData(updatedLead);
        } catch (error) {
            throw new Error(`Error updating lead status: ${error.message}`);
        }
    }

    async requestClaim(leadId, requesterId, companyId) {
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
                        },
                    },
                },
            });

            if (!lead) {
                throw new Error('Lead not found');
            }

            if (lead.salespersonId && lead.salespersonId === requesterId) {
                throw new Error('You already own this lead');
            }

            const timerData = this.getLeadTimerData(lead.createdAt);
            if (!timerData.leadTimerExpired && timerData.leadTimerDaysRemaining > 3) {
                throw new Error('Lead claim is available only when 3 days or less are left');
            }

            const requester = await prisma.user.findFirst({
                where: {
                    id: requesterId,
                    companyId: companyId,
                },
                select: {
                    id: true,
                    fullName: true,
                    email: true,
                },
            });

            if (!requester) {
                throw new Error('Requester not found');
            }

            let targetUser = lead.salesperson;
            if (!targetUser) {
                targetUser = await prisma.user.findFirst({
                    where: {
                        companyId: companyId,
                        role: 'admin',
                        NOT: { id: requesterId },
                    },
                    select: {
                        id: true,
                        fullName: true,
                        email: true,
                    },
                });
            }

            if (!targetUser) {
                throw new Error('No lead owner/admin found to receive claim request');
            }

            const existingRequest = await prisma.task.findFirst({
                where: {
                    companyId: companyId,
                    linkedType: 'Lead',
                    linkedId: lead.id,
                    status: 'Pending',
                    title: { contains: 'Claim request', mode: 'insensitive' },
                    notes: { contains: `Requester ID: ${requester.id}`, mode: 'insensitive' },
                },
            });

            if (existingRequest) {
                throw new Error('Claim request already pending for this lead');
            }

            const now = new Date();
            const dueTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

            const claimTask = await prisma.task.create({
                data: {
                    title: `Claim request for lead: ${lead.name}`,
                    type: 'Email',
                    linkedType: 'Lead',
                    linkedId: lead.id,
                    linkedTo: lead.name,
                    assignedTo: targetUser.fullName,
                    dueDate: now,
                    dueTime: dueTime,
                    status: 'Pending',
                    priority: 'High',
                    notes: `Lead claim request\nRequester: ${requester.fullName} (${requester.email})\nRequester ID: ${requester.id}\nCurrent Owner: ${targetUser.fullName}`,
                    companyId: companyId,
                },
            });

            await this.createAuditLog({
                leadId,
                companyId,
                actorUserId: requesterId,
                action: 'CLAIM_REQUEST',
                message: `Claim requested by ${requester.fullName}`,
                changes: {
                    requestedToUserId: targetUser.id,
                    taskId: claimTask.id,
                },
            });

            return {
                taskId: claimTask.id,
                requestedTo: {
                    id: targetUser.id,
                    fullName: targetUser.fullName,
                    email: targetUser.email,
                },
                lead: this.attachLeadTimerData(lead),
            };
        } catch (error) {
            throw new Error(`Error requesting lead claim: ${error.message}`);
        }
    }
}

module.exports = new LeadService();
