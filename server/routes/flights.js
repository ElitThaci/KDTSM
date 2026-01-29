import express from 'express';
import mongoose from 'mongoose';
import { authenticateToken } from './auth.js';
import Flight from '../models/Flight.js';
import { 
  isWithinKosovo, 
  calculateDistance, 
  checkRestrictedZone,
  AIRPORTS,
  RESTRICTED_ZONES,
  KCAA_REGULATIONS
} from '../data/kosovoData.js';

const router = express.Router();

// In-memory flight storage fallback
const inMemoryFlights = new Map();

// Helper to check MongoDB connection
const isMongoConnected = () => mongoose.connection.readyState === 1;

// Generate unique flight number
function generateFlightNumber() {
  const date = new Date();
  const prefix = 'KS';
  const timestamp = date.getTime().toString(36).toUpperCase().slice(-6);
  const random = Math.random().toString(36).substring(2, 5).toUpperCase();
  return `${prefix}-${timestamp}-${random}`;
}

// Calculate distance between two points
function getDistance(lat1, lng1, lat2, lng2) {
  return calculateDistance(lat1, lng1, lat2, lng2);
}

// Generate sample points along a path
function generatePathSamples(waypoints, sampleDistance = 50) {
  const samples = [];
  if (!waypoints || waypoints.length === 0) return samples;
  
  samples.push(waypoints[0]);
  
  for (let i = 0; i < waypoints.length - 1; i++) {
    const wp1 = waypoints[i];
    const wp2 = waypoints[i + 1];
    const segmentDistance = getDistance(wp1.lat, wp1.lng, wp2.lat, wp2.lng);
    const numSamples = Math.floor(segmentDistance / sampleDistance);
    
    for (let j = 1; j <= numSamples; j++) {
      const t = j / (numSamples + 1);
      samples.push({
        lat: wp1.lat + t * (wp2.lat - wp1.lat),
        lng: wp1.lng + t * (wp2.lng - wp1.lng)
      });
    }
    samples.push(wp2);
  }
  
  return samples;
}

// Get bounding box for a flight
function getFlightBounds(flightData) {
  if (flightData.operationArea) {
    const area = flightData.operationArea;
    if (area.type === 'circle') {
      const radiusDeg = area.radius / 111320;
      return {
        north: area.center.lat + radiusDeg,
        south: area.center.lat - radiusDeg,
        east: area.center.lng + radiusDeg / Math.cos(area.center.lat * Math.PI / 180),
        west: area.center.lng - radiusDeg / Math.cos(area.center.lat * Math.PI / 180)
      };
    } else if (area.bounds) {
      return area.bounds;
    }
  }
  
  if (flightData.waypoints && flightData.waypoints.length > 0) {
    const lats = flightData.waypoints.map(w => w.lat);
    const lngs = flightData.waypoints.map(w => w.lng);
    return {
      north: Math.max(...lats),
      south: Math.min(...lats),
      east: Math.max(...lngs),
      west: Math.min(...lngs)
    };
  }
  
  return null;
}

// Check if two bounding boxes overlap
function boundsOverlap(bounds1, bounds2, buffer = 0.005) {
  if (!bounds1 || !bounds2) return false;
  return !(bounds1.east + buffer < bounds2.west - buffer ||
           bounds1.west - buffer > bounds2.east + buffer ||
           bounds1.north + buffer < bounds2.south - buffer ||
           bounds1.south - buffer > bounds2.north + buffer);
}

