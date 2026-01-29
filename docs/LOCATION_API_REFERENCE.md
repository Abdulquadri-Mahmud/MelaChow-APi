# Location System - API Reference

## Public Endpoints (No Auth Required)

### GET /api/locations/states
Get all active states with approved restaurants.

**Response:**
```json
{
  "success": true,
  "count": 2,
  "states": [
    {
      "_id": "67a1b2c3d4e5f6g7h8i9j0k1",
      "name": "Lagos",
      "isActive": true,
      "createdAt": "2026-01-28T00:00:00.000Z",
      "updatedAt": "2026-01-28T00:00:00.000Z"
    }
  ]
}
```

---

### GET /api/locations/cities?stateId={stateId}
Get all active cities in a state with approved restaurants.

**Query Params:**
- `stateId` (required) - State ID

**Response:**
```json
{
  "success": true,
  "count": 3,
  "state": "Lagos",
  "cities": [
    {
      "_id": "67a1b2c3d4e5f6g7h8i9j0k2",
      "name": "Ikeja",
      "stateId": "67a1b2c3d4e5f6g7h8i9j0k1",
      "isActive": true,
      "createdAt": "2026-01-28T00:00:00.000Z",
      "updatedAt": "2026-01-28T00:00:00.000Z"
    }
  ]
}
```

---

### GET /api/user/locations
Get states with their cities (for dropdown population).

**Response:**
```json
{
  "success": true,
  "message": "Fetched vendor locations successfully",
  "count": 2,
  "locations": [
    {
      "state": "Lagos",
      "stateId": "67a1b2c3d4e5f6g7h8i9j0k1",
      "cities": [
        {
          "name": "Ikeja",
          "cityId": "67a1b2c3d4e5f6g7h8i9j0k2"
        },
        {
          "name": "Lekki",
          "cityId": "67a1b2c3d4e5f6g7h8i9j0k3"
        }
      ]
    }
  ]
}
```

---

## Admin Endpoints (Require Admin Auth)

### POST /api/admin/locations/states
Create a new state.

**Headers:**
```
Cookie: adminToken=...
```

**Body:**
```json
{
  "name": "Lagos"
}
```

**Response:**
```json
{
  "success": true,
  "message": "State created successfully",
  "state": {
    "_id": "67a1b2c3d4e5f6g7h8i9j0k1",
    "name": "Lagos",
    "isActive": true,
    "createdAt": "2026-01-28T00:00:00.000Z",
    "updatedAt": "2026-01-28T00:00:00.000Z"
  }
}
```

**Errors:**
- `400` - State name is required
- `409` - State already exists

---

### POST /api/admin/locations/cities
Create a new city under a state.

**Headers:**
```
Cookie: adminToken=...
```

**Body:**
```json
{
  "name": "Ikeja",
  "stateId": "67a1b2c3d4e5f6g7h8i9j0k1"
}
```

**Response:**
```json
{
  "success": true,
  "message": "City created successfully",
  "city": {
    "_id": "67a1b2c3d4e5f6g7h8i9j0k2",
    "name": "Ikeja",
    "stateId": {
      "_id": "67a1b2c3d4e5f6g7h8i9j0k1",
      "name": "Lagos"
    },
    "isActive": true,
    "createdAt": "2026-01-28T00:00:00.000Z",
    "updatedAt": "2026-01-28T00:00:00.000Z"
  }
}
```

**Errors:**
- `400` - City name and stateId are required
- `404` - State not found
- `409` - City already exists in this state

---

### GET /api/admin/locations/states
Get all states (including inactive).

**Headers:**
```
Cookie: adminToken=...
```

**Response:**
```json
{
  "success": true,
  "count": 5,
  "states": [...]
}
```

---

### GET /api/admin/locations/cities?stateId={stateId}
Get all cities (including inactive). Optionally filter by state.

**Headers:**
```
Cookie: adminToken=...
```

**Query Params:**
- `stateId` (optional) - Filter by state

