import Batch from '../models/Batch.js';
import mongoose from 'mongoose';

// Batch service functions for product integration

// Create or merge batch for a product/variant
export const createOrMergeBatch = async (productId, variantId, batchData, createdBy) => {
  try {
    const {
      quantity,
      manufacturingDate,
      expiryDate,
      bestBeforeDate,
      supplierInfo,
      location,
      qualityChecked = false,
      qualityNotes = ''
    } = batchData;

    // Validate dates
    const mfgDate = manufacturingDate ? new Date(manufacturingDate) : new Date();
    const expDate = expiryDate ? new Date(expiryDate) : null;
    const bbDate = bestBeforeDate ? new Date(bestBeforeDate) : null;

    // Validate date logic
    if (mfgDate > new Date()) {
      throw new Error('Manufacturing date cannot be in the future');
    }
    
    if (expDate && expDate <= mfgDate) {
      throw new Error('Expiry date must be after manufacturing date');
    }
    
    if (bbDate && expDate && bbDate > expDate) {
      throw new Error('Best before date cannot be after expiry date');
    }

    // Prepare batch data for compatibility check
    const batchSearchData = {
      manufacturingDate: mfgDate,
      expiryDate: expDate,
      bestBeforeDate: bbDate,
      supplierInfo: {
        supplierName: supplierInfo?.supplierName || 'Default Supplier'
      }
    };

    // Look for compatible existing batch
    const existingBatch = await Batch.findCompatibleBatch(productId, variantId, batchSearchData);

    if (existingBatch) {
      // Merge with existing batch
      existingBatch.quantity += quantity;
      existingBatch.availableQuantity += quantity;
      
      // Update supplier info if provided
      if (supplierInfo?.purchaseOrderNumber) {
        existingBatch.supplierInfo.purchaseOrderNumber = supplierInfo.purchaseOrderNumber;
      }
      if (supplierInfo?.receivedDate) {
        existingBatch.supplierInfo.receivedDate = new Date(supplierInfo.receivedDate);
      }
      if (supplierInfo?.contactInfo) {
        existingBatch.supplierInfo.contactInfo = supplierInfo.contactInfo;
      }
      
      await existingBatch.save();
      
      console.log(`[BATCH SERVICE] Merged ${quantity} units into existing batch ${existingBatch.batchNumber}`);
      return {
        batch: existingBatch,
        merged: true,
        message: `Added ${quantity} units to existing batch ${existingBatch.batchNumber}`
      };
    } else {
      // Create new batch
      const batchNumber = await Batch.generateBatchNumber(productId, variantId);
      
      const newBatch = new Batch({
        batchNumber,
        productId,
        variantId,
        quantity,
        availableQuantity: quantity,
        manufacturingDate: mfgDate,
        expiryDate: expDate,
        bestBeforeDate: bbDate,
        supplierInfo: {
          supplierName: supplierInfo?.supplierName || 'Default Supplier',
          purchaseOrderNumber: supplierInfo?.purchaseOrderNumber || '',
          receivedDate: supplierInfo?.receivedDate ? new Date(supplierInfo.receivedDate) : new Date(),
          contactInfo: supplierInfo?.contactInfo || ''
        },
        location: location || 'Main Warehouse',
        qualityChecked,
        qualityNotes,
        createdBy
      });

      await newBatch.save();
      
      console.log(`[BATCH SERVICE] Created new batch ${newBatch.batchNumber} with ${quantity} units`);
      return {
        batch: newBatch,
        merged: false,
        message: `Created new batch ${newBatch.batchNumber} with ${quantity} units`
      };
    }
  } catch (error) {
    console.error('[BATCH SERVICE] Error creating/merging batch:', error);
    throw error;
  }
};

