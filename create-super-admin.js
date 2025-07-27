// Script to create the initial Super Admin account
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';
import readline from 'readline';

// Load environment variables
dotenv.config();

// Import Admin model
import Admin from './models/Admin.js';

// Super Admin configuration
const SUPER_ADMIN_CONFIG = {
  username: 'superadmin',
  password: 'SuperAdmin@123', // Change this to a secure password
  name: 'Super Administrator',
  email: 'superadmin@pydahsoft.in', // Change this to your email
  isSuperAdmin: true,
  isActive: true
};

// Default permissions for Super Admin (all modules, all features)
const getDefaultSuperAdminPermissions = () => {
  return {
    modules: new Map([
      ['products', {
        enabled: true,
        features: new Map([
          ['view_products', 'write'],
          ['create_product', 'write'],
          ['edit_product', 'write'],
          ['delete_product', 'write'],
          ['bulk_upload', 'write'],
          ['export_products', 'write'],
          ['manage_categories', 'write']
        ])
      }],
      ['orders', {
        enabled: true,
        features: new Map([
          ['view_orders', 'write'],
          ['update_status', 'write'],
          ['cancel_order', 'write'],
          ['refund_order', 'write'],
          ['export_orders', 'write'],
          ['view_details', 'write']
        ])
      }],
      ['combopacks', {
        enabled: true,
        features: new Map([
          ['view_combos', 'write'],
          ['create_combo', 'write'],
          ['edit_combo', 'write'],
          ['delete_combo', 'write'],
          ['manage_offers', 'write']
        ])
      }],
      ['inventory', {
        enabled: true,
        features: new Map([
          ['view_stock', 'write'],
          ['update_stock', 'write'],
          ['batch_management', 'write'],
          ['stock_alerts', 'write'],
          ['inventory_reports', 'write']
        ])
      }],
      ['analytics', {
        enabled: true,
        features: new Map([
          ['view_dashboard', 'write'],
          ['sales_reports', 'write'],
          ['user_analytics', 'write'],
          ['export_reports', 'write'],
          ['revenue_analysis', 'write']
        ])
      }],
      ['users', {
        enabled: true,
        features: new Map([
          ['view_users', 'write'],
          ['edit_user', 'write'],
          ['suspend_user', 'write'],
          ['user_activity', 'write'],
          ['export_users', 'write']
        ])
      }],
      ['returns', {
        enabled: true,
        features: new Map([
          ['view_returns', 'write'],
          ['process_return', 'write'],
          ['approve_refund', 'write'],
          ['return_analytics', 'write']
        ])
      }],
      ['settings', {
        enabled: true,
        features: new Map([
          ['view_settings', 'write'],
          ['update_settings', 'write'],
          ['system_config', 'write'],
          ['backup_restore', 'write']
        ])
      }],
      ['admin_management', {
        enabled: true,
        features: new Map([
          ['view_admins', 'write'],
          ['create_admin', 'write'],
          ['edit_admin', 'write'],
          ['delete_admin', 'write'],
          ['manage_permissions', 'write'],
          ['view_activity_logs', 'write']
        ])
      }]
    ])
  };
};

async function createSuperAdmin() {
  try {
    // Connect to MongoDB
    console.log('🔗 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/indiraa_ecommerce');
    console.log('✅ Connected to MongoDB');

    // Check if super admin already exists
    const existingSuperAdmin = await Admin.findOne({ 
      $or: [
        { username: SUPER_ADMIN_CONFIG.username },
        { email: SUPER_ADMIN_CONFIG.email },
        { isSuperAdmin: true }
      ]
    });

    if (existingSuperAdmin) {
      console.log('⚠️  Super Admin already exists:');
      console.log(`   Username: ${existingSuperAdmin.username}`);
      console.log(`   Email: ${existingSuperAdmin.email}`);
      console.log(`   Name: ${existingSuperAdmin.name}`);
      console.log(`   Created: ${existingSuperAdmin.createdAt}`);
      
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });

      const answer = await new Promise((resolve) => {
        rl.question('Do you want to create another super admin? (y/N): ', resolve);
      });
      
      rl.close();

      if (answer.toLowerCase() !== 'y' && answer.toLowerCase() !== 'yes') {
        console.log('❌ Super Admin creation cancelled');
        await mongoose.disconnect();
        process.exit(0);
      }
    }

    // Hash password
    console.log('🔐 Hashing password...');
    const hashedPassword = await bcrypt.hash(SUPER_ADMIN_CONFIG.password, 12);

    // Create super admin with enhanced schema
    console.log('👤 Creating Super Admin...');
    const superAdmin = new Admin({
      username: SUPER_ADMIN_CONFIG.username,
      password: hashedPassword,
      name: SUPER_ADMIN_CONFIG.name,
      email: SUPER_ADMIN_CONFIG.email,
      isSuperAdmin: true,
      isActive: true,
      permissions: getDefaultSuperAdminPermissions(),
      createdBy: null, // Self-created
      lastLogin: null
    });

    await superAdmin.save();

    console.log('🎉 Super Admin created successfully!');
    console.log('');
    console.log('📋 Super Admin Details:');
    console.log(`   Username: ${SUPER_ADMIN_CONFIG.username}`);
    console.log(`   Password: ${SUPER_ADMIN_CONFIG.password}`);
    console.log(`   Name: ${SUPER_ADMIN_CONFIG.name}`);
    console.log(`   Email: ${SUPER_ADMIN_CONFIG.email}`);
    console.log(`   ID: ${superAdmin._id}`);
    console.log('');
    console.log('🔒 IMPORTANT SECURITY NOTES:');
    console.log('   1. Change the default password immediately after first login');
    console.log('   2. Use a strong, unique password');
    console.log('   3. Enable 2FA if available');
    console.log('   4. Keep admin credentials secure');
    console.log('');
    console.log('✅ You can now login to the admin panel with these credentials');

  } catch (error) {
    console.error('❌ Error creating Super Admin:', error.message);
    
    if (error.code === 11000) {
      console.log('');
      console.log('💡 This error usually means:');
      if (error.keyPattern.username) {
        console.log('   - Username already exists in database');
      }
      if (error.keyPattern.email) {
        console.log('   - Email already exists in database');
      }
      console.log('   - Try using different username/email or check existing admins');
    }
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
    process.exit(0);
  }
}

// Enhanced Admin Schema (for reference - add these fields to your Admin.js model)
const enhancedAdminSchemaFields = `
// ADD these fields to your existing Admin model in models/Admin.js:

  // Multi-admin system fields
  isActive: { type: Boolean, default: true },
  isSuperAdmin: { type: Boolean, default: false },
  permissions: {
    modules: {
      type: Map,
      of: {
        enabled: { type: Boolean, default: true },
        features: { type: Map, of: String } // 'read', 'write', 'none'
      }
    }
  },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
  lastLogin: { type: Date }
`;

console.log('🚀 Super Admin Creation Script');
console.log('==============================');
console.log('');
console.log('📝 Before running this script, make sure to:');
console.log('   1. Update your Admin.js model with new fields');
console.log('   2. Configure MongoDB connection in .env file');
console.log('   3. Change default credentials in this script');
console.log('');
console.log('📋 Required Admin.js model fields:');
console.log(enhancedAdminSchemaFields);
console.log('');

// Ask for confirmation before proceeding
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

rl.question('Have you updated the Admin.js model with required fields? (y/N): ', (answer) => {
  rl.close();
  
  if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
    console.log('');
    createSuperAdmin();
  } else {
    console.log('');
    console.log('❌ Please update the Admin.js model first, then run this script again');
    console.log('');
    process.exit(0);
  }
});
