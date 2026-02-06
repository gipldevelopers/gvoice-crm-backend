const prisma = require('../../database/prisma');

const getDashboardStats = async (companyId) => {
    const today = new Date();
    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const firstDayOfLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const lastDayOfLastMonth = new Date(today.getFullYear(), today.getMonth(), 0);

    // 1. Leads Stats
    const totalLeads = await prisma.lead.count({ where: { companyId } });
    const leadsThisMonth = await prisma.lead.count({
        where: {
            companyId,
            createdAt: { gte: firstDayOfMonth }
        }
    });

    // 2. Deals Stats
    const activeDealsCount = await prisma.deal.count({
        where: {
            companyId,
            stage: { notIn: ['Won', 'Lost'] }
        }
    });

    const activeDealsValue = await prisma.deal.aggregate({
        where: {
            companyId,
            stage: { notIn: ['Won', 'Lost'] }
        },
        _sum: { value: true }
    });

    const wonDealsCount = await prisma.deal.count({
        where: { companyId, stage: 'Won' }
    });

    const lostDealsCount = await prisma.deal.count({
        where: { companyId, stage: 'Lost' }
    });

    // 3. Revenue
    const totalRevenue = await prisma.deal.aggregate({
        where: { companyId, stage: 'Won' },
        _sum: { value: true }
    });

    const monthlyRevenue = await prisma.deal.aggregate({
        where: {
            companyId,
            stage: 'Won',
            updatedAt: { gte: firstDayOfMonth }
        },
        _sum: { value: true }
    });

    // 4. Salesperson Performance
    const salespersons = await prisma.user.findMany({
        where: { companyId },
        select: {
            id: true,
            fullName: true,
            leads: { select: { id: true } },
            deals: { select: { id: true, stage: true, value: true } }
        }
    });

    const salespersonPerformance = salespersons.map(sp => {
        const wonDeals = sp.deals.filter(d => d.stage === 'Won');
        const lostDeals = sp.deals.filter(d => d.stage === 'Lost');
        const revenue = wonDeals.reduce((sum, d) => sum + (d.value || 0), 0);
        const totalDeals = wonDeals.length + lostDeals.length;
        const conversionRate = totalDeals > 0 ? ((wonDeals.length / totalDeals) * 100).toFixed(1) : 0;

        return {
            id: sp.id,
            name: sp.fullName,
            leads: sp.leads.length,
            deals: sp.deals.length,
            won: wonDeals.length,
            lost: lostDeals.length,
            revenue: revenue,
            conversionRate: conversionRate,
            trend: conversionRate > 20 ? 'up' : 'down' // Simplistic trend
        };
    });

    // 5. Recent Activities (Combine latest Won Deals and New Leads)
    const recentDeals = await prisma.deal.findMany({
        where: { companyId, stage: 'Won' },
        take: 5,
        orderBy: { updatedAt: 'desc' },
        include: { salesperson: true, customer: true }
    });

    const recentLeads = await prisma.lead.findMany({
        where: { companyId },
        take: 5,
        orderBy: { createdAt: 'desc' },
        include: { salesperson: true }
    });

    // Combine and sort
    const activities = [
        ...recentDeals.map(d => ({
            id: d.id,
            type: 'deal_won',
            title: `Deal closed: ${d.title}`,
            value: d.value,
            time: d.updatedAt,
            user: d.salesperson?.fullName || 'Unknown'
        })),
        ...recentLeads.map(l => ({
            id: l.id,
            type: 'lead_added',
            title: `New lead: ${l.name}`,
            value: l.value,
            time: l.createdAt,
            user: l.salesperson?.fullName || 'Unassigned'
        }))
    ].sort((a, b) => new Date(b.time) - new Date(a.time)).slice(0, 5);

    return {
        leads: {
            total: totalLeads,
            month: leadsThisMonth,
            change: '+5%' // Placeholder for now, real calc requires complex queries
        },
        activeDeals: {
            count: activeDealsCount,
            value: activeDealsValue._sum.value || 0,
            change: '+2%'
        },
        wonDeals: wonDealsCount,
        lostDeals: lostDealsCount,
        revenue: {
            total: totalRevenue._sum.value || 0,
            monthly: monthlyRevenue._sum.value || 0,
            change: '+10%'
        },
        conversionRate: {
            value: (wonDealsCount + lostDealsCount) > 0 ? ((wonDealsCount / (wonDealsCount + lostDealsCount)) * 100).toFixed(1) : 0,
            change: '+1.5%'
        },
        salespersonPerformance,
        recentActivities: activities
    };
};

module.exports = {
    getDashboardStats
};
