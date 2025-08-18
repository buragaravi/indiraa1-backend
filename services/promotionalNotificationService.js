import { sendPushNotification } from '../notifications.js';
import User from '../models/User.js';
import cron from 'node-cron';
import { notifyPromotion as notifyPromotionWeb, getUsersWithSubscriptions } from './webPushService.js';

class PromotionalNotificationService {
  constructor() {
    this.promotionalMessages = [
      {
        title: "🛒 Amazing Deals Await!",
        body: "Don't miss out! Fresh groceries with exclusive offers are waiting for you. Shop now!"
      },
      {
        title: "🎯 Special Offers Inside!",
        body: "Your favorite products are on sale! Grab them before they're gone. Limited time only!"
      },
      {
        title: "🔥 Hot Deals Alert!",
        body: "Incredible discounts on quality groceries! Your wallet will thank you. Check it out!"
      },
      {
        title: "💎 Premium Quality, Great Prices!",
        body: "Fresh products delivered to your doorstep. Experience the IndiraShop difference today!"
      },
      {
        title: "⏰ Flash Sale Active!",
        body: "Hurry up! Amazing deals on your favorite items. Don't let this opportunity slip away!"
      },
      {
        title: "🌟 Exclusive Member Benefits!",
        body: "Special prices just for you! Browse our latest collection and save big today!"
      },
      {
        title: "🎁 Surprise Offers Waiting!",
        body: "Something special is waiting in your cart! Come back and discover amazing deals!"
      },
      {
        title: "🛍️ Shopping Made Easy!",
        body: "Quality groceries, delivered fresh! Make your day better with IndiraShop. Order now!"
      },
      {
        title: "💰 Save More, Buy More!",
        body: "Unbeatable prices on premium products! Your favorite grocery store is just a tap away!"
      },
      {
        title: "🚀 New Arrivals Alert!",
        body: "Fresh stock just arrived! Be the first to grab the best products at amazing prices!"
      },
      {
        title: "🎉 Weekend Special!",
        body: "Make your weekend special with our exclusive offers! Fresh groceries delivered with love!"
      },
      {
        title: "✨ Quality You Can Trust!",
        body: "Premium groceries at your fingertips! Experience hassle-free shopping with IndiraShop!"
      },
      {
        title: "🏆 Best Deals in Town!",
        body: "Why pay more elsewhere? Get the best prices on quality groceries right here!"
      },
      {
        title: "💝 Treat Yourself Today!",
        body: "You deserve the best! Fresh, quality groceries with amazing discounts await you!"
      },
      {
        title: "📱 Quick & Easy Shopping!",
        body: "Shop in seconds, delivered in minutes! Your convenient grocery solution is here!"
      }
    ];

    this.isRunning = false;
  }

  // Get a random promotional message
  getRandomMessage() {
    const randomIndex = Math.floor(Math.random() * this.promotionalMessages.length);
    return this.promotionalMessages[randomIndex];
  }

  // Send promotional notification to a single user
  async sendPromotionalNotificationToUser(user) {
    try {
      if (!user.pushToken || !user.notificationPreferences?.promotional) {
        return { success: false, reason: 'User not eligible for promotional notifications' };
      }

      const message = this.getRandomMessage();
      const result = await sendPushNotification(
        user.pushToken,
        message.title,
        message.body,
        { 
          type: 'promotional',
          category: 'marketing',
          timestamp: new Date().toISOString()
        }
      );

      console.log(`📢 Promotional notification sent to user ${user._id}: ${message.title}`);
      return result;
    } catch (error) {
      console.error('❌ Error sending promotional notification:', error);
      return { success: false, error: error.message };
    }
  }

