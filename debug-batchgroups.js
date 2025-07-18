import mongoose from 'mongoose';
import dotenv from 'dotenv';
import BatchGroup from './models/BatchGroup.js';
import Product from './models/Product.js';

dotenv.config();

const checkBatchGroups = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');
    
    // Get all batch groups
    const batchGroups = await BatchGroup.find({}).populate('products.productId');
    console.log(`\nTotal batch groups found: ${batchGroups.length}`);
    
    if (batchGroups.length === 0) {
      console.log('No batch groups found in database!');
      
      // Check if there are any products
      const products = await Product.find({});
      console.log(`Total products found: ${products.length}`);
      
      if (products.length > 0) {
        console.log('\nProducts without batch groups:');
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
      console.log('\nBatch groups found:');
      batchGroups.forEach(batchGroup => {
        console.log(`- Batch Group ${batchGroup.batchGroupNumber}`);
        console.log(`  Status: ${batchGroup.status}`);
        console.log(`  Group Type: ${batchGroup.groupType}`);
        console.log(`  Products: ${batchGroup.products.length}`);
        
        batchGroup.products.forEach(product => {
          console.log(`    - Product: ${product.productId?.name || 'Unknown'} (ID: ${product.productId})`);
          
          if (product.variants && product.variants.length > 0) {
            product.variants.forEach(variant => {
              console.log(`      - Variant ${variant.variantName} (ID: ${variant.variantId})`);
              console.log(`        Available: ${variant.availableQuantity}, Allocated: ${variant.allocatedQuantity}, Total: ${variant.quantity}`);
            });
          } else {
            console.log(`      - Available: ${product.availableQuantity}, Allocated: ${product.allocatedQuantity}, Total: ${product.quantity}`);
          }
        });
        console.log('');
      });
    }
    
    // Check active batch groups specifically
    const activeBatchGroups = await BatchGroup.find({ status: 'Active' });
    console.log(`\nActive batch groups: ${activeBatchGroups.length}`);
    
    if (activeBatchGroups.length > 0) {
      console.log('Active batch groups summary:');
      activeBatchGroups.forEach(batchGroup => {
        console.log(`- ${batchGroup.batchGroupNumber}: ${batchGroup.products.length} products`);
      });
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Error checking batch groups:', error);
    process.exit(1);
  }
};

checkBatchGroups();
