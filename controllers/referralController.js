import User from '../models/User.js';
import ReferralVisit from '../models/ReferralVisit.js';
import Transaction from '../models/Transaction.js';
import { 
  REWARD_CONSTANTS, 
  calculateVisitReward,
  createReferralBonusDescription,
  createVisitRewardDescription 
} from '../utils/rewardCalculator.js';
import { addCoinsToWallet } from './walletController.js';

// Get user's referral code (generate if doesn't exist)
export const getReferralCode = async (req, res) => {
  try {
    const userId = req.user.id;
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // Generate referral code if user doesn't have one
    if (!user.referralCode) {
      user.generateReferralCode();
      await user.save();
    }
    
    res.json({
      success: true,
      referralCode: user.referralCode,
      referralLink: `${process.env.FRONTEND_URL || 'http://localhost:5173'}?ref=${user.referralCode}`,
      stats: user.referralStats
    });
    
  } catch (error) {
    console.error('[GET REFERRAL CODE]', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get referral code'
    });
  }
};

// Validate referral code (used during registration)
export const validateReferralCode = async (req, res) => {
  try {
    const { referralCode } = req.body;
    
    if (!referralCode) {
      return res.status(400).json({
        success: false,
        message: 'Referral code is required'
      });
    }
    
    const referrer = await User.findOne({ referralCode }).select('_id name username referralCode');
    
    if (!referrer) {
      return res.status(404).json({
        success: false,
        message: 'Invalid referral code'
      });
    }
    
    res.json({
      success: true,
      message: 'Valid referral code',
      referrer: {
        id: referrer._id,
        name: referrer.name,
        username: referrer.username
      }
    });
    
  } catch (error) {
    console.error('[VALIDATE REFERRAL CODE]', error);
    res.status(500).json({
      success: false,
      message: 'Failed to validate referral code'
    });
  }
};

// Track referral visit
export const trackReferralVisit = async (req, res) => {
  try {
    const { 
      referralCode, 
      deviceFingerprint, 
      ipAddress, 
      userAgent, 
      browserInfo,
      source = 'direct'
    } = req.body;
    
    if (!referralCode || !deviceFingerprint || !ipAddress) {
      return res.status(400).json({
        success: false,
        message: 'Referral code, device fingerprint, and IP address are required'
      });
    }
    
    // Find referrer
    const referrer = await User.findOne({ referralCode });
    if (!referrer) {
      return res.status(404).json({
        success: false,
        message: 'Invalid referral code'
      });
    }
    
    // Check if this device has visited this referrer before
    const isUniqueDevice = await ReferralVisit.isUniqueDevice(deviceFingerprint, referrer._id);
    
    // Create visit record
    const visit = new ReferralVisit({
      referrerId: referrer._id,
      referralCode,
      deviceFingerprint,
      ipAddress,
      userAgent,
      browserInfo,
      source,
      isUniqueDevice
    });
    
    await visit.save();
    
    // Update referrer's total visit count
    referrer.referralStats.totalVisits += 1;
    if (isUniqueDevice) {
      referrer.referralStats.uniqueVisits += 1;
    }
    await referrer.save();
    
    res.json({
      success: true,
      message: 'Visit tracked successfully',
      visitId: visit._id,
      isUniqueDevice
    });
    
  } catch (error) {
    console.error('[TRACK REFERRAL VISIT]', error);
    res.status(500).json({
      success: false,
      message: 'Failed to track referral visit'
    });
  }
};

// Update visit duration (called when user leaves page)
export const updateVisitDuration = async (req, res) => {
  try {
    const { visitId, endTime } = req.body;
    
    console.log(`[UPDATE VISIT DURATION] Updating visit ${visitId} with endTime: ${endTime}`);
    
    if (!visitId || !endTime) {
      return res.status(400).json({
        success: false,
        message: 'Visit ID and end time are required'
      });
    }
    
    const visit = await ReferralVisit.findById(visitId);
    if (!visit) {
      console.log(`[UPDATE VISIT DURATION] Visit not found: ${visitId}`);
      return res.status(404).json({
        success: false,
        message: 'Visit not found'
      });
    }
    
    console.log(`[UPDATE VISIT DURATION] Current visit status - duration: ${visit.visitDuration}s, isValid: ${visit.isValidVisit}, rewardEligible: ${visit.rewardEligible}`);
    
    // Update visit duration
    await visit.updateVisitDuration(new Date(endTime));
    
    console.log(`[UPDATE VISIT DURATION] Updated visit status - duration: ${visit.visitDuration}s, isValid: ${visit.isValidVisit}, rewardEligible: ${visit.rewardEligible}`);
    
    // If this visit becomes reward-eligible, check if we should award coins
    if (visit.rewardEligible && !visit.rewardProcessed) {
      console.log(`[UPDATE VISIT DURATION] Visit is reward eligible, processing rewards for referrer ${visit.referrerId}`);
      await processVisitRewards(visit.referrerId);
    }
    
    res.json({
      success: true,
      message: 'Visit duration updated',
      visitDuration: visit.visitDuration,
      isValidVisit: visit.isValidVisit,
      rewardEligible: visit.rewardEligible
    });
    
  } catch (error) {
    console.error('[UPDATE VISIT DURATION]', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update visit duration'
    });
  }
};

