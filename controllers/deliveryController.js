import Order from '../models/Order.js';
import DeliveryAgent from '../models/DeliveryAgent.js';
import User from '../models/User.js';
import { 
  sendOrderStatusUpdateEmail,
  sendDeliveryOTPEmail 
} from '../utils/emailSender.js';
import { 
  sendStatusUpdateNotification,
  sendOTPNotification
} from '../services/communicationService.js';

// @desc    Get assigned orders for delivery agent
// @route   GET /api/delivery/orders/assigned
// @access  Private (Delivery Agent)
export const getAssignedOrders = async (req, res) => {
  try {
    const agentId = req.agentId;
    const { status, page = 1, limit = 10, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;

    // Build query
    let query = { 'delivery.agent': agentId };
    
    if (status) {
      query['delivery.status'] = status;
    }

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Sort options
    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Fetch orders
    const orders = await Order.find(query)
      .populate('userId', 'name email phone')
      .populate('delivery.agent', 'name employeeId phone vehicleInfo')
      .sort(sortOptions)
      .skip(skip)
      .limit(parseInt(limit));

    // Get total count for pagination
    const totalOrders = await Order.countDocuments(query);
    const totalPages = Math.ceil(totalOrders / parseInt(limit));

    // Format orders for delivery agent view
    const formattedOrders = orders.map(order => ({
      id: order._id,
      orderNumber: order._id.toString().slice(-8).toUpperCase(),
      customer: {
        name: order.userId.name,
        phone: order.userId.phone,
        email: order.userId.email
      },
      shipping: order.shipping,
      items: order.items.map(item => ({
        name: item.name,
        quantity: item.qty,
        price: item.price
      })),
      totalAmount: order.totalAmount,
      paymentMethod: order.paymentMethod,
      orderStatus: order.status,
      delivery: {
        status: order.delivery.status,
        assignedAt: order.delivery.assignedAt,
        dispatchedAt: order.delivery.dispatchedAt,
        outForDeliveryAt: order.delivery.outForDeliveryAt,
        deliveredAt: order.delivery.deliveredAt,
        slot: order.delivery.slot,
        otp: order.delivery.otp ? {
          isGenerated: !!order.delivery.otp.code,
          expiresAt: order.delivery.otp.expiresAt,
          isUsed: order.delivery.otp.isUsed
        } : null,
        attempts: order.delivery.attempts.length,
        lastAttempt: order.delivery.attempts[order.delivery.attempts.length - 1]
      },
      deliverySlot: order.deliverySlot,
      placedAt: order.placedAt,
      createdAt: order.createdAt
    }));

    res.json({
      success: true,
      data: {
        orders: formattedOrders,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalOrders,
          hasNext: parseInt(page) < totalPages,
          hasPrev: parseInt(page) > 1
        }
      }
    });

  } catch (error) {
    console.error('Get assigned orders error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch assigned orders'
    });
  }
};

// @desc    Get single order details
// @route   GET /api/delivery/orders/:orderId
// @access  Private (Delivery Agent)
export const getOrderDetails = async (req, res) => {
  try {
    const { orderId } = req.params;
    const agentId = req.agentId;

    const order = await Order.findOne({
      _id: orderId,
      'delivery.agent': agentId
    })
    .populate('userId', 'name email phone')
    .populate('delivery.agent', 'name employeeId phone vehicleInfo');

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found or not assigned to you'
      });
    }

    // Format order details
    const orderDetails = {
      id: order._id,
      orderNumber: order._id.toString().slice(-8).toUpperCase(),
      customer: {
        name: order.userId.name,
        phone: order.userId.phone,
        email: order.userId.email
      },
      shipping: order.shipping,
      items: order.items,
      totalAmount: order.totalAmount,
      subtotal: order.subtotal,
      couponDiscount: order.couponDiscount,
      shippingFee: order.shippingFee,
      paymentMethod: order.paymentMethod,
      paymentStatus: order.paymentStatus,
      orderStatus: order.status,
      delivery: order.delivery,
      deliverySlot: order.deliverySlot,
      placedAt: order.placedAt,
      createdAt: order.createdAt
    };

    res.json({
      success: true,
      data: orderDetails
    });

  } catch (error) {
    console.error('Get order details error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch order details'
    });
  }
};

