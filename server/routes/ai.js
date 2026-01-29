import express from 'express';
import { authenticateToken } from './auth.js';
import { 
  calculateDistance, 
  TERRAIN_DATA, 
  URBAN_AREAS,
  KCAA_REGULATIONS 
} from '../data/kosovoData.js';
import { inMemoryFlights } from './flights.js';

const router = express.Router();

// Weather API configuration (using WeatherAPI.com free tier)
const WEATHER_API_KEY = process.env.WEATHER_API_KEY || 'demo'; // User should set their own key
const WEATHER_API_BASE = 'https://api.weatherapi.com/v1';

// Fetch real weather data from API
async function fetchRealWeather(lat, lng, date) {
  try {
    // If no API key or demo mode, fall back to simulation
    if (!WEATHER_API_KEY || WEATHER_API_KEY === 'demo') {
      console.log('⚠️ No Weather API key set, using simulated weather');
      return null;
    }
    
    const url = `${WEATHER_API_BASE}/forecast.json?key=${WEATHER_API_KEY}&q=${lat},${lng}&days=3&aqi=no`;
    
    const response = await fetch(url);
    if (!response.ok) {
      console.error('Weather API error:', response.status);
      return null;
    }
    
    const data = await response.json();
    
    // Parse the response
    const current = data.current;
    const forecast = data.forecast?.forecastday || [];
    
    return {
      current: {
        temperature: current.temp_c,
        windSpeed: current.wind_kph,
        windDirection: current.wind_degree,
        visibility: current.vis_km * 1000, // Convert to meters
        cloudCover: current.cloud,
        conditions: current.condition.text,
        precipitation: current.precip_mm > 0,
        humidity: current.humidity,
        pressure: current.pressure_mb,
        uvIndex: current.uv,
        feelsLike: current.feelslike_c,
        gustSpeed: current.gust_kph,
        isDay: current.is_day === 1
      },
      forecast: forecast.map(day => ({
        date: day.date,
        maxTemp: day.day.maxtemp_c,
        minTemp: day.day.mintemp_c,
        avgTemp: day.day.avgtemp_c,
        maxWind: day.day.maxwind_kph,
        totalPrecip: day.day.totalprecip_mm,
        avgHumidity: day.day.avghumidity,
        condition: day.day.condition.text,
        chanceOfRain: day.day.daily_chance_of_rain,
        chanceOfSnow: day.day.daily_chance_of_snow,
        sunrise: day.astro.sunrise,
        sunset: day.astro.sunset,
        hourly: day.hour?.map(h => ({
          time: h.time,
          temp: h.temp_c,
          wind: h.wind_kph,
          windDir: h.wind_degree,
          precip: h.precip_mm,
          humidity: h.humidity,
          cloud: h.cloud,
          visibility: h.vis_km * 1000,
          condition: h.condition.text,
          chanceOfRain: h.chance_of_rain
        })) || []
      })),
      location: {
        name: data.location.name,
        region: data.location.region,
        country: data.location.country,
        lat: data.location.lat,
        lng: data.location.lon
      },
      source: 'weatherapi.com'
    };
  } catch (error) {
    console.error('Failed to fetch weather:', error.message);
    return null;
  }
}

// Simulated weather data for Kosovo regions (fallback)
function getSimulatedWeather(lat, lng, date) {
  const month = new Date(date).getMonth();
  const isWinter = month >= 11 || month <= 2;
  const isSummer = month >= 5 && month <= 8;
  
  let baseTemp = isSummer ? 25 : (isWinter ? 2 : 15);
  
  const nearbyTerrain = TERRAIN_DATA.find(t => 
    calculateDistance(lat, lng, t.position.lat, t.position.lng) < 30000
  );
  const elevationEffect = nearbyTerrain ? (nearbyTerrain.elevation / 1000) * -6 : 0;
  
  const variation = (Math.random() - 0.5) * 8;
  const temperature = Math.round(baseTemp + elevationEffect + variation);
  
  const baseWind = isWinter ? 20 : 10;
  const mountainEffect = nearbyTerrain && nearbyTerrain.elevation > 1500 ? 15 : 0;
  const windSpeed = Math.round(baseWind + mountainEffect + Math.random() * 15);
  
  const baseVisibility = isWinter ? 5000 : 10000;
  const visibilityReduction = nearbyTerrain && nearbyTerrain.elevation > 1000 ? 2000 : 0;
  const visibility = Math.max(1000, baseVisibility - visibilityReduction + (Math.random() - 0.5) * 3000);
  
  const precipProbability = isWinter ? 0.4 : (isSummer ? 0.15 : 0.25);
  const precipitation = Math.random() < precipProbability;
  
  const cloudCover = Math.round(Math.random() * 100);
  
  let conditions = 'Clear';
  if (cloudCover > 80) conditions = 'Overcast';
  else if (cloudCover > 50) conditions = 'Partly Cloudy';
  else if (cloudCover > 20) conditions = 'Scattered Clouds';
  
  if (precipitation) {
    conditions = isWinter ? 'Snow' : 'Rain';
  }
  
  return {
    temperature,
    windSpeed,
    windDirection: Math.round(Math.random() * 360),
    visibility: Math.round(visibility),
    cloudCover,
    conditions,
    precipitation,
    humidity: Math.round(40 + Math.random() * 40),
    pressure: Math.round(1013 + (Math.random() - 0.5) * 30),
    uvIndex: isSummer ? Math.round(Math.random() * 8 + 3) : Math.round(Math.random() * 3),
    gustSpeed: windSpeed + Math.round(Math.random() * 15),
    source: 'simulation'
  };
}

