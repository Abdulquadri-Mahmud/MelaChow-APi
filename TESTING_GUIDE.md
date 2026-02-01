# Location-Based Filtering - Quick Test Guide

## Quick Test Commands

Use these commands to test the location-based filtering functionality:

### 1. Test Trending Foods (Authenticated User)

```bash
# With authentication (should filter by user's location)
curl -X GET "http://localhost:5000/api/user/trending" \
  -H "Cookie: token=YOUR_AUTH_TOKEN" \
  -H "Content-Type: application/json"

# Expected Response:
# {
#   "success": true,
#   "count": 10,
#   "trending": [...],
#   "location": {
#     "city": "Lagos",
#     "state": "Lagos"
#   }
# }
```

### 2. Test Trending Foods (Unauthenticated User)

```bash
# Without authentication (should show all results)
curl -X GET "http://localhost:5000/api/user/trending" \
  -H "Content-Type: application/json"

# Expected Response:
# {
#   "success": true,
#   "count": 10,
#   "trending": [...],
#   "location": {
#     "city": null,
#     "state": null
#   }
# }
```

### 3. Test Food Search (Authenticated User)

```bash
# Search with authentication
curl -X GET "http://localhost:5000/api/foods/search?q=rice" \
  -H "Cookie: token=YOUR_AUTH_TOKEN" \
  -H "Content-Type: application/json"

# Expected: Only foods from vendors in user's city/state
```

### 4. Test Food Search (Manual Location Override)

```bash
# Override user's location with query parameters
curl -X GET "http://localhost:5000/api/foods/search?q=rice&city=Abuja&state=FCT" \
  -H "Cookie: token=YOUR_AUTH_TOKEN" \
  -H "Content-Type: application/json"

# Expected: Only foods from Abuja, FCT (regardless of user's default location)
```

### 5. Test Autocomplete (Authenticated User)

```bash
# Autocomplete with authentication
curl -X GET "http://localhost:5000/api/foods/autocomplete?q=jol" \
  -H "Cookie: token=YOUR_AUTH_TOKEN" \
  -H "Content-Type: application/json"

# Expected Response:
# {
#   "success": true,
#   "count": 5,
#   "suggestions": [...],
#   "location": {
#     "city": "Lagos",
#     "state": "Lagos"
#   }
# }
```

### 6. Test Empty Results

```bash
# Search in location with no vendors
curl -X GET "http://localhost:5000/api/foods/search?q=pizza&city=NonExistentCity&state=NonExistentState" \
  -H "Content-Type: application/json"

# Expected Response:
# {
#   "success": true,
#   "message": "No vendors found in NonExistentCity NonExistentState",
#   "count": 0,
#   "data": [],
#   "vendors": []
# }
```

---

## Test Scenarios

### Scenario 1: Authenticated User with Address
**Setup**: User logged in with default address in Lagos, Lagos

1. Call `/api/user/trending`
   - ✅ Should return only foods from Lagos vendors
   - ✅ Response includes `location: { city: "Lagos", state: "Lagos" }`

2. Call `/api/foods/search?q=rice`
   - ✅ Should return only rice dishes from Lagos vendors
   - ✅ Response includes location info

3. Call `/api/foods/autocomplete?q=jol`
   - ✅ Should suggest only foods from Lagos vendors
   - ✅ Response includes location info

### Scenario 2: Unauthenticated User
**Setup**: No authentication token

1. Call `/api/user/trending`
   - ✅ Should return trending foods from all locations
   - ✅ Response includes `location: { city: null, state: null }`

2. Call `/api/foods/search?q=rice`
   - ✅ Should return rice dishes from all locations
   - ✅ No location filtering applied

### Scenario 3: Manual Location Override
**Setup**: User logged in, but manually selects different location

1. Call `/api/foods/search?q=rice&city=Abuja&state=FCT`
   - ✅ Should return only rice dishes from Abuja, FCT
   - ✅ User's default location is ignored
   - ✅ Response includes `location: { city: "Abuja", state: "FCT" }`

