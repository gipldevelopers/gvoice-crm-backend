const techTaskService = require('./techTask.services');

const createBatch = async (req, res, next) => {
    try {
        const batch = await techTaskService.createBatch(req.body, req.user.companyId, req.user);
        res.status(201).json({
            success: true,
            message: 'Tech task batch created successfully',
            data: batch
        });
    } catch (error) {
        error.status = error.message?.startsWith('Forbidden') ? 403 : 400;
        next(error);
    }
};

const listBatches = async (req, res, next) => {
    try {
        const batches = await techTaskService.listBatches(req.user.companyId, req.user);
        res.status(200).json({
            success: true,
            data: batches
        });
    } catch (error) {
        error.status = error.message?.startsWith('Forbidden') ? 403 : 400;
        next(error);
    }
};

const listMyTasks = async (req, res, next) => {
    try {
        const tasks = await techTaskService.listMyTasks(req.user.companyId, req.user.id);
        res.status(200).json({
            success: true,
            data: tasks
        });
    } catch (error) {
        error.status = 400;
        next(error);
    }
};

const updateTaskStatus = async (req, res, next) => {
    try {
        const { status, note } = req.body;
        const task = await techTaskService.updateTaskStatus(
            req.params.id,
            req.user.companyId,
            req.user.id,
            status,
            note
        );
        res.status(200).json({
            success: true,
            message: 'Task status updated',
            data: task
        });
    } catch (error) {
        error.status = error.message?.startsWith('Forbidden') ? 403 : 400;
        next(error);
    }
};

const listTodayTasks = async (req, res, next) => {
    try {
        const tasks = await techTaskService.listTodayTasks(
            req.user.companyId,
            req.user,
            req.query.date
        );
        res.status(200).json({
            success: true,
            data: tasks
        });
    } catch (error) {
        error.status = error.message?.startsWith('Forbidden') ? 403 : 400;
        next(error);
    }
};

const getUserSummary = async (req, res, next) => {
    try {
        const summary = await techTaskService.getUserSummary(
            req.user.companyId,
            req.user,
            req.params.id
        );
        res.status(200).json({
            success: true,
            data: summary
        });
    } catch (error) {
        error.status = error.message?.startsWith('Forbidden') ? 403 : 400;
        next(error);
    }
};

const createSelfTask = async (req, res, next) => {
    try {
        const task = await techTaskService.createSelfTask(
            req.user.companyId,
            req.user.id,
            req.body
        );
        res.status(201).json({
            success: true,
            message: 'Task added',
            data: task
        });
    } catch (error) {
        error.status = 400;
        next(error);
    }
};

module.exports = {
    createBatch,
    listBatches,
    listMyTasks,
    updateTaskStatus,
    listTodayTasks,
    getUserSummary,
    createSelfTask
};
