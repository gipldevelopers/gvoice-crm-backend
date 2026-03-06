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

            const where = {
                companyId: companyId,
                ...(status && { status }),
                ...(search && {
                    OR: [
                        { name: { contains: search, mode: 'insensitive' } },
                        { projectId: { contains: search, mode: 'insensitive' } },
                        { deal: { title: { contains: search, mode: 'insensitive' } } },
                        { deal: { customer: { name: { contains: search, mode: 'insensitive' } } } }
                    ],
                }),
            };

            const [projects, total] = await Promise.all([
                prisma.project.findMany({
                    where,
                    include: {
                        deal: {
                            select: {
                                id: true,
                                title: true,
                                value: true,
                                customer: {
                                    select: {
                                        id: true,
                                        name: true
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
                    skip: (page - 1) * limit,
                    take: limit,
                }),
                prisma.project.count({ where }),
            ]);

            return {
                projects,
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
