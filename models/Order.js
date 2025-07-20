import mongoose from 'mongoose';

const orderSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },  items: [
    {
      // Product or Combo Pack reference
      id: { type: mongoose.Schema.Types.ObjectId, required: true }, // Can ref Product or ComboPack
      name: String,
      price: Number,
      qty: Number,
      image: String,
      
      // Type identification
      itemType: { type: String, enum: ['product', 'combo'], default: 'product' },
      
      // Product-specific fields
      variantId: String, // The variant ID from the product's variants array
      variantName: String, // e.g., "500ml", "Large", "Red"
      variantPrice: Number, // Price of the specific variant
      hasVariant: { type: Boolean, default: false }, // Whether this item has a variant
      
      // Combo Pack-specific fields
      comboProducts: [{
        productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
        productName: String,
        variantId: String,
        variantName: String,
        quantity: Number,
        originalPrice: Number,
        images: [{
          url: String,
          source: String, // 'product' or 'variant'
          alt: String
        }]
      }],
      originalTotalPrice: Number, // For combo packs: sum of individual product prices
      discountAmount: Number, // For combo packs: total discount
      discountPercentage: Number // For combo packs: discount percentage
    }
  ],
  shipping: {
    name: String,
    address: String,
    phone: String
  },
  totalAmount: { type: Number, required: true },
  
  // Discount breakdown
  subtotal: { type: Number, required: true }, // Original amount before discounts
  couponDiscount: { type: Number, default: 0 }, // Discount from coupon
  coinDiscount: { 
    amount: { type: Number, default: 0 }, // Discount amount from coins
    coinsUsed: { type: Number, default: 0 }, // Number of coins redeemed
    transactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction' } // Reference to coin transaction
  },
  shippingFee: { type: Number, default: 0 }, // Shipping fee

  status: { type: String, enum: ['Pending', 'Shipped', 'Dispatched', 'Out for Delivery', 'Delivered', 'Failed', 'Cancelled'], default: 'Pending' },
  paymentMethod: { type: String, enum: ['COD', 'UPI'], default: 'COD' },
  paymentStatus: { type: String, enum: ['Pending', 'UnderReview', 'Paid'], default: 'Pending' },
  upiTransactionId: { type: String }, // UTR entered by user
  coupon: { type: mongoose.Schema.Types.ObjectId, ref: 'Coupon' },
  
  // Delivery Agent Management
  delivery: {
    agent: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'DeliveryAgent',
      default: null
    },
    status: {
      type: String,
      enum: ['Pending', 'Assigned', 'Dispatched', 'Out for Delivery', 'Delivered', 'Failed', 'Cancelled'],
      default: 'Pending'
    },
    assignedAt: Date,
    dispatchedAt: Date,
    outForDeliveryAt: Date,
    deliveredAt: Date,
    failedAt: Date,
    
    // OTP for delivery verification
    otp: {
      code: String, // 6-digit code
      generatedAt: Date,
      expiresAt: Date,
      isUsed: { type: Boolean, default: false },
      verifiedAt: Date,
      failedAttempts: [{
        attemptedAt: Date,
        attemptedCode: String,
        agentId: { type: mongoose.Schema.Types.ObjectId, ref: 'DeliveryAgent' }
      }]
    },
    
    // Delivery slot information
    slot: {
      date: Date,
      startTime: String, // "10:00"
      endTime: String,   // "13:00"
      timezone: { type: String, default: 'Asia/Kolkata' }
    },
    
    // Delivery attempts and violations
    attempts: [{
      timestamp: Date,
      status: String,
      location: {
        lat: Number,
        lng: Number,
        address: String
      },
      notes: String,
      agentId: { type: mongoose.Schema.Types.ObjectId, ref: 'DeliveryAgent' },
      
      // Violation tracking
      violation: {
        isViolation: { type: Boolean, default: false },
        reason: {
          type: String,
          enum: [
            'customer_requested_early',
            'traffic_delays',
            'emergency_delivery',
            'reattempt_missed_delivery',
            'customer_not_available',
            'address_not_found',
            'vehicle_breakdown',
            'weather_conditions',
            'others'
          ]
        },
        remarks: String,
        timestamp: Date,
        minutesEarlyLate: Number, // Positive for late, negative for early
        approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' }
      }
    }],
    
    // Performance metrics
    metrics: {
      totalAttempts: { type: Number, default: 0 },
      deliveryTime: Date, // Actual delivery completion time
      estimatedTime: Date, // Expected delivery time
      customerRating: { type: Number, min: 1, max: 5 },
      customerFeedback: String
    }
  },
  // OTP Delivery Verification
  deliveryOtp: {
    code: { type: String, required: true }, // 6-digit OTP code
    generatedAt: { type: Date, required: true }, // When OTP was created
    isUsed: { type: Boolean, default: false }, // Has OTP been used successfully
    failedAttempts: [{
      attemptedAt: { type: Date, required: true }, // When attempt was made
      attemptedCode: { type: String, required: true }, // What code was entered
      ipAddress: String // IP address of the attempt (for security)
    }],
    lockoutUntil: Date // When lockout expires (null if not locked)
  },
  
  // Delivery Slot Selection
  deliverySlot: {
    date: {
      type: Date,
      required: false,
      validate: {
        validator: function(value) {
          if (!value) return true; // Allow null/undefined
          const twoDaysFromNow = new Date();
          twoDaysFromNow.setDate(twoDaysFromNow.getDate() + 2);
          twoDaysFromNow.setHours(0, 0, 0, 0);
          return value >= twoDaysFromNow;
        },
        message: 'Delivery date must be at least 2 days from today'
      }
    },
    timeSlot: {
      type: String,
      enum: [
        '9:00 AM - 12:00 PM',
        '12:00 PM - 3:00 PM', 
        '3:00 PM - 6:00 PM',
        '6:00 PM - 9:00 PM'
      ],
      required: false
    },
    isModifiable: {
      type: Boolean,
      default: true
    },
    lastModified: {
      type: Date,
      default: Date.now
    }
  },
  
  deliveryRating: { type: Number, min: 1, max: 5 },
  deliveryReview: { type: String },
  
  // Return Information
  returnInfo: {
    isReturnable: { type: Boolean, default: true },
    returnWindow: { type: Number, default: 7 }, // days
    returnEligibilityExpiry: Date, // calculated from deliveredAt + 7 days
    hasActiveReturn: { type: Boolean, default: false },
    returnHistory: [{
      returnId: { type: mongoose.Schema.Types.ObjectId, ref: 'Return' },
      status: String,
      createdAt: Date,
      completedAt: Date
    }],
    returnRestrictions: [{
      reason: String,
      restrictedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
      restrictedAt: Date
    }]
  },
  
  placedAt: { type: Date, default: Date.now }
}, { timestamps: true });

