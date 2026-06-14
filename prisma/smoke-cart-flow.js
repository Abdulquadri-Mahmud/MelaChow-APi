import "dotenv/config";
import prisma from "../config/prisma.js";
import { postgresCartRepository } from "../services/postgres/cart.repository.js";

const liveWriteEnabled = process.env.PRISMA_SMOKE_WRITE === "1";
const legacyId = (row) => row?.legacyMongoId || row?.id || null;

const findCandidate = async () => {
  const user = await prisma.user.findFirst({
    where: { legacyMongoId: { not: null } },
    orderBy: { createdAt: "asc" },
    select: { id: true, legacyMongoId: true, email: true },
  });
  if (!user) return null;

  const menuItem = await prisma.menuItem.findFirst({
    where: {
      isAvailable: true,
      isInStock: true,
      isArchived: false,
      vendor: { active: true, deletedAt: null },
      portions: { some: { isAvailable: true, isInStock: true } },
    },
    orderBy: { createdAt: "asc" },
    include: {
      vendor: { select: { id: true, legacyMongoId: true, storeName: true } },
      portions: {
        where: { isAvailable: true, isInStock: true },
        orderBy: [{ isDefault: "desc" }, { sortOrder: "asc" }],
        take: 1,
      },
    },
  });
  if (!menuItem || !menuItem.portions.length) return null;

  return {
    user,
    vendor: menuItem.vendor,
    item: menuItem,
    portion: menuItem.portions[0],
  };
};

const captureUserCartState = async (userId) => {
  const carts = await prisma.cart.findMany({
    where: { customerId: userId },
    include: {
      subCarts: {
        include: {
          lineItems: true,
        },
      },
    },
  });

  return carts;
};

const restoreUserCartState = async (userId, snapshot) => {
  await prisma.cartLineItem.deleteMany({
    where: {
      vendorSubCart: {
        cart: { customerId: userId },
      },
    },
  });
  await prisma.vendorSubCart.deleteMany({
    where: { cart: { customerId: userId } },
  });
  await prisma.cart.deleteMany({ where: { customerId: userId } });

  for (const cart of snapshot) {
    const { subCarts, ...cartData } = cart;
    await prisma.cart.create({ data: cartData });

    for (const subCart of subCarts) {
      const { lineItems, ...subCartData } = subCart;
      await prisma.vendorSubCart.create({ data: subCartData });

      for (const lineItem of lineItems) {
        await prisma.cartLineItem.create({ data: lineItem });
      }
    }
  }
};

const main = async () => {
  const candidate = await findCandidate();
  if (!candidate) {
    console.log(JSON.stringify({ ok: false, reason: "no_cart_candidate" }, null, 2));
    return;
  }

  const payload = {
    vendor_id: legacyId(candidate.vendor),
    menu_item_id: legacyId(candidate.item),
    portion_id: legacyId(candidate.portion),
    quantity: 1,
    selected_choices: [],
    special_instructions: "postgres cart smoke",
  };

  const summary = {
    user: legacyId(candidate.user),
    vendor: candidate.vendor.storeName,
    item: candidate.item.name,
    portion: candidate.portion.label,
    liveWriteEnabled,
  };

  if (!liveWriteEnabled) {
    console.log(JSON.stringify({ ok: true, dryRun: true, candidate: summary, payload }, null, 2));
    return;
  }

  const snapshot = await captureUserCartState(candidate.user.id);

  try {
    const addResult = await postgresCartRepository.addPortionItem(legacyId(candidate.user), payload);
    const cartAfterAdd = await postgresCartRepository.getCart(legacyId(candidate.user));
    const cartLineItemId =
      cartAfterAdd?.vendor_sub_carts?.[0]?.line_items?.[0]?._id ||
      addResult.lineItem._id;
    const removeResult = await postgresCartRepository.removeCartItem(legacyId(candidate.user), cartLineItemId);
    const cartAfterRemove = await postgresCartRepository.getCart(legacyId(candidate.user));

    console.log(JSON.stringify({
      ok: true,
      dryRun: false,
      candidate: summary,
      addedLineItem: addResult.lineItem._id,
      removedLineItem: cartLineItemId,
      cartAfterAdd: cartAfterAdd?.cart_summary,
      removeResult,
      cartAfterRemove: cartAfterRemove?.cart_summary || null,
    }, null, 2));
  } finally {
    await restoreUserCartState(candidate.user.id, snapshot);
    await prisma.$disconnect();
  }
};

main().catch(async (error) => {
  console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
  await prisma.$disconnect();
  process.exit(1);
});
