import mongoose from 'mongoose';
import dotenv from 'dotenv';
import BatchGroup from './models/BatchGroup.js';
import Order from './models/Order.js';

dotenv.config();

const findUnprocessedOrders = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');
    
    // Find all orders and their statuses
    const orders = await Order.find({}).select('_id status items').lean();
    
    console.log(`\n=== CHECKING ${orders.length} ORDERS ===`);
    
    // Find orders that are not yet delivered
    const undeliveredOrders = orders.filter(order => order.status !== 'Delivered');
    
    console.log(`\nFound ${undeliveredOrders.length} undelivered orders:`);
    
    for (const order of undeliveredOrders) {
      console.log(`Order ${order._id}: Status=${order.status}, Items=${order.items?.length || 0}`);
      
      // Check if this order has allocations in batch groups
      const batchGroups = await BatchGroup.find({
        'orderAllocations.orderId': order._id
      });
      
      if (batchGroups.length > 0) {
        console.log(`  Has allocations in ${batchGroups.length} batch groups`);
        
        batchGroups.forEach(bg => {
          const orderAllocations = bg.orderAllocations.filter(
            alloc => alloc.orderId.toString() === order._id.toString()
          );
          console.log(`    Batch Group ${bg._id}: ${orderAllocations.length} allocations`);
          orderAllocations.forEach(alloc => {
            console.log(`      Status: ${alloc.status}, Items: ${alloc.items?.length || 0}`);
          });
        });
      } else {
        console.log(`  No batch group allocations found`);
      }
    }
    
    // Also check for orders with status 'Delivered' that might have unprocessed allocations
    console.log(`\n=== CHECKING FOR DELIVERED ORDERS WITH UNPROCESSED ALLOCATIONS ===`);
    
    const deliveredOrders = orders.filter(order => order.status === 'Delivered');
    console.log(`Found ${deliveredOrders.length} delivered orders`);
    
    for (const order of deliveredOrders.slice(0, 5)) { // Check first 5 delivered orders
      const batchGroups = await BatchGroup.find({
        'orderAllocations.orderId': order._id,
        'orderAllocations.status': { $ne: 'Delivered' }
      });
      
      if (batchGroups.length > 0) {
        console.log(`\nOrder ${order._id} (Status: ${order.status}) has unprocessed allocations:`);
        
        batchGroups.forEach(bg => {
          const orderAllocations = bg.orderAllocations.filter(
            alloc => alloc.orderId.toString() === order._id.toString() && alloc.status !== 'Delivered'
          );
          console.log(`  Batch Group ${bg._id}: ${orderAllocations.length} unprocessed allocations`);
          orderAllocations.forEach(alloc => {
            console.log(`    Status: ${alloc.status}, Items: ${alloc.items?.length || 0}`);
          });
        });
        
        // This would be a good candidate for testing
        console.log(`\n*** This order would be good for testing moveAllocatedToUsed ***`);
        break;
      }
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Error finding unprocessed orders:', error);
    process.exit(1);
  }
};

findUnprocessedOrders();
