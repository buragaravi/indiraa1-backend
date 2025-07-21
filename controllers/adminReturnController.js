import Return from '../models/Return.js';
import Order from '../models/Order.js';
import User from '../models/User.js';
import Transaction from '../models/Transaction.js';
import { 
  sendReturnDecisionNotification,
  sendRefundProcessedNotification 
} from '../services/communicationService.js';

// Admin Return Management

// Get All Returns with Filters
export const getAllReturns = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      status = 'all', 
      dateFrom, 
      dateTo, 
      returnReason = 'all',
      customerId,
      warehouseManager
    } = req.query;

    // Build query
    const query = {};
    
    if (status !== 'all') {
      query.status = status;
    }
    
    if (returnReason !== 'all') {
      query.returnReason = returnReason;
    }
    
    if (customerId) {
      query.customerId = customerId;
    }
    
    if (warehouseManager) {
      query['warehouseManagement.assignedManager'] = warehouseManager;
    }
    
    if (dateFrom || dateTo) {
      query.requestedAt = {};
      if (dateFrom) query.requestedAt.$gte = new Date(dateFrom);
      if (dateTo) query.requestedAt.$lte = new Date(dateTo);
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const returns = await Return.find(query)
      .populate('orderId', 'totalAmount status placedAt')
      .populate('customerId', 'name email phone')
      .populate('warehouseManagement.assignedManager', 'name email')
      .sort({ requestedAt: -1 })
      .limit(parseInt(limit))
      .skip(skip);

    const totalReturns = await Return.countDocuments(query);
    const totalPages = Math.ceil(totalReturns / parseInt(limit));

    // Calculate summary statistics
    const summary = await Return.aggregate([
      { $match: query },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          pending: {
            $sum: {
              $cond: [
                { $in: ['$status', ['requested', 'admin_review']] },
                1,
                0
              ]
            }
          },
          approved: {
            $sum: {
              $cond: [{ $eq: ['$status', 'approved'] }, 1, 0]
            }
          },
          completed: {
            $sum: {
              $cond: [{ $eq: ['$status', 'completed'] }, 1, 0]
            }
          },
          totalRefundAmount: {
            $sum: {
              $cond: [
                { $ne: ['$refund.processing.coinsCredited', null] },
                { $divide: ['$refund.processing.coinsCredited', 5] }, // Convert coins to rupees
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
          total: 0,
          pending: 0,
          approved: 0,
          completed: 0,
          totalRefundAmount: 0
        }
      }
    });

  } catch (error) {
    console.error('Error fetching all returns:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch returns',
      error: error.message
    });
  }
};

// Get Return Details for Admin
export const getAdminReturnDetails = async (req, res) => {
  try {
    const { returnId } = req.params;

    const returnRequest = await Return.findById(returnId)
      .populate('orderId')
      .populate('customerId', 'name email phone walletBalance')
      .populate('warehouseManagement.assignedManager', 'name email')
      .populate('adminReview.reviewedBy', 'name email')
      .populate('adminReview.assignedToWarehouse', 'name email');

    if (!returnRequest) {
      return res.status(404).json({
        success: false,
        message: 'Return request not found'
      });
    }

    // Get timeline
    const timeline = returnRequest.warehouseManagement.statusUpdates.map(update => ({
      status: update.toStatus,
      date: update.updatedAt,
      notes: update.notes,
      updatedBy: update.updatedBy,
      autoUpdate: update.autoUpdate
    }));

    // Calculate refund recommendations
    const refundCalculation = returnRequest.calculateRefund(
      returnRequest.warehouseManagement?.qualityAssessment?.refundPercentage || 100
    );

    res.json({
      success: true,
      data: {
        return: returnRequest,
        customer: returnRequest.customerId,
        order: returnRequest.orderId,
        timeline: timeline,
        recommendations: {
          refundCalculation: refundCalculation,
          warehouseRecommendation: returnRequest.refund?.warehouseRecommendation,
          suggestedAction: getSuggestedAction(returnRequest)
        }
      }
    });

  } catch (error) {
    console.error('Error fetching admin return details:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch return details',
      error: error.message
    });
  }
};

