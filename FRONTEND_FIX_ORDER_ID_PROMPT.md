# PROMPT FOR FRONTEND AI: Fix Vendor Order ID Extraction

**TASK:** Fix vendor order ID extraction in order details page to send correct MongoDB `_id` and handle enhanced backend error responses.

---

### **CONTEXT**
The order status update is failing with **"Invalid Vendor Order ID format"** because the frontend is sending the wrong ID format to the backend. The backend strictly expects the 24-character hexadecimal MongoDB `_id` from the `VendorOrder` document, but the frontend might be sending the user-facing `orderId` or a raw URL parameter.

**IMPORTANT BACKEND UPDATE:**
The backend has been updated with enhanced validation and error reporting. If an invalid ID is sent, the response will now include:
- `received`: The exact value that was sent.
- `receivedLength`: The length of the value sent.
- `hint`: A helpful instruction (e.g., "Make sure you're sending the MongoDB _id from the VendorOrder document, not the user-facing orderId").

---

### **WHAT TO DO**
1. Update **ONLY** the `performStatusUpdate` function in `src/app/vendors/orders/[id]/page.jsx`.
2. Fix the logic that extracts the MongoDB `_id` from the `order` object.
3. Add defensive checks to handle different ID formats (String vs. Object with `$oid`).
4. Add console logging to help debug ID extraction.
5. Add a `useEffect` to log the `order` data structure when it loads.
6. **New:** Update error handling to display the `hint` and `received` value provided by the backend to aid in debugging.

---

### **CHANGES NEEDED**

#### **STEP 1: Add Debugging useEffect**
Add this after existing `useEffect` hooks (around line 60):

```javascript
// Debug: Log order data structure for ID troubleshooting
useEffect(() => {
    if (order) {
        console.log('📊 Order Data Structure:', {
            _id: order._id,
            _idType: typeof order._id,
            hasOidProperty: !!order._id?.$oid,
            urlParamId: id,
            urlParamIdType: typeof id,
            isValidMongoId: typeof order._id === 'string' && order._id.match(/^[0-9a-fA-F]{24}$/)
        });
    }
}, [order, id]);
```

#### **STEP 2: Replace `performStatusUpdate` Function**
Replace the function (starting around line 48) with this version that correctly extracts and validates the ID:

```javascript
const performStatusUpdate = async (newStatus) => {
    try {
        setIsUpdating(true);

        // ✅ CRITICAL FIX: Properly extract MongoDB _id from order object
        let vendorOrderId;
        
        // Handle different formats the API might return (Standard String or Mongo Extended JSON)
        if (typeof order._id === 'string') {
            vendorOrderId = order._id;
        } else if (order._id?.$oid) {
            vendorOrderId = order._id.$oid;
        } else if (typeof id === 'string' && id.match(/^[0-9a-fA-F]{24}$/)) {
            // Last resort: use URL param only if it's a valid MongoDB ObjectId
            console.warn('⚠️ Using URL param as vendorOrderId - order._id was unavailable');
            vendorOrderId = id;
        } else {
            throw new Error('Unable to determine valid vendor order ID from order object');
        }

        // Validate format locally before sending
        if (!vendorOrderId.match(/^[0-9a-fA-F]{24}$/)) {
            throw new Error(`Invalid MongoDB ObjectId format: ${vendorOrderId}`);
        }

        console.log(`📝 Updating order status:`, {
            vendorOrderId, // MongoDB _id being sent to backend
            vendorOrderIdSource: typeof order._id === 'string' ? 'order._id (string)' : order._id?.$oid ? 'order._id.$oid' : 'url param',
            newStatus: newStatus,
            userFacingOrderId: order.userOrderId?.orderId || order.orderId 
        });

        // ✅ Call appropriate endpoint
        if (newStatus === 'completed') {
            await completeOrder(vendorOrderId);
        } else {
            // Backend expects 'ready', frontend uses 'ready_for_pickup'
            const backendStatus = newStatus === 'ready_for_pickup' ? 'ready' : newStatus;
            await updateOrderStatus(vendorOrderId, backendStatus);
        }

        // ✅ Refresh order data
        const res = await getVendorOrderById(id);
        const data = res.data || res;
        setOrder(data);

        setShowSuccessToast(true);
        setTimeout(() => setShowSuccessToast(false), 3000);
        
    } catch (err) {
        console.error("❌ Failed to update order status:", err);
        
        // ✅ ENHANCED ERROR LOGGING (Using new backend fields)
        const backendError = err.response?.data;
        console.error("❌ Backend Error Details:", {
            attemptedVendorOrderId: vendorOrderId || 'undefined',
            receivedByBackend: backendError?.received,
            backendHint: backendError?.hint,
            message: backendError?.message
        });

        // ✅ Set user-friendly error message
        const errorMsg = backendError?.message || err.message || "Failed to update order status.";
        const displayMsg = backendError?.hint ? `${errorMsg} (${backendError.hint})` : errorMsg;
        
        setErrorMessage(displayMsg);
        setTimeout(() => setErrorMessage(null), 5000);
    } finally {
        setIsUpdating(false);
        setIsCancelModalOpen(false);
    }
};
```

---

### **WHAT NOT TO DO**
❌ Do NOT modify the `VendorOrderCard` component.
❌ Do NOT change the route structure or URL parameters.
❌ Do NOT alter the API call functions (`updateOrderStatus`, `completeOrder`) signatures.
❌ Do NOT modify the `getVendorOrderById` function.
❌ Do NOT change any UI components or styling.
❌ Do NOT touch the order fetching `useEffect`.

---

### **EXPECTED OUTCOME**
- Console logs will show exactly what ID format is received from the API.
- The correct MongoDB `_id` will be extracted and sent to the backend.
- **Status updates will succeed.**
- If they fail, error messages will include backend-provided hints (e.g., "Make sure you're sending the MongoDB _id..."), making debugging trivial.
