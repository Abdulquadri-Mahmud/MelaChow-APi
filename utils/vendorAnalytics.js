const COMPLETED_STATUSES = new Set(["completed", "delivered"]);
const CANCELLED_STATUSES = new Set(["cancelled", "failed", "refunded"]);
const POST_ACCEPT_STATUSES = new Set([
  "accepted",
  "preparing",
  "ready_for_pickup",
  "ready",
  "rider_assigned",
  "out_for_delivery",
  "delivered",
  "completed",
]);

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function toDayKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function computeDelta(current, previous) {
  if (previous <= 0) {
    return current > 0
      ? { value: null, direction: "new", label: "New activity" }
      : { value: 0, direction: "flat", label: "0%" };
  }
  const pct = Math.round(((current - previous) / previous) * 1000) / 10;
  return {
    value: pct,
    direction: pct > 0 ? "up" : pct < 0 ? "down" : "flat",
    label: `${pct > 0 ? "+" : ""}${pct}%`,
  };
}

function getOrderRevenueNaira(order) {
  if (!order) return 0;
  if (order.vendorTotal != null && Number.isFinite(Number(order.vendorTotal))) {
    return Number(order.vendorTotal);
  }
  const items = Array.isArray(order.items) ? order.items : [];
  return items.reduce((sum, item) => {
    const qty = Math.max(1, Number(item?.quantity) || 1);
    const val =
      Number(item?.vendorEarning) ||
      Number(item?.metadata?.pricing?.final_unit_naira) * qty ||
      Number(item?.price) * qty ||
      Number(item?.originalPrice) * qty ||
      0;
    return sum + (Number.isFinite(val) ? val : 0);
  }, 0);
}

function extractPrepDurationMinutes(order) {
  const statusLog = Array.isArray(order?.userOrderId?.statusLog)
    ? order.userOrderId.statusLog
    : Array.isArray(order?.statusLog)
      ? order.statusLog
      : [];

  if (!statusLog.length) return null;

  const sorted = [...statusLog]
    .filter((entry) => entry && entry.timestamp)
    .map((entry) => ({
      status: String(entry.status || "").toLowerCase(),
      ts: new Date(entry.timestamp).getTime(),
    }))
    .filter((entry) => !Number.isNaN(entry.ts))
    .sort((a, b) => a.ts - b.ts);

  const readyEntry = sorted.find((e) => e.status === "ready_for_pickup" || e.status === "ready");
  if (!readyEntry) return null;

  const startEntry =
    sorted.find((e) => e.status === "accepted") ||
    sorted.find((e) => e.status === "preparing") ||
    (order?.createdAt ? { ts: new Date(order.createdAt).getTime() } : null);

  if (!startEntry || Number.isNaN(startEntry.ts)) return null;
  const diffMin = (readyEntry.ts - startEntry.ts) / 60000;
  // Filter outliers (< 1 min or > 4 hours) so anomalous admin overrides don't skew averages
  if (diffMin < 1 || diffMin > 240) return null;
  return Math.round(diffMin * 10) / 10;
}

function wasOrderEverAccepted(order) {
  const st = String(order?.orderStatus || order?.status || "").toLowerCase();
  if (POST_ACCEPT_STATUSES.has(st)) return true;

  const statusLog = Array.isArray(order?.userOrderId?.statusLog)
    ? order.userOrderId.statusLog
    : Array.isArray(order?.statusLog)
      ? order.statusLog
      : [];

  return statusLog.some((entry) => POST_ACCEPT_STATUSES.has(String(entry?.status || "").toLowerCase()));
}

