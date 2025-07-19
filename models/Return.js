import mongoose from 'mongoose';

const returnSchema = new mongoose.Schema({
  // Basic Information
  returnRequestId: { 
    type: String, 
    unique: true,
    default: () => `RR-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${Math.floor(Math.random() * 90000) + 10000}`
  },
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  
  // Return Items
  items: [{
    orderItemId: String, // Reference to order.items array index
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    productName: String,
    variantId: String,
    variantName: String,
    quantity: Number,
    originalPrice: Number,
    itemType: { type: String, enum: ['product', 'combo'] }
  }],
  
  // Return Request Details
  returnReason: {
    type: String,
    enum: [
      'defective',           // Manufacturing defect
      'wrong_item',          // Wrong product delivered
      'not_as_described',    // Product doesn't match description
      'quality_issue',       // Quality problems
      'changed_mind',        // Customer changed mind
      'size_issue',          // Size/fit problems
      'damaged_in_transit'   // Damaged during delivery
    ],
    required: true
  },
  customerComments: { type: String, maxlength: 500 },
  evidenceImages: [{ 
    type: String, 
    required: true,
    validate: {
      validator: function(v) { return v.length > 0; },
      message: 'At least one evidence image is required'
    }
  }],
  
  // Status Tracking
  status: {
    type: String,
    enum: [
      'requested',           // Customer created request
      'admin_review',        // Admin reviewing request
      'approved',           // Admin approved return
      'rejected',           // Admin rejected return
      'warehouse_assigned', // Assigned to warehouse manager
      'pickup_scheduled',   // Pickup scheduled by warehouse manager
      'picked_up',         // Items picked up (OTP verified)
      'in_warehouse',      // Items received at warehouse
      'quality_checked',   // Quality assessment completed
      'refund_approved',   // Admin approved refund
      'refund_processed',  // Coins credited to wallet
      'completed',         // Process fully completed
      'cancelled'          // Return cancelled by customer
    ],
    default: 'requested'
  },
  
  // Admin Review Section
  adminReview: {
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
    reviewedAt: Date,
    approved: Boolean,
    adminComments: { type: String, maxlength: 500 },
    
    // Pickup Charge Configuration
    pickupCharge: {
      isFree: { type: Boolean, default: true },
      amount: { type: Number, default: 0 },
      reason: String,
      toggledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
      toggledAt: Date
    },
    
    assignedToWarehouse: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  },
  
  // Warehouse Management (Primary Controller)
  warehouseManagement: {
    assignedManager: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    assignedAt: Date,
    
    // Pickup Management
    pickup: {
      method: { 
        type: String, 
        enum: ['agent_assigned', 'direct_warehouse', 'customer_dropoff'], 
        default: 'agent_assigned' 
      },
      assignedAgent: { type: mongoose.Schema.Types.ObjectId, ref: 'DeliveryAgent' },
      scheduledDate: Date,
      scheduledSlot: {
        type: String,
        enum: ['9:00 AM - 12:00 PM', '12:00 PM - 3:00 PM', '3:00 PM - 6:00 PM', '6:00 PM - 9:00 PM']
      },
      pickedUpAt: Date,
      
      // OTP Verification (Using Original Order OTP)
      otpVerification: {
        orderOtpUsed: String,
        verifiedAt: Date,
        verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'DeliveryAgent' },
        verificationAttempts: [{
          attemptedAt: Date,
          attemptedOtp: String,
          success: Boolean,
          agentId: { type: mongoose.Schema.Types.ObjectId, ref: 'DeliveryAgent' },
          ipAddress: String
        }]
      },
      
      pickupStatus: {
        type: String,
        enum: ['not_scheduled', 'scheduled', 'in_progress', 'completed', 'failed', 'rescheduled'],
        default: 'not_scheduled'
      },
      
      pickupNotes: String,
      failureReason: String
    },
    
    // Quality Assessment
    qualityAssessment: {
      assessedAt: Date,
      itemCondition: {
        type: String,
        enum: ['excellent', 'good', 'fair', 'poor', 'damaged', 'unusable']
      },
      refundEligibility: {
        type: String,
        enum: ['full', 'partial', 'none']
      },
      refundPercentage: { 
        type: Number, 
        min: 0, 
        max: 100,
        default: 100
      },
      warehouseNotes: { type: String, maxlength: 1000 },
      qualityImages: [String],
      
      // Item Condition Details
      conditionDetails: {
        packaging: { type: String, enum: ['intact', 'damaged', 'missing'] },
        productCondition: { type: String, enum: ['new', 'used', 'damaged'] },
        accessories: { type: String, enum: ['complete', 'partial', 'missing'] },
        functionality: { type: String, enum: ['working', 'partial', 'not_working'] }
      },
      
      // Restocking Decision
      restockDecision: {
        canRestock: { type: Boolean, default: false },
        restockCondition: String,
        restockValue: Number,
        restockNotes: String
      }
    },
    
    // Status Update History
    statusUpdates: [{
      fromStatus: String,
      toStatus: String,
      updatedAt: { type: Date, default: Date.now },
      updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      notes: String,
      autoUpdate: { type: Boolean, default: false }
    }]
  },
  
  // Refund Processing
  refund: {
    // Warehouse Recommendation
    warehouseRecommendation: {
      recommendedAmount: Number,
      recommendedCoins: Number,
      recommendation: { 
        type: String, 
        enum: ['approve_full', 'approve_partial', 'reject']
      },
      warehouseNotes: String,
      recommendedAt: Date
    },
    
    // Admin Final Decision
    adminDecision: {
      decision: { 
        type: String, 
        enum: ['approved', 'rejected', 'modified'] 
      },
      finalAmount: Number,
      finalCoins: Number,
      adminNotes: String,
      decidedAt: Date,
      decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
      
      // Deductions/Adjustments
      deductions: [{
        type: { 
          type: String, 
          enum: ['pickup_charge', 'damage_penalty', 'restocking_fee', 'processing_fee'] 
        },
        amount: Number,
        percentage: Number,
        reason: String,
        calculatedAt: Date
      }]
    },
    
    // Processing Details
    processing: {
      processedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
      processedAt: Date,
      walletTransactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction' },
      conversionRate: { type: Number, default: 5 }, // 1 Rupee = 5 Coins
      originalAmount: Number,
      coinsCredited: Number,
      processingStatus: {
        type: String,
        enum: ['pending', 'processing', 'completed', 'failed'],
        default: 'pending'
      }
    }
  },
  
  // Return Eligibility
  eligibility: {
    eligibilityExpiry: { type: Date, required: true },
    daysRemaining: Number,
    isEligible: { type: Boolean, default: true },
    eligibilityCheckedAt: { type: Date, default: Date.now }
  },
  
  // Communication Log
  communications: [{
    type: { type: String, enum: ['sms', 'email', 'push', 'whatsapp'] },
    message: String,
    sentAt: Date,
    status: { type: String, enum: ['sent', 'delivered', 'failed'] },
    recipientType: { type: String, enum: ['customer', 'admin', 'warehouse', 'agent'] }
  }],
  
  // Timestamps
  requestedAt: { type: Date, default: Date.now },
  lastUpdatedAt: { type: Date, default: Date.now },
  completedAt: Date,
  
  // Performance Metrics
  metrics: {
    totalProcessingTime: Number, // Minutes from request to completion
    pickupTime: Number,          // Minutes from scheduled to picked up
    qualityAssessmentTime: Number, // Minutes for quality check
    refundProcessingTime: Number   // Minutes for final processing
  }
});

