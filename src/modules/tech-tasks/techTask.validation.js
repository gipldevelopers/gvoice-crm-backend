const Joi = require('joi');

const taskItemSchema = Joi.object({
    title: Joi.string().required(),
    assignedToId: Joi.string().required(),
    estimatedHours: Joi.number().min(0).max(24).optional(),
    notes: Joi.string().optional().allow('')
});

const createBatchSchema = Joi.object({
    headTitle: Joi.string().required(),
    projectId: Joi.string().optional().allow(''),
    tasks: Joi.array().min(1).items(taskItemSchema).required()
});

const updateStatusSchema = Joi.object({
    status: Joi.string().valid('Completed', 'Failed', 'Blocked').required(),
    note: Joi.string().min(30).required()
});

const selfTaskSchema = Joi.object({
    title: Joi.string().required(),
    projectId: Joi.string().optional().allow(''),
    estimatedHours: Joi.number().min(0).max(24).optional(),
    notes: Joi.string().optional().allow('')
});

const validateCreateBatch = (req, res, next) => {
    const { error } = createBatchSchema.validate(req.body);
    if (error) {
        return res.status(400).json({
            success: false,
            message: error.details[0].message
        });
    }
    next();
};

const validateUpdateStatus = (req, res, next) => {
    const { error } = updateStatusSchema.validate(req.body);
    if (error) {
        return res.status(400).json({
            success: false,
            message: error.details[0].message
        });
    }
    next();
};

const validateSelfTask = (req, res, next) => {
    const { error } = selfTaskSchema.validate(req.body);
    if (error) {
        return res.status(400).json({
            success: false,
            message: error.details[0].message
        });
    }
    next();
};

module.exports = {
    validateCreateBatch,
    validateUpdateStatus,
    validateSelfTask
};
