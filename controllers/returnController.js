import dotenv from 'dotenv';
dotenv.config();

import AWS from 'aws-sdk';
import path from 'path';
import Return from '../models/Return.js';
import Order from '../models/Order.js';
import User from '../models/User.js';
import Transaction from '../models/Transaction.js';
import { 
  sendReturnRequestConfirmation, 
  sendReturnDecisionNotification 
} from '../services/communicationService.js';
import { notifyReturnStatus as notifyReturnStatusExpo, notifyAdminsReturnRequest } from '../notifications.js';
import { notifyReturnStatusWeb } from '../services/webPushService.js';
import notificationService from '../services/notificationService.js';

// AWS S3 Configuration
const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY,
  secretAccessKey: process.env.AWS_SECRET_KEY,
  region: process.env.AWS_REGION
});
const BUCKET = process.env.AWS_S3_BUCKET;

// Upload evidence image to S3 (returns folder)
async function uploadReturnImageToS3(buffer, originalName, returnRequestId) {
  const ext = path.extname(originalName);
  const key = `returns/${returnRequestId}/${Date.now()}${ext}`;
  const params = {
    Bucket: BUCKET,
    Key: key,
    Body: buffer,
    ContentType: 'image/' + ext.replace('.', ''),
    ACL: 'public-read'
  };
  const data = await s3.upload(params).promise();
  return data.Location;
}

// Customer Return Management

