import User from '../models/User.js';
import Transaction from '../models/Transaction.js';
import Notification from '../models/Notification.js';
import { sendPushNotification } from '../services/pushNotificationService.js';
import { notifyWalletUpdate as notifyWalletUpdateWeb } from '../services/webPushService.js';
import { REWARD_CONSTANTS } from '../utils/rewardCalculator.js';
import { 
  calculateMaxDiscount,
  calculateDiscountFromCoins,
  getRedemptionSuggestions,
  validateRedemption,
  generateRedemptionDescription,
  REDEMPTION_CONSTANTS
} from '../utils/coinRedemption.js';

// Get user's wallet balance and summary
export const getWalletBalance = async (req, res) => {
  try {
    const userId = req.user.id;
    
    const user = await User.findById(userId).select('wallet');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // Get recent transactions count
    const recentTransactionsCount = await Transaction.countDocuments({
      userId,
      createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } // Last 30 days
    });
    
    // Get total transactions by type
    const transactionStats = await Transaction.aggregate([
      { $match: { userId: user._id } },
      {
        $group: {
          _id: '$type',
          total: { $sum: '$amount' },
          count: { $sum: 1 }
        }
      }
    ]);
    
    res.json({
      success: true,
      wallet: {
        balance: user.wallet.balance,
        totalEarned: user.wallet.totalEarned,
        totalSpent: user.wallet.totalSpent,
        recentTransactionsCount,
        transactionStats
      }
    });
    
  } catch (error) {
    console.error('[GET WALLET BALANCE]', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch wallet balance'
    });
  }
};

// Get user's transaction history with pagination
export const getTransactionHistory = async (req, res) => {
  try {
    const userId = req.user.id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const type = req.query.type; // Optional filter by transaction type
    
    const skip = (page - 1) * limit;
    
    // Build filter query
    const filter = { userId };
    if (type && Object.values(REWARD_CONSTANTS.TRANSACTION_TYPES).includes(type)) {
      filter.type = type;
    }
    
    // Get transactions with populated references
    const transactions = await Transaction.find(filter)
      .populate('orderId', 'totalAmount status createdAt items')
      .populate('referredUserId', 'name username')
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip);
    
    // Get total count for pagination
    const totalTransactions = await Transaction.countDocuments(filter);
    const totalPages = Math.ceil(totalTransactions / limit);
    
    res.json({
      success: true,
      transactions,
      pagination: {
        currentPage: page,
        totalPages,
        totalTransactions,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    });
    
  } catch (error) {
    console.error('[GET TRANSACTION HISTORY]', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch transaction history'
    });
  }
};

// Get wallet statistics and analytics
export const getWalletStats = async (req, res) => {
  try {
    const userId = req.user.id;
    const timeframe = req.query.timeframe || '30'; // Days
    
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(timeframe));
    
    // Get earning stats by type within timeframe
    const earningStats = await Transaction.aggregate([
      {
        $match: {
          userId: new mongoose.Types.ObjectId(userId),
          amount: { $gt: 0 },
          createdAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: '$type',
          totalEarned: { $sum: '$amount' },
          transactionCount: { $sum: 1 },
          avgAmount: { $avg: '$amount' }
        }
      }
    ]);
    
    // Get monthly earning trend
    const monthlyTrend = await Transaction.aggregate([
      {
        $match: {
          userId: new mongoose.Types.ObjectId(userId),
          amount: { $gt: 0 },
          createdAt: { $gte: new Date(Date.now() - 6 * 30 * 24 * 60 * 60 * 1000) } // Last 6 months
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' }
          },
          totalEarned: { $sum: '$amount' },
          transactionCount: { $sum: 1 }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } }
    ]);
    
    res.json({
      success: true,
      stats: {
        timeframe: `${timeframe} days`,
        earningsByType: earningStats,
        monthlyTrend,
        totalTypes: earningStats.length
      }
    });
    
  } catch (error) {
    console.error('[GET WALLET STATS]', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch wallet statistics'
    });
  }
};

