const prisma = require('../../database/prisma');
const { canAccessEmployees, normalizeRole, EMPLOYEE_ROLES } = require('../../helpers/employeeHierarchy');

const ensureAuthorized = (actorUser) => {
    if (actorUser?.isPlatformAdmin) {
        return;
    }
    const normalized = normalizeRole(actorUser?.role);
    if (normalized !== EMPLOYEE_ROLES.COMPANY_ADMIN && normalized !== EMPLOYEE_ROLES.TEAM_LEADER) {
        throw new Error('Forbidden: Tech Lead or Admin access required');
    }
};

const normalizeEstimatedHours = (estimatedHours) => {
    if (estimatedHours === null || estimatedHours === undefined || estimatedHours === '') return null;
    const value = Number(estimatedHours);
    if (!Number.isFinite(value) || value < 0) {
        throw new Error('Invalid estimatedHours');
    }
    return value;
};

const createBatch = async (payload, companyId, actorUser) => {
    ensureAuthorized(actorUser);

    const projectId = payload.projectId ? String(payload.projectId).trim() : null;
    if (projectId) {
        const projectExists = await prisma.project.findFirst({
            where: { id: projectId, companyId },
            select: { id: true }
        });
        if (!projectExists) {
            throw new Error('Project not found');
        }
    }

    const tasks = payload.tasks.map((task) => ({
        title: String(task.title).trim(),
        assignedToId: String(task.assignedToId).trim(),
        estimatedHours: normalizeEstimatedHours(task.estimatedHours),
        notes: task.notes || '',
        companyId
    }));

    const batch = await prisma.techTaskBatch.create({
        data: {
            headTitle: String(payload.headTitle).trim(),
            projectId: projectId || null,
            companyId,
            createdById: actorUser.id,
            tasks: {
                create: tasks
            }
        },
        include: {
            project: { select: { id: true, name: true, projectId: true } },
            tasks: {
                include: {
                    assignedTo: { select: { id: true, fullName: true, email: true } }
                }
            }
        }
    });

    return batch;
};

const listBatches = async (companyId, actorUser) => {
    ensureAuthorized(actorUser);
    return prisma.techTaskBatch.findMany({
        where: { companyId },
        include: {
            project: { select: { id: true, name: true, projectId: true } },
            tasks: {
                include: {
                    assignedTo: { select: { id: true, fullName: true, email: true } }
                }
            }
        },
        orderBy: { createdAt: 'desc' }
    });
};

const listMyTasks = async (companyId, userId) => {
    return prisma.techTaskItem.findMany({
        where: {
            companyId,
            assignedToId: userId
        },
        include: {
            batch: {
                select: {
                    headTitle: true,
                    project: { select: { id: true, name: true, projectId: true } },
                    createdBy: { select: { id: true, fullName: true } }
                }
            }
        },
        orderBy: { createdAt: 'desc' }
    });
};

const listTodayTasks = async (companyId, actorUser, dateValue) => {
    ensureAuthorized(actorUser);

    const baseDate = dateValue ? new Date(dateValue) : new Date();
    if (Number.isNaN(baseDate.getTime())) {
        throw new Error('Invalid date');
    }
    const start = new Date(baseDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);

    return prisma.techTaskItem.findMany({
        where: {
            companyId,
            assignedToId: { not: null },
            createdAt: {
                gte: start,
                lt: end
            }
        },
        include: {
            assignedTo: { select: { id: true, fullName: true, email: true, role: true } },
            batch: {
                select: {
                    headTitle: true,
                    project: { select: { id: true, name: true, projectId: true } },
                    createdBy: { select: { id: true, fullName: true } }
                }
            }
        },
        orderBy: { createdAt: 'desc' }
    });
};

const updateTaskStatus = async (taskId, companyId, userId, status, note) => {
    const task = await prisma.techTaskItem.findFirst({
        where: {
            id: taskId,
            companyId
        }
    });

    if (!task) {
        throw new Error('Task not found');
    }

    if (task.assignedToId !== userId) {
        throw new Error('Forbidden: You can only complete your own tasks');
    }

    const updatePayload = { status };
    const now = new Date();
    if (status === 'Completed') {
        updatePayload.completionNote = note;
        updatePayload.completedAt = now;
        updatePayload.blockerNote = null;
        updatePayload.blockedAt = null;
        updatePayload.failureNote = null;
        updatePayload.failedAt = null;
    } else if (status === 'Blocked') {
        updatePayload.blockerNote = note;
        updatePayload.blockedAt = now;
    } else if (status === 'Failed') {
        updatePayload.failureNote = note;
        updatePayload.failedAt = now;
    }

    return prisma.techTaskItem.update({
        where: { id: taskId },
        data: updatePayload
    });
};

