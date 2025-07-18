import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Batch from './models/Batch.js';
import Product from './models/Product.js';

dotenv.config();

const checkBatches = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');
    
    // Get all batches
    const batches = await Batch.find({}).populate('productId');
    console.log(`\nTotal batches found: ${batches.length}`);
    
    if (batches.length === 0) {
      console.log('No batches found in database!');
      
      // Check if there are any products
      const products = await Product.find({});
      console.log(`Total products found: ${products.length}`);
      
      if (products.length > 0) {
        console.log('\nProducts without batches:');
        products.forEach(product => {
          console.log(`- ${product.name} (ID: ${product._id})`);
          if (product.hasVariants) {
            product.variants.forEach(variant => {
              console.log(`  - Variant: ${variant.name} (ID: ${variant.id}, Stock: ${variant.stock})`);
            });
          } else {
            console.log(`  - Stock: ${product.stock}`);
          }
        });
      }
    } else {
      console.log('\nBatches found:');
      batches.forEach(batch => {
        console.log(`- Batch ${batch.batchNumber}`);
        console.log(`  Product: ${batch.productId?.name || 'Unknown'} (ID: ${batch.productId})`);
        console.log(`  Variant: ${batch.variantId || 'None'}`);
        console.log(`  Status: ${batch.status}`);
        console.log(`  Available: ${batch.availableQuantity}`);
        console.log(`  Allocated: ${batch.allocatedQuantity}`);
        console.log(`  Total: ${batch.quantity}`);
        console.log('');
      });
    }
    
    // Check active batches specifically
    const activeBatches = await Batch.find({ status: 'Active' });
    console.log(`\nActive batches: ${activeBatches.length}`);
    
    if (activeBatches.length > 0) {
      console.log('Active batches details:');
      activeBatches.forEach(batch => {
        console.log(`- ${batch.batchNumber}: Product ${batch.productId}, Variant ${batch.variantId}, Available: ${batch.availableQuantity}`);
      });
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Error checking batches:', error);
    process.exit(1);
  }
};

checkBatches();
