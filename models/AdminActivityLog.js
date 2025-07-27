// AdminActivityLog model for tracking admin activities
import mongoose from 'mongoose';

const adminActivityLogSchema = new mongoose.Schema({
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
  action: { type: String, required: true }, // 'login', 'logout', 'admin_created', 'permissions_updated', etc.
  details: {
    targetAdminId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
    adminName: String,
    changes: mongoose.Schema.Types.Mixed,
    ipAddress: String,
    userAgent: String,
    module: String,
    feature: String
  },
  timestamp: { type: Date, default: Date.now },
  success: { type: Boolean, default: true }
}, { timestamps: true });

// Index for efficient querying
adminActivityLogSchema.index({ adminId: 1, timestamp: -1 });
adminActivityLogSchema.index({ action: 1, timestamp: -1 });
adminActivityLogSchema.index({ 'details.targetAdminId': 1, timestamp: -1 });

const AdminActivityLog = mongoose.model('AdminActivityLog', adminActivityLogSchema);
export default AdminActivityLog;
