import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

const SUBSCRIPTION_CATALOG = [
    { id: 'leetcode', name: 'LeetCode Premium', icon: '🧩', price: 499, duration: 'monthly', description: 'Unlock all problems, solutions & company tags', color: '#FFA116', gradient: 'linear-gradient(135deg, #FFA116, #FF6B00)' },
    { id: 'github_copilot', name: 'GitHub Copilot', icon: '🤖', price: 799, duration: 'monthly', description: 'AI-powered code completion for your IDE', color: '#238636', gradient: 'linear-gradient(135deg, #238636, #2EA043)' },
    { id: 'coursera', name: 'Coursera Plus', icon: '🎓', price: 399, duration: 'monthly', description: 'Unlimited access to 7,000+ courses', color: '#0056D2', gradient: 'linear-gradient(135deg, #0056D2, #00A3E0)' },
    { id: 'notion', name: 'Notion Pro', icon: '📝', price: 199, duration: 'monthly', description: 'Advanced blocks, unlimited uploads & API', color: '#000000', gradient: 'linear-gradient(135deg, #2D2D2D, #505050)' },
    { id: 'figma', name: 'Figma Professional', icon: '🎨', price: 599, duration: 'monthly', description: 'Unlimited projects & advanced prototyping', color: '#A259FF', gradient: 'linear-gradient(135deg, #A259FF, #F24E1E)' },
    { id: 'chatgpt', name: 'ChatGPT Plus', icon: '💬', price: 1650, duration: 'monthly', description: 'GPT-4, plugins, & priority access', color: '#10A37F', gradient: 'linear-gradient(135deg, #10A37F, #1A7F64)' },
];

