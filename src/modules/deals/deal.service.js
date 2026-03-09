const prisma = require('../../database/prisma');

class DealService {
    async createDeal(dealData, companyId) {
        try {
            const deal = await prisma.deal.create({
                data: {
                    title: dealData.title,
                    value: parseFloat(dealData.value),
                    stage: dealData.stage || 'New Deal',
                    closingDate: dealData.closingDate ? new Date(dealData.closingDate) : null,
                    probability: parseInt(dealData.probability) || 10,
                    notes: dealData.notes,
                    salespersonId: dealData.salespersonId || null,
                    customerId: dealData.customerId || null,
                    companyId: companyId,
                },
                include: {
                    salesperson: {
                        select: {
                            id: true,
                            fullName: true,
                            email: true,
                        },
                    },
                    customer: {
                        select: {
                            id: true,
                            name: true,
                        },
                    },
                },
            });
            return deal;
        } catch (error) {
            throw new Error(`Error creating deal: ${error.message}`);
        }
    }

    async getAllDeals(companyId, filters = {}) {
        try {
            const {
                search,
                stage,
                salespersonId,
                customerId,
                startDate,
                endDate,
                minValue,
                maxValue,
                page = 1,
                limit = 10
            } = filters;

            const where = {
                companyId: companyId,
                ...(stage && { stage }),
                ...(salespersonId && { salespersonId }),
                ...(customerId && { customerId }),
                ...(startDate && endDate && {
                    closingDate: {
                        gte: new Date(startDate),
                        lte: new Date(endDate),
                    },
                }),
                ...((minValue || maxValue) && {
                    value: {
                        ...(minValue && { gte: parseFloat(minValue) }),
                        ...(maxValue && { lte: parseFloat(maxValue) }),
                    },
                }),
                ...(search && {
                    OR: [
                        { title: { contains: search, mode: 'insensitive' } },
                        { customer: { name: { contains: search, mode: 'insensitive' } } },
                    ],
                }),
            };

            const [deals, total] = await Promise.all([
                prisma.deal.findMany({
                    where,
                    include: {
                        salesperson: {
                            select: {
                                id: true,
                                fullName: true,
                                email: true,
                            },
                        },
                        customer: {
                            select: {
                                id: true,
                                name: true,
                            },
                        },
                    },
                    orderBy: {
                        updatedAt: 'desc',
                    },
                    skip: (page - 1) * limit,
                    take: limit,
                }),
                prisma.deal.count({ where }),
            ]);

            return {
                deals,
                pagination: {
                    total,
                    page,
                    limit,
                    totalPages: Math.ceil(total / limit),
                },
            };
        } catch (error) {
            throw new Error(`Error fetching deals: ${error.message}`);
        }
    }

    async getDealById(dealId, companyId) {
        try {
            const deal = await prisma.deal.findFirst({
                where: {
                    id: dealId,
                    companyId: companyId,
                },
                include: {
                    salesperson: {
                        select: {
                            id: true,
                            fullName: true,
                            email: true,
                        },
                    },
                    customer: {
                        select: {
                            id: true,
                            name: true,
                        },
                    },
                },
            });

            if (!deal) {
                throw new Error('Deal not found');
            }

            return deal;
        } catch (error) {
            throw new Error(`Error fetching deal: ${error.message}`);
        }
    }

    async updateDeal(dealId, dealData, companyId) {
        try {
            const existingDeal = await prisma.deal.findFirst({
                where: {
                    id: dealId,
                    companyId: companyId,
                },
            });

            if (!existingDeal) {
                throw new Error('Deal not found');
            }

            if (dealData.stage === 'Won' && existingDeal.complianceStatus !== 'HEAD_APPROVED') {
                throw new Error('Cannot mark deal as "Won". All mandatory compliance documents must be submitted and approved.');
            }

            const updatedDeal = await prisma.deal.update({
                where: {
                    id: dealId,
                },
                data: {
                    ...(dealData.title && { title: dealData.title }),
                    ...(dealData.value !== undefined && { value: parseFloat(dealData.value) }),
                    ...(dealData.stage && { stage: dealData.stage }),
                    ...(dealData.closingDate !== undefined && { closingDate: dealData.closingDate ? new Date(dealData.closingDate) : null }),
                    ...(dealData.probability !== undefined ? { probability: parseInt(dealData.probability) } : (dealData.stage && {
                        probability: {
                            'New Deal': 10,
                            'Requirement Shared': 30,
                            'Quotation Sent': 50,
                            'Follow-up': 60,
                            'Negotiation': 80,
                            'Won': 100,
                            'Lost': 0
                        }[dealData.stage] ?? existingDeal.probability
                    })),
                    ...(dealData.notes !== undefined && { notes: dealData.notes }),
                    ...(dealData.salespersonId !== undefined && { salespersonId: dealData.salespersonId }),
                    ...(dealData.customerId !== undefined && { customerId: dealData.customerId }),
                },
                include: {
                    salesperson: {
                        select: {
                            id: true,
                            fullName: true,
                            email: true,
                        },
                    },
                    customer: {
                        select: {
                            id: true,
                            name: true,
                        },
                    },
                },
            });

            return updatedDeal;
        } catch (error) {
            throw new Error(`Error updating deal: ${error.message}`);
        }
    }

