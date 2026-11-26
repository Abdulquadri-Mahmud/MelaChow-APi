/**
 * lib/support/faqContent.js
 *
 * Server-side FAQ content for the AI support chatbot.
 * Content is copied verbatim from the frontend FAQ_DATA arrays
 * (category field stripped — not needed by the LLM).
 *
 * IMPORTANT: This file is backend-only. These arrays must NEVER
 * be returned in any API response. Only { reply } is returned to callers.
 */

// ─── Customer FAQ ─────────────────────────────────────────────────────────────
export const CUSTOMER_FAQ = [
  {
    question: "What is MelaChow?",
    answer: "MelaChow helps customers discover restaurants, browse foods and combo deals, customize items, place orders, pay securely, track deliveries, and review meals after delivery."
  },
  {
    question: "Where does MelaChow operate?",
    answer: "Availability depends on your saved delivery address and the restaurants currently active in your area. Add or update your default address from Profile > Address so the app can show the most relevant restaurants and delivery fees."
  },
  {
    question: "How do I place an order?",
    answer: "Browse from Home, All Foods, All Restaurants, Search, or a restaurant details page. Choose a food or combo, select any required options, add it to your cart, then open Orders > Cart and checkout from the restaurant group you want to order from."
  },
  {
    question: "Can I add food from different restaurants to my cart?",
    answer: "Yes. Your cart groups items by restaurant. Each restaurant group has its own Checkout button, so place separate orders for items from different restaurants."
  },
  {
    question: "Why do I need to checkout one restaurant at a time?",
    answer: "Each order can only contain items from one restaurant. This keeps restaurant preparation, delivery fees, rider assignment, tracking, and refunds clear for each order."
  },
  {
    question: "Can I edit items in my cart?",
    answer: "You can increase or reduce quantities, remove items, and edit customizable food items from the cart. Combo items can be removed or checked out, but their bundle structure is handled from the combo details flow."
  },
  {
    question: "Can I add a note for the restaurant?",
    answer: "Yes. On the checkout page, each restaurant section includes a note box. Use it for preparation requests such as spice level, no onions, or delivery-related instructions the restaurant should see."
  },
  {
    question: "Can I cancel my order?",
    answer: "You can cancel while the order is still pending from the Track Order page. Once the restaurant accepts or starts preparing the order, cancellation may no longer be available. Cancelled order funds are returned to your MelaChow wallet when the cancellation succeeds."
  },
  {
    question: "What if something is missing from my order?",
    answer: "Open Support or Get Help and include your order ID plus the missing item details. The support team can review the order and help with the right resolution."
  },
  {
    question: "What does it mean when a restaurant says 'Busy' with a prep time?",
    keywords: ["busy", "busy mode", "prep time", "preparation time", "longer", "rush", "wait", "eta"],
    answer: "Restaurants can enable Busy Mode during peak rush hours to add extra preparation buffer time (for example, 'Open now · Busy (~40 min prep)'). You can still place your order normally, and the updated estimate helps set accurate delivery expectations before you pay."
  },
  {
    question: "Why can't I order from a restaurant that says 'Incoming orders paused' or 'Temporarily closed'?",
    keywords: ["paused", "incoming orders paused", "temporarily closed", "closed", "reopen", "resume", "cannot order", "unavailable"],
    answer: "Restaurants can briefly pause incoming orders while their kitchen catches up or set a temporary closure for restocking or maintenance. Checkout is blocked during that window so you don't pay for an order the kitchen cannot fulfill. The restaurant status shows when orders will automatically resume or reopen."
  },
  {
    question: "How do restaurant opening and closing hours work?",
    keywords: ["opening hours", "closing hours", "schedule", "automatic", "closed now", "admin override", "open time"],
    answer: "Restaurants automatically open and close on MelaChow based on their configured operating hours (Africa/Lagos time). Outside operating hours, checkout is paused and the restaurant page shows the next scheduled opening time. In rare cases, MelaChow administrators may also apply a temporary status override."
  },
  {
    question: "What payment methods do you accept?",
    answer: "Checkout supports card or transfer payment through Paystack. If your MelaChow wallet balance can cover the full order total, you can also pay with wallet."
  },
  {
    question: "Is my payment information secure?",
    answer: "Yes. Card and transfer payments are handled by Paystack, and MelaChow does not ask you to type full card details directly into our own checkout form."
  },
  {
    question: "What is the service fee?",
    answer: "A service fee may appear at checkout when enabled by the platform. The exact amount is shown before you complete payment. Some platform promos may reduce or remove specific fees when you are eligible."
  },
  {
    question: "How do refunds work?",
    answer: "When an eligible cancellation or refund is processed, funds may be returned to your MelaChow wallet. For payment-gateway issues, support can help trace the transaction using your order or payment reference."
  },
  {
    question: "What can I use my wallet for?",
    answer: "Your MelaChow wallet stores your balance and transaction history. You can fund it and use it to pay for checkout when the wallet balance is enough to cover the full order total."
  },
  {
    question: "How do I fund my wallet?",
    answer: "Go to Profile > Wallet, tap the fund wallet action, enter an amount or choose a preset amount, and complete the Paystack payment. Your wallet page also shows credit and debit transactions."
  },
  {
    question: "How do free delivery promos work?",
    answer: "MelaChow can run platform free delivery promos with a limited number of slots. If you are eligible, checkout can apply free delivery while slots remain. Restaurants can also sponsor free delivery for their own store."
  },
  {
    question: "Why did a free delivery promo not apply to my order?",
    answer: "A promo may not apply if it has ended, all slots have been used, you are not eligible, or the order does not meet the promo rules. Checkout always shows the final delivery fee before payment."
  },
  {
    question: "Can I use a coupon code?",
    answer: "Yes. Enter your coupon code in the Promo Code section at checkout and apply it before completing payment. The order total updates after a valid code is verified."
  },
  {
    question: "How much is the delivery fee?",
    answer: "Delivery fees depend on the restaurant, location, and delivery setup. You will see the fee for the restaurant at checkout before you pay. Vendor-sponsored or platform free delivery promos can reduce it to zero when active and eligible."
  },
  {
    question: "How do I track my order?",
    answer: "Go to Orders and open the order tracking page. You can follow status updates such as Order Placed, Confirmed, Preparing, Ready, Rider Assigned, On the way, Delivered, and Completed."
  },
  {
    question: "Can I contact my rider?",
    answer: "When a rider has been assigned and rider details are available, the tracking page can show rider information and contact options."
  },
  {
    question: "How do I reset my password?",
    answer: "Go to the Sign In page, choose Forgot Password, enter your registered email, and follow the reset instructions sent to you."
  },
  {
    question: "How do I manage my delivery addresses?",
    answer: "Open Profile > Address to add, edit, delete, or set a default delivery address. Checkout requires a default address before an order can be placed."
  },
  {
    question: "Can I update my profile details?",
    answer: "Yes. Use the Profile and Edit Profile pages to update your customer information. Keeping your phone number and email current helps with delivery and support."
  },
  {
    question: "How do notifications work?",
    answer: "MelaChow can send real-time in-app and browser notifications for order updates and other activity. You can manage notification preferences from Profile > Notification Settings."
  },
  {
    question: "Can I review my order?",
    answer: "Yes. After an order is delivered or completed, the Track Order page lets you review the order or individual items. You may also see a review prompt shortly after delivery."
  },
  {
    question: "Where can I see restaurant or food reviews?",
    answer: "Restaurant and food detail pages include review sections where available. You can view ratings, feedback, and rating filters before choosing what to order."
  },
  {
    question: "How can I become a vendor partner?",
    answer: "Use the vendor registration flow from the partner or vendor auth pages to apply. After submission, the MelaChow team reviews vendor accounts before they can start selling."
  },
];

