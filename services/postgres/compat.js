export const usePostgresReads = () => process.env.DB_READ_PROVIDER === "postgres";

export const usePostgresMenuReads = () => process.env.DB_MENU_READ_PROVIDER === "postgres";

export const usePostgresSearchReads = () => process.env.DB_SEARCH_READ_PROVIDER === "postgres";

export const usePostgresFoodsByLocationReads = () => process.env.DB_FOODS_BY_LOCATION_READ_PROVIDER === "postgres";

export const usePostgresRecommendationReads = () => process.env.DB_RECOMMENDATION_READ_PROVIDER === "postgres";

export const usePostgresPublicReviewReads = () => process.env.DB_PUBLIC_REVIEW_READ_PROVIDER === "postgres";

export const usePostgresReviewReads = () => process.env.DB_REVIEW_READ_PROVIDER === "postgres";

export const usePostgresCategoryMetricsReads = () => process.env.DB_CATEGORY_METRICS_READ_PROVIDER === "postgres";

export const usePostgresUserMetricsReads = () => process.env.DB_USER_METRICS_READ_PROVIDER === "postgres";

export const usePostgresVendorMetricsReads = () => process.env.DB_VENDOR_METRICS_READ_PROVIDER === "postgres";

export const usePostgresVendorOrderReads = () => process.env.DB_VENDOR_ORDER_READ_PROVIDER === "postgres";

export const usePostgresAdminOrderReads = () => process.env.DB_ADMIN_ORDER_READ_PROVIDER === "postgres";

export const usePostgresOrderStatusWrites = () => process.env.DB_ORDER_STATUS_WRITE_PROVIDER === "postgres";

export const usePostgresRiderAssignmentWrites = () => process.env.DB_RIDER_ASSIGNMENT_WRITE_PROVIDER === "postgres";

export const usePostgresAdminRiderReads = () => process.env.DB_ADMIN_RIDER_READ_PROVIDER === "postgres";

export const usePostgresPlatformConfigReads = () => process.env.DB_PLATFORM_CONFIG_READ_PROVIDER === "postgres";

export const usePostgresRiderReads = () => process.env.DB_RIDER_READ_PROVIDER === "postgres";

export const usePostgresWalletReads = () => process.env.DB_WALLET_READ_PROVIDER === "postgres";

export const usePostgresAdminFinanceReads = () => process.env.DB_ADMIN_FINANCE_READ_PROVIDER === "postgres";

export const usePostgresCartReads = () => process.env.DB_CART_READ_PROVIDER === "postgres";

export const usePostgresCartWrites = () => process.env.DB_CART_WRITE_PROVIDER === "postgres";

export const usePostgresOrderWrites = () => process.env.DB_ORDER_WRITE_PROVIDER === "postgres";

export const usePostgresPaymentWrites = () => process.env.DB_PAYMENT_WRITE_PROVIDER === "postgres";

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