// Internal function to process visit rewards
const processVisitRewards = async (referrerId) => {
  try {
    console.log(`[PROCESS VISIT REWARDS] Processing rewards for referrer ${referrerId}`);
    
    // Get all unprocessed reward-eligible visits
    const eligibleVisits = await ReferralVisit.getRewardEligibleVisits(referrerId);
    const visitCount = eligibleVisits.length;
    
    console.log(`[PROCESS VISIT REWARDS] Found ${visitCount} eligible visits for referrer ${referrerId}`);
    
    if (visitCount === 0) {
      console.log(`[PROCESS VISIT REWARDS] No eligible visits to process for referrer ${referrerId}`);
      return;
    }
    
    // Calculate rewards (2 coins per 10 visits)
    const coinsToAward = calculateVisitReward(visitCount);
    
    console.log(`[PROCESS VISIT REWARDS] Calculated ${coinsToAward} coins for ${visitCount} visits (referrer ${referrerId})`);
    
    if (coinsToAward > 0) {
      console.log(`[PROCESS VISIT REWARDS] Awarding ${coinsToAward} coins to referrer ${referrerId}`);
      
      // Award coins to referrer
      const description = createVisitRewardDescription(visitCount, coinsToAward);
      await addCoinsToWallet(
        referrerId,
        coinsToAward,
        REWARD_CONSTANTS.TRANSACTION_TYPES.VISIT_REWARD,
        description
      );
      
      // Mark visits as processed (only the ones that contributed to the reward)
      const visitsToProcess = Math.floor(visitCount / 10) * 10; // Process in groups of 10
      const visitIds = eligibleVisits.slice(0, visitsToProcess).map(v => v._id);
      
      console.log(`[PROCESS VISIT REWARDS] Marking ${visitIds.length} visits as processed`);
      
      await ReferralVisit.updateMany(
        { _id: { $in: visitIds } },
        { rewardProcessed: true }
      );
      
      console.log(`[PROCESS VISIT REWARDS] SUCCESS: Awarded ${coinsToAward} coins to user ${referrerId} for ${visitsToProcess} visits`);
    } else {
      console.log(`[PROCESS VISIT REWARDS] No coins to award yet (${visitCount} visits, need 10 for reward)`);
    }
    
  } catch (error) {
    console.error('[PROCESS VISIT REWARDS] Error:', error);
  }
};

// Get referral statistics
export const getReferralStats = async (req, res) => {
  try {
    const userId = req.user.id;
    
    const user = await User.findById(userId).select('referralStats referralCode');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // Get detailed visit stats
    const visitStats = await ReferralVisit.getReferrerStats(userId);
    
    // Get recent referrals (users who registered with this user's code)
    const recentReferrals = await User.find({ referredBy: userId })
      .select('name username createdAt')
      .sort({ createdAt: -1 })
      .limit(10);
    
    // Get recent visit activity (last 30 days)
    const recentVisits = await ReferralVisit.find({ 
      referrerId: userId,
      createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
    })
    .select('visitDuration isValidVisit isUniqueDevice source createdAt')
    .sort({ createdAt: -1 })
    .limit(20);
    
    // Get referral earnings
    const referralEarnings = await Transaction.find({
      userId,
      type: { $in: [REWARD_CONSTANTS.TRANSACTION_TYPES.REFERRAL_BONUS, REWARD_CONSTANTS.TRANSACTION_TYPES.VISIT_REWARD] }
    })
    .select('amount type description createdAt')
    .sort({ createdAt: -1 });
    
    const totalReferralEarnings = referralEarnings.reduce((sum, t) => sum + t.amount, 0);
    
    res.json({
      success: true,
      stats: {
        ...user.referralStats.toObject(),
        ...visitStats,
        totalReferralEarnings,
        pendingVisitRewards: calculateVisitReward(visitStats.rewardEligibleVisits || 0)
      },
      recentReferrals,
      recentVisits,
      referralEarnings,
      referralCode: user.referralCode,
      referralLink: `${process.env.FRONTEND_URL || 'http://localhost:5173'}?ref=${user.referralCode}`
    });
    
  } catch (error) {
    console.error('[GET REFERRAL STATS]', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get referral statistics'
    });
  }
};