const getUserSummary = async (companyId, actorUser, userId) => {
    ensureAuthorized(actorUser);

    const tasks = await prisma.techTaskItem.findMany({
        where: {
            companyId,
            assignedToId: userId
        },
        include: {
            batch: {
                select: {
                    headTitle: true,
                    projectId: true,
                    project: { select: { id: true, name: true, projectId: true } },
                    createdBy: { select: { id: true, fullName: true } }
                }
            }
        },
        orderBy: { createdAt: 'desc' }
    });

    const totalAssigned = tasks.length;
    const completed = tasks.filter((t) => t.status === 'Completed').length;
    const blocked = tasks.filter((t) => t.status === 'Blocked').length;
    const failed = tasks.filter((t) => t.status === 'Failed').length;
    const pending = totalAssigned - completed - blocked - failed;
    const contributedProjects = new Set(
        tasks
            .filter((t) => t.status === 'Completed' && t.batch?.projectId)
            .map((t) => t.batch.projectId)
    );

    return {
        stats: {
            totalAssigned,
            completed,
            pending,
            blocked,
            failed,
            contributedProjects: contributedProjects.size
        },
        tasks: tasks.slice(0, 10)
    };
};

const createSelfTask = async (companyId, userId, payload) => {
    const projectId = payload.projectId ? String(payload.projectId).trim() : null;
    if (projectId) {
        const projectExists = await prisma.project.findFirst({
            where: { id: projectId, companyId },
            select: { id: true }
        });
        if (!projectExists) {
            throw new Error('Project not found');
        }
    }

    const headTitle = 'Self Tasks';
    let batch = await prisma.techTaskBatch.findFirst({
        where: {
            companyId,
            createdById: userId,
            headTitle,
            projectId: projectId || null
        }
    });

    if (!batch) {
        batch = await prisma.techTaskBatch.create({
            data: {
                headTitle,
                projectId: projectId || null,
                companyId,
                createdById: userId
            }
        });
    }

    const task = await prisma.techTaskItem.create({
        data: {
            batchId: batch.id,
            title: String(payload.title).trim(),
            assignedToId: userId,
            estimatedHours: normalizeEstimatedHours(payload.estimatedHours),
            notes: payload.notes || '',
            companyId
        },
        include: {
            batch: {
                select: {
                    headTitle: true,
                    project: { select: { id: true, name: true, projectId: true } },
                    createdBy: { select: { id: true, fullName: true } }
                }
            }
        }
    });

    return task;
};

const listAllTasks = async (companyId, actorUser) => {
    ensureAuthorized(actorUser);
    return prisma.techTaskItem.findMany({
        where: { companyId },
        include: {
            assignedTo: { select: { id: true, fullName: true, email: true, role: true } },
            batch: {
                select: {
                    id: true,
                    headTitle: true,
                    project: { select: { id: true, name: true, projectId: true } },
                    createdBy: { select: { id: true, fullName: true } }
                }
            }
        },
        orderBy: { createdAt: 'desc' }
    });
};

const updateTaskItem = async (taskId, companyId, actorUser, payload) => {
    ensureAuthorized(actorUser);
    const task = await prisma.techTaskItem.findFirst({ where: { id: taskId, companyId } });
    if (!task) throw new Error('Task not found');

    return prisma.techTaskItem.update({
        where: { id: taskId },
        data: {
            title: payload.title ? String(payload.title).trim() : undefined,
            assignedToId: payload.assignedToId || undefined,
            estimatedHours: payload.estimatedHours !== undefined ? normalizeEstimatedHours(payload.estimatedHours) : undefined,
            notes: payload.notes !== undefined ? payload.notes : undefined,
            status: payload.status || undefined
        },
        include: {
            assignedTo: { select: { id: true, fullName: true, email: true } },
            batch: { select: { headTitle: true, project: { select: { id: true, name: true } } } }
        }
    });
};

const deleteTaskItem = async (taskId, companyId, actorUser) => {
    ensureAuthorized(actorUser);
    const task = await prisma.techTaskItem.findFirst({ where: { id: taskId, companyId } });
    if (!task) throw new Error('Task not found');
    await prisma.techTaskItem.delete({ where: { id: taskId } });
    return { deleted: true };
};

module.exports = {
    createBatch,
    listBatches,
    listMyTasks,
    listTodayTasks,
    updateTaskStatus,
    getUserSummary,
    createSelfTask,
    listAllTasks,
    updateTaskItem,
    deleteTaskItem
};
