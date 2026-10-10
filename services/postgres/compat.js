const postgresMigrationEnabled = () =>
  String(process.env.POSTGRES_MIGRATION_ENABLED || "")
    .trim()
    .toLowerCase() === "true";

const providerIsPostgres = (key) =>
  String(process.env[key] || "").trim().toLowerCase() === "postgres";

// Once PostgreSQL is declared as the primary database, every migrated feature
// must read and write through its PostgreSQL repository. Feature-specific
// provider variables remain useful during a gradual migration when MongoDB is
// still the primary database.
const usesPostgres = (key) =>
  postgresMigrationEnabled() &&
  (providerIsPostgres("DB_PRIMARY_PROVIDER") || providerIsPostgres(key));

export const usePostgresReads = () => usesPostgres("DB_READ_PROVIDER");

export const usePostgresBannerReads = () => usesPostgres("DB_BANNER_READ_PROVIDER");

export const usePostgresMenuReads = () => usesPostgres("DB_MENU_READ_PROVIDER");
export const usePostgresMenuWrites = () => usesPostgres("DB_MENU_WRITE_PROVIDER");

// Prefer PostgreSQL for search once the migration is enabled, unless the
// deployment explicitly keeps search reads on Mongo during a staged rollout.
export const usePostgresSearchReads = () =>
  postgresMigrationEnabled() &&
  (providerIsPostgres("DB_PRIMARY_PROVIDER") ||
    !process.env.DB_SEARCH_READ_PROVIDER ||
    providerIsPostgres("DB_SEARCH_READ_PROVIDER"));

export const usePostgresFoodsByLocationReads = () => usesPostgres("DB_FOODS_BY_LOCATION_READ_PROVIDER");

export const usePostgresRecommendationReads = () => usesPostgres("DB_RECOMMENDATION_READ_PROVIDER");

export const usePostgresPublicReviewReads = () => usesPostgres("DB_PUBLIC_REVIEW_READ_PROVIDER");

export const usePostgresReviewReads = () => usesPostgres("DB_REVIEW_READ_PROVIDER");
export const usePostgresReviewWrites = () => usesPostgres("DB_REVIEW_WRITE_PROVIDER");
export const usePostgresNotificationWrites = () => usesPostgres("DB_NOTIFICATION_WRITE_PROVIDER");
export const usePostgresDiscountWrites = () => usesPostgres("DB_DISCOUNT_WRITE_PROVIDER");
export const usePostgresPromoWrites = () => usesPostgres("DB_PROMO_WRITE_PROVIDER");
export const usePostgresSupportWrites = () => usesPostgres("DB_SUPPORT_WRITE_PROVIDER");
export const usePostgresAdminWrites = () => usesPostgres("DB_ADMIN_WRITE_PROVIDER");

export const usePostgresCategoryMetricsReads = () => usesPostgres("DB_CATEGORY_METRICS_READ_PROVIDER");

export const usePostgresUserMetricsReads = () => usesPostgres("DB_USER_METRICS_READ_PROVIDER");

export const usePostgresVendorMetricsReads = () => usesPostgres("DB_VENDOR_METRICS_READ_PROVIDER");

export const usePostgresVendorOrderReads = () => usesPostgres("DB_VENDOR_ORDER_READ_PROVIDER");

export const usePostgresAdminOrderReads = () => usesPostgres("DB_ADMIN_ORDER_READ_PROVIDER");

export const usePostgresOrderStatusWrites = () => usesPostgres("DB_ORDER_STATUS_WRITE_PROVIDER");

export const usePostgresRiderAssignmentWrites = () => usesPostgres("DB_RIDER_ASSIGNMENT_WRITE_PROVIDER");

export const usePostgresAdminRiderReads = () => usesPostgres("DB_ADMIN_RIDER_READ_PROVIDER");

export const usePostgresPlatformConfigReads = () => usesPostgres("DB_PLATFORM_CONFIG_READ_PROVIDER");

export const usePostgresRiderReads = () => usesPostgres("DB_RIDER_READ_PROVIDER");

export const usePostgresWalletReads = () => usesPostgres("DB_WALLET_READ_PROVIDER");
export const usePostgresPayoutWrites = () => usesPostgres("DB_PAYOUT_WRITE_PROVIDER");

export const usePostgresAdminFinanceReads = () => usesPostgres("DB_ADMIN_FINANCE_READ_PROVIDER");

export const usePostgresCartReads = () => usesPostgres("DB_CART_READ_PROVIDER");

export const usePostgresCartWrites = () => usesPostgres("DB_CART_WRITE_PROVIDER");
export const usePostgresOrderWrites = () => usesPostgres("DB_ORDER_WRITE_PROVIDER");

export const usePostgresPaymentWrites = () => usesPostgres("DB_PAYMENT_WRITE_PROVIDER");

export const toMongoIdShape = (record) => {
  if (!record) return record;
  return {
    ...record,
    _id: record.id,
  };
};

export const toMongoStateShape = (state) => toMongoIdShape(state);

export const toMongoCityShape = (city) => {
  if (!city) return city;

  const shaped = toMongoIdShape(city);

  if (city.state) {
    shaped.stateId = {
      _id: city.state.id,
      id: city.state.id,
      name: city.state.name,
    };
  }

  return shaped;
};

export const toMongoCategoryShape = (category) => {
  if (!category) return category;

  const shaped = toMongoIdShape(category);
  shaped.parent = category.parentId || null;

  if (category.parent) {
    shaped.parent = {
      _id: category.parent.id,
      id: category.parent.id,
      name: category.parent.name,
    };
  }

  return shaped;
};

export const toMongoCategoryTreeShape = (category) => ({
  ...toMongoCategoryShape(category),
  children: (category.children || []).map((child) => toMongoCategoryShape(child)),
});
