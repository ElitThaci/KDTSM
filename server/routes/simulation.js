import express from 'express';
import { authenticateToken } from './auth.js';
import { inMemoryFlights } from './flights.js';
import { 
  KOSOVO_BOUNDS, 
  isWithinKosovo, 
  calculateDistance,
  URBAN_AREAS,
  AIRPORTS,
  RESTRICTED_ZONES
} from '../data/kosovoData.js';

const router = express.Router();

// Reference to flights (use inMemoryFlights)
const flights = inMemoryFlights;

// Simulated drone types
const DRONE_TYPES = [
  { type: 'multirotor', model: 'DJI Mavic 3 Pro', manufacturer: 'DJI', weight: 0.895, maxSpeed: 75, maxAltitude: 120, maxFlightTime: 43 },
  { type: 'multirotor', model: 'DJI Mini 4 Pro', manufacturer: 'DJI', weight: 0.249, maxSpeed: 57, maxAltitude: 120, maxFlightTime: 34 },
  { type: 'multirotor', model: 'Autel EVO II Pro', manufacturer: 'Autel', weight: 1.19, maxSpeed: 72, maxAltitude: 120, maxFlightTime: 42 },
  { type: 'multirotor', model: 'Skydio 2+', manufacturer: 'Skydio', weight: 0.775, maxSpeed: 58, maxAltitude: 120, maxFlightTime: 27 },
  { type: 'fixed-wing', model: 'senseFly eBee X', manufacturer: 'AgEagle', weight: 1.3, maxSpeed: 110, maxAltitude: 120, maxFlightTime: 90 },
  { type: 'multirotor', model: 'DJI Matrice 350 RTK', manufacturer: 'DJI', weight: 6.47, maxSpeed: 55, maxAltitude: 120, maxFlightTime: 55 },
  { type: 'hybrid', model: 'Wingcopter 198', manufacturer: 'Wingcopter', weight: 25, maxSpeed: 150, maxAltitude: 120, maxFlightTime: 120 },
  { type: 'multirotor', model: 'Parrot Anafi AI', manufacturer: 'Parrot', weight: 0.898, maxSpeed: 55, maxAltitude: 120, maxFlightTime: 32 }
];

const FLIGHT_PURPOSES = ['recreational', 'commercial', 'survey', 'inspection', 'photography', 'agriculture'];

// Generate random point within Kosovo
function generateRandomKosovoPoint() {
  let lat, lng;
  let attempts = 0;
  const maxAttempts = 100;
  
  do {
    lat = KOSOVO_BOUNDS.south + Math.random() * (KOSOVO_BOUNDS.north - KOSOVO_BOUNDS.south);
    lng = KOSOVO_BOUNDS.west + Math.random() * (KOSOVO_BOUNDS.east - KOSOVO_BOUNDS.west);
    attempts++;
  } while (!isWithinKosovo(lat, lng) && attempts < maxAttempts);
  
  // Check if point is in restricted zone
  let isRestricted = false;
  for (const zone of [...RESTRICTED_ZONES, ...AIRPORTS]) {
    const distance = calculateDistance(lat, lng, zone.position.lat, zone.position.lng);
    const radius = zone.restrictedRadius || zone.radius;
    if (distance < radius) {
      isRestricted = true;
      break;
    }
  }
  
  if (isRestricted) {
    return generateRandomKosovoPoint();
  }
  
  return { lat, lng };
}

// Generate random point near a city
function generatePointNearCity() {
  const city = URBAN_AREAS[Math.floor(Math.random() * URBAN_AREAS.length)];
  const offsetLat = (Math.random() - 0.5) * 0.1; // ~5km radius
  const offsetLng = (Math.random() - 0.5) * 0.1;
  
  let lat = city.position.lat + offsetLat;
  let lng = city.position.lng + offsetLng;
  
  // Ensure within Kosovo
  if (!isWithinKosovo(lat, lng)) {
    return generateRandomKosovoPoint();
  }
  
  return { lat, lng };
}

// Generate flight number
function generateFlightNumber() {
  const prefix = 'KS';
  const timestamp = Date.now().toString(36).toUpperCase().slice(-4);
  const random = Math.random().toString(36).substring(2, 5).toUpperCase();
  return `${prefix}-${timestamp}-${random}`;
}

