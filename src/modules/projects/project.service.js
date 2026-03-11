const prisma = require('../../database/prisma');

class ProjectService {
    async createProject(projectData, companyId) {
        try {
            const tempProjectId = `PRJ-${Date.now().toString().slice(-6)}`;
            const project = await prisma.project.create({
                data: {
                    projectId: projectData.projectId || tempProjectId,
                    name: projectData.name,
                    dealId: projectData.dealId,
                    companyId: companyId,
                    status: projectData.status || 'Active'
                },
                include: {
                    deal: {
                        include: {
                            customer: true,
                            salesperson: true
                        }
                    }
                }
            });

            // Update deal to mark project as generated
            await prisma.deal.update({
                where: { id: projectData.dealId },
                data: { projectGenerated: true }
            });

            return project;
        } catch (error) {
            throw new Error(`Error creating project: ${error.message}`);
        }
    }

    async getAllProjects(companyId, filters = {}) {
        try {
            const { search, status, page = 1, limit = 10 } = filters;

            // 1. Fetch Existing Projects
            const projectWhere = {
                companyId: companyId,
                ...(status && status !== 'Planning Phase' && { status }),
                ...(search && {
                    OR: [
                        { name: { contains: search, mode: 'insensitive' } },
                        { projectId: { contains: search, mode: 'insensitive' } },
                        { deal: { title: { contains: search, mode: 'insensitive' } } },
                        { deal: { customer: { name: { contains: search, mode: 'insensitive' } } } }
                    ],
                }),
            };

            const projects = await prisma.project.findMany({
                where: projectWhere,
                include: {
                    milestones: {
                        include: { tasks: { select: { status: true } } }
                    },
                    deal: {
                        include: {
                            customer: {
                                include: {
                                    lead: {
                                        select: { currency: true }
                                    }
                                }
                            },
                            salesperson: {
                                select: {
                                    id: true,
                                    fullName: true
                                }
                            }
                        }
                    },
                    pm: {
                        select: {
                            id: true,
                            fullName: true,
                            email: true
                        }
                    }
                },
                orderBy: { updatedAt: 'desc' },
            });

            // 2. Fetch 'Won' deals that don't have projects yet
            let pendingDeals = [];
            if (!status || status === 'Planning Phase' || status === 'All') {
                const dealWhere = {
                    companyId: companyId,
                    stage: 'Won',
                    projectGenerated: false,
                    ...(search && {
                        OR: [
                            { title: { contains: search, mode: 'insensitive' } },
                            { customer: { name: { contains: search, mode: 'insensitive' } } }
                        ],
                    }),
                };

                pendingDeals = await prisma.deal.findMany({
                    where: dealWhere,
                    include: {
                        customer: {
                            select: {
                                id: true,
                                name: true,
                                lead: {
                                    select: { currency: true }
                                }
                            }
                        },
                        salesperson: {
                            select: {
                                id: true,
                                fullName: true
                            }
                        }
                    },
                    orderBy: { updatedAt: 'desc' },
                });

                // Extra safety: Filter out any deals that already have a project in the DB
                // but for some reason projectGenerated is still false
                const realProjectDealIds = new Set(projects.map(p => p.dealId));
                pendingDeals = pendingDeals.filter(d => !realProjectDealIds.has(d.id));
            }

            // 3. Fetch 'Won' leads that don't have deals yet
            let wonLeads = [];
            if (!status || status === 'Planning Phase' || status === 'All') {
                wonLeads = await prisma.lead.findMany({
                    where: {
                        companyId: companyId,
                        status: 'Won',
                        ...(search && {
                            OR: [
                                { name: { contains: search, mode: 'insensitive' } },
                                { email: { contains: search, mode: 'insensitive' } }
                            ],
                        }),
                        // Only get leads that don't have a deal through their customer link
                        OR: [
                            { customer: { is: null } },
                            {
                                customer: {
                                    deals: {
                                        none: {}
                                    }
                                }
                            }
                        ]
                    },
                    include: {
                        salesperson: {
                            select: {
                                id: true,
                                fullName: true
                            }
                        },
                        customer: {
                            select: {
                                id: true,
                                name: true
                            }
                        }
                    },
                    orderBy: { updatedAt: 'desc' },
                });
            }

            // 4. Normalize
            const normalizedProjects = projects.map(p => {
                const allTasks = p.milestones?.flatMap(m => m.tasks) || [];
                const totalTasks = allTasks.length;
                const completedTasks = allTasks.filter(t => t.status === 'Completed').length;

                return {
                    id: p.id,
                    projectId: p.projectId,
                    name: p.name,
                    status: p.status === 'Pending Activation' ? 'Planning Phase' : p.status,
                    techLeadAcknowledge: p.techLeadAcknowledge,
                    acknowledgedAt: p.acknowledgedAt,
                    escalatedToHead: p.escalatedToHead,
                    pmAssignedId: p.pmAssignedId,
                    pm: p.pm,
                    totalTasks,
                    completedTasks,
                    createdAt: p.createdAt,
                    updatedAt: p.updatedAt,
                    deal: {
                        ...p.deal,
                        currency: (p.deal?.customer?.lead?.currency || '').toUpperCase()
                    }
                };
            });

            const normalizedPendingDeals = pendingDeals.map(d => ({
                id: `deal-${d.id}`,
                projectId: 'PENDING',
                name: `Project: ${d.title}`,
                status: 'Planning Phase',
                updatedAt: d.updatedAt,
                deal: {
                    id: d.id,
                    title: d.title,
                    value: d.value,
                    currency: (d.customer?.lead?.currency || '').toUpperCase(),
                    customer: d.customer,
                    salesperson: d.salesperson,
                    // Additional lead-like info if available from the deal's origin
                    email: d.customer?.email || 'N/A',
                    phone: d.customer?.phone || 'N/A',
                    source: 'Operational Deal',
                    notes: d.notes || 'No notes provided'
                }
            }));

            const normalizedWonLeads = wonLeads.map(l => ({
                id: `lead-${l.id}`,
                projectId: 'PENDING',
                name: `Project: ${l.name}`,
                status: 'Planning Phase',
                updatedAt: l.updatedAt,
                deal: {
                    id: null,
                    title: l.name,
                    value: l.value || 0,
                    currency: (l.currency || '').toUpperCase(),
                    customer: l.customer || { id: null, name: l.name },
                    salesperson: l.salesperson,
                    email: l.email || 'N/A',
                    phone: l.phone || 'N/A',
                    source: l.source || 'N/A',
                    notes: l.notes || 'No notes provided'
                }
            }));

            // 5. Intelligent Deduplication
            // Filter wonLeads: exclude if we already have a Deal or Project for this lead/customer
            const existingCustomerIds = new Set([
                ...normalizedProjects.map(p => p.deal?.customerId).filter(Boolean),
                ...normalizedPendingDeals.map(d => d.deal?.customer?.id).filter(Boolean)
            ]);

            const existingNames = new Set([
                ...normalizedProjects.map(p => p.name.replace('Project: ', '').toLowerCase()),
                ...normalizedPendingDeals.map(d => d.name.replace('Project: ', '').toLowerCase())
            ]);

            const dedupedWonLeads = normalizedWonLeads.filter(l => {
                // Remove if customer already has a deal/project
                if (l.deal.customer?.id && existingCustomerIds.has(l.deal.customer.id)) return false;

                // Remove if the project name (usually from lead name) is already present
                const leadName = l.name.replace('Project: ', '').toLowerCase();
                if (existingNames.has(leadName)) return false;

                return true;
            });

            let combined = [...normalizedProjects, ...normalizedPendingDeals, ...dedupedWonLeads];

            // Sort by updatedAt desc
            combined.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

            // Apply manual pagination
            const total = combined.length;
            const startIndex = (page - 1) * limit;
            const paginatedItems = combined.slice(startIndex, startIndex + parseInt(limit));

            return {
                projects: paginatedItems,
                pagination: {
                    total,
                    page: parseInt(page),
                    limit: parseInt(limit),
                    totalPages: Math.ceil(total / limit),
                },
            };
        } catch (error) {
            throw new Error(`Error fetching projects: ${error.message}`);
        }
    }

