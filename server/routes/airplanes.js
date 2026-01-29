import express from 'express';
import { authenticateToken } from './auth.js';
import { KOSOVO_BOUNDS } from '../data/kosovoData.js';

const router = express.Router();

// OpenSky Network API (free, no auth required for basic usage)
const OPENSKY_API = 'https://opensky-network.org/api';

// Cache for airplane data (refresh every 30 seconds)
let airplaneCache = {
  data: [],
  lastFetch: 0,
  cacheDuration: 30000 // 30 seconds
};

// Fetch real airplane traffic from OpenSky Network
async function fetchAirplaneTraffic() {
  try {
    const now = Date.now();
    
    // Return cached data if still fresh
    if (airplaneCache.data.length > 0 && (now - airplaneCache.lastFetch) < airplaneCache.cacheDuration) {
      return airplaneCache.data;
    }
    
    // Kosovo bounding box (slightly expanded)
    const bounds = {
      lamin: KOSOVO_BOUNDS.south - 0.5,
      lamax: KOSOVO_BOUNDS.north + 0.5,
      lomin: KOSOVO_BOUNDS.west - 0.5,
      lomax: KOSOVO_BOUNDS.east + 0.5
    };
    
    const url = `${OPENSKY_API}/states/all?lamin=${bounds.lamin}&lomin=${bounds.lomin}&lamax=${bounds.lamax}&lomax=${bounds.lomax}`;
    
    console.log('📡 Fetching airplane traffic from OpenSky Network...');
    
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json'
      }
    });
    
    if (!response.ok) {
      if (response.status === 429) {
        console.log('⚠️ OpenSky rate limit reached, using cached data');
        return airplaneCache.data;
      }
      console.error('OpenSky API error:', response.status);
      return airplaneCache.data;
    }
    
    const data = await response.json();
    
    if (!data.states || data.states.length === 0) {
      console.log('📡 No aircraft currently in Kosovo airspace');
      airplaneCache.data = [];
      airplaneCache.lastFetch = now;
      return [];
    }
    
    // Parse OpenSky response
    // State vector indices:
    // 0: icao24, 1: callsign, 2: origin_country, 3: time_position,
    // 4: last_contact, 5: longitude, 6: latitude, 7: baro_altitude,
    // 8: on_ground, 9: velocity, 10: true_track, 11: vertical_rate,
    // 12: sensors, 13: geo_altitude, 14: squawk, 15: spi, 16: position_source
    
    const airplanes = data.states.map(state => ({
      icao24: state[0],
      callsign: state[1]?.trim() || 'Unknown',
      originCountry: state[2],
      position: {
        lat: state[6],
        lng: state[5],
        altitude: state[7] || state[13] || 0, // baro or geo altitude in meters
        altitudeFt: Math.round((state[7] || state[13] || 0) * 3.28084) // Convert to feet
      },
      onGround: state[8],
      velocity: state[9] ? Math.round(state[9] * 3.6) : 0, // m/s to km/h
      heading: state[10] || 0,
      verticalRate: state[11] || 0, // m/s
      squawk: state[14],
      lastContact: state[4],
      // Determine if within strict Kosovo bounds
      inKosovo: state[6] >= KOSOVO_BOUNDS.south && 
                state[6] <= KOSOVO_BOUNDS.north &&
                state[5] >= KOSOVO_BOUNDS.west && 
                state[5] <= KOSOVO_BOUNDS.east
    })).filter(plane => plane.position.lat && plane.position.lng);
    
    // Update cache
    airplaneCache.data = airplanes;
    airplaneCache.lastFetch = now;
    
    console.log(`📡 Found ${airplanes.length} aircraft in/near Kosovo airspace`);
    
    return airplanes;
  } catch (error) {
    console.error('Failed to fetch airplane traffic:', error.message);
    return airplaneCache.data; // Return cached data on error
  }
}

// Get current airplane traffic
router.get('/', authenticateToken, async (req, res) => {
  try {
    const airplanes = await fetchAirplaneTraffic();
    
    // Separate planes inside Kosovo from nearby
    const inKosovo = airplanes.filter(p => p.inKosovo && !p.onGround);
    const nearby = airplanes.filter(p => !p.inKosovo && !p.onGround);
    const onGround = airplanes.filter(p => p.onGround);
    
    res.json({
      success: true,
      data: {
        airplanes: inKosovo,
        nearbyAirplanes: nearby,
        onGround: onGround,
        total: airplanes.length,
        inKosovoCount: inKosovo.length,
        timestamp: new Date().toISOString(),
        source: 'opensky-network.org',
        cached: (Date.now() - airplaneCache.lastFetch) < 5000 // Was this cached?
      }
    });
  } catch (error) {
    console.error('Airplane traffic error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch airplane traffic',
      data: {
        airplanes: [],
        source: 'error'
      }
    });
  }
});

// Get statistics about airplane traffic
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    const airplanes = await fetchAirplaneTraffic();
    
    const inFlight = airplanes.filter(p => !p.onGround);
    const avgAltitude = inFlight.length > 0 
      ? Math.round(inFlight.reduce((sum, p) => sum + p.position.altitude, 0) / inFlight.length)
      : 0;
    const avgSpeed = inFlight.length > 0
      ? Math.round(inFlight.reduce((sum, p) => sum + p.velocity, 0) / inFlight.length)
      : 0;
    
    // Count by country
    const byCountry = {};
    airplanes.forEach(p => {
      byCountry[p.originCountry] = (byCountry[p.originCountry] || 0) + 1;
    });
    
    res.json({
      success: true,
      data: {
        totalAircraft: airplanes.length,
        inFlight: inFlight.length,
        onGround: airplanes.length - inFlight.length,
        inKosovo: airplanes.filter(p => p.inKosovo).length,
        averageAltitude: avgAltitude,
        averageAltitudeFt: Math.round(avgAltitude * 3.28084),
        averageSpeed: avgSpeed,
        byCountry,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Airplane stats error:', error);
    res.status(500).json({ success: false, message: 'Failed to get airplane statistics' });
  }
});

export default router;
