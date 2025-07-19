import BatchGroup from '../models/BatchGroup.js';
import mongoose from 'mongoose';

/**
 * Create a single batch group for bulk upload
 * Groups all products from bulk upload into one batch group
 */
export const createBulkBatchGroup = async ({ products, batchConfig, groupIdentifier }, userId) => {
  try {
    console.log(`[BATCH SERVICE] Creating bulk batch group for ${products.length} products`);
    
    // Generate unique batch group number
    const batchGroupNumber = groupIdentifier || BatchGroup.generateBatchGroupNumber();
    
    // Determine default dates
    let defaultManufacturingDate, defaultExpiryDate, defaultBestBeforeDate;
    
    if (batchConfig?.sameDatesForAll) {
      defaultManufacturingDate = new Date(batchConfig.globalDates.manufacturing);
      defaultExpiryDate = batchConfig.globalDates.expiry ? new Date(batchConfig.globalDates.expiry) : null;
      defaultBestBeforeDate = batchConfig.globalDates.bestBefore ? new Date(batchConfig.globalDates.bestBefore) : null;
    } else {
      // Use current date as fallback
      defaultManufacturingDate = new Date();
      defaultExpiryDate = null;
      defaultBestBeforeDate = null;
    }
    
    // Determine supplier info
    let supplierInfo;
    if (batchConfig && !batchConfig.differentSuppliers && batchConfig.globalSupplier?.name) {
      supplierInfo = {
        supplierName: batchConfig.globalSupplier.name,
        contactInfo: batchConfig.globalSupplier.contactInfo || 'info@indiraafoods.com',
        receivedDate: new Date(),
        notes: `Bulk upload batch group created on ${new Date().toLocaleDateString()}`
      };
    } else {
      supplierInfo = {
        supplierName: 'Indiraa Foods Pvt Ltd',
        contactInfo: 'info@indiraafoods.com',
        receivedDate: new Date(),
        notes: `Bulk upload batch group created on ${new Date().toLocaleDateString()}`
      };
    }
    
    // Process products for batch group
    const batchProducts = [];
    
    for (const product of products) {
      const batchProduct = {
        productId: product.productId,
        variants: [],
        quantity: null,
        availableQuantity: null,
        allocatedQuantity: 0,
        usedQuantity: 0
      };
      
      // Use product-specific dates if available, otherwise use defaults
      if (product.manufacturingDate && !batchConfig?.sameDatesForAll) {
        batchProduct.manufacturingDate = new Date(product.manufacturingDate);
      }
      if (product.expiryDate && !batchConfig?.sameDatesForAll) {
        batchProduct.expiryDate = new Date(product.expiryDate);
      }
      if (product.bestBeforeDate && !batchConfig?.sameDatesForAll) {
        batchProduct.bestBeforeDate = new Date(product.bestBeforeDate);
      }
      
      if (product.hasVariants && product.variants && product.variants.length > 0) {
        // Process variants
        for (const variant of product.variants) {
          const batchVariant = {
            variantId: variant.id,
            variantName: variant.name,
            quantity: variant.stock,
            availableQuantity: variant.stock,
            allocatedQuantity: 0,
            usedQuantity: 0
          };
          
          // Check for variant-specific dates
          const variantManufacturingKey = `manufacturingDate_${variant.name}`;
          const variantExpiryKey = `expiryDate_${variant.name}`;
          const variantBestBeforeKey = `bestBeforeDate_${variant.name}`;
          
          if (product[variantManufacturingKey]) {
            batchVariant.manufacturingDate = new Date(product[variantManufacturingKey]);
          }
          if (product[variantExpiryKey]) {
            batchVariant.expiryDate = new Date(product[variantExpiryKey]);
          }
          if (product[variantBestBeforeKey]) {
            batchVariant.bestBeforeDate = new Date(product[variantBestBeforeKey]);
          }
          
          batchProduct.variants.push(batchVariant);
        }
      } else {
        // Non-variant product
        batchProduct.quantity = product.stock;
        batchProduct.availableQuantity = product.stock;
      }
      
      batchProducts.push(batchProduct);
    }
    
    // Create the batch group
    const batchGroup = new BatchGroup({
      batchGroupNumber,
      groupType: 'BULK_UPLOAD',
      products: batchProducts,
      defaultManufacturingDate,
      defaultExpiryDate,
      defaultBestBeforeDate,
      supplierInfo,
      location: 'Main Warehouse',
      status: 'Active',
      createdBy: userId
    });
    
    await batchGroup.save();
    
    console.log(`[BATCH SERVICE] Created batch group ${batchGroupNumber} with ${batchProducts.length} products`);
    
    return {
      success: true,
      batchGroup,
      totalProducts: batchProducts.length,
      totalItems: batchGroup.getTotalItemsCount(),
      batchGroupNumber
    };
    
  } catch (error) {
    console.error('[BATCH SERVICE] Error creating bulk batch group:', error);
    throw error;
  }
};

