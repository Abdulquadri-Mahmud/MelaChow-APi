# Frontend Integration Guide: Location-Based Food Filtering

## Overview
The backend now filters search and trending food results by the user's location (city and state from their default address). This guide explains how to integrate these changes in the frontend.

---

## What Changed?

### API Endpoints Updated
1. **`GET /api/foods/search`** - Now location-aware
2. **`GET /api/foods/autocomplete`** - Now location-aware
3. **`GET /api/user/trending`** - Now location-aware

### New Response Format
All endpoints now include location information:

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

---

## How It Works

### For Authenticated Users
- **Automatic location filtering** based on their default address
- Results only show foods from vendors in their city/state
- No code changes needed - works automatically with existing auth cookies

### For Unauthenticated Users
- **No location filtering** - shows all results
- Same behavior as before
- Can manually specify location via query parameters

---

## Frontend Implementation

### 1. **Search Component**

#### Before (No changes needed to request):
```javascript
const searchFoods = async (query) => {
  const response = await fetch(`/api/foods/search?q=${query}`, {
    credentials: 'include' // Important: Include cookies
  });
  const data = await response.json();
  return data;
};
```

#### After (Optional: Display location context):
```javascript
const searchFoods = async (query) => {
  const response = await fetch(`/api/foods/search?q=${query}`, {
    credentials: 'include'
  });
  const data = await response.json();
  
  // New: Display location context to user
  if (data.location?.city && data.location?.state) {
    console.log(`Showing results for ${data.location.city}, ${data.location.state}`);
  }
  
  return data;
};
```

### 2. **Autocomplete Component**

```javascript
const autocomplete = async (query) => {
  const response = await fetch(`/api/foods/autocomplete?q=${query}`, {
    credentials: 'include'
  });
  const data = await response.json();
  
  // Optional: Show location in autocomplete dropdown
  if (data.location?.city) {
    // Display: "Results in Lagos, Lagos"
  }
  
  return data.suggestions;
};
```

### 3. **Trending Foods Component**

```javascript
const getTrendingFoods = async () => {
  const response = await fetch('/api/user/trending', {
    credentials: 'include'
  });
  const data = await response.json();
  
  // Optional: Show "Trending in [City]" header
  if (data.location?.city) {
    // Display: "Trending in Lagos"
  }
  
  return data.trending;
};
```

---

## Manual Location Override

Users can still manually select a different location:

```javascript
const searchInLocation = async (query, city, state) => {
  const params = new URLSearchParams({
    q: query,
    city: city,
    state: state
  });
  
  const response = await fetch(`/api/foods/search?${params}`, {
    credentials: 'include'
  });
  const data = await response.json();
  return data;
};
```

---

## UI/UX Recommendations

### 1. **Show Location Context**
Display the current location being filtered:

```jsx
{data.location?.city && (
  <div className="location-badge">
    📍 Showing results in {data.location.city}, {data.location.state}
  </div>
)}
```

### 2. **Empty State Handling**
When no results found in user's location:

```jsx
{data.count === 0 && data.message && (
  <div className="empty-state">
    <p>{data.message}</p>
    <button onClick={() => searchAllLocations()}>
      Search in all locations
    </button>
  </div>
)}
```

### 3. **Location Selector**
Allow users to change location:

```jsx
<LocationSelector 
  currentCity={data.location?.city}
  currentState={data.location?.state}
  onChange={(city, state) => searchInLocation(query, city, state)}
/>
```

### 4. **Trending Section Header**
Make it clear that trending is location-specific:

```jsx
<h2>
  {data.location?.city 
    ? `Trending in ${data.location.city}` 
    : 'Trending Foods'}
</h2>
```

---

## Important Notes

### ✅ **Do's**
- Always include `credentials: 'include'` in fetch requests
- Display location context to users
- Handle empty results gracefully
- Provide option to search in other locations

### ❌ **Don'ts**
- Don't assume location will always be present
- Don't break existing functionality
- Don't remove query parameter support
- Don't cache location-filtered results too aggressively

---

## Testing Checklist

- [ ] Test search with authenticated user
- [ ] Test search with unauthenticated user
- [ ] Test autocomplete with location
- [ ] Test trending foods with location
- [ ] Test manual location override
- [ ] Test empty results handling
- [ ] Test location display in UI
- [ ] Test with user who has no address
- [ ] Test with user who has multiple addresses

---

## Example: Complete Search Component

```jsx
import { useState, useEffect } from 'react';

const FoodSearch = () => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [location, setLocation] = useState(null);
  const [loading, setLoading] = useState(false);

  const searchFoods = async (searchQuery, city = null, state = null) => {
    setLoading(true);
    
    const params = new URLSearchParams({ q: searchQuery });
    if (city) params.append('city', city);
    if (state) params.append('state', state);
    
    try {
      const response = await fetch(`/api/foods/search?${params}`, {
        credentials: 'include'
      });
      const data = await response.json();
      
      setResults(data.data || []);
      setLocation(data.location);
    } catch (error) {
      console.error('Search failed:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="food-search">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search for foods..."
      />
      <button onClick={() => searchFoods(query)}>Search</button>
      
      {location?.city && (
        <div className="location-badge">
          📍 {location.city}, {location.state}
        </div>
      )}
      
      {loading ? (
        <div>Loading...</div>
      ) : results.length > 0 ? (
        <div className="results">
          {results.map(food => (
            <FoodCard key={food._id} food={food} />
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <p>No results found in your area</p>
          <button onClick={() => searchFoods(query, null, null)}>
            Search everywhere
          </button>
        </div>
      )}
    </div>
  );
};
```

---

## API Response Examples

### Search Response
```json
{
  "success": true,
  "city": "Lagos",
  "state": "Lagos",
  "count": 15,
  "total": 15,
  "currentPage": 1,
  "totalPages": 1,
  "data": [
    {
      "_id": "...",
      "name": "Jollof Rice",
      "price": 2500,
      "vendor": {
        "storeName": "Mama's Kitchen",
        "address": {
          "city": "Lagos",
          "state": "Lagos"
        }
      }
    }
  ],
  "vendors": [],
  "location": {
    "city": "Lagos",
    "state": "Lagos"
  }
}
```

### Autocomplete Response
```json
{
  "success": true,
  "count": 5,
  "suggestions": [
    {
      "name": "Jollof Rice",
      "slug": "jollof-rice",
      "vendorName": "Mama's Kitchen",
      "price": 2500,
      "image": "https://..."
    }
  ],
  "location": {
    "city": "Lagos",
    "state": "Lagos"
  }
}
```

### Trending Response
```json
{
  "success": true,
  "count": 10,
  "trending": [
    {
      "_id": "...",
      "name": "Fried Rice",
      "price": 3000,
      "rating": 4.5,
      "ratingCount": 120,
      "restaurant": {
        "storeName": "Tasty Bites",
        "city": "Lagos",
        "state": "Lagos"
      }
    }
  ],
  "location": {
    "city": "Lagos",
    "state": "Lagos"
  }
}
```

---

## Support

For questions or issues, contact the backend team or refer to:
- `SESSION_SUMMARY.md` - Complete implementation details
- `LOCATION_FILTERING_UPDATE.md` - Technical documentation
