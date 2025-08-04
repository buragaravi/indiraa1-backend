import { Expo } from 'expo-server-sdk';
import User from './models/User.js';
import Admin from './models/Admin.js';

const expo = new Expo();

// Send a push notification
export async function sendPushNotification(expoPushToken, title, body, data = {}) {
  try {
    console.log(`📱 Sending push notification to ${expoPushToken}`);
    if (!Expo.isExpoPushToken(expoPushToken)) {
      console.error(`❌ Invalid Expo push token: ${expoPushToken}`);
      return { success: false, error: 'Invalid token' };
    }
    
    const message = {
      to: expoPushToken,
      sound: 'default',
      title,
      body,
      data,
      channelId: data.type === 'order_status' ? 'orders' : 
                 data.type === 'otp' ? 'otp' : 
                 data.type === 'offer' ? 'offers' : 'default',
    };
    
    const receipts = await expo.sendPushNotificationsAsync([message]);
    console.log('📨 Expo push receipts:', receipts);
    
    if (receipts && receipts[0] && receipts[0].status === 'ok') {
      console.log('✅ Push notification sent successfully');
      return { success: true, receipt: receipts[0] };
    } else {
      console.error('❌ Expo push notification error:', receipts[0]);
      return { success: false, error: receipts[0] };
    }
  } catch (err) {
    console.error('❌ Failed to send push notification:', err);
    return { success: false, error: err.message };
  }
}

// 🔔 ORDER NOTIFICATIONS

// Send order status update to user
export async function notifyOrderStatus(userId, orderId, status, orderDetails = {}) {
  try {
    const user = await User.findById(userId);
    if (!user || !user.pushToken || !user.notificationPreferences?.orders) {
      console.log(`❌ User ${userId} cannot receive order notifications`);
      return;
    }

    const statusMessages = {
      'placed': `🎉 Order Confirmed! Your order #${orderId} has been placed successfully.`,
      'confirmed': `✅ Order Confirmed! We're preparing your order #${orderId}.`,
      'processing': `⚡ Order Processing! Your order #${orderId} is being prepared.`,
      'packed': `📦 Order Packed! Your order #${orderId} is ready for shipping.`,
      'shipped': `🚚 Order Shipped! Your order #${orderId} is on its way to you.`,
      'out_for_delivery': `🛵 Out for Delivery! Your order #${orderId} will arrive soon.`,
      'delivered': `✅ Order Delivered! Your order #${orderId} has been delivered successfully.`,
      'cancelled': `❌ Order Cancelled! Your order #${orderId} has been cancelled.`,
      'returned': `🔄 Order Returned! Your return request for order #${orderId} is being processed.`,
    };

    const title = `Order Update`;
    const body = statusMessages[status] || `Your order #${orderId} status: ${status}`;
    
    const data = {
      type: 'order_status',
      orderId,
      status,
      ...orderDetails
    };

    await sendPushNotification(user.pushToken, title, body, data);
    console.log(`✅ Order status notification sent to user ${userId} for order ${orderId}`);
  } catch (error) {
    console.error(`❌ Error sending order status notification:`, error);
  }
}

// Send OTP verification notification
export async function notifyOTP(userId, otp, purpose = 'verification') {
  try {
    const user = await User.findById(userId);
    if (!user || !user.pushToken) {
      console.log(`❌ User ${userId} cannot receive OTP notifications`);
      return;
    }

    const title = `🔐 OTP Verification`;
    const body = `Your OTP for ${purpose} is: ${otp}. Valid for 10 minutes.`;
    
    const data = {
      type: 'otp',
      otp,
      purpose,
      expiresAt: Date.now() + (10 * 60 * 1000) // 10 minutes
    };

    await sendPushNotification(user.pushToken, title, body, data);
    console.log(`✅ OTP notification sent to user ${userId}`);
  } catch (error) {
    console.error(`❌ Error sending OTP notification:`, error);
  }
}

// Send new order notification to all admins
export async function notifyAdminsNewOrder(orderId, userDetails, orderSummary = {}) {
  try {
    const admins = await Admin.find({ pushToken: { $exists: true, $ne: null } });
    
    const title = `🆕 New Order Received!`;
    const body = `Order #${orderId} placed by ${userDetails.name || userDetails.username}. Amount: ₹${orderSummary.total || 'N/A'}`;
    
    const data = {
      type: 'admin_new_order',
      orderId,
      userDetails,
      orderSummary,
      timestamp: new Date().toISOString()
    };

    const promises = admins.map(admin => 
      sendPushNotification(admin.pushToken, title, body, data)
    );
    
    await Promise.all(promises);
    console.log(`✅ New order notifications sent to ${admins.length} admins`);
  } catch (error) {
    console.error(`❌ Error sending admin notifications:`, error);
  }
}

// Send return request notification to admins
export async function notifyAdminsReturnRequest(returnId, orderId, userDetails, returnReason) {
  try {
    const admins = await Admin.find({ pushToken: { $exists: true, $ne: null } });
    
    const title = `🔄 Return Request`;
    const body = `Return request for order #${orderId} by ${userDetails.name}. Reason: ${returnReason}`;
    
    const data = {
      type: 'admin_return_request',
      returnId,
      orderId,
      userDetails,
      returnReason,
      timestamp: new Date().toISOString()
    };

    const promises = admins.map(admin => 
      sendPushNotification(admin.pushToken, title, body, data)
    );
    
    await Promise.all(promises);
    console.log(`✅ Return request notifications sent to ${admins.length} admins`);
  } catch (error) {
    console.error(`❌ Error sending return request notifications:`, error);
  }
}

