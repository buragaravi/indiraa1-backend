/**
 * Unified Communication Service
 * Handles all communication channels (Email, SMS, WhatsApp) for order notifications
 */

import { sendOTPEmail, sendOrderConfirmationEmail } from './emailService.js';
import { sendOTPSMS, sendOrderConfirmationSMS, sendStatusUpdateSMS } from './smsService.js';
import { sendOTPWhatsApp, sendOrderConfirmationWhatsApp, sendStatusUpdateWhatsApp } from './whatsappService.js';

/**
 * Send OTP notification via all available channels
 * @param {Object} user - User object with name, email, phone
 * @param {string} otp - OTP code
 * @param {string} orderId - Order ID
 * @param {Array} channels - Array of channels to use ['email', 'sms', 'whatsapp']
 * @returns {Promise<Object>} Results from all channels
 */
export const sendOTPNotification = async (user, otp, orderId, channels = ['email', 'sms', 'whatsapp']) => {
  const results = {
    email: null,
    sms: null,
    whatsapp: null,
    summary: {
      sent: 0,
      failed: 0,
      total: channels.length
    }
  };

  const promises = [];

  // Send Email
  if (channels.includes('email') && user.email) {
    promises.push(
      sendOTPEmail(user.email, user.name, otp, orderId)
        .then(result => {
          results.email = result;
          if (result.success) results.summary.sent++;
          else results.summary.failed++;
        })
        .catch(error => {
          results.email = { success: false, error: error.message };
          results.summary.failed++;
        })
    );
  }

  // Send SMS
  if (channels.includes('sms') && user.phone) {
    promises.push(
      sendOTPSMS(user.phone, user.name, otp, orderId)
        .then(result => {
          results.sms = result;
          if (result.success) results.summary.sent++;
          else results.summary.failed++;
        })
        .catch(error => {
          results.sms = { success: false, error: error.message };
          results.summary.failed++;
        })
    );
  }

  // Send WhatsApp
  if (channels.includes('whatsapp') && user.phone) {
    promises.push(
      sendOTPWhatsApp(user.phone, user.name, otp, orderId)
        .then(result => {
          results.whatsapp = result;
          if (result.success) results.summary.sent++;
          else results.summary.failed++;
        })
        .catch(error => {
          results.whatsapp = { success: false, error: error.message };
          results.summary.failed++;
        })
    );
  }

  // Wait for all notifications to complete
  await Promise.all(promises);

  console.log(`[NOTIFICATION] OTP sent for order ${orderId}:`, results.summary);
  return results;
};

/**
 * Send order confirmation notification via all available channels
 * @param {Object} user - User object with name, email, phone
 * @param {Object} order - Order object
 * @param {Array} channels - Array of channels to use ['email', 'sms', 'whatsapp']
 * @returns {Promise<Object>} Results from all channels
 */
export const sendOrderConfirmationNotification = async (user, order, channels = ['email', 'sms', 'whatsapp']) => {
  const results = {
    email: null,
    sms: null,
    whatsapp: null,
    summary: {
      sent: 0,
      failed: 0,
      total: channels.length
    }
  };

  const promises = [];

  // Send Email
  if (channels.includes('email') && user.email) {
    promises.push(
      sendOrderConfirmationEmail(user.email, user.name, order)
        .then(result => {
          results.email = result;
          if (result.success) results.summary.sent++;
          else results.summary.failed++;
        })
        .catch(error => {
          results.email = { success: false, error: error.message };
          results.summary.failed++;
        })
    );
  }

  // Send SMS
  if (channels.includes('sms') && user.phone) {
    promises.push(
      sendOrderConfirmationSMS(user.phone, user.name, order._id, order.totalAmount)
        .then(result => {
          results.sms = result;
          if (result.success) results.summary.sent++;
          else results.summary.failed++;
        })
        .catch(error => {
          results.sms = { success: false, error: error.message };
          results.summary.failed++;
        })
    );
  }

  // Send WhatsApp
  if (channels.includes('whatsapp') && user.phone) {
    promises.push(
      sendOrderConfirmationWhatsApp(user.phone, user.name, order._id, order.totalAmount)
        .then(result => {
          results.whatsapp = result;
          if (result.success) results.summary.sent++;
          else results.summary.failed++;
        })
        .catch(error => {
          results.whatsapp = { success: false, error: error.message };
          results.summary.failed++;
        })
    );
  }

  // Wait for all notifications to complete
  await Promise.all(promises);

  console.log(`[NOTIFICATION] Order confirmation sent for ${order._id}:`, results.summary);
  return results;
};

