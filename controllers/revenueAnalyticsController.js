import revenueAnalyticsService from '../services/revenueAnalyticsService.js';
import Order from '../models/Order.js';
import Product from '../models/Product.js';
import Coupon from '../models/Coupon.js';
import mongoose from 'mongoose';

/**
 * Revenue Analytics Controller
 * Handles all revenue and business analytics endpoints for admin dashboard
 */

// Get dashboard-specific analytics (simplified and fast)
export const getDashboardAnalytics = async (req, res) => {
  try {
    console.log('[DASHBOARD ANALYTICS] Getting dashboard analytics...');
    
    // Fetch all required data in parallel for better performance
    const [orders, products, coupons] = await Promise.all([
      Order.find({}).select('totalAmount status createdAt').lean(),
      Product.find({}).select('stock').lean(),
      Coupon.find({}).lean()
    ]);

    // Calculate order statistics
    const totalOrders = orders.length;
    const pendingOrders = orders.filter(order => order.status === 'Pending').length;
    const shippedOrders = orders.filter(order => order.status === 'Shipped').length;
    const deliveredOrders = orders.filter(order => order.status === 'Delivered').length;
    
    // Calculate revenue (only from delivered orders - already paid)
    const totalRevenue = orders
      .filter(order => order.status === 'Delivered')
      .reduce((sum, order) => sum + (order.totalAmount || 0), 0);
    
    // Calculate total income (from all orders including pending)
    const totalIncome = orders
      .reduce((sum, order) => sum + (order.totalAmount || 0), 0);
    
    // Get recent orders (last 5)
    const recentOrders = orders
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 5);
    
    // Calculate product statistics
    const totalProducts = products.length;
    const lowStockProducts = products.filter(product => (product.stock || 0) < 45).length;
    
    // Get coupons count
    const totalCoupons = coupons.length;
    
    const dashboardData = {
      totalProducts,
      totalOrders,
      totalCoupons,
      pendingOrders,
      shippedOrders,
      deliveredOrders,
      totalRevenue,
      totalIncome,
      lowStockProducts,
      recentOrders
    };
    
    res.status(200).json({
      success: true,
      data: dashboardData,
      message: 'Dashboard analytics retrieved successfully'
    });
    
  } catch (error) {
    console.error('[DASHBOARD ANALYTICS] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve dashboard analytics',
      error: error.message
    });
  }
};

// Get comprehensive revenue analytics
export const getRevenueAnalytics = async (req, res) => {
  try {
    console.log('[REVENUE CONTROLLER] Getting comprehensive revenue analytics...');
    
    const analytics = await revenueAnalyticsService.getComprehensiveAnalytics();
    
    res.status(200).json({
      success: true,
      data: analytics,
      message: 'Revenue analytics retrieved successfully'
    });
    
  } catch (error) {
    console.error('[REVENUE CONTROLLER] Error getting revenue analytics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve revenue analytics',
      error: error.message
    });
  }
};

// Get revenue analytics by date range
export const getRevenueAnalyticsByDateRange = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: 'Start date and end date are required'
      });
    }
    
    console.log(`[REVENUE CONTROLLER] Getting analytics for date range: ${startDate} to ${endDate}`);
    
    // Build date filter
    const dateFilter = {
      createdAt: {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      }
    };
    
    // Get orders in date range
    const orders = await Order.find(dateFilter)
      .select('totalAmount paymentMethod status paymentStatus items createdAt')
      .lean();
    
    // Calculate analytics for the filtered orders
    const analytics = await calculateAnalyticsForOrders(orders);
    
    res.status(200).json({
      success: true,
      data: {
        ...analytics,
        dateRange: { startDate, endDate },
        orderCount: orders.length
      },
      message: 'Date range analytics retrieved successfully'
    });
    
  } catch (error) {
    console.error('[REVENUE CONTROLLER] Error getting date range analytics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve date range analytics',
      error: error.message
    });
  }
};

