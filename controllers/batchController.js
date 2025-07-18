import BatchGroup from '../models/BatchGroup.js';
import Product from '../models/Product.js';

/**
 * Get all batch groups with pagination and filtering
 */
export const getAllBatchGroups = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      status,
      groupType,
      location,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    // Build query
    const query = {};
    
    if (status) query.status = status;
    if (groupType) query.groupType = groupType;
    if (location) query.location = new RegExp(location, 'i');
    if (search) {
      query.$or = [
        { batchGroupNumber: new RegExp(search, 'i') },
        { 'supplierInfo.supplierName': new RegExp(search, 'i') }
      ];
    }

    // Sort options
    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    console.log(`[BATCH CONTROLLER] Fetching batch groups - Page: ${page}, Limit: ${limit}`);
    console.log(`[BATCH CONTROLLER] Query:`, query);

    // Get total count
    const total = await BatchGroup.countDocuments(query);

    // Get batch groups with populated product details
    const batchGroups = await BatchGroup.find(query)
      .populate('products.productId', 'name category images price hasVariants')
      .populate('createdBy', 'name email')
      .populate('lastModifiedBy', 'name email')
      .sort(sortOptions)
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    // Calculate summary statistics for each batch group
    const enrichedBatchGroups = batchGroups.map(batchGroup => {
      const totalProducts = batchGroup.products.length;
      let totalItems = 0;
      let availableItems = 0;
      let allocatedItems = 0;
      let usedItems = 0;

      batchGroup.products.forEach(product => {
        if (product.variants && product.variants.length > 0) {
          // Variant products
          product.variants.forEach(variant => {
            totalItems += variant.quantity;
            availableItems += variant.availableQuantity;
            allocatedItems += variant.allocatedQuantity;
            usedItems += variant.usedQuantity;
          });
        } else {
          // Non-variant products
          totalItems += product.quantity || 0;
          availableItems += product.availableQuantity || 0;
          allocatedItems += product.allocatedQuantity || 0;
          usedItems += product.usedQuantity || 0;
        }
      });

      return {
        ...batchGroup,
        id: batchGroup._id,
        statistics: {
          totalProducts,
          totalItems,
          availableItems,
          allocatedItems,
          usedItems,
          utilizationRate: totalItems > 0 ? ((usedItems / totalItems) * 100).toFixed(2) : 0,
          isExpired: batchGroup.defaultExpiryDate ? new Date() > new Date(batchGroup.defaultExpiryDate) : false,
          isDepleted: availableItems === 0
        }
      };
    });

    console.log(`[BATCH CONTROLLER] Found ${total} batch groups, returning ${enrichedBatchGroups.length}`);

    res.json({
      success: true,
      data: {
        batchGroups: enrichedBatchGroups,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        }
      }
    });
  } catch (error) {
    console.error('[BATCH CONTROLLER] Error fetching batch groups:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch batch groups',
      error: error.message
    });
  }
};

/**
 * Get a specific batch group by ID with full product details
 */