/**
 * Send order status update notification via all available channels
 * @param {Object} user - User object with name, email, phone
 * @param {string} orderId - Order ID
 * @param {string} status - New order status
 * @param {Array} channels - Array of channels to use ['sms', 'whatsapp']
 * @returns {Promise<Object>} Results from all channels
 */
export const sendStatusUpdateNotification = async (user, orderId, status, channels = ['sms', 'whatsapp']) => {
  const results = {
    sms: null,
    whatsapp: null,
    summary: {
      sent: 0,
      failed: 0,
      total: channels.length
    }
  };

  const promises = [];

  // Send SMS
  if (channels.includes('sms') && user.phone) {
    promises.push(
      sendStatusUpdateSMS(user.phone, user.name, orderId, status)
        .then(result => {
          results.sms = result;
          if (result.success) results.summary.sent++;
          else results.summary.failed++;
        })
        .catch(error => {
          results.sms = { success: false, error: error.message };
          results.summary.failed++;
        })
    );
  }

  // Send WhatsApp
  if (channels.includes('whatsapp') && user.phone) {
    promises.push(
      sendStatusUpdateWhatsApp(user.phone, user.name, orderId, status)
        .then(result => {
          results.whatsapp = result;
          if (result.success) results.summary.sent++;
          else results.summary.failed++;
        })
        .catch(error => {
          results.whatsapp = { success: false, error: error.message };
          results.summary.failed++;
        })
    );
  }

  // Wait for all notifications to complete
  await Promise.all(promises);

  console.log(`[NOTIFICATION] Status update sent for ${orderId}:`, results.summary);
  return results;
};

/**
 * Send Delivery OTP notification via SMS
 * @param {string} phone - Customer phone number
 * @param {string} otp - 6-digit OTP
 * @param {string} orderId - Order ID
 * @returns {Promise<Object>} SMS delivery result
 */


/**
 * Send delivery status update notification via SMS
 * @param {string} phone - Customer phone number
 * @param {string} orderId - Order ID
 * @param {string} status - Delivery status
 * @param {string} message - Status message
 * @returns {Promise<Object>} SMS delivery result
 */


/**
 * Test all communication services
 * @param {string} testEmail - Test email address
 * @param {string} testPhone - Test phone number
 * @param {string} testName - Test name
 * @returns {Promise<Object>} Test results
 */
export const testCommunicationServices = async (testEmail, testPhone, testName = 'Test User') => {
  console.log('[TEST] Testing all communication services...');
  
  const testOTP = '123456';
  const testOrderId = 'TEST001';
  
  const results = await sendOTPNotification(
    { name: testName, email: testEmail, phone: testPhone },
    testOTP,
    testOrderId
  );
  
  return results;
};

// Return & Refund Notification Methods

/**
 * Send return request confirmation notification
 * @param {Object} user - User object
 * @param {Object} returnRequest - Return request object
 * @returns {Promise<Object>} Notification results
 */
export const sendReturnRequestConfirmation = async (user, returnRequest) => {
  const message = `Return request ${returnRequest.returnRequestId} has been submitted. We'll review it within 24 hours.`;
  
  const results = {
    sms: null,
    email: null,
    push: null
  };

  try {
    // Send SMS
    if (user.phone) {
      results.sms = await sendStatusUpdateSMS(
        user.phone,
        user.name,
        message,
        returnRequest.returnRequestId
      );
    }

    // Log communication
    if (returnRequest.communications) {
      returnRequest.communications.push({
        type: 'sms',
        message: message,
        sentAt: new Date(),
        status: results.sms?.success ? 'sent' : 'failed',
        recipientType: 'customer'
      });
    }

    return results;
  } catch (error) {
    console.error('Error sending return request confirmation:', error);
    return { error: error.message };
  }
};

/**
 * Send return decision notification (approved/rejected)
 * @param {string} customerId - Customer ID
 * @param {Object} returnRequest - Return request object
 * @param {string} decision - 'approve' or 'reject'
 * @returns {Promise<Object>} Notification results
 */
