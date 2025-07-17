import express from 'express';
import { 
  getWalletBalance,
  getTransactionHistory,
  getWalletStats,
  manualWalletAdjustment,
  calculateDiscount,
  redeemCoins
} from '../controllers/walletController.js';
import { authenticateUser } from '../middleware/auth.js';
import { validateRewardRequest } from '../middleware/rewardMiddleware.js';

const router = express.Router();

// Existing wallet routes
router.get('/balance', authenticateUser, getWalletBalance);
router.get('/transactions', authenticateUser, getTransactionHistory);
router.get('/stats', authenticateUser, getWalletStats);
router.post('/adjust', authenticateUser, validateRewardRequest, manualWalletAdjustment);

// Phase 1: Coins Redemption Routes
router.post('/calculate-discount', authenticateUser, calculateDiscount);
router.post('/redeem-coins', authenticateUser, redeemCoins);

export default router;
