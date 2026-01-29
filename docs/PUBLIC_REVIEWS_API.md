# Public Reviews API Documentation

## Overview
These endpoints allow customers to view all reviews for restaurants and food items without authentication. Perfect for displaying reviews on restaurant pages and food detail pages.

## Endpoints

### 1. Get Restaurant Reviews
**GET** `/api/public/reviews/vendor/:vendorId`

Get all reviews for a specific restaurant with pagination and filtering.

**Parameters:**
- `vendorId` (path) - Restaurant/vendor ID
- `page` (query, optional) - Page number (default: 1)
- `limit` (query, optional) - Items per page (default: 10)
- `rating` (query, optional) - Filter by specific rating (1-5)

**Example:**
```
GET /api/public/reviews/vendor/60f7b3b3b3b3b3b3b3b3b3b3?page=1&limit=5&rating=5
```

**Response:**
```json
{
  "success": true,
  "data": {
    "restaurant": {
      "id": "60f7b3b3b3b3b3b3b3b3b3b3",
      "name": "Mama's Kitchen",
      "averageRating": 4.2,
      "totalReviews": 45
    },
    "reviews": [
      {
        "_id": "60f7b3b3b3b3b3b3b3b3b3b4",
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

### 2. Get Restaurant Reviews Summary
**GET** `/api/public/reviews/vendor/:vendorId/summary`

Get a quick summary of restaurant reviews including rating distribution and recent reviews.

**Parameters:**
- `vendorId` (path) - Restaurant/vendor ID

**Example:**
```
GET /api/public/reviews/vendor/60f7b3b3b3b3b3b3b3b3b3b3/summary
```

**Response:**
```json
{
  "success": true,
  "data": {
    "restaurant": {
      "id": "60f7b3b3b3b3b3b3b3b3b3b3",
      "name": "Mama's Kitchen",
      "averageRating": 4.2,
      "totalReviews": 45
    },
    "ratingDistribution": {
      "5": 20,
      "4": 15,
      "3": 7,
      "2": 2,
      "1": 1
    },
    "recentReviews": [
      // Last 5 reviews
    ]
  }
}
```

### 3. Get Food Reviews
**GET** `/api/public/reviews/food/:foodId`

Get all reviews for a specific food item with pagination and filtering.

**Parameters:**
- `foodId` (path) - Food item ID
- `page` (query, optional) - Page number (default: 1)
- `limit` (query, optional) - Items per page (default: 10)
- `rating` (query, optional) - Filter by specific rating (1-5)

**Example:**
```
GET /api/public/reviews/food/60f7b3b3b3b3b3b3b3b3b3b5?page=1&limit=10
```

**Response:**
```json
{
  "success": true,
  "data": {
    "food": {
      "id": "60f7b3b3b3b3b3b3b3b3b3b5",
      "name": "Jollof Rice",
      "price": 2500,
      "images": ["image1.jpg"],
      "averageRating": 4.5,
      "totalReviews": 12,
      "restaurant": {
        "id": "60f7b3b3b3b3b3b3b3b3b3b3",
        "name": "Mama's Kitchen"
      }
    },
    "reviews": [
      {
        "_id": "60f7b3b3b3b3b3b3b3b3b3b6",
        "rating": 5,
        "comment": "Best jollof rice in town!",
        "userId": {
          "firstname": "Jane",
          "lastname": "Smith"
        },
        "vendorId": {
          "storeName": "Mama's Kitchen"
        },
        "createdAt": "2023-07-20T10:30:00.000Z"
      }
    ],
    "pagination": {
      "currentPage": 1,
      "totalPages": 2,
      "totalReviews": 12,
      "hasNext": true,
      "hasPrev": false
    },
    "ratingDistribution": {
      "5": 8,
      "4": 3,
      "3": 1,
      "2": 0,
      "1": 0
    }
  }
}
```

## Frontend Integration Examples

### Restaurant Page Reviews Section
```javascript
// Fetch restaurant reviews
const fetchRestaurantReviews = async (vendorId, page = 1) => {
  const response = await fetch(`/api/public/reviews/vendor/${vendorId}?page=${page}&limit=10`);
  const data = await response.json();
  return data;
};

// Fetch restaurant summary for quick display
const fetchRestaurantSummary = async (vendorId) => {
  const response = await fetch(`/api/public/reviews/vendor/${vendorId}/summary`);
  const data = await response.json();
  return data;
};
```

### Food Detail Page Reviews
```javascript
// Fetch food-specific reviews
const fetchFoodReviews = async (foodId, page = 1) => {
  const response = await fetch(`/api/public/reviews/food/${foodId}?page=${page}&limit=5`);
  const data = await response.json();
  return data;
};
```

### Filter by Rating
```javascript
// Get only 5-star reviews
const fetchFiveStarReviews = async (vendorId) => {
  const response = await fetch(`/api/public/reviews/vendor/${vendorId}?rating=5`);
  const data = await response.json();
  return data;
};
```

## Features

✅ **Public Access** - No authentication required  
✅ **Pagination** - Handle large numbers of reviews efficiently  
✅ **Rating Filter** - Filter reviews by star rating  
✅ **Rating Distribution** - See breakdown of ratings (5-star: 20, 4-star: 15, etc.)  
✅ **Recent Reviews** - Quick access to latest reviews  
✅ **Restaurant Context** - Food reviews include restaurant information  
✅ **Food Context** - Restaurant reviews include food information when available  
✅ **User Privacy** - Only shows user's first and last name  

## Use Cases

1. **Restaurant Page** - Display all reviews for a restaurant with rating breakdown
2. **Food Detail Page** - Show reviews specific to a food item
3. **Reviews Toggle** - Allow users to switch between restaurant and food reviews
4. **Rating Summary** - Quick overview for restaurant cards/listings
5. **Review Filtering** - Let users filter by star rating to find relevant feedback