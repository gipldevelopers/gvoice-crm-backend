const Joi = require('joi');

const taskItemSchema = Joi.object({
    title: Joi.string().allow('').optional(),
    hoursLogged: Joi.number().min(0).max(24).optional(),
    completionPercent: Joi.number().min(0).max(100).optional(),
    notes: Joi.string().allow('').optional(),
    source: Joi.string().allow('').optional(),
    sourceId: Joi.string().allow('').optional(),
    status: Joi.string().allow('').optional(),
    projectName: Joi.string().allow('').optional(),
    milestoneTitle: Joi.string().allow('').optional(),
    deadline: Joi.string().allow('').optional()
}).unknown(true);

const upsertEodSchema = Joi.object({
    entryDate: Joi.string().required(),
    tasksWorked: Joi.array().items(taskItemSchema).optional(),
    hoursLogged: Joi.number().min(0).max(24).optional(),
    completionPercent: Joi.number().min(0).max(100).optional(),
    blockers: Joi.string().allow('').optional(),
    productivityScore: Joi.number().min(0).max(100).optional(),
    productivityNotes: Joi.string().allow('').optional()
});

const validateUpsertEod = (req, res, next) => {
    const { error } = upsertEodSchema.validate(req.body);
    if (error) {
        return res.status(400).json({
            success: false,
            message: error.details[0].message
        });
    }
    next();
};

module.exports = {
    validateUpsertEod
};
