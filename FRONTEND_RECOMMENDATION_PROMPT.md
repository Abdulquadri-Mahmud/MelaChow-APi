# Prompt for Frontend AI: Integrate Smart Recommendations

## Context
We have just implemented a new backend endpoint `/api/recommendations` that provides personalized, categorical food recommendations based on the user's location, time of day, and trending data.

## Objective
Integrate this new API into the Homepage of the Next.js application to replace or augment the static food lists. The goal is to make the homepage feel "smart" and personalized.

## API Details
- **Endpoint**: `GET /api/recommendations`
- **Auth**: Supports optional authentication. **Must** include `credentials: 'include'` in the fetch request to ensure the backend receives the auth cookie for location detection.
- **Reference**: See `RECOMMENDATION_SYSTEM.md` for full response structure.

### Response Structure
```json
{
  "success": true,
  "meta": {
    "timeOfDayLabel": "Lunch", // e.g., "Breakfast", "Late Night"
    "weatherCondition": null,
    "location": { "city": "Lagos", "state": "Lagos" }
  },
  "data": {
    "timeOfDay": [],      // Foods matching current time
    "underrated": [],     // High rated, low visibility "Hidden Gems"
    "weatherBased": [],   // Foods for current weather (if provided)
    "trendingNearby": [], // Popular items in this city
    "budgetFriendly": []  // Affordable options
  }
}
```

## Requirements for Frontend AI

### 1. Data Fetching
- Create a new service function `getRecommendations()` in your API layer.
- Ensure it handles the `location` logic similar to the search implementation (pass `credentials: include`).
- **Optional**: If you can get the user's local weather (e.g., from a free weather API client-side), pass it as a query param `?weather=rain` to get weather-specific foods.

### 2. UI Implementation (Homepage)
Create a flexible "Recommendation Section" component that can be used multiple times.

**Sections needed (in order of priority):**
1.  **Time-Based Hero/Row**:
    -   Header: Dynamic based on `meta.timeOfDayLabel` (e.g., "It's Lunch Time! 🍛", "Good Morning ☀️").
    -   Content: `data.timeOfDay`.
2.  **Trending Nearby**:
    -   Header: "Trending in [City]" (use `meta.location.city`).
    -   Content: `data.trendingNearby`.
3.  **Hidden Gems**:
    -   Header: "Underrated Gems 💎".
    -   Content: `data.underrated`.
4.  **Budget Picks**:
    -   Header: "Wallet Friendly 💸".
    -   Content: `data.budgetFriendly`.

### 3. Smart Rendering Rules
- **Conditional Rendering**: If an array is empty (e.g., `underrated` has 0 items), **do not render** that section.
- **Loading State**: Use a skeleton loader for these rows while data is fetching.
- **Error State**: If the API fails, fail silently (don't break the homepage), just show the default/static lists.

### 4. Component Design
- Use horizontal scroll containers (Carousels) for these lists to save vertical space.
- Reuse existing `FoodCard` components.
- Ensure the layout is responsive (mobile-first).

## Prompt Text
(Copy and paste this to the Frontend AI)

```markdown
I need you to integrate the new personalized recommendations API onto the homepage.

**Backend Endpoint**: `GET /api/recommendations`
**Auth**: Use `credentials: 'include'` to allow backend to detect user location.

**Tasks:**
1.  **Fetch Data**: Call the endpoint on homepage load.
2.  **Dynamic Sections**: Render the following sections ONLY if they have data:
    -   **Time of Day**: Use `meta.timeOfDayLabel` for a dynamic header (e.g., "Breakfast Options"). Map `data.timeOfDay`.
    -   **Trending**: Header "Trending in [City]". Map `data.trendingNearby`.
    -   **Underrated**: Header "Hidden Gems near you". Map `data.underrated`.
    -   **Budget**: Header "Best deals under ₦2500". Map `data.budgetFriendly`.
3.  **UI/UX**:
    -   Use Horizontal Scroll/Carousel for these sections.
    -   Show Skeleton loaders while fetching.
    -   If a section is empty, hide it completely.
    -   Fail gracefully (if API error, just show standard content).

**Data Shape**:
The API returns a `meta` object with labels/location and a `data` object with the arrays. Use `meta.timeOfDayLabel` to customize the greeting.
**Note**: Each food item's `vendor` object now includes `openingHours` and `deliveryFee`. The delivery fee is dynamically resolved based on platform settings. Use these to display delivery cost and open/closed status.
```