**Response:**
```json
{
  "success": true,
  "count": 10,
  "cities": [...]
}
```

---

### PATCH /api/admin/locations/states/:id/activate
Activate or deactivate a state.

**Headers:**
```
Cookie: adminToken=...
```

**URL Params:**
- `id` - State ID

**Body:**
```json
{
  "isActive": false
}
```

**Response:**
```json
{
  "success": true,
  "message": "State deactivated successfully",
  "state": {...}
}
```

**Errors:**
- `400` - isActive must be a boolean
- `404` - State not found

---

### PATCH /api/admin/locations/cities/:id/activate
Activate or deactivate a city.

**Headers:**
```
Cookie: adminToken=...
```

**URL Params:**
- `id` - City ID

**Body:**
```json
{
  "isActive": false
}
```

**Response:**
```json
{
  "success": true,
  "message": "City deactivated successfully",
  "city": {...}
}
```

**Errors:**
- `400` - isActive must be a boolean
- `404` - City not found

---

### GET /api/admin/locations/location-requests
Get all vendors with pending location requests.

**Headers:**
```
Cookie: adminToken=...
```

**Response:**
```json
{
  "success": true,
  "count": 5,
  "vendors": [
    {
      "_id": "67a1b2c3d4e5f6g7h8i9j0k4",
      "storeName": "Tasty Bites",
      "name": "John Doe",
      "email": "john@example.com",
      "phone": "+2348012345678",
      "requestedState": "Ogun",
      "requestedCity": "Abeokuta",
      "address": {
        "street": "123 Main St",
        "city": "Abeokuta",
        "state": "Ogun",
        "postalCode": "110001"
      },
      "createdAt": "2026-01-28T00:00:00.000Z"
    }
  ]
}
```

---

## Vendor Approval Endpoint (Updated)

### PATCH /api/admin/vendors/approve?vendorId={vendorId}
Approve a vendor (now handles location resolution).

**Headers:**
```
Cookie: adminToken=...
```

**Query Params:**
- `vendorId` (required) - Vendor ID

**Body (optional, required if vendor has pending location):**
```json
{
  "state": "Lagos",
  "city": "Ikeja",
  "createLocation": false
}
```

