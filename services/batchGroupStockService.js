import BatchGroup from '../models/BatchGroup.js';
import mongoose from 'mongoose';

// Calculate total available stock from batch groups
export const calculateBatchGroupStock = async (productId, variantId = null) => {
  try {
    // Convert productId to ObjectId if it's a string
    const productObjectId = typeof productId === 'string' ? new mongoose.Types.ObjectId(productId) : productId;
    
    console.log(`[BATCH GROUP SERVICE] Calculating stock for product ${productObjectId}, variant ${variantId}`);
    
    if (variantId) {
      // For variant products, aggregate from variants array
      const result = await BatchGroup.aggregate([
        {
          $match: {
            'products.productId': productObjectId,
            'products.variants.variantId': variantId,
            status: 'Active'
          }
        },
        {
          $unwind: '$products'
        },
        {
          $match: {
            'products.productId': productObjectId
          }
        },
        {
          $unwind: '$products.variants'
        },
        {
          $match: {
            'products.variants.variantId': variantId
          }
        },
        {
          $group: {
            _id: null,
            totalAvailable: { $sum: '$products.variants.availableQuantity' },
            totalAllocated: { $sum: '$products.variants.allocatedQuantity' },
            totalQuantity: { $sum: '$products.variants.quantity' },
            batchGroupCount: { $sum: 1 }
          }
        }
      ]);
      
      const stockResult = result[0] || {
        totalAvailable: 0,
        totalAllocated: 0,
        totalQuantity: 0,
        batchGroupCount: 0
      };
      
      console.log(`[BATCH GROUP SERVICE] Variant stock calculation result:`, stockResult);
      return stockResult;
      
    } else {
      // For non-variant products, aggregate from products array
      const result = await BatchGroup.aggregate([
        {
          $match: {
            'products.productId': productObjectId,
            status: 'Active'
          }
        },
        {
          $unwind: '$products'
        },
        {
          $match: {
            'products.productId': productObjectId,
            'products.variants': { $size: 0 } // Only non-variant products
          }
        },
        {
          $group: {
            _id: null,
            totalAvailable: { $sum: '$products.availableQuantity' },
            totalAllocated: { $sum: '$products.allocatedQuantity' },
            totalQuantity: { $sum: '$products.quantity' },
            batchGroupCount: { $sum: 1 }
          }
        }
      ]);
      
      const stockResult = result[0] || {
        totalAvailable: 0,
        totalAllocated: 0,
        totalQuantity: 0,
        batchGroupCount: 0
      };
      
      console.log(`[BATCH GROUP SERVICE] Product stock calculation result:`, stockResult);
      return stockResult;
    }
  } catch (error) {
    console.error('[BATCH GROUP SERVICE] Error calculating batch group stock:', error);
    throw error;
  }
};

