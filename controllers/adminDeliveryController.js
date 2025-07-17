import Order from '../models/Order.js';
import DeliveryAgent from '../models/DeliveryAgent.js';
import User from '../models/User.js';
import { 
  sendOrderStatusUpdateEmail 
} from '../utils/emailSender.js';
import { 
  sendStatusUpdateNotification 
} from '../services/communicationService.js';

// @desc    Create new delivery agent
// @route   POST /api/admin/delivery/agents
// @access  Private (Admin)
export const createDeliveryAgent = async (req, res) => {
  try {
    const {
      employeeId,
      name,
      email,
      phone,
      password,
      assignedAreas,
      vehicleInfo,
      workingHours
    } = req.body;

    // Validation
    if (!employeeId || !name || !email || !phone || !password) {
      return res.status(400).json({
        success: false,
        message: 'All required fields must be provided'
      });
    }

    // Check if delivery agent already exists
    const existingAgent = await DeliveryAgent.findOne({
      $or: [{ email }, { employeeId }]
    });

    if (existingAgent) {
      return res.status(400).json({
        success: false,
        message: 'Delivery agent with this email or employee ID already exists'
      });
    }

    // Create new delivery agent
    const newAgent = new DeliveryAgent({
      employeeId,
      name,
      email: email.toLowerCase(),
      phone,
      password,
      assignedAreas: assignedAreas || [],
      vehicleInfo: vehicleInfo || {},
      workingHours: workingHours || { start: '09:00', end: '18:00' }
    });

    await newAgent.save();

    // Return agent data without password
    const agentData = {
      id: newAgent._id,
      employeeId: newAgent.employeeId,
      name: newAgent.name,
      email: newAgent.email,
      phone: newAgent.phone,
      assignedAreas: newAgent.assignedAreas,
      vehicleInfo: newAgent.vehicleInfo,
      workingHours: newAgent.workingHours,
      isActive: newAgent.isActive,
      createdAt: newAgent.createdAt
    };

    res.status(201).json({
      success: true,
      message: 'Delivery agent created successfully',
      data: agentData
    });

  } catch (error) {
    console.error('Create delivery agent error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create delivery agent'
    });
  }
};

// @desc    Get all delivery agents
// @route   GET /api/admin/delivery/agents
// @access  Private (Admin)
export const getDeliveryAgents = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      search = '', 
      status = 'all', 
      area = '',
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    // Build query
    let query = {};
    
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { employeeId: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } }
      ];
    }
    
    if (status !== 'all') {
      query.isActive = status === 'active';
    }
    
    if (area) {
      query.assignedAreas = { $regex: area, $options: 'i' };
    }

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Sort options
    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Fetch agents
    const agents = await DeliveryAgent.find(query)
      .select('-password')
      .sort(sortOptions)
      .skip(skip)
      .limit(parseInt(limit));

    // Get total count
    const totalAgents = await DeliveryAgent.countDocuments(query);
    const totalPages = Math.ceil(totalAgents / parseInt(limit));

    // Add current order count for each agent
    const agentsWithStats = await Promise.all(
      agents.map(async (agent) => {
        const activeOrders = await Order.countDocuments({
          'delivery.agent': agent._id,
          'delivery.status': { $in: ['assigned', 'dispatched', 'out_for_delivery'] }
        });

        return {
          ...agent.toObject(),
          currentOrders: activeOrders,
          performance: agent.getPerformanceSummary()
        };
      })
    );

    res.json({
      success: true,
      data: {
        agents: agentsWithStats,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalAgents,
          hasNext: parseInt(page) < totalPages,
          hasPrev: parseInt(page) > 1
        }
      }
    });

  } catch (error) {
    console.error('Get delivery agents error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch delivery agents'
    });
  }
};

