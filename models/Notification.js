import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema({
  // Basic notification info
  title: {
    type: String,
    required: true,
    trim: true
  },
  message: {
    type: String,
    required: true
  },
  type: {
    type: String,
    enum: [
      'order',           // Order related notifications
      'wallet',          // Wallet transactions
      'promotional',     // Offers and promotions  
      'referral',        // Referral rewards
      'general',         // General notifications
      'system',          // System alerts
      'delivery',        // Delivery updates
      'admin',           // Admin notifications
      'warning',         // Warning messages
      'success'          // Success messages
    ],
    default: 'general'
  },
  
  // Recipient information
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: function() {
      return this.recipientType === 'user';
    }
  },
  adminId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
    required: function() {
      return this.recipientType === 'admin';
    }
  },
  deliveryAgentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'DeliveryAgent',
    required: function() {
      return this.recipientType === 'delivery';
    }
  },
  recipientType: {
    type: String,
    enum: ['user', 'admin', 'delivery', 'broadcast'],
    required: true,
    default: 'user'
  },

  // Notification content
  imageUrl: {
    type: String,
    trim: true
  },
  actionUrl: {
    type: String,
    trim: true
  },
  actionText: {
    type: String,
    trim: true
  },
  
  // Notification behavior
  priority: {
    type: String,
    enum: ['low', 'normal', 'high', 'urgent'],
    default: 'normal'
  },
  category: {
    type: String,
    enum: [
      'order_updates',
      'payment',
      'wallet',
      'promotions',
      'referrals',
      'inventory',
      'system',
      'delivery',
      'admin_alerts'
    ]
  },

  // Status and tracking
  isRead: {
    type: Boolean,
    default: false
  },
  readAt: {
    type: Date
  },
  status: {
    type: String,
    enum: ['pending', 'sent', 'delivered', 'failed', 'scheduled', 'cancelled'],
    default: 'pending'
  },
  
  // Delivery channels
  channels: [{
    type: String,
    enum: ['push', 'email', 'sms', 'in_app']
  }],
  sentChannels: [{
    type: String,
    enum: ['push', 'email', 'sms', 'in_app']
  }],
  failedChannels: [{
    type: String,
    enum: ['push', 'email', 'sms', 'in_app']
  }],

  // Scheduling
  scheduledFor: {
    type: Date,
    default: Date.now
  },
  sentAt: {
    type: Date
  },
  expiresAt: {
    type: Date
  },

  // Related data
  relatedOrderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order'
  },
  relatedProductId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product'
  },
  relatedTransactionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Transaction'
  },

  // Metadata
  data: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  
  // Admin info (who sent the notification)
  createdBy: {
    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin'
    },
    system: {
      type: Boolean,
      default: false
    }
  }
}, {
  timestamps: true
});

// Indexes for better performance
notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index({ adminId: 1, createdAt: -1 });
notificationSchema.index({ deliveryAgentId: 1, createdAt: -1 });
notificationSchema.index({ type: 1, status: 1 });
notificationSchema.index({ scheduledFor: 1, status: 1 });
notificationSchema.index({ isRead: 1, userId: 1 });
notificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Virtual for recipient
notificationSchema.virtual('recipient', {
  refPath: function() {
    if (this.recipientType === 'user') return 'User';
    if (this.recipientType === 'admin') return 'Admin';
    if (this.recipientType === 'delivery') return 'DeliveryAgent';
  },
  localField: function() {
    if (this.recipientType === 'user') return 'userId';
    if (this.recipientType === 'admin') return 'adminId';
    if (this.recipientType === 'delivery') return 'deliveryAgentId';
  },
  foreignField: '_id',
  justOne: true
});

// Methods
notificationSchema.methods.markAsRead = function() {
  this.isRead = true;
  this.readAt = new Date();
  return this.save();
};

notificationSchema.methods.markAsSent = function(channels = []) {
  this.status = 'sent';
  this.sentAt = new Date();
  this.sentChannels = channels;
  return this.save();
};

notificationSchema.methods.markAsFailed = function(failedChannels = []) {
  this.status = 'failed';
  this.failedChannels = failedChannels;
  return this.save();
};

// Static methods
notificationSchema.statics.getUnreadCount = function(userId, recipientType = 'user') {
  const query = { isRead: false };
  if (recipientType === 'user') query.userId = userId;
  else if (recipientType === 'admin') query.adminId = userId;
  else if (recipientType === 'delivery') query.deliveryAgentId = userId;
  
  return this.countDocuments(query);
};

notificationSchema.statics.markAllAsRead = function(userId, recipientType = 'user') {
  const query = { isRead: false };
  if (recipientType === 'user') query.userId = userId;
  else if (recipientType === 'admin') query.adminId = userId;
  else if (recipientType === 'delivery') query.deliveryAgentId = userId;
  
  return this.updateMany(query, { 
    isRead: true, 
    readAt: new Date() 
  });
};

export default mongoose.model('Notification', notificationSchema);
