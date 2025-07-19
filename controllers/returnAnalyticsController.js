import Return from '../models/Return.js';
import Order from '../models/Order.js';
import Transaction from '../models/Transaction.js';

// Return Analytics & Reports

// Return Analytics Dashboard
export const getReturnAnalytics = async (req, res) => {
  try {
    const { period = 30, groupBy = 'day' } = req.query;

    // Calculate date range
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(period));

    // Summary Statistics
    const summary = await Return.aggregate([
      {
        $match: {
          requestedAt: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: null,
          totalReturns: { $sum: 1 },
          completedReturns: {
            $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
          },
          totalRefundAmount: {
            $sum: {
              $cond: [
                { $ne: ['$refund.processing.coinsCredited', null] },
                { $divide: ['$refund.processing.coinsCredited', 5] },
                0
              ]
            }
          },
          avgProcessingTime: {
            $avg: {
              $cond: [
                { $ne: ['$metrics.totalProcessingTime', null] },
                '$metrics.totalProcessingTime',
                null
              ]
            }
          }
        }
      }
    ]);

    // Calculate return rate
    const totalOrders = await Order.countDocuments({
      placedAt: { $gte: startDate, $lte: endDate },
      status: 'Delivered'
    });

    const returnRate = totalOrders > 0 ? 
      ((summary[0]?.totalReturns || 0) / totalOrders * 100).toFixed(2) : 0;

    // Trend Analysis
    const trendData = await Return.aggregate([
      {
        $match: {
          requestedAt: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$requestedAt' },
            month: { $month: '$requestedAt' },
            day: groupBy === 'day' ? { $dayOfMonth: '$requestedAt' } : null
          },
          returns: { $sum: 1 },
          completed: {
            $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
          },
          refundAmount: {
            $sum: {
              $cond: [
                { $ne: ['$refund.processing.coinsCredited', null] },
                { $divide: ['$refund.processing.coinsCredited', 5] },
                0
              ]
            }
          }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } }
    ]);

    // Return Reason Breakdown
    const reasonBreakdown = await Return.aggregate([
      {
        $match: {
          requestedAt: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: '$returnReason',
          count: { $sum: 1 },
          percentage: { $sum: 1 }
        }
      },
      {
        $addFields: {
          percentage: {
            $multiply: [
              { $divide: ['$count', summary[0]?.totalReturns || 1] },
              100
            ]
          }
        }
      },
      { $sort: { count: -1 } }
    ]);

    // Warehouse Performance
    const warehousePerformance = await Return.aggregate([
      {
        $match: {
          requestedAt: { $gte: startDate, $lte: endDate },
          'warehouseManagement.assignedManager': { $exists: true }
        }
      },
      {
        $group: {
          _id: '$warehouseManagement.assignedManager',
          totalAssigned: { $sum: 1 },
          completed: {
            $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
          },
          avgAssessmentTime: {
            $avg: '$metrics.qualityAssessmentTime'
          },
          approvalRate: {
            $avg: {
              $cond: [
                { $eq: ['$refund.warehouseRecommendation.recommendation', 'approve_full'] },
                100,
                {
                  $cond: [
                    { $eq: ['$refund.warehouseRecommendation.recommendation', 'approve_partial'] },
                    50,
                    0
                  ]
                }
              ]
            }
          }
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'manager'
        }
      },
      {
        $addFields: {
          managerName: { $arrayElemAt: ['$manager.name', 0] },
          efficiency: {
            $multiply: [
              { $divide: ['$completed', '$totalAssigned'] },
              100
            ]
          }
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        summary: {
          totalReturns: summary[0]?.totalReturns || 0,
          returnRate: parseFloat(returnRate),
          avgProcessingTime: Math.round(summary[0]?.avgProcessingTime || 0),
          totalRefunded: Math.round(summary[0]?.totalRefundAmount || 0)
        },
        trends: trendData,
        reasonBreakdown: reasonBreakdown,
        warehousePerformance: warehousePerformance
      }
    });

  } catch (error) {
    console.error('Error fetching return analytics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch return analytics',
      error: error.message
    });
  }
};