// Internal function to add coins (used by other controllers)
export const addCoinsToWallet = async (userId, amount, type, description, orderId = null, referredUserId = null) => {
  try {
    console.log(`[WALLET CONTROLLER DEBUG] addCoinsToWallet called - userId: ${userId}, amount: ${amount}, type: ${type}`);
    
    const user = await User.findById(userId);
    if (!user) {
      console.log(`[WALLET CONTROLLER DEBUG] User not found: ${userId}`);
      throw new Error('User not found');
    }
    
    console.log(`[WALLET CONTROLLER DEBUG] User found: ${user.name}, current balance: ${user.wallet.balance}`);
    
    // Add coins using user method
    const newBalance = await user.addCoins(amount, type, description, orderId);
    console.log(`[WALLET CONTROLLER DEBUG] Coins added successfully, new balance: ${newBalance}`);
    
    // If this is a referral bonus, also update referral stats
    if (type === REWARD_CONSTANTS.TRANSACTION_TYPES.REFERRAL_BONUS && referredUserId) {
      console.log(`[WALLET CONTROLLER DEBUG] Updating referral stats for user ${userId}`);
      console.log(`[WALLET CONTROLLER DEBUG] Current successfulReferrals: ${user.referralStats.successfulReferrals}`);
      console.log(`[WALLET CONTROLLER DEBUG] Current coinsEarnedFromReferrals: ${user.referralStats.coinsEarnedFromReferrals}`);
      
      user.referralStats.successfulReferrals += 1;
      user.referralStats.coinsEarnedFromReferrals += amount;
      await user.save();
      
      console.log(`[WALLET CONTROLLER DEBUG] Referral stats updated - successfulReferrals: ${user.referralStats.successfulReferrals}, coinsEarned: ${user.referralStats.coinsEarnedFromReferrals}`);
    }
    
    const result = {
      success: true,
      newBalance: user.wallet.balance,
      coinsAdded: amount
    };
    
    console.log(`[WALLET CONTROLLER DEBUG] addCoinsToWallet completed successfully:`, result);
    return result;
    
  } catch (error) {
    console.error('[ADD COINS TO WALLET] Error:', error);
    throw error;
  }
};

// Internal function to deduct coins (used by other controllers)
export const deductCoinsFromWallet = async (userId, amount, type, description, orderId = null) => {
  try {
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }
    
    // Check sufficient balance
    if (user.wallet.balance < amount) {
      throw new Error('Insufficient wallet balance');
    }
    
    // Deduct coins using user method
    await user.deductCoins(amount, type, description, orderId);
    
    return {
      success: true,
      newBalance: user.wallet.balance,
      coinsDeducted: amount
    };
    
  } catch (error) {
    console.error('[DEDUCT COINS FROM WALLET]', error);
    throw error;
  }
};

// Admin function to manually adjust wallet balance
export const manualWalletAdjustment = async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Admin access required'
      });
    }
    
    const { userId, amount, reason } = req.body;
    
    if (!userId || !amount || !reason) {
      return res.status(400).json({
        success: false,
        message: 'User ID, amount, and reason are required'
      });
    }
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    const description = `Manual adjustment by admin: ${reason}`;
    
    if (amount > 0) {
      await user.addCoins(amount, REWARD_CONSTANTS.TRANSACTION_TYPES.MANUAL_ADJUSTMENT, description);
    } else {
      await user.deductCoins(Math.abs(amount), REWARD_CONSTANTS.TRANSACTION_TYPES.MANUAL_ADJUSTMENT, description);
    }
    
    res.json({
      success: true,
      message: 'Wallet adjusted successfully',
      newBalance: user.wallet.balance,
      adjustment: amount
    });
    
  } catch (error) {
    console.error('[MANUAL WALLET ADJUSTMENT]', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to adjust wallet balance'
    });
  }
};

