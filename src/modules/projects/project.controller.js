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
}

module.exports = new ProjectController();
