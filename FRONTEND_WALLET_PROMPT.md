# Prompt for Frontend AI: Implement Wallet & Payment

## Context
The Backend now supports a full Wallet system including funding via Paystack and paying for orders using wallet balance.

## Objectives
1.  **Wallet Dashboard**: View balance and transaction history.
2.  **Fund Wallet**: Integration with Paystack.
3.  **Checkout**: "Pay with Wallet" option.

## API Endpoints

### 1. View Wallet
**GET** `/api/user/my-wallet` (Alias for `/api/wallet/`)
Response:
```json
{
  "success": true,
  "wallet": {
    "balance": 5000,
    "transactions": [
      { "type": "credit", "amount": 5000, "description": "...", "date": "..." }
    ]
  }
}
```

### 2. Fund Wallet (Paystack)
**Flow**:
1.  User enters amount (e.g., 5000).
2.  **POST** `/api/wallet/fund`
    - Body: `{ "amount": 5000, "email": "user@example.com" }`
3.  Response: `{ "authorization_url": "...", "reference": "..." }`
4.  Redirect user to `authorization_url`.
5.  On return (success), call **GET** `/api/wallet/verify/:reference`.
    - Returns updated wallet.

### 3. Pay for Order with Wallet
In your `createOrder` function (Checkout):
If user selects "Wallet" as payment method:
1.  Ensure `wallet.balance >= total`.
2.  Add `useWallet: true` to the order payload.
    ```json
    {
      "items": [...],
      "deliveryAddress": {...},
      "useWallet": true,  // <--- NEW
      "discountCode": "..." // (Optional)
    }
    ```
3.  **Response**:
    - If success, the order returned will have `paymentStatus: "paid"`.
    - Show "Order Placed Successfully" immediately (no Paystack redirect).

## Task List for Frontend AI
1.  **Wallet Page**: Create `/user/wallet` route. Fetch and display data.
2.  **Funding Modal**: Add "Fund Wallet" button -> Input -> Paystack Flow.
3.  **Checkout UI**: Add "Wallet Balance: ₦5000" display.
    - If balance covers total, show "Pay with Wallet" option.
    - If selected, pass `useWallet: true`.

## Notes
-   The user was previously getting 404 on `/api/user/my-wallet`. This is fixed on backend (aliased).
-   If `useWallet: true` is sent but balance is insufficient, backend keeps order pending or throws error (Backend throws Error: "Insufficient wallet balance"). Handle this error gracefully.
