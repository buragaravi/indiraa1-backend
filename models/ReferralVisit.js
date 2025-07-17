import mongoose from 'mongoose';

const referralVisitSchema = new mongoose.Schema({
  // Referrer (user who owns the referral code)
  referrerId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  
  referralCode: { 
    type: String, 
    required: true 
  },
  
  // Visitor tracking
  deviceFingerprint: { 
    type: String, 
    required: true 
  }, // Unique device identifier
  
  ipAddress: { 
    type: String, 
    required: true 
  },
  
  userAgent: { 
    type: String 
  },
  
  // Visit details
  visitStartTime: { 
    type: Date, 
    default: Date.now 
  },
  
  visitEndTime: { 
    type: Date 
  },
  
  visitDuration: { 
    type: Number, 
    default: 0 
  }, // Duration in seconds
  
  // Visit validation
  isValidVisit: { 
    type: Boolean, 
    default: false 
  }, // True if visit >= 2 minutes
  
  isUniqueDevice: { 
    type: Boolean, 
    default: true 
  }, // True if device hasn't visited this referrer before
  
  hasRegistered: { 
    type: Boolean, 
    default: false 
  }, // True if visitor registered using this referral
  
  registeredUserId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User' 
  },
  
  // Reward tracking
  rewardEligible: { 
    type: Boolean, 
    default: false 
  }, // True if this visit counts towards rewards
  
  rewardProcessed: { 
    type: Boolean, 
    default: false 
  }, // True if reward has been given
  
  // Page tracking
  pagesVisited: [String], // Track which pages were visited
  
  // Source tracking
  source: { 
    type: String, 
    default: 'direct' 
  }, // 'social', 'whatsapp', 'email', 'direct', etc.
  
  // Browser/device info
  browserInfo: {
    name: String,
    version: String,
    platform: String,
    isMobile: Boolean
  }
  
}, { 
  timestamps: true 
});

// Compound indexes for efficient queries
referralVisitSchema.index({ referrerId: 1, createdAt: -1 });
referralVisitSchema.index({ deviceFingerprint: 1, referrerId: 1 }); // Removed unique constraint
referralVisitSchema.index({ referralCode: 1 });
referralVisitSchema.index({ isValidVisit: 1, rewardEligible: 1 });

// Static method to check if device has visited this referrer before
referralVisitSchema.statics.isUniqueDevice = async function(deviceFingerprint, referrerId) {
  const existingVisit = await this.findOne({ 
    deviceFingerprint, 
    referrerId 
  });
  return !existingVisit;
};

// Static method to update visit duration and validate
referralVisitSchema.methods.updateVisitDuration = function(endTime) {
  this.visitEndTime = endTime;
  this.visitDuration = Math.floor((endTime - this.visitStartTime) / 1000); // Duration in seconds
  
  // Mark as valid if visit >= 2 minutes (120 seconds)
  this.isValidVisit = this.visitDuration >= 120;
  this.rewardEligible = this.isValidVisit && this.isUniqueDevice;
  
  return this.save();
};

// Static method to get reward-eligible visits for a referrer
referralVisitSchema.statics.getRewardEligibleVisits = function(referrerId) {
  return this.find({ 
    referrerId, 
    rewardEligible: true, 
    rewardProcessed: false 
  });
};

// Static method to get referrer stats
referralVisitSchema.statics.getReferrerStats = async function(referrerId) {
  const stats = await this.aggregate([
    { $match: { referrerId: new mongoose.Types.ObjectId(referrerId) } },
    {
      $group: {
        _id: null,
        totalVisits: { $sum: 1 },
        uniqueVisits: { 
          $sum: { $cond: [{ $eq: ['$isUniqueDevice', true] }, 1, 0] } 
        },
        validVisits: { 
          $sum: { $cond: [{ $eq: ['$isValidVisit', true] }, 1, 0] } 
        },
        rewardEligibleVisits: { 
          $sum: { $cond: [{ $eq: ['$rewardEligible', true] }, 1, 0] } 
        },
        registrations: { 
          $sum: { $cond: [{ $eq: ['$hasRegistered', true] }, 1, 0] } 
        },
        avgVisitDuration: { $avg: '$visitDuration' }
      }
    }
  ]);
  
  return stats.length > 0 ? stats[0] : {
    totalVisits: 0,
    uniqueVisits: 0,
    validVisits: 0,
    rewardEligibleVisits: 0,
    registrations: 0,
    avgVisitDuration: 0
  };
};

export default mongoose.model('ReferralVisit', referralVisitSchema);
