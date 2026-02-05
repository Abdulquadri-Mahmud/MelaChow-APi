# Frontend Implementation: Unified Order Creation with Wallet Payment

## Overview
The backend now supports a **unified order creation endpoint** that handles both **Wallet** and **Paystack** payments seamlessly through a single API call.

## Endpoint Details

### **POST** `/api/orders/v2/create`

This endpoint replaces the old two-step flow (create → initialize payment) with a single unified call.

---

## Payment Flows

### 1️⃣ **Wallet Payment** (Instant Fulfillment)
When the user selects "Pay with Wallet":

**Request:**
```json
POST /api/orders/v2/create
{
  "items": [...],
  "deliveryAddress": {...},
  "vendorDeliveryFees": [...],
  "phone": "0801234567",
  "useWallet": true,        // ← KEY FLAG
  "discountCode": "SAVE20"  // ← Optional
}
```

**Response (Success):**
```json
{
  "success": true,
  "message": "Order created and paid successfully",
  "order": {
    "orderId": "ORD-ABC123",
    "paymentStatus": "paid",
    "paymentReference": "WALLET_ORD-ABC123",
    "total": 5000,
    ...
  }
}
```

**What Happens:**
- ✅ Wallet balance is checked
- ✅ Funds are deducted immediately
- ✅ Order is created and **fulfilled instantly**
- ✅ Vendors are notified
- ✅ User sees "Order Successful" immediately (NO redirect)

**Error Handling:**
```json
{
  "success": false,
  "message": "Insufficient wallet balance (₦3000) for total ₦5000"
}
```

---

### 2️⃣ **Paystack Payment** (Card/Bank Transfer)
When the user selects "Pay with Card" or doesn't select wallet:

**Request:**
```json
POST /api/orders/v2/create
{
  "items": [...],
  "deliveryAddress": {...},
  "vendorDeliveryFees": [...],
  "phone": "0801234567",
  "useWallet": false,       // ← or omit entirely
  "discountCode": "SAVE20"  // ← Optional
}
```

**Response (Success):**
```json
{
  "success": true,
  "message": "Order created successfully. Proceed to payment.",
  "authorization_url": "https://checkout.paystack.com/abc123",
  "reference": "PSK_ORD-ABC123_1738742400000",
  "order": {
    "orderId": "ORD-ABC123",
    "paymentStatus": "pending",
    "total": 5000,
    ...
  }
}
```

**What Happens:**
- ✅ Order is created with `pending` status
- ✅ Paystack payment is initialized
- ✅ User is redirected to `authorization_url`
- ✅ After payment, Paystack redirects to your callback URL
- ✅ Frontend calls `/api/orders/v2/verify/:reference` to confirm

---

## Implementation Tasks

### **A. Checkout Page Updates**

1. **Add Payment Method Selection**
   ```jsx
   const [paymentMethod, setPaymentMethod] = useState('paystack'); // or 'wallet'
   const [walletBalance, setWalletBalance] = useState(0);
   
   // Fetch wallet balance on mount
   useEffect(() => {
     fetch('/api/user/my-wallet', { credentials: 'include' })
       .then(res => res.json())
       .then(data => setWalletBalance(data.wallet.balance));
   }, []);
   ```

2. **Display Payment Options**
   ```jsx
   <div className="payment-methods">
     <label>
       <input 
         type="radio" 
         value="paystack" 
         checked={paymentMethod === 'paystack'}
         onChange={(e) => setPaymentMethod(e.target.value)}
       />
       Pay with Card/Bank (Paystack)
     </label>
     
     <label>
       <input 
         type="radio" 
         value="wallet" 
         checked={paymentMethod === 'wallet'}
         onChange={(e) => setPaymentMethod(e.target.value)}
         disabled={walletBalance < orderTotal}
       />
       Pay with Wallet (Balance: ₦{walletBalance.toLocaleString()})
       {walletBalance < orderTotal && (
         <span className="error">Insufficient balance</span>
       )}
     </label>
   </div>
   ```

