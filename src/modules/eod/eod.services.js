const prisma = require('../../database/prisma');

const normalizeEntryDate = (entryDate) => {
    if (!entryDate) {
        throw new Error('entryDate is required');
    }
    const date = new Date(entryDate);
    if (Number.isNaN(date.getTime())) {
        throw new Error('Invalid entryDate');
    }
    date.setHours(0, 0, 0, 0);
    return date;
};

const computeCompletionFromTasks = (tasksWorked) => {
    if (!Array.isArray(tasksWorked) || tasksWorked.length === 0) return null;
    const values = tasksWorked
        .map((task) => Number(task?.completionPercent))
        .filter((value) => Number.isFinite(value));
    if (!values.length) return null;
    const total = values.reduce((sum, value) => sum + value, 0);
    return Math.round(total / values.length);
};

const getDefaultTasks = async (companyId, userId) => {
    const projectTasks = await prisma.projectTask.findMany({
        where: {
            assignedToId: userId,
            milestone: {
                project: {
                    companyId
                }
            }
        },
        include: {
            milestone: {
                select: {
                    title: true,
                    project: {
                        select: { name: true, projectId: true }
                    }
                }
            }
        },
        orderBy: { updatedAt: 'desc' }
    });

    return projectTasks.map((task) => ({
        title: task.title,
        source: 'ProjectTask',
        sourceId: task.id,
        status: task.status,
        priority: task.priority,
        deadline: task.deadline ? task.deadline.toISOString() : null,
        projectName: task.milestone?.project?.name || '',
        milestoneTitle: task.milestone?.title || '',
        completionPercent: task.status === 'Completed' ? 100 : 0
    }));
};

const getMyEntry = async (companyId, userId, entryDate) => {
    const normalizedDate = normalizeEntryDate(entryDate);
    return prisma.eodEntry.findFirst({
        where: {
            companyId,
            userId,
            entryDate: normalizedDate
        }
    });
};

const upsertEntry = async (companyId, userId, payload) => {
    const normalizedDate = normalizeEntryDate(payload.entryDate);
    const tasksWorked = Array.isArray(payload.tasksWorked) ? payload.tasksWorked : [];
    const computedCompletion = computeCompletionFromTasks(tasksWorked);

    const completionPercent = Number.isFinite(Number(payload.completionPercent))
        ? Number(payload.completionPercent)
        : computedCompletion;

    const productivityScore = Number.isFinite(Number(payload.productivityScore))
        ? Number(payload.productivityScore)
        : completionPercent;

    const data = {
        entryDate: normalizedDate,
        tasksWorked,
        hoursLogged: Number.isFinite(Number(payload.hoursLogged)) ? Number(payload.hoursLogged) : null,
        completionPercent,
        blockers: payload.blockers || '',
        productivityScore,
        productivityNotes: payload.productivityNotes || '',
        companyId,
        userId
    };

    return prisma.eodEntry.upsert({
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

const listMyEntries = async (companyId, userId, from, to) => {
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

    return prisma.eodEntry.findMany({
        where,
        orderBy: { entryDate: 'desc' }
    });
};

module.exports = {
    getDefaultTasks,
    getMyEntry,
    upsertEntry,
    listMyEntries
};
