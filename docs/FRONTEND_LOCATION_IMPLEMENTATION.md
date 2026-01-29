# Frontend Implementation Prompt - Database-Driven Location System

## 🎯 Objective

Implement a **database-driven location system** across the frontend application. Replace all hardcoded state/city arrays with dynamic data fetched from the backend API. This affects:

1. **User Address Components** (Address forms, modals)
2. **Admin Location Management** (New admin panel)
3. **Vendor Registration** (If applicable)

---

## 📋 Context

The backend now provides a **database-driven location system** where:
- States and cities are stored in the database
- Only active locations with approved restaurants are shown to users
- Admins can create, manage, and activate/deactivate locations
- The system prevents invalid or spam locations

---

## 🚀 Implementation Tasks

### **TASK 1: User Address Components**

#### **Affected Components:**
- User address form/page
- Address modal/dialog
- Profile settings (address section)
- Checkout address selection
- Any component where users input delivery location

#### **What to Do:**

1. **Remove Hardcoded Data**
   - Delete any hardcoded arrays of states/cities
   - Remove mock data or static location lists

2. **Fetch Locations from API**
   ```javascript
   // Fetch available locations on component mount
   const fetchLocations = async () => {
     try {
       const response = await fetch('https://grub-dash-api.vercel.app/api/user/locations', {
         credentials: 'include'
       });
       const data = await response.json();
       
       if (data.success) {
         setLocations(data.locations);
         // data.locations = [
         //   {
         //     state: "Lagos",
         //     stateId: "67a1b2c3...",
         //     cities: [
         //       { name: "Ikeja", cityId: "67a1b2c3..." },
         //       { name: "Lekki", cityId: "67a1b2c3..." }
         //     ]
         //   }
         // ]
       }
     } catch (error) {
       console.error('Error fetching locations:', error);
       // Show error toast/message
     }
   };
   ```

3. **Populate State Dropdown**
   ```jsx
   <select 
     value={selectedStateId} 
     onChange={handleStateChange}
     required
   >
     <option value="">Select State</option>
     {locations.map(location => (
       <option key={location.stateId} value={location.stateId}>
         {location.state}
       </option>
     ))}
   </select>
   ```

4. **Populate City Dropdown (Dependent on State)**
   ```jsx
   const handleStateChange = (e) => {
     const stateId = e.target.value;
     setSelectedStateId(stateId);
     
     // Find selected state's cities
     const selectedLocation = locations.find(loc => loc.stateId === stateId);
     setCities(selectedLocation?.cities || []);
     setSelectedCityId(''); // Reset city selection
   };

   // City dropdown
   <select 
     value={selectedCityId} 
     onChange={(e) => setSelectedCityId(e.target.value)}
     disabled={!selectedStateId}
     required
   >
     <option value="">Select City</option>
     {cities.map(city => (
       <option key={city.cityId} value={city.cityId}>
         {city.name}
       </option>
     ))}
   </select>
   ```

5. **Submit Address**
   ```javascript
   // When submitting, send the STATE NAME and CITY NAME (not IDs)
   const handleSubmit = async (e) => {
     e.preventDefault();
     
     // Get state and city names from IDs
     const selectedLocation = locations.find(loc => loc.stateId === selectedStateId);
     const selectedCity = cities.find(city => city.cityId === selectedCityId);
     
     const addressData = {
       street: streetInput,
       city: selectedCity.name,      // Send name, not ID
       state: selectedLocation.state, // Send name, not ID
       postalCode: postalCodeInput
     };
     
     // Submit to your address update endpoint
     await updateUserAddress(addressData);
   };
   ```

6. **Handle Loading & Error States**
   ```jsx
   {isLoadingLocations && <p>Loading locations...</p>}
   {locationError && <p className="error">Failed to load locations. Please refresh.</p>}
   {locations.length === 0 && !isLoadingLocations && (
     <p className="warning">No locations available. Please contact support.</p>
   )}
   ```