    async getProjectById(projectId, companyId) {
        try {
            const normalizePath = (doc) => {
                if (!doc || !doc.path) return doc;
                let relativePath = doc.path;
                const uploadsIndex = relativePath.indexOf('/uploads/');
                if (uploadsIndex !== -1) {
                    relativePath = relativePath.substring(uploadsIndex);
                }
                return { ...doc, path: relativePath };
            };

            // Case 1: Virtual Lead Project
            if (projectId.startsWith('lead-')) {
                const leadId = projectId.replace('lead-', '');
                const lead = await prisma.lead.findFirst({
                    where: { id: leadId, companyId },
                    include: {
                        salesperson: { select: { id: true, fullName: true, email: true } },
                        customer: { select: { id: true, name: true } },
                        documents: true
                    }
                });

                if (!lead) throw new Error('Lead not found');

                // Check if a real project already exists for this lead (via customer/deal)
                const existingProject = await prisma.project.findFirst({
                    where: { deal: { customer: { leadId: leadId } } },
                    include: { deal: true }
                });

                if (existingProject) {
                    return this.getProjectById(existingProject.id, companyId);
                }

                // Return normalized virtual project
                return {
                    id: `lead-${lead.id}`,
                    projectId: 'PENDING',
                    name: `Project: ${lead.name}`,
                    status: 'Planning Phase',
                    updatedAt: lead.updatedAt,
                    createdAt: lead.createdAt,
                    techLeadAcknowledge: false,
                    deal: {
                        id: null,
                        title: lead.name,
                        value: lead.value || 0,
                        currency: (lead.currency || '').toUpperCase(),
                        customer: lead.customer || { id: null, name: lead.name, lead: { documents: (lead.documents || []).map(normalizePath) } },
                        salesperson: lead.salesperson,
                        email: lead.email || 'N/A',
                        phone: lead.phone || 'N/A',
                        source: lead.source || 'N/A',
                        notes: lead.notes || 'No notes provided',
                        documents: [] // Leads don't have deal-specific docs yet
                    }
                };
            }

            // Case 2: Virtual Deal Project
            if (projectId.startsWith('deal-')) {
                const dealId = projectId.replace('deal-', '');
                const deal = await prisma.deal.findFirst({
                    where: { id: dealId, companyId },
                    include: {
                        customer: {
                            include: {
                                lead: { include: { documents: true } }
                            }
                        },
                        salesperson: { select: { id: true, fullName: true, email: true } },
                        documents: true,
                        project: { select: { id: true } }
                    }
                });

                if (!deal) throw new Error('Deal not found');

                if (deal.project) {
                    return this.getProjectById(deal.project.id, companyId);
                }

                // Return normalized virtual project
                return {
                    id: `deal-${deal.id}`,
                    projectId: 'PENDING',
                    name: `Project: ${deal.title}`,
                    status: 'Planning Phase',
                    updatedAt: deal.updatedAt,
                    createdAt: deal.createdAt,
                    techLeadAcknowledge: false,
                    deal: {
                        ...deal,
                        currency: (deal.customer?.lead?.currency || '').toUpperCase(),
                        customer: {
                            ...deal.customer,
                            lead: {
                                ...deal.customer?.lead,
                                documents: (deal.customer?.lead?.documents || []).map(normalizePath)
                            }
                        },
                        documents: (deal.documents || []).map(normalizePath)
                    }
                };
            }

            // Case 3: Real Project
            const project = await prisma.project.findFirst({
                where: {
                    id: projectId,
                    companyId: companyId,
                },
                include: {
                    deal: {
                        include: {
                            customer: {
                                include: {
                                    lead: {
                                        include: {
                                            documents: true
                                        }
                                    }
                                }
                            },
                            salesperson: true,
                            documents: true
                        }
                    },
                    pm: {
                        select: {
                            id: true,
                            fullName: true,
                            email: true
                        }
                    },
                    milestones: {
                        include: {
                            tasks: {
                                include: {
                                    assignedTo: {
                                        select: { id: true, fullName: true, email: true }
                                    }
                                }
                            }
                        },
                        orderBy: { deadline: 'asc' }
                    }
                },
            });

            if (!project) throw new Error('Project not found');

            // Normalize lead documents
            if (project.deal?.customer?.lead?.documents) {
                project.deal.customer.lead.documents = project.deal.customer.lead.documents.map(normalizePath);
            }

            // Normalize deal documents
            if (project.deal?.documents) {
                project.deal.documents = project.deal.documents.map(normalizePath);
            }

            if (project.deal?.customer?.lead) {
                project.deal.currency = (project.deal.customer.lead.currency || '').toUpperCase();
            }

            // Calculate Planning TAT (48 Hours)
            if (project.planningStartTime && !project.planLocked) {
                const planningStart = new Date(project.planningStartTime);
                const now = new Date();
                const hoursPlanning = (now - planningStart) / (1000 * 60 * 60);
                project.planningEscalated = hoursPlanning > 48;
                project.planningHoursRemaining = Math.max(0, 48 - hoursPlanning);
            }

            return {
                ...project,
                status: project.status === 'Pending Activation' ? 'Planning Phase' : project.status
            };
        } catch (error) {
            throw new Error(`Error fetching project: ${error.message}`);
        }
    }

