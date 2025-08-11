#!/usr/bin/env node

import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import promotionalNotificationService from './services/promotionalNotificationService.js';

async function testPromotionalNotifications() {
  try {
    console.log('🧪 Testing Promotional Notification System...');
    
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('✅ Connected to MongoDB');

    // Test service status
    console.log('\n📊 Service Status:');
    const status = promotionalNotificationService.getStatus();
    console.log(JSON.stringify(status, null, 2));

    // Test sending notifications
    console.log('\n📱 Testing notification sending...');
    const result = await promotionalNotificationService.sendTestNotification();
    console.log('Result:', JSON.stringify(result, null, 2));

    // Test scheduler
    console.log('\n⏰ Testing scheduler...');
    promotionalNotificationService.startScheduler();
    console.log('Scheduler started successfully!');
    
    // Wait a bit then stop
    setTimeout(() => {
      promotionalNotificationService.stopScheduler();
      console.log('Scheduler stopped');
      process.exit(0);
    }, 5000);

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

// Run the test
testPromotionalNotifications();