7. **Add Validation**
   ```javascript
   // Ensure user selects from available options only
   const validateAddress = () => {
     if (!selectedStateId || !selectedCityId) {
       showError('Please select both state and city');
       return false;
     }
     return true;
   };
   ```

#### **Example Component Structure:**
```jsx
import { useState, useEffect } from 'react';

const UserAddressForm = () => {
  const [locations, setLocations] = useState([]);
  const [cities, setCities] = useState([]);
  const [selectedStateId, setSelectedStateId] = useState('');
  const [selectedCityId, setSelectedCityId] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchLocations();
  }, []);

  const fetchLocations = async () => {
    try {
      setIsLoading(true);
      const response = await fetch('https://grub-dash-api.vercel.app/api/user/locations', {
        credentials: 'include'
      });
      const data = await response.json();
      
      if (data.success) {
        setLocations(data.locations);
      } else {
        setError('Failed to load locations');
      }
    } catch (err) {
      setError('Error loading locations');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleStateChange = (e) => {
    const stateId = e.target.value;
    setSelectedStateId(stateId);
    
    const selectedLocation = locations.find(loc => loc.stateId === stateId);
    setCities(selectedLocation?.cities || []);
    setSelectedCityId('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    const selectedLocation = locations.find(loc => loc.stateId === selectedStateId);
    const selectedCity = cities.find(city => city.cityId === selectedCityId);
    
    const addressData = {
      street: e.target.street.value,
      city: selectedCity.name,
      state: selectedLocation.state,
      postalCode: e.target.postalCode.value
    };
    
    // Submit address
    console.log('Submitting:', addressData);
  };

  if (isLoading) return <div>Loading locations...</div>;
  if (error) return <div className="error">{error}</div>;

  return (
    <form onSubmit={handleSubmit}>
      <div>
        <label>State *</label>
        <select value={selectedStateId} onChange={handleStateChange} required>
          <option value="">Select State</option>
          {locations.map(loc => (
            <option key={loc.stateId} value={loc.stateId}>
              {loc.state}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label>City *</label>
        <select 
          value={selectedCityId} 
          onChange={(e) => setSelectedCityId(e.target.value)}
          disabled={!selectedStateId}
          required
        >
          <option value="">Select City</option>
          {cities.map(city => (
            <option key={city.cityId} value={city.cityId}>
              {city.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label>Street Address *</label>
        <input type="text" name="street" required />
      </div>

      <div>
        <label>Postal Code</label>
        <input type="text" name="postalCode" />
      </div>

      <button type="submit">Save Address</button>
    </form>
  );
};

export default UserAddressForm;
```

---

### **TASK 2: Admin Location Management Panel**

#### **Create New Admin Components:**
- Location management dashboard
- State creation form
- City creation form
- Location activation/deactivation controls
- Pending location requests view

#### **What to Do:**

1. **Create Admin Location Dashboard**
   ```jsx
   // AdminLocationDashboard.jsx
   import { useState, useEffect } from 'react';

   const AdminLocationDashboard = () => {
     const [states, setStates] = useState([]);
     const [cities, setCities] = useState([]);
     const [pendingRequests, setPendingRequests] = useState([]);
     const [activeTab, setActiveTab] = useState('states'); // 'states', 'cities', 'requests'

     useEffect(() => {
       fetchStates();
       fetchCities();
       fetchPendingRequests();
     }, []);

     const fetchStates = async () => {
       const response = await fetch('https://grub-dash-api.vercel.app/api/admin/locations/states', {
         credentials: 'include'
       });
       const data = await response.json();
       if (data.success) setStates(data.states);
     };

     const fetchCities = async () => {
       const response = await fetch('https://grub-dash-api.vercel.app/api/admin/locations/cities', {
         credentials: 'include'
       });
       const data = await response.json();
       if (data.success) setCities(data.cities);
     };

     const fetchPendingRequests = async () => {
       const response = await fetch('https://grub-dash-api.vercel.app/api/admin/locations/location-requests', {
         credentials: 'include'
       });
       const data = await response.json();
       if (data.success) setPendingRequests(data.vendors);
     };

     return (
       <div className="admin-location-dashboard">
         <h1>Location Management</h1>
         
         <div className="tabs">
           <button onClick={() => setActiveTab('states')}>States</button>
           <button onClick={() => setActiveTab('cities')}>Cities</button>
           <button onClick={() => setActiveTab('requests')}>
             Pending Requests ({pendingRequests.length})
           </button>
         </div>

         {activeTab === 'states' && <StatesPanel states={states} onRefresh={fetchStates} />}
         {activeTab === 'cities' && <CitiesPanel cities={cities} states={states} onRefresh={fetchCities} />}
         {activeTab === 'requests' && <PendingRequestsPanel requests={pendingRequests} onRefresh={fetchPendingRequests} />}
       </div>
     );
   };
   ```

