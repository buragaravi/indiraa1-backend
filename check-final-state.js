import mongoose from 'mongoose';
import dotenv from 'dotenv';
import BatchGroup from './models/BatchGroup.js';

dotenv.config();

const checkFinalState = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');
    
    // Get all batch groups
    const batchGroups = await BatchGroup.find({});
    
    console.log(`\n=== FINAL BATCH GROUP STATISTICS ===`);
    
    let totalStats = {
      totalItems: 0,
      availableItems: 0,
      allocatedItems: 0,
      usedItems: 0
    };
    
    batchGroups.forEach((batchGroup, index) => {
      console.log(`\nBatch Group ${index + 1}: ${batchGroup.batchGroupNumber}`);
      
      let batchStats = {
        totalItems: 0,
        availableItems: 0,
        allocatedItems: 0,
        usedItems: 0
      };
      
      batchGroup.products.forEach(product => {
        batchStats.totalItems += product.quantity || 0;
        batchStats.availableItems += product.availableQuantity || 0;
        batchStats.allocatedItems += product.allocatedQuantity || 0;
        batchStats.usedItems += product.usedQuantity || 0;
      });
      
      console.log(`  Total Items: ${batchStats.totalItems}`);
      console.log(`  Available Items: ${batchStats.availableItems}`);
      console.log(`  Allocated Items: ${batchStats.allocatedItems}`);
      console.log(`  Used Items: ${batchStats.usedItems}`);
      
      const utilizationRate = batchStats.totalItems > 0 ? 
        ((batchStats.usedItems / batchStats.totalItems) * 100).toFixed(1) : 0;
      const availabilityRate = batchStats.totalItems > 0 ? 
        ((batchStats.availableItems / batchStats.totalItems) * 100).toFixed(1) : 0;
      
      console.log(`  Utilization Rate: ${utilizationRate}%`);
      console.log(`  Availability Rate: ${availabilityRate}%`);
      
      // Order allocations summary
      const deliveredAllocations = batchGroup.orderAllocations.filter(alloc => alloc.status === 'Delivered').length;
      const pendingAllocations = batchGroup.orderAllocations.filter(alloc => alloc.status === 'Allocated').length;
      
      console.log(`  Order Allocations: ${batchGroup.orderAllocations.length} total (${deliveredAllocations} delivered, ${pendingAllocations} pending)`);
      
      // Add to total stats
      totalStats.totalItems += batchStats.totalItems;
      totalStats.availableItems += batchStats.availableItems;
      totalStats.allocatedItems += batchStats.allocatedItems;
      totalStats.usedItems += batchStats.usedItems;
    });
    
    console.log(`\n=== OVERALL STATISTICS ===`);
    console.log(`Total Items: ${totalStats.totalItems}`);
    console.log(`Available Items: ${totalStats.availableItems}`);
    console.log(`Allocated Items: ${totalStats.allocatedItems}`);
    console.log(`Used Items: ${totalStats.usedItems}`);
    
    const overallUtilizationRate = totalStats.totalItems > 0 ? 
      ((totalStats.usedItems / totalStats.totalItems) * 100).toFixed(1) : 0;
    const overallAvailabilityRate = totalStats.totalItems > 0 ? 
      ((totalStats.availableItems / totalStats.totalItems) * 100).toFixed(1) : 0;
    
    console.log(`Overall Utilization Rate: ${overallUtilizationRate}%`);
    console.log(`Overall Availability Rate: ${overallAvailabilityRate}%`);
    
    process.exit(0);
  } catch (error) {
    console.error('Error checking final state:', error);
    process.exit(1);
  }
};

checkFinalState();
