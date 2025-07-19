/**
 * Return Business Logic Utilities
 * Contains business logic and calculation functions for return management
 */

// Return Eligibility Calculator
export const calculateReturnEligibility = (order) => {
  // Check basic requirements
  if (order.status !== 'Delivered') {
    return { isEligible: false, reason: 'Order not delivered', daysRemaining: 0 };
  }
  
  if (!order.delivery.deliveredAt) {
    return { isEligible: false, reason: 'Delivery date not found', daysRemaining: 0 };
  }
  
  // Check 7-day window
  const deliveredAt = new Date(order.delivery.deliveredAt);
  const currentDate = new Date();
  const daysSinceDelivery = (currentDate - deliveredAt) / (1000 * 60 * 60 * 24);
  
  if (daysSinceDelivery > 7) {
    return { isEligible: false, reason: 'Return window expired', daysRemaining: 0 };
  }
  
  // Check for active returns
  if (order.returnInfo && order.returnInfo.hasActiveReturn) {
    return { isEligible: false, reason: 'Active return request exists', daysRemaining: 0 };
  }
  
  // Calculate remaining time
  const daysRemaining = Math.max(0, 7 - Math.floor(daysSinceDelivery));
  const eligibilityExpiry = new Date(deliveredAt.getTime() + 7 * 24 * 60 * 60 * 1000);
  
  return {
    isEligible: true,
    daysRemaining: daysRemaining,
    eligibilityExpiry: eligibilityExpiry,
    reason: null
  };
};

// Pickup Charge Calculator
export const calculatePickupCharge = (returnReason, adminOverride = null) => {
  const freeReasons = [
    'defective', 
    'wrong_item', 
    'not_as_described', 
    'quality_issue', 
    'damaged_in_transit'
  ];
  
  const chargedReasons = [
    'changed_mind', 
    'size_issue'
  ];
  
  // Admin can override any decision
  if (adminOverride !== null) {
    return {
      isFree: adminOverride,
      amount: adminOverride ? 0 : 50,
      reason: adminOverride ? 'Admin override - company courtesy' : 'Admin override - customer preference'
    };
  }
  
  // Default logic based on return reason
  const isFree = freeReasons.includes(returnReason);
  
  return {
    isFree: isFree,
    amount: isFree ? 0 : 50, // ₹50 pickup charge
    reason: isFree ? 'Company error/defect' : 'Customer preference'
  };
};

// Refund Calculator
export const calculateCoinRefund = (originalAmount, refundPercentage = 100, deductions = []) => {
  // Calculate base refund amount
  const baseRefund = (originalAmount * refundPercentage) / 100;
  
  // Apply deductions
  const totalDeductions = deductions.reduce((sum, deduction) => sum + deduction.amount, 0);
  const finalRefundAmount = Math.max(0, baseRefund - totalDeductions);
  
  // Convert to coins (1 Rupee = 5 Coins)
  const coinRefund = finalRefundAmount * 5;
  
  return {
    originalAmount: originalAmount,
    baseRefund: baseRefund,
    totalDeductions: totalDeductions,
    finalRefundAmount: finalRefundAmount,
    coinRefund: coinRefund,
    conversionRate: 5,
    breakdown: {
      percentage: refundPercentage,
      deductions: deductions
    }
  };
};