// @desc    Update delivery status
// @route   PUT /api/delivery/orders/:orderId/status
// @access  Private (Delivery Agent)
export const updateDeliveryStatus = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status, notes, location, violation, otp } = req.body;
    const agentId = req.agentId;

    // Validation
    const validStatuses = ['dispatched', 'out_for_delivery', 'delivered', 'failed'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid delivery status'
      });
    }

    // Find order
    const order = await Order.findOne({
      _id: orderId,
      'delivery.agent': agentId
    }).populate('userId', 'name email phone');

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found or not assigned to you'
      });
    }

    // Check if status update is allowed
    const statusCheck = order.canUpdateDeliveryStatus(status);
    
    if (!statusCheck.canUpdate) {
      return res.status(400).json({
        success: false,
        message: statusCheck.reason,
        requiresViolation: statusCheck.requiresViolation
      });
    }

    // Handle violation if required
    if (statusCheck.requiresViolation && !violation) {
      return res.status(400).json({
        success: false,
        message: 'Violation reason is required for this status update',
        requiresViolation: true,
        deviation: statusCheck.deviation
      });
    }

    // Generate OTP if moving to out_for_delivery
    if (status === 'out_for_delivery' && !order.delivery.otp?.code) {
      const otp = order.generateDeliveryOTP();
      
      // Send OTP to customer via email and SMS
      try {
        await sendDeliveryOTPEmail(order.userId.email, order.userId.name, otp, order._id);
        await sendOTPNotification(order.userId, otp, order._id);
      } catch (notificationError) {
        console.error('Failed to send OTP notifications:', notificationError);
        // Continue with status update even if notification fails
      }
    }

    // Verify OTP if status is being changed to delivered
    if (status === 'delivered') {
      if (!otp || otp.length !== 6) {
        return res.status(400).json({
          success: false,
          message: 'Valid 6-digit OTP is required to mark order as delivered'
        });
      }

      // Verify OTP
      const otpResult = order.verifyDeliveryOTP(otp, agentId);

      if (!otpResult.success) {
        return res.status(400).json({
          success: false,
          message: otpResult.error
        });
      }
    }

    // Create delivery attempt record
    const attempt = {
      timestamp: new Date(),
      status: status,
      location: location || null,
      notes: notes || '',
      agentId: agentId
    };

    // Add violation data if provided
    if (violation) {
      attempt.violation = {
        isViolation: true,
        reason: violation.reason,
        remarks: violation.remarks || '',
        timestamp: new Date(),
        minutesEarlyLate: statusCheck.deviation || 0
      };
    }

    // Update order
    order.delivery.status = status;
    order.delivery.attempts.push(attempt);
    order.delivery.metrics.totalAttempts = order.delivery.attempts.length;

    await order.save();

    // Send status update notifications
    try {
      const statusMessages = {
        dispatched: 'Your order has been dispatched and is on its way!',
        out_for_delivery: 'Your order is out for delivery. You will receive an OTP for verification.',
        delivered: 'Your order has been successfully delivered. Thank you for shopping with us!',
        failed: 'Delivery attempt failed. Our team will contact you soon.'
      };

      await sendOrderStatusUpdateEmail(
        order.userId.email,
        order.userId.name,
        order._id,
        status,
        statusMessages[status]
      );

      await sendStatusUpdateNotification(
        order.userId,
        order._id,
        status,
        statusMessages[status]
      );
    } catch (notificationError) {
      console.error('Failed to send status update notifications:', notificationError);
    }

    // Update agent stats
    if (status === 'delivered') {
      const agent = await DeliveryAgent.findById(agentId);
      if (agent) {
        agent.deliveryStats.totalDeliveries += 1;
        
        // Check if delivery was on time
        const slotCompliance = order.checkDeliverySlotCompliance();
        if (slotCompliance.isWithinSlot || Math.abs(slotCompliance.minutesDeviation) <= 30) {
          agent.deliveryStats.onTimeDeliveries += 1;
        } else {
          agent.deliveryStats.lateDeliveries += 1;
        }
        
        await agent.save();
      }
    }

    res.json({
      success: true,
      message: `Order status updated to ${status}`,
      data: {
        orderId: order._id,
        deliveryStatus: order.delivery.status,
        otpGenerated: status === 'out_for_delivery' && order.delivery.otp?.code,
        violation: violation ? true : false
      }
    });

  } catch (error) {
    console.error('Update delivery status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update delivery status'
    });
  }
};

