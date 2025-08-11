import mongoose from 'mongoose';

const addressSchema = new mongoose.Schema({
  name: { type: String, required: true },
  address: { type: String, required: true },
  phone: { type: String, required: true },
  isDefault: { type: Boolean, default: false }
}, { _id: false });

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  phone: { type: String, required: true },
  addresses: { type: [addressSchema], default: [] },
  
  // Enhanced wishlist to support both products and combo packs
  wishlist: [{
    type: { type: String, enum: ['product', 'combo'], default: 'product' },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    comboPackId: { type: mongoose.Schema.Types.ObjectId, ref: 'ComboPack' },
    addedAt: { type: Date, default: Date.now }
  }],
  
  // Enhanced cart to support both products and combo packs
  cart: [{
    type: { type: String, enum: ['product', 'combo'], default: 'product' },
    
    // Product-related fields
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    variantId: { type: String }, // Store selected variant ID
    variantName: { type: String }, // Store variant name for easy access
    variantPrice: { type: Number }, // Store variant price at time of adding
    
    // Combo pack-related fields
    comboPackId: { type: mongoose.Schema.Types.ObjectId, ref: 'ComboPack' },
    
    // Common fields
    quantity: { type: Number, default: 1 },
    addedAt: { type: Date, default: Date.now }
  }],
  
  // Wallet System
  wallet: {
    balance: { type: Number, default: 0, min: 0 },
    totalEarned: { type: Number, default: 0 },
    totalSpent: { type: Number, default: 0 }
  },
  
  // Referral System
  referralCode: { 
    type: String, 
    unique: true, 
    sparse: true // Allows null values to be non-unique
  },
  referredBy: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User' 
  },
  referralStats: {
    totalReferrals: { type: Number, default: 0 },
    successfulReferrals: { type: Number, default: 0 },
    totalVisits: { type: Number, default: 0 },
    uniqueVisits: { type: Number, default: 0 },
    coinsEarnedFromReferrals: { type: Number, default: 0 }
  },
  
  pushToken: { type: String },
  
  // Notification preferences
  notificationPreferences: {
    orders: { type: Boolean, default: true },
    offers: { type: Boolean, default: true },
    general: { type: Boolean, default: true },
    promotional: { type: Boolean, default: true },
  },
  
  // Web Push Notification Subscription
  webPushSubscription: {
    endpoint: { type: String },
    keys: {
      p256dh: { type: String },
      auth: { type: String }
    },
    expirationTime: { type: Date },
    createdAt: { type: Date, default: Date.now },
    userAgent: { type: String }
  },
}, { timestamps: true });

// Virtual for compatibility with frontend expecting userId
userSchema.virtual('userId').get(function() {
  return this._id.toString();
});
userSchema.set('toJSON', { virtuals: true });

// Generate unique referral code
userSchema.methods.generateReferralCode = function() {
  if (!this.referralCode) {
    const prefix = 'INDIRA';
    const suffix = Math.random().toString(36).substring(2, 8).toUpperCase();
    this.referralCode = `${prefix}${suffix}`;
  }
  return this.referralCode;
};

// Add coins to wallet with transaction
userSchema.methods.addCoins = async function(amount, type, description, orderId = null) {
  console.log(`[USER WALLET DEBUG] Adding ${amount} coins to user ${this._id} (${this.name})`);
  console.log(`[USER WALLET DEBUG] Current balance: ${this.wallet.balance}`);
  
  this.wallet.balance += amount;
  this.wallet.totalEarned += amount;
  
  console.log(`[USER WALLET DEBUG] New balance: ${this.wallet.balance}`);
  
  // Create transaction record
  const Transaction = mongoose.model('Transaction');
  const transaction = await Transaction.create({
    userId: this._id,
    type: type,
    amount: amount,
    description: description,
    orderId: orderId,
    balanceAfter: this.wallet.balance
  });
  
  console.log(`[USER WALLET DEBUG] Transaction created:`, transaction._id);
  
  await this.save();
  console.log(`[USER WALLET DEBUG] User saved successfully with new balance: ${this.wallet.balance}`);
  
  return this.wallet.balance;
};

// Deduct coins from wallet with transaction
userSchema.methods.deductCoins = async function(amount, type, description, orderId = null) {
  if (this.wallet.balance < amount) {
    throw new Error('Insufficient wallet balance');
  }
  
  this.wallet.balance -= amount;
  this.wallet.totalSpent += amount;
  
  // Create transaction record
  const Transaction = mongoose.model('Transaction');
  await Transaction.create({
    userId: this._id,
    type: type,
    amount: -amount,
    description: description,
    orderId: orderId,
    balanceAfter: this.wallet.balance
  });
  
  await this.save();
  return this.wallet.balance;
};

export default mongoose.model('User', userSchema);
