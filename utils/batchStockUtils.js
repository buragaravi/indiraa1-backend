import batchService from '../services/batchService.js';
import batchGroupStockService from '../services/batchGroupStockService.js';
import Product from '../models/Product.js';
import Batch from '../models/Batch.js';
import mongoose from 'mongoose';


// Update product stock from batch quantities
export const updateProductStockFromBatches = async (productId, variantId = null) => {
  try {
    // Convert productId to ObjectId if it's a string
    const productObjectId = typeof productId === 'string' ? new mongoose.Types.ObjectId(productId) : productId;
    
    console.log(`[BATCH SYNC] Updating product stock for product ${productObjectId}, variant ${variantId}`);
    
    // Use batch group stock calculation instead of individual batches
    const batchStock = await batchGroupStockService.calculateBatchGroupStock(productObjectId, variantId);
    
    console.log(`[BATCH SYNC] Batch group stock result:`, batchStock);
    
    const product = await Product.findById(productObjectId);
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
    // Convert productId to ObjectId if it's a string
    const productObjectId = typeof productId === 'string' ? new mongoose.Types.ObjectId(productId) : productId;
    
    console.log(`[STOCK CHECK] Checking availability for product ${productObjectId}, variant ${variantId}, quantity ${quantityNeeded}`);
    
    // Use batch group stock check instead of individual batch check
    const result = await batchGroupStockService.checkBatchGroupStockAvailability(productObjectId, variantId, quantityNeeded);
    
    console.log(`[STOCK CHECK] Final availability result:`, result);
    
    return result;
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

// Allocate stock for order using FEFO from batch groups
export const allocateStockForOrder = async (orderItems, orderId) => {
  try {
    console.log(`[STOCK ALLOCATION] Starting batch group allocation for order ${orderId}`);
    console.log(`[STOCK ALLOCATION] Order items:`, orderItems);
    
    // Use batch group allocation instead of individual batch allocation
    const result = await batchGroupStockService.allocateBatchGroupStockForOrder(orderItems, orderId);
    
    console.log(`[STOCK ALLOCATION] Batch group allocation result:`, result);
    
    // Update product stocks after allocation
    if (result.success) {
      for (const item of orderItems) {
        try {
          console.log(`[STOCK ALLOCATION] Updating product stock for ${item.productId}, variant ${item.variantId}`);
          await updateProductStockFromBatches(item.productId, item.variantId);
        } catch (updateError) {
          console.error(`[STOCK ALLOCATION] Failed to update product stock for ${item.productId}:`, updateError);
        }
      }
    }
    
    return result;
  } catch (error) {
    console.error('[STOCK ALLOCATION] Error in order allocation:', error);
    throw error;
  }
};

// Deallocate stock for cancelled/returned orders
export const deallocateStockForOrder = async (orderId) => {
  try {
    // Convert orderId to ObjectId if it's a string
    const orderObjectId = typeof orderId === 'string' ? new mongoose.Types.ObjectId(orderId) : orderId;
    
    await batchService.deallocateBatchQuantities(orderObjectId);
    
    // Find affected products and update their stock
    const batches = await Batch.find({
      'orderAllocations.orderId': orderObjectId
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
