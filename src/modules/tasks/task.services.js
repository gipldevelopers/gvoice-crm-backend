const prisma = require('../../database/prisma');

const createTask = async (taskData, companyId) => {
    try {
        // Prepare the data
        const data = {
            title: taskData.title,
            type: taskData.type,
            linkedType: taskData.linkedType,
            linkedId: taskData.linkedId,
            linkedTo: taskData.linkedTo || '', // Will be set based on linkedType
            assignedTo: taskData.assignedTo,
            dueDate: new Date(taskData.dueDate),
            dueTime: taskData.dueTime,
            status: taskData.status || 'Pending',
            priority: taskData.priority || 'Medium',
            notes: taskData.notes || '',
            companyId: companyId
        };

        // Fetch the linked entity name if linkedId is provided
        if (taskData.linkedId && taskData.linkedType) {
            let entityName = '';

            switch (taskData.linkedType.toLowerCase()) {
                case 'lead':
                    const lead = await prisma.lead.findFirst({
                        where: {
                            id: taskData.linkedId,
                            companyId: companyId
                        },
                        select: { name: true }
                    });
                    entityName = lead?.name || '';
                    break;

                case 'customer':
                    const customer = await prisma.customer.findFirst({
                        where: {
                            id: taskData.linkedId,
                            companyId: companyId
                        },
                        select: { name: true }
                    });
                    entityName = customer?.name || '';
                    break;

                case 'deal':
                    if (prisma.deal) {
                        const deal = await prisma.deal.findFirst({
                            where: {
                                id: taskData.linkedId,
                                companyId: companyId
                            },
                            select: { title: true }
                        });
                        entityName = deal?.title || '';
                    }
                    break;
            }

            data.linkedTo = entityName;
        }

        const task = await prisma.task.create({
            data: data,
            include: {
                company: {
                    select: {
                        name: true
                    }
                }
            }
        });
        return task;
    } catch (error) {
        throw new Error('Failed to create task: ' + error.message);
    }
};

const getAllTasks = async (companyId, filters = {}) => {
    try {
        const where = {
            companyId
        };

        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date(todayStart);
        todayEnd.setDate(todayEnd.getDate() + 1);

        // Handle Status Filter
        if (filters.status && filters.status !== 'All' && filters.status !== 'all') {
            if (filters.status === 'today') {
                where.dueDate = {
                    gte: todayStart,
                    lt: todayEnd
                };
            } else if (filters.status === 'overdue') {
                where.status = 'Pending';
                where.dueDate = {
                    lt: todayStart
                };
            } else if (filters.status === 'pending') {
                where.status = 'Pending';
            } else if (filters.status === 'completed') {
                where.status = 'Completed';
            } else {
                // Exact match for other statuses (Capitalized versions)
                where.status = filters.status.charAt(0).toUpperCase() + filters.status.slice(1);
            }
        }

        if (filters.priority && filters.priority !== 'All' && filters.priority !== 'all') {
            where.priority = filters.priority.charAt(0).toUpperCase() + filters.priority.slice(1);
        }

        if (filters.type && filters.type !== 'All' && filters.type !== 'all') {
            where.type = filters.type.charAt(0).toUpperCase() + filters.type.slice(1);
        }

        if (filters.assignedTo && filters.assignedTo !== 'All' && filters.assignedTo !== 'all') {
            where.assignedTo = filters.assignedTo;
        }

        if (filters.linkedId && filters.linkedId !== 'All' && filters.linkedId !== 'all') {
            where.linkedId = filters.linkedId;
        }

        if (filters.linkedType && filters.linkedType !== 'All' && filters.linkedType !== 'all') {
            where.linkedType = filters.linkedType;
        }

        // Search functionality
        if (filters.search && filters.search.trim() !== "") {
            where.OR = [
                { title: { contains: filters.search, mode: 'insensitive' } },
                { linkedTo: { contains: filters.search, mode: 'insensitive' } },
                { notes: { contains: filters.search, mode: 'insensitive' } },
                { assignedTo: { contains: filters.search, mode: 'insensitive' } }
            ];
        }

        // Pagination
        const page = Math.max(1, parseInt(filters.page) || 1);
        const limit = Math.max(1, parseInt(filters.limit) || 50);
        const skip = (page - 1) * limit;

        const [tasks, total] = await Promise.all([
            prisma.task.findMany({
                where,
                skip,
                take: limit,
                orderBy: [
                    { dueDate: 'asc' },
                    { createdAt: 'desc' }
                ]
            }),
            prisma.task.count({ where })
        ]);

        return {
            tasks,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit)
            }
        };
    } catch (error) {
        throw new Error('Failed to fetch tasks: ' + error.message);
    }
};

const getTaskById = async (id, companyId) => {
    try {
        const task = await prisma.task.findFirst({
            where: {
                id,
                companyId
            }
        });

        if (!task) {
            throw new Error('Task not found');
        }

        return task;
    } catch (error) {
        throw new Error('Failed to fetch task: ' + error.message);
    }
};

