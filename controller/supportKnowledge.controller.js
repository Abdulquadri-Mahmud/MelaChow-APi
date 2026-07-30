import SupportKnowledge from "../model/supportKnowledge.model.js";

function clean(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

function normaliseKeywords(value) {
  const raw = Array.isArray(value) ? value : String(value || "").split(",");
  return [...new Set(raw.map((item) => clean(item, 60).toLowerCase()).filter(Boolean))].slice(0, 25);
}

export const listSupportKnowledge = async (req, res) => {
  try {
    const { audience = "all", published = "all", search = "" } = req.query;
    const query = {};
    if (["customer", "vendor", "all"].includes(audience) && audience !== "all") query.audience = audience;
    if (published !== "all") query.isPublished = published === "true";
    if (search) {
      const regex = new RegExp(clean(search, 80).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      query.$or = [{ title: regex }, { content: regex }, { keywords: regex }];
    }
    const articles = await SupportKnowledge.find(query).sort({ updatedAt: -1 }).lean();
    return res.json({ success: true, data: { articles } });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Unable to load support knowledge." });
  }
};

export const createSupportKnowledge = async (req, res) => {
  try {
    const title = clean(req.body?.title, 180);
    const content = clean(req.body?.content, 12000);
    if (title.length < 5 || content.length < 20) return res.status(400).json({ success: false, message: "Provide a clear title and an answer of at least 20 characters." });
    const isPublished = Boolean(req.body?.isPublished);
    const article = await SupportKnowledge.create({
      title, content,
      audience: ["customer", "vendor", "all"].includes(req.body?.audience) ? req.body.audience : "customer",
      category: clean(req.body?.category, 80) || "general",
      keywords: normaliseKeywords(req.body?.keywords),
      isPublished,
      reviewedAt: isPublished ? new Date() : null,
      reviewedBy: isPublished ? req.admin?._id : null,
    });
    return res.status(201).json({ success: true, data: { article } });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Unable to create support knowledge." });
  }
};

export const updateSupportKnowledge = async (req, res) => {
  try {
    const article = await SupportKnowledge.findById(req.params.articleId);
    if (!article) return res.status(404).json({ success: false, message: "Knowledge article not found." });
    const title = req.body?.title === undefined ? article.title : clean(req.body.title, 180);
    const content = req.body?.content === undefined ? article.content : clean(req.body.content, 12000);
    if (title.length < 5 || content.length < 20) return res.status(400).json({ success: false, message: "Provide a clear title and an answer of at least 20 characters." });
    article.title = title;
    article.content = content;
    article.audience = ["customer", "vendor", "all"].includes(req.body?.audience) ? req.body.audience : article.audience;
    article.category = req.body?.category === undefined ? article.category : clean(req.body.category, 80) || "general";
    article.keywords = req.body?.keywords === undefined ? article.keywords : normaliseKeywords(req.body.keywords);
    if (req.body?.isPublished !== undefined) {
      article.isPublished = Boolean(req.body.isPublished);
      article.reviewedAt = article.isPublished ? new Date() : null;
      article.reviewedBy = article.isPublished ? req.admin?._id : null;
    }
    await article.save();
    return res.json({ success: true, data: { article } });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Unable to update support knowledge." });
  }
};