/**
 * Add individual product to the latest compatible batch group
 * If no compatible batch found, create a new one
 */
export const addProductToBatch = async (productData, userId) => {
  try {
    console.log(`[BATCH SERVICE] Adding product ${productData.productId} to batch`);
    
    // Try to find the latest compatible batch group
    const compatibleBatch = await findLatestCompatibleBatch(productData);
    
    if (compatibleBatch) {
      console.log(`[BATCH SERVICE] Found compatible batch group ${compatibleBatch.batchGroupNumber}`);
      
      // Add product to existing batch group
      const existingProduct = compatibleBatch.products.find(p => 
        p.productId.toString() === productData.productId.toString()
      );
      
      if (existingProduct) {
        // Product already exists in batch, update quantities
        if (productData.hasVariants && productData.variants) {
          for (const variant of productData.variants) {
            const existingVariant = existingProduct.variants.find(v => v.variantId === variant.id);
            if (existingVariant) {
              existingVariant.quantity += variant.stock;
              existingVariant.availableQuantity += variant.stock;
            } else {
              existingProduct.variants.push({
                variantId: variant.id,
                variantName: variant.name,
                quantity: variant.stock,
                availableQuantity: variant.stock,
                allocatedQuantity: 0,
                usedQuantity: 0
              });
            }
          }
        } else {
          existingProduct.quantity += productData.stock;
          existingProduct.availableQuantity += productData.stock;
        }
      } else {
        // Add new product to batch group
        const newBatchProduct = createBatchProductObject(productData);
        compatibleBatch.products.push(newBatchProduct);
      }
      
      compatibleBatch.lastModifiedBy = userId;
      await compatibleBatch.save();
      
      return {
        success: true,
        batchGroup: compatibleBatch,
        action: 'ADDED_TO_EXISTING'
      };
    } else {
      // No compatible batch found, create new one
      console.log(`[BATCH SERVICE] No compatible batch found, creating new batch group`);
      
      const newBatchGroup = await createSingleProductBatch(productData, userId);
      
      return {
        success: true,
        batchGroup: newBatchGroup,
        action: 'CREATED_NEW'
      };
    }
    
  } catch (error) {
    console.error('[BATCH SERVICE] Error adding product to batch:', error);
    throw error;
  }
};

/**
 * Find latest compatible batch group for a product
 */
export const findLatestCompatibleBatch = async (productData) => {
  try {
    // Look for active batch groups that:
    // 1. Have the same supplier
    // 2. Have similar dates (within 7 days)
    // 3. Are not expired
    // 4. Were created recently (within 30 days)
    
    const supplierName = productData.supplierInfo?.supplierName || 'Indiraa Foods Pvt Ltd';
    const productManufacturingDate = productData.manufacturingDate ? new Date(productData.manufacturingDate) : new Date();
    
    const compatibleBatches = await BatchGroup.find({
      status: 'Active',
      'supplierInfo.supplierName': supplierName,
      defaultManufacturingDate: {
        $gte: new Date(productManufacturingDate.getTime() - 7 * 24 * 60 * 60 * 1000), // Within 7 days before
        $lte: new Date(productManufacturingDate.getTime() + 7 * 24 * 60 * 60 * 1000)  // Within 7 days after
      },
      createdAt: {
        $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // Created within last 30 days
      }
    })
    .sort({ createdAt: -1 }) // Latest first
    .limit(1);
    
    return compatibleBatches.length > 0 ? compatibleBatches[0] : null;
    
  } catch (error) {
    console.error('[BATCH SERVICE] Error finding compatible batch:', error);
    return null;
  }
};

/**
 * Create a new batch group for a single product
 */