// Create Return Request
export const createReturnRequest = async (req, res) => {
  try {
    const userId = req.user.id;
    let { orderId, items, returnReason, customerComments } = req.body;
    
    // Handle case where items might be sent as a string
    if (typeof items === 'string') {
      try {
        items = JSON.parse(items);
      } catch (parseError) {
        console.error('[CREATE RETURN] Failed to parse items string:', parseError);
        return res.status(400).json({
          success: false,
          message: 'Invalid items format'
        });
      }
    }
    
    console.log(`[CREATE RETURN] User ${userId} creating return for order ${orderId}`);
    console.log(`[CREATE RETURN] Items received:`, JSON.stringify(items, null, 2));
    console.log(`[CREATE RETURN] Return reason:`, returnReason);
    // Validate input
    if (!orderId || !items || !returnReason) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: orderId, items, and returnReason are required'
      });
    }

    // Validate evidence images (files should be uploaded)
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Evidence images are required for return request'
      });
    }

    // Find and validate order
    const order = await Order.findById(orderId).populate('userId');
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Check if user owns this order
    if (order.userId._id.toString() !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized: This order does not belong to you'
      });
    }

    // Check return eligibility
    const eligibility = order.calculateReturnEligibility();
    if (!eligibility.isEligible) {
      return res.status(400).json({
        success: false,
        message: eligibility.reason,
        data: {
          isEligible: false,
          reason: eligibility.reason,
          daysRemaining: eligibility.daysRemaining
        }
      });
    }

    // Check if return already exists for this order
    const existingReturn = await Return.findOne({ 
      orderId: orderId, 
      status: { $nin: ['cancelled', 'completed'] } 
    });
    
    if (existingReturn) {
      return res.status(400).json({
        success: false,
        message: 'A return request already exists for this order'
      });
    }

    // Validate return items against order items
    const validItems = [];
    console.log(`[CREATE RETURN] Order items: ${JSON.stringify(order.items.map(item => ({ _id: item._id, id: item.id, name: item.name })))}`);
    console.log(`[CREATE RETURN] Raw items parameter:`, items);
    console.log(`[CREATE RETURN] Items type:`, typeof items);
    console.log(`[CREATE RETURN] Items length:`, Array.isArray(items) ? items.length : 'Not an array');
    
    for (const returnItem of items) {
      console.log(`[CREATE RETURN] Validating return item:`, returnItem);
      console.log(`[CREATE RETURN] Return item type:`, typeof returnItem);
      console.log(`[CREATE RETURN] Return item keys:`, Object.keys(returnItem || {}));
      console.log(`[CREATE RETURN] Looking for orderItemId: ${returnItem?.orderItemId}`);
      
      const orderItem = order.items.find(item => {
        const itemIdMatch = item._id.toString() === returnItem?.orderItemId || item.id.toString() === returnItem?.orderItemId;
        console.log(`[CREATE RETURN] Checking item ${item._id} (${item.name}): ${itemIdMatch}`);
        return itemIdMatch;
      });
      
      console.log(`[CREATE RETURN] Found orderItem:`, orderItem ? { _id: orderItem._id, name: orderItem.name } : 'NOT FOUND');
      if (!orderItem) {
        return res.status(400).json({
          success: false,
          message: `Invalid order item ID: ${returnItem?.orderItemId}. Available items: ${order.items.map(i => `${i._id}(${i.name})`).join(', ')}`
        });
      }

      if (returnItem?.quantity > orderItem.qty) {
        return res.status(400).json({
          success: false,
          message: `Return quantity exceeds ordered quantity for item: ${orderItem.name}`
        });
      }

      validItems.push({
        orderItemId: returnItem?.orderItemId,
        productId: orderItem.id,
        productName: orderItem.name,
        variantId: orderItem.variantId,
        variantName: orderItem.variantName,
        quantity: returnItem?.quantity,
        originalPrice: orderItem.price,
        itemType: orderItem.itemType || 'product'
      });
    }

    // Calculate pickup charge
    const pickupCharge = calculatePickupCharge(returnReason);

    // Generate temporary return request ID for image uploads
    const tempReturnRequestId = `TEMP_${Date.now()}_${userId}`;

    // Handle evidence image uploads
    let evidenceImages = [];
    if (req.files && req.files.length > 0) {
      console.log(`[CREATE RETURN] Processing ${req.files.length} evidence image uploads`);
      
      try {
        for (const file of req.files) {
          // Validate file before upload
          if (!file.buffer || !file.originalname) {
            console.warn('[CREATE RETURN] Skipping invalid file:', file);
            continue;
          }
          
          const url = await uploadReturnImageToS3(file.buffer, file.originalname, tempReturnRequestId);
          if (url) {
            evidenceImages.push(url);
            console.log('[CREATE RETURN] Successfully uploaded evidence image:', url);
          }
        }
      } catch (uploadError) {
        console.error('[CREATE RETURN] Evidence image upload error:', uploadError);
        return res.status(500).json({ 
          success: false,
          message: 'Failed to upload evidence images. Please try again.',
          error: uploadError.message 
        });
      }
    }

    // Ensure at least one evidence image was uploaded
    if (evidenceImages.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'At least one evidence image must be uploaded successfully'
      });
    }

    // Create return request
    const returnRequest = new Return({
      orderId: orderId,
      customerId: userId,
      items: validItems,
      returnReason: returnReason,
      customerComments: customerComments || '',
      evidenceImages: evidenceImages,
      status: 'requested',
      eligibility: {
        eligibilityExpiry: eligibility.eligibilityExpiry,
        daysRemaining: eligibility.daysRemaining,
        isEligible: true
      },
      adminReview: {
        pickupCharge: pickupCharge
      }
    });

    await returnRequest.save();

    // Update order to mark as having active return
    order.returnInfo.hasActiveReturn = true;
    order.returnInfo.returnHistory.push({
      returnId: returnRequest._id,
      status: 'requested',
      createdAt: new Date()
    });
    await order.save();

    // In-app notification for user
    await notificationService.createNotification({
      title: 'Return Requested',
      message: `Your return for order #${order._id.toString()} has been submitted for review.`,
      type: 'return',
      userId: order.userId._id,
      category: 'returns',
      relatedOrderId: order._id,
      actionUrl: `/returns/${returnRequest._id.toString()}`,
      channels: ['in_app']
    });

    // Multi-channel notifications
    await sendReturnRequestConfirmation(order.userId, returnRequest);
    // Expo (mobile)
    try {
      await notifyReturnStatusExpo(order.userId._id || order.userId, returnRequest._id.toString(), 'requested', { orderId: order._id.toString() });
    } catch (_) {}
    // Web (PWA)
    try {
      await notifyReturnStatusWeb(order.userId._id || order.userId, { 
        returnId: returnRequest._id.toString(),
        orderId: order._id.toString(),
        status: 'requested'
      });
    } catch (_) {}
    // Admins (Expo)
    try {
      await notifyAdminsReturnRequest(returnRequest._id.toString(), order._id.toString(), { name: order.userId.name || order.userId.email }, returnReason);
    } catch (_) {}

    res.status(201).json({
      success: true,
      message: 'Return request created successfully',
      data: {
        returnId: returnRequest._id,
        returnRequestId: returnRequest.returnRequestId,
        status: returnRequest.status,
        eligibilityExpiry: returnRequest.eligibility.eligibilityExpiry,
        estimatedProcessingTime: '3-5 business days'
      }
    });

  } catch (error) {
    console.error('Error creating return request:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create return request',
      error: error.message
    });
  }
};