// Check spatial conflict between two flights
function checkSpatialConflict(flight1, flight2) {
  const bounds1 = getFlightBounds(flight1);
  const bounds2 = getFlightBounds(flight2);
  
  // Quick bounds check
  if (!boundsOverlap(bounds1, bounds2)) {
    return { hasConflict: false };
  }
  
  // Detailed check for area-based flights
  if (flight1.operationArea && flight2.operationArea) {
    const area1 = flight1.operationArea;
    const area2 = flight2.operationArea;
    
    if (area1.type === 'circle' && area2.type === 'circle') {
      const dist = getDistance(area1.center.lat, area1.center.lng, area2.center.lat, area2.center.lng);
      if (dist < (area1.radius + area2.radius)) {
        return { hasConflict: true, minDistance: dist, type: 'area_overlap' };
      }
    } else {
      // Rectangle or mixed - bounds overlap is sufficient
      return { hasConflict: true, minDistance: 0, type: 'area_overlap' };
    }
  }
  
  // Check waypoint paths
  const samples1 = flight1.waypoints ? generatePathSamples(flight1.waypoints) : [];
  const samples2 = flight2.waypoints ? generatePathSamples(flight2.waypoints) : [];
  
  // If one has area and other has waypoints
  if (flight1.operationArea && samples2.length > 0) {
    for (const s of samples2) {
      if (isPointInArea(s.lat, s.lng, flight1.operationArea)) {
        return { hasConflict: true, minDistance: 0, type: 'path_enters_area' };
      }
    }
  }
  
  if (flight2.operationArea && samples1.length > 0) {
    for (const s of samples1) {
      if (isPointInArea(s.lat, s.lng, flight2.operationArea)) {
        return { hasConflict: true, minDistance: 0, type: 'path_enters_area' };
      }
    }
  }
  
  // Check path intersection
  let minDistance = Infinity;
  for (const s1 of samples1) {
    for (const s2 of samples2) {
      const dist = getDistance(s1.lat, s1.lng, s2.lat, s2.lng);
      if (dist < minDistance) minDistance = dist;
    }
  }
  
  if (minDistance < 200) { // 200m minimum separation
    return { hasConflict: true, minDistance, type: 'path_proximity' };
  }
  
  return { hasConflict: false };
}

// Check if point is inside area
function isPointInArea(lat, lng, area) {
  if (area.type === 'circle') {
    const dist = getDistance(lat, lng, area.center.lat, area.center.lng);
    return dist <= area.radius;
  } else if (area.bounds) {
    return lat >= area.bounds.south && lat <= area.bounds.north &&
           lng >= area.bounds.west && lng <= area.bounds.east;
  }
  return false;
}

// Check for conflicts with existing flights
async function checkFlightConflicts(newFlight, excludeId = null) {
  const conflicts = [];
  const newStart = new Date(newFlight.scheduledStart);
  const newEnd = new Date(newFlight.scheduledEnd);
  
  let existingFlights = [];
  
  if (isMongoConnected()) {
    const query = {
      status: { $in: ['pending', 'approved', 'active'] },
      scheduledStart: { $lt: newEnd },
      scheduledEnd: { $gt: newStart }
    };
    if (excludeId) query._id = { $ne: excludeId };
    existingFlights = await Flight.find(query).lean();
  } else {
    existingFlights = Array.from(inMemoryFlights.values()).filter(f => {
      if (['cancelled', 'completed', 'rejected'].includes(f.status)) return false;
      if (excludeId && f.id === excludeId) return false;
      const existingStart = new Date(f.scheduledStart);
      const existingEnd = new Date(f.scheduledEnd);
      return newStart < existingEnd && newEnd > existingStart;
    });
  }
  
  for (const flight of existingFlights) {
    // Check altitude overlap (30m vertical separation)
    const altitudeOverlap = Math.abs((newFlight.maxAltitude || 100) - (flight.maxAltitude || 100)) < 30;
    
    if (!altitudeOverlap) continue;
    
    const spatialConflict = checkSpatialConflict(newFlight, flight);
    
    if (spatialConflict.hasConflict) {
      conflicts.push({
        flightId: flight._id || flight.id,
        flightNumber: flight.flightNumber,
        conflictType: spatialConflict.type,
        minDistance: Math.round(spatialConflict.minDistance || 0),
        scheduledStart: flight.scheduledStart,
        scheduledEnd: flight.scheduledEnd,
        conflictDetails: `Flight paths conflict: ${spatialConflict.type} (${Math.round(spatialConflict.minDistance || 0)}m separation)`
      });
    }
  }
  
  return conflicts;
}

