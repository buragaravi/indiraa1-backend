// Admin model for admin registration and login
import mongoose from 'mongoose';

const adminSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  pushToken: { type: String },
  
  // Multi-admin system fields
  isActive: { type: Boolean, default: true },
  isSuperAdmin: { type: Boolean, default: false },
  permissions: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
  lastLogin: { type: Date }
}, { timestamps: true });

const Admin = mongoose.model('Admin', adminSchema);
export default Admin;
