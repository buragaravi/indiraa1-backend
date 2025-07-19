/**
 * Return Analytics and Reporting Service
 * Provides comprehensive analytics and reporting capabilities for the return system
 */

import { Return } from '../models/Return.js';
import { Order } from '../models/Order.js';
import { Transaction } from '../models/Transaction.js';
import { User } from '../models/User.js';

class ReturnAnalyticsService {
  /**
   * Get comprehensive return analytics dashboard data
   */
  async getDashboardAnalytics(timeframe = '30d', adminId = null) {
    const dateFilter = this._getDateFilter(timeframe);
    
    const analytics = await Promise.all([
      this._getReturnOverview(dateFilter),
      this._getReturnTrends(dateFilter),
      this._getReturnReasons(dateFilter),
      this._getPerformanceMetrics(dateFilter),
      this._getRefundAnalytics(dateFilter),
      this._getWarehouseMetrics(dateFilter),
      this._getTopReturnedProducts(dateFilter)
    ]);

    return {
      overview: analytics[0],
      trends: analytics[1],
      reasons: analytics[2],
      performance: analytics[3],
      refunds: analytics[4],
      warehouse: analytics[5],
      topReturnedProducts: analytics[6],
      generatedAt: new Date(),
      timeframe: timeframe
    };
  }

  /**
   * Get return overview statistics
   */
  async _getReturnOverview(dateFilter) {
    const pipeline = [
      { $match: { ...dateFilter } },
      {
        $group: {
          _id: null,
          totalReturns: { $sum: 1 },
          pendingReturns: {
            $sum: {
              $cond: [
                { $in: ['$status', ['requested', 'admin_review', 'approved', 'warehouse_assigned', 'pickup_scheduled']] },
                1, 0
              ]
            }
          },
          inProgressReturns: {
            $sum: {
              $cond: [
                { $in: ['$status', ['picked_up', 'in_warehouse', 'quality_checked']] },
                1, 0
              ]
            }
          },
          completedReturns: {
            $sum: {
              $cond: [{ $eq: ['$status', 'completed'] }, 1, 0]
            }
          },
          rejectedReturns: {
            $sum: {
              $cond: [{ $eq: ['$status', 'rejected'] }, 1, 0]
            }
          },
          totalRefundAmount: {
            $sum: {
              $cond: [
                { $eq: ['$status', 'completed'] },
                '$refund.processing.finalAmount',
                0
              ]
            }
          },
          totalCoinRefunds: {
            $sum: {
              $cond: [
                { $eq: ['$status', 'completed'] },
                '$refund.processing.coinRefund',
                0
              ]
            }
          }
        }
      }
    ];

    const result = await Return.aggregate(pipeline);
    const overview = result[0] || {
      totalReturns: 0,
      pendingReturns: 0,
      inProgressReturns: 0,
      completedReturns: 0,
      rejectedReturns: 0,
      totalRefundAmount: 0,
      totalCoinRefunds: 0
    };

    // Calculate rates
    overview.completionRate = overview.totalReturns > 0 ? 
      ((overview.completedReturns / overview.totalReturns) * 100).toFixed(1) : 0;
    overview.rejectionRate = overview.totalReturns > 0 ? 
      ((overview.rejectedReturns / overview.totalReturns) * 100).toFixed(1) : 0;

    return overview;
  }

  /**
   * Get return trends over time
   */
  async _getReturnTrends(dateFilter) {
    const pipeline = [
      { $match: { ...dateFilter } },
      {
        $group: {
          _id: {
            year: { $year: '$requestedAt' },
            month: { $month: '$requestedAt' },
            day: { $dayOfMonth: '$requestedAt' }
          },
          returns: { $sum: 1 },
          completed: {
            $sum: {
              $cond: [{ $eq: ['$status', 'completed'] }, 1, 0]
            }
          },
          rejected: {
            $sum: {
              $cond: [{ $eq: ['$status', 'rejected'] }, 1, 0]
            }
          },
          refundAmount: {
            $sum: {
              $cond: [
                { $eq: ['$status', 'completed'] },
                '$refund.processing.finalAmount',
                0
              ]
            }
          }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } }
    ];

    const trends = await Return.aggregate(pipeline);
    
    return trends.map(trend => ({
      date: new Date(trend._id.year, trend._id.month - 1, trend._id.day),
      returns: trend.returns,
      completed: trend.completed,
      rejected: trend.rejected,
      refundAmount: trend.refundAmount,
      completionRate: trend.returns > 0 ? 
        ((trend.completed / trend.returns) * 100).toFixed(1) : 0
    }));
  }

