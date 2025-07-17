// Quick VAPID key generator
const crypto = require('crypto');

// Generate a 65-byte VAPID public key (base64url encoded)
function generateVapidKeys() {
  // This is a simplified version - in production, use proper webpush.generateVAPIDKeys()
  const publicKey = 'BG3Gx8HYNaOQfMnT4KGt2x7VZ1QJ8YpKLmNoDcFePqR5sUvWxYz2ABcDeFgHiJkLmNoPqRsTuVwXyZ1234567890';
  const privateKey = 'abcd1234567890abcd1234567890abcd12345678';
  
  // Generate proper keys using crypto
  const keys = crypto.generateKeyPairSync('ec', {
    namedCurve: 'prime256v1',
    publicKeyEncoding: { type: 'spki', format: 'der' },
    privateKeyEncoding: { type: 'pkcs8', format: 'der' }
  });
  
  return {
    publicKey: Buffer.from(keys.publicKey).toString('base64url'),
    privateKey: Buffer.from(keys.privateKey).toString('base64url')
  };
}

const vapidKeys = generateVapidKeys();
console.log('Public Key:', vapidKeys.publicKey);
console.log('Private Key:', vapidKeys.privateKey);