// Get drill-down data for specific revenue categories
export const getRevenueDetailsByCategory = async (req, res) => {
  try {
    const { 
      category, // 'status', 'payment', 'timeline'
      filter,   // specific filter value
      page = 1, 
      limit = 20,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;
    
    console.log(`[REVENUE CONTROLLER] Getting drill-down data for category: ${category}, filter: ${filter}`);
    
    // Build query based on category and filter
    let query = {};
    
    switch (category) {
      case 'status':
        if (filter) query.status = filter;
        break;
      case 'payment':
        if (filter) query.paymentMethod = filter.toUpperCase();
        break;
      case 'payment-status':
        if (filter) query.paymentStatus = filter.toUpperCase();
        break;
      case 'pending-revenue':
        query.$and = [
          { $or: [
            { status: { $nin: ['delivered', 'cancelled', 'returned'] } },
            { paymentStatus: { $ne: 'PAID' } }
          ]}
        ];
        break;
      case 'received-revenue':
        query.$and = [
          { status: 'delivered' },
          { paymentStatus: 'PAID' }
        ];
        break;
      default:
        break;
    }
    
    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Get orders with pagination
    const [orders, totalCount] = await Promise.all([
      Order.find(query)
        .select('_id totalAmount paymentMethod status paymentStatus createdAt updatedAt user items')
        .populate('user', 'name email phone')
        .sort({ [sortBy]: sortOrder === 'desc' ? -1 : 1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Order.countDocuments(query)
    ]);
    
    // Calculate summary for this filtered set
    const totalAmount = orders.reduce((sum, order) => sum + (order.totalAmount || 0), 0);
    
    res.status(200).json({
      success: true,
      data: {
        orders,
        summary: {
          totalOrders: totalCount,
          totalAmount: Math.round(totalAmount * 100) / 100,
          averageOrderValue: totalCount > 0 ? Math.round((totalAmount / totalCount) * 100) / 100 : 0
        },
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(totalCount / parseInt(limit)),
          totalOrders: totalCount,
          hasNextPage: skip + orders.length < totalCount,
          hasPrevPage: parseInt(page) > 1
        },
        filters: { category, filter }
      },
      message: 'Revenue details retrieved successfully'
    });
    
  } catch (error) {
    console.error('[REVENUE CONTROLLER] Error getting revenue details:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve revenue details',
      error: error.message
    });
  }
};

// Get revenue trends (daily, weekly, monthly)
export const getRevenueTrends = async (req, res) => {
  try {
    const { period = 'daily', days = 30 } = req.query;
    
    console.log(`[REVENUE CONTROLLER] Getting revenue trends for period: ${period}, days: ${days}`);
    
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - parseInt(days));
    
    // Aggregation pipeline based on period
    let groupBy;
    switch (period) {
      case 'daily':
        groupBy = {
          year: { $year: '$createdAt' },
          month: { $month: '$createdAt' },
          day: { $dayOfMonth: '$createdAt' }
        };
        break;
      case 'weekly':
        groupBy = {
          year: { $year: '$createdAt' },
          week: { $week: '$createdAt' }
        };
        break;
      case 'monthly':
        groupBy = {
          year: { $year: '$createdAt' },
          month: { $month: '$createdAt' }
        };
        break;
      default:
        groupBy = {
          year: { $year: '$createdAt' },
          month: { $month: '$createdAt' },
          day: { $dayOfMonth: '$createdAt' }
        };
    }
    
    const trendData = await Order.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: groupBy,
          totalRevenue: { $sum: '$totalAmount' },
          orderCount: { $sum: 1 },
          avgOrderValue: { $avg: '$totalAmount' },
          upiRevenue: {
            $sum: {
              $cond: [
                { 
                  $or: [
                    { $eq: ['$paymentMethod', 'UPI'] },
                    { $eq: ['$paymentMethod', 'ONLINE'] }
                  ]
                }, 
                '$totalAmount', 
                0
              ]
            }
          },
          cashRevenue: {
            $sum: {
              $cond: [
                { 
                  $and: [
                    { $ne: ['$paymentMethod', 'UPI'] },
                    { $ne: ['$paymentMethod', 'ONLINE'] }
                  ]
                }, 
                '$totalAmount', 
                0
              ]
            }
          },
          deliveredRevenue: {
            $sum: {
              $cond: [{ $eq: ['$status', 'delivered'] }, '$totalAmount', 0]
            }
          }
        }
      },
      {
        $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1, '_id.week': 1 }
      }
    ]);
    
    res.status(200).json({
      success: true,
      data: {
        trends: trendData,
        period,
        dateRange: { startDate, endDate },
        summary: {
          totalDataPoints: trendData.length,
          totalRevenue: trendData.reduce((sum, item) => sum + item.totalRevenue, 0),
          totalOrders: trendData.reduce((sum, item) => sum + item.orderCount, 0)
        }
      },
      message: 'Revenue trends retrieved successfully'
    });
    
  } catch (error) {
    console.error('[REVENUE CONTROLLER] Error getting revenue trends:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve revenue trends',
      error: error.message
    });
  }
};