**Fields:**
- `state` (optional) - State name to assign (uses vendor's requestedState if not provided)
- `city` (optional) - City name to assign (uses vendor's requestedCity if not provided)
- `createLocation` (optional, default: false) - Whether to create state/city if they don't exist

**Response (Normal Approval):**
```json
{
  "success": true,
  "message": "Vendor approved successfully and notified via email",
  "vendor": {...}
}
```

**Response (Pending Location - Missing Data):**
```json
{
  "success": false,
  "message": "Vendor has pending location. Please provide state and city to approve.",
  "requestedState": "Ogun",
  "requestedCity": "Abeokuta"
}
```

**Response (Location Resolution Failed):**
```json
{
  "success": false,
  "message": "Location resolution failed: State 'Ogun' not found",
  "hint": "Set createLocation=true to create new state/city if they don't exist"
}
```

**Errors:**
- `400` - Vendor has pending location but state/city not provided
- `400` - Location resolution failed
- `404` - Vendor not found

---

## Vendor Registration Endpoint (Updated)

### POST /api/vendors
Create a new vendor (now validates location).

**Body:**
```json
{
  "storeName": "Tasty Bites",
  "name": "John Doe",
  "email": "john@example.com",
  "phone": "+2348012345678",
  "address": {
    "street": "123 Main St",
    "city": "Ikeja",
    "state": "Lagos",
    "postalCode": "100001"
  }
}
```

**Response (Location Exists):**
```json
{
  "success": true,
  "message": "Vendor account created successfully...",
  "data": {...},
  "locationPending": false
}
```

**Response (Location Doesn't Exist):**
```json
{
  "success": true,
  "message": "Vendor account created successfully. Your location is under review by our admin team...",
  "data": {...},
  "locationPending": true
}
```

**Note:** Vendor is created in both cases, but with different `locationStatus`:
- Location exists → `locationStatus: "approved"`, `stateId` and `cityId` assigned
- Location doesn't exist → `locationStatus: "pending_review"`, `requestedState` and `requestedCity` populated

---

## Error Responses

All endpoints follow this error format:

```json
{
  "success": false,
  "message": "Error message here",
  "error": "Detailed error (only in development)"
}
```

**Common HTTP Status Codes:**
- `200` - Success
- `201` - Created
- `400` - Bad Request (validation error)
- `401` - Unauthorized (missing/invalid auth)
- `403` - Forbidden (insufficient permissions)
- `404` - Not Found
- `409` - Conflict (duplicate entry)
- `500` - Internal Server Error

---

## Rate Limiting

All endpoints are subject to rate limiting:
- **Window:** 15 minutes
- **Max Requests:** 3000 per window

---

## Authentication

### Admin Endpoints
Require `adminToken` cookie set by admin login.

**How to authenticate:**
1. Login as admin: `POST /api/admin/login`
2. Cookie is automatically set
3. Include cookie in subsequent requests

### Public Endpoints
No authentication required.

---

## Best Practices

### For Frontend Developers
1. **Cache location data** - It doesn't change frequently
2. **Handle loading states** - API calls may take time
3. **Validate user input** - Check against fetched locations
4. **Show helpful errors** - Guide users to valid locations

### For Admin Users
1. **Create locations proactively** - Don't wait for vendor requests
2. **Review location requests regularly** - Check `/location-requests` daily
3. **Use createLocation carefully** - Only create valid, real locations
4. **Deactivate instead of delete** - Preserves historical data

---

## Examples

### Example 1: Populate Address Form
```javascript
// Fetch locations
const response = await fetch('/api/user/locations');
const { locations } = await response.json();

// Render state dropdown
const stateSelect = document.getElementById('state');
locations.forEach(loc => {
  const option = document.createElement('option');
  option.value = loc.stateId;
  option.textContent = loc.state;
  stateSelect.appendChild(option);
});

// When state changes, update city dropdown
stateSelect.addEventListener('change', (e) => {
  const selectedLoc = locations.find(l => l.stateId === e.target.value);
  const citySelect = document.getElementById('city');
  citySelect.innerHTML = '';
  
  selectedLoc.cities.forEach(city => {
    const option = document.createElement('option');
    option.value = city.cityId;
    option.textContent = city.name;
    citySelect.appendChild(option);
  });
});
```

### Example 2: Admin Creates Location
```javascript
// Create state
const stateRes = await fetch('/api/admin/locations/states', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  credentials: 'include',
  body: JSON.stringify({ name: 'Lagos' })
});
const { state } = await stateRes.json();

// Create city
const cityRes = await fetch('/api/admin/locations/cities', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  credentials: 'include',
  body: JSON.stringify({
    name: 'Ikeja',
    stateId: state._id
  })
});
```

### Example 3: Admin Approves Vendor with Location
```javascript
// Get pending location requests
const requestsRes = await fetch('/api/admin/locations/location-requests', {
  credentials: 'include'
});
const { vendors } = await requestsRes.json();

// Approve vendor with new location
const approveRes = await fetch(`/api/admin/vendors/approve?vendorId=${vendors[0]._id}`, {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json' },
  credentials: 'include',
  body: JSON.stringify({
    state: vendors[0].requestedState,
    city: vendors[0].requestedCity,
    createLocation: true  // Create the location
  })
});
```

---

## Changelog

### Version 1.0.0 (2026-01-28)
- Initial implementation
- Database-driven location system
- Admin location management
- Vendor registration integration
- Public location queries

---

For more information, see:
- `docs/LOCATION_SYSTEM.md` - Full documentation
- `docs/LOCATION_QUICK_START.md` - Quick start guide
- `docs/LOCATION_IMPLEMENTATION_SUMMARY.md` - Implementation summary
