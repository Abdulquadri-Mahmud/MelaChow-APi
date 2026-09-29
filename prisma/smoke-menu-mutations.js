import "dotenv/config";
import prisma from "../config/prisma.js";
import { menuMutationRepository as repo } from "../services/postgres/menuMutation.repository.js";

let section, item, combo, template, duplicate;
try {
  const vendor = await prisma.vendor.findFirst({ where: { verified: true }, select: { id: true, legacyMongoId: true } });
  const category = await prisma.category.findFirst({ where: { isActive: true, children: { none: {} } }, select: { id: true, legacyMongoId: true } });
  if (!vendor || !category) throw new Error("A vendor and leaf category are required");
  const owner = vendor.legacyMongoId || vendor.id, categoryId = category.legacyMongoId || category.id;
  section = await repo.createSection(owner, { name: "PG Smoke Section", sort_order: 999 });
  item = await repo.createItem(owner, { platform_category_id: categoryId, vendor_section_id: section._id, name: "PG Smoke Item", item_type: "FOOD", dietary_type: "mixed" });
  const portion = await repo.createPortion(owner, item._id, { label: "Regular", price: 150000, is_default: true, track_stock: true, stock_quantity: 5 });
  const group = await repo.createGroup(owner, item._id, { name: "Smoke options", min_selections: 0, max_selections: 1 });
  const option = await repo.createOption(owner, group._id, { label: "Extra", price_modifier_naira: 100, track_stock: true, stock_quantity: 3 });
  combo = await repo.createCombo(owner, { platform_category_id: categoryId, vendor_section_id: section._id, name: "PG Smoke Combo", price_naira: 2000, choice_groups: [] });
  template = await repo.createTemplate(owner, { name: "PG Smoke Template", min_selections: 0, max_selections: 1, options: [{ label: "Template option", price_modifier: 5000, track_stock: true, stock_quantity: 4 }] });
  template = await repo.updateTemplate(owner, template._id, { name: "PG Smoke Template Updated", min_selections: 0, max_selections: 1, options: [{ label: "Template option updated", price_modifier: 6000, track_stock: true, stock_quantity: 3 }] });
  duplicate = await repo.duplicateTemplate(owner, template._id);
  duplicate = await repo.archiveTemplate(owner, duplicate._id, true);
  const updatedItem = await repo.updateItem(owner, item._id, { name: "PG Smoke Item Updated" });
  const updatedPortion = await repo.updatePortion(owner, item._id, portion._id, { stock_quantity: 4 });
  const updatedOption = await repo.updateOption(owner, option._id, { stock_quantity: 2 });
  const updatedCombo = await repo.updateCombo(owner, combo._id, { price_naira: 2100 });
  if (updatedItem.name !== "PG Smoke Item Updated" || updatedPortion.stock_quantity !== 4 || updatedOption.stock_quantity !== 2 || updatedCombo.price_naira !== 2100 || template.name !== "PG Smoke Template Updated" || !duplicate.is_archived) throw new Error("Mutation verification failed");
  await repo.deleteOption(owner, option._id);
  await repo.deleteGroup(owner, item._id, group._id);
  await repo.deletePortion(owner, item._id, portion._id);
  await repo.deleteItem(owner, item._id); item = null;
  await prisma.comboItem.delete({ where: { id: combo.id } }); combo = null;
  await repo.deleteSection(owner, section._id); section = null;
  await prisma.choiceGroupTemplate.delete({ where: { id: duplicate.id } }); duplicate = null;
  await prisma.choiceGroupTemplate.delete({ where: { id: template.id } }); template = null;
  console.log(JSON.stringify({ ok: true, operations: ["section CRUD", "item CRUD", "portion CRUD", "choice CRUD", "combo CRUD", "template CRUD"] }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
  process.exitCode = 1;
} finally {
  if (item?.id) await prisma.menuItem.deleteMany({ where: { id: item.id } }).catch(() => {});
  if (combo?.id) await prisma.comboItem.deleteMany({ where: { id: combo.id } }).catch(() => {});
  if (section?.id) await prisma.vendorMenuSection.deleteMany({ where: { id: section.id } }).catch(() => {});
  if (duplicate?.id) await prisma.choiceGroupTemplate.deleteMany({ where: { id: duplicate.id } }).catch(() => {});
  if (template?.id) await prisma.choiceGroupTemplate.deleteMany({ where: { id: template.id } }).catch(() => {});
  await prisma.$disconnect();
}
