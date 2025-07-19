import Order from '../models/Order.js';
import Product from '../models/Product.js';
import BatchGroup from '../models/BatchGroup.js';
import ComboPack from '../models/ComboPack.js';
import mongoose from 'mongoose';

/**
 * Revenue Analytics Service
 * Provides comprehensive revenue and business analytics for admin dashboard
 */

// Calculate total revenue analytics
export const calculateRevenueAnalytics = async () => {
  try {
    console.log('[REVENUE ANALYTICS] Starting comprehensive revenue calculation...');
    
    // Get all orders with basic aggregation
    const orders = await Order.find({})
      .select('totalAmount paymentMethod status paymentStatus items createdAt updatedAt')
      .lean();
    
    console.log(`[REVENUE ANALYTICS] Processing ${orders.length} orders`);
    
    // Initialize analytics structure
    const analytics = {
      summary: {
        totalOrders: orders.length,
        totalRevenue: 0,
        receivedRevenue: 0,
        pendingRevenue: 0,
        cancelledRevenue: 0,
        refundedAmount: 0
      },
      byStatus: {
        pending: { count: 0, amount: 0, upi: 0, cash: 0 },
        confirmed: { count: 0, amount: 0, upi: 0, cash: 0 },
        shipped: { count: 0, amount: 0, upi: 0, cash: 0 },
        delivered: { count: 0, amount: 0, upi: 0, cash: 0 },
        cancelled: { count: 0, amount: 0, upi: 0, cash: 0 },
        returned: { count: 0, amount: 0, upi: 0, cash: 0 }
      },
      byPaymentMethod: {
        UPI: { 
          total: 0, 
          received: 0, 
          pending: 0,
          byStatus: { pending: 0, confirmed: 0, shipped: 0, delivered: 0, cancelled: 0, returned: 0 }
        },
        CASH: { 
          total: 0, 
          received: 0, 
          pending: 0,
          byStatus: { pending: 0, confirmed: 0, shipped: 0, delivered: 0, cancelled: 0, returned: 0 }
        }
      },
      byPaymentStatus: {
        PAID: { count: 0, amount: 0 },
        PENDING: { count: 0, amount: 0 },
        FAILED: { count: 0, amount: 0 },
        REFUNDED: { count: 0, amount: 0 }
      },
      timeline: {
        today: { orders: 0, revenue: 0 },
        thisWeek: { orders: 0, revenue: 0 },
        thisMonth: { orders: 0, revenue: 0 },
        thisYear: { orders: 0, revenue: 0 }
      }
    };
    
    // Date calculations for timeline
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = new Date(startOfDay);
    startOfWeek.setDate(startOfDay.getDate() - startOfDay.getDay());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfYear = new Date(now.getFullYear(), 0, 1);
    
    // Process each order
    for (const order of orders) {
      const amount = order.totalAmount || 0;
      const status = order.status?.toLowerCase() || 'pending';
      
      // Fix payment method logic: treat UPI/ONLINE as UPI, everything else as CASH (COD)
      const rawPaymentMethod = order.paymentMethod?.toUpperCase() || 'CASH';
      const paymentMethod = (rawPaymentMethod === 'UPI' || rawPaymentMethod === 'ONLINE') ? 'UPI' : 'CASH';
      
      const paymentStatus = order.paymentStatus?.toUpperCase() || 'PENDING';
      const orderDate = new Date(order.createdAt);
      
      // Summary calculations
      analytics.summary.totalRevenue += amount;
      
      // Revenue categorization based on status and payment status
      if (status === 'delivered' && paymentStatus === 'PAID') {
        analytics.summary.receivedRevenue += amount;
      } else if (status === 'cancelled' || status === 'returned') {
        analytics.summary.cancelledRevenue += amount;
        if (paymentStatus === 'REFUNDED') {
          analytics.summary.refundedAmount += amount;
        }
      } else {
        analytics.summary.pendingRevenue += amount;
      }
      
      // By status breakdown
      if (analytics.byStatus[status]) {
        analytics.byStatus[status].count++;
        analytics.byStatus[status].amount += amount;
        
        if (paymentMethod === 'UPI') {
          analytics.byStatus[status].upi += amount;
        } else {
          analytics.byStatus[status].cash += amount;
        }
      }
      
      // By payment method breakdown
      if (analytics.byPaymentMethod[paymentMethod]) {
        analytics.byPaymentMethod[paymentMethod].total += amount;
        analytics.byPaymentMethod[paymentMethod].byStatus[status] += amount;
        
        if (status === 'delivered' && paymentStatus === 'PAID') {
          analytics.byPaymentMethod[paymentMethod].received += amount;
        } else if (status !== 'cancelled' && status !== 'returned') {
          analytics.byPaymentMethod[paymentMethod].pending += amount;
        }
      }
      
      // By payment status
      if (analytics.byPaymentStatus[paymentStatus]) {
        analytics.byPaymentStatus[paymentStatus].count++;
        analytics.byPaymentStatus[paymentStatus].amount += amount;
      }
      
      // Timeline calculations
      if (orderDate >= startOfDay) {
        analytics.timeline.today.orders++;
        analytics.timeline.today.revenue += amount;
      }
      if (orderDate >= startOfWeek) {
        analytics.timeline.thisWeek.orders++;
        analytics.timeline.thisWeek.revenue += amount;
      }
      if (orderDate >= startOfMonth) {
        analytics.timeline.thisMonth.orders++;
        analytics.timeline.thisMonth.revenue += amount;
      }
      if (orderDate >= startOfYear) {
        analytics.timeline.thisYear.orders++;
        analytics.timeline.thisYear.revenue += amount;
      }
    }
    
    console.log('[REVENUE ANALYTICS] Revenue calculation completed');
    return analytics;
    
  } catch (error) {
    console.error('[REVENUE ANALYTICS] Error calculating revenue analytics:', error);
    throw error;
  }
};

