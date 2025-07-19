import Return from '../models/Return.js';
import Order from '../models/Order.js';
import { 
  sendPickupStartedNotification
} from '../services/communicationService.js';

// Delivery Agent Return Pickup Management

// Get Assigned Return Pickups
export const getAssignedPickups = async (req, res) => {
  try {
    const agentId = req.user.id;
    const { status = 'all' } = req.query;

    const query = { 'warehouseManagement.pickup.assignedAgent': agentId };
    
    if (status !== 'all') {
      query['warehouseManagement.pickup.pickupStatus'] = status;
    }

    const pickups = await Return.find(query)
      .populate('orderId', 'totalAmount status shipping')
      .populate('customerId', 'name phone')
      .populate('warehouseManagement.assignedManager', 'name phone')
      .select('returnRequestId items warehouseManagement.pickup status requestedAt')
      .sort({ 'warehouseManagement.pickup.scheduledDate': 1 });

    // Calculate summary
    const summary = await Return.aggregate([
      { $match: query },
      {
        $group: {
          _id: null,
          scheduled: {
            $sum: {
              $cond: [
                { $eq: ['$warehouseManagement.pickup.pickupStatus', 'scheduled'] },
                1,
                0
              ]
            }
          },
          inProgress: {
            $sum: {
              $cond: [
                { $eq: ['$warehouseManagement.pickup.pickupStatus', 'in_progress'] },
                1,
                0
              ]
            }
          },
          completed: {
            $sum: {
              $cond: [
                { $eq: ['$warehouseManagement.pickup.pickupStatus', 'completed'] },
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
        pickups: pickups,
        summary: summary[0] || {
          scheduled: 0,
          inProgress: 0,
          completed: 0
        }
      }
    });

  } catch (error) {
    console.error('Error fetching assigned pickups:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch assigned pickups',
      error: error.message
    });
  }
};

// Verify Pickup Using Order OTP
export const verifyPickupOTP = async (req, res) => {
  try {
    const agentId = req.user.id;
    const { returnId } = req.params;
    const { otp, location, pickupNotes } = req.body;

    const returnRequest = await Return.findById(returnId).populate('orderId');
    if (!returnRequest) {
      return res.status(404).json({
        success: false,
        message: 'Return request not found'
      });
    }

    // Check if agent is assigned to this pickup
    if (returnRequest.warehouseManagement.pickup.assignedAgent.toString() !== agentId) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized: You are not assigned to this pickup'
      });
    }

    // Check if pickup is scheduled
    if (returnRequest.warehouseManagement.pickup.pickupStatus !== 'scheduled') {
      return res.status(400).json({
        success: false,
        message: 'Pickup is not in scheduled status'
      });
    }

    const order = returnRequest.orderId;
    
    // Verify OTP using existing order OTP verification method
    const otpVerification = order.verifyDeliveryOTP(otp, agentId);
    
    if (otpVerification.success) {
      // Update return pickup status
      returnRequest.warehouseManagement.pickup.otpVerification = {
        orderOtpUsed: otp,
        verifiedAt: new Date(),
        verifiedBy: agentId
      };
      
      returnRequest.warehouseManagement.pickup.pickedUpAt = new Date();
      returnRequest.warehouseManagement.pickup.pickupStatus = 'completed';
      returnRequest.warehouseManagement.pickup.pickupNotes = pickupNotes || '';
      
      // Add location if provided
      if (location) {
        returnRequest.warehouseManagement.pickup.pickupLocation = location;
      }
      
      // Update return status
      returnRequest.updateStatus('picked_up', agentId, 'Items picked up and OTP verified', true);
      
      await returnRequest.save();
      
      // Send notification to warehouse manager
      console.log(`Pickup completed notification: Return ${returnRequest.returnRequestId} picked up by agent ${agentId}`);
      
      res.json({
        success: true,
        data: {
          return: returnRequest,
          verification: {
            verified: true,
            verifiedAt: returnRequest.warehouseManagement.pickup.otpVerification.verifiedAt
          },
          nextStep: 'Transport items to warehouse'
        }
      });
      
    } else {
      // Log failed attempt
      if (!returnRequest.warehouseManagement.pickup.otpVerification) {
        returnRequest.warehouseManagement.pickup.otpVerification = {
          verificationAttempts: []
        };
      }
      
      returnRequest.warehouseManagement.pickup.otpVerification.verificationAttempts.push({
        attemptedAt: new Date(),
        attemptedOtp: otp,
        success: false,
        agentId: agentId,
        ipAddress: req.ip
      });
      
      await returnRequest.save();
      
      res.status(400).json({
        success: false,
        message: otpVerification.error,
        data: {
          verification: {
            verified: false,
            error: otpVerification.error
          }
        }
      });
    }

  } catch (error) {
    console.error('Error verifying pickup OTP:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify pickup OTP',
      error: error.message
    });
  }
};

