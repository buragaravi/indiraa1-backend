#!/usr/bin/env node

/**
 * Simple Migration Script: Force Update All User Notification Preferences
 * 
 * This script forcefully updates ALL users to have proper notification preferences
 * set to true for all notification types.
 * 
 * Run this script: node force-migrate-notifications.js
 */

import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import User from './models/User.js';

async function forceMigrateUserNotifications() {
  try {
    console.log('🚀 Starting FORCE Migration of User Notification Preferences...');
    
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('✅ Connected to MongoDB');

    // Update ALL users with the new notification preferences
    const updateResult = await User.updateMany(
      {}, // Empty filter = all users
      {
        $set: {
          notificationPreferences: {
            orders: true,
            offers: true,
            general: true,
            promotional: true
          }
        }
      }
    );

    console.log(`📊 Migration Results:`);
    console.log(`✅ Matched: ${updateResult.matchedCount} users`);
    console.log(`✅ Modified: ${updateResult.modifiedCount} users`);
    console.log(`✅ Acknowledged: ${updateResult.acknowledged}`);

    // Verify the migration by checking all users
    console.log('\n🔍 Verification - Checking all users:');
    const allUsers = await User.find({}, 'name username notificationPreferences').limit(10);
    
    for (const user of allUsers) {
      console.log(`👤 User ${user._id} (${user.name || user.username}):`);
      console.log(`   Preferences:`, JSON.stringify(user.notificationPreferences, null, 2));
    }

    // Get count of users with proper preferences
    const usersWithProperPrefs = await User.countDocuments({
      'notificationPreferences.orders': true,
      'notificationPreferences.offers': true,
      'notificationPreferences.general': true,
      'notificationPreferences.promotional': true
    });

    console.log(`\n📈 Final Count: ${usersWithProperPrefs} users now have proper notification preferences`);
    console.log('🎉 Force migration completed successfully!');
    
    process.exit(0);

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

// Run the migration
forceMigrateUserNotifications();
