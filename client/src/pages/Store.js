import React, { useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';

// Configurable UPI merchant details
const UPI_ID = 'todoappstore@ybl';
const UPI_NAME = 'TodoApp Gamification Store';

export default function Store({ user, setUser }) {
    const navigate = useNavigate();
    const [statusMsg, setStatusMsg] = useState(null); // { type: 'success'|'failed'|'cancelled', text: '' }
    const [showQR, setShowQR] = useState(null); // null or pack object
    const [upiRef, setUpiRef] = useState('');
    const [upiLoading, setUpiLoading] = useState(false);

    const PACKS = [
        { id: '500_coins', coins: 500, price: 49, label: 'Starter Pack', icon: '🪙' },
        { id: '1000_coins', coins: 1000, price: 99, originalPrice: 129, label: 'Pro Pack', icon: '🌟', popular: true },
    ];

    const generateUPILink = (pack) => {
        return `upi://pay?pa=${UPI_ID}&pn=${encodeURIComponent(UPI_NAME)}&am=${pack.price}&cu=INR&tn=${encodeURIComponent(`TodoApp ${pack.coins} Coins Purchase`)}`;
    };

    // --- Razorpay Payment ---
    const loadRazorpayScript = () => {
        return new Promise((resolve) => {
            const script = document.createElement('script');
            script.src = 'https://checkout.razorpay.com/v1/checkout.js';
            script.onload = () => resolve(true);
            script.onerror = () => resolve(false);
            document.body.appendChild(script);
        });
    };

    const handleBuyRazorpay = async (pack) => {
        const resScript = await loadRazorpayScript();
        if (!resScript) {
            alert('Razorpay SDK failed to load. Are you online?');
            return;
        }

        try {
            const resOrder = await axios.post('http://localhost:5000/api/payment/razorpay/create-order', {
                pack: pack.id,
                userId: user.id
            });
            const orderInfo = resOrder.data;

            const options = {
                key: 'rzp_test_SdnwDgxUhr6hKi',
                amount: orderInfo.amount,
                currency: 'INR',
                name: 'Gamification Store',
                description: pack.label + ' - ' + pack.coins + ' Coins',
                image: 'https://cdn-icons-png.flaticon.com/512/564/564619.png',
                order_id: orderInfo.id,
                handler: async function (response) {
                    try {
                        const verifyRes = await axios.post('http://localhost:5000/api/payment/razorpay/verify', {
                            razorpay_payment_id: response.razorpay_payment_id,
                            razorpay_order_id: response.razorpay_order_id,
                            razorpay_signature: response.razorpay_signature,
                            pack: pack.id,
                            userId: user.id
                        });

                        if (verifyRes.data.success) {
                            setStatusMsg({ type: 'success', text: `🎉 Payment Verified! +${verifyRes.data.coinsAwarded} Coins awarded.` });
                            if (setUser) setUser(prev => ({ ...prev, points: verifyRes.data.totalPoints }));
                        } else {
                            setStatusMsg({ type: 'failed', text: '⚠️ Payment verification failed (Signature Error).' });
                        }
                    } catch (err) {
                        setStatusMsg({ type: 'failed', text: '⚠️ Payment verification failed.' });
                    }
                },
                prefill: { name: user.username, email: user.email },
                theme: { color: '#6c5ce7' }
            };

            const paymentObject = new window.Razorpay(options);
            paymentObject.on('payment.failed', function () {
                setStatusMsg({ type: 'cancelled', text: '❌ Checkout was cancelled or failed.' });
            });
            paymentObject.open();
        } catch (err) {
            console.error(err);
            alert('Failed to initialize payment. Check console.');
        }
    };

    // --- UPI QR Code Payment ---
    const handleShowQR = (pack) => {
        setShowQR(pack);
        setStatusMsg(null);
        setUpiRef('');
    };

    const handleUpiConfirm = async () => {
        if (!upiRef.trim() || upiRef.trim().length < 4) {
            setStatusMsg({ type: 'failed', text: 'Please enter a valid UPI Transaction Reference ID (min 4 characters)' });
            return;
        }
        setUpiLoading(true);
        setStatusMsg(null);

        try {
            const res = await axios.post('http://localhost:5000/api/payment/upi/verify', {
                userId: user.id,
                pack: showQR.id,
                upiRef: upiRef.trim()
            });

            if (res.data.success) {
                setStatusMsg({ type: 'success', text: `🎉 UPI Payment Verified! +${res.data.coinsAwarded} Coins awarded.` });
                if (setUser) setUser(prev => ({ ...prev, points: res.data.totalPoints }));
                setShowQR(null);
                setUpiRef('');
            } else {
                setStatusMsg({ type: 'failed', text: '⚠️ UPI Payment verification failed.' });
            }
        } catch (err) {
            const msg = err.response?.data?.error || 'UPI verification failed';
            setStatusMsg({ type: 'failed', text: `❌ ${msg}` });
        }
        setUpiLoading(false);
    };

    return (
        <div className="page-center">
            <div className="card" style={{ width: '680px', background: 'rgba(25, 25, 45, 0.95)', border: '1px solid rgba(108, 92, 231, 0.4)', borderRadius: '20px', textAlign: 'center' }}>
                <h2 style={{ color: 'white', marginBottom: '5px' }}><span style={{ fontSize: '1.5rem' }}>🛒</span> Gamification Store</h2>
                <p style={{ color: 'rgba(255,255,255,0.6)', marginBottom: '25px', fontSize: '0.9rem' }}>Boost your coins instantly. Pay via Razorpay or scan UPI QR code.</p>

                {/* Status Messages */}
                {statusMsg && (
                    <div style={{
                        background: statusMsg.type === 'success' ? 'rgba(46, 204, 113, 0.2)' : 'rgba(231, 76, 60, 0.2)',
                        color: statusMsg.type === 'success' ? '#2ecc71' : '#e74c3c',
                        padding: '14px', borderRadius: '12px', marginBottom: '20px', fontWeight: '600', fontSize: '0.9rem'
                    }}>
                        {statusMsg.text}
                    </div>
                )}

                {/* QR Code Payment Modal */}
                {showQR && (
                    <div style={{
                        background: 'rgba(255,255,255,0.05)',
                        border: '1px solid rgba(108, 92, 231, 0.5)',
                        borderRadius: '16px',
                        padding: '25px',
                        marginBottom: '25px',
                        animation: 'fadeIn 0.3s ease'
                    }}>
                        <h3 style={{ color: 'white', marginBottom: '5px' }}>📱 Scan QR to Pay ₹{showQR.price}</h3>
                        <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem', marginBottom: '20px' }}>
                            {showQR.label} — {showQR.coins} Coins
                        </p>

                        <div style={{
                            display: 'inline-block',
                            background: 'white',
                            padding: '16px',
                            borderRadius: '16px',
                            marginBottom: '15px'
                        }}>
                            <QRCodeSVG
                                value={generateUPILink(showQR)}
                                size={200}
                                level="H"
                                includeMargin={false}
                                bgColor="#FFFFFF"
                                fgColor="#1a1a2e"
                            />
                        </div>

                        <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem', marginBottom: '15px' }}>
                            Scan with Google Pay, PhonePe, Paytm, or any UPI app
                        </p>

                        <div style={{ maxWidth: '350px', margin: '0 auto' }}>
                            <label style={{ display: 'block', color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem', textAlign: 'left', marginBottom: '5px' }}>
                                After payment, enter your UPI Transaction Reference ID:
                            </label>
                            <input
                                type="text"
                                placeholder="e.g. 412345678901"
                                value={upiRef}
                                onChange={(e) => setUpiRef(e.target.value)}
                                style={{
                                    width: '100%', padding: '12px', background: 'rgba(255,255,255,0.08)',
                                    border: '1px solid rgba(255,255,255,0.15)', color: 'white', borderRadius: '10px',
                                    fontSize: '1rem', fontFamily: 'monospace', boxSizing: 'border-box', marginBottom: '10px'
                                }}
                            />
                            <div style={{ display: 'flex', gap: '10px' }}>
                                <button
                                    className="btn-primary"
                                    style={{ flex: 1, padding: '12px', fontSize: '0.9rem' }}
                                    onClick={handleUpiConfirm}
                                    disabled={upiLoading || upiRef.trim().length < 4}
                                >
                                    {upiLoading ? '⏳ Verifying...' : '✅ Verify Payment'}
                                </button>
                                <button
                                    className="btn-refresh"
                                    style={{ padding: '12px 20px', background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '10px' }}
                                    onClick={() => { setShowQR(null); setUpiRef(''); }}
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Coin Packs */}
                <div style={{ display: 'flex', gap: '20px', justifyContent: 'center' }}>
                    {PACKS.map(pack => (
                        <div key={pack.id} style={{
                            background: pack.popular
                                ? 'linear-gradient(135deg, rgba(108, 92, 231, 0.2), rgba(253, 121, 168, 0.2))'
                                : 'rgba(255,255,255,0.05)',
                            padding: '25px 20px',
                            borderRadius: '16px',
                            flex: 1,
                            border: pack.popular ? '1px solid rgba(108, 92, 231, 0.5)' : '1px solid rgba(255,255,255,0.1)',
                            position: 'relative'
                        }}>
                            {pack.popular && (
                                <div style={{
                                    position: 'absolute', top: '-10px', right: '15px',
                                    background: 'linear-gradient(45deg, #6c5ce7, #fd79a8)',
                                    color: 'white', padding: '3px 12px', borderRadius: '20px', fontSize: '0.7rem', fontWeight: 'bold'
                                }}>
                                    POPULAR
                                </div>
                            )}
                            <h3 style={{ color: 'white', marginBottom: '10px' }}>{pack.icon} {pack.label}</h3>
                            <div style={{ fontSize: '2.2rem', color: '#f39c12', fontWeight: 'bold', marginBottom: '5px' }}>{pack.coins}</div>
                            <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.85rem', marginBottom: '15px' }}>Coins</div>
                            <div style={{ fontSize: '1.3rem', color: 'white', marginBottom: '20px' }}>
                                ₹{pack.price}
                                {pack.originalPrice && (
                                    <span style={{ fontSize: '0.8rem', opacity: 0.5, textDecoration: 'line-through', marginLeft: '8px' }}>
                                        ₹{pack.originalPrice}
                                    </span>
                                )}
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <button
                                    className="btn-primary"
                                    style={{ width: '100%', padding: '11px', fontSize: '0.85rem' }}
                                    onClick={() => handleBuyRazorpay(pack)}
                                >
                                    💳 Pay with Razorpay
                                </button>
                                <button
                                    className="btn-primary"
                                    style={{
                                        width: '100%', padding: '11px', fontSize: '0.85rem',
                                        background: showQR?.id === pack.id
                                            ? 'linear-gradient(45deg, #2ecc71, #27ae60)'
                                            : 'linear-gradient(45deg, #00b894, #00cec9)'
                                    }}
                                    onClick={() => handleShowQR(pack)}
                                >
                                    📱 Pay via UPI QR
                                </button>
                            </div>
                        </div>
                    ))}
                </div>

                <div style={{ display: 'flex', gap: '10px', marginTop: '25px' }}>
                    <button className="btn-refresh" style={{ flex: 1, borderRadius: '12px', padding: '12px', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)' }} onClick={() => navigate('/wallet')}>
                        💎 Go to Wallet
                    </button>
                    <button className="btn-refresh" style={{ flex: 1, borderRadius: '12px', padding: '12px', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)' }} onClick={() => navigate('/dashboard')}>
                        ← Dashboard
                    </button>
                </div>
            </div>
        </div>
    );
}
