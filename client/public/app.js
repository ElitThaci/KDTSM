// Kosovo Drone Traffic Management System - Client Application
// ============================================================

const API_BASE = '/api';

// Application State
const state = {
  user: null,
  token: null,
  waypoints: [],
  flights: [],
  activeFlights: [],
  droneMarkers: new Map(),
  airplaneMarkers: new Map(),
  selectedDrone: 'mavic3',
  currentTool: null,
  map: null,
  drawnItems: null,
  kosovoBorder: null,
  restrictedZones: [],
  airports: [],
  simulationInterval: null,
  aiRecommendations: null,
  operationArea: null,  // For circle/rectangle flight areas
  flightType: 'waypoint', // 'waypoint' or 'area'
  optimizedRoute: null // For route optimization
};

// Drone specifications - comprehensive list
const DRONES = {
  // DJI Consumer
  mavic3: { type: 'multirotor', model: 'DJI Mavic 3 Pro', manufacturer: 'DJI', weight: 0.895, maxSpeed: 75, maxAltitude: 120, maxFlightTime: 43 },
  mini4: { type: 'multirotor', model: 'DJI Mini 4 Pro', manufacturer: 'DJI', weight: 0.249, maxSpeed: 57, maxAltitude: 120, maxFlightTime: 34 },
  air3: { type: 'multirotor', model: 'DJI Air 3', manufacturer: 'DJI', weight: 0.72, maxSpeed: 75, maxAltitude: 120, maxFlightTime: 46 },
  avata2: { type: 'multirotor', model: 'DJI Avata 2', manufacturer: 'DJI', weight: 0.377, maxSpeed: 60, maxAltitude: 120, maxFlightTime: 23 },
  // DJI Enterprise
  matrice350: { type: 'multirotor', model: 'DJI Matrice 350 RTK', manufacturer: 'DJI', weight: 6.47, maxSpeed: 55, maxAltitude: 120, maxFlightTime: 55 },
  matrice30: { type: 'multirotor', model: 'DJI Matrice 30T', manufacturer: 'DJI', weight: 3.77, maxSpeed: 82, maxAltitude: 120, maxFlightTime: 41 },
  mavic3e: { type: 'multirotor', model: 'DJI Mavic 3 Enterprise', manufacturer: 'DJI', weight: 0.92, maxSpeed: 75, maxAltitude: 120, maxFlightTime: 45 },
  // Autel
  evo2: { type: 'multirotor', model: 'Autel EVO II Pro', manufacturer: 'Autel', weight: 1.19, maxSpeed: 72, maxAltitude: 120, maxFlightTime: 42 },
  evo2enterprise: { type: 'multirotor', model: 'Autel EVO II Enterprise', manufacturer: 'Autel', weight: 1.4, maxSpeed: 70, maxAltitude: 120, maxFlightTime: 40 },
  evonano: { type: 'multirotor', model: 'Autel EVO Nano+', manufacturer: 'Autel', weight: 0.249, maxSpeed: 54, maxAltitude: 120, maxFlightTime: 28 },
  // Parrot
  anafi: { type: 'multirotor', model: 'Parrot Anafi AI', manufacturer: 'Parrot', weight: 0.898, maxSpeed: 55, maxAltitude: 120, maxFlightTime: 32 },
  anafiusa: { type: 'multirotor', model: 'Parrot Anafi USA', manufacturer: 'Parrot', weight: 0.5, maxSpeed: 55, maxAltitude: 120, maxFlightTime: 32 },
  // Skydio
  skydio2: { type: 'multirotor', model: 'Skydio 2+', manufacturer: 'Skydio', weight: 0.775, maxSpeed: 58, maxAltitude: 120, maxFlightTime: 27 },
  skydiox2: { type: 'multirotor', model: 'Skydio X2', manufacturer: 'Skydio', weight: 1.0, maxSpeed: 58, maxAltitude: 120, maxFlightTime: 35 },
  // Fixed Wing
  ebeex: { type: 'fixed-wing', model: 'senseFly eBee X', manufacturer: 'AgEagle', weight: 1.3, maxSpeed: 110, maxAltitude: 120, maxFlightTime: 90 },
  wingtra: { type: 'vtol', model: 'WingtraOne', manufacturer: 'Wingtra', weight: 4.5, maxSpeed: 65, maxAltitude: 120, maxFlightTime: 59 },
  // Other
  fimi: { type: 'multirotor', model: 'FIMI X8 Mini', manufacturer: 'FIMI', weight: 0.245, maxSpeed: 57, maxAltitude: 120, maxFlightTime: 31 },
  hubsan: { type: 'multirotor', model: 'Hubsan Zino Mini Pro', manufacturer: 'Hubsan', weight: 0.249, maxSpeed: 57, maxAltitude: 120, maxFlightTime: 40 }
};

// ============================================================
// Utility Functions
// ============================================================

function showAlert(message, type = 'success') {
  const container = document.getElementById('alertContainer');
  const alert = document.createElement('div');
  alert.className = `alert alert-${type}`;
  alert.innerHTML = `
    <span class="alert-message">${message}</span>
    <button class="alert-close" onclick="this.parentElement.remove()">✕</button>
  `;
  container.appendChild(alert);
  setTimeout(() => alert.remove(), 5000);
}

async function apiCall(endpoint, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (state.token) headers['Authorization'] = `Bearer ${state.token}`;
  
  const response = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || 'API request failed');
  return data;
}

function formatDateTime(date) {
  return new Date(date).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });
}

function getDefaultDateTime() {
  const now = new Date();
  now.setMinutes(now.getMinutes() + 30);
  now.setMinutes(Math.ceil(now.getMinutes() / 5) * 5);
  return now.toISOString().slice(0, 16);
}

// ============================================================
// Authentication
// ============================================================

function initAuth() {
  try {
    const savedToken = localStorage.getItem('kdtms_token');
    const savedUser = localStorage.getItem('kdtms_user');
    
    if (savedToken && savedUser) {
      state.token = savedToken;
      state.user = JSON.parse(savedUser);
      showApp();
      return;
    }
    
    // Show auth container, hide loading
    document.getElementById('loadingScreen').classList.add('hidden');
    document.getElementById('authContainer').style.display = 'flex';
    
    document.querySelectorAll('.auth-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const tabName = tab.dataset.tab;
        document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
        tab.classList.add('active');
        document.querySelector(`[data-form="${tabName}"]`).classList.add('active');
      });
    });
    
    document.getElementById('loginForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const form = e.target;
      const errorEl = document.getElementById('loginError');
      
      try {
        const data = await apiCall('/auth/login', {
          method: 'POST',
          body: JSON.stringify({ email: form.email.value, password: form.password.value })
        });
        
        state.token = data.data.token;
        state.user = data.data.user;
        localStorage.setItem('kdtms_token', state.token);
        localStorage.setItem('kdtms_user', JSON.stringify(state.user));
        errorEl.style.display = 'none';
        showApp();
      } catch (error) {
        errorEl.textContent = error.message;
        errorEl.style.display = 'block';
      }
    });
    
    document.getElementById('registerForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const form = e.target;
      const errorEl = document.getElementById('registerError');
      
      try {
        const data = await apiCall('/auth/register', {
          method: 'POST',
          body: JSON.stringify({
            fullName: `${form.firstName.value} ${form.lastName.value}`.trim(),
            email: form.email.value,
            phone: form.phone.value,
            organization: form.organization.value,
            password: form.password.value
          })
        });
        
        state.token = data.data.token;
        state.user = data.data.user;
        localStorage.setItem('kdtms_token', state.token);
        localStorage.setItem('kdtms_user', JSON.stringify(state.user));
        errorEl.style.display = 'none';
        showApp();
      } catch (error) {
        errorEl.textContent = error.message;
        errorEl.style.display = 'block';
      }
    });
    
  } catch (error) {
    console.error('Auth initialization error:', error);
    // Make sure loading screen is hidden even on error
    document.getElementById('loadingScreen').classList.add('hidden');
    document.getElementById('authContainer').style.display = 'flex';
  }
}

function logout() {
  state.token = null;
  state.user = null;
  localStorage.removeItem('kdtms_token');
  localStorage.removeItem('kdtms_user');
  if (state.simulationInterval) clearInterval(state.simulationInterval);
  document.getElementById('authContainer').style.display = 'flex';
  document.getElementById('appContainer').classList.remove('active');
}

function showApp() {
  document.getElementById('authContainer').style.display = 'none';
  document.getElementById('appContainer').classList.add('active');
  document.getElementById('loadingScreen').classList.add('hidden');
  
  if (state.user) {
    // Handle both fullName (from server) and firstName/lastName formats
    let displayName = state.user.fullName || `${state.user.firstName || ''} ${state.user.lastName || ''}`.trim();
    let initials = 'U';
    
    if (displayName) {
      const nameParts = displayName.split(' ');
      if (nameParts.length >= 2) {
        initials = `${nameParts[0][0]}${nameParts[nameParts.length - 1][0]}`.toUpperCase();
      } else if (nameParts.length === 1 && nameParts[0].length > 0) {
        initials = nameParts[0][0].toUpperCase();
      }
    }
    
    document.getElementById('userAvatar').textContent = initials;
    document.getElementById('userName').textContent = displayName || state.user.email;
  }
  
  if (!state.user?.agreedToTerms) {
    document.getElementById('termsModal').classList.add('active');
  }
  
  initMap();
  initFlightForm();
  initSimulation();
  initAirplaneTracking(); // Start tracking real airplane traffic
  loadFlights();
  document.querySelector('[name="scheduledStart"]').value = getDefaultDateTime();
}

// ============================================================
// Map Initialization
// ============================================================