2. **Create State Management Panel**
   ```jsx
   const StatesPanel = ({ states, onRefresh }) => {
     const [newStateName, setNewStateName] = useState('');
     const [isCreating, setIsCreating] = useState(false);

     const createState = async (e) => {
       e.preventDefault();
       setIsCreating(true);
       
       try {
         const response = await fetch('https://grub-dash-api.vercel.app/api/admin/locations/states', {
           method: 'POST',
           headers: { 'Content-Type': 'application/json' },
           credentials: 'include',
           body: JSON.stringify({ name: newStateName })
         });
         
         const data = await response.json();
         
         if (data.success) {
           alert('State created successfully!');
           setNewStateName('');
           onRefresh();
         } else {
           alert(data.message || 'Failed to create state');
         }
       } catch (error) {
         alert('Error creating state');
       } finally {
         setIsCreating(false);
       }
     };

     const toggleStateStatus = async (stateId, currentStatus) => {
       try {
         const response = await fetch(
           `https://grub-dash-api.vercel.app/api/admin/locations/states/${stateId}/activate`,
           {
             method: 'PATCH',
             headers: { 'Content-Type': 'application/json' },
             credentials: 'include',
             body: JSON.stringify({ isActive: !currentStatus })
           }
         );
         
         if (response.ok) {
           alert('State status updated!');
           onRefresh();
         }
       } catch (error) {
         alert('Error updating state');
       }
     };

     return (
       <div className="states-panel">
         <h2>States</h2>
         
         <form onSubmit={createState} className="create-form">
           <input
             type="text"
             placeholder="Enter state name"
             value={newStateName}
             onChange={(e) => setNewStateName(e.target.value)}
             required
           />
           <button type="submit" disabled={isCreating}>
             {isCreating ? 'Creating...' : 'Create State'}
           </button>
         </form>

         <table>
           <thead>
             <tr>
               <th>Name</th>
               <th>Status</th>
               <th>Created</th>
               <th>Actions</th>
             </tr>
           </thead>
           <tbody>
             {states.map(state => (
               <tr key={state._id}>
                 <td>{state.name}</td>
                 <td>
                   <span className={state.isActive ? 'active' : 'inactive'}>
                     {state.isActive ? 'Active' : 'Inactive'}
                   </span>
                 </td>
                 <td>{new Date(state.createdAt).toLocaleDateString()}</td>
                 <td>
                   <button onClick={() => toggleStateStatus(state._id, state.isActive)}>
                     {state.isActive ? 'Deactivate' : 'Activate'}
                   </button>
                 </td>
               </tr>
             ))}
           </tbody>
         </table>
       </div>
     );
   };
   ```

3. **Create City Management Panel**
   ```jsx
   const CitiesPanel = ({ cities, states, onRefresh }) => {
     const [newCityName, setNewCityName] = useState('');
     const [selectedStateId, setSelectedStateId] = useState('');
     const [isCreating, setIsCreating] = useState(false);

     const createCity = async (e) => {
       e.preventDefault();
       setIsCreating(true);
       
       try {
         const response = await fetch('https://grub-dash-api.vercel.app/api/admin/locations/cities', {
           method: 'POST',
           headers: { 'Content-Type': 'application/json' },
           credentials: 'include',
           body: JSON.stringify({
             name: newCityName,
             stateId: selectedStateId
           })
         });
         
         const data = await response.json();
         
         if (data.success) {
           alert('City created successfully!');
           setNewCityName('');
           setSelectedStateId('');
           onRefresh();
         } else {
           alert(data.message || 'Failed to create city');
         }
       } catch (error) {
         alert('Error creating city');
       } finally {
         setIsCreating(false);
       }
     };

     const toggleCityStatus = async (cityId, currentStatus) => {
       try {
         const response = await fetch(
           `https://grub-dash-api.vercel.app/api/admin/locations/cities/${cityId}/activate`,
           {
             method: 'PATCH',
             headers: { 'Content-Type': 'application/json' },
             credentials: 'include',
             body: JSON.stringify({ isActive: !currentStatus })
           }
         );
         
         if (response.ok) {
           alert('City status updated!');
           onRefresh();
         }
       } catch (error) {
         alert('Error updating city');
       }
     };

     return (
       <div className="cities-panel">
         <h2>Cities</h2>
         
         <form onSubmit={createCity} className="create-form">
           <select
             value={selectedStateId}
             onChange={(e) => setSelectedStateId(e.target.value)}
             required
           >
             <option value="">Select State</option>
             {states.map(state => (
               <option key={state._id} value={state._id}>
                 {state.name}
               </option>
             ))}
           </select>
           
           <input
             type="text"
             placeholder="Enter city name"
             value={newCityName}
             onChange={(e) => setNewCityName(e.target.value)}
             required
           />
           
           <button type="submit" disabled={isCreating}>
             {isCreating ? 'Creating...' : 'Create City'}
           </button>
         </form>

         <table>
           <thead>
             <tr>
               <th>Name</th>
               <th>State</th>
               <th>Status</th>
               <th>Created</th>
               <th>Actions</th>
             </tr>
           </thead>
           <tbody>
             {cities.map(city => (
               <tr key={city._id}>
                 <td>{city.name}</td>
                 <td>{city.stateId?.name || 'N/A'}</td>
                 <td>
                   <span className={city.isActive ? 'active' : 'inactive'}>
                     {city.isActive ? 'Active' : 'Inactive'}
                   </span>
                 </td>
                 <td>{new Date(city.createdAt).toLocaleDateString()}</td>
                 <td>
                   <button onClick={() => toggleCityStatus(city._id, city.isActive)}>
                     {city.isActive ? 'Deactivate' : 'Activate'}
                   </button>
                 </td>
               </tr>
             ))}
           </tbody>
         </table>
       </div>
     );
   };
   ```

4. **Create Pending Requests Panel**
   ```jsx
   const PendingRequestsPanel = ({ requests, onRefresh }) => {
     const [selectedVendor, setSelectedVendor] = useState(null);
     const [resolveState, setResolveState] = useState('');
     const [resolveCity, setResolveCity] = useState('');
     const [createLocation, setCreateLocation] = useState(false);

     const approveVendor = async (vendorId) => {
       try {
         const response = await fetch(
           `https://grub-dash-api.vercel.app/api/admin/vendors/approve?vendorId=${vendorId}`,
           {
             method: 'PATCH',
             headers: { 'Content-Type': 'application/json' },
             credentials: 'include',
             body: JSON.stringify({
               state: resolveState,
               city: resolveCity,
               createLocation
             })
           }
         );
         
         const data = await response.json();
         
         if (data.success) {
           alert('Vendor approved successfully!');
           setSelectedVendor(null);
           onRefresh();
         } else {
           alert(data.message || 'Failed to approve vendor');
         }
       } catch (error) {
         alert('Error approving vendor');
       }
     };

     return (
       <div className="pending-requests-panel">
         <h2>Pending Location Requests</h2>
         
         {requests.length === 0 ? (
           <p>No pending location requests</p>
         ) : (
           <table>
             <thead>
               <tr>
                 <th>Store Name</th>
                 <th>Requested State</th>
                 <th>Requested City</th>
                 <th>Date</th>
                 <th>Actions</th>
               </tr>
             </thead>
             <tbody>
               {requests.map(vendor => (
                 <tr key={vendor._id}>
                   <td>{vendor.storeName}</td>
                   <td>{vendor.requestedState}</td>
                   <td>{vendor.requestedCity}</td>
                   <td>{new Date(vendor.createdAt).toLocaleDateString()}</td>
                   <td>
                     <button onClick={() => setSelectedVendor(vendor)}>
                       Resolve
                     </button>
                   </td>
                 </tr>
               ))}
             </tbody>
           </table>
         )}

         {selectedVendor && (
           <div className="resolve-modal">
             <h3>Resolve Location for {selectedVendor.storeName}</h3>
             <p>Requested: {selectedVendor.requestedState}, {selectedVendor.requestedCity}</p>
             
             <div>
               <label>State:</label>
               <input
                 type="text"
                 value={resolveState}
                 onChange={(e) => setResolveState(e.target.value)}
                 placeholder={selectedVendor.requestedState}
               />
             </div>
             
             <div>
               <label>City:</label>
               <input
                 type="text"
                 value={resolveCity}
                 onChange={(e) => setResolveCity(e.target.value)}
                 placeholder={selectedVendor.requestedCity}
               />
             </div>
             
             <div>
               <label>
                 <input
                   type="checkbox"
                   checked={createLocation}
                   onChange={(e) => setCreateLocation(e.target.checked)}
                 />
                 Create location if it doesn't exist
               </label>
             </div>
             
             <button onClick={() => approveVendor(selectedVendor._id)}>
               Approve Vendor
             </button>
             <button onClick={() => setSelectedVendor(null)}>Cancel</button>
           </div>
         )}
       </div>
     );
   };
   ```

5. **Add to Admin Navigation**
   ```jsx
   // In your admin sidebar/navigation
   <NavLink to="/admin/locations">
     <Icon name="map" />
     Location Management
   </NavLink>
   ```

---

### **TASK 3: Update Vendor Registration (If Applicable)**

If your frontend has vendor registration:

1. Use the same location fetching logic as user address
2. Submit state/city names (backend will validate)
3. Show message if location is pending review

```jsx
const VendorRegistrationForm = () => {
  // Same location fetching logic as user address
  const [locations, setLocations] = useState([]);
  // ... (same as UserAddressForm)

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    const selectedLocation = locations.find(loc => loc.stateId === selectedStateId);
    const selectedCity = cities.find(city => city.cityId === selectedCityId);
    
    const vendorData = {
      storeName: e.target.storeName.value,
      // ... other fields
      address: {
        street: e.target.street.value,
        city: selectedCity.name,      // Send name
        state: selectedLocation.state, // Send name
        postalCode: e.target.postalCode.value
      }
    };
    
    const response = await registerVendor(vendorData);
    
    // Check if location is pending
    if (response.locationPending) {
      alert('Your location is under review. You will be notified once approved.');
    }
  };
};
```

---

## 🎨 UI/UX Recommendations

### **Loading States**
```jsx
{isLoadingLocations && (
  <div className="loading-spinner">
    <Spinner />
    <p>Loading available locations...</p>
  </div>
)}
```

### **Empty States**
```jsx
{locations.length === 0 && !isLoadingLocations && (
  <div className="empty-state">
    <Icon name="map" />
    <p>No locations available at the moment.</p>
    <p>Please contact support for assistance.</p>
  </div>
)}
```

### **Error Handling**
```jsx
{error && (
  <div className="error-message">
    <Icon name="alert" />
    <p>{error}</p>
    <button onClick={fetchLocations}>Retry</button>
  </div>
)}
```

### **Disabled City Dropdown**
```jsx
<select 
  disabled={!selectedStateId}
  className={!selectedStateId ? 'disabled' : ''}
