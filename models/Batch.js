import mongoose from 'mongoose';

const batchSchema = new mongoose.Schema({
  batchNumber: { 
    type: String, 
    required: true, 
    unique: true,
    index: true
  },
  productId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Product', 
    required: true,
    index: true
  },
  variantId: { 
    type: String, 
    default: null,
    index: true
  }, // null for non-variant products, variant.id for variant products
  
  // Quantity tracking
  quantity: { 
    type: Number, 
    required: true, 
    min: 0 
  }, // Initial batch quantity
  availableQuantity: { 
    type: Number, 
    required: true, 
    min: 0 
  }, // Current available quantity
  allocatedQuantity: { 
    type: Number, 
    default: 0, 
    min: 0 
  }, // Reserved for orders
  usedQuantity: { 
    type: Number, 
    default: 0, 
    min: 0 
  }, // Actually shipped/delivered
  
  // FEFO Date tracking
  manufacturingDate: { 
    type: Date, 
    required: true 
  },
  expiryDate: { 
    type: Date, 
    default: null 
  },
  bestBeforeDate: { 
    type: Date, 
    default: null 
  },
  
  // Status and quality control
  status: { 
    type: String, 
    enum: ['Active', 'Allocated', 'Expired', 'Recalled', 'Depleted'], 
    default: 'Active',
    index: true
  },
  qualityChecked: { 
    type: Boolean, 
    default: false 
  },
  qualityCheckDate: { 
    type: Date, 
    default: null 
  },
  qualityNotes: { 
    type: String, 
    default: '' 
  },
  
  // Supplier and location info
  supplierInfo: {
    supplierName: { 
      type: String, 
      default: 'Default Supplier' 
    },
    purchaseOrderNumber: { 
      type: String, 
      default: '' 
    },
    receivedDate: { 
      type: Date, 
      default: Date.now 
    },
    contactInfo: { 
      type: String, 
      default: '' 
    }
  },
  location: { 
    type: String, 
    default: 'Main Warehouse' 
  },
  
  // Tracking and audit
  createdBy: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Admin', 
    required: true 
  },
  
  // Order allocation tracking
  orderAllocations: [{
    orderId: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'Order' 
    },
    quantityAllocated: { 
      type: Number, 
      min: 0 
    },
    allocationDate: { 
      type: Date, 
      default: Date.now 
    },
    status: { 
      type: String, 
      enum: ['Allocated', 'Shipped', 'Delivered', 'Cancelled'], 
      default: 'Allocated' 
    }
  }]
}, { 
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for efficient queries
batchSchema.index({ productId: 1, variantId: 1, status: 1 });
batchSchema.index({ expiryDate: 1, status: 1 }); // For FEFO queries
batchSchema.index({ manufacturingDate: 1 });
batchSchema.index({ 'supplierInfo.supplierName': 1 });

// Virtual for remaining shelf life
batchSchema.virtual('remainingShelfLifeDays').get(function() {
  if (!this.expiryDate) return null;
  const now = new Date();
  const expiry = new Date(this.expiryDate);
  return Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));
});

// Virtual for expiry status
batchSchema.virtual('expiryStatus').get(function() {
  if (!this.expiryDate) return 'No Expiry';
  const remainingDays = this.remainingShelfLifeDays;
  if (remainingDays < 0) return 'Expired';
  if (remainingDays <= 7) return 'Expiring Soon';
  if (remainingDays <= 30) return 'Expiring';
  return 'Fresh';
});

// Pre-save middleware to validate quantities
batchSchema.pre('save', function(next) {
  // Ensure quantity consistency
  if (this.availableQuantity + this.allocatedQuantity + this.usedQuantity > this.quantity) {
    return next(new Error('Total quantities cannot exceed initial batch quantity'));
  }
  
  // Auto-update status based on quantity
  if (this.availableQuantity === 0 && this.allocatedQuantity === 0) {
    this.status = 'Depleted';
  } else if (this.expiryDate && new Date() > this.expiryDate) {
    this.status = 'Expired';
  } else if (this.availableQuantity === 0 && this.allocatedQuantity > 0) {
    this.status = 'Allocated';
  } else {
    this.status = 'Active';
  }
  
  next();
});

// Static methods for batch operations
batchSchema.statics.generateBatchNumber = async function(productId, variantId = null) {
  const today = new Date();
  const dateStr = today.toISOString().split('T')[0].replace(/-/g, '');
  
  // Find the latest batch number for today
  const prefix = `BTH-${dateStr}`;
  const latestBatch = await this.findOne({
    batchNumber: { $regex: `^${prefix}` }
  }).sort({ batchNumber: -1 });
  
  let sequence = 1;
  if (latestBatch) {
    const lastSequence = parseInt(latestBatch.batchNumber.split('-').pop());
    sequence = lastSequence + 1;
  }
  
  const sequenceStr = sequence.toString().padStart(3, '0');
  return `${prefix}-${sequenceStr}`;
};

// Find compatible batch for merging
batchSchema.statics.findCompatibleBatch = async function(productId, variantId, batchData) {
  // Convert productId to ObjectId if it's a string
  const productObjectId = typeof productId === 'string' ? new mongoose.Types.ObjectId(productId) : productId;
  
  const { manufacturingDate, expiryDate, bestBeforeDate, supplierInfo } = batchData;
  
  return this.findOne({
    productId: productObjectId,
    variantId,
    status: 'Active',
    manufacturingDate,
    expiryDate: expiryDate || null,
    bestBeforeDate: bestBeforeDate || null,
    'supplierInfo.supplierName': supplierInfo?.supplierName || 'Default Supplier',
    availableQuantity: { $gt: 0 }
  }).sort({ createdAt: -1 }); // Get most recent compatible batch
};

// Get batches for FEFO allocation
batchSchema.statics.getBatchesForFEFO = async function(productId, variantId, quantityNeeded) {
  // Convert productId to ObjectId if it's a string
  const productObjectId = typeof productId === 'string' ? new mongoose.Types.ObjectId(productId) : productId;
  
  return this.find({
    productId: productObjectId,
    variantId,
    status: 'Active',
    availableQuantity: { $gt: 0 }
  }).sort({ 
    expiryDate: 1, // Earliest expiry first
    manufacturingDate: 1 // Then oldest manufacturing date
  });
};

const Batch = mongoose.model('Batch', batchSchema);
export default Batch;