// @desc    Update delivery agent
// @route   PUT /api/admin/delivery/agents/:agentId
// @access  Private (Admin)
export const updateDeliveryAgent = async (req, res) => {
  try {
    const { agentId } = req.params;
    const {
      name,
      email,
      phone,
      assignedAreas,
      vehicleInfo,
      workingHours,
      isActive
    } = req.body;

    // Find agent
    const agent = await DeliveryAgent.findById(agentId);

    if (!agent) {
      return res.status(404).json({
        success: false,
        message: 'Delivery agent not found'
      });
    }

    // Check for unique email if being updated
    if (email && email !== agent.email) {
      const existingAgent = await DeliveryAgent.findOne({ 
        email: email.toLowerCase(),
        _id: { $ne: agentId }
      });

      if (existingAgent) {
        return res.status(400).json({
          success: false,
          message: 'Email already exists for another agent'
        });
      }
    }

    // Update fields
    if (name) agent.name = name;
    if (email) agent.email = email.toLowerCase();
    if (phone) agent.phone = phone;
    if (assignedAreas !== undefined) agent.assignedAreas = assignedAreas;
    if (vehicleInfo) agent.vehicleInfo = { ...agent.vehicleInfo, ...vehicleInfo };
    if (workingHours) agent.workingHours = { ...agent.workingHours, ...workingHours };
    if (isActive !== undefined) agent.isActive = isActive;

    await agent.save();

    res.json({
      success: true,
      message: 'Delivery agent updated successfully',
      data: {
        id: agent._id,
        employeeId: agent.employeeId,
        name: agent.name,
        email: agent.email,
        phone: agent.phone,
        assignedAreas: agent.assignedAreas,
        vehicleInfo: agent.vehicleInfo,
        workingHours: agent.workingHours,
        isActive: agent.isActive
      }
    });

  } catch (error) {
    console.error('Update delivery agent error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update delivery agent'
    });
  }
};

