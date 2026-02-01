# Recommendation System Implementation

## Overview
Implemented a lightweight, scalable recommendation engine that categorizes foods based on 5 key strategies without introducing new infrastructure.

## Strategies

### 1. 🕒 Time-of-Day
- **Logic**: derived from server time (e.g., Breakfast: 5-11am)
- **Mapping**:
    - **Breakfast**: Coffee, Egg, Bread
    - **Lunch**: Rice, Pasta, Swallow
    - **Dinner**: Soup, Grill, Fish
    - **Late Night**: Snacks, Noodles
- **Filter**: `tags` + `available: true` + `location`

### 2. 💎 Nearby Underrated
- **Logic**: High quality (`rating >= 4.0`) but low visibility (`ratingCount < 50`)
- **Location**: Strictly within user's city
- **Goal**: Help users discover "hidden gems"

### 3. 🌦 Weather-Based
- **Logic**: Maps client-provided weather condition to food tags
- **Mapping**:
    - `rain`: Soup, Tea, Hot
    - `hot`: Ice cream, Cold drink, Salad
- **Input**: Query param `?weather=rain`

### 4. 🔥 Trending Nearby (People Ordered This)
- **Logic**: Aggregates `Order` data from the last 48 hours in the user's city.
- **Goal**: Social proof for local hits.
- **Constraints**: Only counts `delivered` orders.

### 5. 💰 Budget Friendly
- **Logic**: Simple price threshold (<= 2500) sorted by price ascending.
- **Location**: Within user's city.

## API Endpoint

**GET** `/api/recommendations`

### Parameters
- `city` (optional): Override location city
- `state` (optional): Override location state
- `weather` (optional): Current weather condition (rain, hot, cold, clear)

### Headers
- `Cookie`: `token=...` (Optional, for automatic location detection)

### Response Structure
```json
{
  "success": true,
  "meta": {
    "timeOfDayLabel": "Lunch",
    "weatherCondition": null,
    "location": { "city": "Lagos", "state": "Lagos" }
  },
  "data": {
    "timeOfDay": [...],
    "underrated": [...],
    "weatherBased": [...],
    "trendingNearby": [...],
    "budgetFriendly": [...]
  }
}
```

## files Created
- `controller/recommendation/recommendation.controller.js`
- `routes/user/recommendation.routes.js`

## Files Modified
- `index.js` (Registered `/api/recommendations`)

## Testing
1. **Standard**: `curl http://localhost:5000/api/recommendations`
2. **With Auth**: Send `token` cookie (auto-detects location)
3. **With Params**: `curl http://localhost:5000/api/recommendations?city=Abuja&weather=rain`