// Review Return Request (Approve/Reject)
export const reviewReturnRequest = async (req, res) => {
  try {
    const adminId = req.user.id;
    const { returnId } = req.params;
    const { decision, adminComments, pickupCharge } = req.body;

    const returnRequest = await Return.findById(returnId);
    if (!returnRequest) {
      return res.status(404).json({
        success: false,
        message: 'Return request not found'
      });
    }

    // Check if already reviewed
    if (returnRequest.status !== 'requested' && returnRequest.status !== 'admin_review') {
      return res.status(400).json({
        success: false,
        message: 'Return request has already been reviewed'
      });
    }

    // Update review information
    returnRequest.adminReview.reviewedBy = adminId;
    returnRequest.adminReview.reviewedAt = new Date();
    returnRequest.adminReview.approved = decision === 'approve';
    returnRequest.adminReview.adminComments = adminComments;

    // Update pickup charge if provided
    if (pickupCharge) {
      returnRequest.adminReview.pickupCharge = {
        isFree: pickupCharge.isFree,
        amount: pickupCharge.isFree ? 0 : 50,
        reason: pickupCharge.reason,
        toggledBy: adminId,
        toggledAt: new Date()
      };
    }

    if (decision === 'approve') {
      // Update status - no warehouse manager assignment needed
      returnRequest.updateStatus('approved', adminId, 'Return request approved by admin');


      // Send notification
      console.log(`Return approval notification: Return ${returnRequest.returnRequestId} approved by admin`);
    } else {
      // Reject the return
      returnRequest.updateStatus('rejected', adminId, adminComments || 'Return request rejected');

      // Update order to remove active return flag
      const order = await Order.findById(returnRequest.orderId);
      if (order) {
        order.returnInfo.hasActiveReturn = false;
        await order.save();
      }
    }

    await returnRequest.save();

    // Send notification to customer
    await sendReturnDecisionNotification(returnRequest.customerId, returnRequest, decision);

    res.json({
      success: true,
      data: {
        return: returnRequest,
        notification: `Return request ${decision === 'approve' ? 'approved' : 'rejected'} successfully`
      }
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

// Toggle Pickup Charge
export const togglePickupCharge = async (req, res) => {
  try {
    const adminId = req.user.id;
    const { returnId } = req.params;
    const { isFree, reason } = req.body;

    const returnRequest = await Return.findById(returnId);
    if (!returnRequest) {
      return res.status(404).json({
        success: false,
        message: 'Return request not found'
      });
    }

    // Update pickup charge
    returnRequest.adminReview.pickupCharge = {
      isFree: isFree,
      amount: isFree ? 0 : 50,
      reason: reason,
      toggledBy: adminId,
      toggledAt: new Date()
    };

    await returnRequest.save();

    res.json({
      success: true,
      data: {
        pickupCharge: returnRequest.adminReview.pickupCharge,
        message: `Pickup charge ${isFree ? 'removed' : 'applied'} successfully`
      }
    });

  } catch (error) {
    console.error('Error toggling pickup charge:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to toggle pickup charge',
      error: error.message
    });
  }
};

// Get Returns Pending Final Approval
export const getPendingApprovalReturns = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;

    const query = { 
      status: 'quality_checked',
      'refund.warehouseRecommendation.recommendation': { $exists: true }
    };

    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const returns = await Return.find(query)
      .populate('orderId', 'totalAmount status')
      .populate('customerId', 'name email')
      .populate('warehouseManagement.assignedManager', 'name email')
      .sort({ 'warehouseManagement.qualityAssessment.assessedAt': -1 })
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
    console.error('Error fetching pending approval returns:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch pending approval returns',
      error: error.message
    });
  }
};

