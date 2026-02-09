const leadService = require('./lead.service');

class LeadController {
    // Create a new lead
    async createLead(req, res) {
        try {
            const leadData = req.body;
            const companyId = req.user.companyId; // Assuming user info is attached via auth middleware

            if (!leadData.name || !leadData.phone || !leadData.source || !leadData.value) {
                return res.status(400).json({
                    success: false,
                    message: 'Missing required fields: name, phone, source, and value are required',
                });
            }

            const lead = await leadService.createLead(leadData, companyId);

            return res.status(201).json({
                success: true,
                message: 'Lead created successfully',
                data: lead,
            });
        } catch (error) {
            console.error('Error in createLead:', error);
            return res.status(500).json({
                success: false,
                message: error.message || 'Error creating lead',
            });
        }
    }

    // Get all leads
    async getAllLeads(req, res) {
        try {
            const companyId = req.user.companyId;
            const filters = {
                search: req.query.search,
                status: req.query.status,
                source: req.query.source,
                salespersonId: req.query.salespersonId,
            };

            const leads = await leadService.getAllLeads(companyId, filters);

            return res.status(200).json({
                success: true,
                message: 'Leads fetched successfully',
                data: leads,
                count: leads.length,
            });
        } catch (error) {
            console.error('Error in getAllLeads:', error);
            return res.status(500).json({
                success: false,
                message: error.message || 'Error fetching leads',
            });
        }
    }

    // Get a single lead by ID
    async getLeadById(req, res) {
        try {
            const { id } = req.params;
            const companyId = req.user.companyId;

            const lead = await leadService.getLeadById(id, companyId);

            return res.status(200).json({
                success: true,
                message: 'Lead fetched successfully',
                data: lead,
            });
        } catch (error) {
            console.error('Error in getLeadById:', error);
            return res.status(error.message === 'Lead not found' ? 404 : 500).json({
                success: false,
                message: error.message || 'Error fetching lead',
            });
        }
    }

    // Update a lead
    async updateLead(req, res) {
        try {
            const { id } = req.params;
            const leadData = req.body;
            const companyId = req.user.companyId;

            const updatedLead = await leadService.updateLead(id, leadData, companyId);

            return res.status(200).json({
                success: true,
                message: 'Lead updated successfully',
                data: updatedLead,
            });
        } catch (error) {
            console.error('Error in updateLead:', error);
            return res.status(error.message === 'Lead not found' ? 404 : 500).json({
                success: false,
                message: error.message || 'Error updating lead',
            });
        }
    }

    // Delete a lead
    async deleteLead(req, res) {
        try {
            const { id } = req.params;
            const companyId = req.user.companyId;

            const result = await leadService.deleteLead(id, companyId);

            return res.status(200).json({
                success: true,
                message: result.message,
            });
        } catch (error) {
            console.error('Error in deleteLead:', error);
            return res.status(error.message === 'Lead not found' ? 404 : 500).json({
                success: false,
                message: error.message || 'Error deleting lead',
            });
        }
    }

    // Get lead statistics
    async getLeadStats(req, res) {
        try {
            const companyId = req.user.companyId;
            const filters = {
                startDate: req.query.startDate,
                endDate: req.query.endDate,
            };

            const stats = await leadService.getLeadStats(companyId, filters);

            return res.status(200).json({
                success: true,
                message: 'Lead statistics fetched successfully',
                data: stats,
            });
        } catch (error) {
            console.error('Error in getLeadStats:', error);
            return res.status(500).json({
                success: false,
                message: error.message || 'Error fetching lead statistics',
            });
        }
    }

    // Get leads by salesperson
    async getLeadsBySalesperson(req, res) {
        try {
            const { salespersonId } = req.params;
            const companyId = req.user.companyId;

            const leads = await leadService.getLeadsBySalesperson(salespersonId, companyId);

            return res.status(200).json({
                success: true,
                message: 'Leads fetched successfully',
                data: leads,
                count: leads.length,
            });
        } catch (error) {
            console.error('Error in getLeadsBySalesperson:', error);
            return res.status(500).json({
                success: false,
                message: error.message || 'Error fetching leads by salesperson',
            });
        }
    }

    // Assign a lead
    async assignLead(req, res) {
        try {
            const { id } = req.params;
            const { salespersonId } = req.body;
            const companyId = req.user.companyId;

            const updatedLead = await leadService.assignLead(id, salespersonId, companyId);

            const message = salespersonId ? 'Lead assigned successfully' : 'Lead unassigned successfully';

            return res.status(200).json({
                success: true,
                message: message,
                data: updatedLead,
            });
        } catch (error) {
            console.error('Error in assignLead:', error);
            return res.status(error.message === 'Lead not found' ? 404 : 500).json({
                success: false,
                message: error.message || 'Error assigning lead',
            });
        }
    }

    // Update lead status
    async updateStatus(req, res) {
        try {
            const { id } = req.params;
            const { status } = req.body;
            const companyId = req.user.companyId;

            if (!status) {
                return res.status(400).json({
                    success: false,
                    message: 'Status is required',
                });
            }

            const updatedLead = await leadService.updateStatus(id, status, companyId);

            return res.status(200).json({
                success: true,
                message: 'Lead status updated successfully',
                data: updatedLead,
            });
        } catch (error) {
            console.error('Error in updateStatus:', error);
            return res.status(error.message === 'Lead not found' ? 404 : 500).json({
                success: false,
                message: error.message || 'Error updating lead status',
            });
        }
    }
}

module.exports = new LeadController();