// Get Customer's Returns
export const getCustomerReturns = async (req, res) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 10, status = 'all' } = req.query;

    const query = { customerId: userId };
    if (status !== 'all') {
      query.status = status;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const returns = await Return.find(query)
      .populate('orderId', 'totalAmount status placedAt')
      .sort({ requestedAt: -1 })
      .limit(parseInt(limit))
      .skip(skip);

    const totalReturns = await Return.countDocuments(query);
    const totalPages = Math.ceil(totalReturns / parseInt(limit));

    res.json({
      success: true,
      data: {
        returns: returns,
        pagination: {
          currentPage: parseInt(page),
          totalPages: totalPages,
          totalReturns: totalReturns,
          limit: parseInt(limit)
        }
      }
    });

  } catch (error) {
    console.error('Error fetching customer returns:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch returns',
      error: error.message
    });
  }
};

// Get Specific Return Details
export const getReturnDetails = async (req, res) => {
  try {
    const userId = req.user.id;
    const { returnId } = req.params;

    const returnRequest = await Return.findById(returnId)
      .populate('orderId')
      .populate('customerId', 'name email phone');

    if (!returnRequest) {
      return res.status(404).json({
        success: false,
        message: 'Return request not found'
      });
    }

    // Check if user owns this return
    if (returnRequest.customerId._id.toString() !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized: This return does not belong to you'
      });
    }

    // Calculate refund amount
    const refundCalculation = returnRequest.calculateRefund(
      returnRequest.warehouseManagement?.qualityAssessment?.refundPercentage || 100
    );

    // Get timeline
    const timeline = returnRequest.warehouseManagement.statusUpdates.map(update => ({
      status: update.toStatus,
      date: update.updatedAt,
      notes: update.notes,
      autoUpdate: update.autoUpdate
    }));

    res.json({
      success: true,
      data: {
        return: returnRequest,
        timeline: timeline,
        refundCalculation: refundCalculation
      }
    });

  } catch (error) {
    console.error('Error fetching return details:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch return details',
      error: error.message
    });
  }
};

