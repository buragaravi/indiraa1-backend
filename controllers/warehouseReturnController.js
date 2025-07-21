import Return from '../models/Return.js';
import Order from '../models/Order.js';
import User from '../models/User.js';
import Transaction from '../models/Transaction.js';
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

// Get Unassigned Returns for Review (for warehouse managers)
export const getUnassignedReturns = async (req, res) => {
  try {
    const { page = 1, limit = 20, status = 'all' } = req.query;

    // Query for returns that are in requested or admin_review status (available for warehouse manager approval)
    const query = {
      status: { $in: ['requested', 'admin_review'] }
    };
    
    if (status !== 'all') {
      query.status = status;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const returns = await Return.find(query)
      .populate('orderId', 'totalAmount status placedAt')
      .populate('customerId', 'name email phone')
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
    console.error('Error fetching unassigned returns:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch unassigned returns',
      error: error.message
    });
  }
};

// Review Return Request (warehouse managers can approve/reject like admins)
export const reviewReturnRequest = async (req, res) => {
  try {
    const warehouseManagerId = req.user.id;
    const { returnId } = req.params;
    const { decision, comments, pickupCharge } = req.body;

    const returnRequest = await Return.findById(returnId);
    if (!returnRequest) {
      return res.status(404).json({
        success: false,
        message: 'Return request not found'
      });
    }

    // Check if this return can be reviewed by warehouse manager
    // Allow warehouse managers to review returns in requested or admin_review status
    if (!['requested', 'admin_review'].includes(returnRequest.status)) {
      return res.status(400).json({
        success: false,
        message: 'Return request cannot be reviewed at this stage'
      });
    }

    // Update review information
    returnRequest.warehouseManagement.reviewedBy = warehouseManagerId;
    returnRequest.warehouseManagement.reviewedAt = new Date();
    returnRequest.warehouseManagement.approved = decision === 'approve';
    returnRequest.warehouseManagement.comments = comments;

    // Update pickup charge if provided
    if (pickupCharge) {
      returnRequest.warehouseManagement.pickupCharge = {
        isFree: pickupCharge.isFree,
        amount: pickupCharge.isFree ? 0 : 50,
        reason: pickupCharge.reason,
        toggledBy: warehouseManagerId,
        toggledAt: new Date()
      };
    }

    if (decision === 'approve') {
      // Update status - warehouse manager approval
      returnRequest.updateStatus('approved', warehouseManagerId, 'Return request approved by warehouse manager');
      returnRequest.updateStatus('warehouse_assigned', warehouseManagerId, 'Assigned to warehouse manager', true);
      
      // Assign to this warehouse manager
      returnRequest.warehouseManagement.assignedManager = warehouseManagerId;
      returnRequest.warehouseManagement.assignedAt = new Date();
    } else {
      // Reject the return
      returnRequest.updateStatus('rejected', warehouseManagerId, comments || 'Return request rejected by warehouse manager');
    }

    await returnRequest.save();

    // Send notifications
    if (decision === 'approve') {
      console.log(`Warehouse approval notification: Return ${returnRequest.returnRequestId} approved by warehouse manager ${warehouseManagerId}`);
    } else {
      console.log(`Warehouse rejection notification: Return ${returnRequest.returnRequestId} rejected by warehouse manager ${warehouseManagerId}`);
    }

    res.json({
      success: true,
      message: `Return request ${decision === 'approve' ? 'approved' : 'rejected'} successfully`,
      data: { returnRequest }
    });

  } catch (error) {
    console.error('Error reviewing return request:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to review return request',
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
    // Removed assignedManager check - warehouse managers can work on any returns
    // if (returnRequest.warehouseManagement.assignedManager.toString() !== warehouseManagerId) {
    //   return res.status(403).json({
    //     success: false,
    //     message: 'Unauthorized: Return not assigned to you'
    //   });
    // }

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

    // Check ownership - removed assignedManager check
    // Warehouse managers can now work on any returns
    // if (returnRequest.warehouseManagement.assignedManager.toString() !== warehouseManagerId) {
    //   return res.status(403).json({
    //     success: false,
    //     message: 'Unauthorized: Return not assigned to you'
    //   });
    // }

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

    // Update pickup details using set method to avoid validation issues
    returnRequest.set('warehouseManagement.pickup.method', method);
    returnRequest.set('warehouseManagement.pickup.pickupStatus', 'scheduled');
    returnRequest.set('warehouseManagement.pickup.pickupNotes', notes || '');

    if (scheduledDate) {
      returnRequest.set('warehouseManagement.pickup.scheduledDate', new Date(scheduledDate));
    }

    if (scheduledSlot) {
      returnRequest.set('warehouseManagement.pickup.scheduledSlot', scheduledSlot);
    }

    if (method === 'agent_assigned' && agentId) {
      returnRequest.set('warehouseManagement.pickup.assignedAgent', agentId);
    }

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

    // Check ownership - removed assignedManager check
    // Warehouse managers can now work on any returns
    // if (returnRequest.warehouseManagement.assignedManager.toString() !== warehouseManagerId) {
    //   return res.status(403).json({
    //     success: false,
    //     message: 'Unauthorized: Return not assigned to you'
    //   });
    // }

    // Check status
    if (returnRequest.status !== 'picked_up') {
      return res.status(400).json({
        success: false,
        message: 'Items must be picked up before marking as received'
      });
    }

    // Update quality assessment with receipt details - avoid spreading undefined values
    const currentQualityAssessment = returnRequest.warehouseManagement.qualityAssessment || {};
    
    // Only set the specific fields we're updating
    returnRequest.set('warehouseManagement.qualityAssessment.receivedAt', receivedAt ? new Date(receivedAt) : new Date());
    returnRequest.set('warehouseManagement.qualityAssessment.initialCondition', condition);
    returnRequest.set('warehouseManagement.qualityAssessment.receivedNotes', notes);
    returnRequest.set('warehouseManagement.qualityAssessment.receivedImages', receivedImages);

    // Preserve existing assessment data if it exists
    if (currentQualityAssessment.assessedAt) {
      returnRequest.set('warehouseManagement.qualityAssessment.assessedAt', currentQualityAssessment.assessedAt);
    }
    if (currentQualityAssessment.itemCondition) {
      returnRequest.set('warehouseManagement.qualityAssessment.itemCondition', currentQualityAssessment.itemCondition);
    }
    if (currentQualityAssessment.refundEligibility) {
      returnRequest.set('warehouseManagement.qualityAssessment.refundEligibility', currentQualityAssessment.refundEligibility);
    }
    if (currentQualityAssessment.refundPercentage) {
      returnRequest.set('warehouseManagement.qualityAssessment.refundPercentage', currentQualityAssessment.refundPercentage);
    }
    if (currentQualityAssessment.warehouseNotes) {
      returnRequest.set('warehouseManagement.qualityAssessment.warehouseNotes', currentQualityAssessment.warehouseNotes);
    }

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

    // Check ownership - removed assignedManager check
    // Warehouse managers can now work on any returns  
    // if (returnRequest.warehouseManagement.assignedManager.toString() !== warehouseManagerId) {
    //   return res.status(403).json({
    //     success: false,
    //     message: 'Unauthorized: Return not assigned to you'
    //   });
    // }

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

    // Complete quality assessment - avoid spreading undefined values
    const currentQualityAssessment = returnRequest.warehouseManagement.qualityAssessment || {};
    
    // Set the specific fields we're updating
    returnRequest.set('warehouseManagement.qualityAssessment.assessedAt', new Date());
    returnRequest.set('warehouseManagement.qualityAssessment.itemCondition', itemCondition);
    returnRequest.set('warehouseManagement.qualityAssessment.refundEligibility', refundEligibility);
    returnRequest.set('warehouseManagement.qualityAssessment.refundPercentage', refundPercentage);
    returnRequest.set('warehouseManagement.qualityAssessment.warehouseNotes', warehouseNotes);
    returnRequest.set('warehouseManagement.qualityAssessment.qualityImages', qualityImages);
    
    // Set conditionDetails object if provided
    if (conditionDetails && typeof conditionDetails === 'object') {
      returnRequest.set('warehouseManagement.qualityAssessment.conditionDetails', conditionDetails);
    }
    
    // Set restockDecision object if provided
    if (restockDecision && typeof restockDecision === 'object') {
      returnRequest.set('warehouseManagement.qualityAssessment.restockDecision', restockDecision);
    }

    // Preserve existing assessment data if it exists
    if (currentQualityAssessment.receivedAt) {
      returnRequest.set('warehouseManagement.qualityAssessment.receivedAt', currentQualityAssessment.receivedAt);
    }
    if (currentQualityAssessment.initialCondition) {
      returnRequest.set('warehouseManagement.qualityAssessment.initialCondition', currentQualityAssessment.initialCondition);
    }
    if (currentQualityAssessment.receivedNotes) {
      returnRequest.set('warehouseManagement.qualityAssessment.receivedNotes', currentQualityAssessment.receivedNotes);
    }
    if (currentQualityAssessment.receivedImages) {
      returnRequest.set('warehouseManagement.qualityAssessment.receivedImages', currentQualityAssessment.receivedImages);
    }

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

// Make Final Refund Decision (same as admin functionality)
export const makeFinalRefundDecision = async (req, res) => {
  try {
    const warehouseManagerId = req.user.id;
    const { returnId } = req.params;
    const { decision, finalAmount, deductions = [], adminNotes } = req.body;

    const returnRequest = await Return.findById(returnId)
      .populate('customerId', 'name email wallet')
      .populate('orderId', 'totalAmount');

    if (!returnRequest) {
      return res.status(404).json({
        success: false,
        message: 'Return request not found'
      });
    }

    // Check if warehouse manager owns this return  
    // Removed assignedManager check - warehouse managers can now work on any returns
    // if (returnRequest.warehouseManagement.assignedManager.toString() !== warehouseManagerId) {
    //   return res.status(403).json({
    //     success: false,
    //     message: 'Unauthorized: Return not assigned to you'
    //   });
    // }

    // Check if quality assessment completed
    if (!returnRequest.warehouseManagement.qualityAssessment?.assessedAt) {
      return res.status(400).json({
        success: false,
        message: 'Quality assessment must be completed before final decision'
      });
    }

    const originalRefund = returnRequest.calculateRefund();
    console.log(`Original refund calculation:`, originalRefund);
    
    let calculatedFinalAmount = finalAmount;
    if (!calculatedFinalAmount) {
      const refundPercentage = returnRequest.warehouseManagement.qualityAssessment.refundPercentage;
      console.log(`Using refund percentage from quality assessment: ${refundPercentage}%`);
      
      if (isNaN(refundPercentage) || refundPercentage === undefined || refundPercentage === null) {
        return res.status(400).json({
          success: false,
          message: 'Invalid refund percentage in quality assessment'
        });
      }
      calculatedFinalAmount = originalRefund.refundAmount * (refundPercentage / 100);
      console.log(`Calculated final amount: ${calculatedFinalAmount} (${refundPercentage}% of ${originalRefund.refundAmount})`);
    }
    
    // Validate calculated final amount
    if (isNaN(calculatedFinalAmount)) {
      return res.status(400).json({
        success: false,
        message: 'Error calculating final refund amount'
      });
    }

    // Apply deductions (including pickup charges)
    const totalDeductions = deductions.reduce((sum, deduction) => {
      const amount = Number(deduction.amount || 0);
      return sum + (isNaN(amount) ? 0 : amount);
    }, 0);
    
    // Add pickup charge if applicable
    let pickupChargeAmount = 0;
    const pickupCharge = returnRequest.adminReview?.pickupCharge || returnRequest.warehouseManagement?.pickupCharge;
    
    if (pickupCharge && !pickupCharge.isFree) {
      pickupChargeAmount = Number(pickupCharge.amount || 50); // Default 50 rupees
      if (isNaN(pickupChargeAmount)) {
        pickupChargeAmount = 50; // Fallback to default
      }
      deductions.push({
        type: 'pickup_charge',
        amount: pickupChargeAmount,
        reason: pickupCharge.reason || 'Return pickup charge',
        calculatedAt: new Date()
      });
    }
    
    const finalDeductions = totalDeductions + pickupChargeAmount;
    const finalRefundAmount = Math.max(0, calculatedFinalAmount - finalDeductions);
    const finalCoins = finalRefundAmount * 5; // 1 Rupee = 5 Coins

    console.log(`Final refund calculation:
      - Calculated Amount: ${calculatedFinalAmount}
      - Total Deductions: ${totalDeductions}
      - Pickup Charge: ${pickupChargeAmount}
      - Final Deductions: ${finalDeductions}
      - Final Refund Amount: ${finalRefundAmount}
      - Final Coins: ${finalCoins}
    `);

    // Validate final calculations
    if (isNaN(finalRefundAmount) || isNaN(finalCoins)) {
      console.error('Invalid final calculations:', {
        calculatedFinalAmount,
        totalDeductions,
        pickupChargeAmount,
        finalRefundAmount,
        finalCoins
      });
      return res.status(400).json({
        success: false,
        message: 'Error in final refund calculations. Please check all input values.'
      });
    }

    // Update refund decision using the official schema field
    returnRequest.refund.adminDecision = {
      decision: decision,
      finalAmount: finalRefundAmount,
      finalCoins: finalCoins,
      adminNotes: adminNotes,
      decidedAt: new Date(),
      decidedBy: warehouseManagerId,
      deductions: deductions.map(d => ({
        ...d,
        calculatedAt: d.calculatedAt || new Date()
      }))
    };

    if (decision === 'approved') {
      returnRequest.updateStatus('refund_approved', warehouseManagerId, 'Refund approved by warehouse manager');
    } else {
      returnRequest.updateStatus('rejected', warehouseManagerId, 'Refund rejected by warehouse manager');
    }

    await returnRequest.save();

    // Calculate refund breakdown
    const refundCalculation = {
      originalAmount: originalRefund.originalAmount,
      warehouseRecommendation: returnRequest.refund.warehouseRecommendation?.recommendedAmount,
      totalDeductions: finalDeductions,
      pickupCharge: pickupChargeAmount,
      finalRefundAmount: finalRefundAmount,
      finalCoins: finalCoins,
      deductions: deductions
    };

    res.json({
      success: true,
      data: {
        return: returnRequest,
        refundCalculation: refundCalculation
      }
    });

  } catch (error) {
    console.error('Error making final refund decision:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to make final refund decision',
      error: error.message
    });
  }
};

// Process Refund (same as admin functionality)
export const processRefund = async (req, res) => {
  try {
    const warehouseManagerId = req.user.id;
    const { returnId } = req.params;

    const returnRequest = await Return.findById(returnId)
      .populate('customerId', 'name email wallet')
      .populate('orderId', 'totalAmount');

    if (!returnRequest) {
      return res.status(404).json({
        success: false,
        message: 'Return request not found'
      });
    }

    // Check if warehouse manager owns this return
    // Removed assignedManager check - warehouse managers can now work on any returns
    // if (returnRequest.warehouseManagement.assignedManager.toString() !== warehouseManagerId) {
    //   return res.status(403).json({
    //     success: false,
    //     message: 'Unauthorized: Return not assigned to you'
    //   });
    // }

    // Check if refund is approved
    if (returnRequest.status !== 'refund_approved') {
      return res.status(400).json({
        success: false,
        message: 'Refund must be approved before processing'
      });
    }

    // Check if already processed
    if (returnRequest.refund.processing?.processingStatus === 'completed') {
      return res.status(400).json({
        success: false,
        message: 'Refund has already been processed'
      });
    }

    // Check if refund decision exists
    if (!returnRequest.refund.adminDecision) {
      return res.status(400).json({
        success: false,
        message: 'No refund decision found. Please complete the final refund decision first.'
      });
    }

    let finalCoins = returnRequest.refund.adminDecision.finalCoins;
    let finalAmount = returnRequest.refund.adminDecision.finalAmount;
    const user = returnRequest.customerId;
    
    // Auto-calculate finalCoins if not present or invalid
    if (isNaN(finalCoins) || finalCoins === undefined || finalCoins === null) {
      console.log('finalCoins not found or invalid, calculating based on order value...');
      
      // If finalAmount exists, convert it to coins
      if (finalAmount && !isNaN(finalAmount)) {
        finalCoins = finalAmount * 5; // 1 Rupee = 5 Coins
        console.log(`Calculated finalCoins from finalAmount: ${finalAmount} -> ${finalCoins} coins`);
      } else {
        // Calculate from original order value and quality assessment
        const originalRefund = returnRequest.calculateRefund();
        const refundPercentage = returnRequest.warehouseManagement.qualityAssessment?.refundPercentage || 100;
        
        // Calculate base refund amount
        let baseRefundAmount = originalRefund.refundAmount * (refundPercentage / 100);
        
        // Apply deductions
        const deductions = returnRequest.refund.adminDecision.deductions || [];
        const totalDeductions = deductions.reduce((sum, deduction) => {
          const amount = Number(deduction.amount || 0);
          return sum + (isNaN(amount) ? 0 : amount);
        }, 0);
        
        finalAmount = Math.max(0, baseRefundAmount - totalDeductions);
        finalCoins = finalAmount * 5; // Convert to coins
        
        console.log(`Auto-calculated refund: Original=${originalRefund.originalAmount}, Percentage=${refundPercentage}%, Deductions=${totalDeductions}, Final=${finalAmount}, Coins=${finalCoins}`);
        
        // Update the adminDecision with calculated values
        returnRequest.refund.adminDecision.finalAmount = finalAmount;
        returnRequest.refund.adminDecision.finalCoins = finalCoins;
        await returnRequest.save();
      }
    }
    
    // Final validation after calculation
    if (isNaN(finalCoins) || finalCoins === undefined || finalCoins === null) {
      return res.status(400).json({
        success: false,
        message: 'Unable to calculate valid refund amount. Please check the return data.'
      });
    }
    
    if (isNaN(finalAmount) || finalAmount === undefined || finalAmount === null) {
      // If finalAmount is still invalid, calculate from finalCoins
      finalAmount = finalCoins / 5;
    }
    
    // Check for pickup charges - they should already be deducted from finalCoins
    const deductions = returnRequest.refund.adminDecision.deductions || [];
    const pickupChargeDeduction = deductions.find(d => d.type === 'pickup_charge');
    let pickupChargeTransactionId = null;
    
    console.log(`Processing refund: ${finalCoins} coins to be credited`);
    if (pickupChargeDeduction) {
      console.log(`Pickup charge found: ${pickupChargeDeduction.amount} rupees (already deducted from finalCoins)`);
    }
    
    // The finalCoins already has pickup charges deducted, so we just credit the final amount
    // No need to deduct pickup charges separately from wallet

    // Update user wallet balance with refund
    const userRecord = await User.findById(user._id);
    if (!userRecord) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // Ensure wallet exists and has valid balance
    const currentBalance = Number(userRecord.wallet?.balance || 0);
    const totalEarned = Number(userRecord.wallet?.totalEarned || 0);
    
    // Validate current balance is a number
    if (isNaN(currentBalance)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid current wallet balance'
      });
    }
    
    const newWalletBalance = currentBalance + finalCoins;
    const newTotalEarned = totalEarned + finalCoins;
    
    // Validate new balances are numbers
    if (isNaN(newWalletBalance) || isNaN(newTotalEarned)) {
      return res.status(400).json({
        success: false,
        message: 'Error calculating new wallet balance'
      });
    }
    
    await User.findByIdAndUpdate(user._id, {
      'wallet.balance': newWalletBalance,
      'wallet.totalEarned': newTotalEarned
    });

    // Create wallet transaction
    const transaction = new Transaction({
      userId: user._id,
      type: 'REFUND',
      amount: finalCoins,
      description: `Refund for return request ${returnRequest.returnRequestId}`,
      orderId: returnRequest.orderId._id,
      returnId: returnRequest._id,
      balanceAfter: newWalletBalance,
      metadata: {
        refundDetails: {
          originalAmount: returnRequest.calculateRefund().originalAmount,
          refundAmount: finalAmount,
          conversionRate: 5,
          deductions: returnRequest.refund.adminDecision.deductions,
          pickupChargeIncluded: pickupChargeDeduction ? true : false,
          pickupChargeAmount: pickupChargeDeduction ? pickupChargeDeduction.amount : 0,
          processedBy: warehouseManagerId,
          returnReason: returnRequest.returnReason
        }
      },
      status: 'COMPLETED'
    });

    await transaction.save();

    // Update return processing details
    returnRequest.refund.processing = {
      processedBy: warehouseManagerId,
      processedAt: new Date(),
      walletTransactionId: transaction._id,
      pickupChargeTransactionId: pickupChargeTransactionId,
      coinsCredited: finalCoins,
      originalAmount: returnRequest.calculateRefund().originalAmount,
      processingStatus: 'completed'
    };

    // Mark return as completed
    returnRequest.updateStatus('refund_processed', warehouseManagerId, 'Refund processed successfully', true);
    returnRequest.updateStatus('completed', warehouseManagerId, 'Return process completed', true);
    returnRequest.completedAt = new Date();

    await returnRequest.save();

    res.json({
      success: true,
      message: 'Refund processed successfully',
      data: {
        finalCoins: finalCoins,
        newWalletBalance: newWalletBalance,
        transactionId: transaction._id,
        pickupChargeTransactionId: pickupChargeTransactionId
      }
    });

  } catch (error) {
    console.error('Error processing refund:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process refund',
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
