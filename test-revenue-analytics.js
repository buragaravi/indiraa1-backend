import mongoose from 'mongoose';
import dotenv from 'dotenv';
import revenueAnalyticsService from './services/revenueAnalyticsService.js';

dotenv.config();

const testRevenueAnalytics = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');
    
    console.log('\n🚀 TESTING REVENUE ANALYTICS SERVICE\n');
    
    // Test 1: Basic Revenue Analytics
    console.log('1️⃣ Testing Basic Revenue Analytics...');
    const revenueData = await revenueAnalyticsService.calculateRevenueAnalytics();
    
    console.log('📊 REVENUE SUMMARY:');
    console.log(`   Total Orders: ${revenueData.summary.totalOrders}`);
    console.log(`   Total Revenue: ₹${revenueData.summary.totalRevenue.toLocaleString()}`);
    console.log(`   Received Revenue: ₹${revenueData.summary.receivedRevenue.toLocaleString()}`);
    console.log(`   Pending Revenue: ₹${revenueData.summary.pendingRevenue.toLocaleString()}`);
    console.log(`   Cancelled Revenue: ₹${revenueData.summary.cancelledRevenue.toLocaleString()}`);
    
    console.log('\n💳 PAYMENT METHOD BREAKDOWN:');
    console.log(`   UPI Total: ₹${revenueData.byPaymentMethod.UPI.total.toLocaleString()}`);
    console.log(`   UPI Received: ₹${revenueData.byPaymentMethod.UPI.received.toLocaleString()}`);
    console.log(`   UPI Pending: ₹${revenueData.byPaymentMethod.UPI.pending.toLocaleString()}`);
    console.log(`   CASH Total: ₹${revenueData.byPaymentMethod.CASH.total.toLocaleString()}`);
    console.log(`   CASH Received: ₹${revenueData.byPaymentMethod.CASH.received.toLocaleString()}`);
    console.log(`   CASH Pending: ₹${revenueData.byPaymentMethod.CASH.pending.toLocaleString()}`);
    
    console.log('\n📈 ORDER STATUS BREAKDOWN:');
    Object.entries(revenueData.byStatus).forEach(([status, data]) => {
      if (data.count > 0) {
        console.log(`   ${status.toUpperCase()}: ${data.count} orders, ₹${data.amount.toLocaleString()} (UPI: ₹${data.upi.toLocaleString()}, CASH: ₹${data.cash.toLocaleString()})`);
      }
    });
    
    console.log('\n📅 TIMELINE BREAKDOWN:');
    console.log(`   Today: ${revenueData.timeline.today.orders} orders, ₹${revenueData.timeline.today.revenue.toLocaleString()}`);
    console.log(`   This Week: ${revenueData.timeline.thisWeek.orders} orders, ₹${revenueData.timeline.thisWeek.revenue.toLocaleString()}`);
    console.log(`   This Month: ${revenueData.timeline.thisMonth.orders} orders, ₹${revenueData.timeline.thisMonth.revenue.toLocaleString()}`);
    console.log(`   This Year: ${revenueData.timeline.thisYear.orders} orders, ₹${revenueData.timeline.thisYear.revenue.toLocaleString()}`);
    
    // Test 2: Inventory Analytics
    console.log('\n\n2️⃣ Testing Inventory Analytics...');
    const inventoryData = await revenueAnalyticsService.calculateInventoryAnalytics();
    
    console.log('📦 INVENTORY SUMMARY:');
    console.log(`   Total Inventory Value: ₹${inventoryData.totalValue.toLocaleString()}`);
    console.log(`   Available Value: ₹${inventoryData.availableValue.toLocaleString()}`);
    console.log(`   Allocated Value: ₹${inventoryData.allocatedValue.toLocaleString()}`);
    console.log(`   Used Value: ₹${inventoryData.usedValue.toLocaleString()}`);
    console.log(`   Combo Pack Value: ₹${inventoryData.comboPackValue?.toLocaleString() || 0}`);
    console.log(`   Total Products: ${inventoryData.summary.totalProducts}`);
    console.log(`   Total Quantity: ${inventoryData.summary.totalQuantity}`);
    console.log(`   Available Quantity: ${inventoryData.summary.availableQuantity}`);
    
    console.log('\n⚠️  LOW STOCK ALERTS:');
    if (inventoryData.lowStockAlerts.length > 0) {
      inventoryData.lowStockAlerts.slice(0, 5).forEach(alert => {
        console.log(`   ${alert.productName} (Batch: ${alert.batchGroupNumber}) - Only ${alert.availableQuantity} left (₹${alert.availableValue})`);
      });
      if (inventoryData.lowStockAlerts.length > 5) {
        console.log(`   ... and ${inventoryData.lowStockAlerts.length - 5} more alerts`);
      }
    } else {
      console.log('   ✅ No low stock alerts');
    }
    
    console.log('\n🏭 TOP BATCH GROUPS BY VALUE:');
    const topBatches = inventoryData.batchGroupBreakdown
      .sort((a, b) => b.totalValue - a.totalValue)
      .slice(0, 5);
    
    topBatches.forEach((batch, index) => {
      console.log(`   ${index + 1}. ${batch.batchGroupNumber}: ₹${batch.totalValue.toLocaleString()} (${batch.productCount} products, ${batch.utilizationRate}% utilized)`);
    });
    
    // Test 3: Profitability Analytics
    console.log('\n\n3️⃣ Testing Profitability Analytics...');
    const profitabilityData = await revenueAnalyticsService.calculateProfitabilityAnalytics(revenueData);
    
    console.log('💰 PROFITABILITY SUMMARY:');
    console.log(`   Cost of Goods Sold: ₹${profitabilityData.totalCostOfGoodsSold.toLocaleString()}`);
    console.log(`   Gross Profit: ₹${profitabilityData.grossProfit.toLocaleString()}`);
    console.log(`   Gross Profit Margin: ${profitabilityData.grossProfitMargin}%`);
    console.log(`   Total Products Sold: ${profitabilityData.totalProductsSold}`);
    console.log(`   Average Order Value: ₹${profitabilityData.averageOrderValue.toLocaleString()}`);
    
    // Test 4: Comprehensive Analytics
    console.log('\n\n4️⃣ Testing Comprehensive Analytics...');
    const comprehensiveData = await revenueAnalyticsService.getComprehensiveAnalytics();
    
    console.log('🎯 ACTION ITEMS:');
    if (comprehensiveData.actionItems.length > 0) {
      comprehensiveData.actionItems.forEach((item, index) => {
        console.log(`   ${index + 1}. [${item.priority.toUpperCase()}] ${item.title}: ${item.description}`);
        console.log(`      Action: ${item.action}`);
      });
    } else {
      console.log('   ✅ No critical action items');
    }
    
    console.log(`\n📅 Last Updated: ${comprehensiveData.lastUpdated}`);
    
    console.log('\n✅ ALL TESTS COMPLETED SUCCESSFULLY!\n');
    
    // Performance summary
    console.log('⚡ PERFORMANCE SUMMARY:');
    console.log(`   Total Orders Processed: ${revenueData.summary.totalOrders}`);
    console.log(`   Total Batch Groups Analyzed: ${inventoryData.batchGroupBreakdown.length}`);
    console.log(`   Low Stock Alerts Generated: ${inventoryData.lowStockAlerts.length}`);
    console.log(`   Action Items Generated: ${comprehensiveData.actionItems.length}`);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error testing revenue analytics:', error);
    process.exit(1);
  }
};

testRevenueAnalytics();