// Calculate inventory value analytics
export const calculateInventoryAnalytics = async () => {
  try {
    console.log('[INVENTORY ANALYTICS] Starting inventory value calculation...');
    
    // Get all batch groups with products
    const batchGroups = await BatchGroup.find({})
      .populate('products.productId', 'name price')
      .lean();
    
    console.log(`[INVENTORY ANALYTICS] Processing ${batchGroups.length} batch groups`);
    
    const inventoryAnalytics = {
      totalValue: 0,
      availableValue: 0,
      allocatedValue: 0,
      usedValue: 0,
      batchGroupBreakdown: [],
      lowStockAlerts: [],
      summary: {
        totalProducts: 0,
        totalQuantity: 0,
        availableQuantity: 0,
        allocatedQuantity: 0,
        usedQuantity: 0
      }
    };
    
    for (const batchGroup of batchGroups) {
      let batchTotalValue = 0;
      let batchAvailableValue = 0;
      let batchAllocatedValue = 0;
      let batchUsedValue = 0;
      let batchTotalQuantity = 0;
      let batchAvailableQuantity = 0;
      let batchAllocatedQuantity = 0;
      let batchUsedQuantity = 0;
      
      for (const product of batchGroup.products || []) {
        const productPrice = product.productId?.price || 0;
        const quantity = product.quantity || 0;
        const availableQuantity = product.availableQuantity || 0;
        const allocatedQuantity = product.allocatedQuantity || 0;
        const usedQuantity = product.usedQuantity || 0;
        
        const totalValue = quantity * productPrice;
        const availableValue = availableQuantity * productPrice;
        const allocatedValue = allocatedQuantity * productPrice;
        const usedValue = usedQuantity * productPrice;
        
        batchTotalValue += totalValue;
        batchAvailableValue += availableValue;
        batchAllocatedValue += allocatedValue;
        batchUsedValue += usedValue;
        
        batchTotalQuantity += quantity;
        batchAvailableQuantity += availableQuantity;
        batchAllocatedQuantity += allocatedQuantity;
        batchUsedQuantity += usedQuantity;
        
        // Check for low stock
        if (availableQuantity <= 5 && availableQuantity > 0) {
          inventoryAnalytics.lowStockAlerts.push({
            batchGroupId: batchGroup._id,
            batchGroupNumber: batchGroup.batchGroupNumber,
            productId: product.productId._id,
            productName: product.productId.name,
            availableQuantity,
            availableValue,
            variantId: product.variantId || null
          });
        }
      }
      
      // Add to totals
      inventoryAnalytics.totalValue += batchTotalValue;
      inventoryAnalytics.availableValue += batchAvailableValue;
      inventoryAnalytics.allocatedValue += batchAllocatedValue;
      inventoryAnalytics.usedValue += batchUsedValue;
      
      inventoryAnalytics.summary.totalQuantity += batchTotalQuantity;
      inventoryAnalytics.summary.availableQuantity += batchAvailableQuantity;
      inventoryAnalytics.summary.allocatedQuantity += batchAllocatedQuantity;
      inventoryAnalytics.summary.usedQuantity += batchUsedQuantity;
      
      // Batch breakdown
      inventoryAnalytics.batchGroupBreakdown.push({
        batchGroupId: batchGroup._id,
        batchGroupNumber: batchGroup.batchGroupNumber,
        totalValue: Math.round(batchTotalValue * 100) / 100,
        availableValue: Math.round(batchAvailableValue * 100) / 100,
        allocatedValue: Math.round(batchAllocatedValue * 100) / 100,
        usedValue: Math.round(batchUsedValue * 100) / 100,
        productCount: batchGroup.products?.length || 0,
        totalQuantity: batchTotalQuantity,
        availableQuantity: batchAvailableQuantity,
        utilizationRate: batchTotalQuantity > 0 ? Math.round((batchUsedQuantity / batchTotalQuantity) * 100 * 100) / 100 : 0
      });
    }
    
    // Calculate combo pack inventory value
    const comboPacks = await ComboPack.find({ isActive: true })
      .select('name stock comboPrice')
      .lean();
    
    let comboPackValue = 0;
    for (const combo of comboPacks) {
      comboPackValue += (combo.stock || 0) * (combo.comboPrice || 0);
    }
    
    inventoryAnalytics.comboPackValue = comboPackValue;
    inventoryAnalytics.totalValue += comboPackValue;
    
    // Round totals
    inventoryAnalytics.totalValue = Math.round(inventoryAnalytics.totalValue * 100) / 100;
    inventoryAnalytics.availableValue = Math.round(inventoryAnalytics.availableValue * 100) / 100;
    inventoryAnalytics.allocatedValue = Math.round(inventoryAnalytics.allocatedValue * 100) / 100;
    inventoryAnalytics.usedValue = Math.round(inventoryAnalytics.usedValue * 100) / 100;
    
    inventoryAnalytics.summary.totalProducts = batchGroups.reduce((sum, bg) => sum + (bg.products?.length || 0), 0);
    
    console.log('[INVENTORY ANALYTICS] Inventory calculation completed');
    return inventoryAnalytics;
    
  } catch (error) {
    console.error('[INVENTORY ANALYTICS] Error calculating inventory analytics:', error);
    throw error;
  }
};