// Indexes for performance
returnSchema.index({ orderId: 1 });
returnSchema.index({ customerId: 1 });
returnSchema.index({ status: 1 });
returnSchema.index({ 'warehouseManagement.assignedManager': 1 });
returnSchema.index({ 'eligibility.eligibilityExpiry': 1 });
returnSchema.index({ requestedAt: -1 });
returnSchema.index({ returnRequestId: 1 });

// Virtual for return request display ID
returnSchema.virtual('displayId').get(function() {
  return this.returnRequestId;
});

// Method to check if return is still eligible
returnSchema.methods.checkEligibility = function() {
  const now = new Date();
  const isEligible = now <= this.eligibility.eligibilityExpiry;
  this.eligibility.isEligible = isEligible;
  this.eligibility.daysRemaining = Math.max(0, Math.ceil((this.eligibility.eligibilityExpiry - now) / (1000 * 60 * 60 * 24)));
  return isEligible;
};

// Method to calculate refund amount
returnSchema.methods.calculateRefund = function(percentage = 100) {
  const totalAmount = this.items.reduce((sum, item) => sum + (item.originalPrice * item.quantity), 0);
  const refundAmount = (totalAmount * percentage) / 100;
  const coinRefund = refundAmount * 5; // 1 Rupee = 5 Coins
  
  return {
    originalAmount: totalAmount,
    refundAmount: refundAmount,
    coinRefund: coinRefund,
    percentage: percentage
  };
};

// Method to update status with history tracking
returnSchema.methods.updateStatus = function(newStatus, updatedBy, notes = '', autoUpdate = false) {
  const oldStatus = this.status;
  
  // Add to status update history
  this.warehouseManagement.statusUpdates.push({
    fromStatus: oldStatus,
    toStatus: newStatus,
    updatedAt: new Date(),
    updatedBy: updatedBy,
    notes: notes,
    autoUpdate: autoUpdate
  });
  
  // Update current status
  this.status = newStatus;
  this.lastUpdatedAt = new Date();
  
  return this;
};

// Pre-save middleware to update timestamps
returnSchema.pre('save', function(next) {
  this.lastUpdatedAt = new Date();
  next();
});

// Static method to calculate return eligibility for an order
returnSchema.statics.calculateReturnEligibility = function(order) {
  if (!order.delivery || !order.delivery.deliveredAt || order.status !== 'Delivered') {
    return { 
      isEligible: false, 
      reason: 'Order not delivered yet',
      daysRemaining: 0
    };
  }
  
  const deliveredAt = new Date(order.delivery.deliveredAt);
  const currentDate = new Date();
  const daysSinceDelivery = (currentDate - deliveredAt) / (1000 * 60 * 60 * 24);
  const isEligible = daysSinceDelivery <= 7 && !order.returnInfo?.hasActiveReturn;
  
  return {
    isEligible: isEligible,
    daysRemaining: Math.max(0, 7 - Math.floor(daysSinceDelivery)),
    eligibilityExpiry: new Date(deliveredAt.getTime() + 7 * 24 * 60 * 60 * 1000),
    reason: !isEligible ? (daysSinceDelivery > 7 ? 'Return window expired' : 'Active return exists') : null
  };
};

const Return = mongoose.model('Return', returnSchema);
export default Return;