// ─── Vendor FAQ ───────────────────────────────────────────────────────────────
export const VENDOR_FAQ = [
  {
    question: "How do I get my account approved?",
    answer: "After verifying your email and setting a password, your account is placed in 'Pending Approval' status. Our admin team will review your submitted business details (store name, address, menu, etc.). Usually, this takes less than 24 hours. You'll receive an email notification once your store is live!"
  },
  {
    question: "How do I update my payout bank account?",
    keywords: ["bank account", "payout", "locked", "paystack", "update bank"],
    answer: "For security, payout bank accounts are locked after initial Paystack verification and cannot be overwritten directly from the dashboard. Contact support@melachow.com with your store name and verified account details to request a secure update."
  },
  {
    question: "How do Escrow payments and T+1 automatic payouts work?",
    keywords: ["escrow", "payout", "payment", "7:30", "automatic", "withdraw", "settlement"],
    answer: "When a customer pays for an order, funds are safely held in Escrow until delivery is confirmed. Once delivered, your food revenue moves into your Available Balance. Every morning at 7:30 AM WAT (T+1, after Paystack overnight settlement), any available balance above ₦0 is swept automatically to your verified bank account. You can also request a manual withdrawal anytime from the Transactions page."
  },
  {
    question: "When is my money released from Escrow?",
    answer: "The exact moment the order status is marked as 'Delivered' by the platform rider, the system automatically releases the escrowed funds directly into your Vendor Wallet. This ensures fair play and system integrity."
  },
  {
    question: "What happens if an order is cancelled?",
    answer: "If an order is cancelled before it is delivered, the escrowed funds are automatically refunded to the customer. Since the money was in escrow and never touched your wallet, you do not have to worry about negative balances or clawbacks."
  },
  {
    question: "When can I withdraw my funds?",
    answer: "As soon as funds are released from escrow into your Vendor Wallet, they are available for withdrawal. You can request a payout to your registered bank account from the 'Transactions' page."
  },
  {
    question: "How do I know when I have a new order?",
    answer: "Keep your vendor dashboard open! Our real-time WebSocket system will trigger an audio alert and a visual pop-up immediately when a new order arrives. You'll also see it appear in your 'Orders' tab."
  },
  {
    question: "Why can't I update the status to 'Delivered'?",
    answer: "Delivery is centrally managed by MelaChow. Once you mark an order as 'Ready for Pickup', only the assigned platform rider can update the status to 'Out for Delivery' and 'Delivered' after extraction and drop-off."
  },
  {
    question: "What do the different Order Statuses mean?",
    answer: "Our system uses specific statuses to track every step of the order lifecycle. Understanding these helps you manage expectations and ensures timely payouts:\n\n• PENDING: The customer has paid, and the order is waiting for you to 'Accept' it.\n• ACCEPTED: You have confirmed the order. The customer is notified that you are starting work.\n• PREPARING: Your kitchen is currently cooking or packing the items.\n• READY FOR PICKUP: The order is fully packed and sitting on your counter. Marking this alerts the assigned platform rider that the food is ready for extraction.\n• RIDER ASSIGNED: A platform rider has been officially linked to the order.\n• OUT FOR DELIVERY: The rider has scanned the order and left your store. The customer can now track them in real-time.\n• DELIVERED: The rider has reached the customer. ***CRITICAL: This status triggers the release of funds from Escrow to your Vendor Wallet.***\n• COMPLETED: The final confirmation that the business transaction is closed and successful.\n• CANCELLED: The order was stopped. If you cancel, the customer is automatically refunded to their wallet."
  },
  {
    question: "How do I add or edit food items?",
    answer: "Go to the 'Create Food' tab to add a new item with images, descriptions, categories, and price. To edit an existing item (like updating the price or marking it out of stock), navigate to 'My Foods' and click the edit icon on the specific item."
  },
  {
    question: "Can I offer discounts on my food?",
    answer: "Yes! You can adjust the base price of your food items anytime, while platform coupon codes are managed centrally by MelaChow admins to keep rules consistent."
  },
  {
    question: "What insights can I track in Business Analytics?",
    keywords: ["analytics", "daily sales", "weekly sales", "monthly sales", "completed orders", "average order value", "aov", "best selling", "least selling", "cancelled orders", "ratings", "csv", "export", "insights", "report"],
    answer: "Open Analytics from the sidebar (or the Kitchen & Sales Pulse strip on your Dashboard) to track Daily, Weekly (7D), Monthly (30D), and All-Time sales, Total Completed Orders, Average Order Value (AOV), Order Acceptance Rate, Cancelled Orders, Average Preparation Time, Customer Ratings breakdown (5★–1★), and both Best-Selling and Least-Selling meals. You can switch timeframes (Today, 7D, 30D, 90D, All) and export a CSV report."
  },
  {
    question: "How are Average Preparation Time and Order Acceptance Rate calculated?",
    keywords: ["prep time", "preparation time", "average prep", "acceptance rate", "order acceptance", "declined", "missed", "ready for pickup", "speed"],
    answer: "Average Preparation Time measures the actual minutes between when your kitchen accepts or starts an order and when you mark it Ready for Pickup, compared against your target prep time. Order Acceptance Rate measures the percentage of incoming orders your store accepted rather than missed or cancelled before acceptance. Keeping realistic prep times and using Busy Mode or timed Order Pause during rushes protects both metrics."
  },
  {
    question: "What does Least-Selling Meals show and how should I use it?",
    keywords: ["least selling", "slow", "zero sales", "underperforming", "menu optimization", "best selling", "meals"],
    answer: "Least-Selling Meals cross-references your completed orders against every active item on your menu, including dishes with zero sales in the selected timeframe. Use it to identify slow movers and improve their photos, descriptions, pricing, or hide items that aren't selling."
  },
  {
    question: "How do Busy Mode and Estimated Preparation Time adjustment work?",
    keywords: ["busy", "busy mode", "prep time", "preparation time", "buffer", "extra minutes", "rush hour", "eta", "availability"],
    answer: "Go to Availability in the sidebar to set your standard Base Preparation Time (5–90 min). During rush hours, activate Busy Mode to add an extra prep buffer (+10, +15, +20, +30, or +45 min) with an optional auto-expiry timer (30 min, 1 hr, 2 hrs, or manual). Your store stays open and keeps taking orders while customers see the updated prep ETA."
  },
  {
    question: "What is the difference between Pause Incoming Orders and Temporary Closure?",
    keywords: ["pause", "pause orders", "incoming orders", "temporary closure", "close store", "reopen", "resume", "timer", "availability"],
    answer: "Pause Incoming Orders (15 min, 30 min, 1 hr, or manual) holds new customer checkouts while letting your kitchen finish active orders, and resumes automatically when the timer ends. Temporary Closure (2 hrs, Rest of Today, Tomorrow 9 AM, or custom date/time) closes your store for restocking, maintenance, or holidays, shows your optional reason and reopen time to customers, and reopens automatically."
  },
  {
    question: "How does automatic closure based on operating hours work?",
    keywords: ["operating hours", "schedule", "automatic closure", "auto schedule", "today hours", "opening hours", "closing time", "lagos"],
    answer: "In Availability under Weekly Open / Closed Schedule, configure your daily opening and closing times (Africa/Lagos WAT) and keep Automatic Closure by Operating Hours switched on. MelaChow automatically blocks new checkouts outside scheduled hours and displays your next opening time. You can also adjust only Today's hours in one click without changing your regular weekly schedule."
  },
  {
    question: "What does an Admin Override banner mean on my Availability page?",
    keywords: ["admin override", "forced open", "forced closed", "override", "super admin", "availability"],
    answer: "A MelaChow super-admin can override a store's live status (Force Open or Force Closed) when needed for platform operations or support incidents. Admin Override takes top priority over your weekly schedule, pauses, and temporary closures. Contact support@melachow.com if you need normal automatic scheduling restored."
  },
];

