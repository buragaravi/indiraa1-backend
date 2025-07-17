import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const deliveryAgentSchema = new mongoose.Schema({
  employeeId: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  phone: {
    type: String,
    required: true,
    trim: true
  },
  password: {
    type: String,
    required: true,
    minlength: 6
  },
  assignedAreas: [{
    type: String,
    trim: true
  }],
  isActive: {
    type: Boolean,
    default: true
  },
  vehicleInfo: {
    type: {
      type: String,
      enum: ['bike', 'car', 'van', 'bicycle'],
      default: 'bike'
    },
    number: {
      type: String,
      trim: true
    },
    model: {
      type: String,
      trim: true
    }
  },
  workingHours: {
    start: {
      type: String,
      default: '09:00'
    },
    end: {
      type: String,
      default: '18:00'
    }
  },
  deliveryStats: {
    totalDeliveries: {
      type: Number,
      default: 0
    },
    onTimeDeliveries: {
      type: Number,
      default: 0
    },
    lateDeliveries: {
      type: Number,
      default: 0
    },
    averageRating: {
      type: Number,
      default: 0,
      min: 0,
      max: 5
    }
  },
  lastActiveAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Index for efficient queries
deliveryAgentSchema.index({ employeeId: 1 });
deliveryAgentSchema.index({ email: 1 });
deliveryAgentSchema.index({ assignedAreas: 1 });
deliveryAgentSchema.index({ isActive: 1 });

// Hash password before saving
deliveryAgentSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Compare password method
deliveryAgentSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Update last active timestamp
deliveryAgentSchema.methods.updateLastActive = function() {
  this.lastActiveAt = new Date();
  return this.save();
};

// Calculate delivery success rate
deliveryAgentSchema.methods.getSuccessRate = function() {
  const total = this.deliveryStats.totalDeliveries;
  if (total === 0) return 0;
  return (this.deliveryStats.onTimeDeliveries / total) * 100;
};

// Get agent performance summary
deliveryAgentSchema.methods.getPerformanceSummary = function() {
  return {
    totalDeliveries: this.deliveryStats.totalDeliveries,
    onTimeRate: this.getSuccessRate(),
    averageRating: this.deliveryStats.averageRating,
    activeStatus: this.isActive ? 'Active' : 'Inactive'
  };
};

const DeliveryAgent = mongoose.model('DeliveryAgent', deliveryAgentSchema);

export default DeliveryAgent;
