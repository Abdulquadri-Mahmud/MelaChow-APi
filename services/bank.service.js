import axios from "axios";

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
const PAYSTACK_BASE_URL = "https://api.paystack.co";

/**
 * Fetch list of valid Nigerian banks from Paystack
 */
export const fetchBankList = async () => {
  const banks = [];
  const perPage = 100;
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const response = await axios.get(
      `${PAYSTACK_BASE_URL}/bank?country=nigeria&currency=NGN&perPage=${perPage}&page=${page}`,
      {
        headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` },
      }
    );

    const pageBanks = Array.isArray(response.data?.data)
      ? response.data.data
      : [];

    banks.push(...pageBanks);

    const meta = response.data?.meta;
    const totalPages = meta?.pageCount || meta?.total_pages || 1;
    hasMore = page < totalPages && pageBanks.length > 0;
    page += 1;
  }

  return banks
    .filter((bank) => bank?.code && bank?.name && bank.active !== false)
    .sort((a, b) => a.name.localeCompare(b.name));
};

/**
 * Resolve bank account number to account name
 */
export const resolveBankAccount = async (account_number, bank_code) => {
  const response = await axios.get(
    `${PAYSTACK_BASE_URL}/bank/resolve?account_number=${account_number}&bank_code=${bank_code}`,
    {
      headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` },
    }
  );
  return response.data.data.account_name;
};

/**
 * Create a Transfer Recipient on Paystack
 * This is required to initiate transfers to a bank account.
 */
export const createTransferRecipient = async ({ name, account_number, bank_code }) => {
  const response = await axios.post(
    `${PAYSTACK_BASE_URL}/transferrecipient`,
    {
      type: "nuban",
      name,
      account_number,
      bank_code,
      currency: "NGN",
    },
    {
      headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` },
    }
  );
  return response.data.data.recipient_code;
};

/**
 * Delete a Transfer Recipient from Paystack
 */
export const deleteTransferRecipient = async (recipientCode) => {
  try {
    await axios.delete(`${PAYSTACK_BASE_URL}/transferrecipient/${recipientCode}`, {
      headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` },
    });
    return true;
  } catch (error) {
    console.error("Failed to delete Paystack recipient:", error.response?.data || error.message);
    return false;
  }
};