// Get top performing products by revenue
export const getTopPerformingProducts = async (req, res) => {
  try {
    const { limit = 10, period = 30 } = req.query;
    
    console.log(`[REVENUE CONTROLLER] Getting top performing products (last ${period} days)`);
    
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(period));
    
    const topProducts = await Order.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate },
          status: { $ne: 'cancelled' }
        }
      },
      { $unwind: '$items' },
      {
        $group: {
          _id: {
            productId: '$items.id',
            productName: '$items.name',
            type: '$items.type'
          },
          totalRevenue: { $sum: { $multiply: ['$items.price', '$items.qty'] } },
          totalQuantitySold: { $sum: '$items.qty' },
          orderCount: { $sum: 1 }
        }
      },
      { $sort: { totalRevenue: -1 } },
      { $limit: parseInt(limit) }
    ]);
    
    res.status(200).json({
      success: true,
      data: {
        topProducts,
        period: `${period} days`,
        summary: {
          totalProducts: topProducts.length,
          totalRevenue: topProducts.reduce((sum, product) => sum + product.totalRevenue, 0)
        }
      },
      message: 'Top performing products retrieved successfully'
    });
    
  } catch (error) {
    console.error('[REVENUE CONTROLLER] Error getting top performing products:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve top performing products',
      error: error.message
    });
  }
};

// Helper function to calculate analytics for a specific set of orders
const calculateAnalyticsForOrders = async (orders) => {
  const analytics = {
    summary: {
      totalOrders: orders.length,
      totalRevenue: 0,
      receivedRevenue: 0,
      pendingRevenue: 0
    },
    byStatus: {},
    byPaymentMethod: {
      UPI: { total: 0, received: 0, pending: 0 },
      CASH: { total: 0, received: 0, pending: 0 }
    }
  };
  
  for (const order of orders) {
    const amount = order.totalAmount || 0;
    const status = order.status?.toLowerCase() || 'pending';
    const originalPaymentMethod = order.paymentMethod?.toUpperCase() || 'CASH';
    
    // Fix payment method logic: UPI/ONLINE = UPI, everything else = CASH (COD)
    const paymentMethod = (originalPaymentMethod === 'UPI' || originalPaymentMethod === 'ONLINE') ? 'UPI' : 'CASH';
    const paymentStatus = order.paymentStatus?.toUpperCase() || 'PENDING';
    
    analytics.summary.totalRevenue += amount;
    
    if (status === 'delivered' && paymentStatus === 'PAID') {
      analytics.summary.receivedRevenue += amount;
    } else if (status !== 'cancelled' && status !== 'returned') {
      analytics.summary.pendingRevenue += amount;
    }
    
    // By status
    if (!analytics.byStatus[status]) {
      analytics.byStatus[status] = { count: 0, amount: 0 };
    }
    analytics.byStatus[status].count++;
    analytics.byStatus[status].amount += amount;
    
    // By payment method (fixed logic)
    if (analytics.byPaymentMethod[paymentMethod]) {
      analytics.byPaymentMethod[paymentMethod].total += amount;
      if (status === 'delivered' && paymentStatus === 'PAID') {
        analytics.byPaymentMethod[paymentMethod].received += amount;
      } else if (status !== 'cancelled' && status !== 'returned') {
        analytics.byPaymentMethod[paymentMethod].pending += amount;
      }
    }
  }
  
  return analytics;
};

export default {
  getDashboardAnalytics,
  getRevenueAnalytics,
  getRevenueAnalyticsByDateRange,
  getRevenueDetailsByCategory,
  getRevenueTrends,
  getTopPerformingProducts
};
