import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Order from './models/Order.js';
import BatchGroup from './models/BatchGroup.js';
import ComboPack from './models/ComboPack.js';
import { moveAllocatedToUsed } from './services/batchGroupService.js';

dotenv.config();

const testComboPackBatchIntegration = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');
    
    console.log('\n=== COMBO PACK & BATCH GROUP INTEGRATION TEST ===');
    
    // 1. Find orders with both regular and combo products
    const orders = await Order.find({ 
      $or: [
        { 'items.type': 'combo' },
        { 'items.type': { $exists: false } } // regular products
      ]
    }).limit(3);
    
    console.log(`\nFound ${orders.length} orders to analyze`);
    
    for (const order of orders) {
      console.log(`\n--- ORDER ${order._id} ---`);
      console.log(`Status: ${order.status}`);
      console.log(`Items: ${order.items.length}`);
      
      // Analyze order composition
      const regularItems = order.items.filter(item => !item.type || item.type !== 'combo');
      const comboItems = order.items.filter(item => item.type === 'combo');
      
      console.log(`  Regular products: ${regularItems.length}`);
      console.log(`  Combo packs: ${comboItems.length}`);
      
      // Show combo pack details
      for (const comboItem of comboItems) {
        try {
          const comboPack = await ComboPack.findById(comboItem.id);
          if (comboPack) {
            console.log(`    Combo: ${comboPack.name} (${comboPack.products.length} products)`);
            for (const comboProduct of comboPack.products) {
              console.log(`      - Product: ${comboProduct.productId}, Variant: ${comboProduct.variantId}, Qty: ${comboProduct.quantity}`);
            }
          }
        } catch (error) {
          console.log(`    Combo ${comboItem.id} not found or error: ${error.message}`);
        }
      }
      
      // Check batch allocations for this order
      const batchGroups = await BatchGroup.find({
        'orderAllocations.orderId': order._id
      });
      
      console.log(`  Batch groups with allocations: ${batchGroups.length}`);
      
      if (batchGroups.length > 0) {
        console.log(`\n  BATCH ALLOCATION ANALYSIS:`);
        
        let totalRegularAllocations = 0;
        let totalComboAllocations = 0;
        
        for (const batchGroup of batchGroups) {
          const orderAllocations = batchGroup.orderAllocations.filter(
            alloc => alloc.orderId.toString() === order._id.toString()
          );
          
          console.log(`    Batch Group: ${batchGroup.batchGroupNumber}`);
          
          for (const allocation of orderAllocations) {
            console.log(`      Status: ${allocation.status}, Items: ${allocation.items.length}`);
            
            for (const item of allocation.items) {
              const itemType = item.type || 'regular';
              console.log(`        ${itemType}: Product ${item.productId}, Variant: ${item.variantId}, Qty: ${item.quantity}`);
              
              if (itemType === 'combo-item') {
                totalComboAllocations++;
                console.log(`          ↳ From combo pack: ${item.parentComboId}`);
              } else {
                totalRegularAllocations++;
              }
            }
          }
        }
        
        console.log(`  SUMMARY: ${totalRegularAllocations} regular allocations, ${totalComboAllocations} combo-item allocations`);
        
        // Test moveAllocatedToUsed if order is not already delivered
        if (order.status !== 'Delivered') {
          console.log(`\n  TESTING MOVE ALLOCATED TO USED:`);
          
          const result = await moveAllocatedToUsed(order._id);
          
          console.log(`    Success: ${result.success}`);
          console.log(`    Updated batch groups: ${result.updatedBatchGroups.length}`);
          console.log(`    Combo packs processed: ${result.comboPacksProcessed?.length || 0}`);
          
          if (result.comboPacksProcessed && result.comboPacksProcessed.length > 0) {
            console.log(`    Combo pack IDs: ${result.comboPacksProcessed.join(', ')}`);
          }
          
          if (result.errors.length > 0) {
            console.log(`    Errors: ${result.errors.length}`);
            result.errors.forEach(error => console.log(`      - ${error}`));
          }
        } else {
          console.log(`  Order already delivered - skipping moveAllocatedToUsed test`);
        }
      }
      
      console.log(`\n${'='.repeat(60)}`);
    }
    
    // 2. Test combo pack stock calculation
    console.log(`\n=== COMBO PACK STOCK ANALYSIS ===`);
    
    const comboPacks = await ComboPack.find({ isActive: true }).limit(3);
    console.log(`Found ${comboPacks.length} active combo packs`);
    
    for (const comboPack of comboPacks) {
      console.log(`\nCombo Pack: ${comboPack.name}`);
      console.log(`  Current stock: ${comboPack.stock}`);
      
      try {
        const calculatedStock = await comboPack.calculateAvailableStock();
        console.log(`  Calculated available stock: ${calculatedStock}`);
        
        if (calculatedStock !== comboPack.stock) {
          console.log(`  ⚠️  Stock mismatch detected!`);
        } else {
          console.log(`  ✅ Stock matches calculation`);
        }
      } catch (error) {
        console.log(`  ❌ Error calculating stock: ${error.message}`);
      }
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Error in combo pack batch integration test:', error);
    process.exit(1);
  }
};

testComboPackBatchIntegration();
