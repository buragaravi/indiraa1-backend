import Order from '../models/Order.js';
import User from '../models/User.js';
import Transaction from '../models/Transaction.js';

// Get comprehensive user analytics
export const getUserAnalytics = async (req, res) => {
  const { period = '30d' } = req.query;
  
  // Calculate date range based on period
  const now = new Date();
  let startDate;
  
  switch (period) {
    case '7d':
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case '30d':
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    case '90d':
      startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      break;
    case '1y':
      startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
      break;
    default:
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  }

  try {
    // Basic user counts
    const totalUsers = await User.countDocuments();
    const activeUsers = await User.countDocuments({ isActive: true });
    
    // New users by time period
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const thisWeek = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thisMonth = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
    
    const newUsersToday = await User.countDocuments({
      createdAt: { $gte: today }
    });
    
    const newUsersThisWeek = await User.countDocuments({
      createdAt: { $gte: thisWeek }
    });
    
    const newUsersThisMonth = await User.countDocuments({
      createdAt: { $gte: thisMonth }
    });

    // Order analytics
    const orderStats = await Order.aggregate([
      {
        $group: {
          _id: null,
          totalOrders: { $sum: 1 },
          totalRevenue: { $sum: '$totalAmount' },
          averageOrderValue: { $avg: '$totalAmount' }
        }
      }
    ]);

    const averageOrderValue = orderStats[0]?.averageOrderValue || 0;

    // User growth data (daily for selected period)
    const userGrowthData = await User.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: '%Y-%m-%d',
              date: '$createdAt'
            }
          },
          newUsers: { $sum: 1 }
        }
      },
      {
        $sort: { _id: 1 }
      },
      {
        $project: {
          date: '$_id',
          newUsers: 1,
          _id: 0
        }
      }
    ]);

    // Calculate cumulative total users for growth data
    let cumulativeUsers = await User.countDocuments({
      createdAt: { $lt: startDate }
    });

    const growthDataWithCumulative = userGrowthData.map(day => {
      cumulativeUsers += day.newUsers;
      return {
        ...day,
        totalUsers: cumulativeUsers
      };
    });

    // Top users by orders
    const topUsersByOrders = await Order.aggregate([
      {
        $group: {
          _id: '$userId',
          totalOrders: { $sum: 1 },
          totalSpent: { $sum: '$totalAmount' },
          lastOrderDate: { $max: '$placedAt' }
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'user'
        }
      },
      {
        $unwind: '$user'
      },
      {
        $project: {
          userId: '$_id',
          name: '$user.name',
          email: '$user.email',
          totalOrders: 1,
          totalSpent: 1,
          lastOrderDate: 1
        }
      },
      {
        $sort: { totalOrders: -1 }
      },
      {
        $limit: 10
      }
    ]);

    // Calculate average days between orders for top users
    const topUsersWithFrequency = await Promise.all(
      topUsersByOrders.map(async (user) => {
        const userOrders = await Order.find({ userId: user.userId })
          .sort({ placedAt: 1 })
          .select('placedAt');
        
        let totalDaysBetweenOrders = 0;
        let orderGaps = 0;
        
        for (let i = 1; i < userOrders.length; i++) {
          const daysBetween = Math.floor(
            (userOrders[i].placedAt - userOrders[i - 1].placedAt) / (1000 * 60 * 60 * 24)
          );
          totalDaysBetweenOrders += daysBetween;
          orderGaps++;
        }
        
        const averageDaysBetweenOrders = orderGaps > 0 
          ? Math.round(totalDaysBetweenOrders / orderGaps) 
          : 0;
        
        return {
          ...user,
          averageDaysBetweenOrders
        };
      })
    );

    // Top users by spending
    const topUsersBySpending = [...topUsersByOrders]
      .sort((a, b) => b.totalSpent - a.totalSpent)
      .slice(0, 10);

    // Order frequency distribution
    const allUsersWithOrders = await Order.aggregate([
      {
        $group: {
          _id: '$userId',
          orderDates: { $push: '$placedAt' }
        }
      }
    ]);

    const orderFrequencyDistribution = {
      '0-7 days': 0,
      '8-15 days': 0,
      '16-30 days': 0,
      '31-60 days': 0,
      '61+ days': 0,
      'Single order': 0
    };

    allUsersWithOrders.forEach(userOrders => {
      if (userOrders.orderDates.length === 1) {
        orderFrequencyDistribution['Single order']++;
      } else {
        const dates = userOrders.orderDates.sort();
        let totalDays = 0;
        let gaps = 0;
        
        for (let i = 1; i < dates.length; i++) {
          const daysBetween = Math.floor((dates[i] - dates[i - 1]) / (1000 * 60 * 60 * 24));
          totalDays += daysBetween;
          gaps++;
        }
        
        const averageDays = gaps > 0 ? totalDays / gaps : 0;
        
        if (averageDays <= 7) {
          orderFrequencyDistribution['0-7 days']++;
        } else if (averageDays <= 15) {
          orderFrequencyDistribution['8-15 days']++;
        } else if (averageDays <= 30) {
          orderFrequencyDistribution['16-30 days']++;
        } else if (averageDays <= 60) {
          orderFrequencyDistribution['31-60 days']++;
        } else {
          orderFrequencyDistribution['61+ days']++;
        }
      }
    });

    const orderFrequencyData = Object.entries(orderFrequencyDistribution).map(([daysRange, userCount]) => ({
      daysRange,
      userCount,
      percentage: totalUsers > 0 ? (userCount / totalUsers) * 100 : 0
    }));

    // Wallet statistics
    const walletStats = await User.aggregate([
      {
        $group: {
          _id: null,
          totalWalletBalance: { $sum: '$wallet.balance' },
          totalCoinsDistributed: { $sum: '$wallet.totalEarned' },
          totalCoinsRedeemed: { $sum: '$wallet.totalSpent' },
          averageWalletBalance: { $avg: '$wallet.balance' }
        }
      }
    ]);

    const walletData = walletStats[0] || {
      totalWalletBalance: 0,
      totalCoinsDistributed: 0,
      totalCoinsRedeemed: 0,
      averageWalletBalance: 0
    };

    // Referral statistics
    const referralStats = await User.aggregate([
      {
        $group: {
          _id: null,
          totalReferrals: { $sum: '$referralStats.totalReferrals' },
          successfulReferrals: { $sum: '$referralStats.successfulReferrals' },
          totalReferralRewards: { $sum: '$referralStats.coinsEarnedFromReferrals' }
        }
      }
    ]);

    const referralData = referralStats[0] || {
      totalReferrals: 0,
      successfulReferrals: 0,
      totalReferralRewards: 0
    };

    // Top referrers
    const topReferrers = await User.find({
      'referralStats.totalReferrals': { $gt: 0 }
    })
      .sort({ 'referralStats.totalReferrals': -1 })
      .limit(10)
      .select('name referralCode referralStats')
      .lean();

    const topReferrersFormatted = topReferrers.map(user => ({
      userId: user._id,
      name: user.name,
      referralCode: user.referralCode,
      totalReferrals: user.referralStats.totalReferrals,
      totalRewards: user.referralStats.coinsEarnedFromReferrals
    }));

    // Calculate average order frequency across all users
    const averageOrderFrequency = allUsersWithOrders.length > 0
      ? allUsersWithOrders.reduce((sum, user) => {
          if (user.orderDates.length <= 1) return sum;
          
          const dates = user.orderDates.sort();
          let totalDays = 0;
          let gaps = 0;
          
          for (let i = 1; i < dates.length; i++) {
            const daysBetween = Math.floor((dates[i] - dates[i - 1]) / (1000 * 60 * 60 * 24));
            totalDays += daysBetween;
            gaps++;
          }
          
          return sum + (gaps > 0 ? totalDays / gaps : 0);
        }, 0) / allUsersWithOrders.filter(u => u.orderDates.length > 1).length
      : 0;

    const analyticsData = {
      totalUsers,
      activeUsers,
      newUsersToday,
      newUsersThisWeek,
      newUsersThisMonth,
      averageOrderValue,
      averageOrderFrequency: Math.round(averageOrderFrequency),
      topUsersByOrders: topUsersWithFrequency,
      topUsersBySpending,
      userGrowthData: growthDataWithCumulative,
      orderFrequencyData,
      walletStats: walletData,
      referralStats: {
        ...referralData,
        topReferrers: topReferrersFormatted
      }
    };

    res.json(analyticsData);
  } catch (error) {
    console.error('Error fetching user analytics:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch user analytics' 
    });
  }
};