// OTP Verification for Return Pickup
export const verifyReturnPickupOTP = async (returnRequest, enteredOTP, agentId) => {
  const order = returnRequest.orderId;
  
  // Verify using existing order OTP verification method
  const otpVerification = order.verifyDeliveryOTP(enteredOTP, agentId);
  
  if (otpVerification.success) {
    // Update return status and log verification
    returnRequest.status = 'picked_up';
    returnRequest.warehouseManagement.pickup.otpVerification = {
      orderOtpUsed: enteredOTP,
      verifiedAt: new Date(),
      verifiedBy: agentId
    };
    returnRequest.warehouseManagement.pickup.pickedUpAt = new Date();
    returnRequest.warehouseManagement.pickup.pickupStatus = 'completed';
    
    // Add status update log
    returnRequest.warehouseManagement.statusUpdates.push({
      fromStatus: 'pickup_scheduled',
      toStatus: 'picked_up',
      updatedAt: new Date(),
      updatedBy: agentId,
      notes: 'Items picked up and OTP verified',
      autoUpdate: true
    });
    
    return { 
      success: true, 
      message: 'Return pickup verified successfully',
      nextStatus: 'in_warehouse'
    };
  } else {
    // Log failed attempt
    if (!returnRequest.warehouseManagement.pickup.otpVerification) {
      returnRequest.warehouseManagement.pickup.otpVerification = { verificationAttempts: [] };
    }
    
    returnRequest.warehouseManagement.pickup.otpVerification.verificationAttempts.push({
      attemptedAt: new Date(),
      attemptedOtp: enteredOTP,
      success: false,
      agentId: agentId
    });
    
    return { 
      success: false, 
      message: 'Invalid OTP. Please verify the correct OTP from customer.' 
    };
  }
};

// Status Transition Validator
export const validateStatusTransition = (currentStatus, newStatus, userRole) => {
  const validTransitions = {
    'requested': {
      'admin': ['admin_review', 'approved', 'rejected'],
      'warehouse': [],
      'agent': []
    },
    'admin_review': {
      'admin': ['approved', 'rejected'],
      'warehouse': [],
      'agent': []
    },
    'approved': {
      'admin': ['warehouse_assigned'],
      'warehouse': ['pickup_scheduled'],
      'agent': []
    },
    'warehouse_assigned': {
      'admin': [],
      'warehouse': ['pickup_scheduled'],
      'agent': []
    },
    'pickup_scheduled': {
      'admin': [],
      'warehouse': ['picked_up'],
      'agent': ['picked_up', 'failed', 'rescheduled']
    },
    'picked_up': {
      'admin': [],
      'warehouse': ['in_warehouse'],
      'agent': []
    },
    'in_warehouse': {
      'admin': [],
      'warehouse': ['quality_checked'],
      'agent': []
    },
    'quality_checked': {
      'admin': ['refund_approved', 'rejected'],
      'warehouse': [],
      'agent': []
    },
    'refund_approved': {
      'admin': ['refund_processed'],
      'warehouse': [],
      'agent': []
    },
    'refund_processed': {
      'admin': ['completed'],
      'warehouse': [],
      'agent': []
    }
  };

  const allowedTransitions = validTransitions[currentStatus]?.[userRole] || [];
  return allowedTransitions.includes(newStatus);
};

// Performance Metrics Calculator
export const calculatePerformanceMetrics = (returnRequest) => {
  const metrics = {};
  
  if (returnRequest.requestedAt && returnRequest.completedAt) {
    metrics.totalProcessingTime = Math.round(
      (returnRequest.completedAt - returnRequest.requestedAt) / (1000 * 60)
    ); // Minutes
  }
  
  if (returnRequest.warehouseManagement?.pickup?.scheduledDate && 
      returnRequest.warehouseManagement?.pickup?.pickedUpAt) {
    metrics.pickupTime = Math.round(
      (returnRequest.warehouseManagement.pickup.pickedUpAt - 
       returnRequest.warehouseManagement.pickup.scheduledDate) / (1000 * 60)
    ); // Minutes
  }
  
  if (returnRequest.warehouseManagement?.qualityAssessment?.receivedAt && 
      returnRequest.warehouseManagement?.qualityAssessment?.assessedAt) {
    metrics.qualityAssessmentTime = Math.round(
      (returnRequest.warehouseManagement.qualityAssessment.assessedAt - 
       returnRequest.warehouseManagement.qualityAssessment.receivedAt) / (1000 * 60)
    ); // Minutes
  }
  
  if (returnRequest.refund?.adminDecision?.decidedAt && 
      returnRequest.refund?.processing?.processedAt) {
    metrics.refundProcessingTime = Math.round(
      (returnRequest.refund.processing.processedAt - 
       returnRequest.refund.adminDecision.decidedAt) / (1000 * 60)
    ); // Minutes
  }
  
  return metrics;
};