export const getBatchGroupById = async (req, res) => {
  try {
    const { id } = req.params;

    console.log(`[BATCH CONTROLLER] Fetching batch group: ${id}`);

    const batchGroup = await BatchGroup.findById(id)
      .populate('products.productId', 'name description category images price hasVariants variants stock')
      .populate('createdBy', 'name email')
      .populate('lastModifiedBy', 'name email')
      .populate('orderAllocations.orderId', 'placedAt status totalAmount')
      .lean();

    if (!batchGroup) {
      return res.status(404).json({
        success: false,
        message: 'Batch group not found'
      });
    }

    // Enrich product data with current stock information
    const enrichedProducts = await Promise.all(
      batchGroup.products.map(async (batchProduct) => {
        const currentProduct = await Product.findById(batchProduct.productId).lean();
        
        if (!currentProduct) {
          return {
            ...batchProduct,
            currentStock: 0,
            isProductDeleted: true
          };
        }

        let currentStock = 0;
        const variantDetails = [];

        if (batchProduct.variants && batchProduct.variants.length > 0) {
          // Variant products
          batchProduct.variants.forEach(batchVariant => {
            const currentVariant = currentProduct.variants?.find(v => v.id === batchVariant.variantId);
            if (currentVariant) {
              variantDetails.push({
                ...batchVariant,
                currentVariantStock: currentVariant.stock,
                currentVariantPrice: currentVariant.price,
                variantDetails: currentVariant
              });
              currentStock += currentVariant.stock;
            }
          });
        } else {
          // Non-variant products
          currentStock = currentProduct.stock;
        }

        return {
          ...batchProduct,
          currentStock,
          isProductDeleted: false,
          variantDetails: variantDetails.length > 0 ? variantDetails : undefined,
          productDetails: currentProduct
        };
      })
    );

    // Calculate comprehensive statistics
    let totalItems = 0;
    let availableItems = 0;
    let allocatedItems = 0;
    let usedItems = 0;
    let currentTotalStock = 0;

    enrichedProducts.forEach(product => {
      if (product.variantDetails && product.variantDetails.length > 0) {
        product.variantDetails.forEach(variant => {
          totalItems += variant.quantity;
          availableItems += variant.availableQuantity;
          allocatedItems += variant.allocatedQuantity;
          usedItems += variant.usedQuantity;
          currentTotalStock += variant.currentVariantStock || 0;
        });
      } else {
        totalItems += product.quantity || 0;
        availableItems += product.availableQuantity || 0;
        allocatedItems += product.allocatedQuantity || 0;
        usedItems += product.usedQuantity || 0;
        currentTotalStock += product.currentStock || 0;
      }
    });

    const enrichedBatchGroup = {
      ...batchGroup,
      id: batchGroup._id,
      products: enrichedProducts,
      statistics: {
        totalProducts: batchGroup.products.length,
        totalItems,
        availableItems,
        allocatedItems,
        usedItems,
        currentTotalStock,
        utilizationRate: totalItems > 0 ? ((usedItems / totalItems) * 100).toFixed(2) : 0,
        allocationRate: totalItems > 0 ? ((allocatedItems / totalItems) * 100).toFixed(2) : 0,
        availabilityRate: totalItems > 0 ? ((availableItems / totalItems) * 100).toFixed(2) : 0,
        isExpired: batchGroup.defaultExpiryDate ? new Date() > new Date(batchGroup.defaultExpiryDate) : false,
        isDepleted: availableItems === 0,
        orderAllocationsCount: batchGroup.orderAllocations?.length || 0
      }
    };

    console.log(`[BATCH CONTROLLER] Batch group ${id} fetched with ${enrichedProducts.length} products`);

    res.json({
      success: true,
      data: enrichedBatchGroup
    });
  } catch (error) {
    console.error('[BATCH CONTROLLER] Error fetching batch group:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch batch group',
      error: error.message
    });
  }
};

/**
 * Get batch analytics - summary statistics across all batches
 */
export const getBatchAnalytics = async (req, res) => {
  try {
    console.log('[BATCH CONTROLLER] Generating batch analytics');

    // Get all batch groups for analytics
    const allBatchGroups = await BatchGroup.find({}).lean();

    // Calculate overall statistics
    let totalBatchGroups = allBatchGroups.length;
    let activeBatchGroups = 0;
    let expiredBatchGroups = 0;
    let depletedBatchGroups = 0;
    let totalProducts = 0;
    let totalItems = 0;
    let availableItems = 0;
    let allocatedItems = 0;
    let usedItems = 0;

    // Group by status
    const statusBreakdown = {};
    const groupTypeBreakdown = {};
    const locationBreakdown = {};
    const supplierBreakdown = {};

    allBatchGroups.forEach(batchGroup => {
      // Status breakdown
      statusBreakdown[batchGroup.status] = (statusBreakdown[batchGroup.status] || 0) + 1;
      
      // Group type breakdown
      groupTypeBreakdown[batchGroup.groupType] = (groupTypeBreakdown[batchGroup.groupType] || 0) + 1;
      
      // Location breakdown
      locationBreakdown[batchGroup.location] = (locationBreakdown[batchGroup.location] || 0) + 1;
      
      // Supplier breakdown
      const supplierName = batchGroup.supplierInfo?.supplierName || 'Unknown';
      supplierBreakdown[supplierName] = (supplierBreakdown[supplierName] || 0) + 1;

      // Status calculations
      if (batchGroup.status === 'Active') activeBatchGroups++;
      if (batchGroup.defaultExpiryDate && new Date() > new Date(batchGroup.defaultExpiryDate)) expiredBatchGroups++;

      totalProducts += batchGroup.products?.length || 0;

      // Calculate items for this batch group
      let batchAvailable = 0;
      let batchTotal = 0;
      let batchAllocated = 0;
      let batchUsed = 0;

      batchGroup.products?.forEach(product => {
        if (product.variants && product.variants.length > 0) {
          product.variants.forEach(variant => {
            batchTotal += variant.quantity;
            batchAvailable += variant.availableQuantity;
            batchAllocated += variant.allocatedQuantity;
            batchUsed += variant.usedQuantity;
          });
        } else {
          batchTotal += product.quantity || 0;
          batchAvailable += product.availableQuantity || 0;
          batchAllocated += product.allocatedQuantity || 0;
          batchUsed += product.usedQuantity || 0;
        }
      });

      totalItems += batchTotal;
      availableItems += batchAvailable;
      allocatedItems += batchAllocated;
      usedItems += batchUsed;

      if (batchAvailable === 0) depletedBatchGroups++;
    });

    // Calculate expiring soon (next 30 days)
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
    
    const expiringSoon = allBatchGroups.filter(bg => 
      bg.defaultExpiryDate && 
      new Date(bg.defaultExpiryDate) <= thirtyDaysFromNow && 
      new Date(bg.defaultExpiryDate) > new Date()
    ).length;

    // Get recent batch groups (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const recentBatchGroups = allBatchGroups.filter(bg => 
      new Date(bg.createdAt) >= sevenDaysAgo
    ).length;

    const analytics = {
      overview: {
        totalBatchGroups,
        activeBatchGroups,
        expiredBatchGroups,
        depletedBatchGroups,
        expiringSoon,
        recentBatchGroups,
        totalProducts,
        totalItems,
        availableItems,
        allocatedItems,
        usedItems,
        utilizationRate: totalItems > 0 ? ((usedItems / totalItems) * 100).toFixed(2) : 0,
        allocationRate: totalItems > 0 ? ((allocatedItems / totalItems) * 100).toFixed(2) : 0,
        availabilityRate: totalItems > 0 ? ((availableItems / totalItems) * 100).toFixed(2) : 0
      },
      breakdowns: {
        status: statusBreakdown,
        groupType: groupTypeBreakdown,
        location: locationBreakdown,
        supplier: supplierBreakdown
      }
    };

    console.log(`[BATCH CONTROLLER] Analytics generated for ${totalBatchGroups} batch groups`);

    res.json({
      success: true,
      data: analytics
    });
  } catch (error) {
    console.error('[BATCH CONTROLLER] Error generating analytics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate batch analytics',
      error: error.message
    });
  }
};

