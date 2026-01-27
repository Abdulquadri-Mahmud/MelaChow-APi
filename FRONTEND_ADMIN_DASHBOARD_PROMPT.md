# Frontend Admin Dashboard Implementation Prompt

## Overview
You are tasked with creating a comprehensive **Admin Dashboard** for the GrubDash food delivery platform. This dashboard will allow administrators to manage categories, approve/reject vendor accounts, and oversee platform operations.

---

## 🎯 Project Objectives

### 1. Admin Dashboard Layout
Create a professional, modern admin dashboard with the following structure:

#### Layout Requirements:
- **Sidebar Navigation** with the following menu items:
  - Dashboard (Overview/Stats)
  - Categories Management
  - Vendors Management
  - Users Management
  - Orders Management
  - Reviews Management
  - Settings

- **Top Navigation Bar** with:
  - Admin profile dropdown
  - Notifications icon
  - Logout button

- **Main Content Area**:
  - Breadcrumb navigation
  - Page title
  - Dynamic content based on selected menua

#### Design Guidelines:
- Use a modern, clean design aesthetic
- Implement responsive layout (mobile, tablet, desktop)
- Use a professional color scheme (e.g., dark sidebar with accent colors)
- Include smooth transitions and hover effects
- Ensure accessibility (ARIA labels, keyboard navigation)

---

## 📦 Feature 1: Category Management

### Backend Endpoints Available:

```javascript
// Public - Get active categories
GET /api/categories

// Admin - Get all categories (including inactive)
GET /api/categories/admin/all
Headers: { Cookie: adminToken }

// Admin - Create category
POST /api/categories
Headers: { Cookie: adminToken }
Body: {
  name: string (required),
  parent: string (optional - parent category ID),
  description: string (optional),
  image: string (optional - URL)
}

// Admin - Update category
PUT /api/categories/:id
Headers: { Cookie: adminToken }
Body: {
  name: string,
  parent: string,
  description: string,
  image: string,
  isActive: boolean
}

// Admin - Delete category (soft delete)
DELETE /api/categories/:id
Headers: { Cookie: adminToken }
```

### Category Management Page Requirements:

#### 1. Categories List View
- **Table/Grid Display** showing:
  - Category name
  - Parent category (if any)
  - Description (truncated)
  - Image thumbnail
  - Status (Active/Inactive)
  - Created date
  - Actions (Edit, Delete, Toggle Status)

- **Features**:
  - Search/filter categories by name
  - Filter by status (Active/Inactive/All)
  - Sort by name, date created
  - Pagination (if many categories)

#### 2. Create Category Modal/Form
- Form fields:
  - Category Name (required, text input)
  - Parent Category (optional, dropdown/select from existing categories)
  - Description (optional, textarea)
  - Image URL (optional, text input with preview)
  
- Validation:
  - Name is required and unique
  - Show error messages inline
  
- Actions:
  - Submit button (creates category)
  - Cancel button (closes modal)

#### 3. Edit Category Modal/Form
- Pre-populate form with existing category data
- Same fields as create form
- Additional field: Active/Inactive toggle
- Update button to save changes

#### 4. Delete Confirmation
- Show confirmation dialog before deleting
- Display category name in confirmation message
- Confirm/Cancel buttons

---

## 👔 Feature 2: Vendor Account Approval/Management

### Backend Endpoints Available:

```javascript
// Get all vendors (with filters)
GET /api/admin/vendors/get-all?verified=true&suspended=false&active=true
// Query params are optional, can filter by any combination

// Get single vendor details
GET /api/admin/vendors/single?vendorId=123
Headers: { Cookie: adminToken }

// Approve vendor
PATCH /api/admin/vendors/approve?vendorId=123
Headers: { Cookie: adminToken }

// Reject vendor
PATCH /api/admin/vendors/reject?vendorId=123&reason=Your%20reason%20here
Headers: { Cookie: adminToken }

// Suspend vendor
PATCH /api/admin/vendors/suspend?vendorId=123&reason=Violation%20reason
Headers: { Cookie: adminToken }

// Reactivate vendor
PATCH /api/admin/vendors/reactivate?vendorId=123
Headers: { Cookie: adminToken }

// Get vendor performance metrics
GET /api/admin/vendors/performance?vendorId=123
Headers: { Cookie: adminToken }

// Get vendor's foods
GET /api/admin/vendors/foods?vendorId=123
Headers: { Cookie: adminToken }
```

### Vendor Management Page Requirements:

#### 1. Vendors List View
- **Tabs/Filters**:
  - Pending Approval (verified: false, suspended: false)
  - Approved (verified: true, suspended: false)
  - Suspended (suspended: true)
  - Rejected (status: rejected)
  - All Vendors

- **Table Display** showing:
  - Store name
  - Owner name
  - Email
  - Phone
  - Registration date
  - Verification status
  - Suspension status
  - Actions (View Details, Approve, Reject, Suspend, Reactivate)

- **Search/Filter**:
  - Search by store name, email, phone
  - Filter by verification status
  - Filter by suspension status
  - Sort by registration date, name

#### 2. Vendor Details Modal/Page
When clicking "View Details", show:
- **Vendor Information**:
  - Store name, logo
  - Owner details (name, email, phone)
  - Business address
  - Registration date
  - Verification status
  - Suspension status (with reason if suspended)

- **Performance Metrics**:
  - Total sales
  - Total orders
  - Rating & rating count
  - Number of food items
  - Wallet balance

- **Foods List**:
  - Display vendor's food items in a grid/list
  - Show food name, price, image, availability