// Allocate batches for order using FEFO
export const allocateBatchesForOrder = async (productId, variantId, quantityNeeded, orderId) => {
  try {
    // Convert productId to ObjectId if it's a string
    const productObjectId = typeof productId === 'string' ? new mongoose.Types.ObjectId(productId) : productId;
    
    const availableBatches = await Batch.getBatchesForFEFO(productObjectId, variantId, quantityNeeded);
    
    const allocations = [];
    let remainingQuantity = quantityNeeded;

    for (const batch of availableBatches) {
      if (remainingQuantity <= 0) break;

      const allocateQty = Math.min(batch.availableQuantity, remainingQuantity);
      
      // Update batch quantities
      batch.availableQuantity -= allocateQty;
      batch.allocatedQuantity += allocateQty;
      
      // Add allocation record
      batch.orderAllocations.push({
        orderId,
        quantityAllocated: allocateQty,
        allocationDate: new Date(),
        status: 'Allocated'
      });

      await batch.save();

      allocations.push({
        batchId: batch._id,
        batchNumber: batch.batchNumber,
        quantityAllocated: allocateQty,
        expiryDate: batch.expiryDate,
        manufacturingDate: batch.manufacturingDate
      });

      remainingQuantity -= allocateQty;
    }

    return {
      allocations,
      shortfall: remainingQuantity,
      fullyAllocated: remainingQuantity === 0
    };
  } catch (error) {
    console.error('[BATCH SERVICE] Error allocating batches:', error);
    throw error;
  }
};

// Calculate total available stock from batches
export const calculateBatchStock = async (productId, variantId = null) => {
  try {
    // Convert productId to ObjectId if it's a string
    const productObjectId = typeof productId === 'string' ? new mongoose.Types.ObjectId(productId) : productId;
    
    console.log(`[BATCH SERVICE] Calculating stock for product ${productObjectId}, variant ${variantId}`);
    
    const result = await Batch.aggregate([
      {
        $match: {
          productId: productObjectId,
          variantId: variantId,
          status: 'Active'
        }
      },
      {
        $group: {
          _id: null,
          totalAvailable: { $sum: '$availableQuantity' },
          totalAllocated: { $sum: '$allocatedQuantity' },
          totalQuantity: { $sum: '$quantity' },
          batchCount: { $sum: 1 }
        }
      }
    ]);

    const stockResult = result[0] || {
      totalAvailable: 0,
      totalAllocated: 0,
      totalQuantity: 0,
      batchCount: 0
    };
    
    console.log(`[BATCH SERVICE] Stock calculation result:`, stockResult);
    
    // Also check if there are any batches at all
    const batchCount = await Batch.countDocuments({
      productId: productObjectId,
      variantId: variantId,
      status: 'Active'
    });
    
    console.log(`[BATCH SERVICE] Total active batches found: ${batchCount}`);
    
    return stockResult;
  } catch (error) {
    console.error('[BATCH SERVICE] Error calculating batch stock:', error);
    throw error;
  }
};

// Get expiring batches
export const getExpiringBatches = async (daysAhead = 30) => {
  try {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + daysAhead);

    return await Batch.find({
      status: 'Active',
      expiryDate: { 
        $exists: true, 
        $lte: futureDate,
        $gte: new Date()
      },
      availableQuantity: { $gt: 0 }
    })
    .populate('productId', 'name category')
    .sort({ expiryDate: 1 });
  } catch (error) {
    console.error('[BATCH SERVICE] Error getting expiring batches:', error);
    throw error;
  }
};

// Update batch status based on expiry
export const updateExpiredBatches = async () => {
  try {
    const now = new Date();
    
    const result = await Batch.updateMany(
      {
        status: { $ne: 'Expired' },
        expiryDate: { $lt: now }
      },
      {
        $set: { status: 'Expired' }
      }
    );

    console.log(`[BATCH SERVICE] Updated ${result.modifiedCount} expired batches`);
    return result;
  } catch (error) {
    console.error('[BATCH SERVICE] Error updating expired batches:', error);
    throw error;
  }
};

