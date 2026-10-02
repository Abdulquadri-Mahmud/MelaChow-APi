const SOURCE = "MelaChow";

const config = () => {
  const baseUrl = String(process.env.SAMKA_LOGISTICS_BASE_URL || "").replace(/\/$/, "");
  const adminKey = String(process.env.SAMKA_LOGISTICS_SOURCE_ADMIN_KEY || "");
  if (!baseUrl || !adminKey) throw new Error("Samka source-admin integration is not configured");
  return { baseUrl, adminKey };
};

const send = async (method, path, adminId, body) => {
  const { baseUrl, adminKey } = config();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(process.env.SAMKA_LOGISTICS_TIMEOUT_MS || 10000));
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "X-Logistics-Source-Admin-Key": adminKey,
        "X-Source-Admin-Id": String(adminId),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const text = await response.text();
    let payload = null;
    try { payload = text ? JSON.parse(text) : null; } catch { payload = text || null; }
    if (!response.ok) {
      const error = new Error(`Samka Logistics admin request failed with status ${response.status}`);
      error.status = response.status;
      throw error;
    }
    return payload;
  } finally { clearTimeout(timeout); }
};

const query = (params = {}) => {
  const values = new URLSearchParams({ source: SOURCE });
  Object.entries(params).forEach(([key, value]) => { if (value !== undefined && value !== null && value !== "") values.set(key, String(value)); });
  return values.toString();
};

export const samkaLogisticsAdmin = {
  listRiders: (adminId, params) => send("GET", `/api/source-admin/riders?${query(params)}`, adminId),
  getRider: (adminId, riderId) => send("GET", `/api/source-admin/riders/${encodeURIComponent(riderId)}?${query()}`, adminId),
  getRiderDeliveries: (adminId, riderId, params) => send("GET", `/api/source-admin/riders/${encodeURIComponent(riderId)}/deliveries?${query(params)}`, adminId),
  getRiderWallet: (adminId, riderId) => send("GET", `/api/source-admin/riders/${encodeURIComponent(riderId)}/wallet?${query()}`, adminId),
  getRiderLedger: (adminId, riderId, params) => send("GET", `/api/source-admin/riders/${encodeURIComponent(riderId)}/ledger?${query(params)}`, adminId),
  getRiderWithdrawals: (adminId, riderId, params) => send("GET", `/api/source-admin/riders/${encodeURIComponent(riderId)}/withdrawals?${query(params)}`, adminId),
  approveRider: (adminId, riderId) => send("POST", `/api/source-admin/riders/${encodeURIComponent(riderId)}/approve?${query()}`, adminId),
  rejectRider: (adminId, riderId, reason) => send("POST", `/api/source-admin/riders/${encodeURIComponent(riderId)}/reject?${query()}`, adminId, { reason }),
  suspendRider: (adminId, riderId, reason) => send("POST", `/api/source-admin/riders/${encodeURIComponent(riderId)}/suspend?${query()}`, adminId, reason ? { reason } : undefined),
  getDelivery: (adminId, deliveryId) => send("GET", `/api/source-admin/deliveries/${encodeURIComponent(deliveryId)}?${query()}`, adminId),
  cancelDelivery: (adminId, deliveryId, reason) => send("POST", `/api/source-admin/deliveries/${encodeURIComponent(deliveryId)}/cancel?${query()}`, adminId, String(reason || "Cancelled by MelaChow admin")),
  reassignDelivery: (adminId, deliveryId, riderId, reason) => send("POST", `/api/source-admin/deliveries/${encodeURIComponent(deliveryId)}/reassign?${query()}`, adminId, { riderId, reason }),
};