// Get users with advanced filtering and pagination
export const getUsers = async (req, res) => {
  const {
    search,
    role,
    isActive,
    hasOrders,
    walletBalanceMin,
    walletBalanceMax,
    dateFrom,
    dateTo,
    sortBy = 'createdAt',
    sortOrder = 'desc',
    page = 1,
    limit = 20
  } = req.query;

  try {
    // Build filter object
    const filter = {};

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
        { username: { $regex: search, $options: 'i' } }
      ];
    }

    if (role) {
      filter.role = role;
    }

    if (isActive !== undefined) {
      filter.isActive = isActive === 'true';
    }

    if (walletBalanceMin || walletBalanceMax) {
      filter['wallet.balance'] = {};
      if (walletBalanceMin) {
        filter['wallet.balance'].$gte = parseFloat(walletBalanceMin);
      }
      if (walletBalanceMax) {
        filter['wallet.balance'].$lte = parseFloat(walletBalanceMax);
      }
    }

    if (dateFrom || dateTo) {
      filter.createdAt = {};
      if (dateFrom) {
        filter.createdAt.$gte = new Date(dateFrom);
      }
      if (dateTo) {
        filter.createdAt.$lte = new Date(dateTo);
      }
    }

    // Handle users with orders filter
    let userIds = null;
    if (hasOrders === 'true') {
      const usersWithOrders = await Order.distinct('userId');
      userIds = usersWithOrders;
      filter._id = { $in: userIds };
    } else if (hasOrders === 'false') {
      const usersWithOrders = await Order.distinct('userId');
      filter._id = { $nin: usersWithOrders };
    }

    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

    // Execute query with pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const [users, total] = await Promise.all([
      User.find(filter)
        .select('-password')
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      User.countDocuments(filter)
    ]);

    // Add order counts and last login info for each user
    const usersWithStats = await Promise.all(
      users.map(async (user) => {
        const orderCount = await Order.countDocuments({ userId: user._id });
        const totalSpent = await Order.aggregate([
          { $match: { userId: user._id } },
          { $group: { _id: null, total: { $sum: '$totalAmount' } } }
        ]);
        
        return {
          ...user,
          orderCount,
          totalSpent: totalSpent[0]?.total || 0,
          userId: user._id // Add for frontend compatibility
        };
      })
    );

    const totalPages = Math.ceil(total / parseInt(limit));

    res.json({
      users: usersWithStats,
      total,
      page: parseInt(page),
      totalPages,
      hasMore: parseInt(page) < totalPages
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch users' 
    });
  }
};

