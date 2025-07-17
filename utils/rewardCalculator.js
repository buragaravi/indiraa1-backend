// Reward calculation utilities for Indira Coins system

/**
 * Calculate Indira Coins for order rewards
 * Formula: 5 coins for every ₹100 spent
 * @param {number} orderAmount - Total order amount in rupees
 * @returns {number} - Number of Indira Coins to award
 */
export const calculateOrderReward = (orderAmount) => {
  if (!orderAmount || orderAmount < 0) return 0;
  
  const COINS_PER_HUNDRED = 5;
  const RUPEES_PER_REWARD = 100;
  
  // Math.floor ensures we ignore decimal values
  const rewardGroups = Math.floor(orderAmount / RUPEES_PER_REWARD);
  return rewardGroups * COINS_PER_HUNDRED;
};

/**
 * Calculate visit-based rewards for referrals
 * Formula: 2 coins for every 10 unique visitors (2+ minute visits)
 * @param {number} validVisitCount - Number of valid unique visits
 * @returns {number} - Number of Indira Coins to award
 */
export const calculateVisitReward = (validVisitCount) => {
  if (!validVisitCount || validVisitCount < 0) return 0;
  
  const COINS_PER_TEN_VISITS = 2;
  const VISITS_PER_REWARD = 10;
  
  const rewardGroups = Math.floor(validVisitCount / VISITS_PER_REWARD);
  return rewardGroups * COINS_PER_TEN_VISITS;
};

/**
 * Constants for different reward types
 */
export const REWARD_CONSTANTS = {
  // Order rewards
  ORDER_COINS_PER_HUNDRED: 5,
  ORDER_RUPEES_PER_REWARD: 100,
  
  // Referral rewards
  REFERRAL_REGISTRATION_BONUS: 20, // Coins for successful referral registration
  VISIT_COINS_PER_TEN: 2,         // Coins for every 10 valid visits
  VISITS_PER_REWARD: 10,          // Number of visits needed for reward
  MINIMUM_VISIT_DURATION: 120,    // Minimum visit duration in seconds (2 minutes)
  
  // Transaction types
  TRANSACTION_TYPES: {
    ORDER_REWARD: 'ORDER_REWARD',
    REFERRAL_BONUS: 'REFERRAL_BONUS',
    VISIT_REWARD: 'VISIT_REWARD',
    COIN_REDEMPTION: 'COIN_REDEMPTION',
    MANUAL_ADJUSTMENT: 'MANUAL_ADJUSTMENT'
  }
};

/**
 * Create transaction description for order rewards
 * @param {number} orderAmount - Order amount
 * @param {string} orderId - Order ID
 * @param {number} coinsAwarded - Coins awarded
 * @returns {string} - Transaction description
 */
export const createOrderRewardDescription = (orderAmount, orderId, coinsAwarded) => {
  return `Order reward: ${coinsAwarded} coins for ₹${orderAmount} purchase (Order #${orderId.slice(-8)})`;
};

/**
 * Create transaction description for referral bonus
 * @param {string} referredUserName - Name of referred user
 * @param {string} referralCode - Referral code used
 * @returns {string} - Transaction description
 */
export const createReferralBonusDescription = (referredUserName, referralCode) => {
  return `Referral bonus: ${REWARD_CONSTANTS.REFERRAL_REGISTRATION_BONUS} coins for referring ${referredUserName} (Code: ${referralCode})`;
};

/**
 * Create transaction description for visit rewards
 * @param {number} visitCount - Number of visits that triggered reward
 * @param {number} coinsAwarded - Coins awarded
 * @returns {string} - Transaction description
 */
export const createVisitRewardDescription = (visitCount, coinsAwarded) => {
  return `Visit reward: ${coinsAwarded} coins for ${visitCount} referral visits`;
};

/**
 * Validate order amount for reward calculation
 * @param {number} orderAmount - Order amount to validate
 * @returns {boolean} - Whether amount is valid for rewards
 */
export const isValidOrderAmount = (orderAmount) => {
  return orderAmount && 
         typeof orderAmount === 'number' && 
         orderAmount > 0 && 
         orderAmount >= REWARD_CONSTANTS.ORDER_RUPEES_PER_REWARD;
};

/**
 * Generate reward summary for frontend display
 * @param {number} orderAmount - Order amount
 * @returns {object} - Reward calculation breakdown
 */
export const getRewardSummary = (orderAmount) => {
  const coins = calculateOrderReward(orderAmount);
  const rewardGroups = Math.floor(orderAmount / REWARD_CONSTANTS.ORDER_RUPEES_PER_REWARD);
  
  return {
    orderAmount,
    coinsAwarded: coins,
    rewardGroups,
    coinsPerGroup: REWARD_CONSTANTS.ORDER_COINS_PER_HUNDRED,
    rupeesPerGroup: REWARD_CONSTANTS.ORDER_RUPEES_PER_REWARD,
    calculation: `₹${orderAmount} ÷ ₹${REWARD_CONSTANTS.ORDER_RUPEES_PER_REWARD} = ${rewardGroups} groups × ${REWARD_CONSTANTS.ORDER_COINS_PER_HUNDRED} coins = ${coins} coins`
  };
};

/**
 * Test function to validate reward calculations
 */
export const testRewardCalculations = () => {
  const testCases = [
    { amount: 99, expected: 0 },
    { amount: 100, expected: 5 },
    { amount: 250, expected: 10 },
    { amount: 525, expected: 25 },
    { amount: 1000, expected: 50 }
  ];
  
  console.log('🧮 Testing Reward Calculations:');
  testCases.forEach(({ amount, expected }) => {
    const result = calculateOrderReward(amount);
    const status = result === expected ? '✅' : '❌';
    console.log(`${status} ₹${amount} → ${result} coins (expected: ${expected})`);
  });
  
  // Test visit rewards
  console.log('\n🔗 Testing Visit Rewards:');
  const visitTests = [
    { visits: 5, expected: 0 },
    { visits: 10, expected: 2 },
    { visits: 25, expected: 4 },
    { visits: 50, expected: 10 }
  ];
  
  visitTests.forEach(({ visits, expected }) => {
    const result = calculateVisitReward(visits);
    const status = result === expected ? '✅' : '❌';
    console.log(`${status} ${visits} visits → ${result} coins (expected: ${expected})`);
  });
};