    async updateProject(projectId, projectData, companyId) {
        try {
            const existingProject = await prisma.project.findFirst({
                where: {
                    id: projectId,
                    companyId: companyId,
                },
            });

            if (!existingProject) throw new Error('Project not found');

            const updatedProject = await prisma.project.update({
                where: { id: projectId },
                data: {
                    ...(projectData.name && { name: projectData.name }),
                    ...(projectData.status && { status: projectData.status })
                },
                include: {
                    deal: {
                        include: {
                            customer: true,
                            salesperson: true
                        }
                    },
                    pm: {
                        select: {
                            id: true,
                            fullName: true,
                            email: true
                        }
                    }
                }
            });

            return updatedProject;
        } catch (error) {
            throw new Error(`Error updating project: ${error.message}`);
        }
    }

    async acknowledgeProject(projectId, companyId) {
        try {
            let realProjectId = projectId;

            // Handle Virtual IDs by creating the project on-the-fly
            if (projectId.startsWith('lead-') || projectId.startsWith('deal-')) {
                const virtualProject = await this.getProjectById(projectId, companyId);
                let actualDealId = virtualProject.deal?.id;

                // If it's a lead without a deal, we might need to create a deal first
                // or assume one will be created. Projects require dealId.
                if (projectId.startsWith('lead-') && !actualDealId) {
                    const leadId = projectId.replace('lead-', '');
                    // Create minimal deal to satisfy relations
                    const deal = await prisma.deal.create({
                        data: {
                            title: virtualProject.deal.title,
                            value: virtualProject.deal.value,
                            stage: 'Won',
                            complianceStatus: 'APPROVED',
                            companyId: companyId,
                            customerId: virtualProject.deal.customer?.id,
                            salespersonId: virtualProject.deal.salesperson?.id,
                            department: 'tech'
                        }
                    });
                    actualDealId = deal.id;
                } else if (projectId.startsWith('deal-')) {
                    actualDealId = projectId.replace('deal-', '');
                }

                // Check if project already exists for this deal (double-click safety)
                const existingReal = await prisma.project.findUnique({
                    where: { dealId: actualDealId }
                });

                if (existingReal) {
                    realProjectId = existingReal.id;
                    // Fix in-case flag was desynced
                    await prisma.deal.update({
                        where: { id: actualDealId },
                        data: { projectGenerated: true }
                    });
                } else {
                    const tempId = `PRJ-${Date.now().toString().slice(-6)}`;
                    const newProj = await prisma.project.create({
                        data: {
                            projectId: tempId,
                            name: virtualProject.name,
                            dealId: actualDealId,
                            companyId: companyId,
                            status: 'Active'
                        }
                    });
                    realProjectId = newProj.id;

                    // Mark deal as project generated
                    await prisma.deal.update({
                        where: { id: actualDealId },
                        data: { projectGenerated: true }
                    });
                }
            }

            const existingProject = await prisma.project.findUnique({
                where: { id: realProjectId },
            });

            if (!existingProject) throw new Error('Project record creation failed or not found');

            const now = new Date();
            const createdAt = new Date(existingProject.createdAt);
            const hoursDiff = (now - createdAt) / (1000 * 60 * 60);

            const updatedProject = await prisma.project.update({
                where: { id: realProjectId },
                data: {
                    techLeadAcknowledge: true,
                    acknowledgedAt: now,
                    escalatedToHead: hoursDiff > 24
                },
                include: {
                    pm: {
                        select: {
                            id: true,
                            fullName: true,
                            email: true
                        }
                    },
                    deal: {
                        include: {
                            customer: true,
                            salesperson: true
                        }
                    }
                }
            });

            return updatedProject;
        } catch (error) {
            throw new Error(`Error acknowledging project: ${error.message}`);
        }
    }

