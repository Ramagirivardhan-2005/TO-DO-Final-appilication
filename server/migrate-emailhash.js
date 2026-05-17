/**
 * Migration Script: Backfill emailHash for existing users
 * 
 * Run this ONCE after deploying the emailHash fix:
 *   node migrate-emailhash.js
 * 
 * This script:
 * 1. Connects to MongoDB
 * 2. Finds all users missing emailHash
 * 3. Decrypts their stored email → computes SHA-256 HMAC hash → saves emailHash
 */
require('dotenv').config();
const mongoose = require('mongoose');
const crypto = require('crypto');

// --- Same encryption config as server.js ---
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY
    ? Buffer.from(process.env.ENCRYPTION_KEY, 'hex')
    : crypto.createHash('sha256').update('todo_app_encryption_key_v1_secure_2026').digest();

function decrypt(encryptedText) {
    const parts = encryptedText.split(':');
    if (parts.length !== 3) throw new Error('Invalid encrypted text format');
    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(parts[2], 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}

function emailHash(email) {
    return crypto.createHmac('sha256', ENCRYPTION_KEY)
        .update(email.toLowerCase().trim())
        .digest('hex');
}

// Minimal user schema
const UserSchema = new mongoose.Schema({
    username: String,
    userid: String,
    password: String,
    email: String,
    emailHash: String,
    points: Number,
    walletBalance: Number,
    googleId: String,
    githubId: String,
    mfaSecret: String,
    mfaEnabled: Boolean,
    isEmailVerified: Boolean,
    emailOtp: String,
    otpExpiry: Date
});
const User = mongoose.model('User', UserSchema);

async function migrate() {
    const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/todo_app';
    console.log(`Connecting to ${uri}...`);
    await mongoose.connect(uri);
    console.log('✅ Connected to MongoDB');

    const users = await User.find({ $or: [{ emailHash: { $exists: false } }, { emailHash: null }] });
    console.log(`Found ${users.length} users without emailHash`);

    let updated = 0;
    let failed = 0;

    for (const user of users) {
        try {
            let plainEmail = user.email;
            // Decrypt if encrypted (contains ':' separators from AES-GCM format)
            if (plainEmail && plainEmail.includes(':')) {
                plainEmail = decrypt(plainEmail);
            }

            user.emailHash = emailHash(plainEmail);
            await user.save();
            updated++;
            console.log(`  ✅ ${user.userid} → hash set`);
        } catch (err) {
            failed++;
            console.error(`  ❌ ${user.userid}: ${err.message}`);
        }
    }

    console.log(`\nDone! Updated: ${updated}, Failed: ${failed}`);
    await mongoose.disconnect();
    process.exit(0);
}

migrate().catch(err => {
    console.error('Migration failed:', err);
    process.exit(1);
});
