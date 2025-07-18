import mongoose from 'mongoose';
import dotenv from 'dotenv';
import BatchGroup from './models/BatchGroup.js';
import Order from './models/Order.js';
import { moveAllocatedToUsed } from './services/batchGroupService.js';

dotenv.config();

const testSpecificOrder = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');
    
    const orderId = '687a681d369cf11669694e1c';
    console.log(`\n=== TESTING ORDER ${orderId} ===`);
    
    // Find the order
    const order = await Order.findById(orderId);
    if (!order) {
      console.log('Order not found');
      process.exit(1);
    }
    
    console.log(`Order status: ${order.status}`);
    console.log(`Order items: ${order.items.length}`);
    
    // Check if this order has allocations in batch groups
    const batchGroups = await BatchGroup.find({
      'orderAllocations.orderId': new mongoose.Types.ObjectId(orderId)
    });
    
    console.log(`\nFound ${batchGroups.length} batch groups with allocations`);
    
    if (batchGroups.length === 0) {
      console.log('No batch groups found for this order');
      process.exit(1);
    }
    
    // Show current state BEFORE moving to used
    console.log('\n--- BEFORE MOVING TO USED ---');
    for (const batchGroup of batchGroups) {
      console.log(`\nBatch Group: ${batchGroup.batchGroupNumber} (${batchGroup._id})`);
      
      // Show allocations for this order
      const orderAllocations = batchGroup.orderAllocations.filter(
        alloc => alloc.orderId.toString() === orderId
      );
      
      console.log(`Order allocations: ${orderAllocations.length}`);
      
      for (const allocation of orderAllocations) {
        console.log(`  Allocation Status: ${allocation.status}`);
        console.log(`  Items: ${allocation.items.length}`);
        
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
                console.log(`      VARIANT FOUND - Available: ${variant.availableQuantity}, Allocated: ${variant.allocatedQuantity}, Used: ${variant.usedQuantity}`);
              } else {
                console.log(`      VARIANT NOT FOUND: ${item.variantId}`);
                console.log(`      Available variants: ${batchProduct.variants.map(v => v.variantId).join(', ')}`);
              }
            } else {
              console.log(`      NON-VARIANT PRODUCT - Available: ${batchProduct.availableQuantity}, Allocated: ${batchProduct.allocatedQuantity}, Used: ${batchProduct.usedQuantity}`);
            }
          } else {
            console.log(`      PRODUCT NOT FOUND: ${item.productId}`);
          }
        }
      }
    }
    
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
    
    // Reload batch groups to see updated state
    const updatedBatchGroups = await BatchGroup.find({
      'orderAllocations.orderId': new mongoose.Types.ObjectId(orderId)
    });
    
    for (const batchGroup of updatedBatchGroups) {
      console.log(`\nBatch Group: ${batchGroup.batchGroupNumber} (${batchGroup._id})`);
      
      const orderAllocations = batchGroup.orderAllocations.filter(
        alloc => alloc.orderId.toString() === orderId
      );
      
      for (const allocation of orderAllocations) {
        console.log(`  Allocation Status: ${allocation.status}`);
        console.log(`  Delivered At: ${allocation.deliveredAt}`);
        
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
  } catch (error) {
    console.error('Error testing specific order:', error);
    process.exit(1);
  }
};

testSpecificOrder();