    async assignPM(projectId, pmAssignedId, companyId) {
        try {
            let realProjectId = projectId;

            // Handle Virtual IDs
            if (projectId.startsWith('lead-') || projectId.startsWith('deal-')) {
                // Ensure project is acknowledged/created first
                const acknowledged = await this.acknowledgeProject(projectId, companyId);
                realProjectId = acknowledged.id;
            }

            const existingProject = await prisma.project.findFirst({
                where: {
                    id: realProjectId,
                    companyId: companyId,
                },
            });

            if (!existingProject) throw new Error('Project not found');

            const updatedProject = await prisma.project.update({
                where: { id: realProjectId },
                data: {
                    pmAssignedId: pmAssignedId,
                    status: 'Planning Phase', // Move to planning phase automatically
                    planningStartTime: new Date()
                },
                include: {
                    pm: {
                        select: {
                            id: true,
                            fullName: true,
                            email: true
                        }
                    },
                    deal: {
                        include: {
                            customer: true,
                            salesperson: true
                        }
                    }
                }
            });

            return updatedProject;
        } catch (error) {
            throw new Error(`Error assigning PM: ${error.message}`);
        }
    }

    async saveProjectPlan(projectId, planData, companyId) {
        try {
            let realProjectId = projectId;

            // Handle Virtual IDs
            if (projectId.startsWith('lead-') || projectId.startsWith('deal-')) {
                const acknowledged = await this.acknowledgeProject(projectId, companyId);
                realProjectId = acknowledged.id;
            }

            const { milestones } = planData;

            // Use a transaction to update milestones and tasks
            await prisma.$transaction(async (tx) => {
                // 1. Delete existing milestones and tasks for this project (re-sync approach)
                await tx.projectMilestone.deleteMany({
                    where: { projectId: realProjectId }
                });

                // 2. Create new milestones and tasks
                for (const m of milestones) {
                    await tx.projectMilestone.create({
                        data: {
                            projectId: realProjectId,
                            title: m.title,
                            description: m.description,
                            deadline: m.deadline ? new Date(m.deadline) : null,
                            status: m.status || 'Pending',
                            tasks: {
                                create: (m.tasks || []).map(t => {
                                    const hasAssignee = !!t.assignedToId;
                                    const assignedAt = hasAssignee ? new Date() : null;
                                    const acceptanceDueAt = hasAssignee
                                        ? new Date(assignedAt.getTime() + 8 * 60 * 60 * 1000) // +8 hours
                                        : null;
                                    return {
                                        title: t.title,
                                        description: t.description,
                                        deliverable: t.deliverable || null,
                                        estimatedHours: t.estimatedHours ? parseFloat(t.estimatedHours) : null,
                                        deadline: t.deadline ? new Date(t.deadline) : null,
                                        status: t.status || 'Pending',
                                        priority: t.priority || 'Medium',
                                        assignedToId: t.assignedToId || null,
                                        assignedAt,
                                        acceptanceDueAt
                                    };
                                })
                            }
                        }
                    });
                }
            });

            return this.getProjectById(realProjectId, companyId);
        } catch (error) {
            throw new Error(`Error saving project plan: ${error.message}`);
        }
    }

