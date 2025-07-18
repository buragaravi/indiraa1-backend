import mongoose from 'mongoose';
import dotenv from 'dotenv';
import BatchGroup from './models/BatchGroup.js';
import { moveAllocatedToUsed } from './services/batchGroupService.js';

dotenv.config();

const testMoveAllocatedToUsed = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');
    
    // Test with a specific order ID
    const testOrderId = '687a5de265017f1513d71fc7'; // Updated order ID from user
    
    console.log(`\n=== Testing moveAllocatedToUsed for order ${testOrderId} ===`);
    
    // First, show current state
    const batchGroups = await BatchGroup.find({
      'orderAllocations.orderId': new mongoose.Types.ObjectId(testOrderId)
    });
    
    console.log(`\nCurrent state - Found ${batchGroups.length} batch groups:`);
    batchGroups.forEach((bg, index) => {
      console.log(`\nBatch Group ${index + 1}: ${bg._id}`);
      console.log(`Products with allocations:`);
      
      bg.products.forEach(product => {
        if (product.allocatedQuantity > 0) {
          console.log(`  - Product ${product.productId}: allocated=${product.allocatedQuantity}, used=${product.usedQuantity}`);
        }
      });
      
      const orderAllocations = bg.orderAllocations.filter(
        alloc => alloc.orderId.toString() === testOrderId
      );
      console.log(`Order allocations (${orderAllocations.length}):`);
      orderAllocations.forEach(alloc => {
        console.log(`  - Status: ${alloc.status}, Items: ${alloc.items?.length || 0}`);
        if (alloc.items) {
          alloc.items.forEach(item => {
            console.log(`    - Product ${item.productId}: quantity=${item.quantity}`);
          });
        }
      });
    });
    
    // Now test the function
    console.log(`\n=== Running moveAllocatedToUsed ===`);
    const result = await moveAllocatedToUsed(testOrderId);
    
    console.log('\n=== Result ===');
    console.log('Success:', result.success);
    console.log('Updated batch groups:', result.updatedBatchGroups);
    console.log('Errors:', result.errors);
    console.log('Message:', result.message);
    
    // Show updated state
    const updatedBatchGroups = await BatchGroup.find({
      'orderAllocations.orderId': new mongoose.Types.ObjectId(testOrderId)
    });
    
    console.log(`\n=== Updated state ===`);
    updatedBatchGroups.forEach((bg, index) => {
      console.log(`\nBatch Group ${index + 1}: ${bg._id}`);
      console.log(`Products after update:`);
      
      bg.products.forEach(product => {
        if (product.allocatedQuantity > 0 || product.usedQuantity > 0) {
          console.log(`  - Product ${product.productId}: allocated=${product.allocatedQuantity}, used=${product.usedQuantity}`);
        }
      });
      
      const orderAllocations = bg.orderAllocations.filter(
        alloc => alloc.orderId.toString() === testOrderId
      );
      console.log(`Order allocations (${orderAllocations.length}):`);
      orderAllocations.forEach(alloc => {
        console.log(`  - Status: ${alloc.status}, Delivered At: ${alloc.deliveredAt}`);
      });
    });
    
    process.exit(0);
  } catch (error) {
    console.error('Error testing moveAllocatedToUsed:', error);
    process.exit(1);
  }
};

testMoveAllocatedToUsed();