// Generate simulated flight
function generateSimulatedFlight(userId = 'sim_user') {
  const numWaypoints = Math.floor(Math.random() * 4) + 2; // 2-5 waypoints
  const waypoints = [];
  
  // Decide if near city or random
  const nearCity = Math.random() > 0.3;
  const startPoint = nearCity ? generatePointNearCity() : generateRandomKosovoPoint();
  
  waypoints.push({
    lat: startPoint.lat,
    lng: startPoint.lng,
    altitude: Math.floor(Math.random() * 80) + 30, // 30-110m
    order: 0
  });
  
  // Generate subsequent waypoints relatively close to each other
  for (let i = 1; i < numWaypoints; i++) {
    const prevPoint = waypoints[i - 1];
    let newLat = prevPoint.lat + (Math.random() - 0.5) * 0.05; // ~2.5km
    let newLng = prevPoint.lng + (Math.random() - 0.5) * 0.05;
    
    // Ensure within Kosovo
    if (!isWithinKosovo(newLat, newLng)) {
      newLat = prevPoint.lat + (Math.random() - 0.5) * 0.02;
      newLng = prevPoint.lng + (Math.random() - 0.5) * 0.02;
    }
    
    waypoints.push({
      lat: newLat,
      lng: newLng,
      altitude: Math.floor(Math.random() * 80) + 30,
      order: i
    });
  }
  
  // Random drone
  const drone = { ...DRONE_TYPES[Math.floor(Math.random() * DRONE_TYPES.length)] };
  drone.serialNumber = `SN${Math.random().toString(36).substring(2, 10).toUpperCase()}`;
  drone.registrationNumber = `KS-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
  
  // Random timing - bias towards currently active flights
  const now = new Date();
  const rand = Math.random();
  let startOffset, status;
  
  // 50% active now, 25% pending, 25% approved for future
  if (rand < 0.5) {
    // Active flight - started in the past, ends in the future
    startOffset = -Math.floor(Math.random() * 20) - 5; // -5 to -25 minutes ago
    status = 'active';
  } else if (rand < 0.75) {
    // Pending flight
    startOffset = Math.floor(Math.random() * 60) + 10; // 10-70 minutes in future
    status = 'pending';
  } else {
    // Approved flight
    startOffset = Math.floor(Math.random() * 30) + 5; // 5-35 minutes in future  
    status = 'approved';
  }
  
  const scheduledStart = new Date(now.getTime() + startOffset * 60000);
  const duration = Math.floor(Math.random() * 45) + 15; // 15-60 minutes
  const scheduledEnd = new Date(scheduledStart.getTime() + duration * 60000);
  
  return {
    id: `sim_flight_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    flightNumber: generateFlightNumber(),
    userId,
    flightType: 'waypoint',
    waypoints,
    scheduledStart: scheduledStart.toISOString(),
    scheduledEnd: scheduledEnd.toISOString(),
    duration,
    drone,
    maxAltitude: Math.max(...waypoints.map(w => w.altitude)),
    estimatedSpeed: drone.maxSpeed * (0.5 + Math.random() * 0.3),
    purpose: FLIGHT_PURPOSES[Math.floor(Math.random() * FLIGHT_PURPOSES.length)],
    status,
    validation: {
      isValid: true,
      checks: [
        { name: 'border_check', passed: true, message: 'All waypoints within Kosovo borders', severity: 'info' },
        { name: 'altitude_check', passed: true, message: 'Altitude within legal limits', severity: 'info' },
        { name: 'restricted_zone_check', passed: true, message: 'No restricted zone conflicts', severity: 'info' }
      ],
      validatedAt: new Date()
    },
    currentPosition: status === 'active' ? {
      lat: waypoints[0].lat + (Math.random() - 0.5) * 0.01,
      lng: waypoints[0].lng + (Math.random() - 0.5) * 0.01,
      altitude: waypoints[0].altitude,
      heading: Math.floor(Math.random() * 360),
      speed: drone.maxSpeed * (0.4 + Math.random() * 0.3),
      updatedAt: new Date()
    } : null,
    isSimulated: true,
    createdAt: new Date(now.getTime() - Math.random() * 86400000), // Within last 24h
    updatedAt: new Date()
  };
}

// Initialize simulation with flights
router.post('/initialize', authenticateToken, (req, res) => {
  const { count = 25 } = req.body;
  const simulatedFlights = [];
  
  // Clear existing simulated flights
  for (const [id, flight] of flights) {
    if (flight.isSimulated) {
      flights.delete(id);
    }
  }
  
  // Generate new simulated flights
  for (let i = 0; i < count; i++) {
    const flight = generateSimulatedFlight(`sim_pilot_${i % 10}`);
    flights.set(flight.id, flight);
    simulatedFlights.push(flight);
  }
  
  res.json({
    success: true,
    message: `Initialized simulation with ${count} flights`,
    data: {
      totalFlights: simulatedFlights.length,
      active: simulatedFlights.filter(f => f.status === 'active').length,
      approved: simulatedFlights.filter(f => f.status === 'approved').length,
      pending: simulatedFlights.filter(f => f.status === 'pending').length
    }
  });
});

