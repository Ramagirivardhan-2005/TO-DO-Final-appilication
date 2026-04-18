// server/server.js
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bodyParser = require('body-parser');
const fetch = require('node-fetch');
const cheerio = require('cheerio');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');
const Razorpay = require('razorpay');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');

const { createClient } = require('redis');

// --- REDIS CACHE UTILITIES ---
let redisClient = null;
(async () => {
    try {
        redisClient = createClient({ url: process.env.REDIS_URI || 'redis://127.0.0.1:6379' });
        redisClient.on('error', (err) => {
           // Suppress spammy connection errors if Redis isn't running
        });
        await redisClient.connect();
        console.log('✅ Redis Connected');
    } catch(err) {
        console.log('⚠️ Redis not running. Running without cache.');
        redisClient = null;
    }
})();

const getCachedData = async (key) => {
    if (!redisClient) return null;
    try { 
        const cached = await redisClient.get(key); 
        return cached ? JSON.parse(cached) : null; 
    } catch(e) { return null; }
};

const setCachedData = async (key, data, expirySeconds = 3600) => {
    if (!redisClient) return;
    try { await redisClient.setEx(key, expirySeconds, JSON.stringify(data)); } catch(e) {}
};



const razorpay = new Razorpay({
    key_id: 'rzp_test_SdnwDgxUhr6hKi',
    key_secret: 'v4irVY2uokZ03BC2wl78V1vy'
});

// --- ENCRYPTION UTILITIES (AES-256-GCM) ---
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

// --- MIDDLEWARE ---
const JWT_SECRET = process.env.JWT_SECRET || 'your_super_secret_jwt_key_here_tododash';
const BCRYPT_ROUNDS = 12;

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (token == null) return res.sendStatus(401);
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
};

const app = express();

// --- MIDDLEWARE ---
const ALLOWED_ORIGINS = [
    'https://to-do-final-appilication-2.onrender.com',
    'http://localhost:3000',
    'http://localhost:3001'
];
app.use(cors({
    origin: function (origin, callback) {
        // Allow requests with no origin (mobile apps, curl, Render health checks)
        if (!origin) return callback(null, true);
        
        // Dynamically allow the FRONTEND_URL if specified in env
        if (process.env.FRONTEND_URL && origin === process.env.FRONTEND_URL) return callback(null, true);
        
        // Allow any Vercel preview/production domains dynamically
        if (origin.endsWith('.vercel.app')) return callback(null, true);
        
        if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
        
        return callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(bodyParser.json());

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));

// Connect MongoDB
mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/todo_app')
    .then(() => console.log('✅ MongoDB Connected'))
    .catch(err => console.error('❌ DB Error:', err));

// ========== SCHEMAS ==========
const UserSchema = new mongoose.Schema({
    username: { type: String, required: true },
    userid: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    email: { type: String, required: true },
    points: { type: Number, default: 0 },
    walletBalance: { type: Number, default: 0 }, // In rupees
    googleId: { type: String, sparse: true, unique: true },
    githubId: { type: String, sparse: true, unique: true },
    mfaSecret: { type: String, default: null }, // Encrypted TOTP secret
    mfaEnabled: { type: Boolean, default: false },
    isEmailVerified: { type: Boolean, default: false },
    emailOtp: { type: String },
    otpExpiry: { type: Date }
});
const User = mongoose.model('User', UserSchema);

const TaskSchema = new mongoose.Schema({
    user_id: { type: String, required: true },
    task_name: { type: String, required: true },
    description: { type: String, default: '' },
    reminder: { type: [String], default: [] },
    recurrence: { type: String, default: 'None' },
    recurring_id: { type: String, default: null },
    penalty_applied: { type: Boolean, default: false },
    priority: { type: String, default: 'Medium' },
    completion_time: { type: String },
    created_at: { type: Date, default: Date.now },
    source: { type: String, default: 'manual' },
    source_url: { type: String, default: '' },
    is_completed: { type: Boolean, default: false },
    completed_at: { type: Date }
});
const Task = mongoose.model('Task', TaskSchema);

const TransactionSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    type: { type: String, enum: ['coin_purchase', 'coin_redeem', 'wallet_spend'], required: true },
    amount: { type: Number, required: true },
    coinsInvolved: { type: Number, default: 0 },
    description: { type: String },
    razorpayPaymentId: { type: String },
    status: { type: String, enum: ['success', 'failed', 'pending'], default: 'success' },
    createdAt: { type: Date, default: Date.now }
});
const Transaction = mongoose.model('Transaction', TransactionSchema);

const SubscriptionSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    serviceName: { type: String, required: true },
    serviceType: { type: String },
    amountPaid: { type: Number, required: true },
    purchasedAt: { type: Date, default: Date.now },
    expiresAt: { type: Date },
    status: { type: String, enum: ['active', 'expired', 'cancelled'], default: 'active' }
});
const Subscription = mongoose.model('Subscription', SubscriptionSchema);

// Email credentials schema (per user)
const EmailConfigSchema = new mongoose.Schema({
    user_id: { type: String, required: true, unique: true },
    email: { type: String, required: true },
    app_password: { type: String, required: true }, // Now encrypted with AES-256-GCM
    imap_host: { type: String, default: 'imap.gmail.com' },
    imap_port: { type: Number, default: 993 },
    last_scan: { type: Date },
    instagram_handles: [{ type: String }]
});
const EmailConfig = mongoose.model('EmailConfig', EmailConfigSchema);

// ========== USER DATA ROUTE ==========
app.get('/users/:id', authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        res.json({ points: user.points, email: user.email, username: user.username, walletBalance: user.walletBalance || 0, mfaEnabled: user.mfaEnabled || false });
    } catch(err) {
        res.status(500).json({error: "Server Error"});
    }
});

// ========== AUTH ROUTES ==========
app.post('/register', async (req, res) => {
    try {
        const { username, userid, password, email } = req.body;
        const existingUser = await User.findOne({ $or: [{username}, {email}, {userid: userid || username}] });
        if (existingUser) return res.json({ error: "Username, User ID, or Email already exists" });

        // Hash password with bcrypt
        const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);
        
        const newUser = new User({ 
            username, userid: userid || username, password: hashedPassword, email, 
            points: 0, walletBalance: 0,
            isEmailVerified: true
        });
        await newUser.save();

        const token = jwt.sign({ id: newUser._id, username: newUser.username }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ token, user: { id: newUser._id, username: newUser.username, userid: newUser.userid, email: newUser.email, points: newUser.points, walletBalance: newUser.walletBalance || 0, mfaEnabled: false } });
    } catch (err) { res.json({ error: err.message }); }
});

