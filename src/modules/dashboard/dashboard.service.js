const prisma = require('../../database/prisma');

const getDashboardStats = async (companyId) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay());

    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const firstDayOfLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const lastDayOfLastMonth = new Date(today.getFullYear(), today.getMonth(), 0);

    // 1. Leads Stats
    const totalLeads = await prisma.lead.count({ where: { companyId } });

    const leadsToday = await prisma.lead.count({
        where: {
            companyId,
            createdAt: { gte: today }
        }
    });

    const leadsThisWeek = await prisma.lead.count({
        where: {
            companyId,
            createdAt: { gte: startOfWeek }
        }
    });

    const leadsThisMonth = await prisma.lead.count({
        where: {
            companyId,
            createdAt: { gte: firstDayOfMonth }
        }
    });

    const leadsLastMonth = await prisma.lead.count({
        where: {
            companyId,
            createdAt: { gte: firstDayOfLastMonth, lte: lastDayOfLastMonth }
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

    const activeDealsLastMonth = await prisma.deal.aggregate({
        where: {
            companyId,
            stage: { notIn: ['Won', 'Lost'] },
            createdAt: { gte: firstDayOfLastMonth, lte: lastDayOfLastMonth }
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

    const lastMonthRevenue = await prisma.deal.aggregate({
        where: {
            companyId,
            stage: 'Won',
            updatedAt: { gte: firstDayOfLastMonth, lte: lastDayOfLastMonth }
        },
        _sum: { value: true }
    });

    // Calculate percentage changes
    const leadsChange = leadsLastMonth > 0
        ? (((leadsThisMonth - leadsLastMonth) / leadsLastMonth) * 100).toFixed(1)
        : '0';

    const activeDealsChange = (activeDealsLastMonth._sum.value || 0) > 0
        ? (((activeDealsValue._sum.value || 0) - (activeDealsLastMonth._sum.value || 0)) / (activeDealsLastMonth._sum.value || 0) * 100).toFixed(1)
        : '0';

    const revenueChange = (lastMonthRevenue._sum.value || 0) > 0
        ? (((monthlyRevenue._sum.value || 0) - (lastMonthRevenue._sum.value || 0)) / (lastMonthRevenue._sum.value || 0) * 100).toFixed(1)
        : '0';

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
            conversionRate: parseFloat(conversionRate),
            trend: conversionRate > 20 ? 'up' : 'down'
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
            today: leadsToday,
            week: leadsThisWeek,
            month: leadsThisMonth,
            change: `${leadsChange >= 0 ? '+' : ''}${leadsChange}%`
        },
        activeDeals: {
            count: activeDealsCount,
            value: activeDealsValue._sum.value || 0,
            change: `${activeDealsChange >= 0 ? '+' : ''}${activeDealsChange}%`
        },
        wonDeals: wonDealsCount,
        lostDeals: lostDealsCount,
        revenue: {
            total: totalRevenue._sum.value || 0,
            monthly: monthlyRevenue._sum.value || 0,
            change: `${revenueChange >= 0 ? '+' : ''}${revenueChange}%`
        },
        conversionRate: {
            value: (wonDealsCount + lostDealsCount) > 0 ? ((wonDealsCount / (wonDealsCount + lostDealsCount)) * 100).toFixed(1) : 0,
            change: '+1.5%'
        },
        salespersonPerformance,
        recentActivities: activities
    };
};

const getDashboardTrends = async (companyId) => {
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const trends = [];

    // Get data for last 6 months
    for (let i = 5; i >= 0; i--) {
        const date = new Date();
        date.setMonth(date.getMonth() - i);
        const year = date.getFullYear();
        const month = date.getMonth();

        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0, 23, 59, 59);

        // Leads count for this month
        const leadsCount = await prisma.lead.count({
            where: {
                companyId,
                createdAt: {
                    gte: firstDay,
                    lte: lastDay
                }
            }
        });

        // Active deals count for this month
        const activeDealsCount = await prisma.deal.count({
            where: {
                companyId,
                stage: { notIn: ['Won', 'Lost'] },
                createdAt: {
                    gte: firstDay,
                    lte: lastDay
                }
            }
        });

        // Won and Lost deals for conversion rate
        const wonDealsCount = await prisma.deal.count({
            where: {
                companyId,
                stage: 'Won',
                createdAt: {
                    gte: firstDay,
                    lte: lastDay
                }
            }
        });

        const lostDealsCount = await prisma.deal.count({
            where: {
                companyId,
                stage: 'Lost',
                createdAt: {
                    gte: firstDay,
                    lte: lastDay
                }
            }
        });

        const totalDeals = wonDealsCount + lostDealsCount;
        const conversionRate = totalDeals > 0 ? ((wonDealsCount / totalDeals) * 100).toFixed(1) : 0;

        // Revenue for this month
        const revenueData = await prisma.deal.aggregate({
            where: {
                companyId,
                stage: 'Won',
                updatedAt: {
                    gte: firstDay,
                    lte: lastDay
                }
            },
            _sum: { value: true }
        });

        trends.push({
            month: monthNames[month],
            leads: leadsCount,
            conversion: parseFloat(conversionRate),
            deals: activeDealsCount,
            revenue: revenueData._sum.value || 0
        });
    }

    return trends;
};

module.exports = {
    getDashboardStats,
    getDashboardTrends
};