export const createSingleProductBatch = async (productData, userId) => {
  try {
    const batchGroupNumber = BatchGroup.generateBatchGroupNumber();
    
    const batchProduct = createBatchProductObject(productData);
    
    const batchGroup = new BatchGroup({
      batchGroupNumber,
      groupType: 'MANUAL_ENTRY',
      products: [batchProduct],
      defaultManufacturingDate: productData.manufacturingDate ? new Date(productData.manufacturingDate) : new Date(),
      defaultExpiryDate: productData.expiryDate ? new Date(productData.expiryDate) : null,
      defaultBestBeforeDate: productData.bestBeforeDate ? new Date(productData.bestBeforeDate) : null,
      supplierInfo: productData.supplierInfo || {
        supplierName: 'Indiraa Foods Pvt Ltd',
        contactInfo: 'info@indiraafoods.com',
        receivedDate: new Date()
      },
      location: productData.location || 'Main Warehouse',
      status: 'Active',
      createdBy: userId
    });
    
    await batchGroup.save();
    
    console.log(`[BATCH SERVICE] Created new batch group ${batchGroupNumber} for single product`);
    
    return batchGroup;
    
  } catch (error) {
    console.error('[BATCH SERVICE] Error creating single product batch:', error);
    throw error;
  }
};

/**
 * Helper function to create batch product object
 */
const createBatchProductObject = (productData) => {
  const batchProduct = {
    productId: productData.productId,
    variants: [],
    quantity: null,
    availableQuantity: null,
    allocatedQuantity: 0,
    usedQuantity: 0
  };
  
  if (productData.hasVariants && productData.variants && productData.variants.length > 0) {
    // Process variants
    for (const variant of productData.variants) {
      batchProduct.variants.push({
        variantId: variant.id,
        variantName: variant.name,
        quantity: variant.stock,
        availableQuantity: variant.stock,
        allocatedQuantity: 0,
        usedQuantity: 0
      });
    }
  } else {
    // Non-variant product
    batchProduct.quantity = productData.stock;
    batchProduct.availableQuantity = productData.stock;
  }
  
  return batchProduct;
};

/**
 * Allocate products using FEFO (First Expired, First Out)
 */
export const allocateBatchesForOrder = async (orderItems, orderId) => {
  try {
    console.log(`[BATCH SERVICE] Allocating batches for order ${orderId}`);
    
    const allocations = [];
    const shortfalls = [];
    
    for (const item of orderItems) {
      const result = await BatchGroup.findBatchGroupsForFEFO(
        item.productId,
        item.variantId,
        item.quantity
      );
      
      if (result.fullyAllocated) {
        // Allocate the quantities
        for (const allocation of result.allocations) {
          const batchGroup = await BatchGroup.findById(allocation.batchGroupId);
          if (batchGroup) {
            const success = batchGroup.allocateQuantity(
              item.productId,
              item.variantId,
              allocation.quantity,
              orderId
            );
            
            if (success) {
              await batchGroup.save();
              allocations.push({
                ...allocation,
                productId: item.productId,
                variantId: item.variantId
              });
            }
          }
        }
      } else {
        shortfalls.push({
          productId: item.productId,
          variantId: item.variantId,
          requestedQuantity: item.quantity,
          shortfallQuantity: result.shortfallQuantity
        });
      }
    }
    
    return {
      success: shortfalls.length === 0,
      allocations,
      shortfalls
    };
    
  } catch (error) {
    console.error('[BATCH SERVICE] Error allocating batches for order:', error);
    throw error;
  }
};

/**
 * Mark allocated quantities as used when order is delivered
 */
export const markBatchesAsUsed = async (orderId) => {
  try {
    console.log(`[BATCH SERVICE] Marking batches as used for order ${orderId}`);
    
    const batchGroups = await BatchGroup.find({
      'orderAllocations.orderId': orderId
    });
    
    for (const batchGroup of batchGroups) {
      const orderAllocation = batchGroup.orderAllocations.find(
        allocation => allocation.orderId.toString() === orderId.toString()
      );
      
      if (orderAllocation) {
        for (const item of orderAllocation.items) {
          batchGroup.markQuantityAsUsed(
            item.productId,
            item.variantId,
            item.quantity
          );
        }
        
        await batchGroup.save();
      }
    }
    
    console.log(`[BATCH SERVICE] Successfully marked batches as used for order ${orderId}`);
    
  } catch (error) {
    console.error('[BATCH SERVICE] Error marking batches as used:', error);
    throw error;
  }
};

/**
 * Get batch groups with filters
 */
