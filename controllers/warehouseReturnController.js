import Return from '../models/Return.js';
import Order from '../models/Order.js';
import DeliveryAgent from '../models/DeliveryAgent.js';
import { 
  sendPickupAssignmentNotification,
  sendPickupStartedNotification,
  sendRefundRecommendationNotification 
} from '../services/communicationService.js';

// Warehouse Manager Return Management (Primary Controller)

// Get Assigned Returns
export const getAssignedReturns = async (req, res) => {
  try {
    const warehouseManagerId = req.user.id;
    const { page = 1, limit = 20, status = 'all' } = req.query;

    const query = { 'warehouseManagement.assignedManager': warehouseManagerId };
    
    if (status !== 'all') {
      query.status = status;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const returns = await Return.find(query)
      .populate('orderId', 'totalAmount status placedAt')
      .populate('customerId', 'name email phone')
      .populate('warehouseManagement.pickup.assignedAgent', 'name phone')
      .sort({ 'warehouseManagement.assignedAt': -1 })
      .limit(parseInt(limit))
      .skip(skip);

    const totalReturns = await Return.countDocuments(query);
    const totalPages = Math.ceil(totalReturns / parseInt(limit));

    // Calculate summary
    const summary = await Return.aggregate([
      { $match: query },
      {
        $group: {
          _id: null,
          pendingPickup: {
            $sum: {
              $cond: [
                { $in: ['$status', ['warehouse_assigned', 'pickup_scheduled']] },
                1,
                0
              ]
            }
          },
          inProgress: {
            $sum: {
              $cond: [
                { $in: ['$status', ['picked_up', 'in_warehouse']] },
                1,
                0
              ]
            }
          },
          pendingAssessment: {
            $sum: {
              $cond: [
                { $eq: ['$status', 'in_warehouse'] },
                1,
                0
              ]
            }
          }
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        returns: returns,
        pagination: {
          currentPage: parseInt(page),
          totalPages: totalPages,
          totalReturns: totalReturns,
          limit: parseInt(limit)
        },
        summary: summary[0] || {
          pendingPickup: 0,
          inProgress: 0,
          pendingAssessment: 0
        }
      }
    });

  } catch (error) {
    console.error('Error fetching assigned returns:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch assigned returns',
      error: error.message
    });
  }
};

// Update Return Status
export const updateReturnStatus = async (req, res) => {
  try {
    const warehouseManagerId = req.user.id;
    const { returnId } = req.params;
    const { status, notes, updateData = {} } = req.body;

    const returnRequest = await Return.findById(returnId);
    if (!returnRequest) {
      return res.status(404).json({
        success: false,
        message: 'Return request not found'
      });
    }

    // Check if warehouse manager owns this return
    if (returnRequest.warehouseManagement.assignedManager.toString() !== warehouseManagerId) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized: Return not assigned to you'
      });
    }

    // Validate status transition
    const validTransitions = {
      'warehouse_assigned': ['pickup_scheduled'],
      'pickup_scheduled': ['picked_up'],
      'picked_up': ['in_warehouse'],
      'in_warehouse': ['quality_checked']
    };

    const currentStatus = returnRequest.status;
    if (!validTransitions[currentStatus]?.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status transition from ${currentStatus} to ${status}`
      });
    }

    // Handle specific status updates
    switch (status) {
      case 'pickup_scheduled':
        if (!updateData.scheduledDate || !updateData.scheduledSlot) {
          return res.status(400).json({
            success: false,
            message: 'Scheduled date and slot are required for pickup scheduling'
          });
        }
        
        returnRequest.warehouseManagement.pickup.scheduledDate = new Date(updateData.scheduledDate);
        returnRequest.warehouseManagement.pickup.scheduledSlot = updateData.scheduledSlot;
        returnRequest.warehouseManagement.pickup.pickupStatus = 'scheduled';
        break;

      case 'picked_up':
        returnRequest.warehouseManagement.pickup.pickedUpAt = new Date();
        returnRequest.warehouseManagement.pickup.pickupStatus = 'completed';
        if (updateData.pickupNotes) {
          returnRequest.warehouseManagement.pickup.pickupNotes = updateData.pickupNotes;
        }
        break;

      case 'in_warehouse':
        if (updateData.receivedAt) {
          returnRequest.warehouseManagement.qualityAssessment.receivedAt = new Date(updateData.receivedAt);
        }
        break;

      case 'quality_checked':
        // Quality assessment should be done separately
        if (!returnRequest.warehouseManagement.qualityAssessment.assessedAt) {
          return res.status(400).json({
            success: false,
            message: 'Quality assessment must be completed before marking as quality_checked'
          });
        }
        break;
    }

    // Update status with history
    returnRequest.updateStatus(status, warehouseManagerId, notes || `Status updated to ${status}`);
    await returnRequest.save();

    // Get updated timeline
    const timeline = returnRequest.warehouseManagement.statusUpdates.map(update => ({
      status: update.toStatus,
      date: update.updatedAt,
      notes: update.notes,
      updatedBy: update.updatedBy,
      autoUpdate: update.autoUpdate
    }));

    res.json({
      success: true,
      data: {
        return: returnRequest,
        timeline: timeline
      }
    });

  } catch (error) {
    console.error('Error updating return status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update return status',
      error: error.message
    });
  }
};

// Assign Delivery Agent for Pickup
export const assignAgentForPickup = async (req, res) => {
  try {
    const warehouseManagerId = req.user.id;
    const { returnId } = req.params;
    const { agentId, scheduledDate, scheduledSlot, pickupNotes } = req.body;

    const returnRequest = await Return.findById(returnId);
    if (!returnRequest) {
      return res.status(404).json({
        success: false,
        message: 'Return request not found'
      });
    }

    // Check ownership
    if (returnRequest.warehouseManagement.assignedManager.toString() !== warehouseManagerId) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized: Return not assigned to you'
      });
    }

    // Check if return is in correct status
    if (returnRequest.status !== 'warehouse_assigned' && returnRequest.status !== 'pickup_scheduled') {
      return res.status(400).json({
        success: false,
        message: 'Return must be in warehouse_assigned or pickup_scheduled status'
      });
    }

    // Validate agent
    const agent = await DeliveryAgent.findById(agentId);
    if (!agent) {
      return res.status(404).json({
        success: false,
        message: 'Delivery agent not found'
      });
    }

    // Update pickup details
    returnRequest.warehouseManagement.pickup = {
      ...returnRequest.warehouseManagement.pickup,
      method: 'agent_assigned',
      assignedAgent: agentId,
      scheduledDate: new Date(scheduledDate),
      scheduledSlot: scheduledSlot,
      pickupNotes: pickupNotes || '',
      pickupStatus: 'scheduled'
    };

    // Update status if not already scheduled
    if (returnRequest.status === 'warehouse_assigned') {
      returnRequest.updateStatus('pickup_scheduled', warehouseManagerId, 'Agent assigned and pickup scheduled');
    }

    await returnRequest.save();

    // Send notification to agent
    await sendPickupAssignmentNotification(agent, returnRequest);

    res.json({
      success: true,
      data: {
        return: returnRequest,
        agent: {
          id: agent._id,
          name: agent.name,
          phone: agent.phone
        },
        notification: 'Agent assigned and pickup scheduled successfully'
      }
    });

  } catch (error) {
    console.error('Error assigning agent for pickup:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to assign agent for pickup',
      error: error.message
    });
  }
};

// Schedule Pickup (With or Without Agent)
export const schedulePickup = async (req, res) => {
  try {
    const warehouseManagerId = req.user.id;
    const { returnId } = req.params;
    const { method, scheduledDate, scheduledSlot, agentId, notes } = req.body;

    const returnRequest = await Return.findById(returnId);
    if (!returnRequest) {
      return res.status(404).json({
        success: false,
        message: 'Return request not found'
      });
    }

    // Check ownership
    if (returnRequest.warehouseManagement.assignedManager.toString() !== warehouseManagerId) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized: Return not assigned to you'
      });
    }

    // Validate method
    const validMethods = ['agent_assigned', 'direct_warehouse', 'customer_dropoff'];
    if (!validMethods.includes(method)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid pickup method'
      });
    }

    // If agent assigned, validate agent
    if (method === 'agent_assigned') {
      if (!agentId) {
        return res.status(400).json({
          success: false,
          message: 'Agent ID is required for agent_assigned method'
        });
      }

      const agent = await DeliveryAgent.findById(agentId);
      if (!agent) {
        return res.status(404).json({
          success: false,
          message: 'Delivery agent not found'
        });
      }
    }

    // Update pickup details
    const pickupDetails = {
      method: method,
      scheduledDate: scheduledDate ? new Date(scheduledDate) : null,
      scheduledSlot: scheduledSlot,
      pickupNotes: notes || '',
      pickupStatus: 'scheduled'
    };

    if (method === 'agent_assigned' && agentId) {
      pickupDetails.assignedAgent = agentId;
    }

    returnRequest.warehouseManagement.pickup = {
      ...returnRequest.warehouseManagement.pickup,
      ...pickupDetails
    };

    // Update status
    returnRequest.updateStatus('pickup_scheduled', warehouseManagerId, `Pickup scheduled via ${method}`);
    await returnRequest.save();

    res.json({
      success: true,
      data: {
        return: returnRequest,
        pickupDetails: returnRequest.warehouseManagement.pickup
      }
    });

  } catch (error) {
    console.error('Error scheduling pickup:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to schedule pickup',
      error: error.message
    });
  }
};

// Mark Items Received at Warehouse
export const markItemsReceived = async (req, res) => {
  try {
    const warehouseManagerId = req.user.id;
    const { returnId } = req.params;
    const { receivedAt, condition, notes, receivedImages = [] } = req.body;

    const returnRequest = await Return.findById(returnId);
    if (!returnRequest) {
      return res.status(404).json({
        success: false,
        message: 'Return request not found'
      });
    }

    // Check ownership
    if (returnRequest.warehouseManagement.assignedManager.toString() !== warehouseManagerId) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized: Return not assigned to you'
      });
    }

    // Check status
    if (returnRequest.status !== 'picked_up') {
      return res.status(400).json({
        success: false,
        message: 'Items must be picked up before marking as received'
      });
    }

    // Update quality assessment with receipt details
    returnRequest.warehouseManagement.qualityAssessment = {
      ...returnRequest.warehouseManagement.qualityAssessment,
      receivedAt: receivedAt ? new Date(receivedAt) : new Date(),
      initialCondition: condition,
      receivedNotes: notes,
      receivedImages: receivedImages
    };

    // Update status
    returnRequest.updateStatus('in_warehouse', warehouseManagerId, notes || 'Items received at warehouse');
    await returnRequest.save();

    res.json({
      success: true,
      data: {
        return: returnRequest,
        message: 'Items marked as received at warehouse'
      }
    });

  } catch (error) {
    console.error('Error marking items as received:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to mark items as received',
      error: error.message
    });
  }
};

// Complete Quality Assessment
export const completeQualityAssessment = async (req, res) => {
  try {
    const warehouseManagerId = req.user.id;
    const { returnId } = req.params;
    const {
      itemCondition,
      refundEligibility,
      refundPercentage,
      warehouseNotes,
      qualityImages = [],
      conditionDetails,
      restockDecision
    } = req.body;

    const returnRequest = await Return.findById(returnId);
    if (!returnRequest) {
      return res.status(404).json({
        success: false,
        message: 'Return request not found'
      });
    }

    // Check ownership
    if (returnRequest.warehouseManagement.assignedManager.toString() !== warehouseManagerId) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized: Return not assigned to you'
      });
    }

    // Check status
    if (returnRequest.status !== 'in_warehouse') {
      return res.status(400).json({
        success: false,
        message: 'Items must be in warehouse before quality assessment'
      });
    }

    // Validate inputs
    const validConditions = ['excellent', 'good', 'fair', 'poor', 'damaged', 'unusable'];
    const validEligibility = ['full', 'partial', 'none'];

    if (!validConditions.includes(itemCondition)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid item condition'
      });
    }

    if (!validEligibility.includes(refundEligibility)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid refund eligibility'
      });
    }

    if (refundPercentage < 0 || refundPercentage > 100) {
      return res.status(400).json({
        success: false,
        message: 'Refund percentage must be between 0 and 100'
      });
    }

    // Complete quality assessment
    returnRequest.warehouseManagement.qualityAssessment = {
      ...returnRequest.warehouseManagement.qualityAssessment,
      assessedAt: new Date(),
      itemCondition: itemCondition,
      refundEligibility: refundEligibility,
      refundPercentage: refundPercentage,
      warehouseNotes: warehouseNotes,
      qualityImages: qualityImages,
      conditionDetails: conditionDetails,
      restockDecision: restockDecision
    };

    // Update status
    returnRequest.updateStatus('quality_checked', warehouseManagerId, 'Quality assessment completed');
    await returnRequest.save();

    // Calculate refund recommendation
    const refundCalculation = returnRequest.calculateRefund(refundPercentage);

    res.json({
      success: true,
      data: {
        return: returnRequest,
        refundRecommendation: {
          originalAmount: refundCalculation.originalAmount,
          recommendedAmount: refundCalculation.refundAmount,
          recommendedCoins: refundCalculation.coinRefund,
          percentage: refundPercentage,
          condition: itemCondition,
          eligibility: refundEligibility
        }
      }
    });

  } catch (error) {
    console.error('Error completing quality assessment:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to complete quality assessment',
      error: error.message
    });
  }
};

// Submit Refund Recommendation
export const submitRefundRecommendation = async (req, res) => {
  try {
    const warehouseManagerId = req.user.id;
    const { returnId } = req.params;
    const { recommendation, recommendedAmount, warehouseNotes } = req.body;

    const returnRequest = await Return.findById(returnId);
    if (!returnRequest) {
      return res.status(404).json({
        success: false,
        message: 'Return request not found'
      });
    }

    // Check ownership
    if (returnRequest.warehouseManagement.assignedManager.toString() !== warehouseManagerId) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized: Return not assigned to you'
      });
    }

    // Check status
    if (returnRequest.status !== 'quality_checked') {
      return res.status(400).json({
        success: false,
        message: 'Quality assessment must be completed first'
      });
    }

    // Validate recommendation
    const validRecommendations = ['approve_full', 'approve_partial', 'reject'];
    if (!validRecommendations.includes(recommendation)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid recommendation'
      });
    }

    // Calculate amounts
    const fullRefundAmount = returnRequest.calculateRefund().refundAmount;
    let finalRecommendedAmount = recommendedAmount;

    if (recommendation === 'approve_full') {
      finalRecommendedAmount = fullRefundAmount;
    } else if (recommendation === 'reject') {
      finalRecommendedAmount = 0;
    }

    const recommendedCoins = finalRecommendedAmount * 5; // 1 Rupee = 5 Coins

    // Submit recommendation
    returnRequest.refund.warehouseRecommendation = {
      recommendedAmount: finalRecommendedAmount,
      recommendedCoins: recommendedCoins,
      recommendation: recommendation,
      warehouseNotes: warehouseNotes,
      recommendedAt: new Date()
    };

    await returnRequest.save();

    // Send notification to admin for final approval
    await sendRefundRecommendationNotification(returnRequest);

    res.json({
      success: true,
      data: {
        return: returnRequest,
        notification: 'Refund recommendation submitted to admin for final approval'
      }
    });

  } catch (error) {
    console.error('Error submitting refund recommendation:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to submit refund recommendation',
      error: error.message
    });
  }
};

// Get Quality Assessment History
export const getAssessmentHistory = async (req, res) => {
  try {
    const warehouseManagerId = req.user.id;
    const { page = 1, limit = 20 } = req.query;

    const query = {
      'warehouseManagement.assignedManager': warehouseManagerId,
      'warehouseManagement.qualityAssessment.assessedAt': { $exists: true }
    };

    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const assessments = await Return.find(query)
      .populate('orderId', 'totalAmount')
      .populate('customerId', 'name')
      .select('returnRequestId warehouseManagement.qualityAssessment refund.warehouseRecommendation status')
      .sort({ 'warehouseManagement.qualityAssessment.assessedAt': -1 })
      .limit(parseInt(limit))
      .skip(skip);

    const totalAssessments = await Return.countDocuments(query);
    const totalPages = Math.ceil(totalAssessments / parseInt(limit));

    // Calculate performance metrics
    const performance = await Return.aggregate([
      { $match: query },
      {
        $group: {
          _id: null,
          totalAssessments: { $sum: 1 },
          avgRefundPercentage: {
            $avg: '$warehouseManagement.qualityAssessment.refundPercentage'
          },
          conditionBreakdown: {
            $push: '$warehouseManagement.qualityAssessment.itemCondition'
          },
          recommendationBreakdown: {
            $push: '$refund.warehouseRecommendation.recommendation'
          }
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        assessments: assessments,
        pagination: {
          currentPage: parseInt(page),
          totalPages: totalPages,
          totalAssessments: totalAssessments,
          limit: parseInt(limit)
        },
        performance: performance[0] || {
          totalAssessments: 0,
          avgRefundPercentage: 0,
          conditionBreakdown: [],
          recommendationBreakdown: []
        }
      }
    });

  } catch (error) {
    console.error('Error fetching assessment history:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch assessment history',
      error: error.message
    });
  }
};

// Get Status Update History
export const getStatusHistory = async (req, res) => {
  try {
    const { returnId } = req.params;

    const returnRequest = await Return.findById(returnId)
      .populate('warehouseManagement.statusUpdates.updatedBy', 'name email');

    if (!returnRequest) {
      return res.status(404).json({
        success: false,
        message: 'Return request not found'
      });
    }

    const timeline = returnRequest.warehouseManagement.statusUpdates.map(update => ({
      fromStatus: update.fromStatus,
      toStatus: update.toStatus,
      date: update.updatedAt,
      updatedBy: update.updatedBy,
      notes: update.notes,
      autoUpdate: update.autoUpdate
    }));

    // Determine next possible actions based on current status
    const nextPossibleActions = getNextPossibleActions(returnRequest.status);

    res.json({
      success: true,
      data: {
        timeline: timeline,
        currentStatus: returnRequest.status,
        nextPossibleActions: nextPossibleActions
      }
    });

  } catch (error) {
    console.error('Error fetching status history:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch status history',
      error: error.message
    });
  }
};

// Bulk Status Update
export const bulkStatusUpdate = async (req, res) => {
  try {
    const warehouseManagerId = req.user.id;
    const { returnIds, status, notes } = req.body;

    if (!returnIds || !Array.isArray(returnIds) || returnIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Return IDs array is required'
      });
    }

    const results = [];
    let updated = 0;
    let failed = 0;

    for (const returnId of returnIds) {
      try {
        const returnRequest = await Return.findById(returnId);
        
        if (!returnRequest || 
            returnRequest.warehouseManagement.assignedManager.toString() !== warehouseManagerId) {
          results.push({
            returnId: returnId,
            success: false,
            error: 'Return not found or not authorized'
          });
          failed++;
          continue;
        }

        // Validate status transition (simplified for bulk)
        returnRequest.updateStatus(status, warehouseManagerId, notes || `Bulk update to ${status}`);
        await returnRequest.save();

        results.push({
          returnId: returnId,
          success: true,
          newStatus: status
        });
        updated++;

      } catch (error) {
        console.error(`Error updating return ${returnId}:`, error);
        results.push({
          returnId: returnId,
          success: false,
          error: error.message
        });
        failed++;
      }
    }

    res.json({
      success: true,
      data: {
        updated: updated,
        failed: failed,
        results: results
      }
    });

  } catch (error) {
    console.error('Error bulk updating status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to bulk update status',
      error: error.message
    });
  }
};

// Helper Functions

const getNextPossibleActions = (currentStatus) => {
  const statusActions = {
    'warehouse_assigned': ['Schedule Pickup', 'Assign Agent'],
    'pickup_scheduled': ['Mark as Picked Up', 'Reschedule Pickup'],
    'picked_up': ['Mark as Received in Warehouse'],
    'in_warehouse': ['Complete Quality Assessment'],
    'quality_checked': ['Submit Refund Recommendation'],
    'refund_approved': ['Items processed - awaiting admin'],
    'completed': ['No further actions']
  };

  return statusActions[currentStatus] || [];
};
