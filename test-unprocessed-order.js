import mongoose from 'mongoose';
import dotenv from 'dotenv';
import BatchGroup from './models/BatchGroup.js';
import Order from './models/Order.js';
import { moveAllocatedToUsed } from './services/batchGroupService.js';

dotenv.config();

const findUnprocessedOrder = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');
    
    // Find batch groups with allocations that are still "Allocated" (not "Delivered")
    const batchGroups = await BatchGroup.find({
      'orderAllocations.status': 'Allocated'
    });
    
    console.log(`Found ${batchGroups.length} batch groups with unprocessed allocations`);
    
    for (const batchGroup of batchGroups) {
      console.log(`\nBatch Group: ${batchGroup.batchGroupNumber}`);
      
      const unprocessedAllocations = batchGroup.orderAllocations.filter(
        alloc => alloc.status === 'Allocated'
      );
      
      console.log(`Unprocessed allocations: ${unprocessedAllocations.length}`);
      
      for (const allocation of unprocessedAllocations) {
        console.log(`  Order: ${allocation.orderId}`);
        console.log(`  Status: ${allocation.status}`);
        console.log(`  Items: ${allocation.items.length}`);
        
        // Check if order exists
        const order = await Order.findById(allocation.orderId);
        if (order) {
          console.log(`  Order Status: ${order.status}`);
          
          // Show allocation details
          for (const item of allocation.items) {
            console.log(`    Product: ${item.productId}, Variant: ${item.variantId}, Quantity: ${item.quantity}`);
            
            // Find the product in batch group
            const batchProduct = batchGroup.products.find(p => 
              p.productId.toString() === item.productId.toString()
            );
            
            if (batchProduct) {
              if (item.variantId && batchProduct.variants && batchProduct.variants.length > 0) {
                const variant = batchProduct.variants.find(v => v.variantId === item.variantId);
                if (variant) {
                  console.log(`      VARIANT - Available: ${variant.availableQuantity}, Allocated: ${variant.allocatedQuantity}, Used: ${variant.usedQuantity}`);
                } else {
                  console.log(`      VARIANT NOT FOUND: ${item.variantId}`);
                }
              } else {
                console.log(`      PRODUCT - Available: ${batchProduct.availableQuantity}, Allocated: ${batchProduct.allocatedQuantity}, Used: ${batchProduct.usedQuantity}`);
              }
            }
          }
          
          // If this is a good test case, use it
          if (allocation.items.some(item => item.variantId)) {
            console.log(`\n🎯 FOUND GOOD TEST CASE: Order ${allocation.orderId} has variant products`);
            return allocation.orderId.toString();
          }
        }
      }
    }
    
    console.log('\nNo unprocessed orders with variants found');
    return null;
  } catch (error) {
    console.error('Error finding unprocessed order:', error);
    return null;
  }
};

const testUnprocessedOrder = async () => {
  const orderId = await findUnprocessedOrder();
  
  if (!orderId) {
    console.log('No suitable test order found');
    process.exit(1);
  }
  
  console.log(`\n=== TESTING UNPROCESSED ORDER ${orderId} ===`);
  
  // Test the moveAllocatedToUsed function
  console.log(`\n--- TESTING MOVE ALLOCATED TO USED ---`);
  const result = await moveAllocatedToUsed(orderId);
  
  console.log(`\nResult success: ${result.success}`);
  console.log(`Updated batch groups: ${result.updatedBatchGroups.length}`);
  console.log(`Errors: ${result.errors.length}`);
  
  if (result.errors.length > 0) {
    console.log('Errors:', result.errors);
  }
  
  // Show state AFTER moving to used
  console.log('\n--- AFTER MOVING TO USED ---');
  
  const updatedBatchGroups = await BatchGroup.find({
    'orderAllocations.orderId': new mongoose.Types.ObjectId(orderId)
  });
  
  for (const batchGroup of updatedBatchGroups) {
    console.log(`\nBatch Group: ${batchGroup.batchGroupNumber}`);
    
    const orderAllocations = batchGroup.orderAllocations.filter(
      alloc => alloc.orderId.toString() === orderId
    );
    
    for (const allocation of orderAllocations) {
      console.log(`  Status: ${allocation.status}`);
      
      for (const item of allocation.items) {
        console.log(`    Product: ${item.productId}, Variant: ${item.variantId}, Quantity: ${item.quantity}`);
        
        const batchProduct = batchGroup.products.find(p => 
          p.productId.toString() === item.productId.toString()
        );
        
        if (batchProduct) {
          if (item.variantId && batchProduct.variants && batchProduct.variants.length > 0) {
            const variant = batchProduct.variants.find(v => v.variantId === item.variantId);
            if (variant) {
              console.log(`      VARIANT AFTER - Available: ${variant.availableQuantity}, Allocated: ${variant.allocatedQuantity}, Used: ${variant.usedQuantity}`);
            }
          } else {
            console.log(`      PRODUCT AFTER - Available: ${batchProduct.availableQuantity}, Allocated: ${batchProduct.allocatedQuantity}, Used: ${batchProduct.usedQuantity}`);
          }
        }
      }
    }
  }
  
  process.exit(0);
};

testUnprocessedOrder();