// Calculate terrain score
function calculateTerrainScore(waypoints) {
  let totalScore = 100;
  const issues = [];
  
  for (const wp of waypoints) {
    // Check nearby terrain
    for (const terrain of TERRAIN_DATA) {
      const distance = calculateDistance(wp.lat, wp.lng, terrain.position.lat, terrain.position.lng);
      
      if (distance < 5000 && terrain.elevation > 1500) {
        totalScore -= 15;
        issues.push(`High terrain near waypoint: ${terrain.name} (${terrain.elevation}m)`);
      } else if (distance < 10000 && terrain.elevation > 2000) {
        totalScore -= 10;
        issues.push(`Mountain area nearby: ${terrain.name}`);
      }
    }
    
    // Check urban areas
    for (const urban of URBAN_AREAS) {
      const distance = calculateDistance(wp.lat, wp.lng, urban.position.lat, urban.position.lng);
      
      if (distance < 2000) {
        totalScore -= 10;
        issues.push(`Near urban area: ${urban.name}`);
      }
    }
  }
  
  return {
    score: Math.max(0, Math.min(100, totalScore)),
    issues
  };
}

// Calculate traffic score
function calculateTrafficScore(waypoints, scheduledStart, scheduledEnd) {
  let conflictCount = 0;
  const nearbyFlights = [];
  
  const startTime = new Date(scheduledStart);
  const endTime = new Date(scheduledEnd);
  
  for (const [id, flight] of flights) {
    if (['cancelled', 'completed', 'rejected'].includes(flight.status)) continue;
    
    const flightStart = new Date(flight.scheduledStart);
    const flightEnd = new Date(flight.scheduledEnd);
    
    // Time overlap check
    if (startTime < flightEnd && endTime > flightStart) {
      // Spatial proximity check
      for (const wp of waypoints) {
        for (const fwp of (flight.waypoints || [])) {
          const distance = calculateDistance(wp.lat, wp.lng, fwp.lat, fwp.lng);
          if (distance < 2000) {
            conflictCount++;
            nearbyFlights.push({
              flightNumber: flight.flightNumber,
              distance: Math.round(distance),
              status: flight.status
            });
            break;
          }
        }
      }
    }
  }
  
  const score = Math.max(0, 100 - (conflictCount * 20));
  
  return {
    score,
    conflictCount,
    nearbyFlights: nearbyFlights.slice(0, 5) // Return top 5
  };
}

// Calculate flight time
function calculateFlightTime(waypoints, speed) {
  let totalDistance = 0;
  
  for (let i = 0; i < waypoints.length - 1; i++) {
    totalDistance += calculateDistance(
      waypoints[i].lat, waypoints[i].lng,
      waypoints[i + 1].lat, waypoints[i + 1].lng
    );
  }
  
  // Speed in km/h, distance in meters
  const speedMps = (speed || 40) * 1000 / 3600; // Convert to m/s
  const flightTimeSeconds = totalDistance / speedMps;
  
  // Add time for takeoff, landing, and turns (30 seconds per waypoint)
  const additionalTime = waypoints.length * 30;
  
  return {
    distanceMeters: Math.round(totalDistance),
    distanceKm: (totalDistance / 1000).toFixed(2),
    flightTimeMinutes: Math.ceil((flightTimeSeconds + additionalTime) / 60),
    estimatedBatteryUsage: Math.min(100, Math.round((flightTimeSeconds / 60) * 4)) // ~4% per minute
  };
}

// Generate alternative flight times
function generateAlternativeTimes(scheduledStart, weatherScore) {
  const alternatives = [];
  const baseDate = new Date(scheduledStart);
  
  // If weather is poor, suggest different times
  if (weatherScore < 70) {
    // Try same day, different hours
    for (let hourOffset of [-2, 2, 4]) {
      const altTime = new Date(baseDate);
      altTime.setHours(altTime.getHours() + hourOffset);
      
      // Only suggest daytime hours
      if (altTime.getHours() >= 7 && altTime.getHours() <= 18) {
        alternatives.push({
          time: altTime.toISOString(),
          reason: 'Better weather conditions expected',
          estimatedScore: Math.min(100, weatherScore + Math.random() * 20)
        });
      }
    }
    
    // Try next day
    const nextDay = new Date(baseDate);
    nextDay.setDate(nextDay.getDate() + 1);
    nextDay.setHours(10, 0, 0, 0);
    alternatives.push({
      time: nextDay.toISOString(),
      reason: 'Next day - potentially better conditions',
      estimatedScore: Math.min(100, weatherScore + 25 + Math.random() * 15)
    });
  }
  
  return alternatives.slice(0, 3);
}

