# Create Food Page - Frontend Implementation Guide

## 🎯 Overview
Create a beautiful, intuitive, and comprehensive food creation page for vendors to add menu items to their restaurant. The page should support complex food configurations including variants, portions, choice groups, and dynamic pricing.

---

## 📡 API Endpoint

### **Create Food**
- **Method:** `POST`
- **Endpoint:** `/api/food/create?vendorId={vendorId}`
- **Authentication:** Required (Vendor Auth Token)
- **Content-Type:** `application/json`

---

## 📋 Complete Payload Structure

```json
{
  "name": "Jollof Rice with Chicken",
  "description": "Delicious Nigerian jollof rice served with grilled chicken, plantain, and coleslaw",
  "images": [
    {
      "url": "https://cloudinary.com/image1.jpg",
      "publicId": "food_images/jollof_rice_001"
    },
    {
      "url": "https://cloudinary.com/image2.jpg",
      "publicId": "food_images/jollof_rice_002"
    }
  ],
  "price": 3500,
  "deliveryFee": 500,
  "categories": ["African Cuisine", "Rice Dishes"],
  "portions": [
    {
      "portionNumber": 1,
      "price": 3500,
      "label": "Single Portion"
    },
    {
      "portionNumber": 2,
      "price": 6500,
      "label": "Double Portion"
    },
    {
      "portionNumber": 3,
      "price": 9000,
      "label": "Triple Portion"
    }
  ],
  "variants": [
    {
      "name": "Regular",
      "price": 3500,
      "image": "https://cloudinary.com/variant_regular.jpg"
    },
    {
      "name": "Large",
      "price": 5000,
      "image": "https://cloudinary.com/variant_large.jpg"
    },
    {
      "name": "Family Size",
      "price": 8500,
      "image": "https://cloudinary.com/variant_family.jpg"
    }
  ],
  "choiceGroups": [
    {
      "name": "Choose your Protein",
      "minSelect": 1,
      "maxSelect": 2,
      "options": [
        {
          "name": "Grilled Chicken",
          "price": 0
        },
        {
          "name": "Fried Fish",
          "price": 500
        },
        {
          "name": "Beef",
          "price": 800
        },
        {
          "name": "Turkey",
          "price": 1200
        }
      ]
    },
    {
      "name": "Add-ons",
      "minSelect": 0,
      "maxSelect": 5,
      "options": [
        {
          "name": "Extra Plantain",
          "price": 300
        },
        {
          "name": "Coleslaw",
          "price": 200
        },
        {
          "name": "Extra Sauce",
          "price": 100
        }
      ]
    }
  ],
  "available": true,
  "tags": ["Popular", "Spicy", "Nigerian", "Rice", "Chicken"],
  "estimatedDeliveryTime": 35,
  "metadata": {
    "spicyLevel": "medium",
    "allergens": ["gluten"],
    "dietaryInfo": "Contains meat",
    "preparationTime": "20-25 minutes"
  }
}
```

---

## 🎨 UI/UX Design Requirements

### **Page Layout**
Create a modern, multi-step form with the following sections:

#### **Step 1: Basic Information**
- **Food Name** (Required)
  - Text input with character counter (max 100 chars)
  - Auto-generates slug in the background
  
- **Description** (Optional)
  - Rich text editor or textarea
  - Character limit: 500 chars
  - Placeholder: "Describe your dish, ingredients, and what makes it special..."

- **Categories** (Required - Minimum 2)
  - Hierarchical category selector
  - First dropdown: Root category (e.g., "African Cuisine", "Fast Food", "Desserts")
  - Second dropdown: Sub-category (e.g., "Rice Dishes", "Burgers", "Cakes")
  - Visual chips showing selected categories
  - Validation: Must have at least 2 categories

#### **Step 2: Images**
- **Image Upload** (Required - At least 1 image)
  - Drag-and-drop zone
  - Support multiple images (max 5)
  - Image preview with delete option
  - Upload to Cloudinary and get URL + publicId
  - Show upload progress
  - Recommended size: 800x600px

#### **Step 3: Pricing & Delivery**
- **Base Price** (Required)
  - Number input with currency symbol (₦)
  - Min: 100, Max: 1,000,000
  
- **Delivery Fee** (Optional)
  - Number input with currency symbol
  - Info tooltip: "Leave empty to use restaurant's default delivery fee"
  
- **Estimated Delivery Time** (Optional)
  - Number input in minutes
  - Default: 30 minutes
  - Range: 10-120 minutes

#### **Step 4: Variants** (Optional)
- Dynamic form to add multiple variants
- Each variant has:
  - **Name** (e.g., "Small", "Medium", "Large")
  - **Price** (must be different from base price)
  - **Image** (optional)
- "Add Variant" button
- Remove variant option
- Visual cards showing all variants

#### **Step 5: Portions** (Optional)
- Dynamic form for portion scaling
- Each portion has:
  - **Portion Number** (1, 2, 3, etc.)
  - **Price** (must increase with portion number)
  - **Label** (e.g., "Single Portion", "Double Portion")