// Update Pickup Progress
export const updatePickupStatus = async (req, res) => {
  try {
    const agentId = req.user.id;
    const { returnId } = req.params;
    const { pickupStatus, notes, location, failureReason } = req.body;

    const returnRequest = await Return.findById(returnId);
    if (!returnRequest) {
      return res.status(404).json({
        success: false,
        message: 'Return request not found'
      });
    }

    // Check if agent is assigned to this pickup
    if (returnRequest.warehouseManagement.pickup.assignedAgent.toString() !== agentId) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized: You are not assigned to this pickup'
      });
    }

    // Validate pickup status
    const validStatuses = ['in_progress', 'completed', 'failed', 'rescheduled'];
    if (!validStatuses.includes(pickupStatus)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid pickup status'
      });
    }

    // Update pickup information
    returnRequest.warehouseManagement.pickup.pickupStatus = pickupStatus;
    returnRequest.warehouseManagement.pickup.pickupNotes = notes || '';
    
    if (location) {
      returnRequest.warehouseManagement.pickup.pickupLocation = location;
    }
    
    if (pickupStatus === 'failed' && failureReason) {
      returnRequest.warehouseManagement.pickup.failureReason = failureReason;
    }

    // Update main return status based on pickup status
    let returnStatus = returnRequest.status;
    let statusNotes = notes || `Pickup status updated to ${pickupStatus}`;

    switch (pickupStatus) {
      case 'in_progress':
        // No change to main return status
        break;
      case 'completed':
        // This should only happen after OTP verification
        if (!returnRequest.warehouseManagement.pickup.otpVerification?.verifiedAt) {
          return res.status(400).json({
            success: false,
            message: 'OTP verification required before marking pickup as completed'
          });
        }
        returnStatus = 'picked_up';
        break;
      case 'failed':
        statusNotes = `Pickup failed: ${failureReason || 'No reason provided'}`;
        break;
      case 'rescheduled':
        returnStatus = 'pickup_scheduled';
        statusNotes = `Pickup rescheduled: ${notes || 'No reason provided'}`;
        break;
    }

    // Update return status if changed
    if (returnStatus !== returnRequest.status) {
      returnRequest.updateStatus(returnStatus, agentId, statusNotes);
    }

    await returnRequest.save();

    res.json({
      success: true,
      data: {
        return: returnRequest,
        message: `Pickup status updated to ${pickupStatus}`
      }
    });

  } catch (error) {
    console.error('Error updating pickup status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update pickup status',
      error: error.message
    });
  }
};

// Get Pickup Details
export const getPickupDetails = async (req, res) => {
  try {
    const agentId = req.user.id;
    const { returnId } = req.params;

    const returnRequest = await Return.findById(returnId)
      .populate('orderId', 'totalAmount status shipping deliveryOtp')
      .populate('customerId', 'name phone email')
      .populate('warehouseManagement.assignedManager', 'name phone email');

    if (!returnRequest) {
      return res.status(404).json({
        success: false,
        message: 'Return request not found'
      });
    }

    // Check if agent is assigned to this pickup
    if (returnRequest.warehouseManagement.pickup.assignedAgent.toString() !== agentId) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized: You are not assigned to this pickup'
      });
    }

    // Prepare pickup instructions
    const pickupInstructions = generatePickupInstructions(returnRequest);

    // Prepare contact information
    const contactInfo = {
      customer: {
        name: returnRequest.customerId.name,
        phone: returnRequest.customerId.phone,
        address: returnRequest.orderId.shipping.address
      },
      warehouse: {
        manager: returnRequest.warehouseManagement.assignedManager.name,
        phone: returnRequest.warehouseManagement.assignedManager.phone
      }
    };

    res.json({
      success: true,
      data: {
        return: returnRequest,
        customer: returnRequest.customerId,
        pickupInstructions: pickupInstructions,
        contactInfo: contactInfo,
        otpRequired: true,
        estimatedItems: returnRequest.items.length
      }
    });

  } catch (error) {
    console.error('Error fetching pickup details:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch pickup details',
      error: error.message
    });
  }
};