/**
 * Update batch group status or details
 */
export const updateBatchGroup = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    console.log(`[BATCH CONTROLLER] Updating batch group: ${id}`);

    const batchGroup = await BatchGroup.findById(id);
    if (!batchGroup) {
      return res.status(404).json({
        success: false,
        message: 'Batch group not found'
      });
    }

    // Update allowed fields
    const allowedUpdates = [
      'status', 'location', 'qualityChecked', 'qualityCheckDate', 
      'qualityNotes', 'supplierInfo'
    ];

    allowedUpdates.forEach(field => {
      if (updates[field] !== undefined) {
        if (field === 'supplierInfo' && typeof updates[field] === 'object') {
          batchGroup.supplierInfo = { ...batchGroup.supplierInfo, ...updates[field] };
        } else {
          batchGroup[field] = updates[field];
        }
      }
    });

    // Set last modified by (assuming admin auth)
    if (req.user && req.user.adminId) {
      batchGroup.lastModifiedBy = req.user.adminId;
    }

    await batchGroup.save();

    console.log(`[BATCH CONTROLLER] Batch group ${id} updated successfully`);

    res.json({
      success: true,
      message: 'Batch group updated successfully',
      data: batchGroup
    });
  } catch (error) {
    console.error('[BATCH CONTROLLER] Error updating batch group:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update batch group',
      error: error.message
    });
  }
};

/**
 * Get batch utilization for specific products
 */
export const getBatchUtilizationByProduct = async (req, res) => {
  try {
    const { productId } = req.params;

    console.log(`[BATCH CONTROLLER] Getting batch utilization for product: ${productId}`);

    const batchGroups = await BatchGroup.find({
      'products.productId': productId,
      status: 'Active'
    }).populate('products.productId', 'name images');

    const utilization = batchGroups.map(batchGroup => {
      const product = batchGroup.products.find(p => p.productId._id.toString() === productId);
      
      if (!product) return null;

      let totalQty = 0;
      let availableQty = 0;
      let usedQty = 0;

      if (product.variants && product.variants.length > 0) {
        product.variants.forEach(variant => {
          totalQty += variant.quantity;
          availableQty += variant.availableQuantity;
          usedQty += variant.usedQuantity;
        });
      } else {
        totalQty = product.quantity || 0;
        availableQty = product.availableQuantity || 0;
        usedQty = product.usedQuantity || 0;
      }

      return {
        batchGroupId: batchGroup._id,
        batchGroupNumber: batchGroup.batchGroupNumber,
        totalQuantity: totalQty,
        availableQuantity: availableQty,
        usedQuantity: usedQty,
        utilizationRate: totalQty > 0 ? ((usedQty / totalQty) * 100).toFixed(2) : 0,
        expiryDate: batchGroup.defaultExpiryDate,
        location: batchGroup.location
      };
    }).filter(Boolean);

    res.json({
      success: true,
      data: {
        productId,
        batches: utilization
      }
    });
  } catch (error) {
    console.error('[BATCH CONTROLLER] Error getting batch utilization:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get batch utilization',
      error: error.message
    });
  }
};

// Legacy API compatibility - keeping some old function names as aliases
export const getAllBatches = getAllBatchGroups;
export const getBatchById = getBatchGroupById;