>
  <option value="">
    {!selectedStateId ? 'Select state first' : 'Select city'}
  </option>
  {/* ... */}
</select>
```

### **Admin Dashboard Styling**
- Use tabs for States/Cities/Requests
- Show badge count on "Pending Requests" tab
- Use color coding: Green (Active), Red (Inactive)
- Add confirmation dialogs for activate/deactivate actions

---

## ✅ Testing Checklist

### **User Address Components**
- [ ] Locations load on component mount
- [ ] State dropdown populates correctly
- [ ] City dropdown updates when state changes
- [ ] City dropdown is disabled when no state selected
- [ ] Form submits with correct state/city names
- [ ] Loading state shows while fetching
- [ ] Error message shows if fetch fails
- [ ] Empty state shows if no locations available

### **Admin Location Management**
- [ ] Can create new states
- [ ] Can create new cities under states
- [ ] Can activate/deactivate states
- [ ] Can activate/deactivate cities
- [ ] Can view pending location requests
- [ ] Can approve vendors with location resolution
- [ ] Can create locations during vendor approval
- [ ] All tables display data correctly

### **General**
- [ ] No console errors
- [ ] API calls include credentials
- [ ] Proper error handling on all requests
- [ ] UI is responsive
- [ ] Accessibility (keyboard navigation, screen readers)

---

## 🚨 Important Notes

1. **Always Send Names, Not IDs**
   - When submitting addresses, send state/city **names** (strings)
   - Backend validates and assigns IDs internally

2. **Include Credentials**
   - All API calls must include `credentials: 'include'`
   - This ensures cookies are sent for authentication

3. **Handle Empty Locations**
   - If no locations are returned, show helpful message
   - Don't let users submit without selecting location

4. **Admin Authentication**
   - Admin endpoints require admin authentication
   - Ensure admin is logged in before accessing location management

5. **Cache Locations**
   - Consider caching location data (it doesn't change frequently)
   - Refresh on component mount or manual refresh

6. **Validation**
   - Ensure both state and city are selected before submission
   - Show validation errors clearly

---

## 📚 API Endpoints Reference

### **Public (User)**
```
GET https://grub-dash-api.vercel.app/api/user/locations
```

### **Admin**
```
GET    https://grub-dash-api.vercel.app/api/admin/locations/states
POST   https://grub-dash-api.vercel.app/api/admin/locations/states
PATCH  https://grub-dash-api.vercel.app/api/admin/locations/states/:id/activate

GET    https://grub-dash-api.vercel.app/api/admin/locations/cities
POST   https://grub-dash-api.vercel.app/api/admin/locations/cities
PATCH  https://grub-dash-api.vercel.app/api/admin/locations/cities/:id/activate

GET    https://grub-dash-api.vercel.app/api/admin/locations/location-requests
PATCH  https://grub-dash-api.vercel.app/api/admin/vendors/approve?vendorId=...
```

---

## 🎯 Success Criteria

✅ All hardcoded location arrays removed  
✅ User address forms use dynamic locations  
✅ Admin can manage locations via dashboard  
✅ Pending location requests are visible and resolvable  
✅ No breaking changes to existing functionality  
✅ Proper error handling and loading states  
✅ Clean, maintainable code  

---

## 📞 Questions?

If you encounter any issues:
1. Check the API response in browser DevTools
2. Verify authentication cookies are being sent
3. Ensure the backend API is running
4. Review the backend documentation in `docs/LOCATION_API_REFERENCE.md`

---

**Good luck with the implementation!** 🚀

If you need any clarification or run into issues, please ask!