// Manual test endpoint for referral registration
export const testReferralRegistration = async (req, res) => {
  try {
    const { referredUserId, referralCode } = req.body;
    
    if (!referredUserId || !referralCode) {
      return res.status(400).json({
        success: false,
        message: 'referredUserId and referralCode are required'
      });
    }
    
    console.log(`[TEST REFERRAL] Testing referral for user ${referredUserId} with code ${referralCode}`);
    
    // Import the function dynamically to avoid circular dependency
    const { processReferralRegistration } = await import('./referralController.js');
    
    const result = await processReferralRegistration(referredUserId, referralCode);
    
    res.json({
      success: true,
      message: 'Referral test completed',
      result
    });
    
  } catch (error) {
    console.error('[TEST REFERRAL] Error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to test referral registration'
    });
  }
};

// Phase 1: Calculate discount for coin redemption
export const calculateDiscount = async (req, res) => {
  try {
    const userId = req.user.id;
    const { orderValue, coinsToUse } = req.body;
    
    console.log(`[CALCULATE DISCOUNT] User ${userId} - Order: ₹${orderValue}, Coins: ${coinsToUse}`);
    
    // Validate input
    if (!orderValue || orderValue <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Valid order value is required'
      });
    }
    
    // Get user's current coin balance
    const user = await User.findById(userId).select('wallet');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    const availableCoins = user.wallet.balance;
    console.log(`[CALCULATE DISCOUNT] Available coins: ${availableCoins}`);
    
    // If coinsToUse is provided, validate the specific redemption
    if (coinsToUse !== undefined) {
      const validation = validateRedemption(orderValue, coinsToUse, availableCoins);
      
      if (!validation.isValid) {
        return res.status(400).json({
          success: false,
          message: validation.errors.join(', '),
          errors: validation.errors
        });
      }
      
      return res.json({
        success: true,
        data: {
          orderValue,
          coinsToUse,
          discountAmount: validation.discountAmount,
          finalAmount: validation.finalAmount,
          remainingCoins: availableCoins - coinsToUse
        }
      });
    }
    
    // Get redemption suggestions
    const suggestions = getRedemptionSuggestions(orderValue, availableCoins);
    
    res.json({
      success: true,
      data: {
        orderValue,
        availableCoins,
        maxPossibleDiscount: suggestions.maxPossibleDiscount,
        coinsForMaxDiscount: suggestions.coinsForMaxDiscount,
        maxDiscountFromCoins: suggestions.maxDiscountFromCoins,
        suggestions: {
          optimal: suggestions.optimal,
          alternative: suggestions.alternative
        },
        limits: suggestions.limits,
        constants: {
          coinsPerRupee: REDEMPTION_CONSTANTS.COINS_PER_RUPEE,
          maxDiscountPercentage: REDEMPTION_CONSTANTS.MAX_DISCOUNT_PERCENTAGE,
          minRedemptionCoins: REDEMPTION_CONSTANTS.MIN_REDEMPTION_COINS
        }
      }
    });
    
  } catch (error) {
    console.error('[CALCULATE DISCOUNT] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to calculate discount'
    });
  }
};

