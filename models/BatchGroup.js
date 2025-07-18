import mongoose from 'mongoose';

// Product Item Schema - Each product in the batch group
const batchProductSchema = new mongoose.Schema({
  productId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Product', 
    required: true 
  },
  
  // Variant tracking (if product has variants)
  variants: [{
    variantId: { type: String, required: true }, // matches variant.id in Product
    variantName: { type: String, required: true },
    quantity: { type: Number, required: true, min: 0 },
    availableQuantity: { type: Number, required: true, min: 0 },
    allocatedQuantity: { type: Number, default: 0, min: 0 },
    usedQuantity: { type: Number, default: 0, min: 0 },
    
    // Variant-specific dates (if different from batch group)
    manufacturingDate: { type: Date },
    expiryDate: { type: Date },
    bestBeforeDate: { type: Date }
  }],
  
  // For non-variant products
  quantity: { type: Number, min: 0 }, // null if has variants
  availableQuantity: { type: Number, min: 0 }, // null if has variants
  allocatedQuantity: { type: Number, default: 0, min: 0 },
  usedQuantity: { type: Number, default: 0, min: 0 },
  
  // Product-specific dates (if different from batch group)
  manufacturingDate: { type: Date },
  expiryDate: { type: Date },
  bestBeforeDate: { type: Date }
}, { _id: false });

// Main Batch Group Schema
const batchGroupSchema = new mongoose.Schema({
  // Unique batch group identifier
  batchGroupNumber: { 
    type: String, 
    required: true, 
    unique: true,
    index: true
  },
  
  // Group metadata
  groupType: {
    type: String,
    enum: ['BULK_UPLOAD', 'MANUAL_ENTRY', 'SUPPLIER_DELIVERY', 'PRODUCTION_BATCH'],
    default: 'MANUAL_ENTRY'
  },
  
  // All products in this batch group
  products: [batchProductSchema],
  
  // Default dates for the entire batch group
  defaultManufacturingDate: { 
    type: Date, 
    required: true 
  },
  defaultExpiryDate: { 
    type: Date 
  },
  defaultBestBeforeDate: { 
    type: Date 
  },
  
  // Supplier information
  supplierInfo: {
    supplierName: { type: String, required: true },
    contactInfo: { type: String },
    purchaseOrderNumber: { type: String },
    receivedDate: { type: Date, default: Date.now },
    invoiceNumber: { type: String },
    notes: { type: String }
  },
  
  // Storage and quality
  location: { 
    type: String, 
    default: 'Main Warehouse' 
  },
  qualityChecked: { 
    type: Boolean, 
    default: false 
  },
  qualityCheckDate: { 
    type: Date 
  },
  qualityNotes: { 
    type: String 
  },
  
  // Status tracking
  status: {
    type: String,
    enum: ['Active', 'Expired', 'Recalled', 'Depleted'],
    default: 'Active'
  },
  
  // Order allocations (for tracking which orders used this batch)
  orderAllocations: [{
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
    allocatedAt: { type: Date, default: Date.now },
    status: { 
      type: String, 
      enum: ['Allocated', 'Delivered', 'Cancelled'], 
      default: 'Allocated' 
    },
    deliveredAt: { type: Date },
    items: [{
      productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
      variantId: { type: String }, // null for non-variant products
      quantity: { type: Number, required: true }
    }]
  }],
  
  // Audit trail
  createdBy: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Admin',
    required: true 
  },
  lastModifiedBy: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Admin' 
  },
  
  // Timestamps
  createdAt: { 
    type: Date, 
    default: Date.now 
  },
  updatedAt: { 
    type: Date, 
    default: Date.now 
  }
});

// Indexes for efficient queries
batchGroupSchema.index({ batchGroupNumber: 1 });
batchGroupSchema.index({ 'products.productId': 1 });
batchGroupSchema.index({ 'products.variants.variantId': 1 });
batchGroupSchema.index({ defaultManufacturingDate: 1 });
batchGroupSchema.index({ defaultExpiryDate: 1 });
batchGroupSchema.index({ status: 1 });
batchGroupSchema.index({ groupType: 1 });

// Pre-save middleware
batchGroupSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Static method to generate batch group number
batchGroupSchema.statics.generateBatchGroupNumber = function() {
  const today = new Date();
  const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
  const timeStr = Date.now().toString().slice(-6);
  return `BG-${dateStr}-${timeStr}`;
};

// Instance method to get total products count
batchGroupSchema.methods.getTotalProductsCount = function() {
  return this.products.length;
};

