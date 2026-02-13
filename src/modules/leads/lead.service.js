const prisma = require('../../database/prisma');
const { EMPLOYEE_ROLES, normalizeRole } = require('../../helpers/employeeHierarchy');

const LEAD_TIMER_DAYS = 15;
const MILLISECONDS_IN_DAY = 24 * 60 * 60 * 1000;
const CLAIM_APPROVAL_WINDOW_HOURS = 12;
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
    extractRequesterIdFromNotes(notes = '') {
        if (!notes) return null;
        const match = String(notes).match(/Requester ID:\s*([a-zA-Z0-9-]+)/i);
        return match ? match[1] : null;
    }

    extractClaimDeadlineFromTask(task) {
        if (task?.dueDate) return new Date(task.dueDate);
        const createdAt = new Date(task?.createdAt || Date.now());
        return new Date(createdAt.getTime() + (CLAIM_APPROVAL_WINDOW_HOURS * 60 * 60 * 1000));
    }

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
        const timerBaseDate = lead.leadTimerStartAt || lead.createdAt;
        return {
            ...lead,
            ...this.getLeadTimerData(timerBaseDate),
            leadWinProbability: LEAD_WIN_PROBABILITY[lead.status] ?? 0,
        };
    }

    attachLeadTimerDataToList(leads) {
        return leads.map((lead) => this.attachLeadTimerData(lead));
    }

    async getLeadTimerStartMap(companyId, leadIds = []) {
        if (!leadIds.length) return new Map();

        const ownershipLogs = await prisma.leadAuditLog.findMany({
            where: {
                companyId,
                leadId: { in: leadIds },
                action: { in: ['ASSIGN_CHANGE', 'CLAIM_APPROVED'] },
            },
            select: {
                leadId: true,
                createdAt: true,
            },
            orderBy: {
                createdAt: 'desc',
            },
        });

        const timerStartMap = new Map();
        ownershipLogs.forEach((log) => {
            if (!timerStartMap.has(log.leadId)) {
                timerStartMap.set(log.leadId, log.createdAt);
            }
        });

        return timerStartMap;
    }

    async getLeadTimerStartAt(companyId, leadId, fallbackDate) {
        const latestOwnershipLog = await prisma.leadAuditLog.findFirst({
            where: {
                companyId,
                leadId,
                action: { in: ['ASSIGN_CHANGE', 'CLAIM_APPROVED'] },
            },
            select: { createdAt: true },
            orderBy: { createdAt: 'desc' },
        });

        return latestOwnershipLog?.createdAt || fallbackDate;
    }

    async expirePendingClaimTasks(companyId, leadIds = []) {
        const where = {
            companyId,
            linkedType: 'Lead',
            status: 'Pending',
            title: { contains: 'Claim request', mode: 'insensitive' },
            dueDate: { lt: new Date() },
            ...(leadIds.length ? { linkedId: { in: leadIds } } : {}),
        };

        const expiredTasks = await prisma.task.findMany({
            where,
            select: {
                id: true,
                linkedId: true,
                notes: true,
                dueDate: true,
            },
        });

        if (!expiredTasks.length) return 0;

        const requesterIds = expiredTasks
            .map((task) => this.extractRequesterIdFromNotes(task.notes))
            .filter(Boolean);

        const requesters = requesterIds.length
            ? await prisma.user.findMany({
                where: { companyId, id: { in: requesterIds } },
                select: { id: true, fullName: true },
            })
            : [];
        const requesterMap = new Map(requesters.map((item) => [item.id, item]));

        await prisma.$transaction(async (tx) => {
            await Promise.all(
                expiredTasks.map((task) => tx.task.update({
                    where: { id: task.id },
                    data: {
                        status: 'Completed',
                        notes: `${task.notes || ''}\nDecision: AUTO-REJECTED (12h claim window expired) on ${new Date().toISOString()}`,
                    },
                }))
            );

            await Promise.all(
                expiredTasks.map((task) => {
                    const requesterId = this.extractRequesterIdFromNotes(task.notes);
                    const requester = requesterId ? requesterMap.get(requesterId) : null;
                    return tx.leadAuditLog.create({
                        data: {
                            leadId: task.linkedId,
                            companyId,
                            actorUserId: null,
                            action: 'CLAIM_AUTO_REJECTED',
                            message: 'Claim auto-rejected after 12h approval window expired',
                            changes: {
                                requesterId: requesterId || null,
                                requesterName: requester?.fullName || null,
                                taskId: task.id,
                                reason: 'claim_window_expired',
                                claimApprovalWindowHours: CLAIM_APPROVAL_WINDOW_HOURS,
                            },
                        },
                    });
                })
            );
        });

        return expiredTasks.length;
    }

    async resolveClaimApproverForLeadOwner({ companyId, leadOwnerId, requesterId }) {
        if (!leadOwnerId) return null;

        const owner = await prisma.user.findFirst({
            where: { id: leadOwnerId, companyId },
            select: {
                id: true,
                fullName: true,
                email: true,
                role: true,
                reportsToId: true,
            },
        });

        if (!owner) return null;

        const manager = owner.reportsToId
            ? await prisma.user.findFirst({
                where: { id: owner.reportsToId, companyId },
                select: {
                    id: true,
                    fullName: true,
                    email: true,
                    role: true,
                },
            })
            : null;

        if (manager && normalizeRole(manager.role) === EMPLOYEE_ROLES.TEAM_LEADER && manager.id !== requesterId) {
            return manager;
        }

        return null;
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
    async getAllLeads(companyId, filters = {}, requesterId = null) {
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

            if (!leads.length) {
                return this.attachLeadTimerDataToList(leads);
            }

            const leadIds = leads.map((lead) => lead.id);
            await this.expirePendingClaimTasks(companyId, leadIds);
            const timerStartMap = await this.getLeadTimerStartMap(companyId, leadIds);
            const pendingClaimTasks = await prisma.task.findMany({
                where: {
                    companyId,
                    linkedType: 'Lead',
                    linkedId: { in: leadIds },
                    status: 'Pending',
                    title: { contains: 'Claim request', mode: 'insensitive' },
                },
                orderBy: { createdAt: 'desc' },
                select: { id: true, linkedId: true, notes: true, dueDate: true, createdAt: true }
            });

            const requesterIds = pendingClaimTasks
                .map((task) => this.extractRequesterIdFromNotes(task.notes))
                .filter(Boolean);

            const requesters = requesterIds.length
                ? await prisma.user.findMany({
                    where: { companyId, id: { in: requesterIds } },
                    select: { id: true, fullName: true, email: true }
                })
                : [];

            const requesterMap = new Map(requesters.map((userRecord) => [userRecord.id, userRecord]));
            const openClaimTaskByLead = new Map();
            const pendingClaimLeadIdSetForRequester = new Set();

            pendingClaimTasks.forEach((task) => {
                if (!openClaimTaskByLead.has(task.linkedId)) {
                    openClaimTaskByLead.set(task.linkedId, task);
                }
            });

            if (requesterId) {
                pendingClaimTasks.forEach((task) => {
                    const taskRequesterId = this.extractRequesterIdFromNotes(task.notes);
                    if (taskRequesterId === requesterId) {
                        pendingClaimLeadIdSetForRequester.add(task.linkedId);
                    }
                });
            }

            const enrichedLeads = leads.map((lead) => ({
                ...lead,
                claimLockActive: openClaimTaskByLead.has(lead.id),
                claimLockExpiresAt: openClaimTaskByLead.has(lead.id)
                    ? this.extractClaimDeadlineFromTask(openClaimTaskByLead.get(lead.id))
                    : null,
                claimLockRequestedBy: (() => {
                    const claimTask = openClaimTaskByLead.get(lead.id);
                    if (!claimTask) return null;
                    const claimRequesterId = this.extractRequesterIdFromNotes(claimTask.notes);
                    return claimRequesterId ? (requesterMap.get(claimRequesterId) || null) : null;
                })(),
                leadTimerStartAt: timerStartMap.get(lead.id) || lead.createdAt,
                claimRequestPendingByCurrentUser: pendingClaimLeadIdSetForRequester.has(lead.id),
                openClaimRequestsCount: openClaimTaskByLead.has(lead.id) ? 1 : 0,
                openClaimRequesters: (() => {
                    const claimTask = openClaimTaskByLead.get(lead.id);
                    if (!claimTask) return [];
                    const claimRequesterId = this.extractRequesterIdFromNotes(claimTask.notes);
                    if (!claimRequesterId || !requesterMap.has(claimRequesterId)) return [];
                    return [requesterMap.get(claimRequesterId)];
                })()
            }));

            return this.attachLeadTimerDataToList(enrichedLeads);
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

            const timerStartAt = await this.getLeadTimerStartAt(companyId, lead.id, lead.createdAt);
            return this.attachLeadTimerData({
                ...lead,
                leadTimerStartAt: timerStartAt,
            });
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

            const [previousOwner, nextOwner] = await Promise.all([
                existingLead.salespersonId
                    ? prisma.user.findFirst({
                        where: { id: existingLead.salespersonId, companyId },
                        select: { id: true, fullName: true, email: true },
                    })
                    : Promise.resolve(null),
                salespersonId
                    ? prisma.user.findFirst({
                        where: { id: salespersonId, companyId },
                        select: { id: true, fullName: true, email: true },
                    })
                    : Promise.resolve(null),
            ]);

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
                    previousOwnerName: previousOwner?.fullName ?? null,
                    currentOwnerName: nextOwner?.fullName ?? null,
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

            await this.expirePendingClaimTasks(companyId, [lead.id]);

            if (lead.salespersonId && lead.salespersonId === requesterId) {
                throw new Error('You already own this lead');
            }

            const timerStartAt = await this.getLeadTimerStartAt(companyId, lead.id, lead.createdAt);
            const timerData = this.getLeadTimerData(timerStartAt);
            if (!timerData.leadTimerExpired) {
                throw new Error('Lead claim is available only after 15 days');
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

            let targetUser = await this.resolveClaimApproverForLeadOwner({
                companyId,
                leadOwnerId: lead.salespersonId,
                requesterId,
            });

            // Fallback to current owner if no Team Leader is available in hierarchy.
            if (!targetUser) {
                targetUser = lead.salesperson;
            }
            if (!targetUser) {
                targetUser = await prisma.user.findFirst({
                    where: {
                        companyId: companyId,
                        role: { in: ['admin', EMPLOYEE_ROLES.COMPANY_ADMIN] },
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
                throw new Error('No lead owner/company admin found to receive claim request');
            }

            const existingRequest = await prisma.task.findFirst({
                where: {
                    companyId: companyId,
                    linkedType: 'Lead',
                    linkedId: lead.id,
                    status: 'Pending',
                    title: { contains: 'Claim request', mode: 'insensitive' },
                },
                orderBy: { createdAt: 'desc' },
                select: { id: true, notes: true, dueDate: true, createdAt: true }
            });

            if (existingRequest) {
                const existingRequesterId = this.extractRequesterIdFromNotes(existingRequest.notes);
                const existingRequester = existingRequesterId
                    ? await prisma.user.findFirst({
                        where: { id: existingRequesterId, companyId },
                        select: { fullName: true }
                    })
                    : null;
                const expiry = this.extractClaimDeadlineFromTask(existingRequest);
                throw new Error(`Claim already requested${existingRequester?.fullName ? ` by ${existingRequester.fullName}` : ''}. It unlocks after ${expiry.toLocaleString()}`);
            }

            const now = new Date();
            const approvalDeadline = new Date(now.getTime() + (CLAIM_APPROVAL_WINDOW_HOURS * 60 * 60 * 1000));
            const dueTime = `${String(approvalDeadline.getHours()).padStart(2, '0')}:${String(approvalDeadline.getMinutes()).padStart(2, '0')}`;

            const claimTask = await prisma.task.create({
                data: {
                    title: `Claim request for lead: ${lead.name}`,
                    type: 'Email',
                    linkedType: 'Lead',
                    linkedId: lead.id,
                    linkedTo: lead.name,
                    assignedTo: targetUser.fullName,
                    dueDate: approvalDeadline,
                    dueTime: dueTime,
                    status: 'Pending',
                    priority: 'High',
                    notes: `Lead claim request\nRequester: ${requester.fullName} (${requester.email})\nRequester ID: ${requester.id}\nCurrent Owner: ${lead.salesperson?.fullName || 'Unassigned'}\nApprover: ${targetUser.fullName}\nApproval Window: ${CLAIM_APPROVAL_WINDOW_HOURS}h`,
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
                    requestedToName: targetUser.fullName,
                    requesterId: requester.id,
                    requesterName: requester.fullName,
                    approvalWindowHours: CLAIM_APPROVAL_WINDOW_HOURS,
                    approvalDeadlineAt: approvalDeadline.toISOString(),
                    previousOwnerId: lead.salespersonId ?? null,
                    previousOwnerName: lead.salesperson?.fullName ?? null,
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
                approvalDeadlineAt: approvalDeadline,
                lead: this.attachLeadTimerData({
                    ...lead,
                    leadTimerStartAt: timerStartAt,
                }),
            };
        } catch (error) {
            throw new Error(`Error requesting lead claim: ${error.message}`);
        }
    }

    async getClaimActivities(companyId, userId) {
        await this.expirePendingClaimTasks(companyId);

        const user = await prisma.user.findFirst({
            where: { id: userId, companyId },
            select: { id: true, fullName: true }
        });

        if (!user) {
            throw new Error('User not found');
        }

        const tasks = await prisma.task.findMany({
            where: {
                companyId,
                linkedType: 'Lead',
                status: 'Pending',
                title: { contains: 'Claim request', mode: 'insensitive' },
                assignedTo: user.fullName
            },
            orderBy: { createdAt: 'desc' }
        });

        if (!tasks.length) return [];

        const leadIds = tasks.map((task) => task.linkedId).filter(Boolean);
        const requesterIds = tasks
            .map((task) => this.extractRequesterIdFromNotes(task.notes))
            .filter(Boolean);

        const [leads, requesters, timerStartMap] = await Promise.all([
            prisma.lead.findMany({
                where: { companyId, id: { in: leadIds } },
                select: {
                    id: true,
                    name: true,
                    createdAt: true,
                    salespersonId: true,
                    salesperson: { select: { id: true, fullName: true, email: true } }
                }
            }),
            prisma.user.findMany({
                where: { companyId, id: { in: requesterIds } },
                select: { id: true, fullName: true, email: true, role: true }
            }),
            this.getLeadTimerStartMap(companyId, leadIds),
        ]);

        const leadMap = new Map(leads.map((lead) => [lead.id, lead]));
        const requesterMap = new Map(requesters.map((userRecord) => [userRecord.id, userRecord]));

        return tasks.map((task) => {
            const requesterId = this.extractRequesterIdFromNotes(task.notes);
            const lead = leadMap.get(task.linkedId);
            const requester = requesterMap.get(requesterId);
            return {
                id: task.id,
                taskId: task.id,
                createdAt: task.createdAt,
                dueDate: task.dueDate,
                approvalDeadlineAt: this.extractClaimDeadlineFromTask(task),
                title: task.title,
                status: task.status,
                notes: task.notes,
                lead: lead
                    ? this.attachLeadTimerData({
                        ...lead,
                        leadTimerStartAt: timerStartMap.get(lead.id) || lead.createdAt,
                    })
                    : null,
                requester: requester || null
            };
        });
    }

    async decideClaimRequest({ taskId, decision, companyId, actorUserId }) {
        await this.expirePendingClaimTasks(companyId);

        const actor = await prisma.user.findFirst({
            where: { id: actorUserId, companyId },
            select: { id: true, fullName: true }
        });

        if (!actor) {
            throw new Error('User not found');
        }

        const task = await prisma.task.findFirst({
            where: {
                id: taskId,
                companyId,
                linkedType: 'Lead',
                title: { contains: 'Claim request', mode: 'insensitive' }
            }
        });

        if (!task) {
            throw new Error('Claim request activity not found');
        }

        if (task.status !== 'Pending') {
            throw new Error('Claim request already processed');
        }

        if (task.dueDate && new Date(task.dueDate).getTime() < Date.now()) {
            await prisma.task.update({
                where: { id: task.id },
                data: {
                    status: 'Completed',
                    notes: `${task.notes || ''}\nDecision: EXPIRED (approval window of ${CLAIM_APPROVAL_WINDOW_HOURS}h passed) on ${new Date().toISOString()}`,
                },
            });
            throw new Error('Claim request expired (approval window is over 12h)');
        }

        if (task.assignedTo !== actor.fullName) {
            throw new Error('You are not authorized to decide this claim request');
        }

        const requesterId = this.extractRequesterIdFromNotes(task.notes);
        if (!requesterId) {
            throw new Error('Invalid claim request payload');
        }

        const [lead, requester] = await Promise.all([
            prisma.lead.findFirst({
                where: { id: task.linkedId, companyId },
                select: {
                    id: true,
                    name: true,
                    salespersonId: true
                }
            }),
            prisma.user.findFirst({
                where: { id: requesterId, companyId },
                select: { id: true, fullName: true, email: true }
            })
        ]);

        if (!lead) {
            throw new Error('Lead not found');
        }
        if (!requester) {
            throw new Error('Requester not found');
        }

        const previousOwner = lead.salespersonId
            ? await prisma.user.findFirst({
                where: { id: lead.salespersonId, companyId },
                select: { id: true, fullName: true, email: true },
            })
            : null;

        const nowIsoString = new Date().toISOString();
        let updatedTask = null;
        let autoRejectedCount = 0;

        if (decision === 'approve') {
            const otherPendingClaimTasks = await prisma.task.findMany({
                where: {
                    companyId,
                    linkedType: 'Lead',
                    linkedId: lead.id,
                    status: 'Pending',
                    title: { contains: 'Claim request', mode: 'insensitive' },
                    NOT: { id: task.id },
                },
                select: {
                    id: true,
                    notes: true,
                },
            });

            const otherRequesterIds = otherPendingClaimTasks
                .map((pendingTask) => this.extractRequesterIdFromNotes(pendingTask.notes))
                .filter(Boolean);

            const otherRequesters = otherRequesterIds.length
                ? await prisma.user.findMany({
                    where: { companyId, id: { in: otherRequesterIds } },
                    select: { id: true, fullName: true, email: true },
                })
                : [];
            const otherRequesterMap = new Map(otherRequesters.map((userRecord) => [userRecord.id, userRecord]));

            const transactionResult = await prisma.$transaction(async (tx) => {
                const nextLead = await tx.lead.update({
                    where: { id: lead.id },
                    data: { salespersonId: requester.id },
                });

                const decidedTask = await tx.task.update({
                    where: { id: task.id },
                    data: {
                        status: 'Completed',
                        notes: `${task.notes || ''}\nDecision: APPROVED by ${actor.fullName} on ${nowIsoString}`,
                    },
                });

                const autoRejectedTasks = await Promise.all(
                    otherPendingClaimTasks.map((pendingTask) => tx.task.update({
                        where: { id: pendingTask.id },
                        data: {
                            status: 'Completed',
                            notes: `${pendingTask.notes || ''}\nDecision: AUTO-REJECTED (owner approved another requester) by ${actor.fullName} on ${nowIsoString}`,
                        },
                    }))
                );

                await tx.leadAuditLog.create({
                    data: {
                        leadId: lead.id,
                        companyId,
                        actorUserId,
                        action: 'CLAIM_APPROVED',
                        message: `Claim approved by ${actor.fullName}`,
                        changes: {
                            salespersonId: {
                                from: lead.salespersonId ?? null,
                                to: requester.id,
                            },
                            previousOwnerId: previousOwner?.id ?? null,
                            previousOwnerName: previousOwner?.fullName ?? null,
                            currentOwnerId: requester.id,
                            currentOwnerName: requester.fullName,
                            requesterId: requester.id,
                            requesterName: requester.fullName,
                            taskId: task.id,
                            autoRejectedTaskIds: autoRejectedTasks.map((item) => item.id),
                        },
                    },
                });

                await tx.leadAuditLog.create({
                    data: {
                        leadId: lead.id,
                        companyId,
                        actorUserId,
                        action: 'ASSIGN_CHANGE',
                        message: 'Lead owner changed after claim approval',
                        changes: {
                            salespersonId: {
                                from: lead.salespersonId ?? null,
                                to: requester.id,
                            },
                            previousOwnerName: previousOwner?.fullName ?? null,
                            currentOwnerName: requester.fullName,
                            approvedClaimTaskId: task.id,
                        },
                    },
                });

                if (autoRejectedTasks.length > 0) {
                    await Promise.all(autoRejectedTasks.map((autoRejectedTask) => {
                        const autoRejectedRequesterId = this.extractRequesterIdFromNotes(autoRejectedTask.notes);
                        const autoRejectedRequester = autoRejectedRequesterId ? otherRequesterMap.get(autoRejectedRequesterId) : null;
                        return tx.leadAuditLog.create({
                            data: {
                                leadId: lead.id,
                                companyId,
                                actorUserId,
                                action: 'CLAIM_AUTO_REJECTED',
                                message: `Claim auto-rejected because another request was approved by ${actor.fullName}`,
                                changes: {
                                    requesterId: autoRejectedRequester?.id ?? autoRejectedRequesterId ?? null,
                                    requesterName: autoRejectedRequester?.fullName ?? null,
                                    taskId: autoRejectedTask.id,
                                    approvedTaskId: task.id,
                                    currentOwnerId: requester.id,
                                    currentOwnerName: requester.fullName,
                                },
                            },
                        });
                    }));
                }

                return {
                    decidedTask,
                    autoRejectedCount: autoRejectedTasks.length,
                    nextLead,
                };
            });

            updatedTask = transactionResult.decidedTask;
            autoRejectedCount = transactionResult.autoRejectedCount;
        } else {
            const transactionResult = await prisma.$transaction(async (tx) => {
                const decidedTask = await tx.task.update({
                    where: { id: task.id },
                    data: {
                        status: 'Completed',
                        notes: `${task.notes || ''}\nDecision: REJECTED by ${actor.fullName} on ${nowIsoString}`,
                    },
                });

                await tx.leadAuditLog.create({
                    data: {
                        leadId: lead.id,
                        companyId,
                        actorUserId,
                        action: 'CLAIM_REJECTED',
                        message: `Claim rejected by ${actor.fullName}`,
                        changes: {
                            requesterId: requester.id,
                            requesterName: requester.fullName,
                            previousOwnerId: previousOwner?.id ?? null,
                            previousOwnerName: previousOwner?.fullName ?? null,
                            currentOwnerId: lead.salespersonId ?? null,
                            currentOwnerName: previousOwner?.fullName ?? null,
                            taskId: task.id,
                        },
                    },
                });

                return { decidedTask };
            });

            updatedTask = transactionResult.decidedTask;
        }

        return {
            task: updatedTask,
            leadId: lead.id,
            requester,
            decision,
            autoRejectedCount,
        };
    }
}

module.exports = new LeadService();