app.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(401).json({ message: "Invalid credentials. Please try again." });
    }

    // Support both bcrypt hashed and legacy plaintext passwords
    let isValid = false;
    if (user.password.startsWith('$2')) {
      // Bcrypt hashed password
      isValid = await bcrypt.compare(password, user.password);
    } else {
      // Legacy plaintext — migrate on successful login
      isValid = (user.password === password);
      if (isValid) {
        user.password = await bcrypt.hash(password, BCRYPT_ROUNDS);
        await user.save();
        console.log(`🔒 Migrated plaintext password for user: ${user.username}`);
      }
    }

    if (!isValid) {
      return res.status(401).json({ message: "Incorrect password. Please try again." });
    }

    // Check if MFA is enabled
    if (user.mfaEnabled) {
      // Don't issue token yet — require TOTP verification
      const tempToken = jwt.sign({ id: user._id, mfaPending: true }, JWT_SECRET, { expiresIn: '5m' });
      return res.json({ mfaRequired: true, tempToken });
    }
    
    const token = jwt.sign({ id: user._id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user._id, username: user.username, userid: user.userid, email: user.email, points: user.points, walletBalance: user.walletBalance || 0, mfaEnabled: user.mfaEnabled || false } });
  } catch (err) { 
    console.error('Login error:', err);
    res.status(500).json({ error: "Server error during login" }); 
  }
});

app.post('/api/auth/google', async (req, res) => {
    try {
        const { googleToken } = req.body;
        const decoded = jwt.decode(googleToken); 
        if (!decoded || !decoded.email) return res.status(400).json({error: "Invalid token structure"});
        
        const email = decoded.email;
        const name = decoded.name || email.split('@')[0];
        const googleId = decoded.sub;

        let user = await User.findOne({ email });
        if (!user) {
            const hashedPw = await bcrypt.hash('oauth_managed_no_password', BCRYPT_ROUNDS);
            user = new User({ username: name, userid: name + uuidv4().substring(0,4), email, googleId, password: hashedPw, points: 0, walletBalance: 0 });
            await user.save();
        } else if (!user.googleId) {
            user.googleId = googleId;
            await user.save();
        }

        // Check MFA for OAuth users too
        if (user.mfaEnabled) {
            const tempToken = jwt.sign({ id: user._id, mfaPending: true }, JWT_SECRET, { expiresIn: '5m' });
            return res.json({ mfaRequired: true, tempToken });
        }

        const token = jwt.sign({ id: user._id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ token, user: { id: user._id, username: user.username, userid: user.userid, email: user.email, points: user.points, walletBalance: user.walletBalance || 0, mfaEnabled: user.mfaEnabled || false } });
    } catch(err) { 
        console.error("Google Auth Backend Error:", err);
        res.status(500).json({ error: err.message }); 
    }
});

app.post('/api/auth/github', async (req, res) => {
    try {
        const { code } = req.body;
        const githubClientId = process.env.GITHUB_CLIENT_ID || "Ov23liZrBeVKxKMXoxJ1";
        const githubClientSecret = process.env.GITHUB_CLIENT_SECRET;

        if (!githubClientSecret) {
            return res.status(500).json({ error: "GitHub Client Secret is not configured on the server." });
        }

        const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({
                client_id: githubClientId,
                client_secret: githubClientSecret,
                code: code
            })
        });
        const tokenData = await tokenResponse.json();

        if (tokenData.error) {
            return res.status(400).json({ error: tokenData.error_description });
        }

        const accessToken = tokenData.access_token;
        const userResponse = await fetch('https://api.github.com/user', {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        const githubUser = await userResponse.json();

        const emailResponse = await fetch('https://api.github.com/user/emails', {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        const emails = await emailResponse.json();
        const primaryEmailObj = emails.find(e => e.primary) || emails[0];
        const email = primaryEmailObj ? primaryEmailObj.email : null;

        if (!email) {
            return res.status(400).json({ error: "No email associated with this GitHub account." });
        }

        let user = await User.findOne({ email });
        if (!user) {
            const hashedPw = await bcrypt.hash('oauth_managed_no_password', BCRYPT_ROUNDS);
            user = new User({ 
                username: githubUser.login || githubUser.name, 
                userid: (githubUser.login || 'github') + uuidv4().substring(0,4), 
                email, 
                githubId: githubUser.id.toString(), 
                password: hashedPw, 
                points: 0, 
                walletBalance: 0 
            });
            await user.save();
        } else if (!user.githubId) {
            user.githubId = githubUser.id.toString();
            await user.save();
        }

        if (user.mfaEnabled && user.mfaSecret) {
            const tempToken = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: '5m' });
            return res.json({ mfaRequired: true, tempToken });
        }

        const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: '1h' });
        res.json({ token, user: { id: user._id, username: user.username, email: user.email, points: user.points, walletBalance: user.walletBalance, mfaEnabled: user.mfaEnabled }});

    } catch(err) { res.status(500).json({ error: err.message }); }
});

