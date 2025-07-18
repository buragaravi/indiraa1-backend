import mongoose from 'mongoose';
import dotenv from 'dotenv';
import BatchGroup from './models/BatchGroup.js';
import Order from './models/Order.js';
import { moveAllocatedToUsed } from './services/batchGroupService.js';

dotenv.config();

const testVariantAllocation = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');
    
    // Find an order that has variant products
    const orders = await Order.find({ status: 'Pending' }).limit(5);
    console.log(`Found ${orders.length} pending orders`);
    
    for (const order of orders) {
      console.log(`\n=== CHECKING ORDER ${order._id} ===`);
      
      // Check if this order has allocations in batch groups
      const batchGroups = await BatchGroup.find({
        'orderAllocations.orderId': order._id
      });
      
      console.log(`Found ${batchGroups.length} batch groups with allocations`);
      
      if (batchGroups.length > 0) {
        // Show current state
        console.log('\n--- BEFORE MOVING TO USED ---');
        for (const batchGroup of batchGroups) {
          console.log(`Batch Group: ${batchGroup.batchGroupNumber}`);
          
          // Show allocations for this order
          const orderAllocations = batchGroup.orderAllocations.filter(
            alloc => alloc.orderId.toString() === order._id.toString()
          );
          
          console.log(`Order allocations: ${orderAllocations.length}`);
          
          for (const allocation of orderAllocations) {
            console.log(`  Status: ${allocation.status}`);
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
                    console.log(`      VARIANT - Available: ${variant.availableQuantity}, Allocated: ${variant.allocatedQuantity}, Used: ${variant.usedQuantity}`);
                  } else {
                    console.log(`      VARIANT NOT FOUND: ${item.variantId}`);
                  }
                } else {
                  console.log(`      PRODUCT - Available: ${batchProduct.availableQuantity}, Allocated: ${batchProduct.allocatedQuantity}, Used: ${batchProduct.usedQuantity}`);
                }
              } else {
                console.log(`      PRODUCT NOT FOUND: ${item.productId}`);
              }
            }
          }
        }
        
        // Test the moveAllocatedToUsed function
        console.log(`\n--- TESTING MOVE ALLOCATED TO USED ---`);
        const result = await moveAllocatedToUsed(order._id);
        
        console.log('Result:', result);
        
        if (result.success) {
          console.log('\n--- AFTER MOVING TO USED ---');
          
          // Reload batch groups to see updated state
          const updatedBatchGroups = await BatchGroup.find({
            'orderAllocations.orderId': order._id
          });
          
          for (const batchGroup of updatedBatchGroups) {
            console.log(`Batch Group: ${batchGroup.batchGroupNumber}`);
            
            const orderAllocations = batchGroup.orderAllocations.filter(
              alloc => alloc.orderId.toString() === order._id.toString()
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
                      console.log(`      VARIANT - Available: ${variant.availableQuantity}, Allocated: ${variant.allocatedQuantity}, Used: ${variant.usedQuantity}`);
                    }
                  } else {
                    console.log(`      PRODUCT - Available: ${batchProduct.availableQuantity}, Allocated: ${batchProduct.allocatedQuantity}, Used: ${batchProduct.usedQuantity}`);
                  }
                }
              }
            }
          }
        }
        
        // Only test the first order for now
        break;
      }
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Error testing variant allocation:', error);
    process.exit(1);
  }
};

testVariantAllocation();