function initMap() {
  console.log('📍 Initializing map...');
  
  // Small delay to ensure DOM is ready
  setTimeout(() => {
    try {
      const mapContainer = document.getElementById('map');
      console.log('📍 Map container:', mapContainer);
      console.log('📍 Container dimensions:', mapContainer?.offsetWidth, 'x', mapContainer?.offsetHeight);
      
      const kosovoCenter = [42.6026, 20.9030];
      
      state.map = L.map('map', {
        center: kosovoCenter,
        zoom: 9,
        minZoom: 8,
        maxZoom: 18,
        zoomControl: false
      });
      
      console.log('📍 Map created successfully');
      
      L.control.zoom({ position: 'topright' }).addTo(state.map);
      
      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap &copy; CARTO',
        subdomains: 'abcd',
        maxZoom: 20
      }).addTo(state.map);
      
      console.log('📍 Tile layer added');
      
      state.drawnItems = new L.FeatureGroup();
      state.map.addLayer(state.drawnItems);
      
      // Force map to recalculate its size
      state.map.invalidateSize();
      
      loadZones();
      state.map.on('click', onMapClick);
      
      // Invalidate size again after zones load
      setTimeout(() => {
        if (state.map) {
          state.map.invalidateSize();
          console.log('📍 Map size invalidated');
        }
      }, 500);
    } catch (err) {
      console.error('❌ Map initialization error:', err);
    }
  }, 100);
}

async function loadZones() {
  try {
    const data = await apiCall('/zones');
    
    if (!data.data) {
      console.error('No zone data received');
      return;
    }
    
    // Draw Kosovo border as a simple green outline
    if (data.data.border && data.data.border.length > 0) {
      const borderCoords = data.data.border.map(p => [p.lat, p.lng]);
      
      // Store border coordinates for client-side validation
      state.kosovoBorderCoords = borderCoords;
      
      state.kosovoBorder = L.polygon(borderCoords, {
        color: '#00d4aa',
        weight: 3,
        fillColor: '#00d4aa',
        fillOpacity: 0.05,
        dashArray: '10, 5'
      }).addTo(state.map);
    }
    
    // Draw airports
    if (data.data.airports) {
      data.data.airports.forEach(airport => {
      L.circle([airport.position.lat, airport.position.lng], {
        radius: airport.restrictedRadius,
        color: '#ff4757',
        fillColor: '#ff4757',
        fillOpacity: 0.3,
        weight: 2
      }).addTo(state.map).bindPopup(`<strong>⛔ ${airport.name}</strong><br><small>No-Fly Zone: ${airport.restrictedRadius}m</small>`);
      
      L.circle([airport.position.lat, airport.position.lng], {
        radius: airport.cautionRadius,
        color: '#ff9800',
        fillOpacity: 0,
        weight: 1,
        dashArray: '10, 5'
      }).addTo(state.map);
      
      L.marker([airport.position.lat, airport.position.lng], {
        icon: L.divIcon({
          className: 'airport-marker',
          html: '✈️',
          iconSize: [30, 30],
          iconAnchor: [15, 15]
        })
      }).addTo(state.map);
      
      state.airports.push(airport);
    });
    }
    
    // Draw restricted zones
    if (data.data.restrictedZones) {
    data.data.restrictedZones.forEach(zone => {
      let color = '#ff4757';
      let fillOpacity = 0.25;
      
      if (zone.type === 'government' || zone.type === 'diplomatic') {
        color = '#ff9800';
        fillOpacity = 0.2;
      } else if (zone.type === 'heritage') {
        color = '#9b59b6';
        fillOpacity = 0.15;
      } else if (zone.type === 'infrastructure') {
        color = '#e74c3c';
        fillOpacity = 0.2;
      }
      
      L.circle([zone.position.lat, zone.position.lng], {
        radius: zone.radius,
        color: color,
        fillColor: color,
        fillOpacity: fillOpacity,
        weight: 1
      }).addTo(state.map).bindPopup(`<strong>${zone.maxAltitude === 0 ? '⛔' : '⚠️'} ${zone.name}</strong><br><small>${zone.maxAltitude === 0 ? 'No-Fly Zone' : `Max: ${zone.maxAltitude}m`}</small>`);
      
      state.restrictedZones.push(zone);
    });
    }
    
    // Draw urban areas
    if (data.data.urbanAreas) {
    data.data.urbanAreas.forEach(city => {
      L.circleMarker([city.position.lat, city.position.lng], {
        radius: 5,
        color: '#64748b',
        fillColor: '#64748b',
        fillOpacity: 0.5,
        weight: 1
      }).addTo(state.map).bindPopup(`<strong>${city.name}</strong>`);
    });
    }
    
  } catch (error) {
    console.error('Failed to load zones:', error);
    showAlert('Failed to load map zones', 'error');
  }
}

// Store Kosovo border coordinates for client-side validation
state.kosovoBorderCoords = null;

// Calculate distance between two points in meters (Haversine formula)
function getDistanceMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000; // Earth's radius in meters
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lng2 - lng1) * Math.PI / 180;
  
  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  
  return R * c;
}

// Check if a point is inside any restricted zone or airport
function isPointInRestrictedArea(lat, lng) {
  // Check airports first (most critical)
  for (const airport of state.airports) {
    const distance = getDistanceMeters(lat, lng, airport.position.lat, airport.position.lng);
    if (distance <= airport.restrictedRadius) {
      return {
        restricted: true,
        type: 'airport',
        name: airport.name,
        message: `⛔ Cannot place marker inside ${airport.name} no-fly zone (${Math.round(distance)}m from airport, restricted radius: ${airport.restrictedRadius}m)`
      };
    }
  }
  
  // Check restricted zones
  for (const zone of state.restrictedZones) {
    const distance = getDistanceMeters(lat, lng, zone.position.lat, zone.position.lng);
    if (distance <= zone.radius) {
      // Check if it's a complete no-fly zone (maxAltitude === 0)
      if (zone.maxAltitude === 0) {
        return {
          restricted: true,
          type: zone.type,
          name: zone.name,
          message: `⛔ Cannot place marker inside ${zone.name} - this is a no-fly zone`
        };
      } else {
        // It's a restricted zone but not complete no-fly, allow with warning
        return {
          restricted: false,
          warning: true,
          type: zone.type,
          name: zone.name,
          maxAltitude: zone.maxAltitude,
          message: `⚠️ ${zone.name}: Maximum altitude ${zone.maxAltitude}m in this area`
        };
      }
    }
  }
  
  return { restricted: false };
}

// Check if a circle or rectangle overlaps with restricted areas
function doesAreaOverlapRestricted(areaType, center, radius, bounds) {
  // For circles, check center and perimeter points
  if (areaType === 'circle') {
    // Check center
    const centerCheck = isPointInRestrictedArea(center.lat, center.lng);
    if (centerCheck.restricted) return centerCheck;
    
    // Check 8 points around perimeter
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * 2 * Math.PI;
      const latOffset = (radius / 111320) * Math.cos(angle);
      const lngOffset = (radius / (111320 * Math.cos(center.lat * Math.PI / 180))) * Math.sin(angle);
      
      const perimeterCheck = isPointInRestrictedArea(center.lat + latOffset, center.lng + lngOffset);
      if (perimeterCheck.restricted) return perimeterCheck;
    }
    
    // Also check if any restricted zone center is inside our circle
    for (const airport of state.airports) {
      const distance = getDistanceMeters(center.lat, center.lng, airport.position.lat, airport.position.lng);
      if (distance <= radius + airport.restrictedRadius) {
        // Check if circles overlap
        if (distance < radius + airport.restrictedRadius) {
          return {
            restricted: true,
            type: 'airport',
            name: airport.name,
            message: `⛔ Flight area overlaps with ${airport.name} no-fly zone`
          };
        }
      }
    }
    
    for (const zone of state.restrictedZones) {
      if (zone.maxAltitude === 0) {
        const distance = getDistanceMeters(center.lat, center.lng, zone.position.lat, zone.position.lng);
        if (distance < radius + zone.radius) {
          return {
            restricted: true,
            type: zone.type,
            name: zone.name,
            message: `⛔ Flight area overlaps with ${zone.name} no-fly zone`
          };
        }
      }
    }
  }
  
  // For rectangles, check corners and center
  if (areaType === 'rectangle' && bounds) {
    const pointsToCheck = [
      { lat: center.lat, lng: center.lng }, // center
      { lat: bounds.north, lng: bounds.west }, // NW
      { lat: bounds.north, lng: bounds.east }, // NE
      { lat: bounds.south, lng: bounds.east }, // SE
      { lat: bounds.south, lng: bounds.west }, // SW
      { lat: (bounds.north + bounds.south) / 2, lng: bounds.west }, // W middle
      { lat: (bounds.north + bounds.south) / 2, lng: bounds.east }, // E middle
      { lat: bounds.north, lng: (bounds.east + bounds.west) / 2 }, // N middle
      { lat: bounds.south, lng: (bounds.east + bounds.west) / 2 }  // S middle
    ];
    
    for (const point of pointsToCheck) {
      const check = isPointInRestrictedArea(point.lat, point.lng);
      if (check.restricted) return check;
    }
    
    // Check if any restricted zone is inside the rectangle
    for (const airport of state.airports) {
      if (airport.position.lat >= bounds.south && airport.position.lat <= bounds.north &&
          airport.position.lng >= bounds.west && airport.position.lng <= bounds.east) {
        return {
          restricted: true,
          type: 'airport',
          name: airport.name,
          message: `⛔ Flight area contains ${airport.name} no-fly zone`
        };
      }
    }
    
    for (const zone of state.restrictedZones) {
      if (zone.maxAltitude === 0) {
        if (zone.position.lat >= bounds.south && zone.position.lat <= bounds.north &&
            zone.position.lng >= bounds.west && zone.position.lng <= bounds.east) {
          return {
            restricted: true,
            type: zone.type,
            name: zone.name,
            message: `⛔ Flight area contains ${zone.name} no-fly zone`
          };
        }
      }
    }
  }
  
  return { restricted: false };
}

