# Super Admin Setup Instructions

## 🚀 Quick Setup Guide

### Step 1: Install Required Dependencies (if not already installed)
```bash
npm install bcrypt dotenv
```

### Step 2: Update Environment Variables
Make sure your `.env` file has the MongoDB connection string:
```env
MONGO_URI=mongodb://localhost:27017/indiraa_ecommerce
# or your actual MongoDB connection string
```

### Step 3: Customize Super Admin Credentials
Edit the `create-super-admin.js` file and update these values:
```javascript
const SUPER_ADMIN_CONFIG = {
  username: 'superadmin',           // Change this
  password: 'SuperAdmin@123',       // Change this to a secure password
  name: 'Super Administrator',      // Change this
  email: 'superadmin@indiraa.com',  // Change this to your email
  isSuperAdmin: true,
  isActive: true
};
```

### Step 4: Run the Super Admin Creation Script
```bash
cd indiraa1-backend
node create-super-admin.js
```

### Step 5: Verify Creation
The script will:
- ✅ Connect to your MongoDB database
- ✅ Check if a super admin already exists
- ✅ Create the super admin with full permissions
- ✅ Display the login credentials

## 🔒 Security Best Practices

### After Creating Super Admin:
1. **Change the default password** immediately after first login
2. **Use a strong password** with at least 12 characters
3. **Keep credentials secure** - don't share them
4. **Test the login** in your admin panel

### For Production:
1. **Use environment variables** for sensitive data
2. **Enable HTTPS** for admin panel
3. **Implement rate limiting** for login attempts
4. **Regular password updates** every 90 days

## 🎯 What This Script Creates

### Super Admin Account:
- **Full permissions** to all modules and features
- **Admin management rights** - can create/edit other admins
- **Activity logging** - all actions are tracked
- **Secure password hashing** using bcrypt

### Default Permissions Include:
- Products Management (full access)
- Orders Management (full access)  
- Combo Packs Management (full access)
- Inventory Management (full access)
- Analytics & Reports (full access)
- User Management (full access)
- Returns Management (full access)
- System Settings (full access)
- **Admin Management (full access)** - unique to super admin

## 🛠️ Troubleshooting

### Common Issues:

**1. "Super Admin already exists"**
- The script found an existing admin
- Choose 'y' to create another one, or 'N' to cancel

**2. "Username/Email already exists"**  
- Change the username or email in the script
- Or check existing admins in your database

**3. "MongoDB connection failed"**
- Check your MONGO_URI in .env file
- Ensure MongoDB is running
- Verify connection string format

**4. "Admin model validation error"**
- Make sure you updated Admin.js with the new fields
- Restart your application after model changes

### Testing the Setup:
```bash
# Test MongoDB connection
node -e "
import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();
mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/indiraa_ecommerce')
  .then(() => { console.log('✅ MongoDB Connected'); process.exit(0); })
  .catch(err => { console.error('❌ MongoDB Error:', err.message); process.exit(1); });
"
```

## 📋 Next Steps After Super Admin Creation

1. **Test Login**: Use the created credentials in your admin panel
2. **Create Additional Admins**: Use the super admin to create other admin accounts
3. **Assign Permissions**: Configure specific permissions for each admin
4. **Monitor Activity**: Check admin activity logs regularly

## 🎉 Ready to Use!

After running the script successfully, you'll have:
- ✅ A super admin account with full privileges
- ✅ Complete permission system ready
- ✅ Activity logging enabled
- ✅ Foundation for multi-admin management

**Login to your admin panel with the created credentials and start managing your team!**