// Update user status (activate/deactivate)
export const updateUserStatus = async (req, res) => {
  const { id } = req.params;
  const { isActive } = req.body;

  try {
    const user = await User.findByIdAndUpdate(
      id,
      { isActive },
      { new: true, select: '-password' }
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      message: `User ${isActive ? 'activated' : 'deactivated'} successfully`,
      user
    });
  } catch (error) {
    console.error('Error updating user status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update user status'
    });
  }
};

// Export users data
export const exportUsers = async (req, res) => {
  const { userIds, ...filters } = req.query;

  try {
    let query = {};
    
    if (userIds) {
      // Export specific users
      const ids = userIds.split(',');
      query._id = { $in: ids };
    } else {
      // Export with filters (same as getUsers function)
      const {
        search,
        role,
        isActive,
        hasOrders,
        walletBalanceMin,
        walletBalanceMax,
        dateFrom,
        dateTo
      } = filters;

      if (search) {
        query.$or = [
          { name: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } },
          { phone: { $regex: search, $options: 'i' } },
          { username: { $regex: search, $options: 'i' } }
        ];
      }

      if (role) query.role = role;
      if (isActive !== undefined) query.isActive = isActive === 'true';

      if (walletBalanceMin || walletBalanceMax) {
        query['wallet.balance'] = {};
        if (walletBalanceMin) query['wallet.balance'].$gte = parseFloat(walletBalanceMin);
        if (walletBalanceMax) query['wallet.balance'].$lte = parseFloat(walletBalanceMax);
      }

      if (dateFrom || dateTo) {
        query.createdAt = {};
        if (dateFrom) query.createdAt.$gte = new Date(dateFrom);
        if (dateTo) query.createdAt.$lte = new Date(dateTo);
      }

      if (hasOrders === 'true') {
        const usersWithOrders = await Order.distinct('userId');
        query._id = { $in: usersWithOrders };
      } else if (hasOrders === 'false') {
        const usersWithOrders = await Order.distinct('userId');
        query._id = { $nin: usersWithOrders };
      }
    }

    const users = await User.find(query)
      .select('-password')
      .sort({ createdAt: -1 })
      .lean();

    // Add order statistics for each user
    const usersWithStats = await Promise.all(
      users.map(async (user) => {
        const orderStats = await Order.aggregate([
          { $match: { userId: user._id } },
          {
            $group: {
              _id: null,
              totalOrders: { $sum: 1 },
              totalSpent: { $sum: '$totalAmount' },
              lastOrderDate: { $max: '$placedAt' }
            }
          }
        ]);

        const stats = orderStats[0] || { totalOrders: 0, totalSpent: 0, lastOrderDate: null };

        return {
          'User ID': user._id,
          'Name': user.name,
          'Username': user.username,
          'Email': user.email,
          'Phone': user.phone,
          'Role': user.role || 'user',
          'Status': user.isActive ? 'Active' : 'Inactive',
          'Wallet Balance': user.wallet?.balance || 0,
          'Total Earned': user.wallet?.totalEarned || 0,
          'Total Spent': user.wallet?.totalSpent || 0,
          'Total Orders': stats.totalOrders,
          'Total Order Value': stats.totalSpent,
          'Last Order Date': stats.lastOrderDate ? new Date(stats.lastOrderDate).toLocaleDateString() : 'Never',
          'Referral Code': user.referralCode || '',
          'Total Referrals': user.referralStats?.totalReferrals || 0,
          'Successful Referrals': user.referralStats?.successfulReferrals || 0,
          'Referral Earnings': user.referralStats?.coinsEarnedFromReferrals || 0,
          'Join Date': new Date(user.createdAt).toLocaleDateString(),
          'Last Login': user.lastLogin ? new Date(user.lastLogin).toLocaleDateString() : 'Never',
          'Address Count': user.addresses?.length || 0,
          'Notifications - Orders': user.notificationPreferences?.orders ? 'Yes' : 'No',
          'Notifications - Offers': user.notificationPreferences?.offers ? 'Yes' : 'No',
          'Notifications - General': user.notificationPreferences?.general ? 'Yes' : 'No',
          'Notifications - Promotional': user.notificationPreferences?.promotional ? 'Yes' : 'No'
        };
      })
    );

    // In a real implementation, you would generate a CSV/Excel file and return a download URL
    // For now, we'll return a success message with the data count
    res.json({
      success: true,
      message: `${usersWithStats.length} users exported successfully`,
      downloadUrl: `/downloads/users-export-${Date.now()}.csv`, // Mock download URL
      data: usersWithStats // In production, you might not return the full data
    });
  } catch (error) {
    console.error('Error exporting users:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to export users'
    });
  }
};

export default {
  getUserAnalytics,
  getUsers,
  updateUserStatus,
  exportUsers
};