// Deallocate batch quantities (for cancelled orders)
export const deallocateBatchQuantities = async (orderId) => {
  try {
    // Convert orderId to ObjectId if it's a string
    const orderObjectId = typeof orderId === 'string' ? new mongoose.Types.ObjectId(orderId) : orderId;
    
    const batches = await Batch.find({
      'orderAllocations.orderId': orderObjectId,
      'orderAllocations.status': 'Allocated'
    });

    for (const batch of batches) {
      const allocation = batch.orderAllocations.find(
        alloc => alloc.orderId.toString() === orderObjectId.toString() && alloc.status === 'Allocated'
      );

      if (allocation) {
        // Move quantity back to available
        batch.availableQuantity += allocation.quantityAllocated;
        batch.allocatedQuantity -= allocation.quantityAllocated;
        
        // Update allocation status
        allocation.status = 'Cancelled';
        
        await batch.save();
      }
    }

    console.log(`[BATCH SERVICE] Deallocated batches for cancelled order ${orderId}`);
  } catch (error) {
    console.error('[BATCH SERVICE] Error deallocating batches:', error);
    throw error;
  }
};

// Find latest compatible batch (for individual product additions)
export const findLatestCompatibleBatch = async (productId, variantId, batchData) => {
  try {
    const {
      manufacturingDate,
      expiryDate,
      bestBeforeDate,
      supplierInfo
    } = batchData;

    // Find the most recent compatible batch
    const compatibleBatch = await Batch.findOne({
      productId,
      variantId,
      status: 'Active',
      manufacturingDate,
      expiryDate: expiryDate || null,
      bestBeforeDate: bestBeforeDate || null,
      'supplierInfo.supplierName': supplierInfo?.supplierName || 'Default Supplier'
    }).sort({ createdAt: -1 }); // Get the latest one

    return compatibleBatch;
  } catch (error) {
    console.error('[BATCH SERVICE] Error finding latest compatible batch:', error);
    return null;
  }
};

// Create bulk batch group (for bulk uploads)
export const createBulkBatchGroup = async (bulkUploadData, createdBy) => {
  try {
    const {
      products,
      batchConfig,
      groupIdentifier = `BULK-${Date.now()}`
    } = bulkUploadData;

    console.log(`[BATCH SERVICE] Creating bulk batch group: ${groupIdentifier}`);
    
    const results = [];
    const batchGroups = new Map(); // Group by batch compatibility

    for (const product of products) {
      const {
        productId,
        variants = [],
        hasVariants,
        stock,
        manufacturingDate,
        expiryDate,
        bestBeforeDate,
        supplierInfo
      } = product;

      // Create batch key for grouping
      const createBatchKey = (mfgDate, expDate, supplier) => {
        return `${mfgDate?.toISOString()}_${expDate?.toISOString() || 'null'}_${supplier}`;
      };

      if (hasVariants && variants.length > 0) {
        // Handle variants
        for (const variant of variants) {
          if (variant.stock > 0) {
            const mfgDate = variant.manufacturingDate ? new Date(variant.manufacturingDate) : 
                           (manufacturingDate ? new Date(manufacturingDate) : new Date());
            const expDate = variant.expiryDate ? new Date(variant.expiryDate) : 
                           (expiryDate ? new Date(expiryDate) : null);
            const supplierName = supplierInfo?.supplierName || 'Default Supplier';
            
            const batchKey = createBatchKey(mfgDate, expDate, supplierName);
            
            if (!batchGroups.has(batchKey)) {
              batchGroups.set(batchKey, {
                manufacturingDate: mfgDate,
                expiryDate: expDate,
                bestBeforeDate: bestBeforeDate ? new Date(bestBeforeDate) : null,
                supplierInfo,
                items: []
              });
            }
            
            batchGroups.get(batchKey).items.push({
              productId,
              variantId: variant.id,
              quantity: variant.stock,
              type: 'variant',
              variantName: variant.name
            });
          }
        }
      } else {
        // Handle main product
        if (stock > 0) {
          const mfgDate = manufacturingDate ? new Date(manufacturingDate) : new Date();
          const expDate = expiryDate ? new Date(expiryDate) : null;
          const supplierName = supplierInfo?.supplierName || 'Default Supplier';
          
          const batchKey = createBatchKey(mfgDate, expDate, supplierName);
          
          if (!batchGroups.has(batchKey)) {
            batchGroups.set(batchKey, {
              manufacturingDate: mfgDate,
              expiryDate: expDate,
              bestBeforeDate: bestBeforeDate ? new Date(bestBeforeDate) : null,
              supplierInfo,
              items: []
            });
          }
          
          batchGroups.get(batchKey).items.push({
            productId,
            variantId: null,
            quantity: stock,
            type: 'product'
          });
        }
      }
    }

    // Create batches for each group
    for (const [batchKey, groupData] of batchGroups) {
      const { manufacturingDate, expiryDate, bestBeforeDate, supplierInfo, items } = groupData;
      
      // Calculate total quantity for this batch group
      const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
      
      // Create single batch for the group
      const batchNumber = await Batch.generateBatchNumber(
        items[0].productId, 
        items[0].variantId
      );
      
      const groupBatch = new Batch({
        batchNumber,
        productId: items[0].productId, // Primary product for batch number generation
        variantId: items[0].variantId,
        quantity: totalQuantity,
        availableQuantity: totalQuantity,
        manufacturingDate,
        expiryDate,
        bestBeforeDate,
        supplierInfo: {
          supplierName: supplierInfo?.supplierName || 'Default Supplier',
          purchaseOrderNumber: supplierInfo?.purchaseOrderNumber || '',
          receivedDate: supplierInfo?.receivedDate ? new Date(supplierInfo.receivedDate) : new Date(),
          contactInfo: supplierInfo?.contactInfo || ''
        },
        location: 'Main Warehouse',
        qualityChecked: false,
        qualityNotes: `Bulk upload group: ${groupIdentifier}`,
        createdBy,
        metadata: {
          bulkUploadGroup: groupIdentifier,
          itemCount: items.length,
          items: items.map(item => ({
            productId: item.productId,
            variantId: item.variantId,
            quantity: item.quantity,
            type: item.type,
            variantName: item.variantName
          }))
        }
      });

      await groupBatch.save();
      
      results.push({
        batchNumber: groupBatch.batchNumber,
        totalQuantity,
        items: items.length,
        groupKey: batchKey,
        batch: groupBatch
      });
      
      console.log(`[BATCH SERVICE] Created group batch ${groupBatch.batchNumber} with ${totalQuantity} units (${items.length} items)`);
    }

    return {
      success: true,
      groupIdentifier,
      totalBatches: results.length,
      results
    };
    
  } catch (error) {
    console.error('[BATCH SERVICE] Error creating bulk batch group:', error);
    throw error;
  }
};

