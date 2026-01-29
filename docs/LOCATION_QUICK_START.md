# Location System - Quick Start Guide

## 🚀 Quick Start for Admins

### Step 1: Create Initial States
```bash
POST /api/admin/locations/states
{
  "name": "Lagos"
}
```

### Step 2: Create Cities
```bash
POST /api/admin/locations/cities
{
  "name": "Ikeja",
  "stateId": "<lagos_state_id>"
}
```

### Step 3: Check Pending Location Requests
```bash
GET /api/admin/locations/location-requests
```

### Step 4: Approve Vendor with Location
```bash
PATCH /api/admin/vendors/approve?vendorId=<vendor_id>
{
  "state": "Lagos",
  "city": "Ikeja",
  "createLocation": false
}
```

---

## 🎯 Quick Start for Frontend

### Fetch Available Locations
```javascript
const response = await fetch('/api/user/locations');
const { locations } = await response.json();

// locations = [
//   {
//     state: "Lagos",
//     stateId: "...",
//     cities: [
//       { name: "Ikeja", cityId: "..." },
//       { name: "Lekki", cityId: "..." }
//     ]
//   }
// ]
```

### Populate Dropdowns
```javascript
// State dropdown
<select onChange={(e) => setSelectedState(e.target.value)}>
  {locations.map(loc => (
    <option key={loc.stateId} value={loc.stateId}>
      {loc.state}
    </option>
  ))}
</select>

// City dropdown (filtered by selected state)
<select>
  {selectedStateData?.cities.map(city => (
    <option key={city.cityId} value={city.cityId}>
      {city.name}
    </option>
  ))}
</select>
```

---

## 📋 Common Tasks

### View All States (Admin)
```bash
GET /api/admin/locations/states
```

### View All Cities for a State (Admin)
```bash
GET /api/admin/locations/cities?stateId=<state_id>
```

### Deactivate a Location
```bash
PATCH /api/admin/locations/cities/<city_id>/activate
{
  "isActive": false
}
```

### View Public States (User)
```bash
GET /api/locations/states
```

### View Public Cities (User)
```bash
GET /api/locations/cities?stateId=<state_id>
```

---

## ⚠️ Important Notes

1. **Never auto-create locations** - All locations must be admin-approved
2. **Vendors with unknown locations** are flagged as `locationStatus: "pending_review"`
3. **Public endpoints** only show active locations with approved restaurants
4. **Admin endpoints** show all locations (active and inactive)
5. **Backward compatibility** - Legacy string fields are preserved

---

## 🔍 Troubleshooting

### Vendor Registration Fails
- Check if state/city exist in database
- If not, vendor will be created with `locationStatus: "pending_review"`
- Admin must resolve during approval

### Location Not Showing in Public API
- Check if location is active (`isActive: true`)
- Check if there are approved vendors in that location
- Suspended/unverified vendors don't count

### Can't Approve Vendor
- If vendor has `locationStatus: "pending_review"`, you must provide state/city
- Set `createLocation: true` to create new locations during approval

---

## 📚 Full Documentation
See `docs/LOCATION_SYSTEM.md` for complete documentation.
