// Notification Hooks - Automatically send notifications for various events
import notificationService from '../services/notificationService.js';

// Order Event Hooks
export const orderHooks = {
  // Called when order status changes
  async onOrderStatusChange(orderId, newStatus, userId, orderData = {}) {
    try {
      await notificationService.sendOrderNotification(orderId, newStatus, userId);
      
      // Send admin notification for important status changes
      if (['pending', 'cancelled'].includes(newStatus)) {
        const title = newStatus === 'pending' ? 'New Order Received' : 'Order Cancelled';
        const message = `Order #${orderId} is now ${newStatus}. Amount: ₹${orderData.totalAmount || 0}`;
        
        // Send to all admins (you can filter specific admins if needed)
        await notificationService.sendBroadcastNotification({
          title,
          message,
          type: 'admin',
          recipientType: 'admin',
          category: 'admin_alerts',
          relatedOrderId: orderId,
          data: { orderId, status: newStatus, ...orderData }
        });
      }
    } catch (error) {
      console.error('Error in order status change hook:', error);
    }
  },

  // Called when payment is received
  async onPaymentReceived(orderId, paymentData, userId) {
    try {
      await notificationService.createNotification({
        title: 'Payment Received!',
        message: `Your payment of ₹${paymentData.amount} for order #${orderId} has been received successfully.`,
        type: 'order',
        userId,
        category: 'payment',
        relatedOrderId: orderId,
        actionUrl: `/orders/${orderId}`,
        actionText: 'View Order',
        channels: ['in_app', 'push'],
        data: paymentData
      });
    } catch (error) {
      console.error('Error in payment received hook:', error);
    }
  }
};

// Wallet Event Hooks
export const walletHooks = {
  // Called when wallet balance changes
  async onWalletTransaction(userId, transactionData) {
    try {
      await notificationService.sendWalletNotification(
        userId,
        transactionData.type,
        transactionData.amount,
        transactionData.description
      );
    } catch (error) {
      console.error('Error in wallet transaction hook:', error);
    }
  },

  // Called when coins are earned
  async onCoinsEarned(userId, amount, source, description) {
    try {
      let title = 'Coins Earned!';
      let message = `You've earned ₹${amount} coins`;
      
      switch (source) {
        case 'order':
          message += ' from your recent purchase. Keep shopping to earn more!';
          break;
        case 'referral':
          message += ' from referral bonus. Thanks for spreading the word!';
          break;
        case 'review':
          message += ' for writing a product review. Your feedback matters!';
          break;
        default:
          message += '. ' + description;
      }

      await notificationService.createNotification({
        title,
        message,
        type: 'wallet',
        userId,
        category: 'wallet',
        actionUrl: '/wallet',
        actionText: 'View Wallet',
        channels: ['in_app', 'push'],
        data: { amount, source, description }
      });
    } catch (error) {
      console.error('Error in coins earned hook:', error);
    }
  }
};

// Referral Event Hooks
export const referralHooks = {
  // Called when someone signs up using referral code
  async onReferralSignup(referrerId, newUserId, newUserName) {
    try {
      await notificationService.sendReferralNotification(referrerId, 'referral_signup', {
        friendName: newUserName,
        newUserId
      });
    } catch (error) {
      console.error('Error in referral signup hook:', error);
    }
  },

  // Called when referral bonus is awarded
  async onReferralReward(referrerId, amount, friendName) {
    try {
      await notificationService.sendReferralNotification(referrerId, 'referral_reward', {
        amount,
        friendName
      });
    } catch (error) {
      console.error('Error in referral reward hook:', error);
    }
  }
};

// Product Event Hooks
export const productHooks = {
  // Called when product comes back in stock
  async onProductBackInStock(productId, productName, interestedUserIds = []) {
    try {
      for (const userId of interestedUserIds) {
        await notificationService.createNotification({
          title: 'Back in Stock!',
          message: `Good news! ${productName} is back in stock. Order now before it's gone again!`,
          type: 'general',
          userId,
          category: 'inventory',
          relatedProductId: productId,
          actionUrl: `/products/${productId}`,
          actionText: 'View Product',
          channels: ['in_app', 'push'],
          data: { productId, productName }
        });
      }
    } catch (error) {
      console.error('Error in product back in stock hook:', error);
    }
  },

  // Called when product price drops
  async onPriceDrop(productId, productName, oldPrice, newPrice, interestedUserIds = []) {
    try {
      const discount = oldPrice - newPrice;
      const discountPercent = Math.round((discount / oldPrice) * 100);

      for (const userId of interestedUserIds) {
        await notificationService.createNotification({
          title: 'Price Drop Alert!',
          message: `${productName} is now ₹${newPrice} (${discountPercent}% off). Don't miss this deal!`,
          type: 'offer',
          userId,
          category: 'promotions',
          relatedProductId: productId,
          actionUrl: `/products/${productId}`,
          actionText: 'Buy Now',
          channels: ['in_app', 'push'],
          priority: 'high',
          data: { productId, productName, oldPrice, newPrice, discount, discountPercent }
        });
      }
    } catch (error) {
      console.error('Error in price drop hook:', error);
    }
  }
};

