const companyService = require('./company.service');

class CompanyController {
    async createCompany(req, res) {
        try {
            const company = await companyService.createCompany(req.body);
            return res.status(201).json({
                success: true,
                message: 'Company created successfully',
                data: company,
            });
        } catch (error) {
            return res.status(500).json({
                success: false,
                message: error.message,
            });
        }
    }

    async getAllCompanies(req, res) {
        try {
            const filters = {
                search: req.query.search,
                status: req.query.status,
                page: req.query.page,
                limit: req.query.limit,
            };
            const result = await companyService.getAllCompanies(filters);
            return res.status(200).json({
                success: true,
                ...result,
            });
        } catch (error) {
            return res.status(500).json({
                success: false,
                message: error.message,
            });
        }
    }

    async getCompanyById(req, res) {
        try {
            const company = await companyService.getCompanyById(req.params.id);
            return res.status(200).json({
                success: true,
                data: company,
            });
        } catch (error) {
            return res.status(error.message === 'Company not found' ? 404 : 500).json({
                success: false,
                message: error.message,
            });
        }
    }

    async updateCompany(req, res) {
        try {
            const company = await companyService.updateCompany(req.params.id, req.body);
            return res.status(200).json({
                success: true,
                message: 'Company updated successfully',
                data: company,
            });
        } catch (error) {
            return res.status(500).json({
                success: false,
                message: error.message,
            });
        }
    }

    async deleteCompany(req, res) {
        try {
            const result = await companyService.deleteCompany(req.params.id);
            return res.status(200).json({
                success: true,
                message: result.message,
            });
        } catch (error) {
            return res.status(500).json({
                success: false,
                message: error.message,
            });
        }
    }
}

module.exports = new CompanyController();
