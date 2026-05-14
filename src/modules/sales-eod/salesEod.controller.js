const salesEodService = require('./salesEod.services');

const getMyEntry = async (req, res, next) => {
    try {
        const entryDate = req.query.date;
        const entry = await salesEodService.getMyEntry(req.user.companyId, req.user.id, entryDate);
        const auto = await salesEodService.getAutoData(req.user.companyId, req.user.id, entryDate);
        res.status(200).json({
            success: true,
            data: {
                entry,
                auto
            }
        });
    } catch (error) {
        error.status = 400;
        next(error);
    }
};

const upsertEntry = async (req, res, next) => {
    try {
        const entry = await salesEodService.upsertEntry(req.user.companyId, req.user.id, req.body);
        res.status(200).json({
            success: true,
            message: 'Sales EOD saved successfully',
            data: entry
        });
    } catch (error) {
        error.status = 400;
        next(error);
    }
};

const listMyEntries = async (req, res, next) => {
    try {
        const { from, to, limit } = req.query;
        const entries = await salesEodService.listMyEntries(
            req.user.companyId,
            req.user.id,
            from,
            to,
            limit
        );
        res.status(200).json({
            success: true,
            data: entries
        });
    } catch (error) {
        error.status = 400;
        next(error);
    }
};

const getTodaySummary = async (req, res, next) => {
    try {
        const summary = await salesEodService.getTodaySummary(req.user.companyId, req.query.date);
        res.status(200).json({
            success: true,
            data: summary
        });
    } catch (error) {
        error.status = 400;
        next(error);
    }
};

const getUserSummary = async (req, res, next) => {
    try {
        const summary = await salesEodService.getUserSummary(req.user.companyId, req.params.id);
        res.status(200).json({
            success: true,
            data: summary
        });
    } catch (error) {
        error.status = 400;
        next(error);
    }
};

module.exports = {
    getMyEntry,
    upsertEntry,
    listMyEntries,
    getTodaySummary,
    getUserSummary
};