// Phase 1: Redeem coins for order discount
export const redeemCoins = async (req, res) => {
  try {
    const userId = req.user.id;
    const { orderValue, coinsToRedeem, orderId } = req.body;
    
    console.log(`[REDEEM COINS] User ${userId} - Order: ₹${orderValue}, Coins: ${coinsToRedeem}, OrderID: ${orderId}`);
    
    // Validate input
    if (!orderValue || !coinsToRedeem || !orderId) {
      return res.status(400).json({
        success: false,
        message: 'Order value, coins to redeem, and order ID are required'
      });
    }
    
    // Get user with current balance
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    const availableCoins = user.wallet.balance;
    console.log(`[REDEEM COINS] Current balance: ${availableCoins}`);
    
    // Validate redemption
    const validation = validateRedemption(orderValue, coinsToRedeem, availableCoins);
    
    if (!validation.isValid) {
      console.log(`[REDEEM COINS] Validation failed:`, validation.errors);
      return res.status(400).json({
        success: false,
        message: validation.errors.join(', '),
        errors: validation.errors
      });
    }
    
    // Deduct coins from wallet
    const discountAmount = validation.discountAmount;
    const description = generateRedemptionDescription(coinsToRedeem, discountAmount, orderId);
    
    try {
      await user.deductCoins(coinsToRedeem, 'COIN_REDEMPTION', description, orderId);
      console.log(`[REDEEM COINS] Successfully deducted ${coinsToRedeem} coins`);
      
      // Get updated balance
      const updatedUser = await User.findById(userId).select('wallet');
      
      res.json({
        success: true,
        data: {
          transactionId: `redemption_${Date.now()}`, // Could link to actual transaction
          coinsRedeemed: coinsToRedeem,
          discountApplied: discountAmount,
          originalOrderValue: orderValue,
          finalOrderValue: validation.finalAmount,
          previousBalance: availableCoins,
          remainingBalance: updatedUser.wallet.balance,
          orderId: orderId
        }
      });
      
    } catch (deductionError) {
      console.error('[REDEEM COINS] Deduction failed:', deductionError);
      res.status(500).json({
        success: false,
        message: 'Failed to deduct coins from wallet'
      });
    }
    
  } catch (error) {
    console.error('[REDEEM COINS] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to redeem coins'
    });
  }
};

// Internal function for order-based coin redemption
export const redeemCoinsForOrder = async (userId, orderValue, coinsToRedeem, orderId) => {
  try {
    console.log(`[REDEEM COINS FOR ORDER] User: ${userId}, Order: ₹${orderValue}, Coins: ${coinsToRedeem}, OrderID: ${orderId}`);
    
    // Get user with current balance
    const user = await User.findById(userId);
    if (!user) {
      return {
        success: false,
        message: 'User not found'
      };
    }
    
    const availableCoins = user.wallet.balance;
    console.log(`[REDEEM COINS FOR ORDER] Current balance: ${availableCoins}`);
    
    // Validate redemption
    const validation = validateRedemption(orderValue, coinsToRedeem, availableCoins);
    
    if (!validation.isValid) {
      console.log(`[REDEEM COINS FOR ORDER] Validation failed:`, validation.errors);
      return {
        success: false,
        message: validation.errors.join(', '),
        errors: validation.errors
      };
    }
    
    // Deduct coins from wallet
    const discountAmount = validation.discountAmount;
    const description = generateRedemptionDescription(coinsToRedeem, discountAmount, orderId);
    
    try {
      const newBalance = await user.deductCoins(coinsToRedeem, 'COIN_REDEMPTION', description, orderId);
      console.log(`[REDEEM COINS FOR ORDER] Successfully deducted ${coinsToRedeem} coins, new balance: ${newBalance}`);
      
      // Get the transaction ID that was just created
      const transaction = await Transaction.findOne({
        userId: userId,
        type: 'COIN_REDEMPTION',
        amount: -coinsToRedeem,
        orderId: orderId
      }).sort({ createdAt: -1 });
      
      return {
        success: true,
        transactionId: transaction ? transaction._id : null,
        coinsRedeemed: coinsToRedeem,
        discountApplied: discountAmount,
        remainingBalance: newBalance
      };
      
    } catch (deductionError) {
      console.error('[REDEEM COINS FOR ORDER] Deduction failed:', deductionError);
      return {
        success: false,
        message: 'Failed to deduct coins from wallet'
      };
    }
    
  } catch (error) {
    console.error('[REDEEM COINS FOR ORDER] Error:', error);
    return {
      success: false,
      message: 'Failed to process coin redemption'
    };
  }
};

// ADMIN FUNCTIONS