// Start Pickup Process
export const startPickupProcess = async (req, res) => {
  try {
    const agentId = req.user.id;
    const { returnId } = req.params;
    const { startLocation, notes } = req.body;

    const returnRequest = await Return.findById(returnId);
    if (!returnRequest) {
      return res.status(404).json({
        success: false,
        message: 'Return request not found'
      });
    }

    // Check if agent is assigned to this pickup
    if (returnRequest.warehouseManagement.pickup.assignedAgent.toString() !== agentId) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized: You are not assigned to this pickup'
      });
    }

    // Check if pickup is scheduled
    if (returnRequest.warehouseManagement.pickup.pickupStatus !== 'scheduled') {
      return res.status(400).json({
        success: false,
        message: 'Pickup must be in scheduled status to start'
      });
    }

    // Update pickup status to in progress
    returnRequest.warehouseManagement.pickup.pickupStatus = 'in_progress';
    returnRequest.warehouseManagement.pickup.startedAt = new Date();
    returnRequest.warehouseManagement.pickup.pickupNotes = notes || '';
    
    if (startLocation) {
      returnRequest.warehouseManagement.pickup.startLocation = startLocation;
    }

    await returnRequest.save();

    // Send notification to customer that agent is on the way
    await sendPickupStartedNotification(
      returnRequest.customerId,
      returnRequest,
      agentId
    );

    res.json({
      success: true,
      data: {
        return: returnRequest,
        message: 'Pickup process started successfully',
        nextStep: 'Proceed to customer location and verify OTP'
      }
    });

  } catch (error) {
    console.error('Error starting pickup process:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to start pickup process',
      error: error.message
    });
  }
};

// Complete Pickup Process
export const completePickupProcess = async (req, res) => {
  try {
    const agentId = req.user.id;
    const { returnId } = req.params;
    const { completionNotes, completionLocation, itemsCollected } = req.body;

    const returnRequest = await Return.findById(returnId);
    if (!returnRequest) {
      return res.status(404).json({
        success: false,
        message: 'Return request not found'
      });
    }

    // Check if agent is assigned to this pickup
    if (returnRequest.warehouseManagement.pickup.assignedAgent.toString() !== agentId) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized: You are not assigned to this pickup'
      });
    }

    // Check if OTP is verified
    if (!returnRequest.warehouseManagement.pickup.otpVerification?.verifiedAt) {
      return res.status(400).json({
        success: false,
        message: 'OTP verification required before completing pickup'
      });
    }

    // Mark pickup as completed
    returnRequest.warehouseManagement.pickup.pickupStatus = 'completed';
    returnRequest.warehouseManagement.pickup.completedAt = new Date();
    returnRequest.warehouseManagement.pickup.completionNotes = completionNotes || '';
    
    if (completionLocation) {
      returnRequest.warehouseManagement.pickup.completionLocation = completionLocation;
    }
    
    if (itemsCollected) {
      returnRequest.warehouseManagement.pickup.itemsCollected = itemsCollected;
    }

    await returnRequest.save();

    res.json({
      success: true,
      data: {
        return: returnRequest,
        message: 'Pickup completed successfully',
        nextStep: 'Transport items to warehouse'
      }
    });

  } catch (error) {
    console.error('Error completing pickup process:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to complete pickup process',
      error: error.message
    });
  }
};

// Helper Functions

const generatePickupInstructions = (returnRequest) => {
  const instructions = [
    '1. Contact customer before arrival',
    '2. Verify customer identity',
    '3. Inspect items to be returned',
    '4. Take photos of items if necessary',
    '5. Ask customer for order OTP',
    '6. Verify OTP in the app',
    '7. Collect all items mentioned in return request',
    '8. Handle items with care during transport',
    '9. Deliver to warehouse promptly'
  ];

  // Add specific instructions based on return reason
  switch (returnRequest.returnReason) {
    case 'defective':
      instructions.push('10. Note any visible defects for warehouse team');
      break;
    case 'wrong_item':
      instructions.push('10. Verify the item mismatch with customer');
      break;
    case 'damaged_in_transit':
      instructions.push('10. Document damage condition with photos');
      break;
    default:
      instructions.push('10. Ensure all items are in original packaging if possible');
  }

  return instructions;
};