- **Action Buttons**:
  - Approve (if pending)
  - Reject (if pending) - opens reason modal
  - Suspend (if active) - opens reason modal
  - Reactivate (if suspended)

#### 3. Approval Workflow

**For Pending Vendors:**
- Show "Approve" and "Reject" buttons prominently
- **Approve Action**:
  - Show confirmation dialog
  - On confirm, call approve endpoint
  - Show success message
  - Update vendor status in UI
  - Email is automatically sent to vendor by backend

- **Reject Action**:
  - Open modal to enter rejection reason
  - Reason field (required, textarea)
  - Submit rejection
  - Show success message
  - Email is automatically sent to vendor by backend

#### 4. Suspension Management

**For Active Vendors:**
- Show "Suspend" button
- **Suspend Action**:
  - Open modal to enter suspension reason
  - Reason field (required, textarea)
  - Submit suspension
  - Show success message
  - Email is automatically sent to vendor by backend

**For Suspended Vendors:**
- Show "Reactivate" button
- **Reactivate Action**:
  - Show confirmation dialog
  - On confirm, call reactivate endpoint
  - Show success message
  - Email is automatically sent to vendor by backend

---

## 🔐 Authentication & Authorization

### Admin Authentication:
All admin routes require authentication via HTTP-only cookies.

**Login Endpoint:**
```javascript
POST /api/admin/login
Body: {
  email: string,
  password: string
}
// Sets adminToken cookie on success
```

**Logout Endpoint:**
```javascript
POST /api/admin/logout
Headers: { Cookie: adminToken }
// Clears adminToken cookie
```

### Implementation Requirements:
1. Create admin login page
2. Store admin session using HTTP-only cookies (automatically handled by backend)
3. Use `credentials: 'include'` (fetch) or `withCredentials: true` (axios) for all admin API calls
4. Implement route guards to protect admin pages
5. Redirect to login if not authenticated
6. Show admin info in top navigation bar

---

## 📊 Dashboard Overview Page (Optional Enhancement)

Create a dashboard home page showing:
- Total categories count
- Total vendors (approved, pending, suspended)
- Total users count
- Total orders (today, this week, this month)
- Recent vendor registrations (last 5)
- Recent orders (last 10)
- Revenue statistics

---

## 🎨 UI/UX Best Practices

1. **Loading States**: Show spinners/skeletons while fetching data
2. **Error Handling**: Display user-friendly error messages
3. **Success Feedback**: Show toast notifications for successful actions
4. **Confirmation Dialogs**: Always confirm destructive actions (delete, reject, suspend)
5. **Form Validation**: Validate inputs before submission
6. **Responsive Design**: Ensure mobile-friendly layouts
7. **Accessibility**: Use semantic HTML, ARIA labels, keyboard navigation

---

## 🛠️ Technical Implementation Notes

### API Configuration:
```javascript
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// Example fetch with credentials
const response = await fetch(`${API_BASE_URL}/api/categories/admin/all`, {
  method: 'GET',
  credentials: 'include', // Important for cookie-based auth
  headers: {
    'Content-Type': 'application/json',
  },
});
```

### State Management:
- Use React Context or state management library (Redux, Zustand) for admin auth state
- Consider using React Query or SWR for data fetching and caching

### Routing:
- Protect admin routes with authentication guards
- Suggested route structure:
  - `/admin/login` - Admin login page
  - `/admin/dashboard` - Dashboard overview
  - `/admin/categories` - Category management
  - `/admin/vendors` - Vendor management
  - `/admin/vendors/:id` - Vendor details

---

## ✅ Acceptance Criteria

### Category Management:
- [ ] Can view all categories in a table/grid
- [ ] Can create new categories with parent relationship
- [ ] Can edit existing categories
- [ ] Can soft delete categories
- [ ] Can search/filter categories
- [ ] Form validation works correctly
- [ ] Success/error messages display properly

### Vendor Management:
- [ ] Can view vendors filtered by status (pending, approved, suspended)
- [ ] Can view detailed vendor information
- [ ] Can approve pending vendors
- [ ] Can reject pending vendors with reason
- [ ] Can suspend active vendors with reason
- [ ] Can reactivate suspended vendors
- [ ] Email notifications are sent automatically by backend
- [ ] Search/filter functionality works
- [ ] Performance metrics display correctly

### General:
- [ ] Admin authentication works with HTTP-only cookies
- [ ] All API calls include credentials
- [ ] Route guards protect admin pages
- [ ] Responsive design works on mobile/tablet/desktop
- [ ] Loading states display during API calls
- [ ] Error handling works gracefully
- [ ] UI is polished and professional

---

## 📝 Additional Notes

1. **Email Notifications**: The backend automatically sends emails when vendors are approved, rejected, suspended, or reactivated. No frontend action needed.

2. **Vendor Registration Flow**: When vendors sign up via `/api/vendors/create`, they are created with `verified: false`. Admins must approve them before they can access their dashboard.

3. **Category Hierarchy**: Categories support parent-child relationships. When creating/editing, show a dropdown of existing categories for the parent selection.

4. **Soft Deletes**: Categories are soft-deleted (isActive: false) rather than permanently removed. Consider adding a "Restore" feature for deleted categories.

5. **Security**: All admin endpoints are protected with `adminAuth` middleware. Ensure all requests include the authentication cookie.

---

## 🚀 Getting Started

1. Set up admin authentication flow
2. Create admin dashboard layout with sidebar navigation
3. Implement category management page (CRUD operations)
4. Implement vendor management page (approval workflow)
5. Add search, filter, and pagination features
6. Polish UI/UX with loading states and error handling
7. Test all functionality thoroughly

Good luck building an amazing admin dashboard! 🎉
