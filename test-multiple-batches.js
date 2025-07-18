import mongoose from 'mongoose';
import dotenv from 'dotenv';
import BatchGroup from './models/BatchGroup.js';
import { moveAllocatedToUsed } from './services/batchGroupService.js';

dotenv.config();

const testMultipleBatchGroups = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');
    
    // First, let's check all orders and their allocations across multiple batch groups
    console.log('\n=== CHECKING ALL BATCH GROUPS FOR ORDER ALLOCATIONS ===');
    
    const allBatchGroups = await BatchGroup.find({
      'orderAllocations.0': { $exists: true }
    });
    
    console.log(`Found ${allBatchGroups.length} batch groups with allocations`);
    
    // Group by order ID
    const orderMap = new Map();
    
    allBatchGroups.forEach(bg => {
      bg.orderAllocations.forEach(allocation => {
        const orderId = allocation.orderId.toString();
        if (!orderMap.has(orderId)) {
          orderMap.set(orderId, []);
        }
        orderMap.get(orderId).push({
          batchGroupId: bg._id,
          batchGroupNumber: bg.batchGroupNumber,
          status: allocation.status,
          itemsCount: allocation.items?.length || 0,
          items: allocation.items || []
        });
      });
    });
    
    console.log('\n=== ORDERS WITH MULTIPLE BATCH GROUPS ===');
    
    let multipleOrdersFound = false;
    
    for (const [orderId, allocations] of orderMap) {
      if (allocations.length > 1) {
        multipleOrdersFound = true;
        console.log(`\nOrder ${orderId} has allocations in ${allocations.length} batch groups:`);
        
        allocations.forEach((alloc, index) => {
          console.log(`  ${index + 1}. Batch Group: ${alloc.batchGroupId} (${alloc.batchGroupNumber})`);
          console.log(`     Status: ${alloc.status}, Items: ${alloc.itemsCount}`);
          alloc.items.forEach(item => {
            console.log(`     - Product: ${item.productId}, Quantity: ${item.quantity}`);
          });
        });
        
        // Test moveAllocatedToUsed for this order
        console.log(`\n=== TESTING moveAllocatedToUsed FOR ORDER ${orderId} ===`);
        
        // Show current state
        const currentBatchGroups = await BatchGroup.find({
          'orderAllocations.orderId': new mongoose.Types.ObjectId(orderId)
        });
        
        console.log(`Current state - Found ${currentBatchGroups.length} batch groups:`);
        
        currentBatchGroups.forEach((bg, bgIndex) => {
          console.log(`\nBatch Group ${bgIndex + 1}: ${bg._id} (${bg.batchGroupNumber})`);
          
          // Show products with allocations
          bg.products.forEach(product => {
            if (product.allocatedQuantity > 0 || product.usedQuantity > 0) {
              console.log(`  Product ${product.productId}: allocated=${product.allocatedQuantity}, used=${product.usedQuantity}, available=${product.availableQuantity}`);
            }
          });
          
          // Show allocations for this order
          const orderAllocations = bg.orderAllocations.filter(
            alloc => alloc.orderId.toString() === orderId
          );
          console.log(`  Order allocations: ${orderAllocations.length}`);
          orderAllocations.forEach(alloc => {
            console.log(`    Status: ${alloc.status}, Items: ${alloc.items?.length || 0}`);
          });
        });
        
        // Run the function
        const result = await moveAllocatedToUsed(orderId);
        
        console.log('\n=== RESULT ===');
        console.log('Success:', result.success);
        console.log('Updated batch groups:', result.updatedBatchGroups);
        console.log('Errors:', result.errors);
        
        // Show updated state
        const updatedBatchGroups = await BatchGroup.find({
          'orderAllocations.orderId': new mongoose.Types.ObjectId(orderId)
        });
        
        console.log(`\n=== UPDATED STATE ===`);
        
        updatedBatchGroups.forEach((bg, bgIndex) => {
          console.log(`\nBatch Group ${bgIndex + 1}: ${bg._id} (${bg.batchGroupNumber})`);
          
          // Show products after update
          bg.products.forEach(product => {
            if (product.allocatedQuantity > 0 || product.usedQuantity > 0) {
              console.log(`  Product ${product.productId}: allocated=${product.allocatedQuantity}, used=${product.usedQuantity}, available=${product.availableQuantity}`);
            }
          });
          
          // Show allocations after update
          const orderAllocations = bg.orderAllocations.filter(
            alloc => alloc.orderId.toString() === orderId
          );
          console.log(`  Order allocations: ${orderAllocations.length}`);
          orderAllocations.forEach(alloc => {
            console.log(`    Status: ${alloc.status}, Delivered At: ${alloc.deliveredAt}`);
          });
        });
        
        // Only test the first multi-batch order
        break;
      }
    }
    
    if (!multipleOrdersFound) {
      console.log('No orders found with multiple batch group allocations');
      
      // Show all orders for reference
      console.log('\n=== ALL ORDERS ===');
      for (const [orderId, allocations] of orderMap) {
        console.log(`Order ${orderId}: ${allocations.length} batch group(s)`);
      }
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Error testing multiple batch groups:', error);
    process.exit(1);
  }
};

testMultipleBatchGroups();