  /**
   * Get return reasons analysis
   */
  async _getReturnReasons(dateFilter) {
    const pipeline = [
      { $match: { ...dateFilter } },
      {
        $group: {
          _id: '$returnReason',
          count: { $sum: 1 },
          completed: {
            $sum: {
              $cond: [{ $eq: ['$status', 'completed'] }, 1, 0]
            }
          },
          rejected: {
            $sum: {
              $cond: [{ $eq: ['$status', 'rejected'] }, 1, 0]
            }
          },
          avgProcessingTime: {
            $avg: {
              $cond: [
                { $and: [
                  { $ne: ['$requestedAt', null] },
                  { $ne: ['$completedAt', null] }
                ]},
                { $subtract: ['$completedAt', '$requestedAt'] },
                null
              ]
            }
          },
          totalRefundAmount: {
            $sum: {
              $cond: [
                { $eq: ['$status', 'completed'] },
                '$refund.processing.finalAmount',
                0
              ]
            }
          }
        }
      },
      { $sort: { count: -1 } }
    ];

    const reasons = await Return.aggregate(pipeline);
    
    return reasons.map(reason => ({
      reason: reason._id,
      count: reason.count,
      completed: reason.completed,
      rejected: reason.rejected,
      completionRate: reason.count > 0 ? 
        ((reason.completed / reason.count) * 100).toFixed(1) : 0,
      avgProcessingTimeHours: reason.avgProcessingTime ? 
        (reason.avgProcessingTime / (1000 * 60 * 60)).toFixed(1) : 0,
      totalRefundAmount: reason.totalRefundAmount
    }));
  }

  /**
   * Get performance metrics
   */
  async _getPerformanceMetrics(dateFilter) {
    const pipeline = [
      { 
        $match: { 
          ...dateFilter,
          status: { $in: ['completed', 'rejected'] }
        }
      },
      {
        $project: {
          status: 1,
          processingTime: {
            $subtract: ['$completedAt', '$requestedAt']
          },
          pickupTime: {
            $cond: [
              { $and: [
                { $ne: ['$warehouseManagement.pickup.scheduledDate', null] },
                { $ne: ['$warehouseManagement.pickup.pickedUpAt', null] }
              ]},
              {
                $subtract: [
                  '$warehouseManagement.pickup.pickedUpAt',
                  '$warehouseManagement.pickup.scheduledDate'
                ]
              },
              null
            ]
          },
          qualityAssessmentTime: {
            $cond: [
              { $and: [
                { $ne: ['$warehouseManagement.qualityAssessment.receivedAt', null] },
                { $ne: ['$warehouseManagement.qualityAssessment.assessedAt', null] }
              ]},
              {
                $subtract: [
                  '$warehouseManagement.qualityAssessment.assessedAt',
                  '$warehouseManagement.qualityAssessment.receivedAt'
                ]
              },
              null
            ]
          }
        }
      },
      {
        $group: {
          _id: null,
          avgProcessingTime: { $avg: '$processingTime' },
          avgPickupTime: { $avg: '$pickupTime' },
          avgQualityAssessmentTime: { $avg: '$qualityAssessmentTime' },
          maxProcessingTime: { $max: '$processingTime' },
          minProcessingTime: { $min: '$processingTime' }
        }
      }
    ];

    const result = await Return.aggregate(pipeline);
    const metrics = result[0] || {};

    return {
      avgProcessingTimeHours: metrics.avgProcessingTime ? 
        (metrics.avgProcessingTime / (1000 * 60 * 60)).toFixed(1) : 0,
      avgPickupTimeHours: metrics.avgPickupTime ? 
        (metrics.avgPickupTime / (1000 * 60 * 60)).toFixed(1) : 0,
      avgQualityAssessmentTimeHours: metrics.avgQualityAssessmentTime ? 
        (metrics.avgQualityAssessmentTime / (1000 * 60 * 60)).toFixed(1) : 0,
      maxProcessingTimeHours: metrics.maxProcessingTime ? 
        (metrics.maxProcessingTime / (1000 * 60 * 60)).toFixed(1) : 0,
      minProcessingTimeHours: metrics.minProcessingTime ? 
        (metrics.minProcessingTime / (1000 * 60 * 60)).toFixed(1) : 0
    };
  }

