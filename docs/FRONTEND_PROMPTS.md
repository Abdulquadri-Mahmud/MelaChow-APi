# Frontend Implementation Prompts

## 1. User Wallet Implementation

**Context:** 
We have implemented a Wallet system for Users on the backend. This allows users to store funds, fund their wallet via Paystack, and view their balance.

**Objectives:**
1.  Create a "Wallet" page in the User Dashboard.
2.  Display current Wallet Balance.
3.  Allow users to Fund their wallet.
4.  Handle the Paystack payment flow.

**Backend Endpoints:**
-   **GET /api/wallet**: returns `{ success: true, wallet: { balance: number, transactions: [...] } }`
-   **POST /api/wallet/fund**: 
    -   Body: `{ amount: number, email: string }`
    -   Returns: `{ success: true, authorization_url: string, reference: string }`
    -   Action: Redirect user to `authorization_url`.
-   **GET /api/wallet/verify/:reference**: 
    -   Call this after Paystack redirects back (or check status).
    -   Returns: `{ success: true, message: "...", wallet:UpdatedWallet }`

**Task for Frontend AI:**
> "Please implement the User Wallet feature in the User Dashboard. 
> 1. Create a new page/component `UserWallet`.
> 2. On mount, fetch the wallet data from `GET /api/wallet`. Display the `balance` prominently.
> 3. Add a 'Fund Wallet' button. When clicked, open a modal or form to ask for the Amount.
> 4. When the user submits the amount, call `POST /api/wallet/fund` with the amount and user's email.
> 5. Redirect the user to the returned `authorization_url` to complete payment on Paystack.
> 6. Create a 'Verify Payment' page or handle the callback. When Paystack redirects back, grab the `reference` from the URL and call `GET /api/wallet/verify/:reference`.
> 7. Show success/error message and refresh the wallet balance.
> 8. List recent transactions from `wallet.transactions` below the balance."

---

## 2. Vendor Reviews Implementation

**Context:**
We have added backend support for Users to review Vendors and specific Foods.

**Objectives:**
1.  Allow users to leave a star rating (1-5) and a comment for a Vendor.
2.  (Optional) Allow users to leave a review for a specific Food item.
3.  Display reviews on the Vendor/Food details page.

**Backend Endpoints:**
-   **POST /api/admin/user/reviews/create-reviews**:
    -   Headers: `Cookie: token=...` (Automatically handled if creds included)
    -   Body: `{ vendorId: string, foodId: string (optional), rating: number, comment: string }`
    -   Returns: `{ success: true, review: ... }`
-   **GET /api/admin/user/reviews/vendor-reviews?vendorId=...**:
    -   *Note: Currently protected by Admin Auth. Ensure you have admin access or request backend to open this if public access is needed.*
    -   Returns: `{ success: true, reviews: [...] }`

**Task for Frontend AI:**
> "Please implement Vendor Reviews.
> 1. On the Vendor Details page, add a 'Reviews' section.
> 2. Add a 'Write a Review' button.
> 3. When clicked, show a form with a Star Rating (1-5) and a Text Area for comments.
> 4. On submit, call `POST /api/admin/user/reviews/create-reviews` with `vendorId`, `rating`, and `comment`.
> 5. Display a success toast and refresh the list (if you have access to fetch them).
> 6. *Note check:* Try to fetch reviews using `GET /api/admin/user/reviews/vendor-reviews?vendorId=...`. If it fails due to 403/401, mock the display for now or ask backend to make it public."