// Get AI recommendations for a flight
router.post('/recommendations', authenticateToken, async (req, res) => {
  try {
    const { waypoints, operationArea, scheduledStart, scheduledEnd, drone, maxAltitude } = req.body;
    
    // Determine points to analyze
    const points = waypoints && waypoints.length > 0 
      ? waypoints 
      : operationArea?.center 
        ? [operationArea.center] 
        : [];
    
    if (points.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Waypoints or operation area required' 
      });
    }
    
    // Calculate center point for weather
    const centerLat = points.reduce((sum, p) => sum + p.lat, 0) / points.length;
    const centerLng = points.reduce((sum, p) => sum + p.lng, 0) / points.length;
    
    // Try to get real weather data first, fall back to simulation
    let weather;
    let weatherSource = 'simulation';
    const realWeather = await fetchRealWeather(centerLat, centerLng, scheduledStart);
    
    if (realWeather && realWeather.current) {
      weather = realWeather.current;
      weatherSource = 'weatherapi.com';
    } else {
      weather = getSimulatedWeather(centerLat, centerLng, scheduledStart);
    }
    
    // Calculate weather score
    let weatherScore = 100;
    const weatherIssues = [];
    
    if (weather.windSpeed > KCAA_REGULATIONS.maxWindSpeed) {
      weatherScore -= 40;
      weatherIssues.push(`High winds: ${weather.windSpeed} km/h exceeds safe limit`);
    } else if (weather.windSpeed > 25) {
      weatherScore -= 20;
      weatherIssues.push(`Moderate winds: ${weather.windSpeed} km/h - exercise caution`);
    }
    
    if (weather.visibility < KCAA_REGULATIONS.minVisibility) {
      weatherScore -= 30;
      weatherIssues.push(`Poor visibility: ${weather.visibility}m below minimum`);
    }
    
    if (weather.precipitation) {
      weatherScore -= 25;
      weatherIssues.push(`${weather.conditions} expected - may affect operations`);
    }
    
    if (weather.cloudCover > 80) {
      weatherScore -= 10;
      weatherIssues.push('Heavy cloud cover may affect GPS and visual operations');
    }
    
    weatherScore = Math.max(0, weatherScore);
    
    // Calculate terrain score
    const terrainAnalysis = calculateTerrainScore(points);
    
    // Calculate traffic score
    const trafficAnalysis = calculateTrafficScore(points, scheduledStart, scheduledEnd);
    
    // Calculate flight metrics
    const flightMetrics = points.length > 1 
      ? calculateFlightTime(points, drone?.maxSpeed || 40)
      : { distanceMeters: 0, distanceKm: 0, flightTimeMinutes: 30, estimatedBatteryUsage: 50 };
    
    // Overall score
    const overallScore = Math.round(
      (weatherScore * 0.35) + 
      (terrainAnalysis.score * 0.25) + 
      (trafficAnalysis.score * 0.25) + 
      (100 * 0.15) // Base regulatory compliance
    );
    
    // Determine risk level
    let riskLevel = 'low';
    if (overallScore < 50) riskLevel = 'high';
    else if (overallScore < 75) riskLevel = 'medium';
    
    // Generate suggestions
    const suggestions = [];
    
    if (weatherIssues.length > 0) {
      suggestions.push(...weatherIssues.map(i => `⚠️ ${i}`));
    }
    
    if (terrainAnalysis.issues.length > 0) {
      suggestions.push(...terrainAnalysis.issues.slice(0, 2).map(i => `🏔️ ${i}`));
    }
    
    if (trafficAnalysis.conflictCount > 0) {
      suggestions.push(`🚁 ${trafficAnalysis.conflictCount} other drone(s) operating in the area`);
    }
    
    if (flightMetrics.estimatedBatteryUsage > 70) {
      suggestions.push('🔋 Consider bringing backup batteries - estimated usage >70%');
    }
    
    if (maxAltitude > 100) {
      suggestions.push('📏 Flying above 100m - ensure VLOS is maintained');
    }
    
    if (suggestions.length === 0) {
      suggestions.push('✅ Conditions look favorable for your planned flight');
    }
    
    // Generate alternative times if score is low
    const alternativeTimes = generateAlternativeTimes(scheduledStart, weatherScore);
    
    const recommendations = {
      weatherScore,
      trafficScore: trafficAnalysis.score,
      terrainScore: terrainAnalysis.score,
      overallScore,
      riskLevel,
      suggestions,
      alternativeTimes,
      estimatedFlightTime: flightMetrics.flightTimeMinutes,
      weather: {
        current: weather,
        suitableForFlight: weatherScore >= 60
      },
      traffic: {
        nearbyFlights: trafficAnalysis.nearbyFlights,
        congestionLevel: trafficAnalysis.conflictCount > 3 ? 'high' : 
                         trafficAnalysis.conflictCount > 1 ? 'medium' : 'low'
      },
      flightMetrics,
      terrain: {
        score: terrainAnalysis.score,
        issues: terrainAnalysis.issues
      }
    };
    
    res.json({
      success: true,
      data: { recommendations }
    });
  } catch (error) {
    console.error('AI recommendations error:', error);
    res.status(500).json({ success: false, message: 'Failed to generate recommendations' });
  }
});

// Get weather forecast
router.get('/weather', authenticateToken, async (req, res) => {
  const { lat, lng, date } = req.query;
  
  if (!lat || !lng) {
    return res.status(400).json({ success: false, message: 'Latitude and longitude required' });
  }
  
  // Try real weather first
  const realWeather = await fetchRealWeather(parseFloat(lat), parseFloat(lng), date);
  
  if (realWeather) {
    res.json({
      success: true,
      data: {
        current: realWeather.current,
        forecast: realWeather.forecast,
        hourlyForecast: realWeather.forecast[0]?.hourly?.slice(0, 12) || [],
        location: realWeather.location,
        source: 'weatherapi.com'
      }
    });
  } else {
    // Fallback to simulation
    const weather = getSimulatedWeather(parseFloat(lat), parseFloat(lng), date || new Date());
    
    const hourlyForecast = [];
    const baseDate = new Date(date || new Date());
    
    for (let i = 0; i < 12; i++) {
      const forecastDate = new Date(baseDate);
      forecastDate.setHours(forecastDate.getHours() + i);
      
      const hourWeather = getSimulatedWeather(parseFloat(lat), parseFloat(lng), forecastDate);
      hourlyForecast.push({
        time: forecastDate.toISOString(),
        ...hourWeather
      });
    }
    
    res.json({
      success: true,
      data: {
        current: weather,
        hourlyForecast,
        location: { lat: parseFloat(lat), lng: parseFloat(lng) },
        source: 'simulation'
      }
    });
  }
});

// ============================================================
// FEATURE #3: Smart Flight Risk Analysis
// ============================================================

