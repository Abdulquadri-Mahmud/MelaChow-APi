// emails/orderStatusTemplate.js

export const getOrderStatusEmail = (user, order, status) => {
  const greeting = `Hi ${user.name || 'Customer'},`;
  const orderRef = `<strong style="color: #6C63FF;">Order ID: ${order.orderId}</strong>`;
  let subject = '';
  let message = '';

  switch (status) {
    case 'cod':
      subject = 'Order Placed - Cash on Delivery';
      message = `
        <p>Thank you for shopping with <strong style="color:#6C63FF;">Aurora Gems</strong>.</p>
        <p>Your order has been placed successfully using <strong>Cash on Delivery</strong>. Please prepare the exact amount at delivery.</p>
        <p>${orderRef}</p>
        <p>You’ll receive updates as your order is processed and shipped.</p>
      `;
      break;

    case 'paid':
      subject = 'Order Confirmed - Payment Successful';
      message = `
        <p>Your payment has been received successfully. We’re now preparing your order for shipment.</p>
        <p>${orderRef}</p>
        <p>You’ll get another update once it’s on the way!</p>
      `;
      break;

    case 'shipped':
      subject = 'Order Shipped - It’s On the Way!';
      message = `
        <p>Your order is on the way! 🚚</p>
        <p>${orderRef}</p>
        <p>Expected delivery in 3–5 business days.</p>
      `;
      break;

    case 'delivered':
      subject = 'Order Delivered - Thank You!';
      message = `
        <p>Your order has been delivered successfully. 🎉</p>
        <p>${orderRef}</p>
        <p>We hope you love your purchase. We'd love to hear your feedback or review.</p>
      `;
      break;

    case 'cancelled':
      subject = 'Order Cancelled';
      message = `
        <p>We’re sorry to inform you that your order has been cancelled.</p>
        <p>${orderRef}</p>
        <p>If this was a mistake, feel free to reach out to our support team.</p>
      `;
      break;

    default:
      subject = 'Order Update';
      message = `
        <p>Your order status has been updated to: <strong>${status.toUpperCase()}</strong>.</p>
        <p>${orderRef}</p>
      `;
  }

  const html = `
    <div style="font-family: 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff; padding: 24px; border-radius: 10px; box-shadow: 0 4px 10px rgba(0,0,0,0.05); color: #333;">
      <h2 style="color: #6C63FF; text-align: center;">Aurora Gems ✨</h2>
      <p style="font-size: 16px;">${greeting}</p>
      ${message}
      <hr style="margin: 24px 0;" />
      <p style="font-size: 14px; color: #888; text-align: center;">
        This is an automated message. If you have any questions, contact us at 
        <a href="mailto:support@auroragems.com" style="color: #6C63FF;">support@auroragems.com</a>
      </p>
    </div>
  `;

  return {
    to: user.email,
    subject,
    html,
  };
};