// Make Final Refund Decision
export const makeFinalRefundDecision = async (req, res) => {
  try {
    const adminId = req.user.id;
    const { returnId } = req.params;
    const { decision, finalAmount, adminNotes, deductions = [] } = req.body;

    const returnRequest = await Return.findById(returnId).populate('customerId');
    if (!returnRequest) {
      return res.status(404).json({
        success: false,
        message: 'Return request not found'
      });
    }

    // Check if quality assessment is completed
    if (returnRequest.status !== 'quality_checked') {
      return res.status(400).json({
        success: false,
        message: 'Quality assessment must be completed before final decision'
      });
    }

    // Calculate final refund amount
    const originalRefund = returnRequest.calculateRefund(
      returnRequest.warehouseManagement.qualityAssessment.refundPercentage
    );

    let calculatedFinalAmount = finalAmount;
    if (!calculatedFinalAmount) {
      // Use warehouse recommendation if no amount specified
      calculatedFinalAmount = returnRequest.refund?.warehouseRecommendation?.recommendedAmount || originalRefund.refundAmount;
    }

    // Apply deductions (including pickup charges)
    const totalDeductions = deductions.reduce((sum, deduction) => sum + deduction.amount, 0);
    
    // Add pickup charge if applicable
    let pickupChargeAmount = 0;
    const pickupCharge = returnRequest.adminReview?.pickupCharge || returnRequest.warehouseManagement?.pickupCharge;
    
    if (pickupCharge && !pickupCharge.isFree) {
      pickupChargeAmount = pickupCharge.amount || 50; // Default 50 rupees
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

    // Update refund decision
    returnRequest.refund.adminDecision = {
      decision: decision,
      finalAmount: finalRefundAmount,
      finalCoins: finalCoins,
      adminNotes: adminNotes,
      decidedAt: new Date(),
      decidedBy: adminId,
      deductions: deductions.map(d => ({
        ...d,
        calculatedAt: d.calculatedAt || new Date()
      }))
    };

    if (decision === 'approved') {
      returnRequest.updateStatus('refund_approved', adminId, 'Refund approved by admin');
    } else {
      returnRequest.updateStatus('rejected', adminId, 'Refund rejected by admin');
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

// Process Coin Refund
export const processCoinRefund = async (req, res) => {
  try {
    const adminId = req.user.id;
    const { returnId } = req.params;

    const returnRequest = await Return.findById(returnId).populate('customerId orderId');
    if (!returnRequest) {
      return res.status(404).json({
        success: false,
        message: 'Return request not found'
      });
    }

    // Check if refund is approved
    if (returnRequest.status !== 'refund_approved') {
      return res.status(400).json({
        success: false,
        message: 'Refund must be approved before processing'
      });
    }

    // Check if already processed
    if (returnRequest.refund.processing.processingStatus === 'completed') {
      return res.status(400).json({
        success: false,
        message: 'Refund has already been processed'
      });
    }

    let finalCoins = returnRequest.refund.adminDecision.finalCoins;
    let finalAmount = returnRequest.refund.adminDecision.finalAmount;
    
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
    const currentBalance = (await User.findById(user._id)).wallet?.balance || 0;
    const newWalletBalance = currentBalance + finalCoins;
    
    await User.findByIdAndUpdate(user._id, {
      'wallet.balance': newWalletBalance,
      'wallet.totalEarned': (user.wallet?.totalEarned || 0) + finalCoins
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
          processedBy: adminId,
          returnReason: returnRequest.returnReason
        }
      },
      status: 'COMPLETED'
    });

    await transaction.save();

    // Update return processing details
    returnRequest.refund.processing = {
      processedBy: adminId,
      processedAt: new Date(),
      walletTransactionId: transaction._id,
      pickupChargeTransactionId: pickupChargeTransactionId,
      coinsCredited: finalCoins,
      originalAmount: returnRequest.calculateRefund().originalAmount,
      processingStatus: 'completed'
    };

    // Mark return as completed
    returnRequest.updateStatus('refund_processed', adminId, 'Refund processed successfully', true);
    returnRequest.updateStatus('completed', adminId, 'Return process completed', true);
    returnRequest.completedAt = new Date();

    await returnRequest.save();

    // Update order return info
    const order = await Order.findById(returnRequest.orderId);
    if (order) {
      order.returnInfo.hasActiveReturn = false;
      // Update return history
      const historyEntry = order.returnInfo.returnHistory.find(
        h => h.returnId.toString() === returnId
      );
      if (historyEntry) {
        historyEntry.status = 'completed';
        historyEntry.completedAt = new Date();
      }
      await order.save();
    }

    // Send notification to customer
    await sendRefundProcessedNotification(user, returnRequest, transaction);

    res.json({
      success: true,
      data: {
        transactionId: transaction._id,
        coinsCredited: finalCoins,
        newWalletBalance: newWalletBalance,
        return: returnRequest
      }
    });

  } catch (error) {
    console.error('Error processing coin refund:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process refund',
      error: error.message
    });
  }
};

// Bulk Process Refunds
export const bulkProcessRefunds = async (req, res) => {
  try {
    const adminId = req.user.id;
    const { returnIds } = req.body;

    if (!returnIds || !Array.isArray(returnIds) || returnIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Return IDs array is required'
      });
    }

    const results = [];
    let processed = 0;
    let failed = 0;

    for (const returnId of returnIds) {
      try {
        // Process each return individually
        const returnRequest = await Return.findById(returnId).populate('customerId orderId');
        
        if (!returnRequest || returnRequest.status !== 'refund_approved') {
          results.push({
            returnId: returnId,
            success: false,
            error: 'Return not found or not approved'
          });
          failed++;
          continue;
        }

        // Similar processing logic as individual refund
        const finalCoins = returnRequest.refund.adminDecision.finalCoins;
        const user = returnRequest.customerId;
        const newWalletBalance = (user.walletBalance || 0) + finalCoins;
        
        await User.findByIdAndUpdate(user._id, { walletBalance: newWalletBalance });

        const transaction = new Transaction({
          userId: user._id,
          type: 'REFUND',
          amount: finalCoins,
          description: `Bulk refund for return ${returnRequest.returnRequestId}`,
          orderId: returnRequest.orderId._id,
          returnId: returnRequest._id,
          balanceAfter: newWalletBalance,
          metadata: {
            refundDetails: {
              originalAmount: returnRequest.calculateRefund().originalAmount,
              refundAmount: returnRequest.refund.adminDecision.finalAmount,
              conversionRate: 5,
              processedBy: adminId,
              returnReason: returnRequest.returnReason
            }
          },
          status: 'COMPLETED'
        });

        await transaction.save();

        returnRequest.refund.processing = {
          processedBy: adminId,
          processedAt: new Date(),
          walletTransactionId: transaction._id,
          conversionRate: 5,
          originalAmount: returnRequest.refund.adminDecision.finalAmount,
          coinsCredited: finalCoins,
          processingStatus: 'completed'
        };

        returnRequest.updateStatus('completed', adminId, 'Bulk refund processed', true);
        returnRequest.completedAt = new Date();
        await returnRequest.save();

        results.push({
          returnId: returnId,
          success: true,
          transactionId: transaction._id,
          coinsCredited: finalCoins
        });
        processed++;

      } catch (error) {
        console.error(`Error processing return ${returnId}:`, error);
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
        processed: processed,
        failed: failed,
        results: results
      }
    });

  } catch (error) {
    console.error('Error bulk processing refunds:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to bulk process refunds',
      error: error.message
    });
  }
};

// Helper Functions

const getSuggestedAction = (returnRequest) => {
  if (returnRequest.status === 'requested') {
    return 'Review and approve/reject return request';
  }
  
  if (returnRequest.status === 'quality_checked' && returnRequest.refund?.warehouseRecommendation) {
    const recommendation = returnRequest.refund.warehouseRecommendation.recommendation;
    switch (recommendation) {
      case 'approve_full':
        return 'Warehouse recommends full refund approval';
      case 'approve_partial':
        return 'Warehouse recommends partial refund approval';
      case 'reject':
        return 'Warehouse recommends refund rejection';
      default:
        return 'Review warehouse recommendation';
    }
  }
  
  if (returnRequest.status === 'refund_approved') {
    return 'Process coin refund to customer wallet';
  }
  
  return 'No action required';
};
