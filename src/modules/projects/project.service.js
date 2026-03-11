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
                ...(status && status !== 'Pending Activation' && { status }),
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
            if (!status || status === 'Pending Activation' || status === 'All') {
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
            }

            // 3. Fetch 'Won' leads that don't have deals yet
            let wonLeads = [];
            if (!status || status === 'Pending Activation' || status === 'All') {
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

            // 4. Normalize and Combine
            const normalizedProjects = projects.map(p => ({
                id: p.id,
                projectId: p.projectId,
                name: p.name,
                status: p.status,
                techLeadAcknowledge: p.techLeadAcknowledge,
                acknowledgedAt: p.acknowledgedAt,
                escalatedToHead: p.escalatedToHead,
                pmAssignedId: p.pmAssignedId,
                pm: p.pm,
                createdAt: p.createdAt,
                updatedAt: p.updatedAt,
                deal: {
                    ...p.deal,
                    currency: (p.deal?.customer?.lead?.currency || 'USD').toUpperCase()
                }
            }));

            const normalizedPendingDeals = pendingDeals.map(d => ({
                id: `deal-${d.id}`,
                projectId: 'PENDING',
                name: `Project: ${d.title}`,
                status: 'Pending Activation',
                updatedAt: d.updatedAt,
                deal: {
                    id: d.id,
                    title: d.title,
                    value: d.value,
                    currency: (d.customer?.lead?.currency || 'USD').toUpperCase(),
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
                status: 'Pending Activation',
                updatedAt: l.updatedAt,
                deal: {
                    id: null,
                    title: l.name,
                    value: l.value || 0,
                    currency: (l.currency || 'USD').toUpperCase(),
                    customer: l.customer || { id: null, name: l.name },
                    salesperson: l.salesperson,
                    email: l.email || 'N/A',
                    phone: l.phone || 'N/A',
                    source: l.source || 'N/A',
                    notes: l.notes || 'No notes provided'
                }
            }));

            let combined = [...normalizedProjects, ...normalizedPendingDeals, ...normalizedWonLeads];

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

                // Return normalized virtual project
                return {
                    id: `lead-${lead.id}`,
                    projectId: 'PENDING',
                    name: `Project: ${lead.name}`,
                    status: 'Pending Activation',
                    updatedAt: lead.updatedAt,
                    createdAt: lead.createdAt,
                    techLeadAcknowledge: false,
                    deal: {
                        id: null,
                        title: lead.name,
                        value: lead.value || 0,
                        currency: (lead.currency || 'USD').toUpperCase(),
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
                        documents: true
                    }
                });

                if (!deal) throw new Error('Deal not found');

                // Return normalized virtual project
                return {
                    id: `deal-${deal.id}`,
                    projectId: 'PENDING',
                    name: `Project: ${deal.title}`,
                    status: 'Pending Activation',
                    updatedAt: deal.updatedAt,
                    createdAt: deal.createdAt,
                    techLeadAcknowledge: false,
                    deal: {
                        ...deal,
                        currency: (deal.customer?.lead?.currency || 'USD').toUpperCase(),
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

            return project;
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

            const existingProject = await prisma.project.findUnique({
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
            const { milestones } = planData;

            // Use a transaction to update milestones and tasks
            await prisma.$transaction(async (tx) => {
                // 1. Delete existing milestones and tasks for this project (re-sync approach)
                await tx.projectMilestone.deleteMany({
                    where: { projectId: projectId }
                });

                // 2. Create new milestones and tasks
                for (const m of milestones) {
                    await tx.projectMilestone.create({
                        data: {
                            projectId: projectId,
                            title: m.title,
                            description: m.description,
                            deadline: new Date(m.deadline),
                            status: m.status || 'Pending',
                            tasks: {
                                create: (m.tasks || []).map(t => ({
                                    title: t.title,
                                    description: t.description,
                                    deadline: new Date(t.deadline),
                                    status: t.status || 'Pending',
                                    priority: t.priority || 'Medium',
                                    assignedToId: t.assignedToId
                                }))
                            }
                        }
                    });
                }
            });

            return this.getProjectById(projectId, companyId);
        } catch (error) {
            throw new Error(`Error saving project plan: ${error.message}`);
        }
    }

    async lockProjectPlan(projectId, companyId) {
        try {
            const updatedProject = await prisma.project.update({
                where: { id: projectId },
                data: {
                    planLocked: true,
                    status: 'Active' // Transition to Active phase once plan is locked
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
}

module.exports = new ProjectService();