// Return Reports
export const getReturnReports = async (req, res) => {
  try {
    const { 
      type = 'summary', 
      format = 'json', 
      dateFrom, 
      dateTo,
      status,
      returnReason
    } = req.query;

    // Build query
    const query = {};
    
    if (dateFrom || dateTo) {
      query.requestedAt = {};
      if (dateFrom) query.requestedAt.$gte = new Date(dateFrom);
      if (dateTo) query.requestedAt.$lte = new Date(dateTo);
    }
    
    if (status) query.status = status;
    if (returnReason) query.returnReason = returnReason;

    let reportData = {};

    switch (type) {
      case 'summary':
        reportData = await generateSummaryReport(query);
        break;
      case 'detailed':
        reportData = await generateDetailedReport(query);
        break;
      case 'financial':
        reportData = await generateFinancialReport(query);
        break;
      case 'performance':
        reportData = await generatePerformanceReport(query);
        break;
      default:
        return res.status(400).json({
          success: false,
          message: 'Invalid report type'
        });
    }

    res.json({
      success: true,
      data: reportData
    });

  } catch (error) {
    console.error('Error generating return report:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate return report',
      error: error.message
    });
  }
};

// Product Return Analysis
export const getProductReturnAnalysis = async (req, res) => {
  try {
    const { period = 90 } = req.query;

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(period));

    // Product-wise return analysis
    const productAnalysis = await Return.aggregate([
      {
        $match: {
          requestedAt: { $gte: startDate, $lte: endDate }
        }
      },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.productId',
          productName: { $first: '$items.productName' },
          totalReturns: { $sum: 1 },
          totalQuantity: { $sum: '$items.quantity' },
          reasons: { $push: '$returnReason' },
          avgOriginalPrice: { $avg: '$items.originalPrice' }
        }
      },
      {
        $lookup: {
          from: 'products',
          localField: '_id',
          foreignField: '_id',
          as: 'product'
        }
      },
      {
        $addFields: {
          productDetails: { $arrayElemAt: ['$product', 0] }
        }
      },
      { $sort: { totalReturns: -1 } },
      { $limit: 50 }
    ]);

    // Category-wise analysis
    const categoryAnalysis = await Return.aggregate([
      {
        $match: {
          requestedAt: { $gte: startDate, $lte: endDate }
        }
      },
      { $unwind: '$items' },
      {
        $lookup: {
          from: 'products',
          localField: 'items.productId',
          foreignField: '_id',
          as: 'product'
        }
      },
      {
        $group: {
          _id: { $arrayElemAt: ['$product.category', 0] },
          totalReturns: { $sum: 1 },
          avgRefundAmount: {
            $avg: { $multiply: ['$items.originalPrice', '$items.quantity'] }
          }
        }
      },
      { $sort: { totalReturns: -1 } }
    ]);

    res.json({
      success: true,
      data: {
        productAnalysis: productAnalysis,
        categoryAnalysis: categoryAnalysis,
        period: period,
        generatedAt: new Date()
      }
    });

  } catch (error) {
    console.error('Error fetching product return analysis:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch product return analysis',
      error: error.message
    });
  }
};

