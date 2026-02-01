# Location-Based Food Filtering Implementation

## Overview
Updated the search and trending food endpoints to filter results by the user's location (city and state). This ensures users only see foods from vendors operating in their area.

## Changes Made

### 1. **Search Food Controller** (`controller/search/searchFood.controller.js`)

#### `autocompleteFoods` Function
- **Added**: User location extraction from their default address
- **Added**: Location-based vendor filtering
- **Added**: Empty result handling with location message
- **Added**: Location info in response (`location: { city, state }`)

**Key Logic**:
```javascript
// Extract user's city and state from default address
if (req.user?._id) {
  const user = await User.findById(req.user._id).select("addresses");
  const defaultAddress = user.addresses.find(a => a.isDefault) || user.addresses[0];
  userCity = defaultAddress.city?.trim() || null;
  userState = defaultAddress.state?.trim() || null;
}

// Filter vendors by location
const vendorQuery = {
  storeName: { $regex: q, $options: "i" },
  ...(userCity && { "address.city": { $regex: userCity, $options: "i" } }),
  ...(userState && { "address.state": { $regex: userState, $options: "i" } })
};
```

#### `searchFoods` Function
- **Enhanced**: Vendor matching to include location filter when searching
- **Improved**: Consistency between text search and location filtering

**Key Logic**:
```javascript
// When searching with query text, also filter vendors by location
const vendorMatchQuery = {
  $or: [
    { storeName: { $regex: q, $options: "i" } },
    { storeSlug: { $regex: q, $options: "i" } },
    { storeDescription: { $regex: q, $options: "i" } },
  ],
};

// Add location filter
if (effectiveCity || effectiveState) {
  if (effectiveCity) vendorMatchQuery["address.city"] = { $regex: effectiveCity, $options: "i" };
  if (effectiveState) vendorMatchQuery["address.state"] = { $regex: effectiveState, $options: "i" };
}
```

### 2. **Trending Search Controller** (`controller/user/getTrendingSearch.controller.js`)

#### `getTrendingSearch` Function
- **Added**: User model import
- **Added**: Vendor model import
- **Added**: User location extraction from default address
- **Added**: Vendor filtering by location
- **Added**: Empty result handling with location message
- **Added**: Location info in response (`location: { city, state }`)

**Key Logic**:
```javascript
// Build vendor query with location filter
let vendorQuery = {
  active: true,
  suspended: false,
  deletedAt: null,
  ...(userCity && { "address.city": { $regex: userCity, $options: "i" } }),
  ...(userState && { "address.state": { $regex: userState, $options: "i" } })
};

// Find vendors in user's location
const vendors = await Vendor.find(vendorQuery).select("_id");
const vendorIds = vendors.map(v => v._id);

// Filter trending foods by vendor location
const trendingFoods = await Food.find({
  available: true,
  ...(vendorIds.length > 0 ? { vendor: { $in: vendorIds } } : {})
})
```

## How It Works

### Optional Authentication Middleware
Created a new `optionalAuth` middleware that:
- Attempts to read and verify the authentication token from cookies
- If a valid token is found, populates `req.user` with the authenticated user
- If no token or invalid token, allows the request to proceed without authentication
- Never rejects requests, making it perfect for endpoints that should work for both authenticated and unauthenticated users

**File**: `middleware/optionalAuth.middleware.js`

### User Location Detection
1. Check if user is authenticated (`req.user?._id`)
2. Fetch user's addresses from the database
3. Use the default address (or first address if no default)
4. Extract `city` and `state` from the address

### Location Filtering Flow
1. **Autocomplete**: Filters vendors by location before searching for foods
2. **Search**: Applies location filter to both vendor search and food results
3. **Trending**: Finds vendors in user's location, then shows trending foods from those vendors

### Fallback Behavior
- If user is not authenticated or has no addresses, no location filter is applied
- Query parameters (`city`, `state`) can override user's default location
- Empty results return a helpful message indicating the location

## API Response Changes

All endpoints now include location information in the response:

```json
{
  "success": true,
  "count": 10,
  "data": [...],
  "location": {
    "city": "Lagos",
    "state": "Lagos"
  }
}
```

## Benefits

1. **Better User Experience**: Users only see relevant foods available in their area
2. **Reduced Confusion**: No more seeing foods from vendors in other cities/states
3. **Accurate Results**: Search and trending results are location-aware
4. **Consistent Behavior**: All food discovery endpoints now filter by location

## Testing Recommendations

1. Test with authenticated users who have addresses
2. Test with unauthenticated users (should show all results)
3. Test with query parameters overriding user location
4. Test edge cases (no vendors in location, no addresses, etc.)
5. Verify location info is returned in all responses

## Notes

- Location matching uses case-insensitive regex for flexibility
- The existing `getFoodsByLocation` controller remains unchanged
- All changes are backward compatible
- Query parameters (`city`, `state`) still work and override user's default location
