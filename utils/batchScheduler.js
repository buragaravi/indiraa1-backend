import cron from 'node-cron';
import batchService from '../services/batchService.js';
import batchStockUtils from './batchStockUtils.js';

// Schedule to run every day at 2 AM to update expired batches
const scheduleExpiredBatchUpdate = () => {
  cron.schedule('0 2 * * *', async () => {
    try {
      console.log('[BATCH SCHEDULER] Starting daily expired batch update...');
      
      // Update expired batches
      const expiredResult = await batchService.updateExpiredBatches();
      console.log(`[BATCH SCHEDULER] Updated ${expiredResult.modifiedCount} expired batches`);
      
      // Sync product stocks with batch data
      const syncResult = await batchStockUtils.syncAllProductStocks();
      console.log(`[BATCH SCHEDULER] Synced stock for ${syncResult.updatedCount} products`);
      
      // Get batches expiring in next 7 days for alerts
      const expiringBatches = await batchService.getExpiringBatches(7);
      if (expiringBatches.length > 0) {
        console.log(`[BATCH SCHEDULER] WARNING: ${expiringBatches.length} batches expiring in next 7 days`);
        // Here you could send notifications to admin about expiring batches
      }
      
      console.log('[BATCH SCHEDULER] Daily batch maintenance completed');
    } catch (error) {
      console.error('[BATCH SCHEDULER] Error in daily batch update:', error);
    }
  });
  
  console.log('[BATCH SCHEDULER] Scheduled daily expired batch update at 2:00 AM');
};

// Schedule to run every hour to sync product stocks
const scheduleStockSync = () => {
  cron.schedule('0 * * * *', async () => {
    try {
      console.log('[BATCH SCHEDULER] Starting hourly stock synchronization...');
      
      const syncResult = await batchStockUtils.syncAllProductStocks();
      console.log(`[BATCH SCHEDULER] Hourly sync completed for ${syncResult.updatedCount} products`);
    } catch (error) {
      console.error('[BATCH SCHEDULER] Error in hourly stock sync:', error);
    }
  });
  
  console.log('[BATCH SCHEDULER] Scheduled hourly stock synchronization');
};

// Initialize all batch-related scheduled jobs
export const initializeBatchScheduler = () => {
  console.log('[BATCH SCHEDULER] Initializing batch management scheduled jobs...');
  
  scheduleExpiredBatchUpdate();
  scheduleStockSync();
  
  console.log('[BATCH SCHEDULER] All batch scheduled jobs initialized');
};

export default {
  initializeBatchScheduler,
  scheduleExpiredBatchUpdate,
  scheduleStockSync
};