    async lockProjectPlan(projectId, companyId) {
        try {
            let realProjectId = projectId;

            // Handle Virtual IDs
            if (projectId.startsWith('lead-') || projectId.startsWith('deal-')) {
                const acknowledged = await this.acknowledgeProject(projectId, companyId);
                realProjectId = acknowledged.id;
            }

            const updatedProject = await prisma.project.update({
                where: { id: realProjectId },
                data: {
                    planLocked: true,
                    status: 'In Progress' // Plan locked → team actively executing
                },
                include: {
                    milestones: {
                        include: { tasks: true }
                    }
                }
            });

            return updatedProject;
        } catch (error) {
            throw new Error(`Error locking project plan: ${error.message}`);
        }
    }

    async deleteProject(projectId, companyId) {
        try {
            const existingProject = await prisma.project.findFirst({
                where: {
                    id: projectId,
                    companyId: companyId,
                },
            });

            if (!existingProject) throw new Error('Project not found');

            await prisma.project.delete({
                where: { id: projectId },
            });

            return { message: 'Project deleted successfully' };
        } catch (error) {
            throw new Error(`Error deleting project: ${error.message}`);
        }
    }

    // ─── STAGE 8: TASK EXECUTION ENGINE ─────────────────────────────────────────

    /**
     * Get all tasks assigned to a specific user across all projects
     */
    async getMyTasks(userId, companyId) {
        try {
            const tasks = await prisma.projectTask.findMany({
                where: {
                    assignedToId: userId,
                    milestone: {
                        project: { companyId }
                    }
                },
                include: {
                    milestone: {
                        include: {
                            project: {
                                select: { id: true, name: true, projectId: true, status: true }
                            }
                        }
                    },
                    assignedTo: { select: { id: true, fullName: true, email: true } }
                },
                orderBy: [
                    { priority: 'asc' },
                    { deadline: 'asc' }
                ]
            });

            // Auto-escalate overdue acceptances
            const now = new Date();
            const tasksWithStatus = tasks.map(task => {
                const isAcceptanceOverdue = task.acceptanceDueAt && !task.acceptedAt && now > new Date(task.acceptanceDueAt);
                return {
                    ...task,
                    isAcceptanceOverdue,
                    hoursUntilAcceptanceDue: task.acceptanceDueAt
                        ? Math.max(0, (new Date(task.acceptanceDueAt) - now) / (1000 * 60 * 60))
                        : null
                };
            });

            return tasksWithStatus;
        } catch (error) {
            throw new Error(`Error fetching tasks: ${error.message}`);
        }
    }

