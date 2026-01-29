import mongoose from 'mongoose';

const waypointSchema = new mongoose.Schema({
  lat: { type: Number, required: true },
  lng: { type: Number, required: true },
  altitude: { type: Number, default: 100 },
  order: { type: Number, required: true }
}, { _id: false });

const operationAreaSchema = new mongoose.Schema({
  type: { type: String, enum: ['circle', 'rectangle'], required: true },
  center: {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true }
  },
  radius: Number, // for circles (meters)
  bounds: { // for rectangles
    north: Number,
    south: Number,
    east: Number,
    west: Number
  }
}, { _id: false });

const droneSchema = new mongoose.Schema({
  type: String,
  model: String,
  manufacturer: String,
  serialNumber: String,
  registrationNumber: String,
  weight: Number,
  maxSpeed: Number,
  maxAltitude: Number,
  maxFlightTime: Number,
  isDIY: { type: Boolean, default: false }
}, { _id: false });

const validationCheckSchema = new mongoose.Schema({
  name: String,
  passed: Boolean,
  message: String,
  severity: { type: String, enum: ['info', 'warning', 'error'] }
}, { _id: false });

const flightSchema = new mongoose.Schema({
  flightNumber: {
    type: String,
    required: true,
    unique: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Flight type and planning
  flightType: {
    type: String,
    enum: ['waypoint', 'area'],
    required: true
  },
  waypoints: [waypointSchema],
  operationArea: operationAreaSchema,
  
  // Schedule
  scheduledStart: {
    type: Date,
    required: true
  },
  scheduledEnd: {
    type: Date,
    required: true
  },
  actualStart: Date,
  actualEnd: Date,
  duration: Number, // planned duration in minutes
  actualDuration: Number, // actual duration in minutes
  
  // Drone info
  drone: droneSchema,
  
  // Flight parameters
  maxAltitude: {
    type: Number,
    required: true,
    max: 120
  },
  estimatedSpeed: Number,
  estimatedDistance: Number, // meters
  
  // Purpose and description
  purpose: {
    type: String,
    enum: ['recreational', 'commercial', 'photography', 'survey', 'inspection', 'agriculture', 'emergency', 'research'],
    required: true
  },
  description: String,
  
  // Status tracking
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'active', 'completed', 'cancelled', 'expired'],
    default: 'pending'
  },
  statusHistory: [{
    status: String,
    changedAt: { type: Date, default: Date.now },
    changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reason: String
  }],
  
  // Validation
  validation: {
    isValid: Boolean,
    checks: [validationCheckSchema],
    validatedAt: Date
  },
  
  // Conflict detection
  conflicts: [{
    flightId: { type: mongoose.Schema.Types.ObjectId, ref: 'Flight' },
    flightNumber: String,
    type: String, // 'time_overlap', 'spatial_overlap', 'trajectory_intersection'
    details: String
  }],
  
  // AI recommendations
  aiRecommendations: {
    overallScore: Number,
    weatherScore: Number,
    trafficScore: Number,
    terrainScore: Number,
    suggestions: [String],
    alternativeTimes: [{
      time: Date,
      reason: String,
      estimatedScore: Number
    }],
    weather: {
      temperature: Number,
      windSpeed: Number,
      visibility: Number,
      conditions: String
    }
  },
  
  // Real-time tracking (for active flights)
  currentPosition: {
    lat: Number,
    lng: Number,
    altitude: Number,
    heading: Number,
    speed: Number,
    updatedAt: Date
  },
  telemetryLog: [{
    timestamp: Date,
    lat: Number,
    lng: Number,
    altitude: Number,
    speed: Number,
    batteryLevel: Number
  }],
  
  // Administrative
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  reviewedAt: Date,
  reviewNotes: String,
  
  // Flags
  isSimulated: { type: Boolean, default: false },
  requiresSpecialAuthorization: { type: Boolean, default: false },
  specialAuthorizationReason: String,
  
  // Notifications
  notificationsSent: [{
    type: { type: String }, // 'approval', 'rejection', 'reminder', 'start', 'end'
    sentAt: Date,
    channel: String // 'email', 'sms', 'push'
  }]
}, {
  timestamps: true
});

// Indexes for efficient queries (flightNumber already indexed via unique: true)
flightSchema.index({ userId: 1, createdAt: -1 });
flightSchema.index({ status: 1 });
flightSchema.index({ scheduledStart: 1, scheduledEnd: 1 });
flightSchema.index({ 'waypoints.lat': 1, 'waypoints.lng': 1 });
flightSchema.index({ createdAt: -1 });

// Generate flight number
flightSchema.statics.generateFlightNumber = function() {
  const date = new Date();
  const prefix = 'KS';
  const timestamp = date.getTime().toString(36).toUpperCase().slice(-4);
  const random = Math.random().toString(36).substring(2, 5).toUpperCase();
  return `${prefix}-${timestamp}-${random}`;
};

// Find conflicting flights
flightSchema.statics.findConflicts = async function(flightData, excludeId = null) {
  const query = {
    status: { $in: ['pending', 'approved', 'active'] },
    $or: [
      // Time overlap
      {
        scheduledStart: { $lt: flightData.scheduledEnd },
        scheduledEnd: { $gt: flightData.scheduledStart }
      }
    ]
  };
  
  if (excludeId) {
    query._id = { $ne: excludeId };
  }
  
  const potentialConflicts = await this.find(query);
  return potentialConflicts;
};

// Update status with history
flightSchema.methods.updateStatus = function(newStatus, changedBy, reason) {
  this.status = newStatus;
  this.statusHistory.push({
    status: newStatus,
    changedBy,
    reason
  });
  return this.save();
};

// Calculate flight statistics
flightSchema.methods.calculateStats = function() {
  let totalDistance = 0;
  
  if (this.waypoints && this.waypoints.length > 1) {
    for (let i = 0; i < this.waypoints.length - 1; i++) {
      const wp1 = this.waypoints[i];
      const wp2 = this.waypoints[i + 1];
      totalDistance += calculateDistance(wp1.lat, wp1.lng, wp2.lat, wp2.lng);
    }
  }
  
  this.estimatedDistance = totalDistance;
  return totalDistance;
};

// Helper function for distance calculation
function calculateDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000;
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

const Flight = mongoose.model('Flight', flightSchema);

export default Flight;