// Enhanced create or merge with bulk mode support
export const createOrMergeBatchEnhanced = async (productId, variantId, batchData, createdBy, options = {}) => {
  try {
    const { bulkMode = false, preferLatest = true } = options;
    
    if (bulkMode) {
      // For bulk uploads, use the bulk grouping logic
      return await createBulkBatchGroup({
        products: [{ productId, variantId, ...batchData }],
        groupIdentifier: options.groupIdentifier
      }, createdBy);
    }
    
    if (preferLatest) {
      // For individual products, try to find latest compatible batch first
      const latestBatch = await findLatestCompatibleBatch(productId, variantId, batchData);
      
      if (latestBatch) {
        // Merge with latest batch
        latestBatch.quantity += batchData.quantity;
        latestBatch.availableQuantity += batchData.quantity;
        await latestBatch.save();
        
        console.log(`[BATCH SERVICE] Merged with latest batch ${latestBatch.batchNumber}`);
        return {
          batch: latestBatch,
          merged: true,
          message: `Added ${batchData.quantity} units to latest batch ${latestBatch.batchNumber}`
        };
      }
    }
    
    // Fallback to original logic
    return await createOrMergeBatch(productId, variantId, batchData, createdBy);
    
  } catch (error) {
    console.error('[BATCH SERVICE] Error in enhanced batch creation:', error);
    throw error;
  }
};

export default {
  createOrMergeBatch,
  allocateBatchesForOrder,
  calculateBatchStock,
  getExpiringBatches,
  updateExpiredBatches,
  deallocateBatchQuantities,
  findLatestCompatibleBatch,
  createBulkBatchGroup,
  createOrMergeBatchEnhanced
};
