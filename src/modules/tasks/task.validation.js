const Joi = require('joi');

const createTaskSchema = Joi.object({
    title: Joi.string().required(),
    type: Joi.string().valid('Call', 'Meeting', 'Email', 'WhatsApp', 'Note', 'Follow-up', 'Proposal Progress').required(),
    linkedType: Joi.string().valid('Lead', 'Customer', 'Deal').required(),
    linkedId: Joi.string().optional(),
    linkedTo: Joi.string().optional(),
    assignedTo: Joi.string().optional(),
    dueDate: Joi.string().required(),
    dueTime: Joi.string().required(),
    status: Joi.string().valid('Pending', 'Completed').default('Pending'),
    priority: Joi.string().valid('High', 'Medium', 'Low').default('Medium'),
    notes: Joi.string().optional()
});

const updateTaskSchema = Joi.object({
    title: Joi.string().optional(),
    type: Joi.string().valid('Call', 'Meeting', 'Email', 'WhatsApp', 'Note', 'Follow-up', 'Proposal Progress').optional(),
    linkedType: Joi.string().valid('Lead', 'Customer', 'Deal').optional(),
    linkedId: Joi.string().optional(),
    linkedTo: Joi.string().optional(),
    assignedTo: Joi.string().optional(),
    dueDate: Joi.string().optional(),
    dueTime: Joi.string().optional(),
    status: Joi.string().valid('Pending', 'Completed').optional(),
    priority: Joi.string().valid('High', 'Medium', 'Low').optional(),
    notes: Joi.string().optional()
});

const validateCreateTask = (req, res, next) => {
    const { error } = createTaskSchema.validate(req.body);
    if (error) {
        return res.status(400).json({
            success: false,
            message: error.details[0].message
        });
    }
    next();
};

const validateUpdateTask = (req, res, next) => {
    const { error } = updateTaskSchema.validate(req.body);
    if (error) {
        return res.status(400).json({
            success: false,
            message: error.details[0].message
        });
    }
    next();
};

module.exports = {
    validateCreateTask,
    validateUpdateTask
};