  // Send promotional notifications to all eligible users
  async sendBulkPromotionalNotifications() {
    try {
      console.log('🚀 Starting bulk promotional notification campaign...');
      
      // Get all users who have mobile push tokens
      const eligibleUsers = await User.find({
        pushToken: { $exists: true, $ne: null },
      });

      // Also get PWA-subscribed users for web push
      const webSubscribedUsers = await getUsersWithSubscriptions();

  console.log(`👥 Found ${eligibleUsers.length} mobile users and ${webSubscribedUsers.length} web-subscribed users for promotional notifications`);

      if (eligibleUsers.length === 0 && webSubscribedUsers.length === 0) {
        console.log('📭 No eligible users found for promotional notifications');
        return { success: true, sent: 0, message: 'No eligible users' };
      }

      let successCount = 0;
      let failureCount = 0;
  const results = [];
  const message = this.getRandomMessage();

      // Send notifications to users in batches to avoid overwhelming the system
      const batchSize = 100; // Process 100 users at a time
      for (let i = 0; i < eligibleUsers.length; i += batchSize) {
        const batch = eligibleUsers.slice(i, i + batchSize);
        
        const batchPromises = batch.map(async (user) => {
          const result = await this.sendPromotionalNotificationToUser(user);
          if (result.success) {
            successCount++;
          } else {
            failureCount++;
          }
          return { userId: user._id, result };
        });

        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults);

        // Add a small delay between batches to be respectful to the notification service
        if (i + batchSize < eligibleUsers.length) {
          await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second delay
        }
      }

      // Send to web-subscribed users via VAPID web push
      if (webSubscribedUsers.length > 0) {
        const promoData = {
          id: `promo-${Date.now()}`,
          title: message.title,
          message: message.body,
          url: '/products',
        };
        for (const u of webSubscribedUsers) {
          try {
            await notifyPromotionWeb(u._id, promoData);
            successCount++;
            results.push({ userId: u._id, platform: 'web', success: true });
          } catch (err) {
            failureCount++;
            results.push({ userId: u._id, platform: 'web', success: false, error: err.message });
          }
        }
      }

      console.log(`✅ Promotional notification campaign completed!`);
      console.log(`📊 Results: ${successCount} sent, ${failureCount} failed`);

      return {
        success: true,
        sent: successCount,
        failed: failureCount,
        total: eligibleUsers.length,
        results
      };
    } catch (error) {
      console.error('❌ Error in bulk promotional notification campaign:', error);
      return { success: false, error: error.message };
    }
  }

  // Start the promotional notification scheduler
  startScheduler() {
    if (this.isRunning) {
      console.log('⚠️ Promotional notification scheduler is already running');
      return;
    }

    console.log('🕐 Starting promotional notification scheduler (every 30 minutes)...');
    
    // Schedule promotional notifications every 30 minutes
    // Cron pattern: '0 */30 * * * *' means every 30 minutes
    this.scheduledTask = cron.schedule('0 */30 * * * *', async () => {
      console.log('⏰ Promotional notification scheduler triggered');
      await this.sendBulkPromotionalNotifications();
    }, {
      scheduled: true,
      timezone: "Asia/Kolkata" // Adjust timezone as needed
    });

    this.isRunning = true;
    console.log('✅ Promotional notification scheduler started successfully!');
    console.log('📅 Notifications will be sent every 30 minutes');
  }

  // Stop the promotional notification scheduler
  stopScheduler() {
    if (!this.isRunning) {
      console.log('⚠️ Promotional notification scheduler is not running');
      return;
    }

    if (this.scheduledTask) {
      this.scheduledTask.stop();
      this.scheduledTask.destroy();
      this.scheduledTask = null;
    }

    this.isRunning = false;
    console.log('🛑 Promotional notification scheduler stopped');
  }

  // Get scheduler status
  getStatus() {
    return {
      isRunning: this.isRunning,
      messageCount: this.promotionalMessages.length,
      nextExecution: this.scheduledTask ? 'Every 30 minutes' : 'Not scheduled'
    };
  }

  // Send immediate test promotional notification
  async sendTestNotification() {
    console.log('🧪 Sending test promotional notification...');
    return await this.sendBulkPromotionalNotifications();
  }
}

// Create and export a singleton instance
const promotionalNotificationService = new PromotionalNotificationService();
export default promotionalNotificationService;
