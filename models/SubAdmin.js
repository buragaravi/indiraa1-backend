import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const subAdminSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
    minlength: [2, 'Name must be at least 2 characters long'],
    maxlength: [50, 'Name cannot exceed 50 characters']
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    trim: true,
    lowercase: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
  },
  phone: {
    type: String,
    required: [true, 'Phone number is required'],
    trim: true,
    match: [/^[0-9]{10}$/, 'Please enter a valid 10-digit phone number']
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters long']
  },
  role: {
    type: String,
    required: [true, 'Role is required'],
    enum: {
      values: ['warehouse_manager', 'logistics_manager'],
      message: 'Role must be either warehouse_manager or logistics_manager'
    }
  },
  permissions: {
    type: String,
    required: [true, 'Permissions are required'],
    enum: {
      values: ['read', 'read_write'],
      message: 'Permissions must be either read or read_write'
    }
  },
  isActive: {
    type: Boolean,
    default: true
  },
  isEmailVerified: {
    type: Boolean,
    default: false
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
    required: [true, 'Created by admin is required']
  },
  lastLogin: {
    type: Date,
    default: null
  },
  loginAttempts: {
    type: Number,
    default: 0
  },
  lockUntil: {
    type: Date,
    default: null
  },
  passwordResetToken: {
    type: String,
    default: null
  },
  passwordResetExpires: {
    type: Date,
    default: null
  },
  emailVerificationToken: {
    type: String,
    default: null
  },
  emailVerificationExpires: {
    type: Date,
    default: null
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better performance
subAdminSchema.index({ email: 1 });
subAdminSchema.index({ role: 1 });
subAdminSchema.index({ isActive: 1 });
subAdminSchema.index({ createdBy: 1 });

// Virtual for role display name
subAdminSchema.virtual('roleDisplayName').get(function() {
  const roleMap = {
    'warehouse_manager': 'Warehouse Manager',
    'logistics_manager': 'Logistics Manager'
  };
  return roleMap[this.role] || this.role;
});

// Virtual for permissions display name
subAdminSchema.virtual('permissionsDisplayName').get(function() {
  const permissionMap = {
    'read': 'Read Only',
    'read_write': 'Read & Write'
  };
  return permissionMap[this.permissions] || this.permissions;
});

// Virtual for backward compatibility (access_level)
subAdminSchema.virtual('access_level').get(function() {
  return this.permissions;
});

// Virtual to check if account is locked
subAdminSchema.virtual('isLocked').get(function() {
  return !!(this.lockUntil && this.lockUntil > Date.now());
});

// Pre-save middleware to hash password
subAdminSchema.pre('save', async function(next) {
  // Only hash the password if it has been modified (or is new)
  if (!this.isModified('password')) return next();

  try {
    // Hash password with cost of 12
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Instance method to check password
subAdminSchema.methods.comparePassword = async function(candidatePassword) {
  try {
    return await bcrypt.compare(candidatePassword, this.password);
  } catch (error) {
    throw new Error('Password comparison failed');
  }
};

// Instance method to increment login attempts
subAdminSchema.methods.incLoginAttempts = async function() {
  // If we have a previous lock that has expired, restart at 1
  if (this.lockUntil && this.lockUntil < Date.now()) {
    return this.updateOne({
      $unset: { lockUntil: 1 },
      $set: { loginAttempts: 1 }
    });
  }
  
  const updates = { $inc: { loginAttempts: 1 } };
  
  // If we have exceeded max attempts and it's not locked already, lock the account
  if (this.loginAttempts + 1 >= 5 && !this.isLocked) {
    updates.$set = { lockUntil: Date.now() + 2 * 60 * 60 * 1000 }; // Lock for 2 hours
  }
  
  return this.updateOne(updates);
};

// Instance method to reset login attempts
subAdminSchema.methods.resetLoginAttempts = async function() {
  return this.updateOne({
    $unset: { loginAttempts: 1, lockUntil: 1 }
  });
};

// Instance method to update last login
subAdminSchema.methods.updateLastLogin = async function() {
  return this.updateOne({
    $set: { lastLogin: new Date() }
  });
};

// Static method to find by email (case-insensitive)
subAdminSchema.statics.findByEmail = function(email) {
  return this.findOne({ 
    email: email.toLowerCase().trim(),
    isActive: true 
  });
};

// Static method to get role-based permissions
subAdminSchema.statics.getRolePermissions = function(role) {
  const permissions = {
    warehouse_manager: [
      'products.read',
      'products.write',
      'inventory.read',
      'inventory.write',
      'stock.read',
      'stock.write',
      'bulk_upload.read',
      'bulk_upload.write'
    ],
    logistics_manager: [
      'orders.read',
      'orders.write',
      'delivery.read',
      'delivery.write',
      'delivery_agents.read',
      'delivery_agents.write',
      'tracking.read',
      'tracking.write'
    ]
  };
  
  return permissions[role] || [];
};

// Static method to validate password strength
subAdminSchema.statics.validatePassword = function(password) {
  const errors = [];
  
  if (password.length < 6) {
    errors.push('Password must be at least 6 characters long');
  }
  
  if (password.length > 128) {
    errors.push('Password cannot exceed 128 characters');
  }
  
  if (!/(?=.*[a-z])/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }
  
  if (!/(?=.*[A-Z])/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }
  
  if (!/(?=.*\d)/.test(password)) {
    errors.push('Password must contain at least one number');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
};

// Error handling middleware
subAdminSchema.post('save', function(error, doc, next) {
  if (error.name === 'MongoServerError' && error.code === 11000) {
    if (error.keyPattern.email) {
      next(new Error('Email address is already registered'));
    } else {
      next(new Error('Duplicate key error'));
    }
  } else {
    next(error);
  }
});

const SubAdmin = mongoose.model('SubAdmin', subAdminSchema);

export default SubAdmin;