const updateTask = async (id, updateData, companyId) => {
    try {
        // Check if task exists and belongs to company
        const existingTask = await prisma.task.findFirst({
            where: {
                id,
                companyId
            }
        });

        if (!existingTask) {
            throw new Error('Task not found');
        }

        const updatePayload = { ...updateData };

        // Update linkedTo name if linkedId changes
        if (updateData.linkedId && updateData.linkedId !== existingTask.linkedId) {
            let entityName = '';

            switch (updateData.linkedType || existingTask.linkedType) {
                case 'Lead':
                    const lead = await prisma.lead.findFirst({
                        where: {
                            id: updateData.linkedId,
                            companyId: companyId
                        },
                        select: { name: true }
                    });
                    entityName = lead?.name || '';
                    break;

                case 'Customer':
                    const customer = await prisma.customer.findFirst({
                        where: {
                            id: updateData.linkedId,
                            companyId: companyId
                        },
                        select: { name: true }
                    });
                    entityName = customer?.name || '';
                    break;

                case 'Deal':
                    if (prisma.deal) {
                        const deal = await prisma.deal.findFirst({
                            where: {
                                id: updateData.linkedId,
                                companyId: companyId
                            },
                            select: { title: true }
                        });
                        entityName = deal?.title || '';
                    }
                    break;
            }

            updatePayload.linkedTo = entityName;
        }

        if (updateData.dueDate) {
            updatePayload.dueDate = new Date(updateData.dueDate);
        }

        const task = await prisma.task.update({
            where: {
                id
            },
            data: updatePayload
        });

        return task;
    } catch (error) {
        throw new Error('Failed to update task: ' + error.message);
    }
};

const deleteTask = async (id, companyId) => {
    try {
        // Check if task exists and belongs to company
        const existingTask = await prisma.task.findFirst({
            where: {
                id,
                companyId
            }
        });

        if (!existingTask) {
            throw new Error('Task not found');
        }

        await prisma.task.delete({
            where: {
                id
            }
        });
    } catch (error) {
        throw new Error('Failed to delete task: ' + error.message);
    }
};

const getTaskStats = async (companyId, filters = {}) => {
    try {
        const baseWhere = { companyId };

        if (filters.assignedTo && filters.assignedTo !== 'All' && filters.assignedTo !== 'all') {
            baseWhere.assignedTo = filters.assignedTo;
        }
        if (filters.linkedId && filters.linkedId !== 'All' && filters.linkedId !== 'all') {
            baseWhere.linkedId = filters.linkedId;
        }
        if (filters.linkedType && filters.linkedType !== 'All' && filters.linkedType !== 'all') {
            baseWhere.linkedType = filters.linkedType;
        }

        const total = await prisma.task.count({ where: baseWhere });

        const pending = await prisma.task.count({
            where: { ...baseWhere, status: 'Pending' }
        });

        const completed = await prisma.task.count({
            where: { ...baseWhere, status: 'Completed' }
        });

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        const todayCount = await prisma.task.count({
            where: {
                ...baseWhere,
                dueDate: { gte: today, lt: tomorrow }
            }
        });

        const overdueCount = await prisma.task.count({
            where: {
                ...baseWhere,
                status: 'Pending',
                dueDate: { lt: today }
            }
        });

        const highPriority = await prisma.task.count({
            where: {
                ...baseWhere,
                priority: 'High',
                status: 'Pending'
            }
        });

        return {
            total,
            pending,
            completed,
            today: todayCount,
            overdue: overdueCount,
            highPriority
        };
    } catch (error) {
        throw new Error('Failed to fetch task stats: ' + error.message);
    }
};

// Get filter options for dropdowns
const getFilterOptions = async (companyId) => {
    try {
        const employeesList = await prisma.user.findMany({
            where: { companyId },
            select: { fullName: true },
            orderBy: { fullName: 'asc' }
        });

        const statusList = ['Pending', 'Completed'];
        const priorityList = ['High', 'Medium', 'Low'];
        const typeList = ['Call', 'Meeting', 'Email', 'WhatsApp'];
        const linkedTypeList = ['Lead', 'Customer', 'Deal'];

        const leadsList = await prisma.lead.findMany({
            where: { companyId },
            select: { id: true, name: true, status: true },
            orderBy: [{ status: 'asc' }, { name: 'asc' }]
        });

        return {
            assignedTo: employeesList.map(item => item.fullName),
            status: statusList,
            priority: priorityList,
            type: typeList,
            linkedType: linkedTypeList,
            leads: leadsList.map(l => ({ id: l.id, name: l.name, category: l.status }))
        };
    } catch (error) {
        throw new Error('Failed to fetch filter options: ' + error.message);
    }
};

// Get entities for dropdown (leads, customers, deals)
const getEntities = async (companyId, entityType) => {
    try {
        if (!entityType) return [];
        switch (entityType.toLowerCase()) {
            case 'lead':
                const leads = await prisma.lead.findMany({
                    where: { companyId },
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        source: true,
                        status: true
                    },
                    orderBy: { name: 'asc' }
                });
                return leads.map(lead => ({
                    id: lead.id,
                    name: `${lead.name} [${lead.source}] - ${lead.email || 'No Email'}`,
                    category: lead.status
                }));

            case 'customer':
                const customers = await prisma.customer.findMany({
                    where: { companyId },
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        city: true,
                        type: true
                    },
                    orderBy: { name: 'asc' }
                });
                return customers.map(customer => ({
                    id: customer.id,
                    name: `${customer.name} [${customer.city || 'No City'}] - ${customer.email}`,
                    category: customer.type
                }));

            case 'deal':
                if (!prisma.deal) return [];
                const deals = await prisma.deal.findMany({
                    where: { companyId },
                    select: {
                        id: true,
                        title: true,
                        amount: true
                    },
                    orderBy: { title: 'asc' }
                });
                return deals.map(deal => ({
                    id: deal.id,
                    name: `${deal.title} ($${deal.amount})`
                }));

            default:
                return [];
        }
    } catch (error) {
        throw new Error('Failed to fetch entities: ' + error.message);
    }
};

module.exports = {
    createTask,
    getAllTasks,
    getTaskById,
    updateTask,
    deleteTask,
    getTaskStats,
    getFilterOptions,
    getEntities
};