// Cancel Return Request
export const cancelReturnRequest = async (req, res) => {
  try {
    const userId = req.user.id;
    const { returnId } = req.params;
    const { reason } = req.body;

    const returnRequest = await Return.findById(returnId);
    if (!returnRequest) {
      return res.status(404).json({
        success: false,
        message: 'Return request not found'
      });
    }

    // Check ownership
    if (returnRequest.customerId.toString() !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized: This return does not belong to you'
      });
    }

    // Check if cancellation is allowed
    const cancellableStatuses = ['requested', 'admin_review', 'approved', 'warehouse_assigned'];
    if (!cancellableStatuses.includes(returnRequest.status)) {
      return res.status(400).json({
        success: false,
        message: 'Return cannot be cancelled at this stage'
      });
    }

    // If already picked up, cannot cancel
    if (returnRequest.status === 'picked_up' || 
        returnRequest.warehouseManagement?.pickup?.pickupStatus === 'completed') {
      return res.status(400).json({
        success: false,
        message: 'Return cannot be cancelled after pickup'
      });
    }

    // Update return status
    returnRequest.updateStatus('cancelled', userId, reason || 'Cancelled by customer');
    await returnRequest.save();

    // Update order
    const order = await Order.findById(returnRequest.orderId);
    if (order) {
      order.returnInfo.hasActiveReturn = false;
      // Update return history
      const historyEntry = order.returnInfo.returnHistory.find(
        h => h.returnId.toString() === returnId
      );
      if (historyEntry) {
        historyEntry.status = 'cancelled';
        historyEntry.completedAt = new Date();
      }
      await order.save();
    }

    // In-app notification for cancellation
    await notificationService.createNotification({
      title: 'Return Cancelled',
      message: `Your return request #${returnRequest._id.toString()} has been cancelled.`,
      type: 'return',
      userId: returnRequest.customerId,
      category: 'returns',
      relatedOrderId: returnRequest.orderId,
      actionUrl: `/orders/${returnRequest.orderId.toString()}`,
      channels: ['in_app']
    });

    // Expo push (user)
    try {
      await notifyReturnStatusExpo(returnRequest.customerId.toString(), returnRequest._id.toString(), 'cancelled', { orderId: returnRequest.orderId.toString() });
    } catch (_) {}
    // Web push (user)
    try {
      await notifyReturnStatusWeb(returnRequest.customerId.toString(), {
        returnId: returnRequest._id.toString(),
        orderId: returnRequest.orderId.toString(),
        status: 'cancelled'
      });
    } catch (_) {}

    res.json({
      success: true,
      message: 'Return request cancelled successfully'
    });

  } catch (error) {
    console.error('Error cancelling return request:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to cancel return request',
      error: error.message
    });
  }
};

// Return Eligibility Check
export const checkReturnEligibility = async (req, res) => {
  try {
    const userId = req.user.id;
    const { orderId } = req.params;

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Check ownership
    if (order.userId.toString() !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized: This order does not belong to you'
      });
    }

    const eligibility = order.calculateReturnEligibility();

    // Get returnable items
    const returnableItems = order.items.map(item => ({
      orderItemId: item._id.toString(),
      productName: item.name,
      variantName: item.variantName,
      canReturn: true, // All items are returnable
      reason: null
    }));

    res.json({
      success: true,
      data: {
        isEligible: eligibility.isEligible,
        daysRemaining: eligibility.daysRemaining,
        eligibilityExpiry: eligibility.eligibilityExpiry,
        reason: eligibility.reason,
        returnableItems: returnableItems
      }
    });

  } catch (error) {
    console.error('Error checking return eligibility:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check return eligibility',
      error: error.message
    });
  }
};

// Get Return Policies
export const getReturnPolicies = async (req, res) => {
  try {
    res.json({
      success: true,
      data: {
        returnWindow: 7,
        returnReasons: [
          { value: 'defective', label: 'Manufacturing defect', chargedPickup: false },
          { value: 'wrong_item', label: 'Wrong product delivered', chargedPickup: false },
          { value: 'not_as_described', label: 'Product doesn\'t match description', chargedPickup: false },
          { value: 'quality_issue', label: 'Quality problems', chargedPickup: false },
          { value: 'damaged_in_transit', label: 'Damaged during delivery', chargedPickup: false },
          { value: 'changed_mind', label: 'Customer changed mind', chargedPickup: true },
          { value: 'size_issue', label: 'Size/fit problems', chargedPickup: true }
        ],
        pickupCharges: {
          free: ['defective', 'wrong_item', 'not_as_described', 'quality_issue', 'damaged_in_transit'],
          charged: ['changed_mind', 'size_issue']
        },
        eligibilityRules: {
          timeWindow: '7 days from delivery',
          condition: 'All delivered products are eligible for return',
          evidence: 'Evidence images are mandatory',
          refundMethod: 'Coins credited to wallet (1 Rupee = 5 Coins)'
        }
      }
    });
  } catch (error) {
    console.error('Error fetching return policies:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch return policies',
      error: error.message
    });
  }
};

// Helper Functions

// Calculate pickup charge based on return reason
const calculatePickupCharge = (returnReason, adminOverride = null) => {
  const freeReasons = [
    'defective', 
    'wrong_item', 
    'not_as_described', 
    'quality_issue', 
    'damaged_in_transit'
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