// Ray casting algorithm to check if point is inside Kosovo polygon
function isPointInKosovo(lat, lng) {
  if (!state.kosovoBorderCoords || state.kosovoBorderCoords.length === 0) {
    // Fallback to bounding box if border not loaded
    return lat >= 41.85 && lat <= 43.27 && lng >= 19.91 && lng <= 21.80;
  }
  
  let inside = false;
  const coords = state.kosovoBorderCoords;
  const n = coords.length;
  
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = coords[i][1], yi = coords[i][0]; // lng, lat
    const xj = coords[j][1], yj = coords[j][0];
    
    if (((yi > lat) !== (yj > lat)) && (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  
  return inside;
}

function onMapClick(e) {
  if (state.currentTool !== 'waypoint') return;
  
  const { lat, lng } = e.latlng;
  
  // Check if point is inside Kosovo border polygon
  if (!isPointInKosovo(lat, lng)) {
    showAlert('⚠️ Cannot place waypoint outside Kosovo borders. Please select a location within Kosovo airspace.', 'warning');
    return;
  }
  
  // Check if point is in a restricted area or airport
  const restrictedCheck = isPointInRestrictedArea(lat, lng);
  if (restrictedCheck.restricted) {
    showAlert(restrictedCheck.message, 'error');
    return;
  }
  
  // Show warning if in a restricted altitude zone (but not no-fly)
  if (restrictedCheck.warning) {
    showAlert(restrictedCheck.message, 'warning');
  }
  
  // Check if trajectory from last waypoint to this new one crosses outside Kosovo
  const trajectoryIssue = checkNewWaypointTrajectory(lat, lng);
  if (trajectoryIssue) {
    showAlert(`⚠️ ${trajectoryIssue}`, 'warning');
    return;
  }
  
  addWaypoint(lat, lng);
}

function addWaypoint(lat, lng) {
  // If we're adding waypoints, switch to waypoint mode and clear any drawn area
  if (state.operationArea) {
    state.operationArea = null;
    state.flightType = 'waypoint';
    state.drawnItems.clearLayers();
  }
  
  const index = state.waypoints.length;
  
  const marker = L.marker([lat, lng], {
    icon: L.divIcon({
      className: 'waypoint-marker',
      html: `<div style="background: linear-gradient(135deg, #00d4aa, #00b894); color: #0a0e14; width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 12px; border: 2px solid white; box-shadow: 0 2px 10px rgba(0,0,0,0.3);">${index + 1}</div>`,
      iconSize: [28, 28],
      iconAnchor: [14, 14]
    }),
    draggable: true
  }).addTo(state.map);
  
  // Validate on drag - prevent moving outside Kosovo
  marker.on('dragend', (e) => {
    const pos = e.target.getLatLng();
    
    // Check if new position is inside Kosovo
    if (!isPointInKosovo(pos.lat, pos.lng)) {
      // Revert to original position
      marker.setLatLng([state.waypoints[index].lat, state.waypoints[index].lng]);
      showAlert('⚠️ Cannot move waypoint outside Kosovo borders.', 'warning');
      return;
    }
    
    // Check if new position is in a restricted area
    const restrictedCheck = isPointInRestrictedArea(pos.lat, pos.lng);
    if (restrictedCheck.restricted) {
      marker.setLatLng([state.waypoints[index].lat, state.waypoints[index].lng]);
      showAlert(restrictedCheck.message, 'error');
      return;
    }
    
    // Check if the new position would create a trajectory crossing outside Kosovo
    const trajectoryIssue = checkTrajectoryValidity(index, pos.lat, pos.lng);
    if (trajectoryIssue) {
      marker.setLatLng([state.waypoints[index].lat, state.waypoints[index].lng]);
      showAlert(`⚠️ ${trajectoryIssue}`, 'warning');
      return;
    }
    
    // Show warning if in restricted altitude zone
    if (restrictedCheck.warning) {
      showAlert(restrictedCheck.message, 'warning');
    }
    
    state.waypoints[index].lat = pos.lat;
    state.waypoints[index].lng = pos.lng;
    updateWaypointList();
    updateFlightPath();
  });
  
  state.waypoints.push({ lat, lng, altitude: 100, order: index, marker });
  updateWaypointList();
  updateFlightPath();
  
  if (state.waypoints.length >= 2) {
    document.getElementById('aiPanel').style.display = 'block';
  }
}

// Check if a trajectory between two points crosses outside Kosovo
function doesTrajectoryCrossOutside(lat1, lng1, lat2, lng2) {
  // Sample points along the trajectory
  const numSamples = 20;
  
  for (let i = 1; i < numSamples; i++) {
    const t = i / numSamples;
    const lat = lat1 + t * (lat2 - lat1);
    const lng = lng1 + t * (lng2 - lng1);
    
    if (!isPointInKosovo(lat, lng)) {
      return { lat, lng, t };
    }
  }
  
  return null;
}

// Check if adding/moving a waypoint would create invalid trajectories
function checkTrajectoryValidity(waypointIndex, newLat, newLng) {
  const waypoints = state.waypoints;
  
  // Check trajectory TO this waypoint (from previous waypoint)
  if (waypointIndex > 0) {
    const prevWp = waypoints[waypointIndex - 1];
    const crossing = doesTrajectoryCrossOutside(prevWp.lat, prevWp.lng, newLat, newLng);
    if (crossing) {
      return `Flight path from waypoint ${waypointIndex} to ${waypointIndex + 1} crosses outside Kosovo borders.`;
    }
  }
  
  // Check trajectory FROM this waypoint (to next waypoint)
  if (waypointIndex < waypoints.length - 1) {
    const nextWp = waypoints[waypointIndex + 1];
    const crossing = doesTrajectoryCrossOutside(newLat, newLng, nextWp.lat, nextWp.lng);
    if (crossing) {
      return `Flight path from waypoint ${waypointIndex + 1} to ${waypointIndex + 2} crosses outside Kosovo borders.`;
    }
  }
  
  return null;
}

// Check trajectory when adding a NEW waypoint
function checkNewWaypointTrajectory(newLat, newLng) {
  if (state.waypoints.length === 0) return null;
  
  // Check path from last waypoint to this new one
  const lastWp = state.waypoints[state.waypoints.length - 1];
  const crossing = doesTrajectoryCrossOutside(lastWp.lat, lastWp.lng, newLat, newLng);
  
  if (crossing) {
    return `Flight path to this waypoint would cross outside Kosovo borders.`;
  }
  
  return null;
}

function updateWaypointList() {
  const list = document.getElementById('waypointList');
  
  if (state.waypoints.length === 0) {
    list.innerHTML = '<div class="empty-waypoints">Click on the map to add waypoints</div>';
    return;
  }
  
  list.innerHTML = state.waypoints.map((wp, i) => `
    <div class="waypoint-item">
      <div class="waypoint-marker">${i + 1}</div>
      <div class="waypoint-coords">${wp.lat.toFixed(5)}, ${wp.lng.toFixed(5)}</div>
      <button class="waypoint-remove" onclick="removeWaypoint(${i})">✕</button>
    </div>
  `).join('');
}

function removeWaypoint(index) {
  const wp = state.waypoints[index];
  if (wp.marker) state.map.removeLayer(wp.marker);
  
  state.waypoints.splice(index, 1);
  
  state.waypoints.forEach((wp, i) => {
    wp.order = i;
    if (wp.marker) {
      wp.marker.setIcon(L.divIcon({
        className: 'waypoint-marker',
        html: `<div style="background: linear-gradient(135deg, #00d4aa, #00b894); color: #0a0e14; width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 12px; border: 2px solid white;">${i + 1}</div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14]
      }));
    }
  });
  
  updateWaypointList();
  updateFlightPath();
  
  if (state.waypoints.length < 2) {
    document.getElementById('aiPanel').style.display = 'none';
  }
}

let flightPathLine = null;
let invalidPathLines = [];

function updateFlightPath() {
  // Remove old lines
  if (flightPathLine) state.map.removeLayer(flightPathLine);
  invalidPathLines.forEach(line => state.map.removeLayer(line));
  invalidPathLines = [];
  
  if (state.waypoints.length < 2) return;
  
  // Check each segment for validity
  const validSegments = [];
  const invalidSegments = [];
  
  for (let i = 0; i < state.waypoints.length - 1; i++) {
    const wp1 = state.waypoints[i];
    const wp2 = state.waypoints[i + 1];
    const segment = [[wp1.lat, wp1.lng], [wp2.lat, wp2.lng]];
    
    const crossing = doesTrajectoryCrossOutside(wp1.lat, wp1.lng, wp2.lat, wp2.lng);
    if (crossing) {
      invalidSegments.push(segment);
    } else {
      validSegments.push(segment);
    }
  }
  
  // Draw valid segments in green
  if (validSegments.length > 0) {
    validSegments.forEach(segment => {
      const line = L.polyline(segment, {
        color: '#00d4aa',
        weight: 3,
        opacity: 0.8,
        dashArray: '10, 5'
      }).addTo(state.map);
      if (!flightPathLine) flightPathLine = line;
    });
  }
  
  // Draw invalid segments in red with warning
  if (invalidSegments.length > 0) {
    invalidSegments.forEach(segment => {
      const line = L.polyline(segment, {
        color: '#ff4757',
        weight: 4,
        opacity: 0.9,
        dashArray: '5, 10'
      }).addTo(state.map);
      
      line.bindPopup('⚠️ This flight path segment crosses outside Kosovo borders!');
      invalidPathLines.push(line);
    });
  }
}

function clearAll() {
  state.waypoints.forEach(wp => { if (wp.marker) state.map.removeLayer(wp.marker); });
  state.waypoints = [];
  state.operationArea = null;
  state.flightType = 'waypoint';
  if (flightPathLine) { state.map.removeLayer(flightPathLine); flightPathLine = null; }
  invalidPathLines.forEach(line => state.map.removeLayer(line));
  invalidPathLines = [];
  state.drawnItems.clearLayers();
  updateWaypointList();
  document.getElementById('aiPanel').style.display = 'none';
  state.aiRecommendations = null;
}

// ============================================================
// Flight Form
// ============================================================

function initFlightForm() {
  document.querySelectorAll('.tool-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tool = btn.dataset.tool;
      
      if (tool === 'clear') {
        clearAll();
        showAlert('Flight path cleared', 'warning');
        return;
      }
      
      document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
      
      if (state.currentTool === tool) {
        state.currentTool = null;
      } else {
        btn.classList.add('active');
        state.currentTool = tool;
        
        if (tool === 'waypoint') {
          showAlert('Click on the map to add waypoints', 'success');
        } else if (tool === 'circle' || tool === 'rectangle') {
          showAlert(`Draw a ${tool} on the map`, 'success');
          initDrawing(tool);
        }
      }
    });
  });
  
  // Drone selection dropdown
  const droneSelect = document.getElementById('droneSelect');
  const diyOptions = document.getElementById('diyDroneOptions');
  
  droneSelect.addEventListener('change', () => {
    state.selectedDrone = droneSelect.value;
    
    // Show/hide DIY options
    if (droneSelect.value === 'diy') {
      diyOptions.style.display = 'block';
    } else {
      diyOptions.style.display = 'none';
    }
  });
  
  document.getElementById('getAiRecommendations').addEventListener('click', getAIRecommendations);
  document.getElementById('getRiskAnalysis').addEventListener('click', getRiskAnalysis);
  document.getElementById('getRouteOptimization').addEventListener('click', getRouteOptimization);
  document.getElementById('analyticsBtn').addEventListener('click', openAnalyticsDashboard);
  document.getElementById('closeAnalyticsModal').addEventListener('click', () => {
    document.getElementById('analyticsModal').classList.remove('active');
  });
  document.getElementById('flightForm').addEventListener('submit', submitFlightRequest);
  
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const view = btn.dataset.view;
      if (!view) return; // Skip analytics button
      document.querySelectorAll('.nav-btn[data-view]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      if (view === 'flights') {
        document.getElementById('flightFormContainer').style.display = 'none';
        document.getElementById('flightListContainer').classList.add('active');
        loadFlights();
      } else {
        document.getElementById('flightFormContainer').style.display = 'block';
        document.getElementById('flightListContainer').classList.remove('active');
      }
    });
  });
  
  document.getElementById('logoutBtn').addEventListener('click', logout);
  
  document.getElementById('acceptTerms').addEventListener('click', async () => {
    try {
      await apiCall('/auth/agree-terms', { method: 'POST' });
      state.user.agreedToTerms = true;
      localStorage.setItem('kdtms_user', JSON.stringify(state.user));
      document.getElementById('termsModal').classList.remove('active');
      showAlert('Terms accepted. You can now submit flight requests.', 'success');
    } catch (error) {
      showAlert('Failed to accept terms', 'error');
    }
  });
  
  document.getElementById('declineTerms').addEventListener('click', () => {
    showAlert('You must accept the terms to use this system', 'warning');
    logout();
  });
  
  document.getElementById('closeTermsModal').addEventListener('click', () => {
    if (state.user?.agreedToTerms) document.getElementById('termsModal').classList.remove('active');
  });
  
  document.getElementById('closeSubmissionModal').addEventListener('click', () => {
    document.getElementById('submissionModal').classList.remove('active');
  });
  document.getElementById('closeSubmission').addEventListener('click', () => {
    document.getElementById('submissionModal').classList.remove('active');
  });
}

function initDrawing(type) {
  let drawHandler;
  
  if (type === 'circle') {
    drawHandler = new L.Draw.Circle(state.map, {
      shapeOptions: { color: '#00d4aa', fillColor: '#00d4aa', fillOpacity: 0.2 },
      repeatMode: false
    });
  } else if (type === 'rectangle') {
    drawHandler = new L.Draw.Rectangle(state.map, {
      shapeOptions: { color: '#00d4aa', fillColor: '#00d4aa', fillOpacity: 0.2 }
    });
  }
  
  if (drawHandler) {
    drawHandler.enable();
    
    state.map.once('draw:created', (e) => {
      const layer = e.layer;
      const layerType = e.layerType;
      
      let isValid = true;
      let operationArea = null;
      let restrictedError = null;
      
      if (layerType === 'circle') {
        const center = layer.getLatLng();
        const radius = layer.getRadius();
        
        // Check center is in Kosovo
        if (!isPointInKosovo(center.lat, center.lng)) {
          isValid = false;
        } else {
          // Check points around the circle perimeter (8 points)
          const numPoints = 8;
          for (let i = 0; i < numPoints; i++) {
            const angle = (i / numPoints) * 2 * Math.PI;
            const latOffset = (radius / 111320) * Math.cos(angle);
            const lngOffset = (radius / (111320 * Math.cos(center.lat * Math.PI / 180))) * Math.sin(angle);
            
            if (!isPointInKosovo(center.lat + latOffset, center.lng + lngOffset)) {
              isValid = false;
              break;
            }
          }
        }
        
        // Check for restricted areas
        if (isValid) {
          const restrictedCheck = doesAreaOverlapRestricted('circle', 
            { lat: center.lat, lng: center.lng }, 
            radius, 
            null
          );
          if (restrictedCheck.restricted) {
            isValid = false;
            restrictedError = restrictedCheck.message;
          }
        }
        
        if (isValid) {
          operationArea = {
            type: 'circle',
            center: { lat: center.lat, lng: center.lng },
            radius: radius
          };
        }
      } else if (layerType === 'rectangle') {
        const bounds = layer.getBounds();
        
        // Check all four corners are in Kosovo
        const corners = [
          { lat: bounds.getNorth(), lng: bounds.getWest() },
          { lat: bounds.getNorth(), lng: bounds.getEast() },
          { lat: bounds.getSouth(), lng: bounds.getEast() },
          { lat: bounds.getSouth(), lng: bounds.getWest() }
        ];
        
        for (const corner of corners) {
          if (!isPointInKosovo(corner.lat, corner.lng)) {
            isValid = false;
            break;
          }
        }
        
        // Check for restricted areas
        if (isValid) {
          const restrictedCheck = doesAreaOverlapRestricted('rectangle', 
            { lat: bounds.getCenter().lat, lng: bounds.getCenter().lng },
            null,
            {
              north: bounds.getNorth(),
              south: bounds.getSouth(),
              east: bounds.getEast(),
              west: bounds.getWest()
            }
          );
          if (restrictedCheck.restricted) {
            isValid = false;
            restrictedError = restrictedCheck.message;
          }
        }
        
        if (isValid) {
          operationArea = {
            type: 'rectangle',
            center: { lat: bounds.getCenter().lat, lng: bounds.getCenter().lng },
            bounds: {
              north: bounds.getNorth(),
              south: bounds.getSouth(),
              east: bounds.getEast(),
              west: bounds.getWest()
            }
          };
        }
      }
      
      // Reset tool state
      state.currentTool = null;
      document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
      
      if (!isValid) {
        if (restrictedError) {
          showAlert(restrictedError, 'error');
        } else {
          showAlert('⚠️ Cannot draw area outside Kosovo borders. The entire area must be within Kosovo airspace.', 'warning');
        }
        return;
      }
      
      // Area is valid - add it
      state.drawnItems.addLayer(layer);
      
      // Store operation area for flight submission
      state.operationArea = operationArea;
      state.flightType = 'area';
      
      // Clear any existing waypoints when using area mode
      state.waypoints.forEach(wp => { if (wp.marker) state.map.removeLayer(wp.marker); });
      state.waypoints = [];
      updateWaypointList();
      
      // Show AI panel since we have a valid area
      document.getElementById('aiPanel').style.display = 'block';
      
      showAlert(`✅ Flight area marked (${layerType}). Ready to submit or get AI recommendations.`, 'success');
    });
    
    // Handle draw cancel/stop
    state.map.once('draw:drawstop', () => {
      state.currentTool = null;
      document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
    });
  }
}

async function getAIRecommendations() {
  // Check if we have waypoints OR an operation area
  const hasWaypoints = state.waypoints.length >= 1;
  const hasOperationArea = state.operationArea && state.flightType === 'area';
  
  if (!hasWaypoints && !hasOperationArea) {
    showAlert('Add at least one waypoint or draw a flight area first', 'warning');
    return;
  }
  
  const form = document.getElementById('flightForm');
  const scheduledStart = form.scheduledStart.value;
  const duration = parseInt(form.duration.value);
  
  if (!scheduledStart) {
    showAlert('Please select a start date/time', 'warning');
    return;
  }
  
  const scheduledEnd = new Date(new Date(scheduledStart).getTime() + duration * 60000).toISOString();
  
  try {
    showAlert('Analyzing flight conditions...', 'success');
    
    // Get drone data for AI analysis
    let droneForAI;
    if (state.selectedDrone === 'diy') {
      droneForAI = {
        type: document.getElementById('diyType').value,
        model: document.getElementById('diyModel').value || 'Custom DIY Drone',
        manufacturer: 'DIY',
        weight: parseFloat(document.getElementById('diyWeight').value),
        maxSpeed: parseInt(document.getElementById('diySpeed').value),
        maxAltitude: parseInt(document.getElementById('diyMaxAlt').value),
        maxFlightTime: parseInt(document.getElementById('diyFlightTime').value)
      };
    } else {
      droneForAI = DRONES[state.selectedDrone];
    }
    
    // Build request based on flight type
    const requestData = {
      scheduledStart,
      scheduledEnd,
      drone: droneForAI,
      maxAltitude: parseInt(form.maxAltitude.value)
    };
    
    if (hasOperationArea) {
      requestData.operationArea = state.operationArea;
      requestData.waypoints = [{ lat: state.operationArea.center.lat, lng: state.operationArea.center.lng }];
    } else {
      requestData.waypoints = state.waypoints.map(wp => ({ lat: wp.lat, lng: wp.lng, altitude: wp.altitude }));
    }
    
    const data = await apiCall('/ai/recommendations', {
      method: 'POST',
      body: JSON.stringify(requestData)
    });
    
    state.aiRecommendations = data.data.recommendations;
    updateAIPanel(data.data.recommendations);
    
  } catch (error) {
    console.error('AI recommendations error:', error);
    showAlert('Failed to get AI recommendations', 'error');
  }
}

function updateAIPanel(rec) {
  const panel = document.getElementById('aiPanel');
  panel.style.display = 'block';
  
  const scoreCircle = document.getElementById('aiScoreCircle');
  scoreCircle.textContent = rec.overallScore;
  scoreCircle.className = 'score-circle';
  if (rec.overallScore >= 75) scoreCircle.classList.add('high');
  else if (rec.overallScore >= 50) scoreCircle.classList.add('medium');
  else scoreCircle.classList.add('low');
  
  document.getElementById('weatherScore').textContent = rec.weatherScore;
  document.getElementById('trafficScore').textContent = rec.trafficScore;
  document.getElementById('terrainScore').textContent = rec.terrainScore;
  
  document.getElementById('aiSuggestions').innerHTML = rec.suggestions.map(s => `<div class="ai-suggestion">${s}</div>`).join('');
  
  if (rec.weather?.current) {
    document.getElementById('weatherTemp').textContent = `${rec.weather.current.temperature}°C`;
    document.getElementById('weatherWind').textContent = `${rec.weather.current.windSpeed} km/h`;
    document.getElementById('weatherVis').textContent = `${(rec.weather.current.visibility / 1000).toFixed(1)} km`;
  }
}

// ============================================================
// AI Feature #3: Smart Risk Analysis
// ============================================================

async function getRiskAnalysis() {
  const hasWaypoints = state.waypoints.length >= 1;
  const hasOperationArea = state.operationArea && state.flightType === 'area';
  
  if (!hasWaypoints && !hasOperationArea) {
    showAlert('Add waypoints or draw a flight area first', 'warning');
    return;
  }
  
  const form = document.getElementById('flightForm');
  const scheduledStart = form.scheduledStart.value;
  const duration = parseInt(form.duration.value);
  
  if (!scheduledStart) {
    showAlert('Please select a start date/time', 'warning');
    return;
  }
  
  const scheduledEnd = new Date(new Date(scheduledStart).getTime() + duration * 60000).toISOString();
  
  try {
    showAlert('🔍 Analyzing flight risks...', 'success');
    
    let droneData = state.selectedDrone === 'diy' ? {
      type: document.getElementById('diyType').value,
      model: document.getElementById('diyModel').value || 'Custom DIY Drone',
      weight: parseFloat(document.getElementById('diyWeight').value),
      maxSpeed: parseInt(document.getElementById('diySpeed').value),
      maxFlightTime: parseInt(document.getElementById('diyFlightTime').value)
    } : DRONES[state.selectedDrone];
    
    const requestData = {
      scheduledStart,
      scheduledEnd,
      drone: droneData,
      maxAltitude: parseInt(form.maxAltitude.value)
    };
    
    if (hasOperationArea) {
      requestData.operationArea = state.operationArea;
    } else {
      requestData.waypoints = state.waypoints.map(wp => ({ lat: wp.lat, lng: wp.lng, altitude: wp.altitude }));
    }
    
    const data = await apiCall('/ai/risk-analysis', {
      method: 'POST',
      body: JSON.stringify(requestData)
    });
    
    displayRiskAnalysis(data.data.riskAnalysis);
    
  } catch (error) {
    console.error('Risk analysis error:', error);
    showAlert('Failed to perform risk analysis', 'error');
  }
}

function displayRiskAnalysis(risk) {
  const panel = document.getElementById('riskPanel');
  const content = document.getElementById('riskContent');
  panel.style.display = 'block';
  
  const riskColor = risk.overallRiskLevel === 'low' ? '#00d4aa' : 
                    risk.overallRiskLevel === 'moderate' ? '#ffc107' :
                    risk.overallRiskLevel === 'elevated' ? '#ff9800' : '#ff4757';
  
  content.innerHTML = `
    <div style="text-align: center; margin-bottom: 1.5rem;">
      <div style="font-size: 3rem; font-weight: bold; color: ${riskColor};">${risk.overallRisk}%</div>
      <div style="font-size: 1.1rem; color: ${riskColor}; text-transform: uppercase; font-weight: 600;">${risk.overallRiskLevel} Risk</div>
      <div style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 0.5rem;">Confidence: ${risk.confidence}%</div>
    </div>
    
    <div style="background: var(--bg-secondary); border-radius: 10px; padding: 1rem; margin-bottom: 1rem;">
      <div style="font-weight: 600; margin-bottom: 0.75rem;">📊 Risk Categories</div>
      ${Object.entries(risk.categories).map(([name, cat]) => `
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.5rem 0; border-bottom: 1px solid var(--border-color);">
          <span style="text-transform: capitalize;">${name}</span>
          <span style="padding: 0.25rem 0.75rem; border-radius: 20px; font-size: 0.8rem; background: ${cat.level === 'low' ? 'rgba(0,212,170,0.2)' : cat.level === 'moderate' ? 'rgba(255,193,7,0.2)' : 'rgba(255,71,87,0.2)'}; color: ${cat.level === 'low' ? '#00d4aa' : cat.level === 'moderate' ? '#ffc107' : '#ff4757'};">
            ${cat.score}% - ${cat.level}
          </span>
        </div>
      `).join('')}
    </div>
    
    ${risk.factors.length > 0 ? `
    <div style="background: rgba(255,71,87,0.1); border-radius: 10px; padding: 1rem; margin-bottom: 1rem;">
      <div style="font-weight: 600; margin-bottom: 0.75rem; color: #ff4757;">⚠️ Risk Factors</div>
      ${risk.factors.slice(0, 5).map(f => `
        <div style="padding: 0.5rem 0; font-size: 0.9rem; color: var(--text-secondary);">
          • ${f.message}
        </div>
      `).join('')}
    </div>
    ` : ''}
    
    ${risk.mitigations.length > 0 ? `
    <div style="background: rgba(0,212,170,0.1); border-radius: 10px; padding: 1rem; margin-bottom: 1rem;">
      <div style="font-weight: 600; margin-bottom: 0.75rem; color: #00d4aa;">✅ Mitigations</div>
      ${risk.mitigations.slice(0, 4).map(m => `
        <div style="padding: 0.5rem 0; font-size: 0.9rem; color: var(--text-secondary);">
          • ${m}
        </div>
      `).join('')}
    </div>
    ` : ''}
    
    <div style="background: var(--bg-secondary); border-radius: 10px; padding: 1rem;">
      <div style="font-weight: 600; margin-bottom: 0.5rem;">📈 Historical Data</div>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; font-size: 0.85rem;">
        <div>Similar flights: <strong>${risk.historicalData.similarFlightsInArea}</strong></div>
        <div>Success rate: <strong>${risk.historicalData.successRate}%</strong></div>
        <div>Avg delay: <strong>${risk.historicalData.averageDelay} min</strong></div>
        <div>Recent incidents: <strong>${risk.historicalData.incidentsLast30Days}</strong></div>
      </div>
    </div>
    
    <div style="margin-top: 1rem; padding: 1rem; background: linear-gradient(135deg, rgba(102,126,234,0.1), rgba(118,75,162,0.1)); border-radius: 10px;">
      <div style="font-weight: 600; color: var(--text-primary);">💡 Recommendation</div>
      <div style="font-size: 0.9rem; color: var(--text-secondary); margin-top: 0.5rem;">${risk.recommendation}</div>
    </div>
  `;
}

// ============================================================
// AI Feature #4: Route Optimization
// ============================================================

async function getRouteOptimization() {
  if (state.waypoints.length < 2) {
    showAlert('Add at least 2 waypoints for route optimization', 'warning');
    return;
  }
  
  try {
    showAlert('🛣️ Optimizing route...', 'success');
    
    let droneData = state.selectedDrone === 'diy' ? {
      type: document.getElementById('diyType').value,
      model: document.getElementById('diyModel').value || 'Custom DIY Drone',
      weight: parseFloat(document.getElementById('diyWeight').value),
      maxSpeed: parseInt(document.getElementById('diySpeed').value),
      maxFlightTime: parseInt(document.getElementById('diyFlightTime').value)
    } : DRONES[state.selectedDrone];
    
    const data = await apiCall('/ai/optimize-route', {
      method: 'POST',
      body: JSON.stringify({
        waypoints: state.waypoints.map(wp => ({ lat: wp.lat, lng: wp.lng, altitude: wp.altitude || 100 })),
        drone: droneData,
        optimizationGoal: 'balanced'
      })
    });
    
    displayRouteOptimization(data.data.optimization);
    
  } catch (error) {
    console.error('Route optimization error:', error);
    showAlert('Failed to optimize route', 'error');
  }
}

function displayRouteOptimization(opt) {
  const panel = document.getElementById('routePanel');
  const content = document.getElementById('routeContent');
  panel.style.display = 'block';
  
  content.innerHTML = `
    <div style="text-align: center; margin-bottom: 1.5rem;">
      <div style="font-size: 2.5rem;">🛣️</div>
      <div style="font-size: 1.2rem; font-weight: 600; color: var(--accent-primary);">${opt.method} Optimization</div>
    </div>
    
    <div style="background: linear-gradient(135deg, rgba(0,212,170,0.1), rgba(0,184,148,0.1)); border-radius: 10px; padding: 1rem; margin-bottom: 1rem;">
      <div style="font-weight: 600; margin-bottom: 0.75rem; color: #00d4aa;">📊 Improvements</div>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
        <div style="text-align: center;">
          <div style="font-size: 1.5rem; font-weight: bold; color: #00d4aa;">${opt.improvements.distanceSavedPercent}%</div>
          <div style="font-size: 0.8rem; color: var(--text-secondary);">Distance Saved</div>
        </div>
        <div style="text-align: center;">
          <div style="font-size: 1.5rem; font-weight: bold; color: #00d4aa;">${opt.improvements.distanceSaved}m</div>
          <div style="font-size: 0.8rem; color: var(--text-secondary);">Meters Saved</div>
        </div>
        <div style="text-align: center;">
          <div style="font-size: 1.5rem; font-weight: bold; color: #4facfe;">${opt.improvements.estimatedTimeSaved} min</div>
          <div style="font-size: 0.8rem; color: var(--text-secondary);">Time Saved</div>
        </div>
        <div style="text-align: center;">
          <div style="font-size: 1.5rem; font-weight: bold; color: #4facfe;">${opt.improvements.batteryEfficiencyGain}%</div>
          <div style="font-size: 0.8rem; color: var(--text-secondary);">Battery Efficiency</div>
        </div>
      </div>
    </div>
    
    <div style="background: var(--bg-secondary); border-radius: 10px; padding: 1rem; margin-bottom: 1rem;">
      <div style="font-weight: 600; margin-bottom: 0.75rem;">📏 Distance Comparison</div>
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <span>Original:</span>
        <span style="color: var(--text-secondary);">${opt.improvements.originalDistance}m</span>
      </div>
      <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 0.5rem;">
        <span>Optimized:</span>
        <span style="color: #00d4aa; font-weight: 600;">${opt.improvements.optimizedDistance}m</span>
      </div>
    </div>
    
    ${opt.suggestions.length > 0 ? `
    <div style="background: rgba(79,172,254,0.1); border-radius: 10px; padding: 1rem; margin-bottom: 1rem;">
      <div style="font-weight: 600; margin-bottom: 0.75rem; color: #4facfe;">💡 Suggestions</div>
      ${opt.suggestions.map(s => `
        <div style="padding: 0.5rem 0; font-size: 0.9rem; display: flex; align-items: center; gap: 0.5rem;">
          <span>${s.icon}</span>
          <span style="color: var(--text-secondary);">${s.message}</span>
        </div>
      `).join('')}
    </div>
    ` : ''}
    
    <div style="background: var(--bg-secondary); border-radius: 10px; padding: 1rem;">
      <div style="font-weight: 600; margin-bottom: 0.75rem;">🔄 Alternative Routes</div>
      ${opt.alternativeRoutes.map(route => `
        <div style="padding: 0.75rem; margin-bottom: 0.5rem; background: var(--bg-primary); border-radius: 8px;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span style="font-weight: 500;">${route.name}</span>
            <span style="color: var(--text-secondary); font-size: 0.85rem;">${route.distance}m</span>
          </div>
          <div style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 0.25rem;">${route.benefit}</div>
        </div>
      `).join('')}
    </div>
    
    <button onclick="applyOptimizedRoute()" class="btn btn-primary" style="width: 100%; margin-top: 1rem;">
      ✅ Apply Optimized Route
    </button>
  `;
  
  // Store optimized route for applying
  state.optimizedRoute = opt.optimizedRoute;
}

function applyOptimizedRoute() {
  if (!state.optimizedRoute || state.optimizedRoute.length === 0) {
    showAlert('No optimized route available', 'warning');
    return;
  }
  
  // Clear current waypoints
  state.waypoints.forEach(wp => { if (wp.marker) state.map.removeLayer(wp.marker); });
  state.waypoints = [];
  
  // Add optimized waypoints
  state.optimizedRoute.forEach(wp => {
    addWaypoint(wp.lat, wp.lng);
    // Update altitude if different
    if (state.waypoints.length > 0) {
      state.waypoints[state.waypoints.length - 1].altitude = wp.altitude;
    }
  });
  
  showAlert('✅ Optimized route applied!', 'success');
}

// ============================================================
// AI Feature #5: Predictive Analytics Dashboard
// ============================================================

async function openAnalyticsDashboard() {
  const modal = document.getElementById('analyticsModal');
  const body = document.getElementById('analyticsBody');
  modal.classList.add('active');
  
  body.innerHTML = `
    <div style="text-align: center; padding: 2rem;">
      <div class="loading-spinner"></div>
      <p style="margin-top: 1rem; color: var(--text-secondary);">Loading analytics...</p>
    </div>
  `;
  
  try {
    const data = await apiCall('/ai/predictive-analytics?days=7');
    displayAnalyticsDashboard(data.data.analytics);
  } catch (error) {
    console.error('Analytics error:', error);
    body.innerHTML = `
      <div style="text-align: center; padding: 2rem; color: #ff4757;">
        <div style="font-size: 3rem;">❌</div>
        <p>Failed to load analytics</p>
      </div>
    `;
  }
}

function displayAnalyticsDashboard(analytics) {
  const body = document.getElementById('analyticsBody');
  
  body.innerHTML = `
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem;">
      
      <!-- Best Flying Windows -->
      <div style="background: var(--bg-secondary); border-radius: 12px; padding: 1.25rem;">
        <h4 style="margin: 0 0 1rem 0; display: flex; align-items: center; gap: 0.5rem;">
          🌟 Best Flying Windows
        </h4>
        <div style="max-height: 200px; overflow-y: auto;">
          ${analytics.bestFlyingWindows.slice(0, 6).map(w => `
            <div style="padding: 0.75rem; margin-bottom: 0.5rem; background: var(--bg-primary); border-radius: 8px; border-left: 3px solid ${w.score > 85 ? '#00d4aa' : w.score > 70 ? '#ffc107' : '#ff9800'};">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <span style="font-weight: 500;">${w.date} ${w.startTime}-${w.endTime}</span>
                <span style="padding: 0.2rem 0.6rem; border-radius: 20px; font-size: 0.75rem; background: ${w.score > 85 ? 'rgba(0,212,170,0.2)' : 'rgba(255,193,7,0.2)'}; color: ${w.score > 85 ? '#00d4aa' : '#ffc107'};">
                  ${w.label} (${w.score})
                </span>
              </div>
              <div style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 0.25rem;">
                Wind: ${w.conditions.wind}
              </div>
            </div>
          `).join('')}
        </div>
      </div>
      
      <!-- Weekly Trends -->
      <div style="background: var(--bg-secondary); border-radius: 12px; padding: 1.25rem;">
        <h4 style="margin: 0 0 1rem 0; display: flex; align-items: center; gap: 0.5rem;">
          📈 Weekly Trends
        </h4>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
          <div style="text-align: center; padding: 1rem; background: var(--bg-primary); border-radius: 8px;">
            <div style="font-size: 1.75rem; font-weight: bold; color: #00d4aa;">${analytics.weeklyTrends.totalFlights}</div>
            <div style="font-size: 0.8rem; color: var(--text-secondary);">Total Flights</div>
          </div>
          <div style="text-align: center; padding: 1rem; background: var(--bg-primary); border-radius: 8px;">
            <div style="font-size: 1.75rem; font-weight: bold; color: #4facfe;">${analytics.weeklyTrends.averageFlightDuration}m</div>
            <div style="font-size: 0.8rem; color: var(--text-secondary);">Avg Duration</div>
          </div>
          <div style="text-align: center; padding: 1rem; background: var(--bg-primary); border-radius: 8px;">
            <div style="font-size: 1.25rem; font-weight: bold; color: #667eea;">${analytics.weeklyTrends.peakDay}</div>
            <div style="font-size: 0.8rem; color: var(--text-secondary);">Peak Day</div>
          </div>
          <div style="text-align: center; padding: 1rem; background: var(--bg-primary); border-radius: 8px;">
            <div style="font-size: 1.25rem; font-weight: bold; color: #764ba2;">+${analytics.weeklyTrends.growthRate}%</div>
            <div style="font-size: 0.8rem; color: var(--text-secondary);">Growth</div>
          </div>
        </div>
      </div>
      
      <!-- Airspace Congestion Forecast -->
      <div style="background: var(--bg-secondary); border-radius: 12px; padding: 1.25rem;">
        <h4 style="margin: 0 0 1rem 0; display: flex; align-items: center; gap: 0.5rem;">
          🚦 Airspace Congestion (7 Day)
        </h4>
        <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
          ${analytics.airspaceForeceast.slice(0, 7).map(day => `
            <div style="flex: 1; min-width: 70px; text-align: center; padding: 0.75rem 0.5rem; background: var(--bg-primary); border-radius: 8px;">
              <div style="font-size: 0.75rem; color: var(--text-secondary);">${day.dayName}</div>
              <div style="font-size: 1.25rem; font-weight: bold; margin: 0.25rem 0; color: ${day.overallCongestion < 40 ? '#00d4aa' : day.overallCongestion < 60 ? '#ffc107' : '#ff4757'};">
                ${day.overallCongestion}%
              </div>
              <div style="font-size: 0.7rem; color: var(--text-secondary);">${day.isWeekend ? '📅' : '💼'}</div>
            </div>
          `).join('')}
        </div>
      </div>
      
      <!-- Drone Recommendations -->
      <div style="background: var(--bg-secondary); border-radius: 12px; padding: 1.25rem;">
        <h4 style="margin: 0 0 1rem 0; display: flex; align-items: center; gap: 0.5rem;">
          🚁 Drone Recommendations
        </h4>
        ${analytics.droneRecommendations.map(rec => `
          <div style="padding: 0.75rem; margin-bottom: 0.5rem; background: var(--bg-primary); border-radius: 8px;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span style="font-weight: 500; color: #00d4aa;">${rec.recommended}</span>
              <span style="font-size: 0.8rem; color: var(--text-secondary);">${rec.confidence}% match</span>
            </div>
            <div style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 0.25rem;">
              <strong>${rec.conditions}:</strong> ${rec.reason}
            </div>
          </div>
        `).join('')}
      </div>
      
      <!-- Maintenance Predictions -->
      <div style="background: var(--bg-secondary); border-radius: 12px; padding: 1.25rem;">
        <h4 style="margin: 0 0 1rem 0; display: flex; align-items: center; gap: 0.5rem;">
          🔧 Maintenance Predictions
        </h4>
        ${analytics.maintenancePredictions.map(m => `
          <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.5rem 0; border-bottom: 1px solid var(--border-color);">
            <span>${m.component}</span>
            <span style="padding: 0.2rem 0.6rem; border-radius: 20px; font-size: 0.75rem; background: ${m.urgency === 'low' ? 'rgba(0,212,170,0.2)' : 'rgba(255,193,7,0.2)'}; color: ${m.urgency === 'low' ? '#00d4aa' : '#ffc107'};">
              ${m.status}
            </span>
          </div>
        `).join('')}
      </div>
      
      <!-- Seasonal Insights -->
      <div style="background: var(--bg-secondary); border-radius: 12px; padding: 1.25rem;">
        <h4 style="margin: 0 0 1rem 0; display: flex; align-items: center; gap: 0.5rem;">
          🌤️ Seasonal Insights - ${analytics.seasonalInsights.currentSeason}
        </h4>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; margin-bottom: 1rem;">
          <div style="padding: 0.75rem; background: var(--bg-primary); border-radius: 8px; text-align: center;">
            <div style="font-size: 0.8rem; color: var(--text-secondary);">Conditions</div>
            <div style="font-weight: 600; color: #00d4aa;">${analytics.seasonalInsights.flyingConditions}</div>
          </div>
          <div style="padding: 0.75rem; background: var(--bg-primary); border-radius: 8px; text-align: center;">
            <div style="font-size: 0.8rem; color: var(--text-secondary);">Avg Wind</div>
            <div style="font-weight: 600;">${analytics.seasonalInsights.averageWindSpeed}</div>
          </div>
        </div>
        <div style="font-size: 0.85rem;">
          <strong>Tips:</strong>
          <ul style="margin: 0.5rem 0 0 1rem; padding: 0; color: var(--text-secondary);">
            ${analytics.seasonalInsights.tips.map(t => `<li style="margin-bottom: 0.25rem;">${t}</li>`).join('')}
          </ul>
        </div>
      </div>
      
    </div>
    
    <!-- Popular Purposes Chart -->
    <div style="background: var(--bg-secondary); border-radius: 12px; padding: 1.25rem; margin-top: 1.5rem;">
      <h4 style="margin: 0 0 1rem 0;">📊 Popular Flight Purposes</h4>
      <div style="display: flex; gap: 0.5rem; align-items: end; height: 120px;">
        ${analytics.weeklyTrends.popularPurposes.map(p => `
          <div style="flex: 1; display: flex; flex-direction: column; align-items: center;">
            <div style="width: 100%; background: linear-gradient(to top, #00d4aa, #4facfe); border-radius: 4px 4px 0 0; height: ${p.percentage * 2.5}px;"></div>
            <div style="font-size: 0.7rem; color: var(--text-secondary); margin-top: 0.5rem; text-align: center;">${p.purpose}</div>
            <div style="font-size: 0.8rem; font-weight: 600;">${p.percentage}%</div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

async function submitFlightRequest(e) {
  e.preventDefault();
  
  if (!state.user?.agreedToTerms) {
    document.getElementById('termsModal').classList.add('active');
    return;
  }
  
  // Check if we have waypoints OR an operation area
  const hasWaypoints = state.waypoints.length >= 2;
  const hasOperationArea = state.operationArea && state.flightType === 'area';
  
  if (!hasWaypoints && !hasOperationArea) {
    showAlert('Please add at least 2 waypoints OR draw a flight area (circle/rectangle)', 'warning');
    return;
  }
  
  const form = e.target;
  const scheduledStart = new Date(form.scheduledStart.value);
  const duration = parseInt(form.duration.value);
  const scheduledEnd = new Date(scheduledStart.getTime() + duration * 60000);
  
  // Get drone data - either from presets or DIY
  let droneData;
  if (state.selectedDrone === 'diy') {
    droneData = {
      type: document.getElementById('diyType').value,
      model: document.getElementById('diyModel').value || 'Custom DIY Drone',
      manufacturer: 'DIY',
      weight: parseFloat(document.getElementById('diyWeight').value),
      maxSpeed: parseInt(document.getElementById('diySpeed').value),
      maxAltitude: parseInt(document.getElementById('diyMaxAlt').value),
      maxFlightTime: parseInt(document.getElementById('diyFlightTime').value),
      isDIY: true
    };
  } else {
    droneData = { ...DRONES[state.selectedDrone] };
  }
  
  droneData.serialNumber = `SN${Math.random().toString(36).substring(2, 10).toUpperCase()}`;
  droneData.registrationNumber = `KS-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
  
  // Build flight data based on flight type
  const flightData = {
    flightType: hasOperationArea ? 'area' : 'waypoint',
    scheduledStart: scheduledStart.toISOString(),
    scheduledEnd: scheduledEnd.toISOString(),
    duration,
    drone: droneData,
    maxAltitude: parseInt(form.maxAltitude.value),
    estimatedSpeed: droneData.maxSpeed * 0.7,
    purpose: form.purpose.value,
    description: form.description.value,
    aiRecommendations: state.aiRecommendations
  };
  
  // Add waypoints or operation area
  if (hasOperationArea) {
    flightData.operationArea = state.operationArea;
    // Also add a single waypoint at center for compatibility
    flightData.waypoints = [{ 
      lat: state.operationArea.center.lat, 
      lng: state.operationArea.center.lng, 
      altitude: parseInt(form.maxAltitude.value), 
      order: 0 
    }];
  } else {
    flightData.waypoints = state.waypoints.map(wp => ({ 
      lat: wp.lat, 
      lng: wp.lng, 
      altitude: wp.altitude || 100, 
      order: wp.order 
    }));
  }
  
  try {
    const data = await apiCall('/flights', { method: 'POST', body: JSON.stringify(flightData) });
    const flight = data.data.flight;
    const modal = document.getElementById('submissionModal');
    const titleEl = document.getElementById('submissionTitle');
    const bodyEl = document.getElementById('submissionBody');
    
    if (flight.validation.isValid) {
      titleEl.innerHTML = '✅ Flight Request Submitted';
      bodyEl.innerHTML = `
        <div style="text-align: center; margin-bottom: 1.5rem;">
          <div style="font-size: 3rem; margin-bottom: 1rem;">🛫</div>
          <div style="font-family: var(--font-mono); font-size: 1.25rem; color: var(--accent-primary);">${flight.flightNumber}</div>
          <div style="color: var(--text-secondary); margin-top: 0.5rem;">Your flight request has been submitted for approval</div>
        </div>
        <div style="background: var(--bg-secondary); border-radius: 10px; padding: 1rem; font-size: 0.9rem;">
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem;">
            <div><strong>Scheduled:</strong> ${formatDateTime(flight.scheduledStart)}</div>
            <div><strong>Duration:</strong> ${flight.duration} min</div>
            <div><strong>Waypoints:</strong> ${flight.waypoints.length}</div>
            <div><strong>Max Altitude:</strong> ${flight.maxAltitude}m</div>
          </div>
        </div>
        <div style="margin-top: 1rem; padding: 0.75rem; background: rgba(0, 212, 170, 0.1); border-radius: 8px; font-size: 0.85rem; color: var(--accent-primary);">
          ℹ️ Your request will be reviewed by KCAA. You'll receive notification once approved.
        </div>
      `;
      showAlert('Flight request submitted successfully!', 'success');
      clearAll();
      form.reset();
      form.scheduledStart.value = getDefaultDateTime();
      loadFlights();
    } else {
      titleEl.innerHTML = '❌ Flight Request Rejected';
      const errors = flight.validation.checks.filter(c => !c.passed);
      bodyEl.innerHTML = `
        <div style="text-align: center; margin-bottom: 1.5rem;">
          <div style="font-size: 3rem; margin-bottom: 1rem;">⚠️</div>
          <div style="color: var(--text-secondary);">Your flight request could not be approved:</div>
        </div>
        <div style="display: flex; flex-direction: column; gap: 0.5rem;">
          ${errors.map(e => `<div style="padding: 0.75rem; background: rgba(255, 71, 87, 0.1); border: 1px solid var(--accent-danger); border-radius: 8px; font-size: 0.85rem; color: var(--accent-danger);">❌ ${e.message}</div>`).join('')}
        </div>
      `;
      showAlert('Flight request rejected. Please review the issues.', 'error');
    }
    
    modal.classList.add('active');
  } catch (error) {
    console.error('Submit flight error:', error);
    showAlert('Failed to submit flight request', 'error');
  }
}

// ============================================================
// Flights List
// ============================================================

async function loadFlights() {
  try {
    const data = await apiCall('/flights');
    state.flights = data.data.flights;
    renderFlightList();
  } catch (error) {
    console.error('Load flights error:', error);
  }
}

function renderFlightList() {
  const listEl = document.getElementById('flightList');
  
  if (state.flights.length === 0) {
    listEl.innerHTML = `<div style="text-align: center; padding: 2rem; color: var(--text-muted);"><div style="font-size: 2rem; margin-bottom: 0.5rem;">📋</div><div>No flights yet</div></div>`;
    return;
  }
  
  listEl.innerHTML = state.flights.map(flight => `
    <div class="flight-card" onclick="showFlightOnMap('${flight.id}')">
      <div class="flight-card-header">
        <span class="flight-number">${flight.flightNumber}</span>
        <span class="flight-status ${flight.status}">${flight.status}</span>
      </div>
      <div class="flight-card-details">
        <div class="flight-detail">📅 ${formatDateTime(flight.scheduledStart)}</div>
        <div class="flight-detail">⏱️ ${flight.duration} min</div>
        <div class="flight-detail">📍 ${flight.waypoints?.length || 0} waypoints</div>
        <div class="flight-detail">🎯 ${flight.purpose}</div>
      </div>
    </div>
  `).join('');
}

function showFlightOnMap(flightId) {
  const flight = state.flights.find(f => f.id === flightId);
  if (!flight || !flight.waypoints) return;
  
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.querySelector('[data-view="map"]').classList.add('active');
  document.getElementById('flightFormContainer').style.display = 'block';
  document.getElementById('flightListContainer').classList.remove('active');
  
  const bounds = L.latLngBounds(flight.waypoints.map(wp => [wp.lat, wp.lng]));
  state.map.fitBounds(bounds, { padding: [50, 50] });
  
  const coords = flight.waypoints.map(wp => [wp.lat, wp.lng]);
  const highlightLine = L.polyline(coords, { color: '#ffc107', weight: 4, opacity: 0.9 }).addTo(state.map);
  setTimeout(() => state.map.removeLayer(highlightLine), 5000);
}

// ============================================================
// Simulation
// ============================================================

async function initSimulation() {
  try {
    console.log('🚁 Initializing simulation with 25 drones...');
    const initResult = await apiCall('/simulation/initialize', { method: 'POST', body: JSON.stringify({ count: 25 }) });
    console.log('🚁 Simulation initialized:', initResult);
    
    // Initial update
    await updateSimulation();
    
    // Start periodic updates
    state.simulationInterval = setInterval(updateSimulation, 3000);
    console.log('🚁 Simulation running - updating every 3 seconds');
  } catch (error) {
    console.error('🚁 Simulation init error:', error);
  }
}

async function updateSimulation() {
  try {
    await apiCall('/simulation/tick', { method: 'POST' });
    const data = await apiCall('/flights/active');
    state.activeFlights = data.data.flights || [];
    console.log(`🚁 Simulation tick: ${state.activeFlights.length} flights`);
    updateDroneMarkers();
    updateStats();
  } catch (error) {
    console.error('🚁 Simulation update error:', error);
  }
}

function updateDroneMarkers() {
  console.log(`🚁 Updating drone markers. Active flights: ${state.activeFlights.length}`);
  
  // Remove markers for flights that are no longer active
  for (const [id, marker] of state.droneMarkers) {
    const flight = state.activeFlights.find(f => f.id === id || f._id === id || `${f.id}_pending` === id || `${f._id}_pending` === id);
    if (!flight || (flight.status !== 'active' && flight.status !== 'pending' && flight.status !== 'approved')) {
      state.map.removeLayer(marker);
      state.droneMarkers.delete(id);
    }
  }
  
  let activeCount = 0;
  let pendingCount = 0;
  
  state.activeFlights.forEach(flight => {
    const flightId = flight.id || flight._id;
    
    // Active flights with current position - show flying drone
    if (flight.status === 'active' && flight.currentPosition) {
      activeCount++;
      const pos = flight.currentPosition;
      
      if (state.droneMarkers.has(flightId)) {
        state.droneMarkers.get(flightId).setLatLng([pos.lat, pos.lng]);
      } else {
        const marker = L.marker([pos.lat, pos.lng], {
          icon: L.divIcon({
            className: 'drone-marker-active',
            html: `<div style="
              background: linear-gradient(135deg, #00d4aa, #00b894);
              width: 32px;
              height: 32px;
              border-radius: 50%;
              border: 3px solid white;
              display: flex;
              align-items: center;
              justify-content: center;
              font-size: 16px;
              box-shadow: 0 4px 15px rgba(0, 212, 170, 0.5), 0 2px 10px rgba(0,0,0,0.3);
              animation: pulse 2s infinite;
            ">🚁</div>`,
            iconSize: [32, 32],
            iconAnchor: [16, 16]
          }),
          zIndexOffset: 2000
        }).addTo(state.map);
        
        marker.bindPopup(`
          <div style="text-align: center;">
            <strong style="color: #00d4aa;">✈️ ${flight.flightNumber}</strong><br>
            <small>${flight.drone?.model || 'Unknown Drone'}</small><br>
            <small>Altitude: ${Math.round(pos.altitude || 0)}m</small><br>
            <small>Status: <span style="color: #00d4aa;">ACTIVE</span></small>
          </div>
        `);
        state.droneMarkers.set(flightId, marker);
      }
    }
    
    // Pending/Approved flights - show marker at start position
    if ((flight.status === 'pending' || flight.status === 'approved') && flight.waypoints?.length) {
      pendingCount++;
      const markerId = `${flightId}_pending`;
      const pos = flight.waypoints[0];
      
      if (!state.droneMarkers.has(markerId)) {
        const color = flight.status === 'pending' ? '#ffc107' : '#3498db';
        const statusText = flight.status === 'pending' ? 'PENDING' : 'APPROVED';
        
        const marker = L.marker([pos.lat, pos.lng], {
          icon: L.divIcon({
            className: 'drone-marker-pending',
            html: `<div style="
              background: ${color};
              width: 28px;
              height: 28px;
              border-radius: 50%;
              border: 2px solid white;
              display: flex;
              align-items: center;
              justify-content: center;
              font-size: 12px;
              box-shadow: 0 2px 10px rgba(0,0,0,0.3);
              opacity: 0.8;
            ">📍</div>`,
            iconSize: [28, 28],
            iconAnchor: [14, 14]
          }),
          zIndexOffset: 1000
        }).addTo(state.map);
        
        marker.bindPopup(`
          <div style="text-align: center;">
            <strong>${flight.flightNumber}</strong><br>
            <small>${flight.drone?.model || 'Unknown Drone'}</small><br>
            <small>Status: <span style="color: ${color};">${statusText}</span></small>
          </div>
        `);
        state.droneMarkers.set(markerId, marker);
      }
    }
  });
  
  console.log(`🚁 Markers updated: ${activeCount} active, ${pendingCount} pending/approved`);
}

function updateStats() {
  const active = state.activeFlights.filter(f => f.status === 'active').length;
  const pending = state.activeFlights.filter(f => f.status === 'pending').length;
  const approved = state.activeFlights.filter(f => f.status === 'approved').length;
  const total = state.activeFlights.length;
  
  document.getElementById('statActive').textContent = active;
  document.getElementById('statPending').textContent = pending;
  document.getElementById('statApproved').textContent = approved;
  document.getElementById('statTotal').textContent = total;
}

// ============================================================
// Airplane Traffic (Real-time from OpenSky Network)
// ============================================================

// Store airplane markers
state.airplaneMarkers = new Map();
state.airplaneUpdateInterval = null;

async function initAirplaneTracking() {
  console.log('✈️ Initializing airplane tracking...');
  await updateAirplaneTraffic();
  // Update airplane positions every 30 seconds
  state.airplaneUpdateInterval = setInterval(updateAirplaneTraffic, 30000);
}

async function updateAirplaneTraffic() {
  try {
    const data = await apiCall('/airplanes');
    
    if (!data.success || !data.data.airplanes) {
      console.log('✈️ No airplane data available');
      return;
    }
    
    const airplanes = [...data.data.airplanes, ...(data.data.nearbyAirplanes || [])];
    
    // Remove old markers
    for (const [id, marker] of state.airplaneMarkers) {
      const stillExists = airplanes.find(p => p.icao24 === id);
      if (!stillExists) {
        state.map.removeLayer(marker);
        state.airplaneMarkers.delete(id);
      }
    }
    
    // Add/update airplane markers
    airplanes.forEach(plane => {
      if (!plane.position?.lat || !plane.position?.lng || plane.onGround) return;
      
      const rotation = plane.heading || 0;
      
      if (state.airplaneMarkers.has(plane.icao24)) {
        // Update existing marker
        state.airplaneMarkers.get(plane.icao24).setLatLng([plane.position.lat, plane.position.lng]);
      } else {
        // Create new marker
        const marker = L.marker([plane.position.lat, plane.position.lng], {
          icon: L.divIcon({
            className: 'airplane-marker',
            html: `<div style="
              font-size: 20px;
              transform: rotate(${rotation}deg);
              filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5));
              opacity: ${plane.inKosovo ? 1 : 0.6};
            ">✈️</div>`,
            iconSize: [24, 24],
            iconAnchor: [12, 12]
          }),
          zIndexOffset: 1000
        }).addTo(state.map);
        
        marker.bindPopup(`
          <strong>✈️ ${plane.callsign || 'Unknown'}</strong><br>
          <small>ICAO: ${plane.icao24}</small><br>
          <small>Origin: ${plane.originCountry}</small><br>
          <small>Altitude: ${plane.position.altitudeFt?.toLocaleString() || '?'} ft</small><br>
          <small>Speed: ${plane.velocity || '?'} km/h</small><br>
          <small>Heading: ${Math.round(plane.heading || 0)}°</small>
        `);
        
        state.airplaneMarkers.set(plane.icao24, marker);
      }
    });
    
    console.log(`✈️ Tracking ${state.airplaneMarkers.size} aircraft`);
    
    // Update airplane count in stats if element exists
    const airplaneCountEl = document.getElementById('statAirplanes');
    if (airplaneCountEl) {
      airplaneCountEl.textContent = data.data.inKosovoCount || 0;
    }
    
  } catch (error) {
    console.log('✈️ Airplane tracking unavailable:', error.message);
  }
}

// ============================================================
// Initialize
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  console.log('📍 KDTMS: DOM loaded, initializing...');
  try {
    initAuth();
    console.log('📍 KDTMS: initAuth completed');
  } catch (error) {
    console.error('📍 KDTMS: Critical error during init:', error);
    // Force show auth screen on error
    document.getElementById('loadingScreen').classList.add('hidden');
    document.getElementById('authContainer').style.display = 'flex';
  }
});

window.removeWaypoint = removeWaypoint;
window.showFlightOnMap = showFlightOnMap;