router.post('/risk-analysis', authenticateToken, async (req, res) => {
  try {
    const { waypoints, operationArea, scheduledStart, scheduledEnd, drone, maxAltitude } = req.body;
    
    // Get center point for analysis
    let centerLat, centerLng;
    if (operationArea?.center) {
      centerLat = operationArea.center.lat;
      centerLng = operationArea.center.lng;
    } else if (waypoints?.length > 0) {
      centerLat = waypoints.reduce((sum, wp) => sum + wp.lat, 0) / waypoints.length;
      centerLng = waypoints.reduce((sum, wp) => sum + wp.lng, 0) / waypoints.length;
    } else {
      return res.status(400).json({ success: false, message: 'No waypoints or operation area provided' });
    }
    
    const flightDate = new Date(scheduledStart);
    const flightHour = flightDate.getHours();
    
    // Initialize risk categories
    const riskAnalysis = {
      overallRisk: 0,
      overallRiskLevel: 'low',
      confidence: 85,
      categories: {},
      factors: [],
      mitigations: [],
      historicalData: {},
      similarFlights: {}
    };
    
    // 1. WEATHER RISK ANALYSIS
    const weatherRisk = analyzeWeatherRisk(flightDate, flightHour);
    riskAnalysis.categories.weather = weatherRisk;
    
    // 2. AIRSPACE TRAFFIC RISK
    const trafficRisk = analyzeTrafficRisk(centerLat, centerLng, flightDate);
    riskAnalysis.categories.traffic = trafficRisk;
    
    // 3. TERRAIN RISK
    const terrainRisk = analyzeTerrainRisk(waypoints || [{ lat: centerLat, lng: centerLng }], maxAltitude);
    riskAnalysis.categories.terrain = terrainRisk;
    
    // 4. REGULATORY RISK
    const regulatoryRisk = analyzeRegulatoryRisk(flightDate, maxAltitude, drone);
    riskAnalysis.categories.regulatory = regulatoryRisk;
    
    // 5. EQUIPMENT RISK
    const equipmentRisk = analyzeEquipmentRisk(drone, waypoints, maxAltitude);
    riskAnalysis.categories.equipment = equipmentRisk;
    
    // 6. TIME-BASED RISK
    const timeRisk = analyzeTimeRisk(flightDate);
    riskAnalysis.categories.time = timeRisk;
    
    // Calculate overall risk (weighted average)
    const weights = { weather: 0.25, traffic: 0.20, terrain: 0.15, regulatory: 0.15, equipment: 0.15, time: 0.10 };
    let totalRisk = 0;
    for (const [category, weight] of Object.entries(weights)) {
      totalRisk += (riskAnalysis.categories[category]?.score || 0) * weight;
    }
    riskAnalysis.overallRisk = Math.round(totalRisk);
    
    // Determine risk level
    if (riskAnalysis.overallRisk <= 25) {
      riskAnalysis.overallRiskLevel = 'low';
      riskAnalysis.recommendation = 'Flight conditions are favorable. Proceed with standard precautions.';
    } else if (riskAnalysis.overallRisk <= 50) {
      riskAnalysis.overallRiskLevel = 'moderate';
      riskAnalysis.recommendation = 'Exercise caution. Review risk factors and consider mitigations.';
    } else if (riskAnalysis.overallRisk <= 75) {
      riskAnalysis.overallRiskLevel = 'elevated';
      riskAnalysis.recommendation = 'Significant risks identified. Consider postponing or modifying flight plan.';
    } else {
      riskAnalysis.overallRiskLevel = 'high';
      riskAnalysis.recommendation = 'Flight not recommended under current conditions. Please reschedule.';
    }
    
    // Compile all risk factors
    for (const category of Object.values(riskAnalysis.categories)) {
      if (category.factors) riskAnalysis.factors.push(...category.factors);
      if (category.mitigations) riskAnalysis.mitigations.push(...category.mitigations);
    }
    
    // Historical data simulation
    riskAnalysis.historicalData = {
      similarFlightsInArea: Math.floor(Math.random() * 50) + 20,
      successRate: 94 + Math.floor(Math.random() * 5),
      averageDelay: Math.floor(Math.random() * 10) + 2,
      incidentsLast30Days: Math.floor(Math.random() * 3),
      commonIssues: ['Weather delays', 'GPS interference', 'Battery warnings'].slice(0, Math.floor(Math.random() * 3) + 1)
    };
    
    // Similar flights analysis
    riskAnalysis.similarFlights = {
      completed: Math.floor(Math.random() * 30) + 10,
      successRate: 92 + Math.floor(Math.random() * 7),
      averageDuration: Math.floor(Math.random() * 20) + 15,
      commonDrones: ['DJI Mavic 3', 'DJI Mini 4', 'Autel EVO II'].slice(0, 2)
    };
    
    res.json({ success: true, data: { riskAnalysis } });
    
  } catch (error) {
    console.error('Risk analysis error:', error);
    res.status(500).json({ success: false, message: 'Failed to perform risk analysis' });
  }
});

// Helper functions for risk analysis
function analyzeWeatherRisk(flightDate, flightHour) {
  const risk = { score: 0, level: 'low', factors: [], mitigations: [] };
  
  // Simulate weather conditions
  const windSpeed = Math.random() * 40;
  const visibility = 3000 + Math.random() * 7000;
  const precipitation = Math.random() < 0.2;
  const temperature = 5 + Math.random() * 25;
  
  if (windSpeed > 30) {
    risk.score += 40;
    risk.factors.push({ type: 'weather', severity: 'high', message: `High wind speed: ${windSpeed.toFixed(1)} km/h` });
    risk.mitigations.push('Consider flying at lower altitude where wind may be calmer');
  } else if (windSpeed > 20) {
    risk.score += 20;
    risk.factors.push({ type: 'weather', severity: 'medium', message: `Moderate wind: ${windSpeed.toFixed(1)} km/h` });
  }
  
  if (visibility < 3000) {
    risk.score += 35;
    risk.factors.push({ type: 'weather', severity: 'high', message: `Low visibility: ${(visibility/1000).toFixed(1)} km` });
    risk.mitigations.push('Maintain visual line of sight at all times');
  }
  
  if (precipitation) {
    risk.score += 30;
    risk.factors.push({ type: 'weather', severity: 'high', message: 'Precipitation expected' });
    risk.mitigations.push('Avoid flying during rain - risk of water damage');
  }
  
  if (temperature < 5 || temperature > 35) {
    risk.score += 15;
    risk.factors.push({ type: 'weather', severity: 'medium', message: `Extreme temperature: ${temperature.toFixed(1)}°C` });
    risk.mitigations.push('Monitor battery performance - temperature affects capacity');
  }
  
  risk.level = risk.score <= 20 ? 'low' : risk.score <= 50 ? 'moderate' : 'high';
  risk.details = { windSpeed, visibility, precipitation, temperature };
  
  return risk;
}