    async deleteDeal(dealId, companyId) {
        try {
            const existingDeal = await prisma.deal.findFirst({
                where: {
                    id: dealId,
                    companyId: companyId,
                },
            });

            if (!existingDeal) {
                throw new Error('Deal not found');
            }

            await prisma.deal.delete({
                where: {
                    id: dealId,
                },
            });

            return { message: 'Deal deleted successfully' };
        } catch (error) {
            throw new Error(`Error deleting deal: ${error.message}`);
        }
    }

    async uploadDocuments({ dealId, companyId, documentType, files, uploadedBy }) {
        const deal = await prisma.deal.findFirst({
            where: { id: dealId, companyId },
        });

        if (!deal) throw new Error('Deal not found');

        const uploadedDocs = [];
        for (const file of files) {
            const doc = await prisma.dealDocument.create({
                data: {
                    dealId,
                    documentType,
                    filename: file.filename,
                    originalName: file.originalname,
                    path: file.path.replace(/\\/g, '/'),
                    mimetype: file.mimetype,
                    size: file.size,
                    uploadedBy,
                }
            });
            uploadedDocs.push(doc);
        }

        return uploadedDocs;
    }

    async getDocuments(dealId, companyId, documentType) {
        return await prisma.dealDocument.findMany({
            where: {
                dealId,
                deal: { companyId },
                ...(documentType && { documentType })
            },
            include: {
                uploader: { select: { id: true, fullName: true, email: true } },
            },
            orderBy: { createdAt: 'desc' },
        });
    }

    async deleteDocument(dealId, documentId, companyId) {
        const deal = await prisma.deal.findFirst({ where: { id: dealId, companyId } });
        if (!deal) throw new Error('Deal not found');

        const doc = await prisma.dealDocument.findFirst({
            where: { id: documentId, dealId }
        });

        if (!doc) throw new Error('Document not found');

        try {
            const fs = require('fs');
            if (fs.existsSync(doc.path)) fs.unlinkSync(doc.path);
        } catch (e) {
            console.error('Failed to delete physical file:', e);
        }

        await prisma.dealDocument.delete({ where: { id: documentId } });
        return { success: true };
    }

    async submitCompliance(dealId, companyId, userId) {
        const deal = await prisma.deal.findFirst({
            where: { id: dealId, companyId },
            include: { documents: true }
        });

        if (!deal) throw new Error('Deal not found');

        const requiredDocs = ["Final SOW", "Client Approved BOQ", "Advance Payment Proof", "Signed MSA", "Signed NDA"];
        const uploadedTypes = new Set(deal.documents.map(d => d.documentType));
        const missing = requiredDocs.filter(reqDoc => !uploadedTypes.has(reqDoc));

        if (missing.length > 0) {
            throw new Error(`Missing mandatory documents: ${missing.join(', ')}`);
        }

        if (deal.complianceStatus !== 'PENDING' && deal.complianceStatus !== 'REJECTED') {
            throw new Error(`Compliance flow is already in progress or completed (${deal.complianceStatus}).`);
        }

        const deadline = new Date(Date.now() + 24 * 60 * 60 * 1000);
        await prisma.dealApproval.create({
            data: {
                dealId,
                level: 'TL_VERIFICATION',
                deadline
            }
        });

        await prisma.deal.update({
            where: { id: dealId },
            data: { complianceStatus: 'TL_VERIFICATION_PENDING' }
        });

        return { message: 'Compliance flow submitted to TL Verification' };
    }

    async approveCompliance({ dealId, companyId, userId, level, action, comments }) {
        const deal = await prisma.deal.findFirst({
            where: { id: dealId, companyId }
        });

        if (!deal) throw new Error('Deal not found');

        const approval = await prisma.dealApproval.findFirst({
            where: {
                dealId,
                level,
                status: 'PENDING'
            }
        });

        if (!approval) throw new Error(`No pending approval found for level ${level}`);

        await prisma.dealApproval.update({
            where: { id: approval.id },
            data: {
                status: action,
                approverId: userId,
                comments: comments || null
            }
        });

        if (action === 'REJECTED') {
            await prisma.deal.update({
                where: { id: dealId },
                data: { complianceStatus: 'REJECTED' }
            });
            return { nextStatus: 'REJECTED' };
        }

        let nextLevel = null;
        let nextComplianceStatus = '';

        if (level === 'TL_VERIFICATION') {
            nextLevel = 'FINANCE_CONFIRMATION';
            nextComplianceStatus = 'FINANCE_PENDING';
        } else if (level === 'FINANCE_CONFIRMATION') {
            nextLevel = 'HEAD_APPROVAL';
            nextComplianceStatus = 'HEAD_PENDING';
        }

        if (nextLevel) {
            const deadline = new Date(Date.now() + 24 * 60 * 60 * 1000);
            await prisma.dealApproval.create({
                data: {
                    dealId,
                    level: nextLevel,
                    deadline
                }
            });
            await prisma.deal.update({
                where: { id: dealId },
                data: { complianceStatus: nextComplianceStatus }
            });
            return { nextStatus: nextComplianceStatus };
        }

        let projectId = `PRJ-${Math.floor(100000 + Math.random() * 900000)}`;

        await prisma.project.create({
            data: {
                projectId,
                name: `${deal.title} - Project Workspace`,
                dealId: deal.id,
                companyId: companyId
            }
        });

        const updatedDeal = await prisma.deal.update({
            where: { id: dealId },
            data: {
                complianceStatus: 'HEAD_APPROVED',
                stage: 'Won',
                projectGenerated: true
            }
        });

        return { nextStatus: 'HEAD_APPROVED', deal: updatedDeal, projectId };
    }
}

module.exports = new DealService();
