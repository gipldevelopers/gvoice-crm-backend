const leadService = require('./lead.service');
const { isCompanyAdminRole } = require('../../helpers/employeeHierarchy');

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

            const lead = await leadService.createLead(leadData, companyId, req.user.id, req.user.id);

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

            const leads = await leadService.getAllLeads(companyId, filters, req.user.id);

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

            const updatedLead = await leadService.updateLead(id, leadData, companyId, req.user.id);

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

            const result = await leadService.deleteLead(id, companyId, req.user.id);

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
            if (!isCompanyAdminRole(req.user.role)) {
                return res.status(403).json({
                    success: false,
                    message: 'Only Company Admin can change lead assignment',
                });
            }

            const { id } = req.params;
            const { salespersonId } = req.body;
            const companyId = req.user.companyId;

            const updatedLead = await leadService.assignLead(id, salespersonId, companyId, req.user.id);

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

    // Get claim request activities for current user
    async getClaimActivities(req, res) {
        try {
            const companyId = req.user.companyId;
            const userId = req.user.id;
            const activities = await leadService.getClaimActivities(companyId, userId);

            return res.status(200).json({
                success: true,
                message: 'Claim activities fetched successfully',
                data: activities,
                count: activities.length,
            });
        } catch (error) {
            console.error('Error in getClaimActivities:', error);
            return res.status(500).json({
                success: false,
                message: error.message || 'Error fetching claim activities',
            });
        }
    }

    // Request lead claim
    async requestClaim(req, res) {
        try {
            const { id } = req.params;
            const companyId = req.user.companyId;
            const requesterId = req.user.id;

            const result = await leadService.requestClaim(id, requesterId, companyId);

            return res.status(200).json({
                success: true,
                message: `Claim request sent to ${result.requestedTo.fullName}`,
                data: result,
            });
        } catch (error) {
            console.error('Error in requestClaim:', error);

            const lower = (error.message || '').toLowerCase();
            const statusCode = lower.includes('not found') ? 404 : lower.includes('only after 15 days') || lower.includes('already') || lower.includes('no lead owner') ? 400 : 500;

            return res.status(statusCode).json({
                success: false,
                message: error.message || 'Error requesting lead claim',
            });
        }
    }

    async decideClaimRequest(req, res) {
        try {
            const { taskId } = req.params;
            const { decision } = req.body;
            const companyId = req.user.companyId;
            const actorUserId = req.user.id;

            if (!decision || !['approve', 'reject'].includes(String(decision).toLowerCase())) {
                return res.status(400).json({
                    success: false,
                    message: 'Decision is required and must be approve or reject',
                });
            }

            const result = await leadService.decideClaimRequest({
                taskId,
                decision: String(decision).toLowerCase(),
                companyId,
                actorUserId,
            });

            return res.status(200).json({
                success: true,
                message: decision === 'approve' ? 'Claim request approved' : 'Claim request rejected',
                data: result,
            });
        } catch (error) {
            console.error('Error in decideClaimRequest:', error);
            const lower = (error.message || '').toLowerCase();
            const statusCode = lower.includes('not found') ? 404 : lower.includes('not authorized') || lower.includes('already processed') || lower.includes('invalid') || lower.includes('expired') ? 400 : 500;
            return res.status(statusCode).json({
                success: false,
                message: error.message || 'Error deciding claim request',
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

            const updatedLead = await leadService.updateStatus(id, status, companyId, req.user.id);

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
