# Frontend Task: Location API Update Handling

## Context
The backend API behavior for fetching public locations has been updated to support expansion into new regions.

## API Changes
The following endpoints have been modified:
1. `GET /api/locations/states`
2. `GET /api/locations/cities?stateId=...`

**Old Behavior:** Returned only locations where *active, approved vendors* were currently operating.
**New Behavior:** Returns **ALL** locations (States/Cities) that are marked as `active` by the Admin, regardless of whether any vendors exist there yet.

## Objective
Update the frontend to accommodate this change, focusing on User Experience (UX) when a user selects a location that has no vendors.

## Required Checks & Updates

### 1. Vendor Listing / Search Results (Critical)
Since users can now filter by a city that has zero vendors, the Vendor Listing page (or Search Results) must handle the empty state gracefully.

- **Check:** `VendorList` / `SearchResults` components.
- **Task:** If the API returns an empty list of vendors for a selected valid location, display a user-friendly message.
  - *Example:* "We haven't launched in [City Name] yet, but we're coming soon!" or "No active vendors found in this area."
- **Avoid:** Infinite loading spinners or blank white screens when no vendors are found.

### 2. User Registration & Address Management
This change fixes a bug where users couldn't sign up in new supported regions.
- **Check:** `SignupForm`, `AddressForm`.
- **Task:** Verify that the State/City dropdowns simply render the data returned from the API. No specific code changes are likely needed here, but verify validation logic doesn't erroneously expect a "vendor lookup" validation on the frontend.

### 3. Homepage Availability Check (If applicable)
If the homepage has a "Check Availability" feature:
- **Task:** Ensure it still functions logically. It might need to check the *Vendor* count endpoint if the goal is to see if food is available, rather than just checking if the location exists.

## Summary
The API now allows "Pre-launch" locations. Ensure the frontend doesn't treat "Valid Location + Zero Vendors" as an error state.