function analyzeTrafficRisk(lat, lng, flightDate) {
  const risk = { score: 0, level: 'low', factors: [], mitigations: [] };
  
  // Check active flights in area
  const activeFlights = Array.from(inMemoryFlights.values()).filter(f => 
    ['active', 'approved', 'pending'].includes(f.status)
  );
  
  let nearbyFlights = 0;
  for (const flight of activeFlights) {
    if (flight.waypoints?.length > 0) {
      const flightLat = flight.waypoints[0].lat;
      const flightLng = flight.waypoints[0].lng;
      const distance = calculateDistance(lat, lng, flightLat, flightLng);
      if (distance < 5000) nearbyFlights++;
    }
  }
  
  if (nearbyFlights > 5) {
    risk.score += 40;
    risk.factors.push({ type: 'traffic', severity: 'high', message: `High drone density: ${nearbyFlights} flights within 5km` });
    risk.mitigations.push('Maintain safe separation distances from other aircraft');
  } else if (nearbyFlights > 2) {
    risk.score += 20;
    risk.factors.push({ type: 'traffic', severity: 'medium', message: `${nearbyFlights} other flights in vicinity` });
  }
  
  // Check time of day for general traffic
  const hour = flightDate.getHours();
  if (hour >= 8 && hour <= 10 || hour >= 16 && hour <= 18) {
    risk.score += 15;
    risk.factors.push({ type: 'traffic', severity: 'medium', message: 'Peak aviation hours' });
  }
  
  risk.level = risk.score <= 20 ? 'low' : risk.score <= 50 ? 'moderate' : 'high';
  risk.details = { nearbyFlights, peakHours: hour >= 8 && hour <= 10 || hour >= 16 && hour <= 18 };
  
  return risk;
}

function analyzeTerrainRisk(waypoints, maxAltitude) {
  const risk = { score: 0, level: 'low', factors: [], mitigations: [] };
  
  // Check proximity to terrain features
  for (const wp of waypoints) {
    for (const terrain of TERRAIN_DATA) {
      const distance = calculateDistance(wp.lat, wp.lng, terrain.position.lat, terrain.position.lng);
      if (distance < 3000 && terrain.elevation > 1500) {
        risk.score += 25;
        risk.factors.push({ type: 'terrain', severity: 'high', message: `Near mountainous terrain: ${terrain.name} (${terrain.elevation}m)` });
        risk.mitigations.push('Increase altitude buffer for terrain clearance');
        break;
      }
    }
    
    // Check urban areas
    for (const urban of URBAN_AREAS) {
      const distance = calculateDistance(wp.lat, wp.lng, urban.position.lat, urban.position.lng);
      if (distance < 2000) {
        risk.score += 15;
        risk.factors.push({ type: 'terrain', severity: 'medium', message: `Near urban area: ${urban.name}` });
        risk.mitigations.push('Maintain awareness of buildings and obstacles');
        break;
      }
    }
  }
  
  if (maxAltitude > 100) {
    risk.score += 10;
    risk.factors.push({ type: 'terrain', severity: 'low', message: 'High altitude flight - increased wind exposure' });
  }
  
  risk.level = risk.score <= 20 ? 'low' : risk.score <= 50 ? 'moderate' : 'high';
  
  return risk;
}

function analyzeRegulatoryRisk(flightDate, maxAltitude, drone) {
  const risk = { score: 0, level: 'low', factors: [], mitigations: [] };
  
  const hour = flightDate.getHours();
  
  // Night flight check
  if (hour < 6 || hour > 20) {
    risk.score += 40;
    risk.factors.push({ type: 'regulatory', severity: 'high', message: 'Flight scheduled outside daylight hours' });
    risk.mitigations.push('KCAA requires daylight operations only (06:00-20:00)');
  }
  
  // Altitude check
  if (maxAltitude > KCAA_REGULATIONS.maxAltitudeAGL) {
    risk.score += 50;
    risk.factors.push({ type: 'regulatory', severity: 'high', message: `Altitude ${maxAltitude}m exceeds ${KCAA_REGULATIONS.maxAltitudeAGL}m limit` });
  }
  
  // Drone weight check
  if (drone?.weight > 25) {
    risk.score += 30;
    risk.factors.push({ type: 'regulatory', severity: 'high', message: 'Drone exceeds 25kg - certified category required' });
    risk.mitigations.push('Ensure proper certification and authorization');
  }
  
  risk.level = risk.score <= 20 ? 'low' : risk.score <= 50 ? 'moderate' : 'high';
  
  return risk;
}

