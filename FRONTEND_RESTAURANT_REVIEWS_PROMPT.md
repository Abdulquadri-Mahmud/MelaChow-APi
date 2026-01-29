# Frontend AI Prompt: Restaurant Reviews Integration

## Task Overview
Integrate the new public reviews API endpoints into the restaurant details page to display customer reviews and ratings. This will allow users to see all reviews for a restaurant and its food items when they click the reviews button/section.

## Backend API Endpoints Available

### 1. Restaurant Reviews Endpoint
```
GET /api/public/reviews/vendor/:vendorId?page=1&limit=10&rating=5
```

### 2. Restaurant Reviews Summary Endpoint  
```
GET /api/public/reviews/vendor/:vendorId/summary
```

### 3. Food Reviews Endpoint
```
GET /api/public/reviews/food/:foodId?page=1&limit=10&rating=5
```

## Required UI Components

### 1. Reviews Section Layout
Create a reviews section on the restaurant details page with:

**Header Section:**
- "Reviews" title with total review count
- Overall rating display (stars + number)
- Rating distribution bar chart (5-star: 20, 4-star: 15, etc.)
- Filter buttons for rating (All, 5★, 4★, 3★, 2★, 1★)

**Toggle Tabs:**
- "Restaurant Reviews" tab (default)
- "Food Reviews" tab
- Active tab indicator

### 2. Review Cards
Each review should display:
- Reviewer name (firstname + lastname)
- Star rating (visual stars)
- Review date (formatted: "2 days ago", "1 week ago")
- Review comment/text
- Food name (if review is for specific food item)
- Food image thumbnail (if available)

### 3. Pagination Controls
- Previous/Next buttons
- Page numbers (1, 2, 3...)
- "Load More" button option
- Total results indicator

## Implementation Requirements

### 1. State Management
```javascript
// Required state variables
const [reviews, setReviews] = useState([]);
const [reviewsSummary, setReviewsSummary] = useState(null);
const [currentPage, setCurrentPage] = useState(1);
const [selectedRating, setSelectedRating] = useState('all');
const [activeTab, setActiveTab] = useState('restaurant'); // 'restaurant' or 'food'
const [loading, setLoading] = useState(false);
const [totalPages, setTotalPages] = useState(1);
```

### 2. API Integration Functions
```javascript
// Fetch restaurant reviews
const fetchRestaurantReviews = async (vendorId, page = 1, rating = null) => {
  const params = new URLSearchParams({ page, limit: 10 });
  if (rating && rating !== 'all') params.append('rating', rating);
  
  const response = await fetch(`/api/public/reviews/vendor/${vendorId}?${params}`);
  return response.json();
};

// Fetch restaurant summary
const fetchRestaurantSummary = async (vendorId) => {
  const response = await fetch(`/api/public/reviews/vendor/${vendorId}/summary`);
  return response.json();
};

// Fetch food reviews (when food tab is active)
const fetchFoodReviews = async (foodId, page = 1, rating = null) => {
  const params = new URLSearchParams({ page, limit: 10 });
  if (rating && rating !== 'all') params.append('rating', rating);
  
  const response = await fetch(`/api/public/reviews/food/${foodId}?${params}`);
  return response.json();
};
```

### 3. Component Structure
```jsx
<ReviewsSection>
  <ReviewsHeader>
    <ReviewsSummary /> {/* Rating stats, distribution chart */}
    <RatingFilters /> {/* All, 5★, 4★, 3★, 2★, 1★ buttons */}
  </ReviewsHeader>
  
  <ReviewsTabs>
    <TabButton active={activeTab === 'restaurant'}>Restaurant Reviews</TabButton>
    <TabButton active={activeTab === 'food'}>Food Reviews</TabButton>
  </ReviewsTabs>
  
  <ReviewsList>
    {reviews.map(review => (
      <ReviewCard key={review._id} review={review} />
    ))}
  </ReviewsList>
  
  <PaginationControls />
</ReviewsSection>
```

## Expected API Response Format