// Calculate profitability analytics
export const calculateProfitabilityAnalytics = async (revenueData) => {
  try {
    console.log('[PROFITABILITY ANALYTICS] Starting profitability calculation...');
    
    // Get cost data from batch groups (this is simplified - you might want to track actual cost prices)
    const batchGroups = await BatchGroup.find({})
      .populate('products.productId', 'price')
      .lean();
    
    let totalCostOfGoodsSold = 0;
    let totalProductsSold = 0;
    
    for (const batchGroup of batchGroups) {
      for (const product of batchGroup.products || []) {
        const usedQuantity = product.usedQuantity || 0;
        const productPrice = product.productId?.price || 0;
        // Assume cost is 60% of selling price (you should track actual cost)
        const estimatedCost = productPrice * 0.6;
        
        totalCostOfGoodsSold += usedQuantity * estimatedCost;
        totalProductsSold += usedQuantity;
      }
    }
    
    const grossProfit = revenueData.summary.receivedRevenue - totalCostOfGoodsSold;
    const grossProfitMargin = revenueData.summary.receivedRevenue > 0 ? 
      (grossProfit / revenueData.summary.receivedRevenue) * 100 : 0;
    
    return {
      totalCostOfGoodsSold: Math.round(totalCostOfGoodsSold * 100) / 100,
      grossProfit: Math.round(grossProfit * 100) / 100,
      grossProfitMargin: Math.round(grossProfitMargin * 100) / 100,
      totalProductsSold,
      averageOrderValue: revenueData.summary.totalOrders > 0 ? 
        Math.round((revenueData.summary.totalRevenue / revenueData.summary.totalOrders) * 100) / 100 : 0
    };
    
  } catch (error) {
    console.error('[PROFITABILITY ANALYTICS] Error calculating profitability:', error);
    throw error;
  }
};

// Main analytics aggregator
export const getComprehensiveAnalytics = async () => {
  try {
    console.log('[ANALYTICS] Starting comprehensive analytics calculation...');
    
    const [revenueData, inventoryData] = await Promise.all([
      calculateRevenueAnalytics(),
      calculateInventoryAnalytics()
    ]);
    
    const profitabilityData = await calculateProfitabilityAnalytics(revenueData);
    
    const comprehensiveAnalytics = {
      revenue: revenueData,
      inventory: inventoryData,
      profitability: profitabilityData,
      actionItems: generateActionItems(revenueData, inventoryData),
      lastUpdated: new Date().toISOString()
    };
    
    console.log('[ANALYTICS] Comprehensive analytics calculation completed');
    return comprehensiveAnalytics;
    
  } catch (error) {
    console.error('[ANALYTICS] Error in comprehensive analytics:', error);
    throw error;
  }
};

// Generate action items for admin
const generateActionItems = (revenueData, inventoryData) => {
  const actionItems = [];
  
  // Pending revenue alerts
  if (revenueData.summary.pendingRevenue > 50000) {
    actionItems.push({
      type: 'warning',
      category: 'revenue',
      title: 'High Pending Revenue',
      description: `₹${revenueData.summary.pendingRevenue.toLocaleString()} in pending revenue requires attention`,
      action: 'Review pending orders',
      priority: 'high'
    });
  }
  
  // Low stock alerts
  if (inventoryData.lowStockAlerts.length > 0) {
    actionItems.push({
      type: 'alert',
      category: 'inventory',
      title: 'Low Stock Alert',
      description: `${inventoryData.lowStockAlerts.length} products are running low on stock`,
      action: 'Restock products',
      priority: 'medium'
    });
  }
  
  // Cash payment follow-ups
  const cashPending = revenueData.byPaymentMethod.CASH?.pending || 0;
  if (cashPending > 20000) {
    actionItems.push({
      type: 'info',
      category: 'payments',
      title: 'Cash Collection Pending',
      description: `₹${cashPending.toLocaleString()} in cash payments pending collection`,
      action: 'Follow up with delivery agents',
      priority: 'medium'
    });
  }
  
  return actionItems;
};

export default {
  calculateRevenueAnalytics,
  calculateInventoryAnalytics,
  calculateProfitabilityAnalytics,
  getComprehensiveAnalytics
};
