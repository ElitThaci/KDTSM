import express from 'express';
import { authenticateToken } from './auth.js';
import { 
  KOSOVO_BOUNDS,
  KOSOVO_BORDER,
  AIRPORTS,
  RESTRICTED_ZONES,
  URBAN_AREAS,
  TERRAIN_DATA,
  KCAA_REGULATIONS,
  isWithinKosovo,
  calculateDistance,
  checkRestrictedZone
} from '../data/kosovoData.js';

const router = express.Router();

// Get all geographic data
router.get('/', authenticateToken, (req, res) => {
  res.json({
    success: true,
    data: {
      bounds: KOSOVO_BOUNDS,
      border: KOSOVO_BORDER,
      airports: AIRPORTS,
      restrictedZones: RESTRICTED_ZONES,
      urbanAreas: URBAN_AREAS,
      terrain: TERRAIN_DATA
    }
  });
});

// Get Kosovo borders
router.get('/border', (req, res) => {
  res.json({
    success: true,
    data: {
      bounds: KOSOVO_BOUNDS,
      border: KOSOVO_BORDER
    }
  });
});

// Get airports
router.get('/airports', (req, res) => {
  res.json({
    success: true,
    data: { airports: AIRPORTS }
  });
});

// Get restricted zones
router.get('/restricted', (req, res) => {
  const { type } = req.query;
  
  let zones = RESTRICTED_ZONES;
  if (type) {
    zones = zones.filter(z => z.type === type);
  }
  
  res.json({
    success: true,
    data: { 
      zones,
      types: [...new Set(RESTRICTED_ZONES.map(z => z.type))]
    }
  });
});

// Get KCAA regulations
router.get('/regulations', (req, res) => {
  res.json({
    success: true,
    data: { regulations: KCAA_REGULATIONS }
  });
});

// Check if point is within Kosovo
router.get('/check-point', (req, res) => {
  const { lat, lng, altitude } = req.query;
  
  if (!lat || !lng) {
    return res.status(400).json({ success: false, message: 'Latitude and longitude required' });
  }
  
  const latitude = parseFloat(lat);
  const longitude = parseFloat(lng);
  const alt = parseFloat(altitude) || 0;
  
  const withinKosovo = isWithinKosovo(latitude, longitude);
  const zoneViolations = checkRestrictedZone(latitude, longitude, alt);
  
  // Find nearest city
  let nearestCity = null;
  let nearestCityDistance = Infinity;
  
  for (const city of URBAN_AREAS) {
    const distance = calculateDistance(latitude, longitude, city.position.lat, city.position.lng);
    if (distance < nearestCityDistance) {
      nearestCityDistance = distance;
      nearestCity = { ...city, distance: Math.round(distance) };
    }
  }
  
  // Find nearest airport
  let nearestAirport = null;
  let nearestAirportDistance = Infinity;
  
  for (const airport of AIRPORTS) {
    const distance = calculateDistance(latitude, longitude, airport.position.lat, airport.position.lng);
    if (distance < nearestAirportDistance) {
      nearestAirportDistance = distance;
      nearestAirport = { ...airport, distance: Math.round(distance) };
    }
  }
  
  res.json({
    success: true,
    data: {
      point: { lat: latitude, lng: longitude, altitude: alt },
      withinKosovo,
      zoneViolations,
      isValidForFlight: withinKosovo && zoneViolations.filter(v => v.severity === 'error').length === 0,
      nearestCity,
      nearestAirport
    }
  });
});

// Validate flight path
router.post('/validate-path', (req, res) => {
  const { waypoints, maxAltitude } = req.body;
  
  if (!waypoints || waypoints.length < 2) {
    return res.status(400).json({ success: false, message: 'At least 2 waypoints required' });
  }
  
  const validation = {
    isValid: true,
    issues: [],
    segments: []
  };
  
  // Check each waypoint
  for (let i = 0; i < waypoints.length; i++) {
    const wp = waypoints[i];
    
    // Border check
    if (!isWithinKosovo(wp.lat, wp.lng)) {
      validation.isValid = false;
      validation.issues.push({
        type: 'border_violation',
        waypointIndex: i,
        message: `Waypoint ${i + 1} is outside Kosovo borders`,
        severity: 'error'
      });
    }
    
    // Restricted zone check
    const violations = checkRestrictedZone(wp.lat, wp.lng, maxAltitude || 120);
    for (const v of violations) {
      if (v.severity === 'error') {
        validation.isValid = false;
      }
      validation.issues.push({
        type: v.type,
        waypointIndex: i,
        zone: v.zone.name,
        message: v.message,
        severity: v.severity
      });
    }
  }
  
  // Check segments between waypoints
  for (let i = 0; i < waypoints.length - 1; i++) {
    const wp1 = waypoints[i];
    const wp2 = waypoints[i + 1];
    
    const distance = calculateDistance(wp1.lat, wp1.lng, wp2.lat, wp2.lng);
    
    // Sample points along segment
    const numSamples = Math.ceil(distance / 500); // Sample every 500m
    let segmentValid = true;
    
    for (let j = 1; j < numSamples; j++) {
      const t = j / numSamples;
      const lat = wp1.lat + t * (wp2.lat - wp1.lat);
      const lng = wp1.lng + t * (wp2.lng - wp1.lng);
      
      if (!isWithinKosovo(lat, lng)) {
        segmentValid = false;
        validation.isValid = false;
        validation.issues.push({
          type: 'path_crosses_border',
          segmentIndex: i,
          message: `Flight path between waypoints ${i + 1} and ${i + 2} crosses Kosovo border`,
          severity: 'error'
        });
        break;
      }
      
      const segViolations = checkRestrictedZone(lat, lng, maxAltitude || 120);
      for (const v of segViolations) {
        if (v.severity === 'error') {
          segmentValid = false;
          validation.isValid = false;
          validation.issues.push({
            type: 'path_crosses_restricted',
            segmentIndex: i,
            zone: v.zone.name,
            message: `Flight path crosses restricted zone: ${v.zone.name}`,
            severity: 'error'
          });
        }
      }
    }
    
    validation.segments.push({
      from: i,
      to: i + 1,
      distance: Math.round(distance),
      valid: segmentValid
    });
  }
  
  // Calculate total distance
  const totalDistance = validation.segments.reduce((sum, seg) => sum + seg.distance, 0);
  
  res.json({
    success: true,
    data: {
      ...validation,
      totalDistance,
      waypointCount: waypoints.length
    }
  });
});

export default router;