// Method to check if delivery slot can be modified
orderSchema.methods.canModifyDeliverySlot = function() {
  // Allow modification for all statuses as requested
  return true;
};

// Method to check if order can be assigned to delivery agent
orderSchema.methods.canAssignDeliveryAgent = function() {
  return ['Pending', 'Shipped'].includes(this.status) && 
         ['pending', 'assigned'].includes(this.delivery.status);
};

// Method to check if agent can update delivery status
orderSchema.methods.canUpdateDeliveryStatus = function(newStatus, currentTime = new Date()) {
  const currentDeliveryStatus = this.delivery.status;
  const slot = this.delivery.slot;
  
  // Status flow validation
  const validTransitions = {
    'assigned': ['dispatched'],
    'dispatched': ['out_for_delivery'],
    'out_for_delivery': ['delivered', 'failed']
  };
  
  if (!validTransitions[currentDeliveryStatus]?.includes(newStatus)) {
    return { canUpdate: false, reason: 'Invalid status transition' };
  }
  
  // Time slot validation for out_for_delivery
  if (newStatus === 'out_for_delivery' && slot && slot.date) {
    const slotDate = new Date(slot.date);
    const currentDate = new Date(currentTime);
    
    // Check if it's the correct date
    if (slotDate.toDateString() !== currentDate.toDateString()) {
      return { 
        canUpdate: false, 
        reason: 'Can only mark as out for delivery on scheduled date',
        requiresViolation: true
      };
    }
  }
  
  // Time slot validation for delivered
  if (newStatus === 'delivered' && slot && slot.startTime && slot.endTime) {
    const { isWithinSlot, minutesDeviation } = this.checkDeliverySlotCompliance(currentTime);
    
    if (!isWithinSlot && Math.abs(minutesDeviation) > 30) { // 30 min tolerance
      return {
        canUpdate: true,
        requiresViolation: true,
        deviation: minutesDeviation,
        reason: minutesDeviation > 0 ? 'Late delivery' : 'Early delivery'
      };
    }
  }
  
  return { canUpdate: true, requiresViolation: false };
};

// Method to check delivery slot compliance
orderSchema.methods.checkDeliverySlotCompliance = function(currentTime = new Date()) {
  const slot = this.delivery.slot;
  
  if (!slot || !slot.date || !slot.startTime || !slot.endTime) {
    return { isWithinSlot: true, minutesDeviation: 0 };
  }
  
  const slotDate = new Date(slot.date);
  const [startHour, startMin] = slot.startTime.split(':').map(Number);
  const [endHour, endMin] = slot.endTime.split(':').map(Number);
  
  const slotStart = new Date(slotDate);
  slotStart.setHours(startHour, startMin, 0, 0);
  
  const slotEnd = new Date(slotDate);
  slotEnd.setHours(endHour, endMin, 0, 0);
  
  const currentTimeMs = currentTime.getTime();
  const slotStartMs = slotStart.getTime();
  const slotEndMs = slotEnd.getTime();
  
  if (currentTimeMs >= slotStartMs && currentTimeMs <= slotEndMs) {
    return { isWithinSlot: true, minutesDeviation: 0 };
  }
  
  // Calculate deviation in minutes
  let minutesDeviation;
  if (currentTimeMs < slotStartMs) {
    minutesDeviation = -Math.round((slotStartMs - currentTimeMs) / (1000 * 60)); // Negative for early
  } else {
    minutesDeviation = Math.round((currentTimeMs - slotEndMs) / (1000 * 60)); // Positive for late
  }
  
  return { isWithinSlot: false, minutesDeviation };
};