3. **Update Order Submission Logic**
   ```javascript
   const handlePlaceOrder = async () => {
     try {
       const response = await fetch('/api/orders/v2/create', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         credentials: 'include',
         body: JSON.stringify({
           items: cartItems,
           deliveryAddress: selectedAddress,
           vendorDeliveryFees: deliveryFees,
           phone: userPhone,
           useWallet: paymentMethod === 'wallet', // ← KEY
           discountCode: appliedDiscount?.code || null
         })
       });

       const data = await response.json();

       if (!data.success) {
         // Show error toast
         toast.error(data.message);
         return;
       }

       // Check payment method
       if (data.order.paymentStatus === 'paid') {
         // ✅ WALLET PAYMENT SUCCESS
         toast.success('Order placed successfully!');
         router.push(`/orders/${data.order.orderId}`);
       } else {
         // ✅ PAYSTACK PAYMENT - Redirect
         window.location.href = data.authorization_url;
       }

     } catch (error) {
       toast.error('Failed to create order');
       console.error(error);
     }
   };
   ```

---

### **B. Wallet Balance Display**

Show wallet balance prominently in checkout summary:

```jsx
<div className="checkout-summary">
  <div className="line-item">
    <span>Subtotal</span>
    <span>₦{subtotal.toLocaleString()}</span>
  </div>
  <div className="line-item">
    <span>Delivery Fee</span>
    <span>₦{deliveryFee.toLocaleString()}</span>
  </div>
  {discount && (
    <div className="line-item discount">
      <span>Discount ({discount.code})</span>
      <span>-₦{discount.amount.toLocaleString()}</span>
    </div>
  )}
  <div className="line-item total">
    <span>Total</span>
    <span>₦{total.toLocaleString()}</span>
  </div>
  
  {/* Wallet Balance Info */}
  <div className="wallet-info">
    <span>💰 Wallet Balance</span>
    <span className={walletBalance >= total ? 'sufficient' : 'insufficient'}>
      ₦{walletBalance.toLocaleString()}
    </span>
  </div>
</div>
```

---

### **C. Error Handling**

Handle common errors gracefully:

```javascript
if (!data.success) {
  switch (data.message) {
    case 'Wallet not found. Please fund your wallet first.':
      toast.error('Please fund your wallet to use this payment method');
      // Optionally redirect to wallet page
      break;
    
    case /Insufficient wallet balance/.test(data.message):
      toast.error('Insufficient wallet balance. Please fund your wallet or use card payment.');
      break;
    
    case 'Email required for payment initialization':
      toast.error('Email is required. Please update your profile.');
      break;
    
    default:
      toast.error(data.message || 'Failed to create order');
  }
}
```

---

### **D. Order Confirmation Page**

For wallet payments, show immediate confirmation:

```jsx
// In /orders/[orderId] page
const OrderConfirmation = ({ orderId }) => {
  const [order, setOrder] = useState(null);

  useEffect(() => {
    fetch(`/api/orders/${orderId}`, { credentials: 'include' })
      .then(res => res.json())
      .then(data => setOrder(data.order));
  }, [orderId]);

  if (!order) return <Loader />;

  return (
    <div className="order-confirmation">
      <div className="success-icon">✅</div>
      <h1>Order Placed Successfully!</h1>
      <p>Order ID: {order.orderId}</p>
      
      {order.paymentReference?.startsWith('WALLET_') && (
        <div className="payment-info">
          <p>✅ Paid via Wallet</p>
          <p>Amount: ₦{order.total.toLocaleString()}</p>
        </div>
      )}
      
      <button onClick={() => router.push('/orders')}>
        View My Orders
      </button>
    </div>
  );
};
```

---

## Testing Checklist

- [ ] Wallet payment with sufficient balance
- [ ] Wallet payment with insufficient balance (should show error)
- [ ] Wallet payment with discount code
- [ ] Paystack payment flow (redirect → verify)
- [ ] Paystack payment with discount code
- [ ] Error handling for missing email
- [ ] Error handling for empty wallet
- [ ] UI updates after successful wallet payment
- [ ] Balance refresh after wallet payment

---

## Notes

1. **No Breaking Changes**: Existing Paystack flow still works if `useWallet` is omitted
2. **Discount Compatibility**: Both payment methods support discount codes
3. **Instant Fulfillment**: Wallet orders are fulfilled immediately (vendors notified)
4. **Security**: All validation happens on backend (balance checks, discount validation)

---

## API Reference Summary

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/user/my-wallet` | GET | Fetch wallet balance |
| `/api/user/wallet/fund` | POST | Fund wallet via Paystack |
| `/api/user/wallet/verify/:ref` | GET | Verify wallet funding |
| `/api/orders/v2/create` | POST | Create order (wallet or Paystack) |
| `/api/orders/v2/verify/:ref` | POST | Verify Paystack payment |
| `/api/discounts/verify` | POST | Verify discount code |

---

**Ready to implement!** 🚀
