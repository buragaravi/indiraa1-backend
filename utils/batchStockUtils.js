import batchService from '../services/batchService.js';
import Product from '../models/Product.js';
import Batch from '../models/Batch.js';


// Update product stock from batch quantities
export const updateProductStockFromBatches = async (productId, variantId = null) => {
  try {
    const batchStock = await batchService.calculateBatchStock(productId, variantId);
    
    const product = await Product.findById(productId);
    if (!product) {
      throw new Error('Product not found');
    }
    
    if (variantId && product.hasVariants) {
      // Update variant stock
      const variant = product.variants.find(v => v.id === variantId);
      if (variant) {
        variant.stock = batchStock.totalAvailable;
        await product.save();
        console.log(`[BATCH SYNC] Updated variant ${variant.name} stock to ${batchStock.totalAvailable}`);
      }
    } else if (!product.hasVariants) {
      // Update main product stock
      product.stock = batchStock.totalAvailable;
      await product.save();
      console.log(`[BATCH SYNC] Updated product ${product.name} stock to ${batchStock.totalAvailable}`);
    }
    
    return batchStock;
  } catch (error) {
    console.error('[BATCH SYNC] Error updating product stock:', error);
    throw error;
  }
};

// Sync all product stocks with batch data
export const syncAllProductStocks = async () => {
  try {
    console.log('[BATCH SYNC] Starting full product stock synchronization...');
    
    const products = await Product.find({});
    let updatedCount = 0;
    
    for (const product of products) {
      try {
        if (product.hasVariants && product.variants.length > 0) {
          // Sync each variant
          for (const variant of product.variants) {
            await updateProductStockFromBatches(product._id, variant.id);
          }
        } else {
          // Sync main product
          await updateProductStockFromBatches(product._id);
        }
        updatedCount++;
      } catch (error) {
        console.error(`[BATCH SYNC] Error syncing product ${product.name}:`, error);
      }
    }
    
    console.log(`[BATCH SYNC] Completed synchronization for ${updatedCount} products`);
    return { updatedCount, totalProducts: products.length };
  } catch (error) {
    console.error('[BATCH SYNC] Error in full synchronization:', error);
    throw error;
  }
};

// Check if sufficient stock exists for an order item
export const checkStockAvailability = async (productId, variantId, quantityNeeded) => {
  try {
    const batchStock = await batchService.calculateBatchStock(productId, variantId);
    
    return {
      available: batchStock.totalAvailable >= quantityNeeded,
      availableQuantity: batchStock.totalAvailable,
      requestedQuantity: quantityNeeded,
      shortfall: Math.max(0, quantityNeeded - batchStock.totalAvailable)
    };
  } catch (error) {
    console.error('[STOCK CHECK] Error checking availability:', error);
    return {
      available: false,
      availableQuantity: 0,
      requestedQuantity: quantityNeeded,
      shortfall: quantityNeeded,
      error: error.message
    };
  }
};

// Allocate stock for order using FEFO
export const allocateStockForOrder = async (orderItems, orderId) => {
  try {
    const allocations = [];
    const errors = [];
    
    for (const item of orderItems) {
      try {
        const result = await batchService.allocateBatchesForOrder(
          item.productId,
          item.variantId,
          item.quantity,
          orderId
        );
        
        if (result.fullyAllocated) {
          allocations.push({
            productId: item.productId,
            variantId: item.variantId,
            quantity: item.quantity,
            allocations: result.allocations,
            status: 'Fully Allocated'
          });
          
          // Update product stock
          await updateProductStockFromBatches(item.productId, item.variantId);
        } else {
          errors.push({
            productId: item.productId,
            variantId: item.variantId,
            requestedQuantity: item.quantity,
            shortfall: result.shortfall,
            message: `Insufficient stock. Short by ${result.shortfall} units.`
          });
        }
      } catch (allocationError) {
        console.error('[STOCK ALLOCATION] Error allocating for item:', item, allocationError);
        errors.push({
          productId: item.productId,
          variantId: item.variantId,
          message: allocationError.message
        });
      }
    }
    
    return {
      success: errors.length === 0,
      allocations,
      errors
    };
  } catch (error) {
    console.error('[STOCK ALLOCATION] Error in order allocation:', error);
    throw error;
  }
};

// Deallocate stock for cancelled/returned orders
export const deallocateStockForOrder = async (orderId) => {
  try {
    await batchService.deallocateBatchQuantities(orderId);
    
    // Find affected products and update their stock
    const batches = await Batch.find({
      'orderAllocations.orderId': orderId
    }).populate('productId');
    
    const affectedProducts = new Set();
    for (const batch of batches) {
      affectedProducts.add({
        productId: batch.productId._id,
        variantId: batch.variantId
      });
    }
    
    // Update stock for affected products
    for (const item of affectedProducts) {
      await updateProductStockFromBatches(item.productId, item.variantId);
    }
    
    console.log(`[STOCK DEALLOCATION] Deallocated stock for order ${orderId}`);
    return { success: true, affectedProducts: affectedProducts.size };
  } catch (error) {
    console.error('[STOCK DEALLOCATION] Error deallocating stock:', error);
    throw error;
  }
};

export default {
  updateProductStockFromBatches,
  syncAllProductStocks,
  checkStockAvailability,
  allocateStockForOrder,
  deallocateStockForOrder
};