// Validate flight request
async function validateFlightRequest(flightData) {
  const checks = [];
  let isValid = true;
  
  // Check waypoints within Kosovo
  if (flightData.waypoints && flightData.waypoints.length > 0) {
    for (let i = 0; i < flightData.waypoints.length; i++) {
      const wp = flightData.waypoints[i];
      if (!isWithinKosovo(wp.lat, wp.lng)) {
        checks.push({ name: 'border_check', passed: false, message: `Waypoint ${i + 1} is outside Kosovo borders`, severity: 'error' });
        isValid = false;
      }
    }
    if (!checks.some(c => c.name === 'border_check' && !c.passed)) {
      checks.push({ name: 'border_check', passed: true, message: 'All waypoints within Kosovo borders', severity: 'info' });
    }
  }
  
  // Check operation area
  if (flightData.operationArea) {
    const area = flightData.operationArea;
    if (area.center && !isWithinKosovo(area.center.lat, area.center.lng)) {
      checks.push({ name: 'area_border_check', passed: false, message: 'Operation area center is outside Kosovo borders', severity: 'error' });
      isValid = false;
    } else if (area.center) {
      checks.push({ name: 'area_border_check', passed: true, message: 'Operation area within Kosovo borders', severity: 'info' });
    }
  }
  
  // Check altitude
  if (flightData.maxAltitude > KCAA_REGULATIONS.maxAltitudeAGL) {
    checks.push({ name: 'altitude_check', passed: false, message: `Maximum altitude ${flightData.maxAltitude}m exceeds legal limit of ${KCAA_REGULATIONS.maxAltitudeAGL}m AGL`, severity: 'error' });
    isValid = false;
  } else {
    checks.push({ name: 'altitude_check', passed: true, message: `Altitude ${flightData.maxAltitude}m within legal limits`, severity: 'info' });
  }
  
  // Check restricted zones
  const points = flightData.waypoints || (flightData.operationArea?.center ? [flightData.operationArea.center] : []);
  const zoneViolations = [];
  for (const point of points) {
    const violations = checkRestrictedZone(point.lat, point.lng, flightData.maxAltitude || 100);
    zoneViolations.push(...violations);
  }
  
  if (zoneViolations.length > 0) {
    const errors = zoneViolations.filter(v => v.severity === 'error');
    const warnings = zoneViolations.filter(v => v.severity === 'warning');
    
    if (errors.length > 0) {
      isValid = false;
      errors.forEach(v => checks.push({ name: 'zone_check', passed: false, message: v.message, severity: 'error' }));
    }
    warnings.forEach(v => checks.push({ name: 'zone_check', passed: true, message: v.message, severity: 'warning' }));
  } else {
    checks.push({ name: 'zone_check', passed: true, message: 'No restricted zone violations', severity: 'info' });
  }
  
  // Check time validity
  const scheduledStart = new Date(flightData.scheduledStart);
  if (scheduledStart < new Date()) {
    checks.push({ name: 'time_check', passed: false, message: 'Scheduled start time is in the past', severity: 'error' });
    isValid = false;
  } else {
    checks.push({ name: 'time_check', passed: true, message: 'Flight scheduled for future time', severity: 'info' });
  }
  
  // Check daylight hours
  const startHour = scheduledStart.getUTCHours() + 1;
  if (startHour < 6 || startHour > 20) {
    checks.push({ name: 'daylight_check', passed: false, message: 'KCAA regulations require daylight operations (06:00-20:00)', severity: 'warning' });
  } else {
    checks.push({ name: 'daylight_check', passed: true, message: 'Flight scheduled during daylight hours', severity: 'info' });
  }
  
  // Check for conflicts with existing flights - CRITICAL
  const conflicts = await checkFlightConflicts(flightData);
  if (conflicts.length > 0) {
    isValid = false;
    for (const conflict of conflicts) {
      checks.push({
        name: 'traffic_conflict',
        passed: false,
        message: `CONFLICT with flight ${conflict.flightNumber}: ${conflict.conflictDetails}`,
        severity: 'error',
        conflictingFlight: conflict
      });
    }
  } else {
    checks.push({ name: 'traffic_conflict', passed: true, message: 'No traffic conflicts detected - airspace clear', severity: 'info' });
  }
  
  return { isValid, checks, validatedAt: new Date() };
}