- Auto-validation: Price must increase with portion size
- "Add Portion" button
- Visual representation of portion scaling

#### **Step 6: Choice Groups** (Optional)
- Accordion-style interface
- Each choice group has:
  - **Group Name** (e.g., "Choose your Protein")
  - **Min Select** (minimum selections required)
  - **Max Select** (maximum selections allowed)
  - **Options** array:
    - Option name
    - Additional price (can be 0)
- "Add Choice Group" button
- "Add Option" button within each group
- Remove options for groups and individual options

#### **Step 7: Additional Details**
- **Tags** (Optional)
  - Tag input with autocomplete
  - Suggested tags: "Popular", "Spicy", "Vegetarian", "Halal", etc.
  - Visual chips for selected tags
  
- **Availability Toggle**
  - Switch/Toggle button
  - Default: Available (true)
  
- **Metadata** (Optional)
  - Key-value pair inputs
  - Examples:
    - Spicy Level: mild/medium/hot
    - Allergens: array of allergens
    - Dietary Info: vegetarian/vegan/halal/etc.
    - Preparation Time: estimated time

---

## 🎯 Form Validation Rules

### Required Fields
- ✅ `name` - Must not be empty
- ✅ `price` - Must be a positive number
- ✅ `categories` - Must have at least 2 categories
- ✅ `images` - Must have at least 1 image

### Optional but Validated
- `portions` - If provided, prices must increase with portion number
- `variants` - If provided, each must have name and price
- `choiceGroups` - If provided:
  - Each group must have a name
  - `minSelect` must be ≤ `maxSelect`
  - Each option must have a name
- `deliveryFee` - If provided, must be ≥ 0
- `estimatedDeliveryTime` - If provided, must be between 10-120

---

## 📤 Example API Requests

### **Minimal Payload (Required Fields Only)**
```json
{
  "name": "Fried Rice",
  "price": 2500,
  "categories": ["African Cuisine", "Rice Dishes"],
  "images": [
    {
      "url": "https://cloudinary.com/fried-rice.jpg",
      "publicId": "food_images/fried_rice_001"
    }
  ]
}
```

### **Medium Complexity (With Variants)**
```json
{
  "name": "Pepperoni Pizza",
  "description": "Classic pepperoni pizza with mozzarella cheese",
  "price": 4500,
  "categories": ["Fast Food", "Pizza"],
  "images": [
    {
      "url": "https://cloudinary.com/pizza.jpg",
      "publicId": "food_images/pizza_001"
    }
  ],
  "variants": [
    {
      "name": "Small (9 inch)",
      "price": 4500
    },
    {
      "name": "Medium (12 inch)",
      "price": 6500
    },
    {
      "name": "Large (15 inch)",
      "price": 8500
    }
  ],
  "tags": ["Popular", "Cheesy"],
  "estimatedDeliveryTime": 40
}
```

### **Full Complexity (All Features)**
```json
{
  "name": "Amala with Ewedu and Gbegiri",
  "description": "Traditional Yoruba delicacy - Amala served with ewedu soup, gbegiri, and assorted meat",
  "price": 3000,
  "deliveryFee": 400,
  "categories": ["African Cuisine", "Swallow"],
  "images": [
    {
      "url": "https://cloudinary.com/amala.jpg",
      "publicId": "food_images/amala_001"
    }
  ],
  "portions": [
    {
      "portionNumber": 1,
      "price": 3000,
      "label": "1 Wrap"
    },
    {
      "portionNumber": 2,
      "price": 5500,
      "label": "2 Wraps"
    }
  ],
  "choiceGroups": [
    {
      "name": "Choose your Protein",
      "minSelect": 1,
      "maxSelect": 3,
      "options": [
        { "name": "Assorted Meat", "price": 0 },
        { "name": "Cow Leg (Ponmo)", "price": 500 },
        { "name": "Goat Meat", "price": 800 },
        { "name": "Dry Fish", "price": 600 }
      ]
    }
  ],
  "tags": ["Traditional", "Nigerian", "Yoruba", "Swallow"],
  "available": true,
  "estimatedDeliveryTime": 30,
  "metadata": {
    "spicyLevel": "medium",
    "dietaryInfo": "Contains meat",
    "preparationTime": "25 minutes"
  }
}
```

---

## 🎨 Design Aesthetics