export const getBatchGroups = async (filters = {}) => {
  try {
    const query = {};
    
    if (filters.status) {
      query.status = filters.status;
    }
    
    if (filters.groupType) {
      query.groupType = filters.groupType;
    }
    
    if (filters.productId) {
      query['products.productId'] = filters.productId;
    }
    
    if (filters.supplierName) {
      query['supplierInfo.supplierName'] = new RegExp(filters.supplierName, 'i');
    }
    
    const batchGroups = await BatchGroup.find(query)
      .populate('products.productId', 'name category images')
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 });
    
    return batchGroups;
    
  } catch (error) {
    console.error('[BATCH SERVICE] Error getting batch groups:', error);
    throw error;
  }
};

// Move allocated items to used items when order is delivered
export const moveAllocatedToUsed = async (orderId) => {
  try {
    console.log(`[BATCH GROUP] ===== MOVING ALLOCATED TO USED FOR ORDER ${orderId} =====`);
    
    // Convert orderId to ObjectId if it's a string
    const orderObjectId = typeof orderId === 'string' ? new mongoose.Types.ObjectId(orderId) : orderId;
    console.log(`[BATCH GROUP] Using order ObjectId: ${orderObjectId}`);
    
    // Find all batch groups that have allocations for this order
    const batchGroups = await BatchGroup.find({
      'orderAllocations.orderId': orderObjectId
    });
    
    console.log(`[BATCH GROUP] Found ${batchGroups.length} batch groups with allocations for order ${orderId}`);
    
    if (batchGroups.length === 0) {
      console.log(`[BATCH GROUP] No batch groups found with allocations for order ${orderId}`);
      return {
        success: true,
        updatedBatchGroups: [],
        errors: [],
        message: 'No batch groups found for this order'
      };
    }
    
    const updatedBatchGroups = [];
    const errors = [];
    const comboItemsProcessed = new Set(); // Track combo items to avoid double processing
    
    for (const batchGroup of batchGroups) {
      try {
        console.log(`[BATCH GROUP] Processing batch group ${batchGroup._id}`);
        
        // Find all allocations for this order (regardless of current status)
        const orderAllocations = batchGroup.orderAllocations.filter(
          allocation => allocation.orderId.toString() === orderObjectId.toString()
        );
        
        console.log(`[BATCH GROUP] Found ${orderAllocations.length} allocations in batch group ${batchGroup._id}`);
        
        let hasUpdates = false;
        
        // Process all allocations for this order
        for (const allocation of orderAllocations) {
          console.log(`[BATCH GROUP] Processing allocation:`, {
            orderId: allocation.orderId,
            currentStatus: allocation.status,
            itemsCount: allocation.items?.length || 0
          });
          
          // Skip if already marked as delivered
          if (allocation.status === 'Delivered') {
            console.log(`[BATCH GROUP] Allocation already marked as delivered, skipping`);
            continue;
          }
          
          // Mark allocation as delivered (since the entire order is delivered)
          allocation.status = 'Delivered';
          allocation.deliveredAt = new Date();
          hasUpdates = true;
          
          console.log(`[BATCH GROUP] Updated allocation status to Delivered`);
          
          // Process all items in this allocation
          const itemsToProcess = allocation.items || [];
          
          for (const item of itemsToProcess) {
            console.log(`[BATCH GROUP] Processing item:`, {
              productId: item.productId,
              variantId: item.variantId,
              quantity: item.quantity,
              type: item.type || 'regular', // Track if it's a combo-item
              parentComboId: item.parentComboId || null
            });
            
            // Track combo pack items for analytics
            if (item.type === 'combo-item' && item.parentComboId) {
              comboItemsProcessed.add(item.parentComboId);
              console.log(`[BATCH GROUP] Processing combo pack item from combo: ${item.parentComboId}`);
            }
            
            // Find the product in the batch group
            const batchProduct = batchGroup.products.find(p => {
              return p.productId.toString() === item.productId.toString();
            });
            
            if (batchProduct) {
              console.log(`[BATCH GROUP] Found batch product:`, {
                productId: batchProduct.productId,
                hasVariants: batchProduct.variants && batchProduct.variants.length > 0,
                itemVariantId: item.variantId
              });
              
              // Check if this is a variant product
              if (item.variantId && batchProduct.variants && batchProduct.variants.length > 0) {
                // Handle variant products
                const variant = batchProduct.variants.find(v => v.variantId === item.variantId);
                
                if (variant) {
                  console.log(`[BATCH GROUP] Found variant, current quantities:`, {
                    variantId: variant.variantId,
                    quantity: variant.quantity,
                    availableQuantity: variant.availableQuantity,
                    allocatedQuantity: variant.allocatedQuantity,
                    usedQuantity: variant.usedQuantity,
                    quantityToMove: item.quantity
                  });
                  
                  // Move quantity from allocated to used for variant
                  const quantityToMove = item.quantity;
                  variant.allocatedQuantity = Math.max(0, variant.allocatedQuantity - quantityToMove);
                  variant.usedQuantity = (variant.usedQuantity || 0) + quantityToMove;
                  
                  console.log(`[BATCH GROUP] Updated variant quantities:`, {
                    newAllocated: variant.allocatedQuantity,
                    newUsed: variant.usedQuantity,
                    newAvailable: variant.availableQuantity
                  });
                  
                  hasUpdates = true;
                } else {
                  console.error(`[BATCH GROUP] Variant not found in batch product:`, {
                    productId: item.productId,
                    variantId: item.variantId,
                    batchGroupId: batchGroup._id,
                    availableVariants: batchProduct.variants.map(v => v.variantId)
                  });
                  
                  errors.push(`Variant ${item.variantId} not found in batch group ${batchGroup._id} for product ${item.productId}`);
                }
              } else {
                // Handle non-variant products
                console.log(`[BATCH GROUP] Found non-variant product, current quantities:`, {
                  productId: batchProduct.productId,
                  quantity: batchProduct.quantity,
                  availableQuantity: batchProduct.availableQuantity,
                  allocatedQuantity: batchProduct.allocatedQuantity,
                  usedQuantity: batchProduct.usedQuantity,
                  quantityToMove: item.quantity
                });
                
                // Move quantity from allocated to used for main product
                const quantityToMove = item.quantity;
                batchProduct.allocatedQuantity = Math.max(0, batchProduct.allocatedQuantity - quantityToMove);
                batchProduct.usedQuantity = (batchProduct.usedQuantity || 0) + quantityToMove;
                
                console.log(`[BATCH GROUP] Updated product quantities:`, {
                  newAllocated: batchProduct.allocatedQuantity,
                  newUsed: batchProduct.usedQuantity,
                  newAvailable: batchProduct.availableQuantity
                });
                
                hasUpdates = true;
              }
            } else {
              console.error(`[BATCH GROUP] Product not found in batch group:`, {
                productId: item.productId,
                variantId: item.variantId,
                batchGroupId: batchGroup._id
              });
              
              errors.push(`Product ${item.productId} (variant: ${item.variantId}) not found in batch group ${batchGroup._id}`);
            }
          }
        }
        
        if (hasUpdates) {
          // Save the updated batch group
          await batchGroup.save();
          updatedBatchGroups.push(batchGroup._id);
          
          console.log(`[BATCH GROUP] Successfully updated batch group ${batchGroup._id}`);
        } else {
          console.log(`[BATCH GROUP] No updates needed for batch group ${batchGroup._id} (already processed)`);
        }
        
      } catch (error) {
        console.error(`[BATCH GROUP] Error updating batch group ${batchGroup._id}:`, error);
        errors.push(`Error updating batch group ${batchGroup._id}: ${error.message}`);
      }
    }
    
    console.log(`[BATCH GROUP] ===== COMPLETED MOVING ALLOCATED TO USED =====`);
    console.log(`[BATCH GROUP] Updated ${updatedBatchGroups.length} batch groups for order ${orderId}`);
    
    // Report combo pack processing
    if (comboItemsProcessed.size > 0) {
      console.log(`[BATCH GROUP] Processed items from ${comboItemsProcessed.size} combo pack(s):`, Array.from(comboItemsProcessed));
    }
    
    return {
      success: errors.length === 0,
      updatedBatchGroups,
      errors,
      comboPacksProcessed: Array.from(comboItemsProcessed), // Add combo pack info to response
      message: `Successfully updated ${updatedBatchGroups.length} batch groups. Order ${orderId} marked as delivered.`
    };
    
  } catch (error) {
    console.error('[BATCH GROUP] Error in moveAllocatedToUsed:', error);
    return {
      success: false,
      errors: [error.message],
      updatedBatchGroups: [],
      message: 'Failed to move allocated items to used'
    };
  }
};

export default {
  createBulkBatchGroup,
  addProductToBatch,
  findLatestCompatibleBatch,
  createSingleProductBatch,
  allocateBatchesForOrder,
  markBatchesAsUsed,
  getBatchGroups,
  moveAllocatedToUsed
};