// @desc    Deactivate delivery agent
// @route   DELETE /api/admin/delivery/agents/:agentId
// @access  Private (Admin)
export const deactivateDeliveryAgent = async (req, res) => {
  try {
    const { agentId } = req.params;

    // Find agent
    const agent = await DeliveryAgent.findById(agentId);

    if (!agent) {
      return res.status(404).json({
        success: false,
        message: 'Delivery agent not found'
      });
    }

    // Check for active orders
    const activeOrders = await Order.countDocuments({
      'delivery.agent': agentId,
      'delivery.status': { $in: ['assigned', 'dispatched', 'out_for_delivery'] }
    });

    if (activeOrders > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot deactivate agent. ${activeOrders} orders are still active.`,
        activeOrders
      });
    }

    // Deactivate agent
    agent.isActive = false;
    await agent.save();

    res.json({
      success: true,
      message: 'Delivery agent deactivated successfully'
    });

  } catch (error) {
    console.error('Deactivate delivery agent error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to deactivate delivery agent'
    });
  }
};

// @desc    Assign order to delivery agent
// @route   POST /api/admin/orders/:orderId/assign/:agentId
// @access  Private (Admin)
export const assignOrderToAgent = async (req, res) => {
  try {
    const { orderId, agentId } = req.params;
    const { deliverySlot } = req.body;

    // Find order
    const order = await Order.findById(orderId).populate('userId', 'name email phone');

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Check if order can be assigned
    if (!order.canAssignDeliveryAgent()) {
      return res.status(400).json({
        success: false,
        message: 'Order cannot be assigned in current status'
      });
    }

    // Find delivery agent
    const agent = await DeliveryAgent.findById(agentId);

    if (!agent) {
      return res.status(404).json({
        success: false,
        message: 'Delivery agent not found'
      });
    }

    if (!agent.isActive) {
      return res.status(400).json({
        success: false,
        message: 'Delivery agent is not active'
      });
    }

    // Assign order
    order.delivery.agent = agentId;
    order.delivery.status = 'assigned';
    order.delivery.assignedAt = new Date();

    // Set delivery slot if provided
    if (deliverySlot) {
      order.delivery.slot = {
        date: new Date(deliverySlot.date),
        startTime: deliverySlot.startTime,
        endTime: deliverySlot.endTime,
        timezone: deliverySlot.timezone || 'Asia/Kolkata'
      };
    }

    await order.save();

    // Send notification to customer
    try {
      await sendOrderStatusUpdateEmail(
        order.userId.email,
        order.userId.name,
        order._id,
        'assigned',
        `Your order has been assigned to our delivery agent ${agent.name}. You will receive further updates soon.`
      );

      await sendStatusUpdateNotification(
        order.userId.phone,
        order._id,
        'assigned',
        'Your order has been assigned to a delivery agent'
      );
    } catch (notificationError) {
      console.error('Failed to send assignment notifications:', notificationError);
    }

    res.json({
      success: true,
      message: 'Order assigned successfully',
      data: {
        orderId: order._id,
        agentId: agent._id,
        agentName: agent.name,
        deliveryStatus: order.delivery.status,
        assignedAt: order.delivery.assignedAt,
        deliverySlot: order.delivery.slot
      }
    });

  } catch (error) {
    console.error('Assign order error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to assign order to agent'
    });
  }
};

// @desc    Get unassigned orders
// @route   GET /api/admin/delivery/unassigned-orders
// @access  Private (Admin)
export const getUnassignedOrders = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Find unassigned orders
    const orders = await Order.find({
      $or: [
        { 'delivery.agent': { $exists: false } },
        { 'delivery.agent': null },
        { 'delivery.status': 'pending' }
      ],
      status: { $in: ['Pending', 'Shipped'] }
    })
    .populate('userId', 'name email phone')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit));

    // Get total count
    const totalOrders = await Order.countDocuments({
      $or: [
        { 'delivery.agent': { $exists: false } },
        { 'delivery.agent': null },
        { 'delivery.status': 'pending' }
      ],
      status: { $in: ['Pending', 'Shipped'] }
    });

    const totalPages = Math.ceil(totalOrders / parseInt(limit));

    // Format orders
    const formattedOrders = orders.map(order => ({
      id: order._id,
      orderNumber: order._id.toString().slice(-8).toUpperCase(),
      customer: {
        name: order.userId.name,
        phone: order.userId.phone,
        email: order.userId.email
      },
      shipping: order.shipping,
      totalAmount: order.totalAmount,
      paymentMethod: order.paymentMethod,
      status: order.status,
      deliverySlot: order.deliverySlot,
      placedAt: order.placedAt,
      itemCount: order.items.length
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
    console.error('Get unassigned orders error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch unassigned orders'
    });
  }
};

// @desc    Get delivery analytics
// @route   GET /api/admin/delivery/analytics
// @access  Private (Admin)
export const getDeliveryAnalytics = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    // Set default date range (last 30 days)
    const end = endDate ? new Date(endDate) : new Date();
    const start = startDate ? new Date(startDate) : new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Get total orders in date range
    const totalOrders = await Order.countDocuments({
      'delivery.assignedAt': { $gte: start, $lte: end }
    });

    const deliveredOrders = await Order.countDocuments({
      'delivery.status': 'delivered',
      'delivery.deliveredAt': { $gte: start, $lte: end }
    });

    const pendingOrders = await Order.countDocuments({
      'delivery.status': { $in: ['assigned', 'dispatched', 'out_for_delivery'] }
    });

    const failedOrders = await Order.countDocuments({
      'delivery.status': 'failed',
      'delivery.failedAt': { $gte: start, $lte: end }
    });

    // Calculate delivery success rate
    const successRate = totalOrders > 0 ? (deliveredOrders / totalOrders) * 100 : 0;

    // Get agent performance
    const agents = await DeliveryAgent.find({ isActive: true }).select('name deliveryStats');

    // Get orders with violations
    const violatedOrders = await Order.countDocuments({
      'delivery.attempts.violation.isViolation': true,
      'delivery.assignedAt': { $gte: start, $lte: end }
    });

    // Average delivery time (for delivered orders)
    const deliveryTimes = await Order.aggregate([
      {
        $match: {
          'delivery.status': 'delivered',
          'delivery.deliveredAt': { $gte: start, $lte: end },
          'delivery.assignedAt': { $exists: true }
        }
      },
      {
        $project: {
          deliveryTime: {
            $divide: [
              { $subtract: ['$delivery.deliveredAt', '$delivery.assignedAt'] },
              1000 * 60 * 60 // Convert to hours
            ]
          }
        }
      },
      {
        $group: {
          _id: null,
          averageHours: { $avg: '$deliveryTime' }
        }
      }
    ]);

    const averageDeliveryTime = deliveryTimes.length > 0 ? deliveryTimes[0].averageHours : 0;

    res.json({
      success: true,
      data: {
        overview: {
          totalOrders,
          deliveredOrders,
          pendingOrders,
          failedOrders,
          successRate: Math.round(successRate * 100) / 100,
          violatedOrders,
          averageDeliveryTimeHours: Math.round(averageDeliveryTime * 100) / 100
        },
        agents: agents.map(agent => ({
          id: agent._id,
          name: agent.name,
          performance: agent.getPerformanceSummary()
        })),
        dateRange: {
          start,
          end
        }
      }
    });

  } catch (error) {
    console.error('Get delivery analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch delivery analytics'
    });
  }
};

export default {
  createDeliveryAgent,
  getDeliveryAgents,
  updateDeliveryAgent,
  deactivateDeliveryAgent,
  assignOrderToAgent,
  getUnassignedOrders,
  getDeliveryAnalytics
};