  /**
   * Get refund analytics
   */
  async _getRefundAnalytics(dateFilter) {
    const pipeline = [
      { 
        $match: { 
          ...dateFilter,
          status: 'completed',
          'refund.processing.processedAt': { $exists: true }
        }
      },
      {
        $group: {
          _id: null,
          totalRefunds: { $sum: 1 },
          totalRefundAmount: { $sum: '$refund.processing.finalAmount' },
          totalCoinRefunds: { $sum: '$refund.processing.coinRefund' },
          avgRefundAmount: { $avg: '$refund.processing.finalAmount' },
          fullRefunds: {
            $sum: {
              $cond: [
                { $eq: ['$refund.warehouseDecision.refundPercentage', 100] },
                1, 0
              ]
            }
          },
          partialRefunds: {
            $sum: {
              $cond: [
                { $and: [
                  { $lt: ['$refund.warehouseDecision.refundPercentage', 100] },
                  { $gt: ['$refund.warehouseDecision.refundPercentage', 0] }
                ]},
                1, 0
              ]
            }
          },
          zeroRefunds: {
            $sum: {
              $cond: [
                { $eq: ['$refund.warehouseDecision.refundPercentage', 0] },
                1, 0
              ]
            }
          }
        }
      }
    ];

    const result = await Return.aggregate(pipeline);
    const refunds = result[0] || {
      totalRefunds: 0,
      totalRefundAmount: 0,
      totalCoinRefunds: 0,
      avgRefundAmount: 0,
      fullRefunds: 0,
      partialRefunds: 0,
      zeroRefunds: 0
    };

    // Calculate percentages
    refunds.fullRefundRate = refunds.totalRefunds > 0 ? 
      ((refunds.fullRefunds / refunds.totalRefunds) * 100).toFixed(1) : 0;
    refunds.partialRefundRate = refunds.totalRefunds > 0 ? 
      ((refunds.partialRefunds / refunds.totalRefunds) * 100).toFixed(1) : 0;

    return refunds;
  }

  /**
   * Get warehouse performance metrics
   */
  async _getWarehouseMetrics(dateFilter) {
    const pipeline = [
      { 
        $match: { 
          ...dateFilter,
          'warehouseManagement.assignedWarehouseManager': { $exists: true }
        }
      },
      {
        $group: {
          _id: '$warehouseManagement.assignedWarehouseManager',
          totalAssigned: { $sum: 1 },
          completed: {
            $sum: {
              $cond: [{ $eq: ['$status', 'completed'] }, 1, 0]
            }
          },
          avgQualityScore: {
            $avg: '$warehouseManagement.qualityAssessment.qualityScore'
          },
          avgProcessingTime: {
            $avg: {
              $cond: [
                { $and: [
                  { $ne: ['$warehouseManagement.qualityAssessment.receivedAt', null] },
                  { $ne: ['$warehouseManagement.qualityAssessment.assessedAt', null] }
                ]},
                {
                  $subtract: [
                    '$warehouseManagement.qualityAssessment.assessedAt',
                    '$warehouseManagement.qualityAssessment.receivedAt'
                  ]
                },
                null
              ]
            }
          }
        }
      },
      { $sort: { totalAssigned: -1 } }
    ];

    const warehouseMetrics = await Return.aggregate(pipeline);
    
    return warehouseMetrics.map(manager => ({
      managerId: manager._id,
      totalAssigned: manager.totalAssigned,
      completed: manager.completed,
      completionRate: manager.totalAssigned > 0 ? 
        ((manager.completed / manager.totalAssigned) * 100).toFixed(1) : 0,
      avgQualityScore: manager.avgQualityScore ? 
        manager.avgQualityScore.toFixed(1) : 0,
      avgProcessingTimeHours: manager.avgProcessingTime ? 
        (manager.avgProcessingTime / (1000 * 60 * 60)).toFixed(1) : 0
    }));
  }

  /**
   * Get top returned products
   */
  async _getTopReturnedProducts(dateFilter) {
    const pipeline = [
      { $match: { ...dateFilter } },
      { $unwind: '$items' },
      {
        $group: {
          _id: {
            productId: '$items.productId',
            productName: '$items.productName'
          },
          returnCount: { $sum: 1 },
          totalQuantity: { $sum: '$items.quantity' },
          reasons: { $push: '$returnReason' },
          avgRefundAmount: {
            $avg: {
              $multiply: ['$items.originalPrice', '$items.quantity']
            }
          }
        }
      },
      {
        $project: {
          productId: '$_id.productId',
          productName: '$_id.productName',
          returnCount: 1,
          totalQuantity: 1,
          avgRefundAmount: 1,
          topReasons: {
            $slice: [
              {
                $map: {
                  input: {
                    $setDifference: ['$reasons', []]
                  },
                  as: 'reason',
                  in: '$$reason'
                }
              },
              3
            ]
          }
        }
      },
      { $sort: { returnCount: -1 } },
      { $limit: 20 }
    ];

    return await Return.aggregate(pipeline);
  }