// Check if sufficient stock exists for an order item in batch groups
export const checkBatchGroupStockAvailability = async (productId, variantId, quantityNeeded) => {
  try {
    // Convert productId to ObjectId if it's a string
    const productObjectId = typeof productId === 'string' ? new mongoose.Types.ObjectId(productId) : productId;
    
    console.log(`[BATCH GROUP STOCK CHECK] Checking availability for product ${productObjectId}, variant ${variantId}, quantity ${quantityNeeded}`);
    
    const batchGroupStock = await calculateBatchGroupStock(productObjectId, variantId);
    
    console.log(`[BATCH GROUP STOCK CHECK] Batch group stock result:`, batchGroupStock);
    
    const result = {
      available: batchGroupStock.totalAvailable >= quantityNeeded,
      availableQuantity: batchGroupStock.totalAvailable,
      requestedQuantity: quantityNeeded,
      shortfall: Math.max(0, quantityNeeded - batchGroupStock.totalAvailable)
    };
    
    console.log(`[BATCH GROUP STOCK CHECK] Final availability result:`, result);
    
    return result;
  } catch (error) {
    console.error('[BATCH GROUP STOCK CHECK] Error checking availability:', error);
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
export const allocateBatchGroupStockForOrder = async (orderItems, orderId) => {
  try {
    console.log(`[BATCH GROUP ALLOCATION] Starting allocation for order ${orderId}`);
    console.log(`[BATCH GROUP ALLOCATION] Order items:`, orderItems);
    
    const allocations = [];
    const errors = [];
    
    for (const item of orderItems) {
      try {
        console.log(`[BATCH GROUP ALLOCATION] Processing item: product ${item.productId}, variant ${item.variantId}, quantity ${item.quantity}`);
        
        const result = await allocateBatchGroupsForOrderItem(
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
          
          console.log(`[BATCH GROUP ALLOCATION] Successfully allocated ${item.quantity} units for product ${item.productId}`);
        } else {
          errors.push({
            productId: item.productId,
            variantId: item.variantId,
            requestedQuantity: item.quantity,
            shortfall: result.shortfall,
            message: `Insufficient stock in batch groups. Short by ${result.shortfall} units.`
          });
          
          console.log(`[BATCH GROUP ALLOCATION] Failed to allocate ${item.quantity} units for product ${item.productId}, shortfall: ${result.shortfall}`);
        }
      } catch (allocationError) {
        console.error('[BATCH GROUP ALLOCATION] Error allocating for item:', item, allocationError);
        errors.push({
          productId: item.productId,
          variantId: item.variantId,
          message: allocationError.message
        });
      }
    }
    
    console.log(`[BATCH GROUP ALLOCATION] Allocation complete. Successful: ${allocations.length}, Errors: ${errors.length}`);
    
    return {
      success: errors.length === 0,
      allocations,
      errors
    };
  } catch (error) {
    console.error('[BATCH GROUP ALLOCATION] Error in order allocation:', error);
    throw error;
  }
};

// Allocate batch groups for a single order item using FEFO
export const allocateBatchGroupsForOrderItem = async (productId, variantId, quantityNeeded, orderId) => {
  try {
    // Convert productId to ObjectId if it's a string
    const productObjectId = typeof productId === 'string' ? new mongoose.Types.ObjectId(productId) : productId;
    const orderObjectId = typeof orderId === 'string' ? new mongoose.Types.ObjectId(orderId) : orderId;
    
    console.log(`[BATCH GROUP ITEM ALLOCATION] Allocating ${quantityNeeded} units for product ${productObjectId}, variant ${variantId}`);
    
    // Get available batch groups sorted by FEFO (First Expiry, First Out)
    const availableBatchGroups = await getBatchGroupsForFEFO(productObjectId, variantId, quantityNeeded);
    
    console.log(`[BATCH GROUP ITEM ALLOCATION] Found ${availableBatchGroups.length} available batch groups`);
    
    const allocations = [];
    let remainingQuantity = quantityNeeded;
    
    for (const batchGroup of availableBatchGroups) {
      if (remainingQuantity <= 0) break;
      
      console.log(`[BATCH GROUP ITEM ALLOCATION] Processing batch group ${batchGroup.batchGroupNumber}`);
      
      if (variantId) {
        // Handle variant products
        const product = batchGroup.products.find(p => p.productId.toString() === productObjectId.toString());
        if (product) {
          const variant = product.variants.find(v => v.variantId === variantId);
          if (variant && variant.availableQuantity > 0) {
            const allocateQty = Math.min(variant.availableQuantity, remainingQuantity);
            
            // Update quantities
            variant.availableQuantity -= allocateQty;
            variant.allocatedQuantity += allocateQty;
            
            // Add allocation record
            batchGroup.orderAllocations.push({
              orderId: orderObjectId,
              allocatedAt: new Date(),
              items: [{
                productId: productObjectId,
                variantId: variantId,
                quantity: allocateQty
              }]
            });
            
            await batchGroup.save();
            
            allocations.push({
              batchGroupId: batchGroup._id,
              batchGroupNumber: batchGroup.batchGroupNumber,
              quantityAllocated: allocateQty,
              expiryDate: variant.expiryDate || batchGroup.defaultExpiryDate,
              manufacturingDate: variant.manufacturingDate || batchGroup.defaultManufacturingDate
            });
            
            remainingQuantity -= allocateQty;
            
            console.log(`[BATCH GROUP ITEM ALLOCATION] Allocated ${allocateQty} units from batch group ${batchGroup.batchGroupNumber}, remaining: ${remainingQuantity}`);
          }
        }
      } else {
        // Handle non-variant products
        const product = batchGroup.products.find(p => 
          p.productId.toString() === productObjectId.toString() && 
          (!p.variants || p.variants.length === 0)
        );
        
        if (product && product.availableQuantity > 0) {
          const allocateQty = Math.min(product.availableQuantity, remainingQuantity);
          
          // Update quantities
          product.availableQuantity -= allocateQty;
          product.allocatedQuantity += allocateQty;
          
          // Add allocation record
          batchGroup.orderAllocations.push({
            orderId: orderObjectId,
            allocatedAt: new Date(),
            items: [{
              productId: productObjectId,
              variantId: null,
              quantity: allocateQty
            }]
          });
          
          await batchGroup.save();
          
          allocations.push({
            batchGroupId: batchGroup._id,
            batchGroupNumber: batchGroup.batchGroupNumber,
            quantityAllocated: allocateQty,
            expiryDate: product.expiryDate || batchGroup.defaultExpiryDate,
            manufacturingDate: product.manufacturingDate || batchGroup.defaultManufacturingDate
          });
          
          remainingQuantity -= allocateQty;
          
          console.log(`[BATCH GROUP ITEM ALLOCATION] Allocated ${allocateQty} units from batch group ${batchGroup.batchGroupNumber}, remaining: ${remainingQuantity}`);
        }
      }
    }
    
    console.log(`[BATCH GROUP ITEM ALLOCATION] Allocation complete. Remaining quantity: ${remainingQuantity}`);
    
    return {
      allocations,
      shortfall: remainingQuantity,
      fullyAllocated: remainingQuantity === 0
    };
  } catch (error) {
    console.error('[BATCH GROUP ITEM ALLOCATION] Error allocating batch groups:', error);
    throw error;
  }
};

// Get batch groups for FEFO allocation
export const getBatchGroupsForFEFO = async (productId, variantId, quantityNeeded) => {
  try {
    // Convert productId to ObjectId if it's a string
    const productObjectId = typeof productId === 'string' ? new mongoose.Types.ObjectId(productId) : productId;
    
    console.log(`[BATCH GROUP FEFO] Getting batch groups for product ${productObjectId}, variant ${variantId}`);
    
    const batchGroups = await BatchGroup.find({
      'products.productId': productObjectId,
      status: 'Active'
    }).sort({ 
      defaultExpiryDate: 1, // Earliest expiry first
      defaultManufacturingDate: 1 // Then oldest manufacturing date
    });
    
    console.log(`[BATCH GROUP FEFO] Found ${batchGroups.length} batch groups`);
    
    // Filter batch groups that have available stock for the specific product/variant
    const availableBatchGroups = batchGroups.filter(batchGroup => {
      const product = batchGroup.products.find(p => p.productId.toString() === productObjectId.toString());
      
      if (!product) return false;
      
      if (variantId) {
        // Check if variant has available stock
        const variant = product.variants.find(v => v.variantId === variantId);
        return variant && variant.availableQuantity > 0;
      } else {
        // Check if non-variant product has available stock
        return (!product.variants || product.variants.length === 0) && product.availableQuantity > 0;
      }
    });
    
    console.log(`[BATCH GROUP FEFO] Filtered to ${availableBatchGroups.length} available batch groups`);
    
    return availableBatchGroups;
  } catch (error) {
    console.error('[BATCH GROUP FEFO] Error getting batch groups:', error);
    throw error;
  }
};

export default {
  calculateBatchGroupStock,
  checkBatchGroupStockAvailability,
  allocateBatchGroupStockForOrder,
  allocateBatchGroupsForOrderItem,
  getBatchGroupsForFEFO
};