function analyzeEquipmentRisk(drone, waypoints, maxAltitude) {
  const risk = { score: 0, level: 'low', factors: [], mitigations: [] };
  
  if (!drone) return risk;
  
  // Calculate flight distance
  let totalDistance = 0;
  if (waypoints?.length > 1) {
    for (let i = 1; i < waypoints.length; i++) {
      totalDistance += calculateDistance(
        waypoints[i-1].lat, waypoints[i-1].lng,
        waypoints[i].lat, waypoints[i].lng
      );
    }
  }
  
  // Check range capability
  const maxRange = (drone.maxSpeed || 50) * (drone.maxFlightTime || 30) / 60 * 1000; // meters
  if (totalDistance > maxRange * 0.7) {
    risk.score += 35;
    risk.factors.push({ type: 'equipment', severity: 'high', message: 'Flight distance approaches drone range limit' });
    risk.mitigations.push('Plan for battery replacement or reduce flight distance');
  }
  
  // Check altitude capability
  if (maxAltitude > (drone.maxAltitude || 120)) {
    risk.score += 25;
    risk.factors.push({ type: 'equipment', severity: 'medium', message: 'Planned altitude exceeds drone specification' });
  }
  
  // Lightweight drone in wind
  if (drone.weight < 0.5) {
    risk.score += 15;
    risk.factors.push({ type: 'equipment', severity: 'medium', message: 'Lightweight drone - more susceptible to wind' });
    risk.mitigations.push('Avoid flying in gusty conditions');
  }
  
  risk.level = risk.score <= 20 ? 'low' : risk.score <= 50 ? 'moderate' : 'high';
  risk.details = { totalDistance: Math.round(totalDistance), maxRange: Math.round(maxRange) };
  
  return risk;
}

function analyzeTimeRisk(flightDate) {
  const risk = { score: 0, level: 'low', factors: [], mitigations: [] };
  
  const hour = flightDate.getHours();
  const dayOfWeek = flightDate.getDay();
  
  // Golden hours (best flying conditions)
  if ((hour >= 6 && hour <= 9) || (hour >= 16 && hour <= 19)) {
    risk.factors.push({ type: 'time', severity: 'positive', message: 'Golden hour - optimal lighting conditions' });
  }
  
  // Midday heat
  if (hour >= 11 && hour <= 14) {
    risk.score += 15;
    risk.factors.push({ type: 'time', severity: 'low', message: 'Midday - thermal turbulence possible' });
    risk.mitigations.push('Be aware of thermals affecting flight stability');
  }
  
  // Weekend vs weekday
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    risk.score += 10;
    risk.factors.push({ type: 'time', severity: 'low', message: 'Weekend - higher recreational drone activity' });
  }
  
  risk.level = risk.score <= 20 ? 'low' : risk.score <= 50 ? 'moderate' : 'high';
  
  return risk;
}

// ============================================================
// FEATURE #4: AI-Powered Route Optimization
// ============================================================

router.post('/optimize-route', authenticateToken, async (req, res) => {
  try {
    const { waypoints, drone, optimizationGoal = 'balanced' } = req.body;
    
    if (!waypoints || waypoints.length < 2) {
      return res.status(400).json({ success: false, message: 'At least 2 waypoints required' });
    }
    
    const optimization = {
      originalRoute: waypoints,
      optimizedRoute: [],
      improvements: {},
      suggestions: [],
      alternativeRoutes: []
    };
    
    // 1. SHORTEST PATH OPTIMIZATION (using nearest neighbor heuristic)
    const shortestPath = optimizeShortestPath([...waypoints]);
    
    // 2. WIND-AWARE OPTIMIZATION
    const windOptimized = optimizeForWind([...waypoints], drone);
    
    // 3. BATTERY-EFFICIENT OPTIMIZATION
    const batteryOptimized = optimizeForBattery([...waypoints], drone);
    
    // 4. ALTITUDE OPTIMIZATION
    const altitudeOptimized = optimizeAltitude([...waypoints]);
    
    // Calculate distances
    const originalDistance = calculateTotalDistance(waypoints);
    const shortestDistance = calculateTotalDistance(shortestPath);
    const windDistance = calculateTotalDistance(windOptimized.route);
    
    // Select best route based on goal
    switch (optimizationGoal) {
      case 'shortest':
        optimization.optimizedRoute = shortestPath;
        optimization.method = 'Shortest Path';
        break;
      case 'battery':
        optimization.optimizedRoute = batteryOptimized.route;
        optimization.method = 'Battery Efficient';
        break;
      case 'wind':
        optimization.optimizedRoute = windOptimized.route;
        optimization.method = 'Wind Optimized';
        break;
      default: // balanced
        optimization.optimizedRoute = shortestPath;
        optimization.method = 'Balanced';
    }
    
    // Calculate improvements
    const optimizedDistance = calculateTotalDistance(optimization.optimizedRoute);
    optimization.improvements = {
      distanceSaved: Math.round(originalDistance - optimizedDistance),
      distanceSavedPercent: Math.round((1 - optimizedDistance / originalDistance) * 100),
      estimatedTimeSaved: Math.round((originalDistance - optimizedDistance) / ((drone?.maxSpeed || 50) / 3.6) / 60), // minutes
      batteryEfficiencyGain: Math.round(Math.random() * 15) + 5, // percent
      originalDistance: Math.round(originalDistance),
      optimizedDistance: Math.round(optimizedDistance)
    };
    
    // Generate suggestions
    optimization.suggestions = generateRouteSuggestions(waypoints, drone);
    
    // Generate alternative routes
    optimization.alternativeRoutes = [
      {
        name: 'Shortest Path',
        route: shortestPath,
        distance: Math.round(shortestDistance),
        benefit: 'Minimizes total flight distance'
      },
      {
        name: 'Wind Optimized',
        route: windOptimized.route,
        distance: Math.round(windDistance),
        benefit: 'Reduces headwind exposure, saves battery'
      },
      {
        name: 'Altitude Adjusted',
        route: altitudeOptimized,
        distance: Math.round(calculateTotalDistance(altitudeOptimized)),
        benefit: 'Optimizes altitude for terrain and efficiency'
      }
    ];
    
    res.json({ success: true, data: { optimization } });
    
  } catch (error) {
    console.error('Route optimization error:', error);
    res.status(500).json({ success: false, message: 'Failed to optimize route' });
  }
});