### Restaurant Reviews Response:
```json
{
  "success": true,
  "data": {
    "restaurant": {
      "id": "vendor123",
      "name": "Mama's Kitchen", 
      "averageRating": 4.2,
      "totalReviews": 45
    },
    "reviews": [
      {
        "_id": "review123",
        "rating": 5,
        "comment": "Amazing food and great service!",
        "userId": {
          "firstname": "John",
          "lastname": "Doe"
        },
        "foodId": {
          "name": "Jollof Rice",
          "price": 2500,
          "images": ["image1.jpg"]
        },
        "createdAt": "2023-07-20T10:30:00.000Z"
      }
    ],
    "pagination": {
      "currentPage": 1,
      "totalPages": 5,
      "totalReviews": 45,
      "hasNext": true,
      "hasPrev": false
    },
    "ratingDistribution": {
      "5": 20,
      "4": 15, 
      "3": 7,
      "2": 2,
      "1": 1
    }
  }
}
```

## UI/UX Requirements

### 1. Visual Design
- **Rating Stars**: Use filled/empty star icons for ratings
- **Rating Distribution**: Horizontal bar chart showing rating breakdown
- **Review Cards**: Clean card layout with proper spacing
- **Loading States**: Skeleton loaders while fetching data
- **Empty States**: "No reviews yet" message when no reviews exist

### 2. Interactive Features
- **Rating Filter**: Click rating buttons to filter reviews
- **Tab Switching**: Smooth transition between restaurant/food reviews
- **Pagination**: Click page numbers or next/prev buttons
- **Responsive**: Works on mobile and desktop
- **Smooth Scrolling**: Auto-scroll to reviews section when navigating

### 3. Performance Optimizations
- **Lazy Loading**: Load reviews only when reviews section is visible
- **Caching**: Cache API responses to avoid repeated requests
- **Debouncing**: Debounce filter changes to prevent excessive API calls
- **Virtual Scrolling**: For large numbers of reviews (optional)

## Integration Steps

### Step 1: Add Reviews Section to Restaurant Page
1. Identify the restaurant details page component
2. Add the reviews section below restaurant info/menu
3. Get restaurant ID from route params or props

### Step 2: Implement API Calls
1. Create API service functions for the three endpoints
2. Add error handling and loading states
3. Implement proper data fetching on component mount

### Step 3: Build UI Components
1. Create ReviewsHeader with rating summary
2. Build ReviewCard component for individual reviews
3. Add RatingFilter buttons (All, 5★, 4★, etc.)
4. Implement tab switching between restaurant/food reviews

### Step 4: Add Pagination
1. Implement pagination controls
2. Handle page changes and API calls
3. Update URL params for bookmarkable pages (optional)

### Step 5: Handle Edge Cases
1. No reviews state (show encouraging message)
2. API error handling (show retry button)
3. Loading states (skeleton components)
4. Mobile responsiveness

## Food Reviews Tab (Advanced Feature)

When "Food Reviews" tab is active:
1. Show list of restaurant's food items
2. Allow clicking on food item to see its specific reviews
3. Display food image, name, price alongside reviews
4. Use the `/api/public/reviews/food/:foodId` endpoint

## Success Criteria

✅ Users can see restaurant's overall rating and review count  
✅ Users can view all restaurant reviews with pagination  
✅ Users can filter reviews by star rating (1-5 stars)  
✅ Users can see rating distribution chart  
✅ Users can switch between restaurant and food reviews  
✅ Reviews display reviewer name, rating, comment, and date  
✅ Food reviews show which food item was reviewed  
✅ Responsive design works on mobile and desktop  
✅ Loading states and error handling work properly  
✅ Empty states are handled gracefully  

## Technical Notes

- **No Authentication Required**: These are public endpoints
- **Rate Limiting**: Implement reasonable request throttling
- **SEO Friendly**: Consider server-side rendering for reviews
- **Accessibility**: Ensure proper ARIA labels for screen readers
- **Performance**: Lazy load reviews section to improve initial page load

## Example Usage Flow

1. User visits restaurant details page
2. Scrolls down to reviews section
3. Sees overall rating (4.2 stars) and total reviews (45)
4. Views rating distribution chart
5. Clicks "4★" filter to see only 4-star reviews
6. Switches to "Food Reviews" tab
7. Clicks on "Jollof Rice" to see reviews for that specific food
8. Navigates through pages using pagination controls

This integration will provide customers with comprehensive review information to help them make informed ordering decisions.