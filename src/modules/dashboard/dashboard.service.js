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

const getGlobalDashboardStats = async () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const firstDayOfLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const lastDayOfLastMonth = new Date(today.getFullYear(), today.getMonth(), 0);

    // 1. Companies Stats
    const totalCompanies = await prisma.company.count();
    const activeCompanies = await prisma.company.count({ where: { status: 'active' } });
    const inactiveCompanies = totalCompanies - activeCompanies;

    const companiesLastMonth = await prisma.company.count({
        where: {
            createdAt: { gte: firstDayOfLastMonth, lte: lastDayOfLastMonth }
        }
    });
    const companiesThisMonth = await prisma.company.count({
        where: {
            createdAt: { gte: firstDayOfMonth }
        }
    });
    const companiesChange = companiesLastMonth > 0
        ? (((companiesThisMonth - companiesLastMonth) / companiesLastMonth) * 100).toFixed(1)
        : '0';

    // 2. User Stats
    const totalUsers = await prisma.user.count();
    const activeUsers = await prisma.user.count({ where: { status: 'active' } });
    const inactiveUsers = totalUsers - activeUsers;

    const usersLastMonth = await prisma.user.count({
        where: {
            createdAt: { gte: firstDayOfLastMonth, lte: lastDayOfLastMonth }
        }
    });
    const usersThisMonth = await prisma.user.count({
        where: {
            createdAt: { gte: firstDayOfMonth }
        }
    });

    const usersChange = usersLastMonth > 0
        ? (((usersThisMonth - usersLastMonth) / usersLastMonth) * 100).toFixed(1)
        : '0';

    // 3. Revenue Stats
    const totalRevenue = await prisma.deal.aggregate({
        where: { stage: 'Won' },
        _sum: { value: true }
    });

    const monthlyRevenue = await prisma.deal.aggregate({
        where: { stage: 'Won', updatedAt: { gte: firstDayOfMonth } },
        _sum: { value: true }
    });

    const lastMonthRevenue = await prisma.deal.aggregate({
        where: { stage: 'Won', updatedAt: { gte: firstDayOfLastMonth, lte: lastDayOfLastMonth } },
        _sum: { value: true }
    });

    const revenueChange = (lastMonthRevenue._sum.value || 0) > 0
        ? (((monthlyRevenue._sum.value || 0) - (lastMonthRevenue._sum.value || 0)) / (lastMonthRevenue._sum.value || 0) * 100).toFixed(1)
        : '0';

    // 4. Featured Companies (highest user count or revenue)
    const featuredCompaniesRaw = await prisma.company.findMany({
        take: 4,
        include: {
            _count: {
                select: { users: true, deals: true }
            },
            deals: {
                where: { stage: 'Won' },
                select: { value: true }
            }
        },
        orderBy: { users: { _count: 'desc' } }
    });

    const featuredCompanies = featuredCompaniesRaw.map(c => {
        const companyRevenue = c.deals.reduce((sum, d) => sum + (d.value || 0), 0);
        const wonDealsCount = c.deals.length;
        // Need to check total deals to calculate conversion rate
        return {
            id: c.id,
            name: c.name,
            users: c._count.users,
            revenue: companyRevenue,
            deals: c._count.deals,
            conversionRate: c._count.deals > 0 ? ((wonDealsCount / c._count.deals) * 100).toFixed(1) : 0,
            trend: 'up'
        };
    });

    // 5. Recent System Activities
    const recentCompanies = await prisma.company.findMany({
        take: 3,
        orderBy: { createdAt: 'desc' },
    });

    const recentUsers = await prisma.user.findMany({
        take: 3,
        orderBy: { createdAt: 'desc' },
    });

    const activities = [
        ...recentCompanies.map(c => ({
            id: `comp-${c.id}`,
            type: 'company_added',
            title: `New company '${c.name}' registered`,
            time: c.createdAt,
            user: 'System'
        })),
        ...recentUsers.map(u => ({
            id: `user-${u.id}`,
            type: 'user_added',
            title: `New user '${u.fullName}' joined`,
            time: u.createdAt,
            user: 'System'
        }))
    ].sort((a, b) => new Date(b.time) - new Date(a.time)).slice(0, 5);

    return {
        stats: {
            totalCompanies: { count: totalCompanies, active: activeCompanies, inactive: inactiveCompanies, change: `${companiesChange >= 0 ? '+' : ''}${companiesChange}%`, trend: companiesChange >= 0 ? 'up' : 'down' },
            totalUsers: { count: totalUsers, active: activeUsers, inactive: inactiveUsers, change: `${usersChange >= 0 ? '+' : ''}${usersChange}%`, trend: usersChange >= 0 ? 'up' : 'down' },
            activeSubscriptions: { count: totalCompanies, trial: 0, paid: totalCompanies, change: '+0%', trend: 'up' }, // Dummy for now
            revenue: { total: totalRevenue._sum.value || 0, monthly: monthlyRevenue._sum.value || 0, change: `${revenueChange >= 0 ? '+' : ''}${revenueChange}%`, trend: revenueChange >= 0 ? 'up' : 'down' },
        },
        featuredCompanies,
        recentActivities: activities
    };
};

const getGlobalDashboardTrends = async () => {
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const trends = [];

    for (let i = 5; i >= 0; i--) {
        const date = new Date();
        date.setMonth(date.getMonth() - i);
        const year = date.getFullYear();
        const month = date.getMonth();

        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0, 23, 59, 59);

        const companiesCount = await prisma.company.count({
            where: { createdAt: { gte: firstDay, lte: lastDay } }
        });

        const usersCount = await prisma.user.count({
            where: { createdAt: { gte: firstDay, lte: lastDay } }
        });

        trends.push({
            month: monthNames[month],
            companies: companiesCount,
            users: usersCount
        });
    }

    return trends;
};

const getGlobalActivities = async (page = 1, limit = 50) => {
    const p = parseInt(page) || 1;
    const l = parseInt(limit) || 50;
    const skip = (p - 1) * l;

    const [companies, users, totalCompanies, totalUsers] = await Promise.all([
        prisma.company.findMany({
            orderBy: { createdAt: 'desc' },
            take: skip + l,
        }),
        prisma.user.findMany({
            orderBy: { createdAt: 'desc' },
            take: skip + l,
        }),
        prisma.company.count(),
        prisma.user.count()
    ]);
    console.log(`DB Query Result - Companies: ${companies.length}, Users: ${users.length}`);


    const activities = [
        ...companies.map(c => ({
            id: `comp-${c.id}`,
            type: 'company_added',
            title: `New company '${c.name}' registered`,
            time: c.createdAt,
            user: 'System',
            details: {
                name: c.name,
                email: c.email
            }
        })),
        ...users.map(u => ({
            id: `user-${u.id}`,
            type: 'user_added',
            title: `New user '${u.fullName}' joined`,
            time: u.createdAt,
            user: 'System',
            details: {
                name: u.fullName,
                email: u.email,
                role: u.role
            }
        }))
    ].sort((a, b) => new Date(b.time) - new Date(a.time));

    return {
        activities: activities.slice(skip, skip + limit),
        pagination: {
            page: p,
            limit: l,
            totalResources: totalCompanies + totalUsers,
            showingMax: activities.length
        }
    };
};

module.exports = {
    getDashboardStats,
    getDashboardTrends,
    getGlobalDashboardStats,
    getGlobalDashboardTrends,
    getGlobalActivities
};


