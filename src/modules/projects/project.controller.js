const projectService = require('./project.service');

class ProjectController {
    async createProject(req, res) {
        try {
            const projectData = req.body;
            const companyId = req.user.companyId;

            if (!projectData.name || !projectData.dealId) {
                return res.status(400).json({
                    success: false,
                    message: 'Missing required fields: name and dealId are required',
                });
            }

            const project = await projectService.createProject(projectData, companyId);
            return res.status(201).json({
                success: true,
                message: 'Project created successfully',
                data: project,
            });
        } catch (error) {
            console.error('Error in createProject:', error);
            return res.status(500).json({
                success: false,
                message: error.message || 'Error creating project',
            });
        }
    }

    async getAllProjects(req, res) {
        try {
            const companyId = req.user.companyId;
            const filters = {
                search: req.query.search,
                status: req.query.status,
                page: req.query.page,
                limit: req.query.limit,
            };

            const projects = await projectService.getAllProjects(companyId, filters);
            return res.status(200).json({
                success: true,
                message: 'Projects fetched successfully',
                ...projects,
            });
        } catch (error) {
            console.error('Error in getAllProjects:', error);
            return res.status(500).json({
                success: false,
                message: error.message || 'Error fetching projects',
            });
        }
    }

    async getProjectById(req, res) {
        try {
            const { id } = req.params;
            const companyId = req.user.companyId;

            const project = await projectService.getProjectById(id, companyId);
            return res.status(200).json({
                success: true,
                message: 'Project fetched successfully',
                data: project,
            });
        } catch (error) {
            console.error('Error in getProjectById:', error);
            return res.status(error.message === 'Project not found' ? 404 : 500).json({
                success: false,
                message: error.message || 'Error fetching project',
            });
        }
    }

    async updateProject(req, res) {
        try {
            const { id } = req.params;
            const projectData = req.body;
            const companyId = req.user.companyId;

            const updatedProject = await projectService.updateProject(id, projectData, companyId);
            return res.status(200).json({
                success: true,
                message: 'Project updated successfully',
                data: updatedProject,
            });
        } catch (error) {
            console.error('Error in updateProject:', error);
            return res.status(error.message === 'Project not found' ? 404 : 500).json({
                success: false,
                message: error.message || 'Error updating project',
            });
        }
    }

    async deleteProject(req, res) {
        try {
            const { id } = req.params;
            const companyId = req.user.companyId;

            const result = await projectService.deleteProject(id, companyId);
            return res.status(200).json({
                success: true,
                message: result.message,
            });
        } catch (error) {
            console.error('Error in deleteProject:', error);
            return res.status(error.message === 'Project not found' ? 404 : 500).json({
                success: false,
                message: error.message || 'Error deleting project',
            });
        }
    }

    async acknowledgeProject(req, res) {
        try {
            const { id } = req.params;
            const companyId = req.user.companyId;

            const updatedProject = await projectService.acknowledgeProject(id, companyId);
            return res.status(200).json({
                success: true,
                message: 'Project acknowledged successfully',
                data: updatedProject,
            });
        } catch (error) {
            console.error('Error in acknowledgeProject:', error);
            return res.status(error.message === 'Project not found' ? 404 : 500).json({
                success: false,
                message: error.message || 'Error acknowledging project',
            });
        }
    }

    async assignPM(req, res) {
        try {
            const { id } = req.params;
            const { pmAssignedId } = req.body;
            const companyId = req.user.companyId;

            if (!pmAssignedId) {
                return res.status(400).json({
                    success: false,
                    message: 'Missing required field: pmAssignedId',
                });
            }

            const updatedProject = await projectService.assignPM(id, pmAssignedId, companyId);
            return res.status(200).json({
                success: true,
                message: 'PM assigned successfully',
                data: updatedProject,
            });
        } catch (error) {
            console.error('Error in assignPM:', error);
            return res.status(error.message === 'Project not found' ? 404 : 500).json({
                success: false,
                message: error.message || 'Error assigning PM',
            });
        }
    }

    async saveProjectPlan(req, res) {
        try {
            const { id } = req.params;
            const companyId = req.user.companyId;
            const planData = req.body;

            const updatedProject = await projectService.saveProjectPlan(id, planData, companyId);
            return res.status(200).json({
                success: true,
                message: 'Project plan saved successfully',
                data: updatedProject,
            });
        } catch (error) {
            console.error('Error in saveProjectPlan:', error);
            return res.status(error.message === 'Project not found' ? 404 : 500).json({
                success: false,
                message: error.message || 'Error saving project plan',
            });
        }
    }

    async lockProjectPlan(req, res) {
        try {
            const { id } = req.params;
            const companyId = req.user.companyId;
            const userRole = req.user.role;

            // Only Tech Lead (TL), Admin, or HOD can lock/approve
            const authorizedRoles = ['company_admin', 'head_of_department', 'team_leader'];
            if (!authorizedRoles.includes(userRole)) {
                return res.status(403).json({
                    success: false,
                    message: 'Forbidden: Tech Lead or Admin approval required to lock plan',
                });
            }

            const updatedProject = await projectService.lockProjectPlan(id, companyId);
            return res.status(200).json({
                success: true,
                message: 'Project plan locked and approved successfully',
                data: updatedProject,
            });
        } catch (error) {
            console.error('Error in lockProjectPlan:', error);
            return res.status(error.message === 'Project not found' ? 404 : 500).json({
                success: false,
                message: error.message || 'Error locking project plan',
            });
        }
    }

    async getTechDashboardStats(req, res) {
        try {
            const companyId = req.user.companyId;
            const stats = await projectService.getTechDashboardStats(companyId);
            return res.status(200).json({
                success: true,
                message: 'Tech dashboard stats fetched successfully',
                data: stats,
            });
        } catch (error) {
            console.error('Error in getTechDashboardStats:', error);
            return res.status(500).json({
                success: false,
                message: error.message || 'Error fetching tech dashboard stats',
            });
        }
    }
}

module.exports = new ProjectController();
