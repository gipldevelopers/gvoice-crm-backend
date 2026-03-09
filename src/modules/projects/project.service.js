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
            const project = await prisma.project.findFirst({
                where: {
                    id: projectId,
                    companyId: companyId,
                },
                include: {
                    deal: {
                        include: {
                            customer: true,
                            salesperson: true
                        }
                    }
                },
            });

            if (!project) throw new Error('Project not found');
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
                    }
                }
            });

            return updatedProject;
        } catch (error) {
            throw new Error(`Error updating project: ${error.message}`);
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
