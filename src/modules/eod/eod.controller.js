const eodService = require('./eod.services');

const getDefaultTasks = async (req, res, next) => {
    try {
        const tasks = await eodService.getDefaultTasks(req.user.companyId, req.user.id);
        res.status(200).json({
            success: true,
            data: tasks
        });
    } catch (error) {
        error.status = 400;
        next(error);
    }
};

const getMyEntry = async (req, res, next) => {
    try {
        const entryDate = req.query.date;
        const entry = await eodService.getMyEntry(req.user.companyId, req.user.id, entryDate);
        res.status(200).json({
            success: true,
            data: entry
        });
    } catch (error) {
        error.status = 400;
        next(error);
    }
};

const upsertEntry = async (req, res, next) => {
    try {
        const entry = await eodService.upsertEntry(req.user.companyId, req.user.id, req.body);
        res.status(200).json({
            success: true,
            message: 'EOD saved successfully',
            data: entry
        });
    } catch (error) {
        error.status = 400;
        next(error);
    }
};

const listMyEntries = async (req, res, next) => {
    try {
        const { from, to } = req.query;
        const entries = await eodService.listMyEntries(req.user.companyId, req.user.id, from, to);
        res.status(200).json({
            success: true,
            data: entries
        });
    } catch (error) {
        error.status = 400;
        next(error);
    }
};

module.exports = {
    getDefaultTasks,
    getMyEntry,
    upsertEntry,
    listMyEntries
};
