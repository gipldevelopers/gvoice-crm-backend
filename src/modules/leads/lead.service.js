const prisma = require('../../database/prisma');
const { EMPLOYEE_ROLES, normalizeRole, isCompanyAdminRole } = require('../../helpers/employeeHierarchy');
const { addEmailJob } = require('../../helpers/mailQueue');
const {
    leadOpenWarning1DayTemplate,
    leadNowOpenTemplate,
    claimRequestedToOwnerTemplate,
    claimRequestedToApproverUrgentTemplate,
    claimExpiredReopenedTemplate,
    claimApprovedOwnershipTemplate,
    leadQualifiedApprovalRequestTemplate,
    leadQualifiedStatusDecisionTemplate,
    newLeadCreatedTemplate,
} = require('../../helpers/leadEmailTemplates');

const LEAD_TIMER_DAYS = 15;
const MILLISECONDS_IN_DAY = 24 * 60 * 60 * 1000;
const CLAIM_APPROVAL_WINDOW_HOURS = 12;
const EXTENSION_APPROVAL_WINDOW_HOURS = 12;
const EXTENSION_MAX_DAYS = 10;
const CLAIM_TIMER_OVERRIDE_ACTION = 'CLAIM_WINDOW_OVERRIDE';
const LEAD_OPEN_WARNING_1D_SENT_ACTION = 'LEAD_OPEN_WARNING_1D_SENT';
const LEAD_OPEN_FOR_EVERYONE_SENT_ACTION = 'LEAD_OPEN_FOR_EVERYONE_SENT';
const REQUEST_TYPE_CLAIM = 'LEAD_CLAIM';
const REQUEST_TYPE_EXTENSION = 'LEAD_EXTENSION';
const REQUEST_TYPE_QUALIFIED = 'LEAD_QUALIFIED_APPROVAL';
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
    buildSafeJobId(parts = []) {
        return parts
            .filter((part) => part !== undefined && part !== null)
            .map((part) => String(part).replace(/[^a-zA-Z0-9_-]/g, '_'))
            .join('__');
    }

    extractRequesterIdFromNotes(notes = '') {
        if (!notes) return null;
        const match = String(notes).match(/Requester ID:\s*([a-zA-Z0-9-]+)/i);
        return match ? match[1] : null;
    }

    extractRequestTypeFromNotes(notes = '') {
        const value = this.extractValueFromNotesByLabel(notes, 'Request Type');
        if (!value) return null;
        const normalized = String(value).trim().toUpperCase();
        if (normalized === REQUEST_TYPE_EXTENSION) return REQUEST_TYPE_EXTENSION;
        if (normalized === REQUEST_TYPE_CLAIM) return REQUEST_TYPE_CLAIM;
        if (normalized === REQUEST_TYPE_QUALIFIED) return REQUEST_TYPE_QUALIFIED;
        return null;
    }

    extractRequestedExtensionDaysFromNotes(notes = '') {
        const value = this.extractValueFromNotesByLabel(notes, 'Requested Extension Days');
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
    }

    extractClosurePlanFromNotes(notes = '') {
        return this.extractValueFromNotesByLabel(notes, 'Closure Plan') || null;
    }

    extractJustificationFromNotes(notes = '') {
        return this.extractValueFromNotesByLabel(notes, 'Justification') || null;
    }

    extractValueFromNotesByLabel(notes = '', label = '') {
        if (!notes || !label) return null;
        const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`${escapedLabel}:\\s*([^\\n\\r]+)`, 'i');
        const match = String(notes).match(regex);
        return match ? String(match[1]).trim() : null;
    }

    extractCurrentOwnerIdFromNotes(notes = '') {
        const value = this.extractValueFromNotesByLabel(notes, 'Current Owner ID');
        return value && value.toLowerCase() !== 'none' ? value : null;
    }

    extractApproverIdFromNotes(notes = '') {
        const value = this.extractValueFromNotesByLabel(notes, 'Approver ID');
        return value && value.toLowerCase() !== 'none' ? value : null;
    }

    async notifyManagerOnLeadCreation(lead, companyId, actorUserId) {
        try {
            if (!actorUserId) return;
            const creator = await prisma.user.findFirst({
                where: { id: actorUserId, companyId },
                select: {
                    id: true,
                    fullName: true,
                    reportsTo: {
                        select: { id: true, fullName: true, email: true }
                    }
                }
            });

            if (creator?.reportsTo?.email) {
                await this.queueEmailSafe({
                    to: creator.reportsTo.email,
                    templateBuilder: newLeadCreatedTemplate,
                    templateParams: {
                        leadName: lead.name,
                        creatorName: creator.fullName,
                        approverName: creator.reportsTo.fullName,
                    },
                    jobId: this.buildSafeJobId(['new-lead-notification', lead.id]),
                });
            }
        } catch (error) {
            console.error('[LeadService] notifyManagerOnLeadCreation error:', error.message);
        }
    }

    async queueEmailSafe({ to, templateBuilder, templateParams, delayInMinutes = 0, jobId = null }) {
        if (!to || !templateBuilder) return false;

        const recipients = Array.isArray(to)
            ? [...new Set(to.filter(Boolean).map((item) => String(item).trim()))]
            : [String(to).trim()];
        if (!recipients.length) return false;

        try {
            const template = templateBuilder(templateParams || {});
            await addEmailJob(
                {
                    to: recipients.length === 1 ? recipients[0] : recipients,
                    subject: template.subject,
                    html: template.html,
                    text: template.text,
                },
                delayInMinutes,
                jobId ? { jobId } : {}
            );
            return true;
        } catch (error) {
            console.error(`[LeadService] Failed to queue email: ${error.message}`);
            return false;
        }
    }

    extractClaimDeadlineFromTask(task) {
        if (task?.dueDate) return new Date(task.dueDate);
        const createdAt = new Date(task?.createdAt || Date.now());
        return new Date(createdAt.getTime() + (CLAIM_APPROVAL_WINDOW_HOURS * 60 * 60 * 1000));
    }

    isForceClaimOpenChange(changes) {
        return !!(changes && typeof changes === 'object' && changes.forceClaimOpen);
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

    getLeadTimerData(createdAt, extensionDays = 0, endAtOverride = null) {
        const timerStartAt = new Date(createdAt);
        const safeExtensionDays = Math.max(0, Math.min(EXTENSION_MAX_DAYS, Number(extensionDays) || 0));
        const timerEndAt = endAtOverride
            ? new Date(endAtOverride)
            : new Date(timerStartAt.getTime() + ((LEAD_TIMER_DAYS + safeExtensionDays) * MILLISECONDS_IN_DAY));
        const remainingMilliseconds = timerEndAt.getTime() - Date.now();

        return {
            leadTimerStartAt: timerStartAt,
            leadTimerEndAt: timerEndAt,
            leadTimerTotalDays: LEAD_TIMER_DAYS,
            leadTimerExtensionDays: safeExtensionDays,
            leadTimerDaysRemaining: Math.max(0, Math.ceil(remainingMilliseconds / MILLISECONDS_IN_DAY)),
            leadTimerExpired: remainingMilliseconds <= 0,
        };
    }

    attachLeadTimerData(lead) {
        if (!lead) return lead;
        const timerBaseDate = lead.leadTimerStartAt || lead.createdAt;
        const extensionDays = lead.grantedExtensionDays || 0;
        const computedEndAt = lead.leadTimerComputedEndAt || null;
        return {
            ...lead,
            ...this.getLeadTimerData(timerBaseDate, extensionDays, computedEndAt),
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
                action: { in: ['ASSIGN_CHANGE', 'CLAIM_APPROVED', CLAIM_TIMER_OVERRIDE_ACTION] },
            },
            select: {
                leadId: true,
                createdAt: true,
                action: true,
                changes: true,
            },
            orderBy: {
                createdAt: 'desc',
            },
        });

        const timerStartMap = new Map();
        ownershipLogs.forEach((log) => {
            if (!timerStartMap.has(log.leadId)) {
                if (
                    log.action === CLAIM_TIMER_OVERRIDE_ACTION &&
                    this.isForceClaimOpenChange(log.changes)
                ) {
                    timerStartMap.set(log.leadId, new Date(Date.now() - (LEAD_TIMER_DAYS * MILLISECONDS_IN_DAY)));
                } else {
                    timerStartMap.set(log.leadId, log.createdAt);
                }
            }
        });

        return timerStartMap;
    }

    async getLeadTimerComputationMap(companyId, leadIds = [], timerStartMap = new Map(), fallbackCreatedAtMap = new Map()) {
        const resultMap = new Map();
        if (!leadIds.length) return resultMap;

        const extensionLogs = await prisma.leadAuditLog.findMany({
            where: {
                companyId,
                leadId: { in: leadIds },
                action: 'EXTENSION_APPROVED',
            },
            select: {
                leadId: true,
                createdAt: true,
                changes: true,
            },
            orderBy: { createdAt: 'asc' },
        });

        const logsByLead = new Map();
        extensionLogs.forEach((log) => {
            if (!logsByLead.has(log.leadId)) logsByLead.set(log.leadId, []);
            logsByLead.get(log.leadId).push(log);
        });

        leadIds.forEach((leadId) => {
            const timerStartAt = new Date(timerStartMap.get(leadId) || fallbackCreatedAtMap.get(leadId) || Date.now());
            let extensionDaysUsed = 0;
            let computedEndAt = new Date(timerStartAt.getTime() + (LEAD_TIMER_DAYS * MILLISECONDS_IN_DAY));

            const logs = logsByLead.get(leadId) || [];
            logs.forEach((log) => {
                if (new Date(log.createdAt) < timerStartAt) return;
                const approvedDaysRaw = Number(log?.changes?.extensionDays || 0);
                if (!Number.isFinite(approvedDaysRaw) || approvedDaysRaw <= 0) return;
                if (extensionDaysUsed >= EXTENSION_MAX_DAYS) return;

                const addableDays = Math.min(approvedDaysRaw, EXTENSION_MAX_DAYS - extensionDaysUsed);
                const pivotTime = Math.max(computedEndAt.getTime(), new Date(log.createdAt).getTime());
                computedEndAt = new Date(pivotTime + (addableDays * MILLISECONDS_IN_DAY));
                extensionDaysUsed += addableDays;
            });

            resultMap.set(leadId, {
                extensionDaysUsed,
                computedEndAt,
            });
        });

        return resultMap;
    }

    async getLeadTimerStartAt(companyId, leadId, fallbackDate) {
        const latestOwnershipLog = await prisma.leadAuditLog.findFirst({
            where: {
                companyId,
                leadId,
                action: { in: ['ASSIGN_CHANGE', 'CLAIM_APPROVED', CLAIM_TIMER_OVERRIDE_ACTION] },
            },
            select: { createdAt: true, action: true, changes: true },
            orderBy: { createdAt: 'desc' },
        });

        if (
            latestOwnershipLog &&
            latestOwnershipLog.action === CLAIM_TIMER_OVERRIDE_ACTION &&
            this.isForceClaimOpenChange(latestOwnershipLog.changes)
        ) {
            return new Date(Date.now() - (LEAD_TIMER_DAYS * MILLISECONDS_IN_DAY));
        }

        return latestOwnershipLog?.createdAt || fallbackDate;
    }

    async getForcedOverdueLeadSet(companyId, leadIds = []) {
        if (!leadIds.length) return new Set();

        const timerLogs = await prisma.leadAuditLog.findMany({
            where: {
                companyId,
                leadId: { in: leadIds },
                action: { in: ['ASSIGN_CHANGE', 'CLAIM_APPROVED', CLAIM_TIMER_OVERRIDE_ACTION] },
            },
            select: {
                leadId: true,
                action: true,
                changes: true,
                createdAt: true,
            },
            orderBy: { createdAt: 'desc' },
        });

        const latestByLead = new Map();
        timerLogs.forEach((log) => {
            if (!latestByLead.has(log.leadId)) {
                latestByLead.set(log.leadId, log);
            }
        });

        const forcedOverdueLeadSet = new Set();
        latestByLead.forEach((log, leadId) => {
            if (log.action === CLAIM_TIMER_OVERRIDE_ACTION && this.isForceClaimOpenChange(log.changes)) {
                forcedOverdueLeadSet.add(leadId);
            }
        });

        return forcedOverdueLeadSet;
    }

    async isLeadForcedOverdue(companyId, leadId) {
        const latestTimerLog = await prisma.leadAuditLog.findFirst({
            where: {
                companyId,
                leadId,
                action: { in: ['ASSIGN_CHANGE', 'CLAIM_APPROVED', CLAIM_TIMER_OVERRIDE_ACTION] },
            },
            select: { action: true, changes: true, createdAt: true },
            orderBy: { createdAt: 'desc' },
        });

        return !!(
            latestTimerLog &&
            latestTimerLog.action === CLAIM_TIMER_OVERRIDE_ACTION &&
            this.isForceClaimOpenChange(latestTimerLog.changes)
        );
    }

    async processLeadTimerNotifications(companyId = null) {
        const where = {
            salespersonId: { not: null },
            ...(companyId ? { companyId } : {}),
        };

        const leads = await prisma.lead.findMany({
            where,
            select: {
                id: true,
                name: true,
                companyId: true,
                createdAt: true,
                salespersonId: true,
                salesperson: {
                    select: { id: true, fullName: true, email: true },
                },
            },
        });

        if (!leads.length) {
            return { checked: 0, sent: 0 };
        }

        const byCompany = leads.reduce((acc, lead) => {
            if (!acc.has(lead.companyId)) acc.set(lead.companyId, []);
            acc.get(lead.companyId).push(lead);
            return acc;
        }, new Map());

        let sent = 0;

        for (const [targetCompanyId, companyLeads] of byCompany.entries()) {
            const leadIds = companyLeads.map((item) => item.id);
            const timerStartMap = await this.getLeadTimerStartMap(targetCompanyId, leadIds);
            const timerComputationMap = await this.getLeadTimerComputationMap(
                targetCompanyId,
                leadIds,
                timerStartMap,
                new Map(companyLeads.map((item) => [item.id, item.createdAt]))
            );

            const notificationLogs = await prisma.leadAuditLog.findMany({
                where: {
                    companyId: targetCompanyId,
                    leadId: { in: leadIds },
                    action: { in: [LEAD_OPEN_WARNING_1D_SENT_ACTION, LEAD_OPEN_FOR_EVERYONE_SENT_ACTION] },
                },
                select: {
                    leadId: true,
                    action: true,
                    createdAt: true,
                },
            });

            const notificationLogMap = new Map();
            notificationLogs.forEach((log) => {
                if (!notificationLogMap.has(log.leadId)) {
                    notificationLogMap.set(log.leadId, []);
                }
                notificationLogMap.get(log.leadId).push(log);
            });

            for (const lead of companyLeads) {
                const owner = lead.salesperson;
                if (!owner?.email) continue;

                const timerStartAt = timerStartMap.get(lead.id) || lead.createdAt;
                const computed = timerComputationMap.get(lead.id);
                const timerData = this.getLeadTimerData(
                    timerStartAt,
                    computed?.extensionDaysUsed || 0,
                    computed?.computedEndAt || null
                );
                const leadLogs = notificationLogMap.get(lead.id) || [];

                const warningAlreadySent = leadLogs.some(
                    (log) => log.action === LEAD_OPEN_WARNING_1D_SENT_ACTION && new Date(log.createdAt) >= new Date(timerStartAt)
                );
                const openAlreadySent = leadLogs.some(
                    (log) => log.action === LEAD_OPEN_FOR_EVERYONE_SENT_ACTION && new Date(log.createdAt) >= new Date(timerStartAt)
                );

                if (!timerData.leadTimerExpired && timerData.leadTimerDaysRemaining === 1 && !warningAlreadySent) {
                    const queued = await this.queueEmailSafe({
                        to: owner.email,
                        templateBuilder: leadOpenWarning1DayTemplate,
                        templateParams: {
                            leadName: lead.name,
                            ownerName: owner.fullName,
                        },
                        jobId: this.buildSafeJobId(['lead-warning-1d', lead.id, new Date(timerStartAt).getTime()]),
                    });

                    if (queued) {
                        sent += 1;
                        await this.createAuditLog({
                            leadId: lead.id,
                            companyId: targetCompanyId,
                            actorUserId: null,
                            action: LEAD_OPEN_WARNING_1D_SENT_ACTION,
                            message: '1-day lead opening warning email queued',
                            changes: {
                                timerStartAt: new Date(timerStartAt).toISOString(),
                                recipient: owner.email,
                            },
                        });
                    }
                }

                if (timerData.leadTimerExpired && !openAlreadySent) {
                    const queued = await this.queueEmailSafe({
                        to: owner.email,
                        templateBuilder: leadNowOpenTemplate,
                        templateParams: {
                            leadName: lead.name,
                            ownerName: owner.fullName,
                        },
                        jobId: this.buildSafeJobId(['lead-open-15d', lead.id, new Date(timerStartAt).getTime()]),
                    });

                    if (queued) {
                        sent += 1;
                        await this.createAuditLog({
                            leadId: lead.id,
                            companyId: targetCompanyId,
                            actorUserId: null,
                            action: LEAD_OPEN_FOR_EVERYONE_SENT_ACTION,
                            message: 'Lead open-for-everyone email queued',
                            changes: {
                                timerStartAt: new Date(timerStartAt).toISOString(),
                                recipient: owner.email,
                            },
                        });
                    }
                }
            }
        }

        return {
            checked: leads.length,
            sent,
        };
    }

    async sendDevEmailTemplate({
        companyId,
        actorUserId,
        templateType,
        toEmail = null,
        leadId = null,
        leadName = null,
        requesterName = null,
        ownerName = null,
        approverName = null,
        previousOwnerName = null,
        newOwnerName = null,
    }) {
        const actor = await prisma.user.findFirst({
            where: { id: actorUserId, companyId },
            select: { id: true, fullName: true, email: true },
        });

        if (!actor) {
            throw new Error('User not found');
        }

        const lead = leadId
            ? await prisma.lead.findFirst({
                where: { id: leadId, companyId },
                select: {
                    id: true,
                    name: true,
                    salesperson: { select: { id: true, fullName: true, email: true } },
                },
            })
            : null;

        const resolvedLeadName = lead?.name || leadName || 'Test Lead';
        const recipient = (toEmail || actor.email || '').trim();

        if (!recipient) {
            throw new Error('Recipient email is required');
        }

        const approvalDeadlineAt = new Date(Date.now() + (CLAIM_APPROVAL_WINDOW_HOURS * 60 * 60 * 1000));

        let templateBuilder = null;
        let templateParams = {};

        switch (templateType) {
            case 'lead_open_warning_1d':
                templateBuilder = leadOpenWarning1DayTemplate;
                templateParams = {
                    leadName: resolvedLeadName,
                    ownerName: ownerName || lead?.salesperson?.fullName || actor.fullName,
                };
                break;
            case 'lead_open_15d':
                templateBuilder = leadNowOpenTemplate;
                templateParams = {
                    leadName: resolvedLeadName,
                    ownerName: ownerName || lead?.salesperson?.fullName || actor.fullName,
                };
                break;
            case 'claim_requested_owner':
                templateBuilder = claimRequestedToOwnerTemplate;
                templateParams = {
                    leadName: resolvedLeadName,
                    ownerName: ownerName || lead?.salesperson?.fullName || actor.fullName,
                    requesterName: requesterName || 'Test Requester',
                    approvalDeadlineAt,
                };
                break;
            case 'claim_requested_approver':
                templateBuilder = claimRequestedToApproverUrgentTemplate;
                templateParams = {
                    leadName: resolvedLeadName,
                    approverName: approverName || actor.fullName,
                    requesterName: requesterName || 'Test Requester',
                    ownerName: ownerName || lead?.salesperson?.fullName || 'Lead Owner',
                    approvalDeadlineAt,
                };
                break;
            case 'claim_expired_reopened':
                templateBuilder = claimExpiredReopenedTemplate;
                templateParams = {
                    leadName: resolvedLeadName,
                    recipientName: actor.fullName,
                    requesterName: requesterName || 'Test Requester',
                };
                break;
            case 'claim_approved_transfer':
                templateBuilder = claimApprovedOwnershipTemplate;
                templateParams = {
                    leadName: resolvedLeadName,
                    recipientName: actor.fullName,
                    previousOwnerName: previousOwnerName || ownerName || lead?.salesperson?.fullName || 'Previous Owner',
                    newOwnerName: newOwnerName || 'New Owner',
                };
                break;
            default:
                throw new Error('Invalid templateType');
        }

        const template = templateBuilder(templateParams);
        const job = await addEmailJob(
            {
                to: recipient,
                subject: template.subject,
                html: template.html,
                text: template.text,
            },
            0,
            {
                jobId: this.buildSafeJobId(['dev-email', companyId, templateType, Date.now()]),
            }
        );

        return {
            templateType,
            to: recipient,
            subject: template.subject,
            leadName: resolvedLeadName,
            jobId: job.id,
        };
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
        const ownerIdsFromTask = expiredTasks
            .map((task) => this.extractCurrentOwnerIdFromNotes(task.notes))
            .filter(Boolean);
        const approverIdsFromTask = expiredTasks
            .map((task) => this.extractApproverIdFromNotes(task.notes))
            .filter(Boolean);

        const requesters = requesterIds.length
            ? await prisma.user.findMany({
                where: { companyId, id: { in: requesterIds } },
                select: { id: true, fullName: true, email: true },
            })
            : [];
        const requesterMap = new Map(requesters.map((item) => [item.id, item]));

        const leads = await prisma.lead.findMany({
            where: {
                companyId,
                id: { in: expiredTasks.map((task) => task.linkedId).filter(Boolean) },
            },
            select: {
                id: true,
                name: true,
                salespersonId: true,
                salesperson: {
                    select: { id: true, fullName: true, email: true, reportsToId: true, role: true },
                },
            },
        });
        const leadMap = new Map(leads.map((lead) => [lead.id, lead]));

        const extraUserIds = [...new Set([...ownerIdsFromTask, ...approverIdsFromTask])];
        const extraUsers = extraUserIds.length
            ? await prisma.user.findMany({
                where: { companyId, id: { in: extraUserIds } },
                select: { id: true, fullName: true, email: true, reportsToId: true, role: true },
            })
            : [];
        const extraUserMap = new Map(extraUsers.map((item) => [item.id, item]));

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

        await Promise.all(expiredTasks.map(async (task) => {
            const lead = leadMap.get(task.linkedId);
            if (!lead) return;

            const requesterId = this.extractRequesterIdFromNotes(task.notes);
            const requester = requesterId ? requesterMap.get(requesterId) : null;

            const ownerId = this.extractCurrentOwnerIdFromNotes(task.notes) || lead.salespersonId || null;
            const owner = ownerId ? (extraUserMap.get(ownerId) || lead.salesperson || null) : lead.salesperson || null;

            const approverId = this.extractApproverIdFromNotes(task.notes);
            let approver = approverId ? (extraUserMap.get(approverId) || null) : null;

            if (!approver && owner?.reportsToId) {
                const manager = extraUserMap.get(owner.reportsToId) || await prisma.user.findFirst({
                    where: { id: owner.reportsToId, companyId },
                    select: { id: true, fullName: true, email: true, role: true },
                });
                if (manager && normalizeRole(manager.role) === EMPLOYEE_ROLES.TEAM_LEADER) {
                    approver = manager;
                }
            }

            const recipientEmails = [...new Set([owner?.email, approver?.email].filter(Boolean))];
            if (!recipientEmails.length) return;

            await this.queueEmailSafe({
                to: recipientEmails,
                templateBuilder: claimExpiredReopenedTemplate,
                templateParams: {
                    leadName: lead.name,
                    recipientName: '',
                    requesterName: requester?.fullName || null,
                },
                jobId: this.buildSafeJobId(['claim-expired', task.id]),
            });
        }));

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

    async resolveHierarchyApproverForUser({ companyId, requesterId }) {
        const requester = await prisma.user.findFirst({
            where: { id: requesterId, companyId },
            select: { id: true, fullName: true, email: true, role: true, reportsToId: true, department: true }
        });

        if (!requester) return null;
        const role = normalizeRole(requester.role);

        if (role === EMPLOYEE_ROLES.EMPLOYEE) {
            if (requester.reportsToId) {
                const manager = await prisma.user.findFirst({
                    where: { id: requester.reportsToId, companyId },
                    select: { id: true, fullName: true, email: true }
                });
                if (manager) return manager;
            }
            if (requester.department) {
                const manager = await prisma.user.findFirst({
                    where: { companyId, department: requester.department, role: { in: [EMPLOYEE_ROLES.TEAM_LEADER, 'manager'] } },
                    select: { id: true, fullName: true, email: true }
                });
                if (manager) return manager;
            }
            return await prisma.user.findFirst({
                where: { companyId, role: { in: [EMPLOYEE_ROLES.TEAM_LEADER, 'manager'] } },
                select: { id: true, fullName: true, email: true }
            }) || await this.resolveDepartmentHeadApproverForUser({ companyId, requesterId });
        }

        if (role === EMPLOYEE_ROLES.TEAM_LEADER) {
            return await this.resolveDepartmentHeadApproverForUser({ companyId, requesterId });
        }

        if (role === EMPLOYEE_ROLES.HEAD_OF_DEPARTMENT) {
            if (requester.reportsToId) {
                const admin = await prisma.user.findFirst({
                    where: { id: requester.reportsToId, companyId, role: { in: [EMPLOYEE_ROLES.COMPANY_ADMIN, 'admin'] } },
                    select: { id: true, fullName: true, email: true }
                });
                if (admin) return admin;
            }
            return await prisma.user.findFirst({
                where: { companyId, role: { in: [EMPLOYEE_ROLES.COMPANY_ADMIN, 'admin'] } },
                select: { id: true, fullName: true, email: true }
            });
        }

        return null;
    }

    async resolveDepartmentHeadApproverForUser({ companyId, requesterId }) {
        const requester = await prisma.user.findFirst({
            where: { id: requesterId, companyId },
            select: {
                id: true,
                fullName: true,
                email: true,
                role: true,
                department: true,
                reportsToId: true,
            },
        });

        if (!requester) return null;

        // Prefer an HoD from the requester's own department.
        if (requester.department) {
            const sameDepartmentHead = await prisma.user.findFirst({
                where: {
                    companyId,
                    department: requester.department,
                    role: { equals: EMPLOYEE_ROLES.HEAD_OF_DEPARTMENT, mode: 'insensitive' },
                    NOT: { id: requesterId },
                },
                select: {
                    id: true,
                    fullName: true,
                    email: true,
                    role: true,
                    reportsToId: true,
                    department: true,
                },
                orderBy: { createdAt: 'asc' },
            });

            if (sameDepartmentHead) return sameDepartmentHead;
        }

        let cursorId = requester.reportsToId;
        let hops = 0;
        let fallbackAdmin = null;

        while (cursorId && hops < 6) {
            const manager = await prisma.user.findFirst({
                where: { id: cursorId, companyId },
                select: {
                    id: true,
                    fullName: true,
                    email: true,
                    role: true,
                    reportsToId: true,
                },
            });
            if (!manager) break;

            const normalizedRole = normalizeRole(manager.role);
            if (normalizedRole === EMPLOYEE_ROLES.HEAD_OF_DEPARTMENT && manager.id !== requesterId) {
                return manager;
            }
            if (normalizedRole === EMPLOYEE_ROLES.COMPANY_ADMIN && !fallbackAdmin && manager.id !== requesterId) {
                fallbackAdmin = manager;
            }

            cursorId = manager.reportsToId;
            hops += 1;
        }

        if (fallbackAdmin) return fallbackAdmin;

        return prisma.user.findFirst({
            where: {
                companyId,
                role: { in: [EMPLOYEE_ROLES.HEAD_OF_DEPARTMENT, EMPLOYEE_ROLES.COMPANY_ADMIN, 'admin'] },
                NOT: { id: requesterId },
            },
            select: {
                id: true,
                fullName: true,
                email: true,
                role: true,
                reportsToId: true,
            },
            orderBy: { createdAt: 'asc' },
        });
    }

    async expirePendingExtensionTasks(companyId, leadIds = []) {
        const where = {
            companyId,
            linkedType: 'Lead',
            status: 'Pending',
            title: { contains: 'Extension request', mode: 'insensitive' },
            dueDate: { lt: new Date() },
            ...(leadIds.length ? { linkedId: { in: leadIds } } : {}),
        };

        const expiredTasks = await prisma.task.findMany({
            where,
            select: {
                id: true,
                linkedId: true,
                notes: true,
            },
        });

        if (!expiredTasks.length) return 0;

        const requesterIds = expiredTasks
            .map((task) => this.extractRequesterIdFromNotes(task.notes))
            .filter(Boolean);

        const leads = await prisma.lead.findMany({
            where: { companyId, id: { in: expiredTasks.map((task) => task.linkedId).filter(Boolean) } },
            select: { id: true, name: true },
        });
        const leadMap = new Map(leads.map((lead) => [lead.id, lead]));

        const requesters = requesterIds.length
            ? await prisma.user.findMany({
                where: { companyId, id: { in: requesterIds } },
                select: { id: true, fullName: true, email: true },
            })
            : [];
        const requesterMap = new Map(requesters.map((item) => [item.id, item]));

        await prisma.$transaction(async (tx) => {
            await Promise.all(
                expiredTasks.map((task) => tx.task.update({
                    where: { id: task.id },
                    data: {
                        status: 'Completed',
                        notes: `${task.notes || ''}\nDecision: AUTO-REJECTED (12h extension window expired) on ${new Date().toISOString()}`,
                    },
                }))
            );

            await Promise.all(expiredTasks.map((task) => {
                const requesterId = this.extractRequesterIdFromNotes(task.notes);
                const requester = requesterId ? requesterMap.get(requesterId) : null;
                const lead = leadMap.get(task.linkedId);
                return tx.leadAuditLog.create({
                    data: {
                        leadId: task.linkedId,
                        companyId,
                        actorUserId: null,
                        action: 'EXTENSION_AUTO_REJECTED',
                        message: 'Extension request auto-rejected after 12h approval window expired',
                        changes: {
                            requesterId: requesterId || null,
                            requesterName: requester?.fullName || null,
                            taskId: task.id,
                            leadName: lead?.name || null,
                            reason: 'extension_approval_window_expired',
                            extensionApprovalWindowHours: EXTENSION_APPROVAL_WINDOW_HOURS,
                        },
                    },
                });
            }));
        });

        return expiredTasks.length;
    }

    // Create a new lead
    async createLead(leadData, companyId, defaultSalespersonId = null, actorUserId = null) {
        try {
            const lead = await prisma.lead.create({
                data: {
                    name: leadData.name,
                    phone: leadData.phone || null,
                    countryCode: leadData.countryCode || null,
                    email: leadData.email,
                    source: leadData.source,
                    service: leadData.service || null,
                    value: leadData.value !== undefined ? parseFloat(leadData.value) : null,
                    currency: leadData.currency || null,
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
            this.createAuditLog({
                leadId: lead.id,
                companyId,
                actorUserId: actorUserId || defaultSalespersonId || null,
                action: 'CREATE',
                message: 'Lead created',
                changes: {
                    name: lead.name,
                    phone: lead.phone,
                    countryCode: lead.countryCode,
                    email: lead.email,
                    source: lead.source,
                    service: lead.service,
                    value: lead.value,
                    currency: lead.currency,
                    status: lead.status,
                    salespersonId: lead.salespersonId,
                },
            }).catch(err => console.error('[LeadService] createLead audit log failed:', err.message));

            // Send notification to manager in background
            if (actorUserId) {
                this.notifyManagerOnLeadCreation(lead, companyId, actorUserId);
            }

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
            await this.expirePendingExtensionTasks(companyId, leadIds);
            const createdAtMap = new Map(leads.map((lead) => [lead.id, lead.createdAt]));
            const [timerStartMap, forcedOverdueLeadSet] = await Promise.all([
                this.getLeadTimerStartMap(companyId, leadIds),
                this.getForcedOverdueLeadSet(companyId, leadIds),
            ]);
            const timerComputationMap = await this.getLeadTimerComputationMap(companyId, leadIds, timerStartMap, createdAtMap);

            const pendingApprovalTasks = await prisma.task.findMany({
                where: {
                    companyId,
                    linkedType: 'Lead',
                    linkedId: { in: leadIds },
                    status: 'Pending',
                    OR: [
                        { title: { contains: 'Claim request', mode: 'insensitive' } },
                        { title: { contains: 'Extension request', mode: 'insensitive' } },
                        { title: { contains: 'Qualified Status Approval', mode: 'insensitive' } },
                    ],
                },
                orderBy: { createdAt: 'desc' },
                select: { id: true, linkedId: true, notes: true, dueDate: true, createdAt: true }
            });

            const requesterIds = pendingApprovalTasks
                .map((task) => this.extractRequesterIdFromNotes(task.notes))
                .filter(Boolean);

            const requesters = requesterIds.length
                ? await prisma.user.findMany({
                    where: { companyId, id: { in: requesterIds } },
                    select: { id: true, fullName: true, email: true }
                })
                : [];

            const requesterMap = new Map(requesters.map((userRecord) => [userRecord.id, userRecord]));
            const openApprovalTaskByLead = new Map();
            const pendingClaimLeadIdSetForRequester = new Set();

            pendingApprovalTasks.forEach((task) => {
                if (!openApprovalTaskByLead.has(task.linkedId)) {
                    openApprovalTaskByLead.set(task.linkedId, task);
                }
            });

            if (requesterId) {
                pendingApprovalTasks.forEach((task) => {
                    const taskRequesterId = this.extractRequesterIdFromNotes(task.notes);
                    if (taskRequesterId === requesterId) {
                        pendingClaimLeadIdSetForRequester.add(task.linkedId);
                    }
                });
            }

            const enrichedLeads = leads.map((lead) => ({
                ...lead,
                leadTimerForcedOverdue: forcedOverdueLeadSet.has(lead.id),
                grantedExtensionDays: timerComputationMap.get(lead.id)?.extensionDaysUsed || 0,
                leadTimerComputedEndAt: timerComputationMap.get(lead.id)?.computedEndAt || null,
                claimLockActive: openApprovalTaskByLead.has(lead.id),
                claimLockExpiresAt: openApprovalTaskByLead.has(lead.id)
                    ? this.extractClaimDeadlineFromTask(openApprovalTaskByLead.get(lead.id))
                    : null,
                claimLockRequestedBy: (() => {
                    const lockTask = openApprovalTaskByLead.get(lead.id);
                    if (!lockTask) return null;
                    const claimRequesterId = this.extractRequesterIdFromNotes(lockTask.notes);
                    return claimRequesterId ? (requesterMap.get(claimRequesterId) || null) : null;
                })(),
                claimLockReason: (() => {
                    const lockTask = openApprovalTaskByLead.get(lead.id);
                    if (!lockTask) return null;
                    return this.extractRequestTypeFromNotes(lockTask.notes) || REQUEST_TYPE_CLAIM;
                })(),
                leadTimerStartAt: timerStartMap.get(lead.id) || lead.createdAt,
                claimRequestPendingByCurrentUser: pendingClaimLeadIdSetForRequester.has(lead.id),
                openClaimRequestsCount: openApprovalTaskByLead.has(lead.id) ? 1 : 0,
                openClaimRequesters: (() => {
                    const lockTask = openApprovalTaskByLead.get(lead.id);
                    if (!lockTask) return [];
                    const claimRequesterId = this.extractRequesterIdFromNotes(lockTask.notes);
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
                    customer: {
                        include: {
                            deals: {
                                include: {
                                    project: true
                                }
                            }
                        }
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

            const [timerStartAt, isForcedOverdue] = await Promise.all([
                this.getLeadTimerStartAt(companyId, lead.id, lead.createdAt),
                this.isLeadForcedOverdue(companyId, lead.id),
            ]);
            await this.expirePendingClaimTasks(companyId, [lead.id]);
            await this.expirePendingExtensionTasks(companyId, [lead.id]);

            const [pendingLockTask, extensionDaysMap] = await Promise.all([
                prisma.task.findFirst({
                    where: {
                        companyId,
                        linkedType: 'Lead',
                        linkedId: lead.id,
                        status: 'Pending',
                        OR: [
                            { title: { contains: 'Claim request', mode: 'insensitive' } },
                            { title: { contains: 'Extension request', mode: 'insensitive' } },
                            { title: { contains: 'Qualified Status Approval', mode: 'insensitive' } },
                        ],
                    },
                    orderBy: { createdAt: 'desc' },
                    select: { id: true, notes: true, dueDate: true, createdAt: true },
                }),
                this.getLeadTimerComputationMap(
                    companyId,
                    [lead.id],
                    new Map([[lead.id, timerStartAt]]),
                    new Map([[lead.id, lead.createdAt]])
                ),
            ]);

            const lockRequesterId = pendingLockTask ? this.extractRequesterIdFromNotes(pendingLockTask.notes) : null;
            const lockRequester = lockRequesterId
                ? await prisma.user.findFirst({
                    where: { id: lockRequesterId, companyId },
                    select: { id: true, fullName: true, email: true },
                })
                : null;

            return this.attachLeadTimerData({
                ...lead,
                leadTimerStartAt: timerStartAt,
                leadTimerForcedOverdue: isForcedOverdue,
                grantedExtensionDays: extensionDaysMap.get(lead.id)?.extensionDaysUsed || 0,
                leadTimerComputedEndAt: extensionDaysMap.get(lead.id)?.computedEndAt || null,
                claimLockActive: !!pendingLockTask,
                claimLockExpiresAt: pendingLockTask ? this.extractClaimDeadlineFromTask(pendingLockTask) : null,
                claimLockReason: pendingLockTask ? (this.extractRequestTypeFromNotes(pendingLockTask.notes) || REQUEST_TYPE_CLAIM) : null,
                claimLockRequestedBy: lockRequester,
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
                    ...(leadData.phone !== undefined && { phone: leadData.phone }),
                    ...(leadData.countryCode !== undefined && { countryCode: leadData.countryCode }),
                    ...(leadData.email !== undefined && { email: leadData.email }),
                    ...(leadData.source && { source: leadData.source }),
                    ...(leadData.service !== undefined && { service: leadData.service }),
                    ...(leadData.value !== undefined && { value: leadData.value ? parseFloat(leadData.value) : null }),
                    ...(leadData.currency !== undefined && { currency: leadData.currency }),
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
                'countryCode',
                'email',
                'source',
                'service',
                'value',
                'currency',
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
    async updateStatus(leadId, status, note, companyId, actorUserId = null, actorRole = null) {
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

            const canUpdateStatus = isCompanyAdminRole(actorRole) || existingLead.salespersonId === actorUserId;
            if (!canUpdateStatus) {
                throw new Error('Only the user who created/owns the lead can change the lead status');
            }

            // Handle Qualified status approval for roles requiring approval
            if (status === 'Qualified' && !isCompanyAdminRole(actorRole)) {
                const manager = await this.resolveHierarchyApproverForUser({ companyId, requesterId: actorUserId });

                if (!manager) {
                    throw new Error('No manager found to approve your status change request');
                }

                const requester = await prisma.user.findFirst({
                    where: { id: actorUserId, companyId },
                    select: { id: true, fullName: true, email: true }
                });

                const approvalDeadline = new Date(Date.now() + (CLAIM_APPROVAL_WINDOW_HOURS * 60 * 60 * 1000));
                const dueTime = `${String(approvalDeadline.getHours()).padStart(2, '0')}:${String(approvalDeadline.getMinutes()).padStart(2, '0')}`;

                const approvalTask = await prisma.task.create({
                    data: {
                        title: `Qualified Status Approval for lead: ${existingLead.name}`,
                        type: 'Email',
                        linkedType: 'Lead',
                        linkedId: existingLead.id,
                        linkedTo: existingLead.name,
                        assignedTo: manager.fullName,
                        dueDate: approvalDeadline,
                        dueTime: dueTime,
                        status: 'Pending',
                        priority: 'High',
                        notes: `Request Type: ${REQUEST_TYPE_QUALIFIED}\nStatus change request to Qualified\nRequester: ${requester.fullName}\nRequester ID: ${requester.id}\nApprover: ${manager.fullName}\nApprover ID: ${manager.id}\nApproval Window: ${CLAIM_APPROVAL_WINDOW_HOURS}h\nProposed Note: ${note}`,
                        companyId: companyId,
                    },
                });

                await this.createAuditLog({
                    leadId,
                    companyId,
                    actorUserId,
                    action: 'STATUS_CHANGE_REQUEST',
                    message: `Requested status change to Qualified. Pending approval by ${manager.fullName}`,
                    changes: {
                        proposedStatus: 'Qualified',
                        requestedToUserId: manager.id,
                        requestedToName: manager.fullName,
                        taskId: approvalTask.id,
                        note: note
                    },
                });

                if (manager.email) {
                    await this.queueEmailSafe({
                        to: manager.email,
                        templateBuilder: leadQualifiedApprovalRequestTemplate,
                        templateParams: {
                            leadName: existingLead.name,
                            ownerName: requester.fullName,
                            approverName: manager.fullName,
                            approvalDeadlineAt: approvalDeadline,
                        },
                        jobId: this.buildSafeJobId(['qualified-approval-request', approvalTask.id]),
                    });
                }

                return {
                    ...this.attachLeadTimerData(existingLead),
                    approvalPending: true,
                    message: `Status change to Qualified requested. Pending approval from ${manager.fullName}`
                };
            }

            let nextNotes = existingLead.notes;
            const now = new Date();
            const formattedDate = `${now.toLocaleDateString()} ${now.toLocaleTimeString()}`;
            const formattedNote = `[${formattedDate}] Status changed to ${status}: ${note}`;
            nextNotes = existingLead.notes ? `${existingLead.notes}\n\n${formattedNote}` : formattedNote;

            if (status === 'Won' && existingLead.status !== 'Won') {
                const docs = await prisma.leadDocument.findMany({
                    where: { leadId }
                });
                const requiredDocs = ["Initial SOW", "Client BOQ", "Payment Proofs", "Signed MSA", "Signed NDA"];
                const uploadedTypes = new Set(docs.map(d => d.documentType));
                const missing = requiredDocs.filter(reqDoc => !uploadedTypes.has(reqDoc));

                if (missing.length > 0) {
                    throw new Error(`Cannot set status to "Won". Mandatory documents missing: ${missing.join(', ')}`);
                }
            }

            const updatedLead = await prisma.lead.update({
                where: {
                    id: leadId,
                },
                data: {
                    status: status,
                    notes: nextNotes,
                    ...(status === 'Won' && existingLead.complianceStatus === 'NA' && { complianceStatus: 'PENDING' })
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
                        note: note,
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
            const timerComputationMap = await this.getLeadTimerComputationMap(
                companyId,
                [lead.id],
                new Map([[lead.id, timerStartAt]]),
                new Map([[lead.id, lead.createdAt]])
            );
            const timerData = this.getLeadTimerData(
                timerStartAt,
                timerComputationMap.get(lead.id)?.extensionDaysUsed || 0,
                timerComputationMap.get(lead.id)?.computedEndAt || null
            );
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
                    OR: [
                        { title: { contains: 'Claim request', mode: 'insensitive' } },
                        { title: { contains: 'Extension request', mode: 'insensitive' } },
                    ],
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
                const lockType = this.extractRequestTypeFromNotes(existingRequest.notes) || REQUEST_TYPE_CLAIM;
                const lockLabel = lockType === REQUEST_TYPE_EXTENSION ? 'Extension review is pending' : 'Claim already requested';
                throw new Error(`${lockLabel}${existingRequester?.fullName ? ` by ${existingRequester.fullName}` : ''}. It unlocks after ${expiry.toLocaleString()}`);
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
                    notes: `Request Type: ${REQUEST_TYPE_CLAIM}\nLead claim request\nRequester: ${requester.fullName} (${requester.email})\nRequester ID: ${requester.id}\nCurrent Owner: ${lead.salesperson?.fullName || 'Unassigned'}\nCurrent Owner ID: ${lead.salesperson?.id || 'none'}\nApprover: ${targetUser.fullName}\nApprover ID: ${targetUser.id || 'none'}\nApproval Window: ${CLAIM_APPROVAL_WINDOW_HOURS}h`,
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

            const ownerEmail = lead.salesperson?.email || null;
            const approverEmail = targetUser.email || null;

            if (ownerEmail) {
                await this.queueEmailSafe({
                    to: ownerEmail,
                    templateBuilder: claimRequestedToOwnerTemplate,
                    templateParams: {
                        leadName: lead.name,
                        ownerName: lead.salesperson?.fullName || 'Lead Owner',
                        requesterName: requester.fullName,
                        approvalDeadlineAt: approvalDeadline,
                    },
                    jobId: this.buildSafeJobId(['claim-request-owner', claimTask.id]),
                });
            }

            if (approverEmail) {
                await this.queueEmailSafe({
                    to: approverEmail,
                    templateBuilder: claimRequestedToApproverUrgentTemplate,
                    templateParams: {
                        leadName: lead.name,
                        approverName: targetUser.fullName,
                        requesterName: requester.fullName,
                        ownerName: lead.salesperson?.fullName || 'Unassigned',
                        approvalDeadlineAt: approvalDeadline,
                    },
                    jobId: this.buildSafeJobId(['claim-request-approver', claimTask.id]),
                });
            }

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
                    grantedExtensionDays: timerComputationMap.get(lead.id)?.extensionDaysUsed || 0,
                    leadTimerComputedEndAt: timerComputationMap.get(lead.id)?.computedEndAt || null,
                }),
            };
        } catch (error) {
            throw new Error(`Error requesting lead claim: ${error.message}`);
        }
    }

    async requestExtension({
        leadId,
        requesterId,
        companyId,
        requestedDays,
        justification,
        closurePlan,
    }) {
        const safeRequestedDays = Number(requestedDays);
        if (!Number.isFinite(safeRequestedDays) || safeRequestedDays < 1 || safeRequestedDays > EXTENSION_MAX_DAYS) {
            throw new Error(`Extension days must be between 1 and ${EXTENSION_MAX_DAYS}`);
        }
        if (!justification || !String(justification).trim()) {
            throw new Error('Justification is required');
        }
        if (!closurePlan || !String(closurePlan).trim()) {
            throw new Error('Closure plan is required');
        }

        const [lead, requester] = await Promise.all([
            prisma.lead.findFirst({
                where: { id: leadId, companyId },
                include: {
                    salesperson: {
                        select: { id: true, fullName: true, email: true },
                    },
                },
            }),
            prisma.user.findFirst({
                where: { id: requesterId, companyId },
                select: { id: true, fullName: true, email: true, role: true },
            }),
        ]);

        if (!lead) throw new Error('Lead not found');
        if (!requester) throw new Error('Requester not found');

        await this.expirePendingClaimTasks(companyId, [lead.id]);
        await this.expirePendingExtensionTasks(companyId, [lead.id]);

        const isRequesterAdmin = isCompanyAdminRole(requester.role);
        const isRequesterOwner = lead.salespersonId && lead.salespersonId === requester.id;
        if (!isRequesterAdmin && !isRequesterOwner) {
            throw new Error('Only lead owner or company admin can request extension');
        }

        const timerStartAt = await this.getLeadTimerStartAt(companyId, lead.id, lead.createdAt);
        const timerComputationMap = await this.getLeadTimerComputationMap(
            companyId,
            [lead.id],
            new Map([[lead.id, timerStartAt]]),
            new Map([[lead.id, lead.createdAt]])
        );
        const existingExtensionDays = timerComputationMap.get(lead.id)?.extensionDaysUsed || 0;
        const timerData = this.getLeadTimerData(
            timerStartAt,
            existingExtensionDays,
            timerComputationMap.get(lead.id)?.computedEndAt || null
        );
        if (!timerData.leadTimerExpired) {
            throw new Error('Extension request is available only after current timer expires');
        }
        if (existingExtensionDays >= EXTENSION_MAX_DAYS) {
            throw new Error(`Maximum extension of ${EXTENSION_MAX_DAYS} days already used`);
        }
        if (existingExtensionDays + safeRequestedDays > EXTENSION_MAX_DAYS) {
            throw new Error(`Requested days exceed max extension. Remaining extension days: ${EXTENSION_MAX_DAYS - existingExtensionDays}`);
        }

        const existingPending = await prisma.task.findFirst({
            where: {
                companyId,
                linkedType: 'Lead',
                linkedId: lead.id,
                status: 'Pending',
                OR: [
                    { title: { contains: 'Claim request', mode: 'insensitive' } },
                    { title: { contains: 'Extension request', mode: 'insensitive' } },
                ],
            },
            orderBy: { createdAt: 'desc' },
            select: { id: true, notes: true, dueDate: true, createdAt: true },
        });

        if (existingPending) {
            const existingRequesterId = this.extractRequesterIdFromNotes(existingPending.notes);
            const existingRequester = existingRequesterId
                ? await prisma.user.findFirst({
                    where: { id: existingRequesterId, companyId },
                    select: { fullName: true },
                })
                : null;
            const expiry = this.extractClaimDeadlineFromTask(existingPending);
            throw new Error(`A lead approval request is already pending${existingRequester?.fullName ? ` by ${existingRequester.fullName}` : ''}. It unlocks after ${expiry.toLocaleString()}`);
        }

        if (isRequesterAdmin) {
            await this.createAuditLog({
                leadId: lead.id,
                companyId,
                actorUserId: requester.id,
                action: 'EXTENSION_APPROVED',
                message: `Extension approved directly by admin for ${safeRequestedDays} day(s)`,
                changes: {
                    extensionDays: safeRequestedDays,
                    justification: String(justification).trim(),
                    closurePlan: String(closurePlan).trim(),
                    previousExtensionDays: existingExtensionDays,
                    totalExtensionDays: Math.min(EXTENSION_MAX_DAYS, existingExtensionDays + safeRequestedDays),
                },
            });

            return {
                approvedDirectly: true,
                extensionDays: safeRequestedDays,
                leadId: lead.id,
            };
        }

        const approver = await this.resolveDepartmentHeadApproverForUser({
            companyId,
            requesterId: requester.id,
        });
        if (!approver) {
            throw new Error('No department head/company admin found to review extension request');
        }

        const approvalDeadline = new Date(Date.now() + (EXTENSION_APPROVAL_WINDOW_HOURS * 60 * 60 * 1000));
        const dueTime = `${String(approvalDeadline.getHours()).padStart(2, '0')}:${String(approvalDeadline.getMinutes()).padStart(2, '0')}`;

        const extensionTask = await prisma.task.create({
            data: {
                title: `Extension request for lead: ${lead.name}`,
                type: 'Email',
                linkedType: 'Lead',
                linkedId: lead.id,
                linkedTo: lead.name,
                assignedTo: approver.fullName,
                dueDate: approvalDeadline,
                dueTime,
                status: 'Pending',
                priority: 'High',
                notes: `Request Type: ${REQUEST_TYPE_EXTENSION}\nLead extension request\nRequester: ${requester.fullName} (${requester.email})\nRequester ID: ${requester.id}\nCurrent Owner: ${lead.salesperson?.fullName || 'Unassigned'}\nCurrent Owner ID: ${lead.salesperson?.id || 'none'}\nApprover: ${approver.fullName}\nApprover ID: ${approver.id}\nRequested Extension Days: ${safeRequestedDays}\nJustification: ${String(justification).trim()}\nClosure Plan: ${String(closurePlan).trim()}\nApproval Window: ${EXTENSION_APPROVAL_WINDOW_HOURS}h`,
                companyId,
            },
        });

        await this.createAuditLog({
            leadId: lead.id,
            companyId,
            actorUserId: requester.id,
            action: 'EXTENSION_REQUEST',
            message: `Extension requested for ${safeRequestedDays} day(s) by ${requester.fullName}`,
            changes: {
                requestedDays: safeRequestedDays,
                requestedToUserId: approver.id,
                requestedToName: approver.fullName,
                justification: String(justification).trim(),
                closurePlan: String(closurePlan).trim(),
                approvalWindowHours: EXTENSION_APPROVAL_WINDOW_HOURS,
                approvalDeadlineAt: approvalDeadline.toISOString(),
                taskId: extensionTask.id,
            },
        });

        return {
            approvedDirectly: false,
            taskId: extensionTask.id,
            approvalDeadlineAt: approvalDeadline,
            requestedTo: {
                id: approver.id,
                fullName: approver.fullName,
                email: approver.email,
            },
        };
    }

    async decideExtensionRequest({ taskId, decision, note, companyId, actorUserId }) {
        await this.expirePendingExtensionTasks(companyId);

        const actor = await prisma.user.findFirst({
            where: { id: actorUserId, companyId },
            select: { id: true, fullName: true },
        });
        if (!actor) throw new Error('User not found');

        const task = await prisma.task.findFirst({
            where: {
                id: taskId,
                companyId,
                linkedType: 'Lead',
                status: 'Pending',
                title: { contains: 'Extension request', mode: 'insensitive' },
            },
        });
        if (!task) throw new Error('Extension request activity not found');

        if (task.assignedTo !== actor.fullName) {
            throw new Error('You are not authorized to decide this extension request');
        }

        if (task.dueDate && new Date(task.dueDate).getTime() < Date.now()) {
            await prisma.task.update({
                where: { id: task.id },
                data: {
                    status: 'Completed',
                    notes: `${task.notes || ''}\nDecision: EXPIRED (approval window of ${EXTENSION_APPROVAL_WINDOW_HOURS}h passed) on ${new Date().toISOString()}`,
                },
            });
            throw new Error('Extension request expired (approval window is over 12h)');
        }

        const requesterId = this.extractRequesterIdFromNotes(task.notes);
        const requestedDays = this.extractRequestedExtensionDaysFromNotes(task.notes);
        const justification = this.extractJustificationFromNotes(task.notes);
        const closurePlan = this.extractClosurePlanFromNotes(task.notes);

        if (!requesterId || !requestedDays) {
            throw new Error('Invalid extension request payload');
        }

        const [lead, requester] = await Promise.all([
            prisma.lead.findFirst({
                where: { id: task.linkedId, companyId },
                select: { id: true, name: true, createdAt: true },
            }),
            prisma.user.findFirst({
                where: { id: requesterId, companyId },
                select: { id: true, fullName: true, email: true },
            }),
        ]);

        if (!lead) throw new Error('Lead not found');
        if (!requester) throw new Error('Requester not found');

        const timerStartAt = await this.getLeadTimerStartAt(companyId, lead.id, lead.createdAt);
        const timerComputationMap = await this.getLeadTimerComputationMap(
            companyId,
            [lead.id],
            new Map([[lead.id, timerStartAt]]),
            new Map([[lead.id, lead.createdAt]])
        );
        const currentExtensionDays = timerComputationMap.get(lead.id)?.extensionDaysUsed || 0;

        if (decision === 'approve') {
            if (currentExtensionDays >= EXTENSION_MAX_DAYS) {
                throw new Error(`Maximum extension of ${EXTENSION_MAX_DAYS} days already used`);
            }
            if (currentExtensionDays + requestedDays > EXTENSION_MAX_DAYS) {
                throw new Error(`Requested extension exceeds max allowed ${EXTENSION_MAX_DAYS} days`);
            }
        }

        const nowIso = new Date().toISOString();
        const updatedTask = await prisma.$transaction(async (tx) => {
            const completedTask = await tx.task.update({
                where: { id: task.id },
                data: {
                    status: 'Completed',
                    notes: `${task.notes || ''}\nDecision: ${decision.toUpperCase()} by ${actor.fullName} on ${nowIso}\nNote: ${note}`,
                },
            });

            if (decision === 'approve') {
                await tx.leadAuditLog.create({
                    data: {
                        leadId: lead.id,
                        companyId,
                        actorUserId,
                        action: 'EXTENSION_APPROVED',
                        message: `Extension approved for ${requestedDays} day(s)`,
                        changes: {
                            extensionDays: requestedDays,
                            previousExtensionDays: currentExtensionDays,
                            totalExtensionDays: Math.min(EXTENSION_MAX_DAYS, currentExtensionDays + requestedDays),
                            requesterId: requester.id,
                            requesterName: requester.fullName,
                            taskId: task.id,
                            justification,
                            closurePlan,
                            note,
                        },
                    },
                });
            } else {
                await tx.leadAuditLog.create({
                    data: {
                        leadId: lead.id,
                        companyId,
                        actorUserId,
                        action: 'EXTENSION_REJECTED',
                        message: `Extension rejected by ${actor.fullName}`,
                        changes: {
                            requestedDays,
                            requesterId: requester.id,
                            requesterName: requester.fullName,
                            taskId: task.id,
                            note,
                        },
                    },
                });
            }

            return completedTask;
        });

        return {
            task: updatedTask,
            leadId: lead.id,
            requester,
            decision,
            requestedDays,
        };
    }

    async forceClaimOpenForTesting(leadId, companyId, actorUserId) {
        const lead = await prisma.lead.findFirst({
            where: { id: leadId, companyId },
            select: { id: true, name: true },
        });

        if (!lead) {
            throw new Error('Lead not found');
        }

        await this.expirePendingClaimTasks(companyId, [lead.id]);

        await this.createAuditLog({
            leadId: lead.id,
            companyId,
            actorUserId,
            action: CLAIM_TIMER_OVERRIDE_ACTION,
            message: 'Lead claim timer manually opened for development testing',
            changes: {
                forceClaimOpen: true,
                leadTimerTotalDays: LEAD_TIMER_DAYS,
            },
        });

        return { leadId: lead.id, message: 'Lead claim timer forced to 0D for testing' };
    }

    async getClaimActivities(companyId, userId) {
        await this.expirePendingClaimTasks(companyId);
        await this.expirePendingExtensionTasks(companyId);

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
                OR: [
                    { title: { contains: 'Claim request', mode: 'insensitive' } },
                    { title: { contains: 'Extension request', mode: 'insensitive' } },
                    { title: { contains: 'Qualified Status Approval', mode: 'insensitive' } },
                ],
                assignedTo: user.fullName
            },
            orderBy: { createdAt: 'desc' }
        });

        if (!tasks.length) return [];

        const leadIds = tasks.map((task) => task.linkedId).filter(Boolean);
        const requesterIds = tasks
            .map((task) => this.extractRequesterIdFromNotes(task.notes))
            .filter(Boolean);

        const [leads, requesters, timerStartMap, forcedOverdueLeadSet] = await Promise.all([
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
            this.getForcedOverdueLeadSet(companyId, leadIds),
        ]);
        const timerComputationMap = await this.getLeadTimerComputationMap(
            companyId,
            leadIds,
            timerStartMap,
            new Map(leads.map((item) => [item.id, item.createdAt]))
        );

        const leadMap = new Map(leads.map((lead) => [lead.id, lead]));
        const requesterMap = new Map(requesters.map((userRecord) => [userRecord.id, userRecord]));

        return tasks.map((task) => {
            const requesterId = this.extractRequesterIdFromNotes(task.notes);
            const lead = leadMap.get(task.linkedId);
            const requester = requesterMap.get(requesterId);
            const requestType = this.extractRequestTypeFromNotes(task.notes)
                || (task.title?.toLowerCase().includes('extension request') ? REQUEST_TYPE_EXTENSION : (task.title?.toLowerCase().includes('qualified status') ? REQUEST_TYPE_QUALIFIED : REQUEST_TYPE_CLAIM));
            return {
                id: task.id,
                taskId: task.id,
                requestType,
                createdAt: task.createdAt,
                dueDate: task.dueDate,
                approvalDeadlineAt: this.extractClaimDeadlineFromTask(task),
                title: task.title,
                status: task.status,
                notes: task.notes,
                requestedExtensionDays: requestType === REQUEST_TYPE_EXTENSION ? this.extractRequestedExtensionDaysFromNotes(task.notes) : null,
                justification: requestType === REQUEST_TYPE_EXTENSION ? this.extractJustificationFromNotes(task.notes) : null,
                closurePlan: requestType === REQUEST_TYPE_EXTENSION ? this.extractClosurePlanFromNotes(task.notes) : null,
                lead: lead
                    ? this.attachLeadTimerData({
                        ...lead,
                        leadTimerStartAt: timerStartMap.get(lead.id) || lead.createdAt,
                        leadTimerForcedOverdue: forcedOverdueLeadSet.has(lead.id),
                        grantedExtensionDays: timerComputationMap.get(lead.id)?.extensionDaysUsed || 0,
                        leadTimerComputedEndAt: timerComputationMap.get(lead.id)?.computedEndAt || null,
                    })
                    : null,
                requester: requester || null
            };
        });
    }

    async decideClaimRequest({ taskId, decision, note, companyId, actorUserId }) {
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

        const requestType = this.extractRequestTypeFromNotes(task.notes)
            || (task.title?.toLowerCase().includes('extension request') ? REQUEST_TYPE_EXTENSION : REQUEST_TYPE_CLAIM);
        if (requestType === REQUEST_TYPE_EXTENSION) {
            throw new Error('This is an extension request. Use extension decision endpoint.');
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
                        notes: `${task.notes || ''}\nDecision: APPROVED by ${actor.fullName} on ${nowIsoString}\nNote: ${note}`,
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
                            note,
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

            if (previousOwner?.email) {
                await this.queueEmailSafe({
                    to: previousOwner.email,
                    templateBuilder: claimApprovedOwnershipTemplate,
                    templateParams: {
                        leadName: lead.name,
                        recipientName: previousOwner.fullName,
                        previousOwnerName: previousOwner.fullName,
                        newOwnerName: requester.fullName,
                    },
                    jobId: this.buildSafeJobId(['claim-approved-prev-owner', task.id]),
                });
            }

            if (requester?.email) {
                await this.queueEmailSafe({
                    to: requester.email,
                    templateBuilder: claimApprovedOwnershipTemplate,
                    templateParams: {
                        leadName: lead.name,
                        recipientName: requester.fullName,
                        previousOwnerName: previousOwner?.fullName || 'Unassigned',
                        newOwnerName: requester.fullName,
                    },
                    jobId: this.buildSafeJobId(['claim-approved-new-owner', task.id]),
                });
            }
        } else {
            const transactionResult = await prisma.$transaction(async (tx) => {
                const decidedTask = await tx.task.update({
                    where: { id: task.id },
                    data: {
                        status: 'Completed',
                        notes: `${task.notes || ''}\nDecision: REJECTED by ${actor.fullName} on ${nowIsoString}\nNote: ${note}`,
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
                            note,
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

    async decideApprovalRequest({ taskId, decision, note, companyId, actorUserId }) {
        const task = await prisma.task.findFirst({
            where: {
                id: taskId,
                companyId,
                linkedType: 'Lead',
                status: 'Pending',
                OR: [
                    { title: { contains: 'Claim request', mode: 'insensitive' } },
                    { title: { contains: 'Extension request', mode: 'insensitive' } },
                    { title: { contains: 'Qualified Status Approval', mode: 'insensitive' } },
                ],
            },
            select: { id: true, title: true, notes: true },
        });

        if (!task) {
            throw new Error('Approval request not found');
        }

        const requestType = this.extractRequestTypeFromNotes(task.notes)
            || (task.title?.toLowerCase().includes('extension request') ? REQUEST_TYPE_EXTENSION : REQUEST_TYPE_CLAIM);

        if (requestType === REQUEST_TYPE_EXTENSION) {
            return this.decideExtensionRequest({ taskId, decision, note, companyId, actorUserId });
        }

        if (requestType === REQUEST_TYPE_QUALIFIED) {
            return this.decideQualifiedApprovalRequest({ taskId, decision, note, companyId, actorUserId });
        }

        return this.decideClaimRequest({ taskId, decision, note, companyId, actorUserId });
    }

    async decideQualifiedApprovalRequest({ taskId, decision, note, companyId, actorUserId }) {
        const actor = await prisma.user.findFirst({
            where: { id: actorUserId, companyId },
            select: { id: true, fullName: true },
        });
        if (!actor) throw new Error('User not found');

        const task = await prisma.task.findFirst({
            where: {
                id: taskId,
                companyId,
                linkedType: 'Lead',
                status: 'Pending',
                title: { contains: 'Qualified Status Approval', mode: 'insensitive' },
            },
        });
        if (!task) throw new Error('Qualified approval request not found');

        if (task.assignedTo !== actor.fullName) {
            throw new Error('You are not authorized to decide this approval request');
        }

        const requesterId = this.extractRequesterIdFromNotes(task.notes);
        if (!requesterId) throw new Error('Invalid request payload');

        const lead = await prisma.lead.findFirst({
            where: { id: task.linkedId, companyId },
        });
        if (!lead) throw new Error('Lead not found');

        const nowIso = new Date().toISOString();
        const result = await prisma.$transaction(async (tx) => {
            const updatedTask = await tx.task.update({
                where: { id: taskId },
                data: {
                    status: 'Completed',
                    notes: `${task.notes || ''}\nDecision: ${decision.toUpperCase()} by ${actor.fullName} on ${nowIso}\nNote: ${note}`,
                },
            });

            if (decision === 'approve') {
                const formattedDate = `${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`;
                const formattedNote = `[${formattedDate}] Status changed to Qualified by approval from ${actor.fullName}: ${note}`;
                const nextNotes = lead.notes ? `${lead.notes}\n\n${formattedNote}` : formattedNote;

                await tx.lead.update({
                    where: { id: lead.id },
                    data: {
                        status: 'Qualified',
                        notes: nextNotes
                    },
                });

                await tx.leadAuditLog.create({
                    data: {
                        leadId: lead.id,
                        companyId,
                        actorUserId,
                        action: 'STATUS_CHANGE',
                        message: `Lead status changed to Qualified via approval by ${actor.fullName}`,
                        changes: {
                            status: { from: lead.status, to: 'Qualified' },
                            note: note,
                            approvedBy: actor.fullName,
                        },
                    },
                });
            } else {
                await tx.leadAuditLog.create({
                    data: {
                        leadId: lead.id,
                        companyId,
                        actorUserId,
                        action: 'STATUS_CHANGE_REJECTED',
                        message: `Status change to Qualified rejected by ${actor.fullName}`,
                        changes: {
                            proposedStatus: 'Qualified',
                            rejectedBy: actor.fullName,
                            note: note,
                        },
                    },
                });
            }

            return { updatedTask, requesterId };
        });

        // Send notification to requester
        const requester = await prisma.user.findFirst({
            where: { id: result.requesterId, companyId },
            select: { email: true, fullName: true }
        });

        if (requester?.email) {
            await this.queueEmailSafe({
                to: requester.email,
                templateBuilder: leadQualifiedStatusDecisionTemplate,
                templateParams: {
                    leadName: lead.name,
                    ownerName: requester.fullName,
                    approverName: actor.fullName,
                    decision,
                    note: note
                },
                jobId: this.buildSafeJobId(['qualified-status-decision', taskId]),
            });
        }

        return {
            task: result.updatedTask,
            leadId: lead.id,
            decision,
        };
    }

    async getDocuments(leadId, companyId, documentType) {
        const lead = await prisma.lead.findFirst({
            where: { id: leadId, companyId },
        });

        if (!lead) throw new Error('Lead not found');

        const params = { leadId };
        if (documentType) {
            params.documentType = documentType;
        }

        return prisma.leadDocument.findMany({
            where: params,
            include: {
                uploader: { select: { id: true, fullName: true, email: true } },
            },
            orderBy: [{ documentType: 'asc' }, { version: 'desc' }],
        });
    }

    async uploadDocuments({ leadId, companyId, documentType, files, uploadedBy }) {
        const lead = await prisma.lead.findFirst({
            where: { id: leadId, companyId },
        });

        if (!lead) throw new Error('Lead not found');

        if (lead.status !== 'Qualified') {
            throw new Error('Requirements documents can only be uploaded when lead status is "Qualified"');
        }

        const existingDocs = await prisma.leadDocument.findMany({
            where: { leadId, documentType },
            orderBy: { version: 'desc' },
            take: 1
        });

        let nextVersion = existingDocs.length > 0 ? existingDocs[0].version + 1 : 1;

        const uploadedDocs = [];
        for (const file of files) {
            const doc = await prisma.leadDocument.create({
                data: {
                    leadId,
                    documentType,
                    version: nextVersion,
                    filename: file.filename,
                    originalName: file.originalname,
                    path: file.path.replace(/\\/g, '/'),
                    mimetype: file.mimetype,
                    size: file.size,
                    uploadedBy,
                }
            });
            uploadedDocs.push(doc);
        }

        await prisma.leadAuditLog.create({
            data: {
                leadId,
                companyId,
                actorUserId: uploadedBy,
                action: 'DOCUMENT_UPLOAD',
                message: `Uploaded ${files.length} document(s) for ${documentType}`,
                changes: {
                    documentType,
                    count: files.length,
                    files: uploadedDocs.map(d => ({
                        id: d.id,
                        name: d.originalName,
                        version: d.version
                    })),
                }
            }
        });

        return uploadedDocs;
    }

    async deleteDocument(leadId, documentId, companyId) {
        const lead = await prisma.lead.findFirst({ where: { id: leadId, companyId } });
        if (!lead) throw new Error('Lead not found');

        const doc = await prisma.leadDocument.findFirst({
            where: { id: documentId, leadId }
        });

        if (!doc) throw new Error('Document not found');

        try {
            const fs = require('fs');
            if (fs.existsSync(doc.path)) fs.unlinkSync(doc.path);
        } catch (e) {
            console.error('Failed to delete physical file:', e);
        }

        await prisma.leadDocument.delete({ where: { id: documentId } });
        return { success: true };
    }

    async submitLeadCompliance(leadId, companyId, userId) {
        const lead = await prisma.lead.findFirst({
            where: { id: leadId, companyId },
            include: { documents: true }
        });

        if (!lead) throw new Error('Lead not found');
        if (lead.status !== 'Won') throw new Error('Lead must be in "Won" status to submit compliance');

        const requiredDocs = ["Initial SOW", "Client BOQ", "Payment Proofs", "Signed MSA", "Signed NDA"];
        const uploadedTypes = new Set(lead.documents.map(d => d.documentType));
        const missing = requiredDocs.filter(reqDoc => !uploadedTypes.has(reqDoc));

        if (missing.length > 0) {
            throw new Error(`Missing mandatory documents: ${missing.join(', ')}`);
        }

        if (lead.complianceStatus !== 'PENDING' && lead.complianceStatus !== 'REJECTED' && lead.complianceStatus !== 'NA') {
            throw new Error(`Compliance flow is already in progress or completed (${lead.complianceStatus}).`);
        }

        const requester = await prisma.user.findFirst({
            where: { id: userId, companyId },
            select: { role: true }
        });
        const role = normalizeRole(requester?.role);

        let initialLevel = 'TL_VERIFICATION';
        let initialStatus = 'TL_VERIFICATION';

        if (role === EMPLOYEE_ROLES.TEAM_LEADER) {
            initialLevel = 'HEAD_APPROVAL';
            initialStatus = 'HEAD_APPROVAL';
        } else if (role === EMPLOYEE_ROLES.HEAD_OF_DEPARTMENT || role === EMPLOYEE_ROLES.COMPANY_ADMIN) {
            initialLevel = 'ADMIN_APPROVAL';
            initialStatus = 'ADMIN_APPROVAL';
        }

        const deadline = new Date(Date.now() + 24 * 60 * 60 * 1000);
        await prisma.leadApproval.create({
            data: {
                leadId,
                level: initialLevel,
                deadline
            }
        });

        await prisma.lead.update({
            where: { id: leadId },
            data: { complianceStatus: initialStatus }
        });

        await this.createAuditLog({
            leadId,
            companyId,
            actorUserId: userId,
            action: 'UPDATE',
            message: `Lead compliance submitted for ${initialLevel}`,
            changes: { complianceStatus: { from: lead.complianceStatus, to: initialStatus } }
        });

        return { message: `Compliance flow submitted to ${initialLevel}` };
    }

    async approveLeadCompliance({ leadId, companyId, userId, level, action, comments }) {
        const lead = await prisma.lead.findFirst({
            where: { id: leadId, companyId }
        });

        if (!lead) throw new Error('Lead not found');

        const approval = await prisma.leadApproval.findFirst({
            where: {
                leadId,
                level,
                status: 'PENDING'
            }
        });

        if (!approval) throw new Error(`No pending approval found for level ${level}`);

        await prisma.leadApproval.update({
            where: { id: approval.id },
            data: {
                status: action,
                approverId: userId,
                comments: comments || null
            }
        });

        if (action === 'REJECTED') {
            await prisma.lead.update({
                where: { id: leadId },
                data: { complianceStatus: 'REJECTED' }
            });

            await this.createAuditLog({
                leadId,
                companyId,
                actorUserId: userId,
                action: 'UPDATE',
                message: `Lead compliance rejected at level ${level}`,
                changes: { complianceStatus: { from: lead.complianceStatus, to: 'REJECTED' }, comments }
            });

            return { nextStatus: 'REJECTED' };
        }

        let nextLevel = null;
        let nextComplianceStatus = '';

        if (level === 'TL_VERIFICATION') {
            nextLevel = 'HEAD_APPROVAL';
            nextComplianceStatus = 'HEAD_APPROVAL';
        } else if (level === 'HEAD_APPROVAL') {
            nextLevel = 'ADMIN_APPROVAL';
            nextComplianceStatus = 'ADMIN_APPROVAL';
        }

        if (nextLevel) {
            const deadline = new Date(Date.now() + 24 * 60 * 60 * 1000);
            await prisma.leadApproval.create({
                data: {
                    leadId,
                    level: nextLevel,
                    deadline
                }
            });
            await prisma.lead.update({
                where: { id: leadId },
                data: { complianceStatus: nextComplianceStatus }
            });

            await this.createAuditLog({
                leadId,
                companyId,
                actorUserId: userId,
                action: 'UPDATE',
                message: `Lead compliance approved at level ${level}. Moving to ${nextLevel}.`,
                changes: { complianceStatus: { from: lead.complianceStatus, to: nextComplianceStatus }, comments }
            });

            return { nextStatus: nextComplianceStatus };
        }

        // Final approval
        const updatedLead = await prisma.lead.update({
            where: { id: leadId },
            data: {
                complianceStatus: 'APPROVED',
                status: 'Won' // As per flow logic
            }
        });

        // Generate customer
        const customer = await prisma.customer.create({
            data: {
                type: "Company",
                name: updatedLead.name,
                email: updatedLead.email || 'no-email@example.com',
                phone: updatedLead.phone || '0000000000',
                contactPerson: updatedLead.name,
                companyId: updatedLead.companyId,
                leadId: updatedLead.id,
                status: "Active"
            }
        });

        // Create deal
        const deal = await prisma.deal.create({
            data: {
                title: `Deal for ${updatedLead.name}`,
                value: updatedLead.value || 0,
                stage: 'Won',
                salespersonId: updatedLead.salespersonId,
                customerId: customer.id,
                companyId: updatedLead.companyId,
                probability: 100,
                projectGenerated: true,
                complianceStatus: 'HEAD_APPROVED'
            }
        });

        // Generate temp project ID
        const tempProjectId = `PRJ-${Date.now().toString().slice(-6)}`;
        const project = await prisma.project.create({
            data: {
                projectId: tempProjectId,
                name: `Project: ${updatedLead.name}`,
                dealId: deal.id,
                companyId: updatedLead.companyId,
                status: 'Active'
            }
        });

        // Notify tech team via Task
        await prisma.task.create({
            data: {
                title: `New Project Generated: ${tempProjectId}`,
                type: 'System',
                linkedType: 'Project',
                linkedId: project.id,
                linkedTo: project.name,
                assignedTo: 'Tech Team',
                dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
                dueTime: "10:00",
                status: "Pending",
                priority: "High",
                notes: `Project ${tempProjectId} created for Won lead ${updatedLead.name}. Please provision the project workspace.`,
                companyId: updatedLead.companyId,
            }
        });

        await this.createAuditLog({
            leadId,
            companyId,
            actorUserId: userId,
            action: 'UPDATE',
            message: 'Lead compliance fully approved. Customer, Deal and Temp Project generated.',
            changes: { complianceStatus: { from: lead.complianceStatus, to: 'APPROVED' }, comments }
        });

        return { nextStatus: 'APPROVED', lead: updatedLead, tempProjectId };
    }

    async getPendingApprovals(companyId, userId, role) {
        const normalizedRole = normalizeRole(role);
        let statusFilter = [];

        if (normalizedRole === EMPLOYEE_ROLES.TEAM_LEADER) {
            statusFilter = ['TL_VERIFICATION'];
        } else if (normalizedRole === EMPLOYEE_ROLES.HEAD_OF_DEPARTMENT) {
            statusFilter = ['HEAD_APPROVAL'];
        } else if (normalizedRole === EMPLOYEE_ROLES.COMPANY_ADMIN) {
            statusFilter = ['TL_VERIFICATION', 'HEAD_APPROVAL', 'ADMIN_APPROVAL'];
        }

        if (statusFilter.length === 0) {
            return []; // Other roles don't see approvals
        }

        const leads = await prisma.lead.findMany({
            where: {
                companyId,
                complianceStatus: { in: statusFilter }
            },
            include: {
                salesperson: {
                    select: { id: true, fullName: true, email: true }
                },
                approvals: {
                    orderBy: { createdAt: 'desc' }
                },
                documents: true
            },
            orderBy: { updatedAt: 'desc' }
        });

        return leads;
    }
}

module.exports = new LeadService();
