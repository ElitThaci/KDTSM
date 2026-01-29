import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: true,
    minlength: 8
  },
  fullName: {
    type: String,
    required: true,
    trim: true
  },
  phone: {
    type: String,
    trim: true
  },
  organization: {
    type: String,
    trim: true
  },
  role: {
    type: String,
    enum: ['pilot', 'operator', 'admin', 'authority'],
    default: 'pilot'
  },
  pilotLicense: {
    number: String,
    type: String,
    issuedBy: String,
    issuedDate: Date,
    expiryDate: Date,
    verified: { type: Boolean, default: false }
  },
  registeredDrones: [{
    serialNumber: String,
    registrationNumber: String,
    model: String,
    manufacturer: String,
    weight: Number,
    addedAt: { type: Date, default: Date.now }
  }],
  agreedToTerms: {
    type: Boolean,
    default: false
  },
  agreedToTermsAt: Date,
  isActive: {
    type: Boolean,
    default: true
  },
  lastLogin: Date,
  loginHistory: [{
    timestamp: { type: Date, default: Date.now },
    ip: String,
    userAgent: String
  }],
  statistics: {
    totalFlights: { type: Number, default: 0 },
    approvedFlights: { type: Number, default: 0 },
    rejectedFlights: { type: Number, default: 0 },
    totalFlightTime: { type: Number, default: 0 },
    totalDistance: { type: Number, default: 0 }
  }
}, {
  timestamps: true
});

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Update login history
userSchema.methods.recordLogin = function(ip, userAgent) {
  this.lastLogin = new Date();
  this.loginHistory.push({ ip, userAgent });
  if (this.loginHistory.length > 10) {
    this.loginHistory = this.loginHistory.slice(-10);
  }
  return this.save();
};

// Get public profile
userSchema.methods.toPublicJSON = function() {
  return {
    id: this._id,
    email: this.email,
    fullName: this.fullName,
    phone: this.phone,
    organization: this.organization,
    role: this.role,
    agreedToTerms: this.agreedToTerms,
    statistics: this.statistics,
    registeredDrones: this.registeredDrones,
    createdAt: this.createdAt
  };
};

const User = mongoose.model('User', userSchema);

export default User;