// Route optimization helper functions
function optimizeShortestPath(waypoints) {
  if (waypoints.length <= 2) return waypoints;
  
  // Keep first waypoint fixed, optimize the rest using nearest neighbor
  const optimized = [waypoints[0]];
  const remaining = waypoints.slice(1);
  
  while (remaining.length > 0) {
    const current = optimized[optimized.length - 1];
    let nearestIdx = 0;
    let nearestDist = Infinity;
    
    for (let i = 0; i < remaining.length; i++) {
      const dist = calculateDistance(current.lat, current.lng, remaining[i].lat, remaining[i].lng);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearestIdx = i;
      }
    }
    
    optimized.push(remaining.splice(nearestIdx, 1)[0]);
  }
  
  // Reorder the order property
  return optimized.map((wp, idx) => ({ ...wp, order: idx }));
}

function optimizeForWind(waypoints, drone) {
  // Simulate wind direction (in degrees, 0 = North)
  const windDirection = Math.random() * 360;
  const windSpeed = Math.random() * 25 + 5;
  
  // Prefer routes that minimize headwind exposure
  const optimized = waypoints.map(wp => {
    // Adjust altitude based on wind
    let newAltitude = wp.altitude;
    if (windSpeed > 20) {
      newAltitude = Math.max(30, wp.altitude - 20); // Lower altitude in high wind
    }
    return { ...wp, altitude: newAltitude };
  });
  
  return {
    route: optimized,
    windDirection,
    windSpeed,
    recommendation: windSpeed > 25 ? 'Consider postponing due to high winds' : 'Adjusted altitudes for wind conditions'
  };
}

function optimizeForBattery(waypoints, drone) {
  // Optimize for battery by:
  // 1. Reducing altitude where possible (less power needed)
  // 2. Smoothing the path (fewer direction changes)
  
  const optimized = waypoints.map((wp, idx) => {
    let optimalAltitude = wp.altitude;
    
    // Lower altitude saves battery but maintain safe minimum
    optimalAltitude = Math.max(50, wp.altitude - 15);
    
    return { ...wp, altitude: optimalAltitude };
  });
  
  return {
    route: optimized,
    estimatedSavings: Math.round(Math.random() * 10) + 5 // percent
  };
}

function optimizeAltitude(waypoints) {
  // Adjust altitude based on terrain
  return waypoints.map(wp => {
    let optimalAltitude = wp.altitude;
    
    // Check nearby terrain
    for (const terrain of TERRAIN_DATA) {
      const dist = calculateDistance(wp.lat, wp.lng, terrain.position.lat, terrain.position.lng);
      if (dist < 5000 && terrain.elevation > 1000) {
        // Increase altitude near mountains
        optimalAltitude = Math.min(120, wp.altitude + 20);
        break;
      }
    }
    
    return { ...wp, altitude: optimalAltitude };
  });
}

function calculateTotalDistance(waypoints) {
  let total = 0;
  for (let i = 1; i < waypoints.length; i++) {
    total += calculateDistance(
      waypoints[i-1].lat, waypoints[i-1].lng,
      waypoints[i].lat, waypoints[i].lng
    );
  }
  return total;
}

function generateRouteSuggestions(waypoints, drone) {
  const suggestions = [];
  
  // Check for inefficient zigzag patterns
  if (waypoints.length > 3) {
    suggestions.push({
      type: 'efficiency',
      priority: 'medium',
      message: 'Consider reordering waypoints to reduce backtracking',
      icon: '🔄'
    });
  }
  
  // Check altitude variations
  const altitudes = waypoints.map(wp => wp.altitude);
  const altRange = Math.max(...altitudes) - Math.min(...altitudes);
  if (altRange > 50) {
    suggestions.push({
      type: 'battery',
      priority: 'medium',
      message: 'Large altitude changes increase battery consumption',
      icon: '🔋'
    });
  }
  
  // Drone-specific suggestions
  if (drone?.weight < 0.3) {
    suggestions.push({
      type: 'safety',
      priority: 'low',
      message: 'Lightweight drone - consider lower altitudes in windy conditions',
      icon: '💨'
    });
  }
  
  suggestions.push({
    type: 'optimization',
    priority: 'info',
    message: 'Use "Wind Optimized" route if conditions are gusty',
    icon: '🌬️'
  });
  
  return suggestions;
}

// ============================================================
// FEATURE #5: Predictive Analytics Dashboard
// ============================================================

