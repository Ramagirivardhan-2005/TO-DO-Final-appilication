/**
 * Migration Script: Encrypt Existing User Data
 * 
 * This script encrypts plaintext username and email fields in the database.
 * Run this once to migrate existing data to encrypted format.
 * 
 * Usage: node migrate-encrypt.js
 * 
 * Prerequisites:
 * - MongoDB connection string in MONGO_URI env var or default localhost
 * - Same ENCRYPTION_KEY as server.js (or it will use default key)
 */

require('dotenv').config();
const mongoose = require('mongoose');
const crypto = require('crypto');

// Use same encryption key as server.js
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY
    ? Buffer.from(process.env.ENCRYPTION_KEY, 'hex')
    : crypto.createHash('sha256').update('todo_app_encryption_key_v1_secure_2026').digest();
const IV_LENGTH = 16;

function encrypt(text) {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    return iv.toString('hex') + ':' + authTag + ':' + encrypted;
}

function isEncrypted(text) {
    return text && text.includes(':') && text.split(':').length === 3;
}

// User Schema (minimal)
const UserSchema = new mongoose.Schema({
    username: { type: String },
    userid: { type: String },
    password: { type: String },
    email: { type: String },
    points: { type: Number },
    walletBalance: { type: Number },
    googleId: { type: String },
    githubId: { type: String },
    mfaSecret: { type: String },
    mfaEnabled: { type: Boolean },
    isEmailVerified: { type: Boolean },
    emailOtp: { type: String },
    otpExpiry: { type: Date }
});

// EmailConfig Schema (minimal)
const EmailConfigSchema = new mongoose.Schema({
    user_id: { type: String },
    email: { type: String },
    app_password: { type: String },
    imap_host: { type: String },
    imap_port: { type: Number },
    last_scan: { type: Date },
    instagram_handles: [{ type: String }]
});

async function migrate() {
    const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/todo_app';
    
    console.log('🔐 Starting encryption migration...');
    console.log('Connecting to:', mongoUri);
    
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');
    
    const User = mongoose.model('User', UserSchema);
    const EmailConfig = mongoose.model('EmailConfig', EmailConfigSchema);
    
    // ========== Migrate Users ==========
    console.log('\n📧 Migrating User collection...');
    
    const users = await User.find({});
    let userMigrated = 0;
    let userSkipped = 0;
    let userErrors = 0;
    
    for (const user of users) {
        try {
            let needsUpdate = false;
            const updates = {};
            
            // Encrypt username if not already encrypted
            if (user.username && !isEncrypted(user.username)) {
                updates.username = encrypt(user.username);
                needsUpdate = true;
            }
            
            // Encrypt email if not already encrypted
            if (user.email && !isEncrypted(user.email)) {
                updates.email = encrypt(user.email);
                needsUpdate = true;
            }
            
            if (needsUpdate) {
                await User.findByIdAndUpdate(user._id, updates);
                userMigrated++;
                console.log(`  ✅ Migrated user: ${user.userid}`);
            } else {
                userSkipped++;
            }
        } catch (err) {
            userErrors++;
            console.error(`  ❌ Error migrating user ${user.userid}:`, err.message);
        }
    }
    
    console.log(`\n📊 User migration complete:`);
    console.log(`   - Migrated: ${userMigrated}`);
    console.log(`   - Already encrypted: ${userSkipped}`);
    console.log(`   - Errors: ${userErrors}`);
    
    // ========== Migrate EmailConfig ==========
    console.log('\n📧 Migrating EmailConfig collection...');
    
    const configs = await EmailConfig.find({});
    let configMigrated = 0;
    let configSkipped = 0;
    let configErrors = 0;
    
    for (const config of configs) {
        try {
            let needsUpdate = false;
            const updates = {};
            
            // Encrypt email if not already encrypted
            if (config.email && !isEncrypted(config.email)) {
                updates.email = encrypt(config.email);
                needsUpdate = true;
            }
            
            // Encrypt app_password if not already encrypted
            if (config.app_password && !isEncrypted(config.app_password)) {
                updates.app_password = encrypt(config.app_password);
                needsUpdate = true;
            }
            
            // Encrypt instagram_handles if not already encrypted
            if (config.instagram_handles && config.instagram_handles.length > 0) {
                const encryptedHandles = [];
                let handleEncrypted = false;
                
                for (const handle of config.instagram_handles) {
                    if (!isEncrypted(handle)) {
                        encryptedHandles.push(encrypt(handle));
                        handleEncrypted = true;
                    } else {
                        encryptedHandles.push(handle);
                    }
                }
                
                if (handleEncrypted) {
                    updates.instagram_handles = encryptedHandles;
                    needsUpdate = true;
                }
            }
            
            if (needsUpdate) {
                await EmailConfig.findByIdAndUpdate(config._id, updates);
                configMigrated++;
                console.log(`  ✅ Migrated config for user: ${config.user_id}`);
            } else {
                configSkipped++;
            }
        } catch (err) {
            configErrors++;
            console.error(`  ❌ Error migrating config for ${config.user_id}:`, err.message);
        }
    }
    
    console.log(`\n📊 EmailConfig migration complete:`);
    console.log(`   - Migrated: ${configMigrated}`);
    console.log(`   - Already encrypted: ${configSkipped}`);
    console.log(`   - Errors: ${configErrors}`);
    
    // ========== Summary ==========
    console.log('\n========================================');
    console.log('🔐 MIGRATION COMPLETE');
    console.log('========================================');
    console.log(`Total users migrated: ${userMigrated}`);
    console.log(`Total configs migrated: ${configMigrated}`);
    console.log('\n⚠️  IMPORTANT:');
    console.log('- New registrations will now store encrypted data');
    console.log('- Existing data has been encrypted');
    console.log('- The server will automatically decrypt on read');
    console.log('========================================\n');
    
    await mongoose.disconnect();
    process.exit(0);
}

migrate().catch(err => {
    console.error('Migration failed:', err);
    process.exit(1);
});