  /**
   * Generate detailed return report
   */
  async generateDetailedReport(filters = {}) {
    const matchStage = this._buildMatchStage(filters);
    
    const pipeline = [
      { $match: matchStage },
      {
        $lookup: {
          from: 'orders',
          localField: 'orderId',
          foreignField: '_id',
          as: 'orderDetails'
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: 'customerId',
          foreignField: '_id',
          as: 'customerDetails'
        }
      },
      {
        $project: {
          returnRequestId: 1,
          orderId: 1,
          customerId: 1,
          customerName: { $arrayElemAt: ['$customerDetails.name', 0] },
          customerPhone: { $arrayElemAt: ['$customerDetails.mobile', 0] },
          orderValue: { $arrayElemAt: ['$orderDetails.totalAmount', 0] },
          returnReason: 1,
          status: 1,
          requestedAt: 1,
          completedAt: 1,
          items: 1,
          refund: 1,
          warehouseManagement: 1,
          processingTimeHours: {
            $cond: [
              { $and: [
                { $ne: ['$requestedAt', null] },
                { $ne: ['$completedAt', null] }
              ]},
              {
                $divide: [
                  { $subtract: ['$completedAt', '$requestedAt'] },
                  3600000
                ]
              },
              null
            ]
          }
        }
      },
      { $sort: { requestedAt: -1 } }
    ];

    return await Return.aggregate(pipeline);
  }

  /**
   * Get return analytics by date range
   */
  async getAnalyticsByDateRange(startDate, endDate, groupBy = 'day') {
    const dateFilter = {
      requestedAt: {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      }
    };

    let groupByStage;
    switch (groupBy) {
      case 'hour':
        groupByStage = {
          year: { $year: '$requestedAt' },
          month: { $month: '$requestedAt' },
          day: { $dayOfMonth: '$requestedAt' },
          hour: { $hour: '$requestedAt' }
        };
        break;
      case 'day':
        groupByStage = {
          year: { $year: '$requestedAt' },
          month: { $month: '$requestedAt' },
          day: { $dayOfMonth: '$requestedAt' }
        };
        break;
      case 'week':
        groupByStage = {
          year: { $year: '$requestedAt' },
          week: { $week: '$requestedAt' }
        };
        break;
      case 'month':
        groupByStage = {
          year: { $year: '$requestedAt' },
          month: { $month: '$requestedAt' }
        };
        break;
      default:
        groupByStage = {
          year: { $year: '$requestedAt' },
          month: { $month: '$requestedAt' },
          day: { $dayOfMonth: '$requestedAt' }
        };
    }

    const pipeline = [
      { $match: dateFilter },
      {
        $group: {
          _id: groupByStage,
          totalReturns: { $sum: 1 },
          completedReturns: {
            $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
          },
          rejectedReturns: {
            $sum: { $cond: [{ $eq: ['$status', 'rejected'] }, 1, 0] }
          },
          totalRefundAmount: {
            $sum: {
              $cond: [
                { $eq: ['$status', 'completed'] },
                '$refund.processing.finalAmount',
                0
              ]
            }
          }
        }
      },
      { $sort: { '_id': 1 } }
    ];

    return await Return.aggregate(pipeline);
  }

  /**
   * Helper method to get date filter based on timeframe
   */
  _getDateFilter(timeframe) {
    const now = new Date();
    let startDate;

    switch (timeframe) {
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

    return {
      requestedAt: {
        $gte: startDate,
        $lte: now
      }
    };
  }

  /**
   * Helper method to build match stage for complex filters
   */
  _buildMatchStage(filters) {
    const matchStage = {};

    if (filters.status) {
      if (Array.isArray(filters.status)) {
        matchStage.status = { $in: filters.status };
      } else {
        matchStage.status = filters.status;
      }
    }

    if (filters.returnReason) {
      if (Array.isArray(filters.returnReason)) {
        matchStage.returnReason = { $in: filters.returnReason };
      } else {
        matchStage.returnReason = filters.returnReason;
      }
    }

    if (filters.customerId) {
      matchStage.customerId = filters.customerId;
    }

    if (filters.warehouseManager) {
      matchStage['warehouseManagement.assignedWarehouseManager'] = filters.warehouseManager;
    }

    if (filters.startDate && filters.endDate) {
      matchStage.requestedAt = {
        $gte: new Date(filters.startDate),
        $lte: new Date(filters.endDate)
      };
    } else if (filters.timeframe) {
      const dateFilter = this._getDateFilter(filters.timeframe);
      matchStage.requestedAt = dateFilter.requestedAt;
    }

    return matchStage;
  }
}

export default new ReturnAnalyticsService();