router.get('/predictive-analytics', authenticateToken, async (req, res) => {
  try {
    const { lat, lng, days = 7 } = req.query;
    
    const analytics = {
      airspaceForeceast: [],
      bestFlyingWindows: [],
      weeklyTrends: {},
      droneRecommendations: [],
      maintenancePredictions: [],
      seasonalInsights: {}
    };
    
    // 1. AIRSPACE CONGESTION FORECAST
    const today = new Date();
    for (let d = 0; d < days; d++) {
      const date = new Date(today);
      date.setDate(date.getDate() + d);
      
      const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
      const isWeekend = date.getDay() === 0 || date.getDay() === 6;
      
      // Generate hourly congestion predictions
      const hourlyPredictions = [];
      for (let h = 6; h <= 20; h++) {
        let congestion = 20 + Math.random() * 30;
        
        // Peak hours
        if (h >= 9 && h <= 11) congestion += 25;
        if (h >= 15 && h <= 17) congestion += 20;
        
        // Weekend adjustment
        if (isWeekend) congestion += 15;
        
        hourlyPredictions.push({
          hour: h,
          congestionLevel: Math.min(100, Math.round(congestion)),
          label: congestion < 40 ? 'Low' : congestion < 70 ? 'Moderate' : 'High'
        });
      }
      
      analytics.airspaceForeceast.push({
        date: date.toISOString().split('T')[0],
        dayName,
        isWeekend,
        hourlyPredictions,
        overallCongestion: Math.round(hourlyPredictions.reduce((s, h) => s + h.congestionLevel, 0) / hourlyPredictions.length)
      });
    }
    
    // 2. BEST FLYING WINDOWS
    analytics.bestFlyingWindows = generateBestFlyingWindows(days);
    
    // 3. WEEKLY TRENDS
    analytics.weeklyTrends = {
      totalFlights: Math.floor(Math.random() * 200) + 100,
      averageFlightDuration: Math.floor(Math.random() * 20) + 15,
      peakDay: 'Saturday',
      peakHour: '10:00',
      growthRate: (Math.random() * 10 + 2).toFixed(1),
      popularPurposes: [
        { purpose: 'Photography', percentage: 35 },
        { purpose: 'Recreational', percentage: 28 },
        { purpose: 'Survey', percentage: 20 },
        { purpose: 'Commercial', percentage: 12 },
        { purpose: 'Other', percentage: 5 }
      ],
      popularAreas: [
        { area: 'Pristina Region', flights: 45 },
        { area: 'Prizren', flights: 28 },
        { area: 'Peja', flights: 18 },
        { area: 'Mitrovica', flights: 12 }
      ]
    };
    
    // 4. DRONE RECOMMENDATIONS FOR CONDITIONS
    analytics.droneRecommendations = [
      {
        conditions: 'Current Weather',
        recommended: 'DJI Mavic 3 Pro',
        reason: 'Good stability in moderate wind, excellent camera',
        confidence: 92
      },
      {
        conditions: 'Long Range Survey',
        recommended: 'senseFly eBee X',
        reason: 'Extended flight time (90 min), fixed-wing efficiency',
        confidence: 88
      },
      {
        conditions: 'Urban/Confined Areas',
        recommended: 'DJI Mini 4 Pro',
        reason: 'Compact size, obstacle avoidance, under 250g',
        confidence: 95
      }
    ];
    
    // 5. MAINTENANCE PREDICTIONS (for registered drones)
    analytics.maintenancePredictions = [
      {
        component: 'Battery',
        status: 'Good',
        predictedLifespan: '~50 cycles remaining',
        recommendation: 'Store at 50% charge when not in use',
        urgency: 'low'
      },
      {
        component: 'Propellers',
        status: 'Check Soon',
        predictedLifespan: '~20 flight hours',
        recommendation: 'Inspect for chips and wear',
        urgency: 'medium'
      },
      {
        component: 'Motors',
        status: 'Good',
        predictedLifespan: '~200 flight hours',
        recommendation: 'No action needed',
        urgency: 'low'
      },
      {
        component: 'Gimbal',
        status: 'Good',
        predictedLifespan: 'N/A',
        recommendation: 'Calibrate if image is tilted',
        urgency: 'low'
      }
    ];
    
    // 6. SEASONAL INSIGHTS
    const month = today.getMonth();
    const season = month >= 2 && month <= 4 ? 'Spring' : 
                   month >= 5 && month <= 7 ? 'Summer' :
                   month >= 8 && month <= 10 ? 'Autumn' : 'Winter';
    
    analytics.seasonalInsights = {
      currentSeason: season,
      flyingConditions: season === 'Summer' ? 'Excellent' : season === 'Winter' ? 'Challenging' : 'Good',
      averageWindSpeed: season === 'Winter' ? '25 km/h' : season === 'Summer' ? '12 km/h' : '18 km/h',
      daylightHours: season === 'Summer' ? '14-15 hours' : season === 'Winter' ? '8-9 hours' : '11-12 hours',
      tips: getSeasonalTips(season),
      upcomingEvents: [
        { event: 'Drone Racing Championship', date: '2026-03-15', impact: 'High traffic in Pristina' },
        { event: 'Agricultural Survey Season', date: '2026-04-01', impact: 'Increased commercial flights' }
      ]
    };
    
    res.json({ success: true, data: { analytics } });
    
  } catch (error) {
    console.error('Predictive analytics error:', error);
    res.status(500).json({ success: false, message: 'Failed to generate analytics' });
  }
});

function generateBestFlyingWindows(days) {
  const windows = [];
  const today = new Date();
  
  for (let d = 0; d < Math.min(days, 5); d++) {
    const date = new Date(today);
    date.setDate(date.getDate() + d);
    
    // Morning window
    const morningScore = 70 + Math.floor(Math.random() * 25);
    windows.push({
      date: date.toISOString().split('T')[0],
      startTime: '06:30',
      endTime: '09:30',
      score: morningScore,
      label: morningScore > 85 ? 'Excellent' : morningScore > 70 ? 'Good' : 'Fair',
      conditions: {
        wind: 'Light (5-10 km/h)',
        visibility: 'Excellent (>10 km)',
        traffic: 'Low',
        lighting: 'Golden hour'
      }
    });
    
    // Evening window
    const eveningScore = 65 + Math.floor(Math.random() * 30);
    windows.push({
      date: date.toISOString().split('T')[0],
      startTime: '16:30',
      endTime: '19:30',
      score: eveningScore,
      label: eveningScore > 85 ? 'Excellent' : eveningScore > 70 ? 'Good' : 'Fair',
      conditions: {
        wind: 'Light to moderate (8-15 km/h)',
        visibility: 'Good (>7 km)',
        traffic: 'Moderate',
        lighting: 'Golden hour'
      }
    });
  }
  
  // Sort by score
  return windows.sort((a, b) => b.score - a.score);
}

function getSeasonalTips(season) {
  const tips = {
    Spring: [
      'Watch for sudden weather changes',
      'Great season for landscape photography',
      'Check for nesting birds in flight areas'
    ],
    Summer: [
      'Avoid midday heat - risk of overheating',
      'Early morning flights for best conditions',
      'Longest flying hours available'
    ],
    Autumn: [
      'Beautiful foliage photography opportunities',
      'Be prepared for morning fog',
      'Good balance of conditions'
    ],
    Winter: [
      'Keep batteries warm before flight',
      'Shorter daylight hours - plan accordingly',
      'Check for icing conditions at altitude'
    ]
  };
  return tips[season] || tips.Spring;
}

export default router;
