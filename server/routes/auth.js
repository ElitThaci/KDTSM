import express from 'express';
import jwt from 'jsonwebtoken';
import { body, validationResult } from 'express-validator';
import User from '../models/User.js';

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'kdtms-secret-key-change-in-production';

// In-memory fallback for when MongoDB is not available
const inMemoryUsers = new Map();
let useInMemory = false;

export function setInMemoryMode(enabled) {
  useInMemory = enabled;
  if (enabled) {
    console.log('⚠️ Auth running in memory-only mode');
  }
}

// Register
router.post('/register', [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 8 }),
  body('fullName').trim().notEmpty(),
  body('phone').optional({ checkFalsy: true }).trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false, 
        message: 'Validation failed', 
        errors: errors.array() 
      });
    }

    const { email, password, fullName, phone, organization } = req.body;

    if (useInMemory) {
      if (inMemoryUsers.has(email)) {
        return res.status(400).json({ success: false, message: 'Email already registered' });
      }
      
      const user = {
        id: `user_${Date.now()}`,
        email,
        password,
        fullName,
        phone,
        organization,
        role: 'pilot',
        agreedToTerms: false,
        statistics: { totalFlights: 0, approvedFlights: 0, rejectedFlights: 0 },
        createdAt: new Date()
      };
      
      inMemoryUsers.set(email, user);
      
      const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
      
      return res.status(201).json({
        success: true,
        message: 'Registration successful',
        data: { user: { ...user, password: undefined }, token }
      });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'Email already registered' });
    }

    const user = new User({ email, password, fullName, phone, organization });
    await user.save();

    const token = jwt.sign({ id: user._id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });

    res.status(201).json({
      success: true,
      message: 'Registration successful',
      data: { user: user.toPublicJSON(), token }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ success: false, message: 'Registration failed' });
  }
});

// Login
router.post('/login', [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: 'Invalid credentials' });
    }

    const { email, password } = req.body;

    if (useInMemory) {
      const user = inMemoryUsers.get(email);
      if (!user || user.password !== password) {
        return res.status(401).json({ success: false, message: 'Invalid credentials' });
      }
      
      const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
      
      return res.json({
        success: true,
        message: 'Login successful',
        data: { user: { ...user, password: undefined }, token }
      });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const ip = req.ip || req.connection.remoteAddress;
    const userAgent = req.get('User-Agent');
    await user.recordLogin(ip, userAgent);

    const token = jwt.sign({ id: user._id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });

    res.json({
      success: true,
      message: 'Login successful',
      data: { user: user.toPublicJSON(), token }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, message: 'Login failed' });
  }
});

// Authenticate token middleware
export async function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ success: false, message: 'Access token required' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    
    if (useInMemory) {
      for (const [email, user] of inMemoryUsers) {
        if (user.id === decoded.id) {
          req.user = user;
          return next();
        }
      }
      return res.status(401).json({ success: false, message: 'User not found' });
    }

    const user = await User.findById(decoded.id);
    if (!user || !user.isActive) {
      return res.status(401).json({ success: false, message: 'User not found or inactive' });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(403).json({ success: false, message: 'Invalid token' });
  }
}

// Agree to terms
router.post('/agree-terms', authenticateToken, async (req, res) => {
  try {
    if (useInMemory) {
      req.user.agreedToTerms = true;
      req.user.agreedToTermsAt = new Date();
      return res.json({ success: true, message: 'Terms accepted' });
    }

    req.user.agreedToTerms = true;
    req.user.agreedToTermsAt = new Date();
    await req.user.save();

    res.json({ success: true, message: 'Terms accepted' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to accept terms' });
  }
});

// Get profile
router.get('/profile', authenticateToken, async (req, res) => {
  try {
    if (useInMemory) {
      return res.json({ success: true, data: { user: { ...req.user, password: undefined } } });
    }
    res.json({ success: true, data: { user: req.user.toPublicJSON() } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to get profile' });
  }
});

// Get statistics
router.get('/statistics', authenticateToken, async (req, res) => {
  try {
    res.json({ success: true, data: { statistics: req.user.statistics } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to get statistics' });
  }
});

export default router;