// ─── System Prompt Builder ────────────────────────────────────────────────────

/**
 * Build a system prompt for Anthropic that injects the correct FAQ content
 * based on the user's role.
 *
 * @param {'customer'|'vendor'} role
 * @returns {string}
 */
export function buildSystemPrompt(role) {
  const faqArray = role === 'vendor' ? VENDOR_FAQ : CUSTOMER_FAQ;

  const faqBlock = faqArray
    .map(({ question, answer }) => `Q: ${question}\nA: ${answer}`)
    .join('\n\n');

  return `You are Chow, MelaChow's AI support assistant for ${role} users on the MelaChow food delivery platform.

Your ONLY job is to answer questions using the FAQ content listed below.

STRICT RULES:
1. Answer ONLY from the FAQ content below. Do not use any outside knowledge.
2. If the user's question is not covered by the FAQ content, respond with exactly:
   "I don't have information on that. For further help, please email support@melachow.com."
3. Never invent specific figures, dates, naira amounts, percentages, or policy details not explicitly stated in the FAQ content.
4. Never claim to be a human or imply a human is available in this chat.
5. Keep answers concise and conversational. Do not repeat the question back.
6. If a question is partially covered, answer what you can and clearly state what you cannot help with.

FAQ CONTENT:
${faqBlock}`;
}