### Color Scheme
- **Primary:** Vibrant orange/red for food-related actions (#FF6B35)
- **Secondary:** Deep green for success states (#2D6A4F)
- **Background:** Clean white with subtle gray sections (#F8F9FA)
- **Accents:** Warm yellows for highlights (#FFB627)

### Typography
- **Headings:** Bold, modern sans-serif (Inter, Poppins)
- **Body:** Clean, readable (Roboto, Open Sans)
- **Price displays:** Monospace for alignment

### Components
- **Cards:** Subtle shadows, rounded corners (8-12px)
- **Inputs:** Clear borders, focus states with primary color
- **Buttons:**
  - Primary: Solid primary color with hover effects
  - Secondary: Outlined with hover fill
  - Danger: Red for delete actions
- **Progress Indicator:** Step-by-step visual progress bar
- **Image Previews:** Grid layout with hover overlay for actions
- **Tags/Chips:** Rounded pills with close icon

### Animations
- Smooth transitions between form steps
- Fade-in for newly added items (variants, portions, options)
- Slide-out for deleted items
- Loading spinners for image uploads
- Success checkmark animation on form submission

---

## 🔄 Success Response

```json
{
  "success": true,
  "message": "Food created successfully",
  "data": {
    "_id": "65f8a9b3c4d5e6f7g8h9i0j1",
    "vendor": "65f8a9b3c4d5e6f7g8h9i0j0",
    "name": "Jollof Rice with Chicken",
    "slug": "jollof-rice-with-chicken",
    "description": "Delicious Nigerian jollof rice...",
    "images": [...],
    "price": 3500,
    "deliveryFee": 500,
    "categories": ["African Cuisine", "Rice Dishes"],
    "portions": [...],
    "variants": [...],
    "choiceGroups": [...],
    "available": true,
    "tags": ["Popular", "Spicy", "Nigerian"],
    "estimatedDeliveryTime": 35,
    "rating": 0,
    "ratingCount": 0,
    "metadata": {...},
    "createdAt": "2026-01-13T00:00:00.000Z",
    "updatedAt": "2026-01-13T00:00:00.000Z"
  }
}
```

---

## ❌ Error Responses

### Validation Error
```json
{
  "success": false,
  "message": "Error creating food",
  "error": "Categories must contain at least [rootCategory, subCategory]"
}
```

### Vendor Not Found
```json
{
  "success": false,
  "message": "Vendor not found"
}
```

### Server Error
```json
{
  "success": false,
  "message": "Error creating food",
  "error": "Internal server error"
}
```

---

## 🎯 User Experience Flow

1. **Landing on Page**
   - Show welcome message and brief instructions
   - Display progress indicator (Step 1 of 7)

2. **Form Filling**
   - Auto-save to localStorage every 30 seconds
   - Show validation errors inline as user types
   - Disable "Next" button until required fields are filled

3. **Image Upload**
   - Show upload progress
   - Display preview immediately
   - Allow reordering of images (drag-and-drop)

4. **Dynamic Sections**
   - Collapse/expand sections for better focus
   - Show count badges (e.g., "3 variants added")

5. **Review Step**
   - Show summary of all entered data
   - Allow editing any section
   - Clear "Create Food" button

6. **Submission**
   - Show loading state
   - Display success message with option to:
     - Create another food item
     - View created food
     - Go to menu management

7. **Error Handling**
   - Clear error messages
   - Highlight problematic fields
   - Suggest corrections

---

## 💡 Additional Features

### Auto-Save
- Save form data to localStorage every 30 seconds
- Restore data if user navigates away and returns
- Clear localStorage on successful submission

### Templates
- Provide quick-start templates for common food types:
  - Rice Dishes
  - Swallow & Soup
  - Fast Food
  - Drinks
  - Desserts

### Bulk Import
- Option to import multiple foods via CSV/JSON
- Template download for bulk import

### Preview Mode
- Live preview of how the food will appear to customers
- Mobile and desktop preview

---

## 🔧 Technical Implementation Notes

### State Management
- Use React Context or Redux for form state
- Separate state for each form section
- Validation state management

### Image Upload
- Integrate with Cloudinary or similar service
- Handle upload errors gracefully
- Compress images before upload
- Generate thumbnails

### Form Libraries
- Consider using Formik or React Hook Form
- Yup or Zod for validation schema

### API Integration
- Use Axios or Fetch API
- Implement retry logic for failed requests
- Show upload progress for images

---

## 📱 Responsive Design
- Mobile-first approach
- Stack form fields vertically on mobile
- Collapsible sections for better mobile UX
- Touch-friendly buttons and inputs
- Optimized image upload for mobile

---

## ✅ Testing Checklist
- [ ] All required fields validated
- [ ] Optional fields work correctly
- [ ] Image upload and preview working
- [ ] Variants can be added/removed
- [ ] Portions validation (price increase)
- [ ] Choice groups with min/max select work
- [ ] Tags can be added/removed
- [ ] Form auto-save working
- [ ] Success/error states display correctly
- [ ] Mobile responsive
- [ ] Accessibility (keyboard navigation, screen readers)

---

## 🚀 Deployment Notes
- Ensure API endpoint is correctly configured
- Set up environment variables for Cloudinary
- Test with real vendor accounts
- Monitor error rates and user feedback

---

**Created:** 2026-01-13  
**Version:** 1.0  
**API Base URL:** `https://your-api-domain.com/api/food`