export function computeVendorAnalytics({
  vendor = null,
  orders = [],
  menuItems = [],
  reviews = [],
  timeframe = "30d",
} = {}) {
  const safeOrders = Array.isArray(orders) ? orders : [];
  const safeMenu = Array.isArray(menuItems) ? menuItems : [];
  const safeReviews = Array.isArray(reviews) ? reviews : [];

  const tfMap = {
    today: { id: "today", label: "Today", days: 1 },
    "7d": { id: "7d", label: "Last 7 Days", days: 7 },
    "30d": { id: "30d", label: "Last 30 Days", days: 30 },
    "90d": { id: "90d", label: "Last 90 Days", days: 90 },
    all: { id: "all", label: "All Time", days: null },
  };
  const tf = tfMap[timeframe] || tfMap["30d"];

  const now = new Date();
  const todayStart = startOfDay(now);
  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);

  const weekStart = new Date(todayStart);
  weekStart.setDate(weekStart.getDate() - 6);
  const prevWeekStart = new Date(weekStart);
  prevWeekStart.setDate(prevWeekStart.getDate() - 7);

  const monthStart = new Date(todayStart);
  monthStart.setDate(monthStart.getDate() - 29);
  const prevMonthStart = new Date(monthStart);
  prevMonthStart.setDate(prevMonthStart.getDate() - 30);

  const periodStart = tf.days ? new Date(todayStart.getTime() - (tf.days - 1) * 86400000) : null;
  const prevPeriodStart = tf.days ? new Date(periodStart.getTime() - tf.days * 86400000) : null;

  // Sales windows (always computed regardless of active timeframe filter)
  let dailySales = 0;
  let dailyOrders = 0;
  let yesterdaySales = 0;

  let weeklySales = 0;
  let weeklyOrders = 0;
  let prevWeeklySales = 0;

  let monthlySales = 0;
  let monthlyOrders = 0;
  let prevMonthlySales = 0;

  // Active timeframe metrics
  let periodRevenue = 0;
  let periodCompleted = 0;
  let periodCancelled = 0;
  let periodCancelledValue = 0;
  let periodAccepted = 0;
  let periodDeclinedBeforeAccept = 0;
  let periodPending = 0;
  let periodTotalReceived = 0;

  let prevPeriodRevenue = 0;
  let prevPeriodCompleted = 0;

  let allTimeCompleted = 0;
  let allTimeRevenue = 0;
  let allTimeCancelled = 0;

  const prepDurations = [];
  const periodCompletedOrders = [];

  for (const order of safeOrders) {
    const st = String(order?.orderStatus || order?.status || "").toLowerCase();
    const createdAt = order?.createdAt ? new Date(order.createdAt) : null;
    const validDate = createdAt && !Number.isNaN(createdAt.getTime());
    const revenue = getOrderRevenueNaira(order);

    const isCompleted = COMPLETED_STATUSES.has(st);
    const isCancelled = CANCELLED_STATUSES.has(st);

    if (isCompleted) {
      allTimeCompleted += 1;
      allTimeRevenue += revenue;

      if (validDate) {
        if (createdAt >= todayStart) {
          dailySales += revenue;
          dailyOrders += 1;
        } else if (createdAt >= yesterdayStart && createdAt < todayStart) {
          yesterdaySales += revenue;
        }

        if (createdAt >= weekStart) {
          weeklySales += revenue;
          weeklyOrders += 1;
        } else if (createdAt >= prevWeekStart && createdAt < weekStart) {
          prevWeeklySales += revenue;
        }

        if (createdAt >= monthStart) {
          monthlySales += revenue;
          monthlyOrders += 1;
        } else if (createdAt >= prevMonthStart && createdAt < monthStart) {
          prevMonthlySales += revenue;
        }
      }
    } else if (isCancelled) {
      allTimeCancelled += 1;
    }

    const inPeriod = !periodStart || (validDate && createdAt >= periodStart);
    const inPrevPeriod =
      Boolean(prevPeriodStart && periodStart && validDate) &&
      createdAt >= prevPeriodStart &&
      createdAt < periodStart;

    if (inPeriod) {
      periodTotalReceived += 1;
      const accepted = wasOrderEverAccepted(order);
      if (st === "pending") {
        periodPending += 1;
      } else if (accepted) {
        periodAccepted += 1;
      } else if (isCancelled) {
        periodDeclinedBeforeAccept += 1;
      }

      if (isCompleted) {
        periodCompleted += 1;
        periodRevenue += revenue;
        periodCompletedOrders.push(order);
      } else if (isCancelled) {
        periodCancelled += 1;
        periodCancelledValue += revenue;
      }

      const prepMin = extractPrepDurationMinutes(order);
      if (prepMin != null) prepDurations.push(prepMin);
    } else if (inPrevPeriod && isCompleted) {
      prevPeriodCompleted += 1;
      prevPeriodRevenue += revenue;
    }
  }

  // Average Order Value
  const avgOrderValue = periodCompleted > 0 ? Math.round(periodRevenue / periodCompleted) : 0;
  const prevAvgOrderValue = prevPeriodCompleted > 0 ? Math.round(prevPeriodRevenue / prevPeriodCompleted) : 0;

  // Acceptance rate = accepted / (accepted + declinedBeforeAccept)
  const acceptanceDenominator = periodAccepted + periodDeclinedBeforeAccept;
  const orderAcceptanceRate =
    acceptanceDenominator > 0
      ? Math.round((periodAccepted / acceptanceDenominator) * 1000) / 10
      : null;

  // Cancellation rate = cancelled / (completed + cancelled)
  const finalized = periodCompleted + periodCancelled;
  const cancellationRate =
    finalized > 0 ? Math.round((periodCancelled / finalized) * 1000) / 10 : 0;

  // Prep time metrics
  const targetPrepMinutes = Number(vendor?.openingHours?.availability?.basePrepTimeMinutes || 25);
  const avgPrepTimeMinutes =
    prepDurations.length > 0
      ? Math.round((prepDurations.reduce((a, b) => a + b, 0) / prepDurations.length) * 10) / 10
      : null;
  const fastestPrepMinutes = prepDurations.length > 0 ? Math.min(...prepDurations) : null;
  const slowestPrepMinutes = prepDurations.length > 0 ? Math.max(...prepDurations) : null;
  const onTimePrepCount = prepDurations.filter((m) => m <= targetPrepMinutes).length;
  const onTimePrepRate =
    prepDurations.length > 0 ? Math.round((onTimePrepCount / prepDurations.length) * 100) : null;

  // Daily trend series (up to 30 days for chart readability, or 7 days for 7d)
  const trendDays = tf.id === "today" ? 1 : tf.id === "7d" ? 7 : 30;
  const trendStart = new Date(todayStart);
  trendStart.setDate(todayStart.getDate() - (trendDays - 1));
  const dailySeries = [];
  const seriesMap = new Map();
  for (let i = 0; i < trendDays; i += 1) {
    const d = new Date(trendStart);
    d.setDate(trendStart.getDate() + i);
    const key = toDayKey(d);
    const entry = {
      key,
      label:
        trendDays <= 7
          ? d.toLocaleDateString("en-NG", { weekday: "short" })
          : d.toLocaleDateString("en-NG", { month: "short", day: "numeric" }),
      fullDate: d.toLocaleDateString("en-NG", { weekday: "short", month: "short", day: "numeric" }),
      revenue: 0,
      orders: 0,
      cancelled: 0,
    };
    dailySeries.push(entry);
    seriesMap.set(key, entry);
  }

  for (const order of safeOrders) {
    if (!order?.createdAt) continue;
    const d = new Date(order.createdAt);
    if (Number.isNaN(d.getTime()) || d < trendStart) continue;
    const bucket = seriesMap.get(toDayKey(d));
    if (!bucket) continue;
    const st = String(order?.orderStatus || order?.status || "").toLowerCase();
    if (COMPLETED_STATUSES.has(st)) {
      bucket.revenue += getOrderRevenueNaira(order);
      bucket.orders += 1;
    } else if (CANCELLED_STATUSES.has(st)) {
      bucket.cancelled += 1;
    }
  }

  // Meal performance: Best-selling AND Least-selling (including 0-sale active menu items!)
  const activeMenuItems = safeMenu.filter((item) => item && !item.is_archived && !item.isArchived);
  const mealMap = new Map();

  for (const item of activeMenuItems) {
    const id = String(item._id || item.id || "");
    if (!id) continue;
    const minPrice =
      item?.portions?.min_price_naira ??
      (Array.isArray(item?.portions) && item.portions[0]
        ? Number(item.portions[0].price_naira ?? item.portions[0].price / 100)
        : 0);
    mealMap.set(id, {
      id,
      name: item.name || "Menu item",
      image: item.image_url || item.imageUrl || item.image || "",
      price: Number(minPrice) || 0,
      isAvailable: item.is_available !== false && item.isAvailable !== false,
      sold: 0,
      revenue: 0,
      orderAppearances: 0,
      onMenu: true,
    });
  }

  for (const order of periodCompletedOrders) {
    const items = Array.isArray(order.items) ? order.items : [];
    const seenInOrder = new Set();
    for (const raw of items) {
      if (!raw) continue;
      const rawId =
        typeof raw.foodId === "object" && raw.foodId
          ? String(raw.foodId._id || raw.foodId.id || "")
          : String(raw.foodId || raw.menuItemId || raw.variantId || raw._id || "");
      const name = raw.name || (typeof raw.foodId === "object" ? raw.foodId?.name : "") || "Menu item";
      const key = (rawId && mealMap.has(rawId)) ? rawId : (rawId || name.toLowerCase());
      const qty = Math.max(1, Number(raw.quantity) || 1);
      const lineRevenue =
        Number(raw.vendorEarning) ||
        Number(raw.metadata?.pricing?.final_unit_naira) * qty ||
        Number(raw.price) * qty ||
        Number(raw.originalPrice) * qty ||
        0;

      const existing = mealMap.get(key) || {
        id: rawId || key,
        name,
        image: raw.image_url || raw.image || "",
        price: qty > 0 ? Math.round((Number.isFinite(lineRevenue) ? lineRevenue : 0) / qty) : 0,
        isAvailable: true,
        sold: 0,
        revenue: 0,
        orderAppearances: 0,
        onMenu: false,
      };
      existing.sold += qty;
      existing.revenue += Number.isFinite(lineRevenue) ? lineRevenue : 0;
      if (!seenInOrder.has(key)) {
        existing.orderAppearances += 1;
        seenInOrder.add(key);
      }
      mealMap.set(key, existing);
    }
  }

  const allMealStats = [...mealMap.values()];
  const soldMeals = allMealStats
    .filter((m) => m.sold > 0)
    .sort((a, b) => b.sold - a.sold || b.revenue - a.revenue);
  const topSoldMax = soldMeals[0]?.sold || 1;
  const bestSellingMeals = soldMeals.slice(0, 8).map((m) => ({
    ...m,
    sharePct: Math.max(6, Math.round((m.sold / topSoldMax) * 100)),
  }));

  const bestIds = new Set(bestSellingMeals.slice(0, 3).map((m) => m.id));
  const leastCandidates = allMealStats
    .filter((m) => m.onMenu || m.sold > 0)
    .sort((a, b) => a.sold - b.sold || a.revenue - b.revenue);
  const leastSellingMeals = (
    leastCandidates.length > 5
      ? leastCandidates.filter((m) => !bestIds.has(m.id))
      : leastCandidates
  ).slice(0, 8);

  // Customer ratings distribution
  const distribution = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
  let ratingSum = 0;
  let validReviewCount = 0;
  for (const rev of safeReviews) {
    const r = Math.round(Number(rev?.rating || 0));
    if (r >= 1 && r <= 5) {
      distribution[r] += 1;
      ratingSum += Number(rev.rating);
      validReviewCount += 1;
    }
  }
  const averageRating =
    validReviewCount > 0
      ? Math.round((ratingSum / validReviewCount) * 10) / 10
      : Number(vendor?.rating || 0);
  const totalReviews = validReviewCount > 0 ? validReviewCount : Number(vendor?.ratingCount || 0);
  const positiveReviews = distribution[5] + distribution[4];
  const positivePct =
    validReviewCount > 0 ? Math.round((positiveReviews / validReviewCount) * 100) : null;

  return {
    timeframe: tf,
    sales: {
      daily: {
        revenue: dailySales,
        orders: dailyOrders,
        previousRevenue: yesterdaySales,
        delta: computeDelta(dailySales, yesterdaySales),
      },
      weekly: {
        revenue: weeklySales,
        orders: weeklyOrders,
        previousRevenue: prevWeeklySales,
        delta: computeDelta(weeklySales, prevWeeklySales),
      },
      monthly: {
        revenue: monthlySales,
        orders: monthlyOrders,
        previousRevenue: prevMonthlySales,
        delta: computeDelta(monthlySales, prevMonthlySales),
      },
      period: {
        revenue: periodRevenue,
        previousRevenue: prevPeriodRevenue,
        delta: computeDelta(periodRevenue, prevPeriodRevenue),
      },
      allTimeRevenue,
    },
    orders: {
      totalCompleted: periodCompleted,
      allTimeCompleted,
      previousCompleted: prevPeriodCompleted,
      completedDelta: computeDelta(periodCompleted, prevPeriodCompleted),
      avgOrderValue,
      previousAvgOrderValue: prevAvgOrderValue,
      aovDelta: computeDelta(avgOrderValue, prevAvgOrderValue),
      cancelled: periodCancelled,
      allTimeCancelled,
      cancellationRate,
      cancelledValueLost: periodCancelledValue,
      acceptanceRate: orderAcceptanceRate,
      acceptedCount: periodAccepted,
      declinedBeforeAcceptCount: periodDeclinedBeforeAccept,
      pendingCount: periodPending,
      totalReceived: periodTotalReceived,
    },
    operations: {
      avgPrepTimeMinutes,
      fastestPrepMinutes,
      slowestPrepMinutes,
      prepSampleCount: prepDurations.length,
      targetPrepMinutes,
      onTimePrepRate,
    },
    meals: {
      bestSelling: bestSellingMeals,
      leastSelling: leastSellingMeals,
      activeMenuCount: activeMenuItems.length,
      zeroSaleCount: activeMenuItems.filter((item) => {
        const id = String(item._id || item.id || "");
        return (mealMap.get(id)?.sold || 0) === 0;
      }).length,
    },
    ratings: {
      average: averageRating,
      totalReviews,
      positivePct,
      distribution,
    },
    dailySeries,
  };
}