// Process referral registration bonus
export const processReferralRegistration = async (referredUserId, referralCode) => {
  try {
    console.log(`[REFERRAL DEBUG] Starting processReferralRegistration - userId: ${referredUserId}, code: ${referralCode}`);
    
    if (!referralCode) {
      console.log('[REFERRAL DEBUG] No referral code provided');
      return null;
    }
    
    // Find referrer
    console.log(`[REFERRAL DEBUG] Looking for referrer with code: ${referralCode}`);
    const referrer = await User.findOne({ referralCode });
    if (!referrer) {
      console.log(`[REFERRAL DEBUG] No referrer found with code: ${referralCode}`);
      throw new Error('Invalid referral code');
    }
    
    console.log(`[REFERRAL DEBUG] Referrer found: ${referrer.name} (${referrer._id})`);
    
    // Update referred user
    console.log(`[REFERRAL DEBUG] Updating referred user ${referredUserId} with referrer ${referrer._id}`);
    const updateResult = await User.findByIdAndUpdate(
      referredUserId, 
      { referredBy: referrer._id }, 
      { new: true }
    );
    console.log(`[REFERRAL DEBUG] Referred user update result:`, updateResult ? 'Success' : 'Failed');
    
    // Update referrer stats
    console.log(`[REFERRAL DEBUG] Updating referrer stats - current totalReferrals: ${referrer.referralStats.totalReferrals}`);
    referrer.referralStats.totalReferrals += 1;
    await referrer.save();
    console.log(`[REFERRAL DEBUG] Referrer stats updated - new totalReferrals: ${referrer.referralStats.totalReferrals}`);
    
    // Get referred user details for description
    const referredUser = await User.findById(referredUserId);
    console.log(`[REFERRAL DEBUG] Referred user: ${referredUser?.name}`);
    
    // Award referral bonus to referrer (20 coins)
    const description = createReferralBonusDescription(
      referredUser.name,
      referralCode
    );
    
    console.log(`[REFERRAL DEBUG] Awarding ${REWARD_CONSTANTS.REFERRAL_REGISTRATION_BONUS} coins to referrer ${referrer._id}`);
    console.log(`[REFERRAL DEBUG] Transaction description: ${description}`);
    
    const walletResult = await addCoinsToWallet(
      referrer._id,
      REWARD_CONSTANTS.REFERRAL_REGISTRATION_BONUS,
      REWARD_CONSTANTS.TRANSACTION_TYPES.REFERRAL_BONUS,
      description,
      null,
      referredUserId
    );
    
    console.log(`[REFERRAL DEBUG] Wallet updated successfully:`, walletResult);
    
    // Mark any existing visits from this user as registered
    const visitUpdateResult = await ReferralVisit.updateMany(
      { referrerId: referrer._id, registeredUserId: { $exists: false } },
      { hasRegistered: true, registeredUserId: referredUserId }
    );
    
    console.log(`[REFERRAL DEBUG] Visit records updated:`, visitUpdateResult);
    
    const result = {
      success: true,
      referrer: {
        id: referrer._id,
        name: referrer.name,
        coinsAwarded: REWARD_CONSTANTS.REFERRAL_REGISTRATION_BONUS
      }
    };
    
    console.log(`[REFERRAL DEBUG] processReferralRegistration completed successfully:`, result);
    return result;
    
  } catch (error) {
    console.error('[PROCESS REFERRAL REGISTRATION] Error:', error);
    throw error;
  }
};

// Get referral leaderboard (top referrers)
export const getReferralLeaderboard = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const timeframe = req.query.timeframe || 'all'; // 'all', '30d', '7d'
    
    let dateFilter = {};
    if (timeframe !== 'all') {
      const days = timeframe === '7d' ? 7 : 30;
      dateFilter = {
        createdAt: { $gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000) }
      };
    }
    
    // Get top referrers by successful referrals
    const topReferrers = await User.aggregate([
      {
        $match: {
          'referralStats.successfulReferrals': { $gt: 0 }
        }
      },
      {
        $project: {
          name: 1,
          username: 1,
          referralCode: 1,
          successfulReferrals: '$referralStats.successfulReferrals',
          totalVisits: '$referralStats.totalVisits',
          coinsEarned: '$referralStats.coinsEarnedFromReferrals'
        }
      },
      { $sort: { successfulReferrals: -1, coinsEarned: -1 } },
      { $limit: limit }
    ]);
    
    res.json({
      success: true,
      leaderboard: topReferrers,
      timeframe,
      total: topReferrers.length
    });
    
  } catch (error) {
    console.error('[GET REFERRAL LEADERBOARD]', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get referral leaderboard'
    });
  }
};