// Return Reason Classifications
export const getReturnReasonClassification = (returnReason) => {
  const classifications = {
    'defective': {
      category: 'quality_issue',
      liability: 'company',
      chargedPickup: false,
      priority: 'high'
    },
    'wrong_item': {
      category: 'fulfillment_error',
      liability: 'company',
      chargedPickup: false,
      priority: 'high'
    },
    'not_as_described': {
      category: 'description_mismatch',
      liability: 'company',
      chargedPickup: false,
      priority: 'medium'
    },
    'quality_issue': {
      category: 'quality_issue',
      liability: 'company',
      chargedPickup: false,
      priority: 'high'
    },
    'damaged_in_transit': {
      category: 'shipping_damage',
      liability: 'company',
      chargedPickup: false,
      priority: 'high'
    },
    'changed_mind': {
      category: 'customer_preference',
      liability: 'customer',
      chargedPickup: true,
      priority: 'low'
    },
    'size_issue': {
      category: 'sizing_problem',
      liability: 'customer',
      chargedPickup: true,
      priority: 'medium'
    }
  };

  return classifications[returnReason] || {
    category: 'other',
    liability: 'customer',
    chargedPickup: true,
    priority: 'low'
  };
};

// Generate Return Request ID
export const generateReturnRequestId = () => {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const randomNum = Math.floor(Math.random() * 90000) + 10000;
  return `RR-${date}-${randomNum}`;
};

// Calculate Processing Priority Score
export const calculateProcessingPriority = (returnRequest) => {
  let score = 0;
  
  // Base score from return reason
  const reasonClassification = getReturnReasonClassification(returnRequest.returnReason);
  switch (reasonClassification.priority) {
    case 'high': score += 100; break;
    case 'medium': score += 50; break;
    case 'low': score += 10; break;
  }
  
  // Order value factor
  const orderValue = returnRequest.items.reduce((sum, item) => 
    sum + (item.originalPrice * item.quantity), 0);
  if (orderValue > 5000) score += 50;
  else if (orderValue > 2000) score += 25;
  else if (orderValue > 1000) score += 10;
  
  // Time factor (older requests get higher priority)
  const hoursOld = (new Date() - returnRequest.requestedAt) / (1000 * 60 * 60);
  if (hoursOld > 48) score += 30;
  else if (hoursOld > 24) score += 15;
  
  // Customer history factor (could be implemented later)
  // if (customer.isVip) score += 25;
  
  return score;
};

// Validate Return Items
export const validateReturnItems = (returnItems, orderItems) => {
  const validationResults = {
    valid: true,
    errors: [],
    validItems: []
  };

  for (const returnItem of returnItems) {
    const orderItem = orderItems.find(item => 
      item._id.toString() === returnItem.orderItemId
    );
    
    if (!orderItem) {
      validationResults.valid = false;
      validationResults.errors.push(
        `Invalid order item ID: ${returnItem.orderItemId}`
      );
      continue;
    }

    if (returnItem.quantity > orderItem.qty) {
      validationResults.valid = false;
      validationResults.errors.push(
        `Return quantity (${returnItem.quantity}) exceeds ordered quantity (${orderItem.qty}) for item: ${orderItem.name}`
      );
      continue;
    }

    validationResults.validItems.push({
      orderItemId: returnItem.orderItemId,
      productId: orderItem.id,
      productName: orderItem.name,
      variantId: orderItem.variantId,
      variantName: orderItem.variantName,
      quantity: returnItem.quantity,
      originalPrice: orderItem.price,
      itemType: orderItem.itemType || 'product'
    });
  }

  return validationResults;
};
