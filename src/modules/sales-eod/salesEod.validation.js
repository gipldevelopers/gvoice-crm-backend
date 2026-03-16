const Joi = require('joi');

const upsertSalesEodSchema = Joi.object({
    entryDate: Joi.string().required(),
    callsMade: Joi.number().min(0).max(500).optional(),
    progressUpdates: Joi.string().allow('').optional(),
    blockers: Joi.string().allow('').optional()
});

const validateUpsertSalesEod = (req, res, next) => {
    const { error } = upsertSalesEodSchema.validate(req.body);
    if (error) {
        return res.status(400).json({
            success: false,
            message: error.details[0].message
        });
    }
    next();
};

module.exports = {
    validateUpsertSalesEod
};