### Scenario 4: User with No Address
**Setup**: User logged in but has no addresses

1. Call `/api/user/trending`
   - ✅ Should return trending foods from all locations
   - ✅ No location filtering applied
   - ✅ Response includes `location: { city: null, state: null }`

---

## Verification Checklist

### Backend Verification
- [ ] `optionalAuth` middleware created
- [ ] `autocompleteFoods` filters by location
- [ ] `searchFoods` filters by location
- [ ] `getTrendingSearch` filters by location
- [ ] All endpoints return location info
- [ ] Empty results handled gracefully
- [ ] Query parameters override user location

### Route Verification
- [ ] `/api/foods/search` uses `optionalAuth`
- [ ] `/api/foods/autocomplete` uses `optionalAuth`
- [ ] `/api/user/trending` uses `optionalAuth`

### Response Verification
- [ ] All responses include `location` object
- [ ] Location has `city` and `state` properties
- [ ] Empty results include helpful message

---

## Common Issues & Solutions

### Issue 1: Location not filtering
**Symptom**: Results show foods from all locations even when authenticated

**Solutions**:
- Verify user has addresses in database
- Check that `optionalAuth` middleware is applied to route
- Ensure cookies are being sent with request (`credentials: 'include'`)
- Verify JWT token is valid

### Issue 2: No results returned
**Symptom**: Empty results even though foods exist

**Solutions**:
- Check if vendors exist in user's city/state
- Verify city/state spelling matches database exactly
- Check vendor `active`, `suspended`, and `deletedAt` status
- Ensure foods are marked as `available: true`

### Issue 3: Location always null
**Symptom**: `location` object always shows `null` values

**Solutions**:
- Verify user is authenticated
- Check user has at least one address
- Ensure address has `city` and `state` fields
- Check if default address is set

---

## Database Queries for Debugging

### Check User's Addresses
```javascript
db.users.findOne(
  { _id: ObjectId("USER_ID") },
  { addresses: 1 }
)
```

### Check Vendors in Location
```javascript
db.vendors.find({
  "address.city": /lagos/i,
  "address.state": /lagos/i,
  active: true,
  suspended: false,
  deletedAt: null
})
```

### Check Foods from Vendors
```javascript
db.foods.find({
  vendor: { $in: [VENDOR_IDS] },
  available: true
})
```

---

## Performance Considerations

### Current Implementation
- Each request queries user's addresses
- Vendor location filtering adds extra DB query
- No caching implemented

### Optimization Opportunities
1. **Cache user locations** in Redis (TTL: 1 hour)
2. **Index vendor addresses** for faster location queries
3. **Denormalize vendor location** on food documents
4. **Implement geospatial queries** for radius-based search

### Recommended Indexes
```javascript
// Vendor collection
db.vendors.createIndex({ "address.city": 1, "address.state": 1 })
db.vendors.createIndex({ active: 1, suspended: 1, deletedAt: 1 })

// Food collection
db.foods.createIndex({ vendor: 1, available: 1 })
db.foods.createIndex({ name: "text", tags: "text" })
```

---

## Next Steps

1. **Test all endpoints** using the commands above
2. **Verify database** has proper indexes
3. **Monitor performance** with location filtering
4. **Update frontend** to display location context
5. **Deploy to staging** for integration testing
6. **Collect user feedback** on location accuracy

---

## Support & Documentation

- **Session Summary**: `SESSION_SUMMARY.md`
- **Technical Details**: `LOCATION_FILTERING_UPDATE.md`
- **Frontend Guide**: `FRONTEND_LOCATION_INTEGRATION_GUIDE.md`
- **Middleware Code**: `middleware/optionalAuth.middleware.js`

---

## Status: ✅ Ready for Testing

All implementation complete. Ready for:
- Unit testing
- Integration testing
- Frontend integration
- Staging deployment
