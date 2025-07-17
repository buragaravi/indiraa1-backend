// Coin redemption utilities for discount calculations

/**
 * Constants for coin redemption system
 */
export const REDEMPTION_CONSTANTS = {
  COINS_PER_RUPEE: 5,           // 5 coins = ₹1 discount
  MAX_DISCOUNT_PERCENTAGE: 10,  // Maximum 10% discount
  MIN_REDEMPTION_COINS: 5,      // Minimum 5 coins to redeem (₹1)
  MIN_ORDER_VALUE: 100          // Minimum order value to allow redemption
};

/**
 * Calculate maximum discount allowed based on order value
 * @param {number} orderValue - Total order amount in rupees
 * @returns {number} - Maximum discount amount in rupees
 */
export const calculateMaxDiscount = (orderValue) => {
  if (!orderValue || orderValue < REDEMPTION_CONSTANTS.MIN_ORDER_VALUE) {
    return 0;
  }
  
  return Math.floor(orderValue * (REDEMPTION_CONSTANTS.MAX_DISCOUNT_PERCENTAGE / 100));
};

/**
 * Calculate discount amount from coins
 * @param {number} coinAmount - Number of coins to redeem
 * @returns {number} - Discount amount in rupees
 */
export const calculateDiscountFromCoins = (coinAmount) => {
  if (!coinAmount || coinAmount < REDEMPTION_CONSTANTS.MIN_REDEMPTION_COINS) {
    return 0;
  }
  
  return Math.floor(coinAmount / REDEMPTION_CONSTANTS.COINS_PER_RUPEE);
};

/**
 * Calculate coins needed for a specific discount amount
 * @param {number} discountAmount - Desired discount in rupees
 * @returns {number} - Number of coins needed
 */
export const calculateCoinsNeeded = (discountAmount) => {
  if (!discountAmount || discountAmount <= 0) {
    return 0;
  }
  
  return discountAmount * REDEMPTION_CONSTANTS.COINS_PER_RUPEE;
};

/**
 * Get optimal redemption suggestions
 * @param {number} orderValue - Order amount in rupees
 * @param {number} availableCoins - User's available coin balance
 * @returns {object} - Redemption suggestions and limits
 */
export const getRedemptionSuggestions = (orderValue, availableCoins) => {
  const maxDiscount = calculateMaxDiscount(orderValue);
  const maxDiscountFromCoins = calculateDiscountFromCoins(availableCoins);
  
  // Optimal discount is the minimum of max allowed and what user can afford
  const optimalDiscount = Math.min(maxDiscount, maxDiscountFromCoins);
  const optimalCoins = calculateCoinsNeeded(optimalDiscount);
  
  // Alternative suggestion - use half coins for smaller discount
  const alternativeCoins = Math.floor(optimalCoins / 2);
  const alternativeDiscount = calculateDiscountFromCoins(alternativeCoins);
  
  return {
    maxPossibleDiscount: maxDiscount,
    coinsForMaxDiscount: calculateCoinsNeeded(maxDiscount),
    maxDiscountFromCoins: maxDiscountFromCoins,
    
    optimal: {
      coins: optimalCoins,
      discount: optimalDiscount,
      description: optimalDiscount === maxDiscount 
        ? "Maximum discount available" 
        : "Use all available coins"
    },
    
    alternative: alternativeCoins > 0 ? {
      coins: alternativeCoins,
      discount: alternativeDiscount,
      description: "Save some coins for future orders"
    } : null,
    
    limits: {
      minCoins: REDEMPTION_CONSTANTS.MIN_REDEMPTION_COINS,
      maxCoins: Math.min(availableCoins, calculateCoinsNeeded(maxDiscount)),
      minOrderValue: REDEMPTION_CONSTANTS.MIN_ORDER_VALUE
    }
  };
};

/**
 * Validate redemption request
 * @param {number} orderValue - Order amount
 * @param {number} coinsToRedeem - Coins user wants to redeem
 * @param {number} availableCoins - User's available balance
 * @returns {object} - Validation result
 */
export const validateRedemption = (orderValue, coinsToRedeem, availableCoins) => {
  const errors = [];
  
  // Check minimum order value
  if (orderValue < REDEMPTION_CONSTANTS.MIN_ORDER_VALUE) {
    errors.push(`Minimum order value of ₹${REDEMPTION_CONSTANTS.MIN_ORDER_VALUE} required for coin redemption`);
  }
  
  // Check minimum coins
  if (coinsToRedeem < REDEMPTION_CONSTANTS.MIN_REDEMPTION_COINS) {
    errors.push(`Minimum ${REDEMPTION_CONSTANTS.MIN_REDEMPTION_COINS} coins required for redemption`);
  }
  
  // Check sufficient balance
  if (coinsToRedeem > availableCoins) {
    errors.push(`Insufficient coin balance. Available: ${availableCoins}, Requested: ${coinsToRedeem}`);
  }
  
  // Check maximum discount limit
  const maxDiscount = calculateMaxDiscount(orderValue);
  const requestedDiscount = calculateDiscountFromCoins(coinsToRedeem);
  
  if (requestedDiscount > maxDiscount) {
    errors.push(`Maximum discount of ₹${maxDiscount} (10%) exceeded. Requested: ₹${requestedDiscount}`);
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    discountAmount: errors.length === 0 ? requestedDiscount : 0,
    finalAmount: errors.length === 0 ? orderValue - requestedDiscount : orderValue
  };
};

/**
 * Generate transaction description for coin redemption
 * @param {number} coinsRedeemed - Number of coins redeemed
 * @param {number} discountAmount - Discount amount received
 * @param {string} orderId - Order ID
 * @returns {string} - Transaction description
 */
export const generateRedemptionDescription = (coinsRedeemed, discountAmount, orderId) => {
  return `Coins redeemed: ${coinsRedeemed} coins for ₹${discountAmount} discount on order ${orderId}`;
};

/**
 * Calculate remaining coin balance after redemption
 * @param {number} currentBalance - Current coin balance
 * @param {number} coinsToRedeem - Coins being redeemed
 * @returns {number} - Remaining balance
 */
export const calculateRemainingBalance = (currentBalance, coinsToRedeem) => {
  return Math.max(0, currentBalance - coinsToRedeem);
};
