import { 
  calculateOrderReward, 
  createOrderRewardDescription,
  REWARD_CONSTANTS,
  isValidOrderAmount 
} from '../utils/rewardCalculator.js';
import { addCoinsToWallet } from '../controllers/walletController.js';

/**
 * Middleware to automatically process order rewards when order is completed
 * This should be called after order status is updated to 'Delivered'
 */
export const processOrderRewards = async (order) => {
  try {
    console.log(`[ORDER REWARDS] Processing order ${order._id} with status: ${order.status}, amount: ₹${order.totalAmount}`);
    
    // Only process rewards for delivered orders
    if (order.status !== 'Delivered') {
      console.log(`[ORDER REWARDS] Order ${order._id} not delivered (status: ${order.status}), skipping rewards`);
      return null;
    }
    
    // Check if order amount qualifies for rewards
    if (!isValidOrderAmount(order.totalAmount)) {
      console.log(`[ORDER REWARDS] Order ${order._id} amount ₹${order.totalAmount} below minimum ₹${REWARD_CONSTANTS.ORDER_RUPEES_PER_REWARD} for rewards`);
      return null;
    }
    
    // Check if rewards have already been processed for this order
    const Transaction = (await import('../models/Transaction.js')).default;
    const existingReward = await Transaction.findOne({
      orderId: order._id,
      type: REWARD_CONSTANTS.TRANSACTION_TYPES.ORDER_REWARD
    });
    
    if (existingReward) {
      console.log(`[ORDER REWARDS] Rewards already processed for order ${order._id} on ${existingReward.createdAt}`);
      return existingReward;
    }
    
    // Calculate reward coins
    const coinsToAward = calculateOrderReward(order.totalAmount);
    console.log(`[ORDER REWARDS] Calculated ${coinsToAward} coins for order amount ₹${order.totalAmount}`);
    
    if (coinsToAward <= 0) {
      console.log(`[ORDER REWARDS] No coins to award for order ${order._id} (calculated: ${coinsToAward})`);
      return null;
    }
    
    // Create transaction description
    const description = createOrderRewardDescription(
      order.totalAmount, 
      order._id.toString(), 
      coinsToAward
    );
    
    console.log(`[ORDER REWARDS] Attempting to award ${coinsToAward} coins to user ${order.userId}`);
    
    // Award coins to user
    const result = await addCoinsToWallet(
      order.userId,
      coinsToAward,
      REWARD_CONSTANTS.TRANSACTION_TYPES.ORDER_REWARD,
      description,
      order._id
    );
    
    console.log(`[ORDER REWARDS] SUCCESS: Awarded ${coinsToAward} coins to user ${order.userId} for order ${order._id} (₹${order.totalAmount})`);
    
    return {
      success: true,
      coinsAwarded: coinsToAward,
      orderAmount: order.totalAmount,
      newBalance: result.newBalance,
      description
    };
    
  } catch (error) {
    console.error('[ORDER REWARDS ERROR] Failed to process rewards for order:', order._id);
    console.error('[ORDER REWARDS ERROR] Error details:', error);
    console.error('[ORDER REWARDS ERROR] Stack trace:', error.stack);
    throw error;
  }
};

/**
 * Express middleware to process rewards after order status update
 * Usage: Add this middleware after order update endpoints
 */
export const orderRewardMiddleware = async (req, res, next) => {
  try {
    // Store original res.json to capture order data
    const originalJson = res.json.bind(res);
    
    res.json = function(data) {
      // Check if response contains order data and order is delivered
      if (data.success && data.order && data.order.status === 'Delivered') {
        // Process rewards asynchronously (don't block response)
        processOrderRewards(data.order)
          .then(result => {
            if (result) {
              console.log(`[MIDDLEWARE] Order rewards processed: ${result.coinsAwarded} coins`);
            }
          })
          .catch(error => {
            console.error('[MIDDLEWARE] Order rewards processing failed:', error);
          });
      }
      
      // Send original response
      return originalJson(data);
    };
    
    next();
  } catch (error) {
    console.error('[ORDER REWARD MIDDLEWARE]', error);
    next();
  }
};

/**
 * Utility function to recalculate and fix any missing order rewards
 * This can be called by admin to backfill rewards for existing orders
 */
export const backfillOrderRewards = async () => {
  try {
    const Order = (await import('../models/Order.js')).default;
    const Transaction = (await import('../models/Transaction.js')).default;
    
    console.log('[BACKFILL] Starting order rewards backfill...');
    
    // Find all delivered orders
    const deliveredOrders = await Order.find({ 
      status: 'Delivered',
      totalAmount: { $gte: REWARD_CONSTANTS.ORDER_RUPEES_PER_REWARD }
    });
    
    console.log(`[BACKFILL] Found ${deliveredOrders.length} delivered orders to check`);
    
    let processedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    
    for (const order of deliveredOrders) {
      try {
        // Check if rewards already exist
        const existingReward = await Transaction.findOne({
          orderId: order._id,
          type: REWARD_CONSTANTS.TRANSACTION_TYPES.ORDER_REWARD
        });
        
        if (existingReward) {
          skippedCount++;
          continue;
        }
        
        // Process rewards
        const result = await processOrderRewards(order);
        if (result) {
          processedCount++;
          console.log(`[BACKFILL] Processed order ${order._id}: ${result.coinsAwarded} coins`);
        }
        
      } catch (error) {
        errorCount++;
        console.error(`[BACKFILL] Error processing order ${order._id}:`, error);
      }
    }
    
    console.log(`[BACKFILL] Completed: ${processedCount} processed, ${skippedCount} skipped, ${errorCount} errors`);
    
    return {
      success: true,
      totalOrders: deliveredOrders.length,
      processed: processedCount,
      skipped: skippedCount,
      errors: errorCount
    };
    
  } catch (error) {
    console.error('[BACKFILL ERROR]', error);
    throw error;
  }
};

/**
 * Middleware to validate reward-related requests
 */
export const validateRewardRequest = (req, res, next) => {
  try {
    const { amount, type } = req.body;
    
    // Validate amount
    if (amount !== undefined) {
      if (typeof amount !== 'number' || amount < 0) {
        return res.status(400).json({
          success: false,
          message: 'Invalid amount: must be a positive number'
        });
      }
    }
    
    // Validate transaction type
    if (type && !Object.values(REWARD_CONSTANTS.TRANSACTION_TYPES).includes(type)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid transaction type'
      });
    }
    
    next();
  } catch (error) {
    console.error('[VALIDATE REWARD REQUEST]', error);
    res.status(500).json({
      success: false,
      message: 'Validation error'
    });
  }
};

export default {
  processOrderRewards,
  orderRewardMiddleware,
  backfillOrderRewards,
  validateRewardRequest
};