// System Event Hooks
export const systemHooks = {
  // Called when user hasn't ordered in a while
  async onInactiveUser(userId, daysSinceLastOrder) {
    try {
      let message = '';
      let offer = '';

      if (daysSinceLastOrder > 30) {
        message = "We miss you! It's been a while since your last order.";
        offer = 'Use code COMEBACK10 for 10% off your next purchase!';
      } else if (daysSinceLastOrder > 60) {
        message = "Come back! We have new products you'll love.";
        offer = 'Use code WELCOME15 for 15% off!';
      }

      if (message) {
        await notificationService.createNotification({
          title: 'We Miss You! 💝',
          message: `${message} ${offer}`,
          type: 'promotional',
          userId,
          category: 'retargeting',
          actionUrl: '/products',
          actionText: 'Shop Now',
          channels: ['in_app', 'push'],
          data: { daysSinceLastOrder, offerCode: offer.match(/code (\w+)/)?.[1] }
        });
      }
    } catch (error) {
      console.error('Error in inactive user hook:', error);
    }
  },

  // Called for cart abandonment
  async onCartAbandoned(userId, cartItems, hoursSinceAbandoned) {
    try {
      if (hoursSinceAbandoned >= 24) {
        const itemCount = cartItems.length;
        const totalValue = cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);

        await notificationService.createNotification({
          title: 'Items waiting in your cart! 🛒',
          message: `You have ${itemCount} item${itemCount > 1 ? 's' : ''} worth ₹${totalValue} waiting. Complete your purchase now!`,
          type: 'promotional',
          userId,
          category: 'retargeting',
          actionUrl: '/cart',
          actionText: 'Complete Purchase',
          channels: ['in_app', 'push'],
          priority: 'normal',
          data: { cartItems, totalValue, hoursSinceAbandoned }
        });
      }
    } catch (error) {
      console.error('Error in cart abandoned hook:', error);
    }
  }
};

// Admin Event Hooks
export const adminHooks = {
  // Called when low stock detected
  async onLowStock(productId, productName, currentStock, minStock) {
    try {
      await notificationService.sendBroadcastNotification({
        title: 'Low Stock Alert!',
        message: `${productName} is running low (${currentStock} left). Minimum stock: ${minStock}`,
        type: 'warning',
        recipientType: 'admin',
        category: 'admin_alerts',
        relatedProductId: productId,
        actionUrl: `/admin/products/${productId}`,
        actionText: 'Update Stock',
        channels: ['in_app', 'push'],
        priority: 'high',
        data: { productId, productName, currentStock, minStock }
      });
    } catch (error) {
      console.error('Error in low stock hook:', error);
    }
  },

  // Called when new user registers
  async onNewUserRegistration(userId, userEmail, userName) {
    try {
      await notificationService.sendBroadcastNotification({
        title: 'New User Registered!',
        message: `${userName} (${userEmail}) just joined the platform.`,
        type: 'admin',
        recipientType: 'admin',
        category: 'admin_alerts',
        actionUrl: `/admin/users/${userId}`,
        actionText: 'View User',
        channels: ['in_app'],
        data: { userId, userEmail, userName }
      });
    } catch (error) {
      console.error('Error in new user registration hook:', error);
    }
  }
};

// Helper function to integrate hooks into existing code
export const triggerHook = async (hookType, eventType, ...args) => {
  try {
    const hooks = {
      order: orderHooks,
      wallet: walletHooks,
      referral: referralHooks,
      product: productHooks,
      system: systemHooks,
      admin: adminHooks
    };

    const hookGroup = hooks[hookType];
    if (hookGroup && typeof hookGroup[eventType] === 'function') {
      await hookGroup[eventType](...args);
    }
  } catch (error) {
    console.error(`Error triggering hook ${hookType}.${eventType}:`, error);
  }
};

export default {
  orderHooks,
  walletHooks,
  referralHooks,
  productHooks,
  systemHooks,
  adminHooks,
  triggerHook
};