// @desc    Report delivery issue
// @route   POST /api/delivery/orders/:orderId/issue
// @access  Private (Delivery Agent)
export const reportDeliveryIssue = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { issueType, description, location } = req.body;
    const agentId = req.agentId;

    // Validation
    const validIssueTypes = [
      'customer_not_available',
      'address_not_found',
      'customer_refused',
      'payment_issue',
      'vehicle_breakdown',
      'weather_conditions',
      'other'
    ];

    if (!validIssueTypes.includes(issueType)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid issue type'
      });
    }

    // Find order
    const order = await Order.findOne({
      _id: orderId,
      'delivery.agent': agentId
    }).populate('userId', 'name email phone');

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found or not assigned to you'
      });
    }

    // Add issue to delivery attempts
    order.delivery.attempts.push({
      timestamp: new Date(),
      status: 'failed',
      location: location || null,
      notes: `${issueType}: ${description}`,
      agentId: agentId,
      violation: {
        isViolation: false
      }
    });

    // Update delivery status
    order.delivery.status = 'failed';
    order.delivery.metrics.totalAttempts = order.delivery.attempts.length;

    await order.save();

    // Send notification to customer and admin
    try {
      await sendOrderStatusUpdateEmail(
        order.userId.email,
        order.userId.name,
        order._id,
        'failed',
        'There was an issue with your delivery. Our team will contact you soon to resolve this.'
      );

      await sendStatusUpdateNotification(
        order.userId.phone,
        order._id,
        'failed',
        'Delivery issue reported. Our team will contact you soon.'
      );
    } catch (notificationError) {
      console.error('Failed to send issue notifications:', notificationError);
    }

    res.json({
      success: true,
      message: 'Delivery issue reported successfully',
      data: {
        orderId: order._id,
        issueType,
        reportedAt: new Date()
      }
    });

  } catch (error) {
    console.error('Report delivery issue error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to report delivery issue'
    });
  }
};

// @desc    Get delivery agent statistics
// @route   GET /api/delivery/stats
// @access  Private (Delivery Agent)
export const getDeliveryStats = async (req, res) => {
  try {
    const agentId = req.agentId;

    // Get agent stats
    const agent = await DeliveryAgent.findById(agentId);
    
    if (!agent) {
      return res.status(404).json({
        success: false,
        message: 'Agent not found'
      });
    }

    // Get recent orders count
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayOrders = await Order.countDocuments({
      'delivery.agent': agentId,
      'delivery.assignedAt': { $gte: today }
    });

    const pendingOrders = await Order.countDocuments({
      'delivery.agent': agentId,
      'delivery.status': { $in: ['assigned', 'dispatched', 'out_for_delivery'] }
    });

    const completedToday = await Order.countDocuments({
      'delivery.agent': agentId,
      'delivery.status': 'delivered',
      'delivery.deliveredAt': { $gte: today }
    });

    res.json({
      success: true,
      data: {
        agent: {
          name: agent.name,
          employeeId: agent.employeeId,
          successRate: agent.getSuccessRate(),
          performance: agent.getPerformanceSummary()
        },
        stats: {
          todayOrders,
          pendingOrders,
          completedToday,
          totalDeliveries: agent.deliveryStats.totalDeliveries,
          onTimeDeliveries: agent.deliveryStats.onTimeDeliveries,
          averageRating: agent.deliveryStats.averageRating
        }
      }
    });

  } catch (error) {
    console.error('Get delivery stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch delivery statistics'
    });
  }
};

export default {
  getAssignedOrders,
  getOrderDetails,
  updateDeliveryStatus,
  reportDeliveryIssue,
  getDeliveryStats
};