// Customer Return Behavior
export const getCustomerReturnBehavior = async (req, res) => {
  try {
    const { period = 180 } = req.query;

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(period));

    // Customer behavior analysis
    const customerBehavior = await Return.aggregate([
      {
        $match: {
          requestedAt: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: '$customerId',
          totalReturns: { $sum: 1 },
          totalRefundAmount: {
            $sum: {
              $cond: [
                { $ne: ['$refund.processing.coinsCredited', null] },
                { $divide: ['$refund.processing.coinsCredited', 5] },
                0
              ]
            }
          },
          reasons: { $push: '$returnReason' },
          avgProcessingTime: { $avg: '$metrics.totalProcessingTime' },
          firstReturn: { $min: '$requestedAt' },
          lastReturn: { $max: '$requestedAt' }
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'customer'
        }
      },
      {
        $addFields: {
          customerInfo: { $arrayElemAt: ['$customer', 0] },
          isRepeatReturner: { $gt: ['$totalReturns', 1] }
        }
      },
      { $sort: { totalReturns: -1 } },
      { $limit: 100 }
    ]);

    // Repeat returner statistics
    const repeatReturners = customerBehavior.filter(c => c.isRepeatReturner);
    const repeatReturnerRate = (repeatReturners.length / customerBehavior.length * 100).toFixed(2);

    res.json({
      success: true,
      data: {
        customerBehavior: customerBehavior,
        statistics: {
          totalCustomersWithReturns: customerBehavior.length,
          repeatReturners: repeatReturners.length,
          repeatReturnerRate: parseFloat(repeatReturnerRate),
          avgReturnsPerCustomer: (customerBehavior.reduce((sum, c) => sum + c.totalReturns, 0) / customerBehavior.length).toFixed(2)
        }
      }
    });

  } catch (error) {
    console.error('Error fetching customer return behavior:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch customer return behavior',
      error: error.message
    });
  }
};

// Helper Functions for Report Generation

const generateSummaryReport = async (query) => {
  const summary = await Return.aggregate([
    { $match: query },
    {
      $group: {
        _id: null,
        totalReturns: { $sum: 1 },
        approvedReturns: {
          $sum: { $cond: [{ $ne: ['$status', 'rejected'] }, 1, 0] }
        },
        completedReturns: {
          $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
        },
        totalRefundAmount: {
          $sum: {
            $cond: [
              { $ne: ['$refund.processing.coinsCredited', null] },
              { $divide: ['$refund.processing.coinsCredited', 5] },
              0
            ]
          }
        }
      }
    }
  ]);

  return {
    reportType: 'Summary Report',
    data: summary[0] || {},
    generatedAt: new Date()
  };
};

const generateDetailedReport = async (query) => {
  const detailed = await Return.find(query)
    .populate('customerId', 'name email')
    .populate('orderId', 'totalAmount placedAt')
    .select('returnRequestId status returnReason requestedAt completedAt refund.processing.coinsCredited')
    .sort({ requestedAt: -1 })
    .limit(1000);

  return {
    reportType: 'Detailed Report',
    data: detailed,
    count: detailed.length,
    generatedAt: new Date()
  };
};

const generateFinancialReport = async (query) => {
  const financial = await Return.aggregate([
    { $match: query },
    {
      $group: {
        _id: {
          year: { $year: '$requestedAt' },
          month: { $month: '$requestedAt' }
        },
        totalRefunds: {
          $sum: {
            $cond: [
              { $ne: ['$refund.processing.coinsCredited', null] },
              { $divide: ['$refund.processing.coinsCredited', 5] },
              0
            ]
          }
        },
        returnCount: { $sum: 1 }
      }
    },
    { $sort: { '_id.year': 1, '_id.month': 1 } }
  ]);

  return {
    reportType: 'Financial Report',
    data: financial,
    generatedAt: new Date()
  };
};

const generatePerformanceReport = async (query) => {
  const performance = await Return.aggregate([
    { $match: query },
    {
      $group: {
        _id: '$warehouseManagement.assignedManager',
        totalAssigned: { $sum: 1 },
        completed: {
          $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
        },
        avgProcessingTime: { $avg: '$metrics.totalProcessingTime' }
      }
    },
    {
      $lookup: {
        from: 'users',
        localField: '_id',
        foreignField: '_id',
        as: 'manager'
      }
    }
  ]);

  return {
    reportType: 'Performance Report',
    data: performance,
    generatedAt: new Date()
  };
};