// Get simulation status
router.get('/status', authenticateToken, (req, res) => {
  const allFlights = Array.from(flights.values());
  const simFlights = allFlights.filter(f => f.isSimulated);
  
  res.json({
    success: true,
    data: {
      totalFlights: allFlights.length,
      simulatedFlights: simFlights.length,
      userFlights: allFlights.length - simFlights.length,
      byStatus: {
        active: allFlights.filter(f => f.status === 'active').length,
        approved: allFlights.filter(f => f.status === 'approved').length,
        pending: allFlights.filter(f => f.status === 'pending').length,
        completed: allFlights.filter(f => f.status === 'completed').length
      }
    }
  });
});

// Update simulation (move active drones)
router.post('/tick', authenticateToken, (req, res) => {
  const updatedFlights = [];
  const now = new Date();
  
  for (const [id, flight] of flights) {
    // Update active flights
    if (flight.status === 'active' && flight.waypoints?.length > 0) {
      // Simulate movement along trajectory
      if (!flight.currentWaypointIndex) flight.currentWaypointIndex = 0;
      
      const targetWp = flight.waypoints[Math.min(flight.currentWaypointIndex, flight.waypoints.length - 1)];
      const currentPos = flight.currentPosition || {
        lat: flight.waypoints[0].lat,
        lng: flight.waypoints[0].lng,
        altitude: flight.waypoints[0].altitude
      };
      
      // Move towards target
      const speed = 0.0001 * (flight.drone?.maxSpeed || 50) / 50; // Normalized movement
      const dLat = (targetWp.lat - currentPos.lat) * 0.1 + (Math.random() - 0.5) * 0.0005;
      const dLng = (targetWp.lng - currentPos.lng) * 0.1 + (Math.random() - 0.5) * 0.0005;
      
      flight.currentPosition = {
        lat: currentPos.lat + dLat,
        lng: currentPos.lng + dLng,
        altitude: targetWp.altitude + (Math.random() - 0.5) * 5,
        heading: Math.atan2(dLng, dLat) * 180 / Math.PI,
        speed: (flight.drone?.maxSpeed || 50) * (0.5 + Math.random() * 0.3),
        updatedAt: now
      };
      
      // Check if reached waypoint
      const distToTarget = calculateDistance(
        flight.currentPosition.lat, flight.currentPosition.lng,
        targetWp.lat, targetWp.lng
      );
      
      if (distToTarget < 50) { // Within 50m of waypoint
        flight.currentWaypointIndex++;
        if (flight.currentWaypointIndex >= flight.waypoints.length) {
          // Flight completed
          flight.status = 'completed';
          flight.currentPosition = null;
        }
      }
      
      flights.set(id, flight);
      updatedFlights.push(flight);
    }
    
    // Transition approved flights to active
    if (flight.status === 'approved') {
      const scheduledStart = new Date(flight.scheduledStart);
      if (scheduledStart <= now) {
        flight.status = 'active';
        flight.currentPosition = {
          lat: flight.waypoints[0].lat,
          lng: flight.waypoints[0].lng,
          altitude: flight.waypoints[0].altitude,
          heading: 0,
          speed: 0,
          updatedAt: now
        };
        flight.currentWaypointIndex = 0;
        flights.set(id, flight);
        updatedFlights.push(flight);
      }
    }
    
    // Complete flights past their end time
    if (flight.status === 'active') {
      const scheduledEnd = new Date(flight.scheduledEnd);
      if (scheduledEnd <= now) {
        flight.status = 'completed';
        flight.currentPosition = null;
        flights.set(id, flight);
      }
    }
  }
  
  res.json({
    success: true,
    message: `Updated ${updatedFlights.length} flights`,
    data: {
      updatedCount: updatedFlights.length,
      activeFlights: Array.from(flights.values()).filter(f => f.status === 'active').length
    }
  });
});

// Add a single new simulated flight
router.post('/add-flight', authenticateToken, (req, res) => {
  const flight = generateSimulatedFlight('sim_new_pilot');
  flight.status = 'approved'; // Make it active soon
  flight.scheduledStart = new Date(Date.now() + 60000).toISOString(); // Start in 1 minute
  
  flights.set(flight.id, flight);
  
  res.json({
    success: true,
    message: 'New simulated flight added',
    data: { flight }
  });
});

// Clear all simulated flights
router.delete('/clear', authenticateToken, (req, res) => {
  let cleared = 0;
  
  for (const [id, flight] of flights) {
    if (flight.isSimulated) {
      flights.delete(id);
      cleared++;
    }
  }
  
  res.json({
    success: true,
    message: `Cleared ${cleared} simulated flights`
  });
});

export default router;