// Adjust user wallet balance
export const adjustWalletBalance = async (req, res) => {
  const { userId } = req.params;
  const { 
    amount, 
    type, // 'add' or 'deduct'
    reason, 
    note,
    adminId 
  } = req.body;

  if (!amount || amount <= 0) {
    return res.status(400).json({
      success: false,
      message: 'Amount must be greater than 0'
    });
  }

  if (!['add', 'deduct'].includes(type)) {
    return res.status(400).json({
      success: false,
      message: 'Type must be either "add" or "deduct"'
    });
  }

  try {
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const adjustmentAmount = type === 'add' ? amount : -amount;
    const newBalance = user.wallet.balance + adjustmentAmount;

    if (newBalance < 0) {
      return res.status(400).json({
        success: false,
        message: 'Insufficient wallet balance for deduction'
      });
    }

    // Update user wallet
    user.wallet.balance = newBalance;
    if (type === 'add') {
      user.wallet.totalEarned += amount;
    } else {
      user.wallet.totalSpent += amount;
    }
    
    await user.save();

    // Create transaction record
    const transaction = new Transaction({
      userId,
      type: 'MANUAL_ADJUSTMENT',
      amount,
      description: `Admin adjustment: ${reason}`,
      note,
      source: 'admin_adjustment',
      status: 'COMPLETED',
      adminId,
      balanceAfter: newBalance
    });

    await transaction.save();

    // Create and (optionally) send a wallet update notification to the user
    try {
      const title = 'Wallet Updated';
      const msg = type === 'add'
        ? `Your wallet has been credited with ${amount} coins. Reason: ${reason}.`
        : `Your wallet has been debited by ${amount} coins. Reason: ${reason}.`;

      const notification = new Notification({
        userId,
        title,
        message: msg,
        type: 'general',
        priority: 'normal',
        isRead: false,
        sentChannels: [],
        status: 'pending',
        createdAt: new Date(),
      });

      await notification.save();

      if (Array.isArray(user.pushTokens) && user.pushTokens.length > 0) {
        try {
          await sendPushNotification(user.pushTokens, {
            title,
            body: msg,
            data: {
              notificationId: notification._id.toString(),
              type: 'wallet',
            },
          });
          notification.sentChannels.push('push');
          notification.status = 'sent';
          notification.sentAt = new Date();
          await notification.save();
        } catch (pushErr) {
          console.error('[WALLET ADJUST PUSH] Failed:', pushErr);
          notification.status = 'failed';
          await notification.save();
        }
      }

      // Send PWA web push if user subscribed
      try {
        await notifyWalletUpdateWeb(user._id, { amount, type: type === 'add' ? 'credit' : 'debit' });
      } catch (webPushErr) {
        // Non-blocking
        console.warn('[WALLET ADJUST WEB PUSH] Failed:', webPushErr?.message || webPushErr);
      }
    } catch (notifyErr) {
      console.error('[WALLET ADJUST NOTIFY] Error creating/sending notification:', notifyErr);
      // Continue without failing the wallet adjustment
    }

    res.json({
      success: true,
      message: `Wallet balance ${type === 'add' ? 'added' : 'deducted'} successfully`,
      walletBalance: newBalance,
      transaction: {
        id: transaction._id,
        amount: transaction.amount,
        type: transaction.type,
        description: transaction.description,
        timestamp: transaction.createdAt
      }
    });
  } catch (error) {
    console.error('Error adjusting wallet balance:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to adjust wallet balance'
    });
  }
};

