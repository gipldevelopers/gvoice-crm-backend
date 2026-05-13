const Joi = require('joi');

const createTaskSchema = Joi.object({
    title: Joi.string().required(),
    type: Joi.string().valid('Call', 'Meeting', 'Email', 'WhatsApp', 'Note', 'Follow-up', 'Proposal Progress').required(),
    linkedType: Joi.string().valid('Lead', 'Customer', 'Deal').required().label('Entity Type'),
    linkedId: Joi.string().required().label('Select Target'),
    linkedTo: Joi.string().optional().allow(''),
    assignedTo: Joi.string().optional().allow(''),
    dueDate: Joi.string().required().label('Due Date'),
    dueTime: Joi.string().required().label('Preferred Time'),
    status: Joi.string().valid('Pending', 'Completed').default('Pending'),
    priority: Joi.string().valid('High', 'Medium', 'Low').default('Medium'),
    notes: Joi.string().required().label('Notes/Comments').messages({
        'string.empty': 'Please enter notes/comments',
        'any.required': 'Please enter notes/comments'
    })
});

const updateTaskSchema = Joi.object({
    title: Joi.string().optional(),
    type: Joi.string().valid('Call', 'Meeting', 'Email', 'WhatsApp', 'Note', 'Follow-up', 'Proposal Progress').optional(),
    linkedType: Joi.string().valid('Lead', 'Customer', 'Deal').optional().label('Entity Type'),
    linkedId: Joi.string().optional().allow('').label('Select Target'),
    linkedTo: Joi.string().optional().allow(''),
    assignedTo: Joi.string().optional().allow(''),
    dueDate: Joi.string().optional(),
    dueTime: Joi.string().optional(),
    status: Joi.string().valid('Pending', 'Completed').optional(),
    priority: Joi.string().valid('High', 'Medium', 'Low').optional(),
    notes: Joi.string().optional().allow('').label('Notes/Comments')
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
