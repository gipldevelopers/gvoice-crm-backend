const customerService = require('./customer.service');

class CustomerController {
    // Create customer
    async createCustomer(req, res) {
        try {
            const companyId = req.user.companyId;
            const { customerType, companyName, ...rest } = req.body;

            // Map frontend fields to database model
            const data = {
                ...rest,
                type: customerType || rest.type || 'Company',
                name: companyName || rest.name,
            };

            if (!data.name) {
                return res.status(400).json({ success: false, message: 'Customer name (or companyName) is required' });
            }

            const customer = await customerService.createCustomer(data, companyId);

            return res.status(201).json({
                success: true,
                message: 'Customer created successfully',
                data: customer,
            });
        } catch (error) {
            console.error('Error in createCustomer:', error);
            return res.status(500).json({
                success: false,
                message: error.message,
            });
        }
    }

    // Get all customers
    async getAllCustomers(req, res) {
        try {
            const companyId = req.user.companyId;
            const filters = req.query; // search, type, status

            const customers = await customerService.getAllCustomers(companyId, filters);

            return res.status(200).json({
                success: true,
                data: customers,
            });
        } catch (error) {
            console.error('Error in getAllCustomers:', error);
            return res.status(500).json({
                success: false,
                message: error.message,
            });
        }
    }

    // Get customer by ID
    async getCustomerById(req, res) {
        try {
            const companyId = req.user.companyId;
            const { id } = req.params;

            const customer = await customerService.getCustomerById(id, companyId);

            return res.status(200).json({
                success: true,
                data: customer,
            });
        } catch (error) {
            return res.status(error.message === 'Customer not found' ? 404 : 500).json({
                success: false,
                message: error.message,
            });
        }
    }

    // Update customer
    async updateCustomer(req, res) {
        try {
            const companyId = req.user.companyId;
            const { id } = req.params;
            const { customerType, companyName, ...rest } = req.body;

            // Map frontend fields to database model
            const data = {
                ...rest,
                ...(customerType && { type: customerType }),
                ...(companyName && { name: companyName }),
            };

            const customer = await customerService.updateCustomer(id, data, companyId);

            return res.status(200).json({
                success: true,
                message: 'Customer updated successfully',
                data: customer,
            });
        } catch (error) {
            return res.status(error.message === 'Customer not found' ? 404 : 500).json({
                success: false,
                message: error.message,
            });
        }
    }

    // Delete customer
    async deleteCustomer(req, res) {
        try {
            const companyId = req.user.companyId;
            const { id } = req.params;

            await customerService.deleteCustomer(id, companyId);

            return res.status(200).json({
                success: true,
                message: 'Customer deleted successfully',
            });
        } catch (error) {
            return res.status(error.message === 'Customer not found' ? 404 : 500).json({
                success: false,
                message: error.message,
            });
        }
    }

    // Convert Lead to Customer
    async convertLead(req, res) {
        try {
            const companyId = req.user.companyId;
            const { leadId } = req.body;

            if (!leadId) {
                return res.status(400).json({ success: false, message: 'leadId is required' });
            }

            const customer = await customerService.convertLeadToCustomer(leadId, companyId);

            return res.status(201).json({
                success: true,
                message: 'Lead converted to customer successfully',
                data: customer,
            });
        } catch (error) {
            console.error('Error in convertLead:', error);
            return res.status(500).json({
                success: false,
                message: error.message,
            });
        }
    }
}

module.exports = new CustomerController();
