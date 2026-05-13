const prisma = require('../../database/prisma');

const normalizeEntryDate = (entryDate) => {
    if (!entryDate) throw new Error('entryDate is required');
    const date = new Date(entryDate);
    if (Number.isNaN(date.getTime())) {
        throw new Error('Invalid entryDate');
    }
    date.setHours(0, 0, 0, 0);
    return date;
};

const getUserFullName = async (companyId, userId) => {
    const user = await prisma.user.findFirst({
        where: { id: userId, companyId },
        select: { fullName: true }
    });
    return user?.fullName || '';
};

const getAutoData = async (companyId, userId, entryDate) => {
    const normalizedDate = normalizeEntryDate(entryDate);
    const start = new Date(normalizedDate);
    const end = new Date(normalizedDate);
    end.setDate(end.getDate() + 1);

    const [leads, userFullName] = await Promise.all([
        prisma.lead.findMany({
            where: {
                companyId,
                salespersonId: userId,
                updatedAt: {
                    gte: start,
                    lt: end
                }
            },
            select: { id: true, name: true, status: true, email: true, phone: true, source: true },
            orderBy: { updatedAt: 'desc' }
        }),
        getUserFullName(companyId, userId)
    ]);

    const trackingItems = await prisma.task.findMany({
        where: {
            companyId,
            assignedTo: userFullName,
            linkedType: 'Lead',
            createdAt: {
                gte: start,
                lt: end
            }
        },
        select: {
            id: true,
            title: true,
            type: true,
            linkedId: true,
            linkedTo: true,
            status: true,
            priority: true,
            createdAt: true
        },
        orderBy: { createdAt: 'desc' }
    });

    return { leads, trackingItems };
};

const getMyEntry = async (companyId, userId, entryDate) => {
    const normalizedDate = normalizeEntryDate(entryDate);
    return prisma.salesEodEntry.findFirst({
        where: {
            companyId,
            userId,
            entryDate: normalizedDate
        }
    });
};

const listMyEntries = async (companyId, userId, from, to, limit = 10) => {
    const where = { companyId, userId };
    if (from || to) {
        where.entryDate = {};
        if (from) where.entryDate.gte = normalizeEntryDate(from);
        if (to) {
            const end = normalizeEntryDate(to);
            end.setHours(23, 59, 59, 999);
            where.entryDate.lte = end;
        }
    }

    return prisma.salesEodEntry.findMany({
        where,
        orderBy: { entryDate: 'desc' },
        take: Number(limit) || 10
    });
};

const upsertEntry = async (companyId, userId, payload) => {
    const normalizedDate = normalizeEntryDate(payload.entryDate);
    const autoData = await getAutoData(companyId, userId, normalizedDate);

    const data = {
        entryDate: normalizedDate,
        leadsWorked: autoData.leads,
        trackingItems: autoData.trackingItems,
        callsMade: Number.isFinite(Number(payload.callsMade)) ? Number(payload.callsMade) : null,
        progressUpdates: payload.progressUpdates || '',
        blockers: payload.blockers || '',
        companyId,
        userId
    };

    return prisma.salesEodEntry.upsert({
        where: {
            userId_entryDate: {
                userId,
                entryDate: normalizedDate
            }
        },
        create: data,
        update: data
    });
};

const getTodaySummary = async (companyId, entryDate) => {
    const normalizedDate = normalizeEntryDate(entryDate || new Date());
    const start = new Date(normalizedDate);
    const end = new Date(normalizedDate);
    end.setDate(end.getDate() + 1);

    const users = await prisma.user.findMany({
        where: {
            companyId,
            department: { equals: 'sales', mode: 'insensitive' }
        },
        select: { id: true, fullName: true, role: true, email: true }
    });

    const [leads, tracking, eodEntries] = await Promise.all([
        prisma.lead.findMany({
            where: { companyId, salespersonId: { in: users.map(u => u.id) } },
            select: { id: true, name: true, salespersonId: true }
        }),
        prisma.task.findMany({
            where: {
                companyId,
                linkedType: 'Lead',
                createdAt: { gte: start, lt: end }
            },
            select: { id: true, assignedTo: true }
        }),
        prisma.salesEodEntry.findMany({
            where: { companyId, entryDate: normalizedDate }
        })
    ]);

    const leadCountByUser = leads.reduce((acc, lead) => {
        if (!lead.salespersonId) return acc;
        acc[lead.salespersonId] = (acc[lead.salespersonId] || 0) + 1;
        return acc;
    }, {});

    const trackingCountByName = tracking.reduce((acc, item) => {
        if (!item.assignedTo) return acc;
        acc[item.assignedTo] = (acc[item.assignedTo] || 0) + 1;
        return acc;
    }, {});

    const eodByUser = eodEntries.reduce((acc, entry) => {
        acc[entry.userId] = entry;
        return acc;
    }, {});

    return users.map((user) => ({
        user,
        leadsWorked: leadCountByUser[user.id] || 0,
        trackingItems: trackingCountByName[user.fullName] || 0,
        eod: eodByUser[user.id] || null
    }));
};

const getUserSummary = async (companyId, userId) => {
    const user = await prisma.user.findFirst({
        where: { id: userId, companyId },
        select: { id: true, fullName: true, role: true, email: true, department: true }
    });

    if (!user) {
        throw new Error('User not found');
    }

    const [leads, tracking, entries] = await Promise.all([
        prisma.lead.findMany({
            where: { companyId, salespersonId: userId },
            select: { id: true, name: true, status: true, source: true }
        }),
        prisma.task.findMany({
            where: {
                companyId,
                linkedType: 'Lead',
                assignedTo: user.fullName
            },
            select: { id: true, title: true, type: true, status: true, createdAt: true },
            orderBy: { createdAt: 'desc' },
            take: 10
        }),
        prisma.salesEodEntry.findMany({
            where: { companyId, userId },
            orderBy: { entryDate: 'desc' },
            take: 5
        })
    ]);

    return {
        user,
        stats: {
            leadsAssigned: leads.length,
            trackingItems: tracking.length,
            eodEntries: entries.length
        },
        recentLeads: leads.slice(0, 10),
        recentTracking: tracking,
        recentEod: entries
    };
};

module.exports = {
    getAutoData,
    getMyEntry,
    upsertEntry,
    listMyEntries,
    getTodaySummary,
    getUserSummary
};