// Create flight request
router.post('/', authenticateToken, async (req, res) => {
  try {
    const flightData = req.body;
    const flightNumber = generateFlightNumber();
    
    // Validate the flight
    const validation = await validateFlightRequest(flightData);
    
    if (isMongoConnected()) {
      const flight = new Flight({
        userId: req.user.id,
        flightNumber,
        flightType: flightData.operationArea ? 'area' : 'waypoint',
        waypoints: flightData.waypoints || [],
        operationArea: flightData.operationArea || null,
        scheduledStart: flightData.scheduledStart,
        scheduledEnd: flightData.scheduledEnd,
        duration: flightData.duration,
        drone: flightData.drone,
        maxAltitude: flightData.maxAltitude || 100,
        estimatedSpeed: flightData.estimatedSpeed,
        purpose: flightData.purpose,
        description: flightData.description,
        status: validation.isValid ? 'pending' : 'rejected',
        validation,
        aiRecommendations: flightData.aiRecommendations,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      });
      
      await flight.save();
      
      res.status(201).json({
        success: true,
        message: validation.isValid ? 'Flight request submitted successfully' : 'Flight request rejected due to validation errors',
        data: { flight }
      });
    } else {
      // In-memory mode
      const flight = {
        id: `flight_${Date.now()}`,
        flightNumber,
        userId: req.user.id,
        flightType: flightData.operationArea ? 'area' : 'waypoint',
        ...flightData,
        status: validation.isValid ? 'pending' : 'rejected',
        validation,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      inMemoryFlights.set(flight.id, flight);
      
      res.status(201).json({
        success: true,
        message: validation.isValid ? 'Flight request submitted successfully' : 'Flight request rejected due to validation errors',
        data: { flight }
      });
    }
  } catch (error) {
    console.error('Create flight error:', error);
    res.status(500).json({ success: false, message: 'Failed to create flight request', error: error.message });
  }
});

// Get all flights for current user
router.get('/', authenticateToken, async (req, res) => {
  try {
    if (isMongoConnected()) {
      const flights = await Flight.find({ userId: req.user.id }).sort({ createdAt: -1 });
      res.json({ success: true, data: { flights } });
    } else {
      const userFlights = Array.from(inMemoryFlights.values())
        .filter(f => f.userId === req.user.id)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      res.json({ success: true, data: { flights: userFlights } });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch flights' });
  }
});

// Get active flights
router.get('/active', authenticateToken, async (req, res) => {
  try {
    let allFlights = [];
    
    // Get simulated flights from in-memory storage (always)
    const simulatedFlights = Array.from(inMemoryFlights.values())
      .filter(f => f.isSimulated && ['active', 'pending', 'approved'].includes(f.status));
    
    if (isMongoConnected()) {
      // Get real flights from MongoDB
      const dbFlights = await Flight.find({ status: { $in: ['active', 'pending', 'approved'] } });
      allFlights = [...dbFlights.map(f => f.toObject()), ...simulatedFlights];
    } else {
      // Get all flights from in-memory
      allFlights = Array.from(inMemoryFlights.values())
        .filter(f => ['active', 'pending', 'approved'].includes(f.status));
    }
    
    res.json({ success: true, data: { flights: allFlights } });
  } catch (error) {
    console.error('Active flights error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch active flights' });
  }
});

// Get flight by ID
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    if (isMongoConnected()) {
      const flight = await Flight.findById(req.params.id);
      if (!flight) {
        return res.status(404).json({ success: false, message: 'Flight not found' });
      }
      res.json({ success: true, data: { flight } });
    } else {
      const flight = inMemoryFlights.get(req.params.id);
      if (!flight) {
        return res.status(404).json({ success: false, message: 'Flight not found' });
      }
      res.json({ success: true, data: { flight } });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch flight' });
  }
});

// Update flight status
router.patch('/:id/status', authenticateToken, async (req, res) => {
  try {
    const { status } = req.body;
    
    if (isMongoConnected()) {
      const flight = await Flight.findByIdAndUpdate(
        req.params.id,
        { status, updatedAt: new Date() },
        { new: true }
      );
      if (!flight) {
        return res.status(404).json({ success: false, message: 'Flight not found' });
      }
      res.json({ success: true, data: { flight } });
    } else {
      const flight = inMemoryFlights.get(req.params.id);
      if (!flight) {
        return res.status(404).json({ success: false, message: 'Flight not found' });
      }
      flight.status = status;
      flight.updatedAt = new Date();
      inMemoryFlights.set(flight.id, flight);
      res.json({ success: true, data: { flight } });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to update flight status' });
  }
});

// Cancel flight
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    if (isMongoConnected()) {
      const flight = await Flight.findOneAndUpdate(
        { _id: req.params.id, userId: req.user.id },
        { status: 'cancelled', updatedAt: new Date() },
        { new: true }
      );
      if (!flight) {
        return res.status(404).json({ success: false, message: 'Flight not found' });
      }
      res.json({ success: true, message: 'Flight cancelled', data: { flight } });
    } else {
      const flight = inMemoryFlights.get(req.params.id);
      if (!flight || flight.userId !== req.user.id) {
        return res.status(404).json({ success: false, message: 'Flight not found' });
      }
      flight.status = 'cancelled';
      flight.updatedAt = new Date();
      inMemoryFlights.set(flight.id, flight);
      res.json({ success: true, message: 'Flight cancelled', data: { flight } });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to cancel flight' });
  }
});

// Export for simulation
export { inMemoryFlights };
export default router;
