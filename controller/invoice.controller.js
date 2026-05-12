import { getUserInvoiceById, getUserInvoices } from "../services/invoice.service.js";

export const listMyInvoices = async (req, res) => {
    try {
        const data = await getUserInvoices(req.userId, req.query);
        return res.status(200).json({ success: true, data });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const getMyInvoice = async (req, res) => {
    try {
        const invoice = await getUserInvoiceById(req.userId, req.params.invoiceId);
        if (!invoice) {
            return res.status(404).json({ success: false, message: "Invoice not found" });
        }
        return res.status(200).json({ success: true, data: invoice });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};
