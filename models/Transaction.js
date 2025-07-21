import mongoose from 'mongoose';

const transactionSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  
  type: {
    type: String,
    enum: [
      'ORDER_REWARD',      // Coins earned from orders
      'REFERRAL_BONUS',    // Coins earned from successful referrals
      'VISIT_REWARD',      // Coins earned from referral visits
      'COIN_REDEMPTION',   // Coins spent/redeemed
      'REFUND',            // Coins credited from returns
      'PICKUP_CHARGE',     // Coins deducted for pickup charges
      'MANUAL_ADJUSTMENT'  // Admin adjustments
    ],
    required: true
  },
  
  amount: { 
    type: Number, 
    required: true 
  }, // Positive for credits, negative for debits
  
  description: { 
    type: String, 
    required: true 
  },
  
  // Reference to related order (for order rewards)
  orderId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Order' 
  },
  
  // Reference to return request (for refunds)
  returnId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Return' 
  },
  
  // Reference to referred user (for referral bonuses)
  referredUserId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User' 
  },
  
  // Wallet balance after this transaction
  balanceAfter: { 
    type: Number, 
    required: true 
  },
  
  // Transaction metadata
  metadata: {
    orderAmount: Number,        // For order rewards
    rewardRate: Number,         // Coins per 100 rupees
    referralCode: String,       // For referral transactions
    visitCount: Number,         // For visit rewards
    adminNote: String,          // For manual adjustments
    
    // Refund specific metadata
    refundDetails: {
      originalAmount: Number,   // Original rupee amount
      refundAmount: Number,     // Final refund amount after deductions
      conversionRate: { type: Number, default: 5 }, // 1 Rupee = 5 Coins
      deductions: [{
        type: String,
        amount: Number,
        reason: String
      }],
      processedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
      returnReason: String
    }
  },
  
  // Transaction status
  status: {
    type: String,
    enum: ['PENDING', 'COMPLETED', 'FAILED', 'REVERSED'],
    default: 'COMPLETED'
  }
  
}, { 
  timestamps: true 
});

// Indexes for better query performance
transactionSchema.index({ userId: 1, createdAt: -1 });
transactionSchema.index({ type: 1 });
transactionSchema.index({ orderId: 1 });
transactionSchema.index({ returnId: 1 });
transactionSchema.index({ referredUserId: 1 });

// Virtual for transaction direction
transactionSchema.virtual('isCredit').get(function() {
  return this.amount > 0;
});

transactionSchema.virtual('isDebit').get(function() {
  return this.amount < 0;
});

// Static method to get user's transaction history
transactionSchema.statics.getUserTransactions = function(userId, limit = 50, skip = 0) {
  return this.find({ userId })
    .populate('orderId', 'totalAmount status createdAt')
    .populate('referredUserId', 'name username')
    .sort({ createdAt: -1 })
    .limit(limit)
    .skip(skip);
};

// Static method to calculate total coins earned by type
transactionSchema.statics.getTotalEarnedByType = function(userId, type) {
  return this.aggregate([
    { 
      $match: { 
        userId: new mongoose.Types.ObjectId(userId), 
        type: type,
        amount: { $gt: 0 }
      } 
    },
    { 
      $group: { 
        _id: null, 
        total: { $sum: '$amount' },
        count: { $sum: 1 }
      } 
    }
  ]);
};

transactionSchema.set('toJSON', { virtuals: true });

export default mongoose.model('Transaction', transactionSchema);