export const sendReturnDecisionNotification = async (customerId, returnRequest, decision) => {
  const message = decision === 'approve' 
    ? `Good news! Your return request ${returnRequest.returnRequestId} has been approved. Pickup will be scheduled soon.`
    : `Your return request ${returnRequest.returnRequestId} has been reviewed and cannot be processed. ${returnRequest.adminReview.adminComments || ''}`;

  try {
    // This would typically send to customer via SMS/email
    console.log(`Return decision notification: ${message}`);
    return { success: true, message };
  } catch (error) {
    console.error('Error sending return decision notification:', error);
    return { error: error.message };
  }
};

/**
 * Send warehouse assignment notification
 * @param {string} warehouseManagerId - Warehouse manager ID
 * @param {Object} returnRequest - Return request object
 * @returns {Promise<Object>} Notification results
 */
export const sendWarehouseAssignmentNotification = async (warehouseManagerId, returnRequest) => {
  const message = `New return request ${returnRequest.returnRequestId} has been assigned to you for processing.`;

  try {
    console.log(`Warehouse assignment notification to ${warehouseManagerId}: ${message}`);
    return { success: true, message };
  } catch (error) {
    console.error('Error sending warehouse assignment notification:', error);
    return { error: error.message };
  }
};

/**
 * Send pickup assignment notification to delivery agent
 * @param {Object} agent - Delivery agent object
 * @param {Object} returnRequest - Return request object
 * @returns {Promise<Object>} Notification results
 */
export const sendPickupAssignmentNotification = async (agent, returnRequest) => {
  const message = `New return pickup assigned: ${returnRequest.returnRequestId}. Scheduled for ${returnRequest.warehouseManagement.pickup.scheduledDate}.`;

  try {
    console.log(`Pickup assignment notification to ${agent.name}: ${message}`);
    return { success: true, message };
  } catch (error) {
    console.error('Error sending pickup assignment notification:', error);
    return { error: error.message };
  }
};

/**
 * Send pickup completed notification to warehouse manager
 * @param {string} warehouseManagerId - Warehouse manager ID
 * @param {Object} returnRequest - Return request object
 * @returns {Promise<Object>} Notification results
 */
export const sendPickupCompletedNotification = async (warehouseManagerId, returnRequest) => {
  const message = `Return items for ${returnRequest.returnRequestId} have been picked up and are en route to warehouse.`;

  try {
    console.log(`Pickup completed notification to ${warehouseManagerId}: ${message}`);
    return { success: true, message };
  } catch (error) {
    console.error('Error sending pickup completed notification:', error);
    return { error: error.message };
  }
};

/**
 * Send pickup started notification to customer
 * @param {Object} customer - Customer object
 * @param {Object} returnRequest - Return request object
 * @param {string} agentId - Agent ID
 * @returns {Promise<Object>} Notification results
 */
export const sendPickupStartedNotification = async (customer, returnRequest, agentId) => {
  const message = `Your return pickup for ${returnRequest.returnRequestId} is on the way. Please keep items ready.`;

  try {
    console.log(`Pickup started notification to ${customer.name}: ${message}`);
    return { success: true, message };
  } catch (error) {
    console.error('Error sending pickup started notification:', error);
    return { error: error.message };
  }
};

/**
 * Send refund recommendation notification to admin
 * @param {Object} returnRequest - Return request object
 * @returns {Promise<Object>} Notification results
 */
export const sendRefundRecommendationNotification = async (returnRequest) => {
  const message = `Return ${returnRequest.returnRequestId} quality assessment completed. Refund recommendation: ${returnRequest.refund.warehouseRecommendation.recommendation}.`;

  try {
    console.log(`Refund recommendation notification: ${message}`);
    return { success: true, message };
  } catch (error) {
    console.error('Error sending refund recommendation notification:', error);
    return { error: error.message };
  }
};

/**
 * Send refund processed notification to customer
 * @param {Object} user - User object
 * @param {Object} returnRequest - Return request object
 * @param {Object} transaction - Transaction object
 * @returns {Promise<Object>} Notification results
 */
export const sendRefundProcessedNotification = async (user, returnRequest, transaction) => {
  const message = `Refund processed! ${transaction.amount} coins have been credited to your wallet for return ${returnRequest.returnRequestId}.`;

  try {
    if (user.phone) {
      await sendStatusUpdateSMS(
        user.phone,
        user.name,
        message,
        returnRequest.returnRequestId
      );
    }

    console.log(`Refund processed notification to ${user.name}: ${message}`);
    return { success: true, message };
  } catch (error) {
    console.error('Error sending refund processed notification:', error);
    return { error: error.message };
  }
};