    /**
     * Get all tasks for a project (for PM/TL view)
     */
    async getProjectTasks(projectId, companyId) {
        try {
            const project = await prisma.project.findFirst({
                where: { id: projectId, companyId },
                include: {
                    milestones: {
                        include: {
                            tasks: {
                                include: {
                                    assignedTo: { select: { id: true, fullName: true, email: true } }
                                },
                                orderBy: { createdAt: 'asc' }
                            }
                        },
                        orderBy: { createdAt: 'asc' }
                    }
                }
            });

            if (!project) throw new Error('Project not found');

            const now = new Date();
            // Flatten tasks and enrich with TAT info
            const allTasks = project.milestones.flatMap(m =>
                m.tasks.map(t => ({
                    ...t,
                    milestoneName: m.title,
                    isAcceptanceOverdue: t.acceptanceDueAt && !t.acceptedAt && now > new Date(t.acceptanceDueAt),
                    hoursUntilAcceptanceDue: t.acceptanceDueAt
                        ? Math.max(0, (new Date(t.acceptanceDueAt) - now) / (1000 * 60 * 60))
                        : null
                }))
            );

            return { project, tasks: allTasks };
        } catch (error) {
            throw new Error(`Error fetching project tasks: ${error.message}`);
        }
    }

    /**
     * Accept a task assignment (resets TAT clock)
     */
    async acceptTask(taskId, userId, companyId) {
        try {
            const task = await prisma.projectTask.findFirst({
                where: {
                    id: taskId,
                    assignedToId: userId,
                    milestone: { project: { companyId } }
                }
            });

            if (!task) throw new Error('Task not found or not assigned to you');
            if (task.acceptanceStatus === 'Accepted') throw new Error('Task already accepted');

            const now = new Date();
            return await prisma.projectTask.update({
                where: { id: taskId },
                data: {
                    acceptanceStatus: 'Accepted',
                    acceptedAt: now,
                    status: 'In Progress'
                },
                include: {
                    assignedTo: { select: { id: true, fullName: true } },
                    milestone: { include: { project: { select: { id: true, name: true } } } }
                }
            });
        } catch (error) {
            throw new Error(`Error accepting task: ${error.message}`);
        }
    }

    /**
     * Update task status (In Progress → Completed etc.)
     */
    async updateTaskStatus(taskId, userId, status, companyId) {
        try {
            const validStatuses = ['In Progress', 'Completed', 'On Hold'];
            if (!validStatuses.includes(status)) throw new Error(`Invalid status. Must be one of: ${validStatuses.join(', ')}`);

            const task = await prisma.projectTask.findFirst({
                where: {
                    id: taskId,
                    assignedToId: userId,
                    milestone: { project: { companyId } }
                }
            });

            if (!task) throw new Error('Task not found or not assigned to you');
            if (!task.acceptedAt) throw new Error('You must accept the task before updating its status');

            return await prisma.projectTask.update({
                where: { id: taskId },
                data: { status },
                include: {
                    assignedTo: { select: { id: true, fullName: true } },
                    milestone: { include: { project: { select: { id: true, name: true } } } }
                }
            });
        } catch (error) {
            throw new Error(`Error updating task status: ${error.message}`);
        }
    }

    /**
     * Check and escalate overdue task acceptances (called periodically or on-demand)
     */
    async checkAndEscalateTasks(companyId) {
        try {
            const now = new Date();
            const overdueResult = await prisma.projectTask.updateMany({
                where: {
                    acceptanceDueAt: { lt: now },
                    acceptedAt: null,
                    acceptanceStatus: { not: 'Escalated' },
                    milestone: { project: { companyId } }
                },
                data: {
                    acceptanceStatus: 'Escalated',
                    escalatedAt: now,
                    status: 'Escalated'
                }
            });

            return { escalated: overdueResult.count };
        } catch (error) {
            throw new Error(`Error checking escalations: ${error.message}`);
        }
    }
}

module.exports = new ProjectService();