// Instance method to get total items count (including variants)
batchGroupSchema.methods.getTotalItemsCount = function() {
  let total = 0;
  this.products.forEach(product => {
    if (product.variants && product.variants.length > 0) {
      total += product.variants.reduce((sum, variant) => sum + variant.quantity, 0);
    } else {
      total += product.quantity || 0;
    }
  });
  return total;
};

// Instance method to get available items count
batchGroupSchema.methods.getAvailableItemsCount = function() {
  let total = 0;
  this.products.forEach(product => {
    if (product.variants && product.variants.length > 0) {
      total += product.variants.reduce((sum, variant) => sum + variant.availableQuantity, 0);
    } else {
      total += product.availableQuantity || 0;
    }
  });
  return total;
};

// Instance method to check if batch group is depleted
batchGroupSchema.methods.isDepleted = function() {
  return this.getAvailableItemsCount() === 0;
};

// Instance method to check if batch group is expired
batchGroupSchema.methods.isExpired = function() {
  if (!this.defaultExpiryDate) return false;
  return new Date() > this.defaultExpiryDate;
};

// Instance method to find product in batch group
batchGroupSchema.methods.findProduct = function(productId, variantId = null) {
  const product = this.products.find(p => p.productId.toString() === productId.toString());
  if (!product) return null;
  
  if (variantId) {
    const variant = product.variants.find(v => v.variantId === variantId);
    return variant ? { product, variant } : null;
  }
  
  return { product };
};

// Instance method to allocate quantity for an order
batchGroupSchema.methods.allocateQuantity = function(productId, variantId, quantity, orderId) {
  const found = this.findProduct(productId, variantId);
  if (!found) return false;
  
  if (found.variant) {
    // Variant product
    if (found.variant.availableQuantity < quantity) return false;
    found.variant.availableQuantity -= quantity;
    found.variant.allocatedQuantity += quantity;
  } else {
    // Non-variant product
    if (found.product.availableQuantity < quantity) return false;
    found.product.availableQuantity -= quantity;
    found.product.allocatedQuantity += quantity;
  }
  
  // Add to order allocations
  this.orderAllocations.push({
    orderId,
    items: [{
      productId,
      variantId,
      quantity
    }]
  });
  
  return true;
};

// Instance method to mark quantity as used (shipped/delivered)
batchGroupSchema.methods.markQuantityAsUsed = function(productId, variantId, quantity) {
  const found = this.findProduct(productId, variantId);
  if (!found) return false;
  
  if (found.variant) {
    // Variant product
    const maxUsable = Math.min(quantity, found.variant.allocatedQuantity);
    found.variant.allocatedQuantity -= maxUsable;
    found.variant.usedQuantity += maxUsable;
  } else {
    // Non-variant product
    const maxUsable = Math.min(quantity, found.product.allocatedQuantity);
    found.product.allocatedQuantity -= maxUsable;
    found.product.usedQuantity += maxUsable;
  }
  
  return true;
};

// Static method to find batches for FEFO allocation
batchGroupSchema.statics.findBatchGroupsForFEFO = async function(productId, variantId = null, requiredQuantity) {
  const query = {
    status: 'Active',
    'products.productId': productId
  };
  
  if (variantId) {
    query['products.variants.variantId'] = variantId;
  }
  
  const batchGroups = await this.find(query)
    .sort({ defaultExpiryDate: 1, defaultManufacturingDate: 1 }) // FEFO order
    .exec();
  
  const allocations = [];
  let remainingQuantity = requiredQuantity;
  
  for (const batchGroup of batchGroups) {
    if (remainingQuantity <= 0) break;
    
    const found = batchGroup.findProduct(productId, variantId);
    if (!found) continue;
    
    const availableQty = found.variant 
      ? found.variant.availableQuantity 
      : found.product.availableQuantity;
    
    if (availableQty > 0) {
      const allocateQty = Math.min(remainingQuantity, availableQty);
      allocations.push({
        batchGroupId: batchGroup._id,
        batchGroupNumber: batchGroup.batchGroupNumber,
        quantity: allocateQty,
        expiryDate: found.variant?.expiryDate || found.product?.expiryDate || batchGroup.defaultExpiryDate
      });
      remainingQuantity -= allocateQty;
    }
  }
  
  return {
    allocations,
    fullyAllocated: remainingQuantity === 0,
    shortfallQuantity: remainingQuantity
  };
};

export default mongoose.model('BatchGroup', batchGroupSchema);