// Get user wallet history for admin
export const getUserWalletHistory = async (req, res) => {
  const { userId } = req.params;
  const { page = 1, limit = 20 } = req.query;

  try {
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const [transactions, total] = await Promise.all([
      Transaction.find({ userId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .populate('adminId', 'name email', 'Admin')
        .lean(),
      Transaction.countDocuments({ userId })
    ]);

    const totalPages = Math.ceil(total / parseInt(limit));

    res.json({
      transactions,
      total,
      page: parseInt(page),
      totalPages,
      hasMore: parseInt(page) < totalPages
    });
  } catch (error) {
    console.error('Error fetching wallet history:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch wallet history'
    });
  }
};

// Get wallet statistics for admin dashboard
export const getWalletStatistics = async (req, res) => {
  try {
    // Overall wallet statistics
    const walletStats = await User.aggregate([
      {
        $group: {
          _id: null,
          totalWalletBalance: { $sum: '$wallet.balance' },
          totalCoinsDistributed: { $sum: '$wallet.totalEarned' },
          totalCoinsRedeemed: { $sum: '$wallet.totalSpent' },
          averageWalletBalance: { $avg: '$wallet.balance' },
          usersWithWallet: { 
            $sum: { 
              $cond: [{ $gt: ['$wallet.balance', 0] }, 1, 0] 
            } 
          }
        }
      }
    ]);

    const stats = walletStats[0] || {
      totalWalletBalance: 0,
      totalCoinsDistributed: 0,
      totalCoinsRedeemed: 0,
      averageWalletBalance: 0,
      usersWithWallet: 0
    };

    // Recent wallet transactions
    const recentTransactions = await Transaction.find()
      .sort({ createdAt: -1 })
      .limit(10)
      .populate('userId', 'name email')
      .populate('adminId', 'name email', 'Admin')
      .lean();

    // Top wallet balances
    const topWalletUsers = await User.find({
      'wallet.balance': { $gt: 0 }
    })
      .sort({ 'wallet.balance': -1 })
      .limit(10)
      .select('name email wallet.balance wallet.totalEarned wallet.totalSpent')
      .lean();

    res.json({
      success: true,
      statistics: stats,
      recentTransactions,
      topWalletUsers
    });
  } catch (error) {
    console.error('Error fetching wallet statistics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch wallet statistics'
    });
  }
};

// Bulk wallet operations
export const bulkWalletOperation = async (req, res) => {
  const { 
    userIds, 
    operation, // 'add' or 'deduct'
    amount, 
    reason, 
    note,
    adminId 
  } = req.body;

  if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'User IDs array is required'
    });
  }

  if (!amount || amount <= 0) {
    return res.status(400).json({
      success: false,
      message: 'Amount must be greater than 0'
    });
  }

  if (!['add', 'deduct'].includes(operation)) {
    return res.status(400).json({
      success: false,
      message: 'Operation must be either "add" or "deduct"'
    });
  }

  try {
    const users = await User.find({ _id: { $in: userIds } });
    
    if (users.length !== userIds.length) {
      return res.status(400).json({
        success: false,
        message: 'Some users not found'
      });
    }

    const results = [];
    const transactions = [];

    for (const user of users) {
      const adjustmentAmount = operation === 'add' ? amount : -amount;
      const newBalance = user.wallet.balance + adjustmentAmount;

      if (operation === 'deduct' && newBalance < 0) {
        results.push({
          userId: user._id,
          name: user.name,
          success: false,
          error: 'Insufficient wallet balance'
        });
        continue;
      }

      // Update wallet
      user.wallet.balance = newBalance;
      if (operation === 'add') {
        user.wallet.totalEarned += amount;
      } else {
        user.wallet.totalSpent += amount;
      }

      await user.save();

      // Prepare transaction record
      const transaction = new Transaction({
        userId: user._id,
        type: 'MANUAL_ADJUSTMENT',
        amount,
        description: `Bulk admin adjustment: ${reason}`,
        note,
        source: 'bulk_admin_adjustment',
        status: 'COMPLETED',
        adminId,
        balanceAfter: newBalance
      });

      transactions.push(transaction);

      results.push({
        userId: user._id,
        name: user.name,
        success: true,
        previousBalance: user.wallet.balance - adjustmentAmount,
        newBalance: newBalance
      });
    }

    // Save all transactions
    await Transaction.insertMany(transactions);

    const successCount = results.filter(r => r.success).length;
    const failureCount = results.filter(r => !r.success).length;

    res.json({
      success: true,
      message: `Bulk operation completed. ${successCount} successful, ${failureCount} failed.`,
      results,
      summary: {
        total: userIds.length,
        successful: successCount,
        failed: failureCount,
        totalAmountProcessed: successCount * amount
      }
    });
  } catch (error) {
    console.error('Error performing bulk wallet operation:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to perform bulk wallet operation'
    });
  }
};