export default function Wallet({ user, setUser }) {
    const navigate = useNavigate();
    const [walletData, setWalletData] = useState({ coins: 0, walletBalance: 0, redeemableAmount: 0 });
    const [transactions, setTransactions] = useState([]);
    const [subscriptions, setSubscriptions] = useState([]);
    const [redeemAmount, setRedeemAmount] = useState(500);
    const [activeTab, setActiveTab] = useState('wallet'); // 'wallet', 'marketplace', 'transactions', 'subscriptions'
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState({ text: '', type: '' });

    const fetchWalletData = useCallback(async () => {
        try {
            const [balRes, txRes, subRes] = await Promise.all([
                axios.get(`${process.env.REACT_APP_API_URL || "http://localhost:5000"}/api/wallet/balance/${user.id}`),
                axios.get(`${process.env.REACT_APP_API_URL || "http://localhost:5000"}/api/wallet/transactions/${user.id}`),
                axios.get(`${process.env.REACT_APP_API_URL || "http://localhost:5000"}/api/wallet/subscriptions/${user.id}`)
            ]);
            setWalletData(balRes.data);
            setTransactions(txRes.data);
            setSubscriptions(subRes.data);
        } catch (err) {
            console.error('Wallet fetch error:', err);
        }
    }, [user.id]);

    useEffect(() => { fetchWalletData(); }, [fetchWalletData]);

    const handleRedeem = async () => {
        if (redeemAmount < 500 || redeemAmount % 500 !== 0) {
            setMessage({ text: 'Amount must be multiples of 500 (min 500)', type: 'error' });
            return;
        }
        if (walletData.coins < redeemAmount) {
            setMessage({ text: 'Insufficient coins!', type: 'error' });
            return;
        }

        setLoading(true);
        try {
            const res = await axios.post(`${process.env.REACT_APP_API_URL || "http://localhost:5000"}/api/wallet/redeem`, {
                userId: user.id,
                coinAmount: redeemAmount
            });
            if (res.data.success) {
                setMessage({ text: `✅ Redeemed ${res.data.coinsDeducted} coins → ₹${res.data.rupeesAdded} added to wallet!`, type: 'success' });
                if (setUser) setUser(prev => ({ ...prev, points: res.data.newCoinBalance, walletBalance: res.data.newWalletBalance }));
                fetchWalletData();
            }
        } catch (err) {
            setMessage({ text: err.response?.data?.error || 'Redemption failed', type: 'error' });
        }
        setLoading(false);
    };

    const handleSubscribe = async (service) => {
        if (walletData.walletBalance < service.price) {
            setMessage({ text: `Insufficient wallet balance. Need ₹${service.price}, have ₹${walletData.walletBalance}`, type: 'error' });
            return;
        }

        const confirm = window.confirm(`Subscribe to ${service.name} for ₹${service.price}/month?\nThis will deduct ₹${service.price} from your wallet.`);
        if (!confirm) return;

        setLoading(true);
        try {
            const res = await axios.post(`${process.env.REACT_APP_API_URL || "http://localhost:5000"}/api/wallet/subscribe`, {
                userId: user.id,
                serviceName: service.name,
                amount: service.price,
                duration: service.duration
            });
            if (res.data.success) {
                setMessage({ text: `🎉 Subscribed to ${service.name} successfully!`, type: 'success' });
                if (setUser) setUser(prev => ({ ...prev, walletBalance: res.data.newWalletBalance }));
                fetchWalletData();
            }
        } catch (err) {
            setMessage({ text: err.response?.data?.error || 'Subscription failed', type: 'error' });
        }
        setLoading(false);
    };

    const rupeesPreview = (redeemAmount / 500) * 50;

    const isActiveSubscription = (serviceName) => {
        return subscriptions.some(s => s.serviceName === serviceName && s.status === 'active');
    };

    return (
        <div className="wallet-page">
            {/* Background Orbs */}
            <div className="bg-orb orb-1"></div>
            <div className="bg-orb orb-2"></div>
            <div className="bg-orb orb-3"></div>

            {/* Header */}
            <div className="wallet-header">
                <div className="wallet-header-left">
                    <button className="back-btn" onClick={() => navigate('/dashboard')}>← Back</button>
                    <div>
                        <h1 className="wallet-title">💎 Wallet & Marketplace</h1>
                        <p className="wallet-subtitle">Redeem coins, manage subscriptions</p>
                    </div>
                </div>
                <button className="wallet-store-btn" onClick={() => navigate('/store')}>🛒 Buy Coins</button>
            </div>

            {/* Status Message */}
            {message.text && (
                <div className={`wallet-message ${message.type}`} onClick={() => setMessage({ text: '', type: '' })}>
                    {message.text}
                </div>
            )}

            {/* Balance Cards */}
            <div className="wallet-balance-row">
                <div className="balance-card coin-card">
                    <div className="balance-icon">🪙</div>
                    <div className="balance-info">
                        <div className="balance-label">Coin Balance</div>
                        <div className="balance-value">{walletData.coins.toLocaleString()}</div>
                        <div className="balance-sub">Complete tasks to earn more</div>
                    </div>
                </div>
                <div className="balance-card wallet-card-main">
                    <div className="balance-icon">💰</div>
                    <div className="balance-info">
                        <div className="balance-label">Wallet Balance</div>
                        <div className="balance-value">₹{walletData.walletBalance.toLocaleString()}</div>
                        <div className="balance-sub">Available for subscriptions</div>
                    </div>
                </div>
                <div className="balance-card redeem-card">
                    <div className="balance-icon">💱</div>
                    <div className="balance-info">
                        <div className="balance-label">Redeemable</div>
                        <div className="balance-value">₹{walletData.redeemableAmount}</div>
                        <div className="balance-sub">500 coins = ₹50</div>
                    </div>
                </div>
            </div>

            {/* Tabs */}
            <div className="wallet-tabs">
                {['wallet', 'marketplace', 'transactions', 'subscriptions'].map(tab => (
                    <button
                        key={tab}
                        className={`wallet-tab ${activeTab === tab ? 'active' : ''}`}
                        onClick={() => setActiveTab(tab)}
                    >
                        {tab === 'wallet' && '💱 Redeem'}
                        {tab === 'marketplace' && '🏪 Marketplace'}
                        {tab === 'transactions' && '📋 History'}
                        {tab === 'subscriptions' && '📦 My Subs'}
                    </button>
                ))}
            </div>

            {/* TAB CONTENT */}
            <div className="wallet-content">
                {/* REDEEM TAB */}
                {activeTab === 'wallet' && (
                    <div className="redeem-section">
                        <div className="redeem-card-inner">
                            <h2>🔄 Coin Redemption</h2>
                            <p className="redeem-desc">Convert your earned coins into wallet money. Minimum 500 coins per transaction.</p>

                            <div className="redeem-converter">
                                <div className="converter-input-group">
                                    <label>Coins to Redeem</label>
                                    <div className="converter-input-row">
                                        <button className="converter-btn" onClick={() => setRedeemAmount(Math.max(500, redeemAmount - 500))}>−</button>
                                        <input
                                            type="number"
                                            className="converter-input"
                                            value={redeemAmount}
                                            onChange={(e) => setRedeemAmount(Math.max(500, Math.floor(parseInt(e.target.value) || 500)))}
                                            step={500}
                                            min={500}
                                        />
                                        <button className="converter-btn" onClick={() => setRedeemAmount(redeemAmount + 500)}>+</button>
                                    </div>
                                </div>

                                <div className="converter-arrow">→</div>

                                <div className="converter-output">
                                    <label>You'll Receive</label>
                                    <div className="converter-rupee">₹{rupeesPreview}</div>
                                </div>
                            </div>

                            {/* Quick select */}
                            <div className="redeem-quick-select">
                                {[500, 1000, 2000, 5000].map(val => (
                                    <button
                                        key={val}
                                        className={`quick-btn ${redeemAmount === val ? 'active' : ''}`}
                                        onClick={() => setRedeemAmount(val)}
                                        disabled={walletData.coins < val}
                                    >
                                        {val} 🪙 → ₹{(val / 500) * 50}
                                    </button>
                                ))}
                            </div>

                            <button
                                className="redeem-submit-btn"
                                onClick={handleRedeem}
                                disabled={loading || walletData.coins < redeemAmount}
                            >
                                {loading ? 'Processing...' : `Redeem ${redeemAmount} Coins → ₹${rupeesPreview}`}
                            </button>

                            {walletData.coins < 500 && (
                                <div className="redeem-hint">
                                    ⚠️ You need at least 500 coins to redeem. Complete tasks or buy coins from the store!
                                </div>
                            )}
                        </div>

                        <div className="exchange-rate-card">
                            <h3>💡 Exchange Rates</h3>
                            <div className="rate-table">
                                <div className="rate-row"><span>500 coins</span><span>→</span><span>₹50</span></div>
                                <div className="rate-row"><span>1,000 coins</span><span>→</span><span>₹100</span></div>
                                <div className="rate-row"><span>2,500 coins</span><span>→</span><span>₹250</span></div>
                                <div className="rate-row"><span>5,000 coins</span><span>→</span><span>₹500</span></div>
                                <div className="rate-row"><span>10,000 coins</span><span>→</span><span>₹1,000</span></div>
                            </div>
                        </div>
                    </div>
                )}

                {/* MARKETPLACE TAB */}
                {activeTab === 'marketplace' && (
                    <div className="marketplace-section">
                        <h2 className="marketplace-title">🏪 Subscription Marketplace</h2>
                        <p className="marketplace-desc">Use your wallet balance to subscribe to premium developer tools and services.</p>
                        <div className="marketplace-grid">
                            {SUBSCRIPTION_CATALOG.map(service => (
                                <div key={service.id} className="service-card" style={{ '--card-accent': service.color }}>
                                    <div className="service-strip" style={{ background: service.gradient }}>
                                        <span className="service-icon">{service.icon}</span>
                                        <span className="service-name">{service.name}</span>
                                        {isActiveSubscription(service.name) && <span className="service-active-badge">ACTIVE</span>}
                                    </div>
                                    <div className="service-body">
                                        <p className="service-desc">{service.description}</p>
                                        <div className="service-price-row">
                                            <span className="service-price">₹{service.price}</span>
                                            <span className="service-period">/{service.duration}</span>
                                        </div>
                                        <button
                                            className={`service-buy-btn ${isActiveSubscription(service.name) ? 'subscribed' : ''}`}
                                            onClick={() => handleSubscribe(service)}
                                            disabled={loading || isActiveSubscription(service.name) || walletData.walletBalance < service.price}
                                        >
                                            {isActiveSubscription(service.name) ? '✅ Subscribed' :
                                             walletData.walletBalance < service.price ? `Need ₹${service.price - walletData.walletBalance} more` :
                                             'Subscribe Now'}
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* TRANSACTIONS TAB */}
                {activeTab === 'transactions' && (
                    <div className="transactions-section">
                        <h2>📋 Transaction History</h2>
                        {transactions.length === 0 ? (
                            <div className="empty-state">
                                <div className="empty-icon">💸</div>
                                <h3>No transactions yet</h3>
                                <p>Your transaction history will appear here</p>
                            </div>
                        ) : (
                            <div className="transaction-list">
                                {transactions.map((tx, i) => (
                                    <div key={tx._id || i} className={`transaction-item ${tx.type}`}>
                                        <div className="tx-icon">
                                            {tx.type === 'coin_purchase' && '🛒'}
                                            {tx.type === 'coin_redeem' && '💱'}
                                            {tx.type === 'wallet_spend' && '💳'}
                                        </div>
                                        <div className="tx-info">
                                            <div className="tx-desc">{tx.description}</div>
                                            <div className="tx-date">{new Date(tx.createdAt).toLocaleString()}</div>
                                        </div>
                                        <div className="tx-amount-col">
                                            <div className={`tx-amount ${tx.type === 'coin_redeem' ? 'positive' : tx.type === 'wallet_spend' ? 'negative' : 'positive'}`}>
                                                {tx.type === 'coin_purchase' ? `+${tx.coinsInvolved} 🪙` :
                                                 tx.type === 'coin_redeem' ? `+₹${tx.amount}` :
                                                 `-₹${tx.amount}`}
                                            </div>
                                            <div className={`tx-status ${tx.status}`}>{tx.status}</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* SUBSCRIPTIONS TAB */}
                {activeTab === 'subscriptions' && (
                    <div className="subscriptions-section">
                        <h2>📦 My Subscriptions</h2>
                        {subscriptions.length === 0 ? (
                            <div className="empty-state">
                                <div className="empty-icon">📭</div>
                                <h3>No subscriptions yet</h3>
                                <p>Visit the marketplace to subscribe to premium tools</p>
                                <button className="empty-action-btn" onClick={() => setActiveTab('marketplace')}>Browse Marketplace</button>
                            </div>
                        ) : (
                            <div className="subscription-list">
                                {subscriptions.map((sub, i) => (
                                    <div key={sub._id || i} className={`subscription-item ${sub.status}`}>
                                        <div className="sub-info">
                                            <h3>{sub.serviceName}</h3>
                                            <div className="sub-meta">
                                                <span className={`sub-status-badge ${sub.status}`}>{sub.status.toUpperCase()}</span>
                                                <span>₹{sub.amountPaid}/{sub.serviceType}</span>
                                            </div>
                                            <div className="sub-dates">
                                                <span>Purchased: {new Date(sub.purchasedAt).toLocaleDateString()}</span>
                                                {sub.expiresAt && <span>Expires: {new Date(sub.expiresAt).toLocaleDateString()}</span>}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
