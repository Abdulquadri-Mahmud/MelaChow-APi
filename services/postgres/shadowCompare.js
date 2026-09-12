import logger from "../../config/logger.js";

export const shadowReadsEnabled = (domain) =>
  process.env.POSTGRES_SHADOW_READS_ENABLED === "true" &&
  (!process.env.POSTGRES_SHADOW_DOMAINS || process.env.POSTGRES_SHADOW_DOMAINS.split(",").map((value) => value.trim()).includes(domain));

const normalize = (value) => {
  if (value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value.toJSON === "function") return normalize(value.toJSON());
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).filter(([key]) => key !== "__v").sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, normalize(child)]));
  }
  return value;
};

const collectDiffs = (left, right, path = "$", diffs = [], limit = 25) => {
  if (diffs.length >= limit) return diffs;
  if (typeof left !== typeof right || Array.isArray(left) !== Array.isArray(right)) {
    diffs.push(`${path}: type mismatch`);
    return diffs;
  }
  if (left === null || right === null || typeof left !== "object") {
    if (left !== right) diffs.push(`${path}: value mismatch`);
    return diffs;
  }
  if (Array.isArray(left)) {
    if (left.length !== right.length) diffs.push(`${path}: length ${left.length} != ${right.length}`);
    for (let index = 0; index < Math.min(left.length, right.length); index += 1) collectDiffs(left[index], right[index], `${path}[${index}]`, diffs, limit);
    return diffs;
  }
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  for (const key of keys) {
    if (!(key in left) || !(key in right)) diffs.push(`${path}.${key}: missing`);
    else collectDiffs(left[key], right[key], `${path}.${key}`, diffs, limit);
    if (diffs.length >= limit) break;
  }
  return diffs;
};

export const runShadowComparison = ({ domain, operation, primary, shadow }) => {
  if (!shadowReadsEnabled(domain)) return;
  Promise.resolve().then(shadow).then((shadowValue) => {
    const diffs = collectDiffs(normalize(primary), normalize(shadowValue));
    const event = { domain, operation, diffCount: diffs.length, diffs };
    if (diffs.length) logger.warn(event, "Postgres shadow read mismatch");
    else logger.info(event, "Postgres shadow read matched");
  }).catch((error) => logger.warn({ domain, operation, error: error.message }, "Postgres shadow read failed"));
};
