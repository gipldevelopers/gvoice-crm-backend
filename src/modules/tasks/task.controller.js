const taskService = require('./task.services');


const createTask = async (req, res, next) => {
    try {
        const task = await taskService.createTask(req.body, req.user.companyId);
        res.status(201).json({
            success: true,
            message: 'Task created successfully',
            data: task
        });
    } catch (error) {
        error.status = 400;
        next(error);
    }
};

const getAllTasks = async (req, res, next) => {
    try {
        const {
            search,
            status,
            priority,
            type,
            linkedType,
            linkedId,
            assignedTo,
            dueDateFrom,
            dueDateTo,
            page = 1,
            limit = 50
        } = req.query;

        const result = await taskService.getAllTasks(req.user.companyId, {
            search,
            status,
            priority,
            type,
            linkedType,
            linkedId,
            assignedTo,
            dueDateFrom,
            dueDateTo,
            page,
            limit
        });

        res.status(200).json({
            success: true,
            data: result.tasks,
            pagination: result.pagination
        });
    } catch (error) {
        error.status = 400;
        next(error);
    }
};

const getTaskById = async (req, res, next) => {
    try {
        const task = await taskService.getTaskById(req.params.id, req.user.companyId);
        res.status(200).json({
            success: true,
            data: task
        });
    } catch (error) {
        error.status = 404;
        next(error);
    }
};

const updateTask = async (req, res, next) => {
    try {
        const task = await taskService.updateTask(req.params.id, req.body, req.user.companyId);
        res.status(200).json({
            success: true,
            message: 'Task updated successfully',
            data: task
        });
    } catch (error) {
        error.status = 400;
        next(error);
    }
};

const deleteTask = async (req, res, next) => {
    try {
        await taskService.deleteTask(req.params.id, req.user.companyId);
        res.status(200).json({
            success: true,
            message: 'Task deleted successfully'
        });
    } catch (error) {
        error.status = 400;
        next(error);
    }
};

const getTaskStats = async (req, res, next) => {
    try {
        const { assignedTo, linkedId, linkedType } = req.query;
        const stats = await taskService.getTaskStats(req.user.companyId, {
            assignedTo,
            linkedId,
            linkedType
        });
        res.status(200).json({
            success: true,
            data: stats
        });
    } catch (error) {
        error.status = 400;
        next(error);
    }
};

const getFilterOptions = async (req, res, next) => {
    try {
        const options = await taskService.getFilterOptions(req.user.companyId);
        res.status(200).json({
            success: true,
            data: options
        });
    } catch (error) {
        error.status = 400;
        next(error);
    }
};

const getEntities = async (req, res, next) => {
    try {
        const { entityType } = req.params;
        const entities = await taskService.getEntities(req.user.companyId, entityType);
        res.status(200).json({
            success: true,
            data: entities
        });
    } catch (error) {
        error.status = 400;
        next(error);
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