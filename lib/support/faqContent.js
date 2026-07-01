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
    answer: "You can update your payout details (Bank Name, Account Name, Account Number) in the 'Profile' section of your dashboard. Make sure the name on your bank account matches your registered store name or personal name to avoid payout delays."
  },
  {
    question: "How do payments and payouts work?",
    answer: "MelaChow uses a secure Escrow system to protect both you and the customer. When a customer pays for an order, the funds are safely held by MelaChow. We do not release the food revenue to your wallet immediately upon payment."
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
    answer: "Yes! Currently, you can adjust the base price of your food. We are also rolling out a dedicated 'Coupons' feature where you can create promotional codes specifically for your store."
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
