#!/usr/bin/env node

/**
 * Migration Script: Update User Notification Preferences
 * 
 * This script updates all existing users to have proper notification preferences
 * set to true for all notification types including the new 'promotional' type.
 * 
 * Run this script: node migrate-user-notifications.js
 */

import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import User from './models/User.js';

async function migrateUserNotificationPreferences() {
  try {
    console.log('🚀 Starting User Notification Preferences Migration...');
    
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('✅ Connected to MongoDB');

    // Get all users
    const users = await User.find({});
    console.log(`📊 Found ${users.length} users to migrate`);

    if (users.length === 0) {
      console.log('📭 No users found to migrate');
      process.exit(0);
    }

    let migratedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    // Process users in batches to avoid memory issues
    const batchSize = 100;
    for (let i = 0; i < users.length; i += batchSize) {
      const batch = users.slice(i, i + batchSize);
      console.log(`\n🔄 Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(users.length/batchSize)} (${batch.length} users)...`);

      const batchPromises = batch.map(async (user) => {
        try {
          // Check if user already has proper notification preferences
          const hasPreferences = user.notificationPreferences && 
                                typeof user.notificationPreferences === 'object' &&
                                Object.keys(user.notificationPreferences).length > 0;
          
          console.log(`🔍 Checking user ${user._id} (${user.name || user.username}): hasPreferences=${hasPreferences}, current=${JSON.stringify(user.notificationPreferences)}`);
          
          const needsUpdate = !hasPreferences || 
                            user.notificationPreferences.orders === undefined ||
                            user.notificationPreferences.offers === undefined ||
                            user.notificationPreferences.general === undefined ||
                            user.notificationPreferences.promotional === undefined;

          if (!needsUpdate && hasPreferences) {
            console.log(`⏭️  User ${user._id} (${user.name || user.username}) already has proper preferences`);
            skippedCount++;
            return { success: true, skipped: true };
          }

          // Set notification preferences with default values
          const updatedPreferences = {
            orders: user.notificationPreferences?.orders ?? true,
            offers: user.notificationPreferences?.offers ?? true, 
            general: user.notificationPreferences?.general ?? true,
            promotional: user.notificationPreferences?.promotional ?? true,
          };

          // Update the user
          await User.findByIdAndUpdate(user._id, {
            notificationPreferences: updatedPreferences
          });

          console.log(`✅ Updated user ${user._id} (${user.name || user.username})`);
          migratedCount++;
          return { success: true, skipped: false };

        } catch (error) {
          console.error(`❌ Error updating user ${user._id}:`, error.message);
          errorCount++;
          return { success: false, error: error.message };
        }
      });

      // Wait for the batch to complete
      await Promise.all(batchPromises);

      // Add a small delay between batches
      if (i + batchSize < users.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    console.log('\n📊 Migration Results:');
    console.log(`✅ Successfully migrated: ${migratedCount} users`);
    console.log(`⏭️  Skipped (already configured): ${skippedCount} users`);
    console.log(`❌ Errors: ${errorCount} users`);
    console.log(`📈 Total processed: ${users.length} users`);

    // Verify migration by checking a few random users
    console.log('\n🔍 Verification - Checking random users:');
    const randomUsers = await User.aggregate([{ $sample: { size: Math.min(5, users.length) } }]);
    
    for (const user of randomUsers) {
      console.log(`👤 User ${user._id} (${user.name || user.username}):`);
      console.log(`   Preferences:`, JSON.stringify(user.notificationPreferences, null, 2));
    }

    console.log('\n🎉 Migration completed successfully!');
    process.exit(0);

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

// Run the migration
migrateUserNotificationPreferences();