// ========== PASSWORD RESET ROUTES ==========
app.post('/api/auth/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;
        const user = await User.findOne({ email });
        if (!user) return res.status(404).json({ error: "No account found with that email." });

        const emailOtp = Math.floor(100000 + Math.random() * 900000).toString();
        user.emailOtp = emailOtp;
        user.otpExpiry = new Date(Date.now() + 10 * 60000);
        await user.save();

        console.log(`\n============== PASSWORD RESET OTP ==============`);
        console.log(`EMAIL OTP: [${emailOtp}] for ${email}`);
        console.log(`================================================\n`);

        console.log(`[MOCK EMAIL] To: ${email} -> Subject: Password Reset Code 🔑 -> Body: Your password reset code is: ${emailOtp}. It expires in 10 minutes.`);

        res.json({ message: "Password reset code sent to your email." });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/auth/reset-password', async (req, res) => {
    try {
        const { email, otp, newPassword } = req.body;
        const user = await User.findOne({ email });
        if (!user) return res.status(404).json({ error: "No account found." });

        if (user.otpExpiry < new Date() || user.emailOtp !== otp) {
            return res.status(400).json({ error: "Invalid or expired OTP." });
        }

        user.password = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
        user.emailOtp = undefined;
        user.otpExpiry = undefined;
        await user.save();

        res.json({ message: "Password has been successfully reset. You can now login." });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ========== MFA ROUTES (TOTP & EMAIL) ==========
app.post('/api/mfa/setup', authenticateToken, async (req, res) => {
    try {
        const { userId } = req.body;
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ error: 'User not found' });
        if (user.mfaEnabled) return res.status(400).json({ error: 'MFA is already enabled' });

        // Generate TOTP secret
        const secret = speakeasy.generateSecret({
            name: `TodoApp (${user.email})`,
            issuer: 'TodoApp',
            length: 32
        });

        // Encrypt and store temporarily
        user.mfaSecret = encrypt(secret.base32);
        await user.save();

        // Generate QR code data URL
        const qrDataUrl = await QRCode.toDataURL(secret.otpauth_url);

        res.json({
            secret: secret.base32, // Show to user for manual entry
            qrCode: qrDataUrl,
            message: 'Scan the QR code with Google Authenticator, then verify with a code'
        });
    } catch (err) {
        console.error('MFA setup error:', err);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/mfa/verify-setup', async (req, res) => {
    try {
        const { userId, token: totpCode } = req.body;
        const user = await User.findById(userId);
        if (!user || !user.mfaSecret) return res.status(400).json({ error: 'MFA setup not initiated' });

        const decryptedSecret = decrypt(user.mfaSecret);
        const isValid = speakeasy.totp.verify({
            secret: decryptedSecret,
            encoding: 'base32',
            token: totpCode,
            window: 2
        });

        if (!isValid) {
            return res.status(400).json({ error: 'Invalid verification code. Try again.' });
        }

        user.mfaEnabled = true;
        await user.save();

        res.json({ success: true, message: 'MFA enabled successfully!' });
    } catch (err) {
        console.error('MFA verify-setup error:', err);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/mfa/verify-login', async (req, res) => {
    try {
        const { tempToken, token: totpCode } = req.body;
        
        // Verify the temp token
        let decoded;
        try {
            decoded = jwt.verify(tempToken, JWT_SECRET);
        } catch (e) {
            return res.status(401).json({ error: 'MFA session expired. Please login again.' });
        }

        if (!decoded.mfaPending) {
            return res.status(400).json({ error: 'Invalid MFA session' });
        }

        const user = await User.findById(decoded.id);
        if (!user || (!user.mfaEnabled && !user.emailOtp)) {
            return res.status(400).json({ error: 'MFA not configured or invalid session.' });
        }

        let isValid = false;
        
        // 1. Check if Email OTP matches
        if (user.emailOtp && user.emailOtp === totpCode && user.otpExpiry > new Date()) {
            isValid = true;
            user.emailOtp = undefined;
            user.otpExpiry = undefined;
            await user.save();
        } 
        // 2. Or fallback to Authenticator TOTP
        else if (user.mfaEnabled && user.mfaSecret) {
            const decryptedSecret = decrypt(user.mfaSecret);
            isValid = speakeasy.totp.verify({
                secret: decryptedSecret,
                encoding: 'base32',
                token: totpCode,
                window: 2
            });
        }

        if (!isValid) {
            return res.status(400).json({ error: 'Invalid verification code.' });
        }

        // Issue full JWT
        const fullToken = jwt.sign({ id: user._id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
        res.json({
            token: fullToken,
            user: { id: user._id, username: user.username, userid: user.userid, email: user.email, points: user.points, walletBalance: user.walletBalance || 0, mfaEnabled: !!user.mfaSecret }
        });
    } catch (err) {
        console.error('MFA verify-login error:', err);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/auth/request-email-mfa', async (req, res) => {
    try {
        const { tempToken } = req.body;
        let decoded;
        try { decoded = jwt.verify(tempToken, JWT_SECRET); } 
        catch (e) { return res.status(401).json({ error: 'MFA session expired.' }); }
        
        const user = await User.findById(decoded.id);
        if(!user) return res.status(404).json({error: "User not found"});

        const emailOtp = Math.floor(100000 + Math.random() * 900000).toString();
        user.emailOtp = emailOtp;
        user.otpExpiry = new Date(Date.now() + 10 * 60000);
        await user.save();

        console.log(`\n============== LOGIN OTP FOR ${user.username} ==============`);
        console.log(`EMAIL OTP: [${emailOtp}]`);
        console.log(`====================================================\n`);

        console.log(`[MOCK EMAIL] To: ${user.email} -> Subject: Your Login MFA Code ✉️ -> Body: Your login code is: ${emailOtp}. It expires in 10 minutes.`);

        res.json({ message: "Verification code sent to your registered email!" });
    } catch(err) { res.status(500).json({error: err.message}); }
});

app.post('/api/mfa/disable', authenticateToken, async (req, res) => {
    try {
        const { userId, token: totpCode } = req.body;
        const user = await User.findById(userId);
        if (!user || !user.mfaEnabled) return res.status(400).json({ error: 'MFA is not enabled' });

        const decryptedSecret = decrypt(user.mfaSecret);
        const isValid = speakeasy.totp.verify({
            secret: decryptedSecret,
            encoding: 'base32',
            token: totpCode,
            window: 2
        });

        if (!isValid) {
            return res.status(400).json({ error: 'Invalid MFA code. Cannot disable.' });
        }

        user.mfaEnabled = false;
        user.mfaSecret = null;
        await user.save();

        res.json({ success: true, message: 'MFA disabled successfully' });
    } catch (err) {
        console.error('MFA disable error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ========== WALLET & REDEMPTION ROUTES ==========
app.get('/api/wallet/balance/:userId', authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.params.userId);
        if (!user) return res.status(404).json({ error: 'User not found' });
        res.json({
            coins: user.points,
            walletBalance: user.walletBalance || 0,
            redeemableAmount: Math.floor(user.points / 500) * 50 // How much they can redeem
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/wallet/redeem', authenticateToken, async (req, res) => {
    try {
        const { userId, coinAmount } = req.body;

        if (!coinAmount || coinAmount < 500) {
            return res.status(400).json({ error: 'Minimum 500 coins required for redemption' });
        }
        if (coinAmount % 500 !== 0) {
            return res.status(400).json({ error: 'Coin amount must be multiples of 500' });
        }

        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ error: 'User not found' });
        if (user.points < coinAmount) {
            return res.status(400).json({ error: `Insufficient coins. You have ${user.points} coins.` });
        }

        const rupeesToAdd = (coinAmount / 500) * 50; // 500 coins = ₹50

        user.points -= coinAmount;
        user.walletBalance = (user.walletBalance || 0) + rupeesToAdd;
        await user.save();

        // Log transaction
        await new Transaction({
            userId,
            type: 'coin_redeem',
            amount: rupeesToAdd,
            coinsInvolved: coinAmount,
            description: `Redeemed ${coinAmount} coins for ₹${rupeesToAdd}`,
            status: 'success'
        }).save();

        res.json({
            success: true,
            coinsDeducted: coinAmount,
            rupeesAdded: rupeesToAdd,
            newCoinBalance: user.points,
            newWalletBalance: user.walletBalance
        });
    } catch (err) {
        console.error('Redeem error:', err);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/wallet/transactions/:userId', authenticateToken, async (req, res) => {
    try {
        const transactions = await Transaction.find({ userId: req.params.userId })
            .sort({ createdAt: -1 })
            .limit(50);
        res.json(transactions);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/wallet/subscribe', authenticateToken, async (req, res) => {
    try {
        const { userId, serviceName, amount, duration } = req.body;
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ error: 'User not found' });
        if ((user.walletBalance || 0) < amount) {
            return res.status(400).json({ error: `Insufficient wallet balance. You have ₹${user.walletBalance || 0}` });
        }

        // Deduct from wallet
        user.walletBalance -= amount;
        await user.save();

        // Calculate expiry
        const now = new Date();
        let expiresAt = new Date(now);
        if (duration === 'monthly') expiresAt.setMonth(now.getMonth() + 1);
        else if (duration === 'yearly') expiresAt.setFullYear(now.getFullYear() + 1);
        else expiresAt.setMonth(now.getMonth() + 1); // default monthly

        // Create subscription
        const subscription = new Subscription({
            userId,
            serviceName,
            serviceType: duration || 'monthly',
            amountPaid: amount,
            expiresAt,
            status: 'active'
        });
        await subscription.save();

        // Log transaction
        await new Transaction({
            userId,
            type: 'wallet_spend',
            amount,
            description: `Subscribed to ${serviceName} (${duration || 'monthly'}) for ₹${amount}`,
            status: 'success'
        }).save();

        res.json({
            success: true,
            subscription,
            newWalletBalance: user.walletBalance
        });
    } catch (err) {
        console.error('Subscribe error:', err);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/wallet/subscriptions/:userId', authenticateToken, async (req, res) => {
    try {
        const subscriptions = await Subscription.find({ userId: req.params.userId })
            .sort({ purchasedAt: -1 });
        
        // Auto-expire subscriptions
        const now = new Date();
        for (let sub of subscriptions) {
            if (sub.status === 'active' && sub.expiresAt && new Date(sub.expiresAt) < now) {
                sub.status = 'expired';
                await sub.save();
            }
        }

        res.json(subscriptions);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ========== PAYMENT ROUTES (RAZORPAY) ==========
app.post('/api/payment/razorpay/create-order', async (req, res) => {
    try {
        const { pack, userId } = req.body;
        let amount = 0;
        if (pack === '500_coins') amount = 4900; // ₹49 in paise
        else if (pack === '1000_coins') amount = 9900; // ₹99 in paise
        else return res.status(400).json({error: 'Invalid package selection'});

        const options = {
            amount,
            currency: 'INR',
            receipt: `rcpt_${uuidv4().substring(0,8)}`,
            notes: { userId, pack }
        };

        const order = await razorpay.orders.create(options);
        res.json(order);
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/payment/razorpay/verify', async (req, res) => {
    try {
       const { razorpay_order_id, razorpay_payment_id, razorpay_signature, userId, pack } = req.body;
       
       const sign = razorpay_order_id + "|" + razorpay_payment_id;
       const expectedSign = crypto
           .createHmac("sha256", "v4irVY2uokZ03BC2wl78V1vy")
           .update(sign.toString())
           .digest("hex");

       if (razorpay_signature === expectedSign) {
           const coinsToAdd = pack === '500_coins' ? 500 : 1000;
           const updatedUser = await User.findByIdAndUpdate(userId, { $inc: { points: coinsToAdd }}, { new: true });

           // Log transaction
           await new Transaction({
               userId,
               type: 'coin_purchase',
               amount: pack === '500_coins' ? 49 : 99,
               coinsInvolved: coinsToAdd,
               description: `Purchased ${coinsToAdd} coins via Razorpay`,
               razorpayPaymentId: razorpay_payment_id,
               status: 'success'
           }).save();

           return res.json({ success: true, coinsAwarded: coinsToAdd, totalPoints: updatedUser.points });
       } else {
           return res.status(400).json({ success: false, message: "Invalid Signature received" });
       }
    } catch(err) {
       res.status(500).json({ error: err.message });
    }
});

// ========== UPI QR CODE PAYMENT ==========
app.post('/api/payment/upi/verify', authenticateToken, async (req, res) => {
    try {
        const { userId, pack, upiRef } = req.body;
        if (!upiRef || upiRef.trim().length < 4) {
            return res.status(400).json({ error: 'Invalid UPI reference' });
        }

        // Check if this reference was already used
        const existing = await Transaction.findOne({ razorpayPaymentId: `UPI:${upiRef}` });
        if (existing) {
            return res.status(400).json({ error: 'This UPI reference has already been used' });
        }

        const coinsToAdd = pack === '500_coins' ? 500 : 1000;
        const amount = pack === '500_coins' ? 49 : 99;
        const updatedUser = await User.findByIdAndUpdate(userId, { $inc: { points: coinsToAdd } }, { new: true });

        // Log transaction
        await new Transaction({
            userId,
            type: 'coin_purchase',
            amount,
            coinsInvolved: coinsToAdd,
            description: `Purchased ${coinsToAdd} coins via UPI (Ref: ${upiRef})`,
            razorpayPaymentId: `UPI:${upiRef}`,
            status: 'success'
        }).save();

        res.json({ success: true, coinsAwarded: coinsToAdd, totalPoints: updatedUser.points });
    } catch (err) {
        console.error('UPI verify error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ========== TASK ROUTES ==========
app.get('/tasks/:userId', authenticateToken, async (req, res) => {
    try {
        const tasks = await Task.find({ user_id: req.params.userId });
        res.json(tasks);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/task/:id', authenticateToken, async (req, res) => {
    try {
        const task = await Task.findById(req.params.id);
        if (!task) return res.status(404).json({ error: 'Task not found' });
        res.json(task);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/tasks', authenticateToken, async (req, res) => {
    const { recurrence, completion_time } = req.body;
    
    if (recurrence && recurrence !== 'None' && completion_time) {
        const recurring_id = uuidv4();
        const baseDate = new Date(completion_time);
        let instances = [];
        
        for (let i = 0; i < 30; i++) {
            let nextDate = new Date(baseDate);
            if (recurrence === 'min') nextDate.setMinutes(baseDate.getMinutes() + i);
            else if (recurrence === 'daily') nextDate.setDate(baseDate.getDate() + i);
            else if (recurrence === 'weekly') nextDate.setDate(baseDate.getDate() + (i * 7));
            else if (recurrence === 'monthly') nextDate.setMonth(baseDate.getMonth() + i);
            else if (recurrence === 'yearly') nextDate.setFullYear(baseDate.getFullYear() + i);
            
            const offset = nextDate.getTimezoneOffset();
            const localDate = new Date(nextDate.getTime() - (offset*60*1000));
            const dateStr = localDate.toISOString().slice(0, 16);
            
            instances.push({
                ...req.body,
                recurring_id,
                completion_time: dateStr
            });
        }
        await Task.insertMany(instances);
    } else {
        await new Task(req.body).save();
    }
    res.json({ message: "Added" });
});

app.put('/tasks/:id/complete', authenticateToken, async (req, res) => {
    try {
        const task = await Task.findById(req.params.id);
        if (!task) return res.status(404).json({ error: "Task not found" });

        const wasCompleted = task.is_completed;
        task.is_completed = !wasCompleted;
        task.completed_at = task.is_completed ? new Date() : null;
        
        let pointsAwarded = 0;
        if (task.is_completed && task.completion_time && !task.penalty_applied) {
            const due = new Date(task.completion_time).getTime();
            const now = Date.now();
            if (now <= due) {
                pointsAwarded = 10;
                await User.findByIdAndUpdate(task.user_id, { $inc: { points: 10 } });
            }
        }
        
        await task.save();
        res.json({ message: "Task completion toggled", task, pointsAwarded });
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/tasks/:id', authenticateToken, async (req, res) => {
    const { series } = req.query;
    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({error: "Not found"});
    
    if (series === 'true' && task.recurring_id) {
        const updateData = { ...req.body };
        delete updateData.completion_time; 
        await Task.updateMany({ recurring_id: task.recurring_id }, updateData);
    } else {
        await Task.findByIdAndUpdate(req.params.id, req.body);
    }
    res.json({ message: "Updated" });
});

app.delete('/tasks/:id', authenticateToken, async (req, res) => {
    const { series } = req.query;
    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({error: "Not found"});
    
    if (series === 'true' && task.recurring_id) {
        await Task.deleteMany({ recurring_id: task.recurring_id });
    } else {
        await Task.findByIdAndDelete(req.params.id);
    }
    res.json({ message: "Deleted" });
});

// --- Cron Job for Task Penalty ---
setInterval(async () => {
    try {
        const now = new Date();
        const expiredTasks = await Task.find({
            is_completed: false,
            penalty_applied: false,
            completion_time: { $exists: true, $ne: '' }
        });

        for (let task of expiredTasks) {
            const due = new Date(task.completion_time);
            if (now > due) {
                task.penalty_applied = true;
                await task.save();
                await User.findByIdAndUpdate(task.user_id, { $inc: { points: -20 } });
            }
        }
    } catch (err) {
        console.error("Cron Job Error:", err);
    }
}, 60000);

// ========== SCRAPING ROUTES ==========

// --- 1. CODEFORCES CONTESTS ---
app.get('/api/scrape/codeforces', async (req, res) => {
    try {
        const cached = await getCachedData('scrape:codeforces');
        if (cached) return res.json(cached);

        const response = await fetch('https://codeforces.com/api/contest.list');
        const data = await response.json();
        if (data.status !== 'OK') return res.status(500).json({ error: 'Codeforces API error' });

        const now = Math.floor(Date.now() / 1000);
        const contests = data.result
            .filter(c => c.phase === 'BEFORE' || (c.phase === 'FINISHED' && (now - c.startTimeSeconds - c.durationSeconds) < 7 * 86400))
            .slice(0, 20)
            .map(c => ({
                id: `cf-${c.id}`, name: c.name, platform: 'Codeforces',
                url: `https://codeforces.com/contest/${c.id}`,
                startTime: new Date(c.startTimeSeconds * 1000).toISOString(),
                duration: `${Math.floor(c.durationSeconds / 3600)}h ${Math.floor((c.durationSeconds % 3600) / 60)}m`,
                durationSeconds: c.durationSeconds,
                status: c.phase === 'BEFORE' ? 'Upcoming' : 'Finished', type: c.type
            }));
        await setCachedData('scrape:codeforces', contests, 3600);
        res.json(contests);
    } catch (err) { console.error('Codeforces error:', err); res.status(500).json({ error: 'Failed to fetch Codeforces' }); }
});

// --- 2. LEETCODE CONTESTS ---
app.get('/api/scrape/leetcode', async (req, res) => {
    try {
        const cached = await getCachedData('scrape:leetcode');
        if (cached) return res.json(cached);

        const query = `{ topTwoContests { title startTime duration titleSlug } }`;
        const response = await fetch('https://leetcode.com/graphql', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Referer': 'https://leetcode.com/contest/', 'User-Agent': 'Mozilla/5.0' },
            body: JSON.stringify({ query })
        });
        const data = await response.json();
        let contests = [];
        if (data.data && data.data.topTwoContests) {
            contests = data.data.topTwoContests.map((c, i) => ({
                id: `lc-${c.titleSlug || i}`, name: c.title, platform: 'LeetCode',
                url: `https://leetcode.com/contest/${c.titleSlug}`,
                startTime: new Date(c.startTime * 1000).toISOString(),
                duration: `${Math.floor(c.duration / 3600)}h ${Math.floor((c.duration % 3600) / 60)}m`,
                durationSeconds: c.duration,
                status: (c.startTime * 1000) > Date.now() ? 'Upcoming' : 'Finished', type: 'Contest'
            }));
        }
        // Daily challenge
        try {
            const dailyQuery = `{ activeDailyCodingChallengeQuestion { date link question { title difficulty topicTags { name } } } }`;
            const dailyRes = await fetch('https://leetcode.com/graphql', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Referer': 'https://leetcode.com/', 'User-Agent': 'Mozilla/5.0' },
                body: JSON.stringify({ query: dailyQuery })
            });
            const dailyData = await dailyRes.json();
            if (dailyData.data?.activeDailyCodingChallengeQuestion) {
                const q = dailyData.data.activeDailyCodingChallengeQuestion;
                contests.push({
                    id: `lc-daily-${q.date}`, name: `Daily Challenge: ${q.question.title}`, platform: 'LeetCode',
                    url: `https://leetcode.com${q.link}`, startTime: new Date(q.date).toISOString(),
                    duration: '24h 0m', durationSeconds: 86400, status: 'Active', type: 'Daily Challenge',
                    difficulty: q.question.difficulty, tags: q.question.topicTags?.map(t => t.name) || []
                });
            }
        } catch (e) { console.log('Daily challenge fetch skipped'); }
        await setCachedData('scrape:leetcode', contests, 3600);
        res.json(contests);
    } catch (err) { console.error('LeetCode error:', err); res.status(500).json({ error: 'Failed to fetch LeetCode' }); }
});

// --- 3. CODECHEF CONTESTS ---
app.get('/api/scrape/codechef', async (req, res) => {
    try {
        const cached = await getCachedData('scrape:codechef');
        if (cached) return res.json(cached);

        const response = await fetch('https://www.codechef.com/api/list/contests/all?sort_by=START&sorting_order=asc&offset=0&mode=all', {
            headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' }
        });
        const data = await response.json();
        let contests = [];
        if (data.future_contests) {
            contests = data.future_contests.map(c => ({
                id: `cc-${c.contest_code}`, name: c.contest_name, platform: 'CodeChef',
                url: `https://www.codechef.com/${c.contest_code}`,
                startTime: new Date(c.contest_start_date_iso).toISOString(),
                duration: `${Math.floor(c.contest_duration / 60)}h ${c.contest_duration % 60}m`,
                durationSeconds: c.contest_duration * 60, status: 'Upcoming', type: 'Contest'
            }));
        }
        if (data.present_contests) {
            contests = contests.concat(data.present_contests.map(c => ({
                id: `cc-${c.contest_code}`, name: c.contest_name, platform: 'CodeChef',
                url: `https://www.codechef.com/${c.contest_code}`,
                startTime: new Date(c.contest_start_date_iso).toISOString(),
                duration: `${Math.floor(c.contest_duration / 60)}h ${c.contest_duration % 60}m`,
                durationSeconds: c.contest_duration * 60, status: 'Active', type: 'Contest'
            })));
        }
        const finalContests = contests.slice(0, 15);
        await setCachedData('scrape:codechef', finalContests, 3600);
        res.json(finalContests);
    } catch (err) { console.error('CodeChef error:', err); res.status(500).json({ error: 'Failed to fetch CodeChef' }); }
});

// --- 4. HACKATHONS ---
app.get('/api/scrape/hackathons', async (req, res) => {
    try {
        const cached = await getCachedData('scrape:hackathons');
        if (cached) return res.json(cached);

        const response = await fetch('https://api.devfolio.co/api/search/hackathons', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' },
            body: JSON.stringify({ type: 'hackathon', from: 0, size: 15, status: ['upcoming', 'open'] })
        });
        let hackathons = [];
        if (response.ok) {
            const data = await response.json();
            if (data.hits?.hits) {
                hackathons = data.hits.hits.map(h => {
                    const s = h._source;
                    return {
                        id: `hack-${s.slug || h._id}`, name: s.name || 'Hackathon', platform: 'Devfolio',
                        url: s.slug ? `https://devfolio.co/hackathons/${s.slug}` : '#',
                        startTime: s.starts_at || new Date().toISOString(),
                        duration: 'Multi-day', durationSeconds: 172800,
                        status: s.status === 'open' ? 'Active' : 'Upcoming', type: 'Hackathon'
                    };
                });
            }
        }
        if (hackathons.length === 0) {
            hackathons = [
                { id: 'hack-devpost', name: 'Browse Hackathons on Devpost', platform: 'Devpost', url: 'https://devpost.com/hackathons', startTime: new Date().toISOString(), duration: 'Various', durationSeconds: 0, status: 'Browse', type: 'Hackathon Directory' },
                { id: 'hack-mlh', name: 'Browse MLH Hackathons', platform: 'MLH', url: 'https://mlh.io/seasons/2026/events', startTime: new Date().toISOString(), duration: 'Various', durationSeconds: 0, status: 'Browse', type: 'Hackathon Directory' },
                { id: 'hack-devfolio', name: 'Browse Hackathons on Devfolio', platform: 'Devfolio', url: 'https://devfolio.co/hackathons', startTime: new Date().toISOString(), duration: 'Various', durationSeconds: 0, status: 'Browse', type: 'Hackathon Directory' },
            ];
        }
        await setCachedData('scrape:hackathons', hackathons, 3600);
        res.json(hackathons);
    } catch (err) { console.error('Hackathon error:', err); res.status(500).json({ error: 'Failed to fetch hackathons' }); }
});

// ========== EMAIL SCANNING ROUTES ==========

// Keywords to look for in emails
const EMAIL_KEYWORDS = [
    'quiz', 'hackathon', 'guest lecture', 'assignment', 'review',
    'deadline', 'event', 'workshop', 'seminar', 'webinar',
    'competition', 'exam', 'test', 'project', 'submission',
    'registration', 'contest', 'coding', 'interview', 'placement',
    'internship', 'certificate', 'meeting', 'orientation',
    'fest', 'symposium', 'conference', 'talk', 'session',
    'lab', 'practical', 'viva', 'presentation', 'due date'
];

// Date extraction helper
function extractDatesFromText(text) {
    const dates = [];
    const patterns = [
        /(\d{1,2})\s+(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{4})/gi,
        /(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})/gi,
        /(\d{4})-(\d{2})-(\d{2})/g,
        /(\d{1,2})\/(\d{1,2})\/(\d{4})/g,
    ];
    for (const pattern of patterns) {
        let match;
        while ((match = pattern.exec(text)) !== null) {
            try {
                const d = new Date(match[0]);
                if (!isNaN(d.getTime()) && d > new Date('2024-01-01')) {
                    dates.push(d);
                }
            } catch (e) {}
        }
    }
    const timePattern = /(\d{1,2}):(\d{2})\s*(AM|PM|am|pm)?/g;
    let timeMatch;
    while ((timeMatch = timePattern.exec(text)) !== null) {
        if (dates.length > 0) {
            let hours = parseInt(timeMatch[1]);
            const mins = parseInt(timeMatch[2]);
            const ampm = timeMatch[3];
            if (ampm && ampm.toLowerCase() === 'pm' && hours !== 12) hours += 12;
            if (ampm && ampm.toLowerCase() === 'am' && hours === 12) hours = 0;
            dates[0].setHours(hours, mins);
        }
    }
    return dates;
}

// Categorize email content
function categorizeEmail(subject, body) {
    const text = `${subject} ${body}`.toLowerCase();
    if (/quiz|mcq|test|exam|viva/.test(text)) return 'Quiz/Exam';
    if (/hackathon|hack|coding challenge/.test(text)) return 'Hackathon';
    if (/guest\s*lecture|talk|speaker|keynote/.test(text)) return 'Guest Lecture';
    if (/assignment|homework|submission|due|project/.test(text)) return 'Assignment';
    if (/review|feedback|grade|marks|result/.test(text)) return 'Review';
    if (/workshop|hands-on|bootcamp|training/.test(text)) return 'Workshop';
    if (/seminar|webinar|conference|symposium/.test(text)) return 'Seminar';
    if (/internship|placement|interview|job|career/.test(text)) return 'Placement';
    if (/registration|register|sign up|enroll/.test(text)) return 'Registration';
    if (/event|fest|celebration/.test(text)) return 'Event';
    if (/meeting|orientation|session/.test(text)) return 'Meeting';
    return 'General';
}

// Save / Update email config (now with encryption for app_password)
app.post('/api/email/config', authenticateToken, async (req, res) => {
    try {
        const { user_id, email, app_password, instagram_handles } = req.body;
        
        // Encrypt the app password before storing
        const encryptedPassword = encrypt(app_password);
        
        const config = await EmailConfig.findOneAndUpdate(
            { user_id },
            { 
                email, 
                app_password: encryptedPassword, 
                instagram_handles: instagram_handles || [],
                imap_host: 'imap.gmail.com', 
                imap_port: 993 
            },
            { upsert: true, new: true }
        );
        
        res.json({ message: 'Email config saved!', hasConfig: true });
    } catch (err) {
        console.error('Email config error:', err);
        res.status(500).json({ error: 'Failed to save email config' });
    }
});

// Get email config status
app.get('/api/email/config/:userId', async (req, res) => {
    try {
        const config = await EmailConfig.findOne({ user_id: req.params.userId });
        if (config) {
            res.json({ 
                hasConfig: true, 
                email: config.email,
                lastScan: config.last_scan,
                instagramHandles: config.instagram_handles || []
            });
        } else {
            res.json({ hasConfig: false });
        }
    } catch (err) {
        res.status(500).json({ error: 'Failed to get config' });
    }
});

// Scan emails via IMAP
app.get('/api/email/scan/:userId', async (req, res) => {
    try {
        const config = await EmailConfig.findOne({ user_id: req.params.userId });
        if (!config) {
            return res.status(400).json({ error: 'No email config found. Please connect your Gmail first.' });
        }

        // Decrypt the app password
        let decryptedPassword;
        try {
            decryptedPassword = decrypt(config.app_password);
        } catch (e) {
            // Fallback for legacy unencrypted passwords
            decryptedPassword = config.app_password;
        }

        const client = new ImapFlow({
            host: config.imap_host,
            port: config.imap_port,
            secure: true,
            auth: {
                user: config.email,
                pass: decryptedPassword
            },
            logger: false
        });

        await client.connect();
        
        let lock = await client.getMailboxLock('INBOX');
        let events = [];

        try {
            const since = new Date();
            since.setDate(since.getDate() - 30);
            
            const messages = await client.search({ since: since });
            const uids = messages.slice(-50);
            
            let idx = 0;
            for (const uid of uids) {
                try {
                    const message = await client.fetchOne(uid, { source: true, envelope: true });
                    const parsed = await simpleParser(message.source);
                    
                    const subject = parsed.subject || '';
                    const textBody = parsed.text || '';
                    const from = parsed.from?.text || '';
                    const date = parsed.date || new Date();
                    
                    const fullText = `${subject} ${textBody}`.toLowerCase();
                    const matchedKeywords = EMAIL_KEYWORDS.filter(kw => fullText.includes(kw));
                    
                    if (matchedKeywords.length > 0) {
                        const extractedDates = extractDatesFromText(`${subject} ${textBody}`);
                        const eventDate = extractedDates.length > 0 ? extractedDates[0] : date;
                        const category = categorizeEmail(subject, textBody);
                        const snippet = textBody.substring(0, 200).replace(/\n/g, ' ').trim();
                        
                        events.push({
                            id: `email-${uid}-${idx}`,
                            name: subject || 'Untitled Email',
                            platform: 'Email',
                            url: `mailto:${from}`,
                            startTime: eventDate.toISOString(),
                            duration: 'From email',
                            durationSeconds: 0,
                            status: eventDate > new Date() ? 'Upcoming' : 'Active',
                            type: category,
                            from: from,
                            snippet: snippet,
                            keywords: matchedKeywords.slice(0, 5),
                            emailDate: date.toISOString()
                        });
                        idx++;
                    }
                } catch (msgErr) {
                    continue;
                }
            }
        } finally {
            lock.release();
        }

        await client.logout();

        await EmailConfig.findOneAndUpdate(
            { user_id: req.params.userId },
            { last_scan: new Date() }
        );

        events.sort((a, b) => (b.keywords?.length || 0) - (a.keywords?.length || 0));

        res.json(events);
    } catch (err) {
        console.error('Email scan error:', err);
        
        if (err.authenticationFailed) {
            return res.status(401).json({ error: 'Authentication failed. Please check your Gmail App Password. Make sure IMAP is enabled in Gmail settings.' });
        }
        if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
            return res.status(500).json({ error: 'Could not connect to Gmail. Check your internet connection.' });
        }
        
        res.status(500).json({ error: `Email scan failed: ${err.message}` });
    }
});

// ========== INSTAGRAM SCRAPING ==========

app.get('/api/scrape/instagram/:username', async (req, res) => {
    try {
        const username = req.params.username.replace('@', '');
        
        const response = await fetch(`https://www.instagram.com/${username}/`, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml',
                'Accept-Language': 'en-US,en;q=0.9',
            }
        });

        if (!response.ok) {
            throw new Error(`Instagram returned ${response.status}`);
        }

        const html = await response.text();
        const $ = cheerio.load(html);

        const title = $('meta[property="og:title"]').attr('content') || '';
        const description = $('meta[property="og:description"]').attr('content') || '';
        const profileImage = $('meta[property="og:image"]').attr('content') || '';

        const bioText = description || '';
        
        let events = [];
        
        events.push({
            id: `ig-profile-${username}`,
            name: title || `@${username}`,
            platform: 'Instagram',
            url: `https://www.instagram.com/${username}/`,
            startTime: new Date().toISOString(),
            duration: 'Profile',
            durationSeconds: 0,
            status: 'Browse',
            type: 'Instagram Profile',
            snippet: bioText.substring(0, 200),
            profileImage: profileImage
        });

        const keywords = ['hackathon', 'workshop', 'event', 'registration', 'quiz', 'contest', 'webinar', 'lecture', 'fest'];
        const matchedKeywords = keywords.filter(kw => bioText.toLowerCase().includes(kw));
        
        if (matchedKeywords.length > 0) {
            events.push({
                id: `ig-event-${username}`,
                name: `📢 Check @${username} for: ${matchedKeywords.join(', ')}`,
                platform: 'Instagram',
                url: `https://www.instagram.com/${username}/`,
                startTime: new Date().toISOString(),
                duration: 'Check profile',
                durationSeconds: 0,
                status: 'Active',
                type: 'Social Media Alert',
                keywords: matchedKeywords
            });
        }

        res.json(events);
    } catch (err) {
        console.error('Instagram scrape error for', req.params.username, ':', err.message);
        
        const username = req.params.username.replace('@', '');
        res.json([{
            id: `ig-browse-${username}`,
            name: `Browse @${username} on Instagram`,
            platform: 'Instagram',
            url: `https://www.instagram.com/${username}/`,
            startTime: new Date().toISOString(),
            duration: 'Visit Profile',
            durationSeconds: 0,
            status: 'Browse',
            type: 'Instagram Profile'
        }]);
    }
});

// Scrape multiple Instagram handles (for a user)
app.get('/api/scrape/instagram-all/:userId', async (req, res) => {
    try {
        const config = await EmailConfig.findOne({ user_id: req.params.userId });
        const handles = config?.instagram_handles || [];
        
        if (handles.length === 0) {
            return res.json([{
                id: 'ig-setup',
                name: 'Add Instagram handles in Settings to monitor club pages',
                platform: 'Instagram',
                url: '#',
                startTime: new Date().toISOString(),
                duration: 'Setup Required',
                durationSeconds: 0,
                status: 'Browse',
                type: 'Setup'
            }]);
        }

        let allEvents = [];
        for (const handle of handles.slice(0, 10)) {
            try {
                const r = await fetch(`http://localhost:5000/api/scrape/instagram/${handle}`);
                const events = await r.json();
                allEvents = allEvents.concat(events);
            } catch (e) {
                allEvents.push({
                    id: `ig-err-${handle}`,
                    name: `Browse @${handle} on Instagram`,
                    platform: 'Instagram',
                    url: `https://www.instagram.com/${handle}/`,
                    startTime: new Date().toISOString(),
                    duration: 'Visit Profile',
                    durationSeconds: 0,
                    status: 'Browse',
                    type: 'Instagram Profile'
                });
            }
        }
        
        res.json(allEvents);
    } catch (err) {
        console.error('Instagram all error:', err);
        res.status(500).json({ error: 'Failed to fetch Instagram data' });
    }
});

// --- ALL CONTESTS (Aggregated) ---
app.get('/api/scrape/all', async (req, res) => {
    try {
        const userId = req.query.userId;
        
        const fetches = [
            fetch('http://localhost:5000/api/scrape/codeforces').then(r => r.json()),
            fetch('http://localhost:5000/api/scrape/leetcode').then(r => r.json()),
            fetch('http://localhost:5000/api/scrape/codechef').then(r => r.json()),
            fetch('http://localhost:5000/api/scrape/hackathons').then(r => r.json()),
        ];
        
        if (userId) {
            fetches.push(
                fetch(`http://localhost:5000/api/email/scan/${userId}`).then(r => r.json()).catch(() => [])
            );
            fetches.push(
                fetch(`http://localhost:5000/api/scrape/instagram-all/${userId}`).then(r => r.json()).catch(() => [])
            );
        }
        
        const results = await Promise.allSettled(fetches);

        let all = [];
        results.forEach(r => {
            if (r.status === 'fulfilled' && Array.isArray(r.value)) {
                all = all.concat(r.value);
            }
        });

        all.sort((a, b) => {
            const statusOrder = { 'Upcoming': 0, 'Active': 1, 'Browse': 2, 'Finished': 3 };
            const statusDiff = (statusOrder[a.status] || 3) - (statusOrder[b.status] || 3);
            if (statusDiff !== 0) return statusDiff;
            return new Date(a.startTime) - new Date(b.startTime);
        });

        res.json(all);
    } catch (err) {
        console.error('Aggregate error:', err);
        res.status(500).json({ error: 'Failed to aggregate' });
    }
});

// --- IMPORT CONTEST AS TASK ---
app.post('/api/import-task', authenticateToken, async (req, res) => {
    try {
        const { user_id, name, startTime, platform, url } = req.body;
        const newTask = new Task({
            user_id,
            task_name: `[${platform}] ${name}`,
            completion_time: startTime,
            priority: 'Auto',
            source: platform.toLowerCase(),
            source_url: url
        });
        await newTask.save();
        res.json({ message: "Contest imported as task!", task: newTask });
    } catch (err) {
        console.error('Import error:', err);
        res.status(500).json({ error: 'Failed to import contest' });
    }
});
