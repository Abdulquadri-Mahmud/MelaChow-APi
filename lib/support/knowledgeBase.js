import SupportKnowledge from "../../model/supportKnowledge.model.js";
import { CUSTOMER_FAQ, VENDOR_FAQ } from "./faqContent.js";

const STOP_WORDS = new Set(["about", "after", "again", "also", "are", "can", "does", "for", "from", "have", "how", "i", "is", "it", "me", "my", "of", "on", "or", "the", "to", "was", "what", "when", "where", "with", "you"]);

function terms(value) {
  return [...new Set(String(value || "").toLowerCase().match(/[a-z0-9]{3,}/g)?.filter((word) => !STOP_WORDS.has(word)) || [])];
}

function scoreArticle(article, queryTerms) {
  const title = String(article.title || article.question || "").toLowerCase();
  const content = String(article.content || article.answer || "").toLowerCase();
  const keywords = (article.keywords || []).join(" ").toLowerCase();
  return queryTerms.reduce((score, term) => score + (title.includes(term) ? 5 : 0) + (keywords.includes(term) ? 3 : 0) + (content.includes(term) ? 1 : 0), 0);
}

/**
 * Returns only published, role-appropriate articles. The static FAQ is a safe
 * fallback while the managed knowledge base is being populated.
 */
export async function findRelevantKnowledge({ role, query, limit = 6 }) {
  const audience = role === "vendor" ? "vendor" : "customer";
  const queryTerms = terms(query);
  let articles = [];
  try {
    articles = await SupportKnowledge.find({
      isPublished: true,
      audience: { $in: [audience, "all"] },
    })
      .select("title content keywords category updatedAt")
      .sort({ updatedAt: -1 })
      .limit(100)
      .lean();
  } catch {
    // Support remains available using reviewed fallback articles if the
    // managed-library query is temporarily unavailable.
    articles = [];
  }

  const managedArticles = articles
    .map((article) => ({ ...article, score: scoreArticle(article, queryTerms) }))
    .filter((article) => article.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  if (managedArticles.length) return { articles: managedArticles, source: "managed" };

  const fallback = (audience === "vendor" ? VENDOR_FAQ : CUSTOMER_FAQ)
    .map((article) => ({ ...article, score: scoreArticle(article, queryTerms) }))
    .filter((article) => article.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return { articles: fallback, source: "fallback" };
}

export function formatKnowledgeForPrompt(articles) {
  return articles.map((article, index) => {
    const title = article.title || article.question;
    const content = article.content || article.answer;
    return `${index + 1}. ${title}\n${content}`;
  }).join("\n\n");
}
