const leadService = require('./lead.service');
const { isCompanyAdminRole } = require('../../helpers/employeeHierarchy');

class LeadController {
    // Create a new lead
    async createLead(req, res) {
        try {
            const leadData = req.body;
            const companyId = req.user.companyId; // Assuming user info is attached via auth middleware

            if (!leadData.name || !leadData.source) {
                return res.status(400).json({
                    success: false,
                    message: 'Missing required fields: name and source are required',
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

    // Get approval activities (claim + extension) for current user
    async getApprovalActivities(req, res) {
        try {
            const companyId = req.user.companyId;
            const userId = req.user.id;
            const activities = await leadService.getClaimActivities(companyId, userId);

            return res.status(200).json({
                success: true,
                message: 'Approval activities fetched successfully',
                data: activities,
                count: activities.length,
            });
        } catch (error) {
            console.error('Error in getApprovalActivities:', error);
            return res.status(500).json({
                success: false,
                message: error.message || 'Error fetching approval activities',
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
            const { decision, note } = req.body;
            const companyId = req.user.companyId;
            const actorUserId = req.user.id;

            if (!decision || !['approve', 'reject'].includes(String(decision).toLowerCase())) {
                return res.status(400).json({
                    success: false,
                    message: 'Decision is required and must be approve or reject',
                });
            }

            if (!note || !String(note).trim()) {
                return res.status(400).json({
                    success: false,
                    message: 'Note is required for approving or rejecting a claim',
                });
            }

            const result = await leadService.decideClaimRequest({
                taskId,
                decision: String(decision).toLowerCase(),
                note: String(note).trim(),
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

    async requestExtension(req, res) {
        try {
            const { id } = req.params;
            const companyId = req.user.companyId;
            const requesterId = req.user.id;
            const { requestedDays, justification, closurePlan } = req.body || {};

            const result = await leadService.requestExtension({
                leadId: id,
                requesterId,
                companyId,
                requestedDays,
                justification,
                closurePlan,
            });

            return res.status(200).json({
                success: true,
                message: result.approvedDirectly
                    ? 'Extension granted by admin'
                    : 'Extension request sent for approval',
                data: result,
            });
        } catch (error) {
            console.error('Error in requestExtension:', error);
            const lower = (error.message || '').toLowerCase();
            const statusCode = lower.includes('not found') ? 404 : 400;
            return res.status(statusCode).json({
                success: false,
                message: error.message || 'Error requesting extension',
            });
        }
    }

    async decideApprovalRequest(req, res) {
        try {
            const { taskId } = req.params;
            const { decision, note } = req.body;
            const companyId = req.user.companyId;
            const actorUserId = req.user.id;

            if (!decision || !['approve', 'reject'].includes(String(decision).toLowerCase())) {
                return res.status(400).json({
                    success: false,
                    message: 'Decision is required and must be approve or reject',
                });
            }

            if (!note || !String(note).trim()) {
                return res.status(400).json({
                    success: false,
                    message: 'Note is required for approving or rejecting a request',
                });
            }

            const result = await leadService.decideApprovalRequest({
                taskId,
                decision: String(decision).toLowerCase(),
                note: String(note).trim(),
                companyId,
                actorUserId,
            });

            return res.status(200).json({
                success: true,
                message: decision === 'approve' ? 'Approval request approved' : 'Approval request rejected',
                data: result,
            });
        } catch (error) {
            console.error('Error in decideApprovalRequest:', error);
            const lower = (error.message || '').toLowerCase();
            const statusCode = lower.includes('not found') ? 404 : 400;
            return res.status(statusCode).json({
                success: false,
                message: error.message || 'Error deciding approval request',
            });
        }
    }

    async forceClaimOpenForTesting(req, res) {
        try {
            if (process.env.NODE_ENV !== 'development') {
                return res.status(403).json({
                    success: false,
                    message: 'This action is available only in development mode',
                });
            }

            if (!isCompanyAdminRole(req.user.role)) {
                return res.status(403).json({
                    success: false,
                    message: 'Only Company Admin can use this action',
                });
            }

            const { id } = req.params;
            const companyId = req.user.companyId;
            const actorUserId = req.user.id;

            const result = await leadService.forceClaimOpenForTesting(id, companyId, actorUserId);

            return res.status(200).json({
                success: true,
                message: result.message,
                data: result,
            });
        } catch (error) {
            console.error('Error in forceClaimOpenForTesting:', error);
            return res.status(error.message === 'Lead not found' ? 404 : 500).json({
                success: false,
                message: error.message || 'Error forcing lead claim open',
            });
        }
    }

    async sendDevEmailTemplate(req, res) {
        try {
            if (process.env.NODE_ENV !== 'development') {
                return res.status(403).json({
                    success: false,
                    message: 'This action is available only in development mode',
                });
            }

            if (!isCompanyAdminRole(req.user.role)) {
                return res.status(403).json({
                    success: false,
                    message: 'Only Company Admin can use this action',
                });
            }

            const result = await leadService.sendDevEmailTemplate({
                companyId: req.user.companyId,
                actorUserId: req.user.id,
                templateType: req.body.templateType,
                toEmail: req.body.toEmail,
                leadId: req.body.leadId,
                leadName: req.body.leadName,
                requesterName: req.body.requesterName,
                ownerName: req.body.ownerName,
                approverName: req.body.approverName,
                previousOwnerName: req.body.previousOwnerName,
                newOwnerName: req.body.newOwnerName,
            });

            return res.status(200).json({
                success: true,
                message: 'Test email queued',
                data: result,
            });
        } catch (error) {
            console.error('Error in sendDevEmailTemplate:', error);
            return res.status(400).json({
                success: false,
                message: error.message || 'Error sending test email',
            });
        }
    }

    // Update lead status
    async updateStatus(req, res) {
        try {
            const { id } = req.params;
            const { status, note } = req.body;
            const companyId = req.user.companyId;

            if (!status || !note) {
                return res.status(400).json({
                    success: false,
                    message: 'Status and note are required',
                });
            }

            const updatedLead = await leadService.updateStatus(id, status, note, companyId, req.user.id, req.user.role);

            return res.status(200).json({
                success: true,
                message: 'Lead status updated successfully',
                data: updatedLead,
            });
        } catch (error) {
            console.error('Error in updateStatus:', error);
            const lower = (error.message || '').toLowerCase();
            const statusCode = error.message === 'Lead not found' ? 404 : lower.includes('only for your own leads') ? 403 : 500;
            return res.status(statusCode).json({
                success: false,
                message: error.message || 'Error updating lead status',
            });
        }
    }

    async getDocuments(req, res) {
        try {
            const { id } = req.params;
            const { documentType } = req.query;
            const companyId = req.user.companyId;

            const documents = await leadService.getDocuments(id, companyId, documentType);

            return res.status(200).json({
                success: true,
                data: documents,
            });
        } catch (error) {
            console.error('Error getting lead documents:', error);
            return res.status(500).json({
                success: false,
                message: error.message || 'Failed to get documents',
            });
        }
    }

    async uploadDocuments(req, res) {
        try {
            const { id } = req.params;
            const companyId = req.user.companyId;
            const uploadedBy = req.user.id;
            const { documentType } = req.body;
            const files = req.files;

            if (!files || files.length === 0) {
                return res.status(400).json({ success: false, message: 'No files provided' });
            }
            if (!documentType) {
                return res.status(400).json({ success: false, message: 'Document type is required' });
            }

            const result = await leadService.uploadDocuments({
                leadId: id,
                companyId,
                documentType,
                files,
                uploadedBy
            });

            return res.status(201).json({
                success: true,
                message: 'Documents uploaded successfully',
                data: result,
            });
        } catch (error) {
            console.error('Error uploading lead documents:', error);
            return res.status(500).json({
                success: false,
                message: error.message || 'Failed to upload documents',
            });
        }
    }

    async deleteDocument(req, res) {
        try {
            const { id, documentId } = req.params;
            const companyId = req.user.companyId;

            await leadService.deleteDocument(id, documentId, companyId);

            return res.status(200).json({
                success: true,
                message: 'Document deleted successfully',
            });
        } catch (error) {
            console.error('Error deleting lead document:', error);
            return res.status(error.message === 'Document not found' ? 404 : 500).json({
                success: false,
                message: error.message || 'Failed to delete document',
            });
        }
    }

    async submitCompliance(req, res) {
        try {
            const { id } = req.params;
            const companyId = req.user.companyId;
            const userId = req.user.id;

            const result = await leadService.submitLeadCompliance(id, companyId, userId);

            return res.status(200).json({
                success: true,
                message: 'Compliance flow started successfully',
                data: result
            });
        } catch (error) {
            console.error('Error submitting lead compliance:', error);
            return res.status(500).json({
                success: false,
                message: error.message || 'Error submitting compliance',
            });
        }
    }

    async approveCompliance(req, res) {
        try {
            const { id } = req.params;
            const { level, action, comments } = req.body;
            const companyId = req.user.companyId;
            const userId = req.user.id;

            if (!level || !action) {
                return res.status(400).json({
                    success: false,
                    message: 'Level and action are required',
                });
            }

            const result = await leadService.approveLeadCompliance({
                leadId: id,
                companyId,
                userId,
                level,
                action,
                comments
            });

            return res.status(200).json({
                success: true,
                message: `Compliance ${action.toLowerCase()} successfully`,
                data: result
            });
        } catch (error) {
            console.error('Error approving lead compliance:', error);
            return res.status(500).json({
                success: false,
                message: error.message || 'Error approving compliance',
            });
        }
    }

    async getPendingApprovals(req, res) {
        try {
            const companyId = req.user.companyId;
            const userId = req.user.id;
            const role = req.user.role;

            const leads = await leadService.getPendingApprovals(companyId, userId, role);

            return res.status(200).json({
                success: true,
                message: 'Pending approvals fetched successfully',
                data: leads,
                count: leads.length
            });
        } catch (error) {
            console.error('Error fetching pending approvals:', error);
            return res.status(500).json({
                success: false,
                message: error.message || 'Error fetching pending approvals',
            });
        }
    }
}

module.exports = new LeadController();