// 🎁 PROMOTIONAL NOTIFICATIONS

// Send offer notification to users
export async function notifyOffer(userIds, offerDetails) {
  try {
    const users = await User.find({ 
      _id: { $in: userIds }, 
      pushToken: { $exists: true, $ne: null },
      'notificationPreferences.offers': true 
    });
    
    const title = `🎁 ${offerDetails.title || 'Special Offer!'}`;
    const body = offerDetails.message || 'Exclusive offers are waiting for you! Open the app now.';
    
    const data = {
      type: 'offer',
      ...offerDetails,
      timestamp: new Date().toISOString()
    };

    const promises = users.map(user => 
      sendPushNotification(user.pushToken, title, body, data)
    );
    
    const results = await Promise.all(promises);
    console.log(`✅ Offer notifications sent to ${users.length} users`);
    return results;
  } catch (error) {
    console.error(`❌ Error sending offer notifications:`, error);
  }
}

// Send scheduled offer notification to all eligible users
export async function notifyScheduledOffers() {
  try {
    const users = await User.find({ 
      pushToken: { $exists: true, $ne: null },
      'notificationPreferences.offers': true 
    });
    
    const title = '🛍️ Don\'t Miss Out!';
    const offerMessages = [
      'Exclusive deals just for you! Limited time offers inside.',
      'Your cart is waiting! Complete your purchase with special discounts.',
      'New arrivals are here! Check out the latest products.',
      'Flash sale alert! Grab your favorites before they\'re gone.',
    ];
    
    const promises = users.map(user => {
      const body = `Hi ${user.name}, ${offerMessages[Math.floor(Math.random() * offerMessages.length)]}`;
      const data = {
        type: 'offer',
        scheduled: true,
        timestamp: new Date().toISOString()
      };
      return sendPushNotification(user.pushToken, title, body, data);
    });
    
    await Promise.all(promises);
    console.log(`✅ Scheduled offer notifications sent to ${users.length} users`);
  } catch (error) {
    console.error(`❌ Error sending scheduled offers:`, error);
  }
}

// 🔄 RETURN NOTIFICATIONS

// Send return status update to user
export async function notifyReturnStatus(userId, returnId, status, returnDetails = {}) {
  try {
    const user = await User.findById(userId);
    if (!user || !user.pushToken || !user.notificationPreferences?.orders) {
      console.log(`❌ User ${userId} cannot receive return notifications`);
      return;
    }

    const statusMessages = {
      'submitted': `📋 Return Request Submitted! Your return request #${returnId} is being reviewed.`,
      'approved': `✅ Return Approved! Your return request #${returnId} has been approved.`,
      'rejected': `❌ Return Rejected! Your return request #${returnId} could not be processed.`,
      'pickup_scheduled': `📦 Pickup Scheduled! We'll collect your return #${returnId} soon.`,
      'picked_up': `✅ Item Picked Up! Your return #${returnId} has been collected.`,
      'processing': `⚡ Return Processing! Your return #${returnId} is being processed.`,
      'refund_initiated': `💰 Refund Initiated! Your refund for return #${returnId} is being processed.`,
      'completed': `✅ Return Completed! Your return #${returnId} has been successfully processed.`,
    };

    const title = `Return Update`;
    const body = statusMessages[status] || `Your return #${returnId} status: ${status}`;
    
    const data = {
      type: 'return_status',
      returnId,
      status,
      ...returnDetails
    };

    await sendPushNotification(user.pushToken, title, body, data);
    console.log(`✅ Return status notification sent to user ${userId} for return ${returnId}`);
  } catch (error) {
    console.error(`❌ Error sending return status notification:`, error);
  }
}

// 💳 WALLET NOTIFICATIONS

// Send wallet transaction notification
export async function notifyWalletTransaction(userId, transactionDetails) {
  try {
    const user = await User.findById(userId);
    if (!user || !user.pushToken || !user.notificationPreferences?.general) {
      console.log(`❌ User ${userId} cannot receive wallet notifications`);
      return;
    }

    const { type, amount, description } = transactionDetails;
    const title = type === 'credit' ? '💰 Coins Added!' : '💸 Coins Used';
    const body = `${description} Amount: ${amount} coins. Current balance: ${transactionDetails.balance || 'N/A'} coins.`;
    
    const data = {
      type: 'wallet_transaction',
      ...transactionDetails,
      timestamp: new Date().toISOString()
    };

    await sendPushNotification(user.pushToken, title, body, data);
    console.log(`✅ Wallet transaction notification sent to user ${userId}`);
  } catch (error) {
    console.error(`❌ Error sending wallet notification:`, error);
  }
}

// 🎯 BULK NOTIFICATION HELPERS

// Send bulk notifications with batching
export async function sendBulkNotifications(notifications) {
  try {
    const batches = [];
    const batchSize = 100; // Expo recommends max 100 notifications per batch
    
    for (let i = 0; i < notifications.length; i += batchSize) {
      batches.push(notifications.slice(i, i + batchSize));
    }
    
    const results = [];
    for (const batch of batches) {
      const receipts = await expo.sendPushNotificationsAsync(batch);
      results.push(...receipts);
      
      // Small delay between batches to avoid rate limiting
      if (batches.length > 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    console.log(`✅ Bulk notifications sent: ${notifications.length} total, ${results.filter(r => r.status === 'ok').length} successful`);
    return results;
  } catch (error) {
    console.error(`❌ Error sending bulk notifications:`, error);
    return [];
  }
}