// Method to generate delivery OTP
orderSchema.methods.generateDeliveryOTP = function() {
  const otp = Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit OTP
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 10 * 60 * 1000); // 10 minutes
  
  this.delivery.otp = {
    code: otp,
    generatedAt: now,
    expiresAt: expiresAt,
    isUsed: false,
    verifiedAt: null,
    failedAttempts: []
  };
  
  return otp;
};

// Method to verify delivery OTP
orderSchema.methods.verifyDeliveryOTP = function(enteredOTP, agentId) {
  const otpData = this.delivery.otp;
  
  if (!otpData || !otpData.code) {
    return { success: false, error: 'No OTP generated for this order' };
  }
  
  if (otpData.isUsed) {
    return { success: false, error: 'OTP has already been used' };
  }
  
  if (new Date() > otpData.expiresAt) {
    return { success: false, error: 'OTP has expired' };
  }
  
  if (otpData.code !== enteredOTP) {
    // Record failed attempt
    otpData.failedAttempts.push({
      attemptedAt: new Date(),
      attemptedCode: enteredOTP,
      agentId: agentId
    });
    
    return { success: false, error: 'Invalid OTP' };
  }
  
  // Mark OTP as used
  otpData.isUsed = true;
  otpData.verifiedAt = new Date();
  
  return { success: true };
};

// Method to calculate return eligibility
orderSchema.methods.calculateReturnEligibility = function() {
  const status = this.status?.toLowerCase();
  if (status !== 'delivered') {
    return { 
      isEligible: false, 
      reason: 'Order not delivered yet',
      daysRemaining: 0,
      eligibilityExpiry: null
    };
  }
  
  // Use delivery.deliveredAt if available, otherwise use a reasonable fallback
  let deliveredAt = this.delivery?.deliveredAt;
  if (!deliveredAt) {
    // For delivered orders without delivery tracking, use createdAt + 3 days as fallback
    deliveredAt = new Date(this.createdAt.getTime() + 3 * 24 * 60 * 60 * 1000);
  }
  
  const currentDate = new Date();
  const daysSinceDelivery = (currentDate - deliveredAt) / (1000 * 60 * 60 * 24);
  const isEligible = daysSinceDelivery <= 7 && !this.returnInfo?.hasActiveReturn;
  
  return {
    isEligible: isEligible,
    daysRemaining: Math.max(0, 7 - Math.floor(daysSinceDelivery)),
    eligibilityExpiry: new Date(deliveredAt.getTime() + 7 * 24 * 60 * 60 * 1000),
    reason: !isEligible ? (daysSinceDelivery > 7 ? 'Return window expired' : 'Active return exists') : null
  };
};

// Method to update return eligibility expiry when delivered
orderSchema.methods.updateReturnEligibility = function() {
  const status = this.status?.toLowerCase();
  const deliveredAt = this.delivery?.deliveredAt;
  if (deliveredAt && status === 'delivered') {
    this.returnInfo.returnEligibilityExpiry = new Date(deliveredAt.getTime() + 7 * 24 * 60 * 60 * 1000);
  }
};

// Method to update delivery slot modifiability based on status
orderSchema.pre('save', function(next) {
  if (this.isModified('status')) {
    // Allow modification for all statuses as requested
    this.deliverySlot.isModifiable = true;
  }
  
  // Auto-update delivery timestamps
  if (this.isModified('delivery.status')) {
    const now = new Date();
    switch (this.delivery.status) {
      case 'assigned':
        if (!this.delivery.assignedAt) this.delivery.assignedAt = now;
        break;
      case 'dispatched':
        if (!this.delivery.dispatchedAt) this.delivery.dispatchedAt = now;
        break;
      case 'out_for_delivery':
        if (!this.delivery.outForDeliveryAt) this.delivery.outForDeliveryAt = now;
        break;
      case 'delivered':
        if (!this.delivery.deliveredAt) this.delivery.deliveredAt = now;
        this.status = 'Delivered'; // Update main order status
        // Update return eligibility when order is delivered
        this.updateReturnEligibility();
        break;
      case 'failed':
        if (!this.delivery.failedAt) this.delivery.failedAt = now;
        break;
    }
  }
  
  // Update return eligibility when delivery status changes to delivered
  if (this.isModified('status') && this.status === 'Delivered' && this.delivery.deliveredAt) {
    this.updateReturnEligibility();
  }
  
  next();
});

const Order = mongoose.model('Order', orderSchema);
export default Order;
