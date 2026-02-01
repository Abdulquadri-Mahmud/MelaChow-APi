# Prompt for Frontend Antigravity: Wallet & Payment Integration

## Context
The Backend implementation for the Wallet System is complete. We have fixed route issues (404s) and enabled direct wallet payments without breaking existing flows.

Your task is to implement the **UI/UX** for these features.

## 1. API Routes (Confirmed Working)
The following routes are available and aliased under `/api/user` to match your existing patterns:

| Feature | Method | Endpoint | Payload | Response |
| :--- | :--- | :--- | :--- | :--- |
| **Get Wallet** | `GET` | `/api/user/my-wallet` | - | `{ success: true, wallet: { balance: 5000, transactions: [...] } }` |
| **Fund Wallet** | `POST` | `/api/user/wallet/fund` | `{ amount: 5000, email: "..." }` | `{ authorization_url: "...", reference: "..." }` |
| **Verify Fund** | `GET` | `/api/user/wallet/verify/:reference` | - | `{ success: true, message: "Wallet funded", wallet: {...} }` |

## 2. Implementation Tasks

### A. Wallet Dashboard Page (`/user/wallet`)
-   **Fetch**: Call `GET /api/user/my-wallet`.
-   **Display**: Show current **Balance** clearly (e.g., ₦5,000.00).
-   **History**: Render the list of `transactions` (Credit/Debit, Date, Description).
-   **Action**: "Fund Wallet" button opens a modal or input.

### B. Funding Flow
1.  User enters amount (Min ₦100).
2.  Call `POST /api/user/wallet/fund`.
3.  **Redirect**: Open `authorization_url` (Paystack) in new tab or redirect user.
4.  **Verification**: On return (or via modal close check), call `GET /api/user/wallet/verify/:reference`.
5.  **Update**: Refresh balance upon success.

### C. Checkout Payment Integration ("Pay with Wallet")
**This is the critical new feature.**
In your Checkout Summary component:
1.  **Check Balance**: Fetch user's wallet balance.
2.  **Compare**: Is `wallet.balance >= order.total`?
3.  **UI**: If yes, show a **radio button/checkbox** option: **"Pay with Wallet (Balance: ₦...)"**.
    *   If no, disable option or show "Insufficient Balance".
4.  **Action**:
    *   If selected, when calling `createOrder` (or `placeOrder`), add the flag:
        ```json
        {
          "items": [...],
          "deliveryAddress": {...},
          "useWallet": true  // <--- ENABLE THIS
        }
        ```
    *   **Handling Success**: The API will return `paymentStatus: "paid"` immediately.
    *   **IMPORTANT**: Do **NOT** redirect to Paystack if this succeeds. Show "Order Successful" confirmation immediately.

## 3. Notes
-   **Logout**: The logout route `/api/user/logout` has been fixed to work even if the token is expired.
-   **Error Handling**: If backend returns "Insufficient wallet balance", handle it gracefully.
