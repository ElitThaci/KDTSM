import express from 'express';
import { authenticateToken } from './auth.js';
import Flight from '../models/Flight.js';
import User from '../models/User.js';
import mongoose from 'mongoose';

const router = express.Router();

// Get overall system statistics
router.get('/overview', authenticateToken, async (req, res) => {
  try {
    // Check if MongoDB is connected
    if (mongoose.connection.readyState !== 1) {
      return res.json({
        success: true,
        data: {
          message: 'Statistics available when MongoDB is connected',
          dbStatus: 'disconnected'
        }
      });
    }

    const [flightStats] = await Flight.getStatistics();
    const purposeStats = await Flight.getPurposeStatistics();
    const userCount = await User.countDocuments();
    const activeUsers = await User.countDocuments({ isActive: true });

    // Get flights by day for last 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const dailyFlights = await Flight.aggregate([
      { $match: { createdAt: { $gte: sevenDaysAgo } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    res.json({
      success: true,
      data: {
        flights: flightStats || {
          totalFlights: 0,
          pendingFlights: 0,
          approvedFlights: 0,
          rejectedFlights: 0,
          completedFlights: 0,
          activeFlights: 0
        },
        users: {
          total: userCount,
          active: activeUsers
        },
        purposeBreakdown: purposeStats,
        dailyFlights,
        dbStatus: 'connected'
      }
    });
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch statistics' });
  }
});

// Get user-specific statistics
router.get('/user', authenticateToken, async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.json({
        success: true,
        data: { message: 'Statistics available when MongoDB is connected' }
      });
    }

    const userId = req.user.id;

    const userFlights = await Flight.aggregate([
      { $match: { userId: new mongoose.Types.ObjectId(userId) } },
      {
        $group: {
          _id: null,
          totalFlights: { $sum: 1 },
          approved: { $sum: { $cond: [{ $eq: ['$status', 'approved'] }, 1, 0] } },
          rejected: { $sum: { $cond: [{ $eq: ['$status', 'rejected'] }, 1, 0] } },
          completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
          pending: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] } },
          totalDuration: { $sum: '$duration' },
          avgAltitude: { $avg: '$maxAltitude' }
        }
      }
    ]);

    const recentFlights = await Flight.find({ userId })
      .sort({ createdAt: -1 })
      .limit(5)
      .select('flightNumber status scheduledStart purpose drone.model');

    res.json({
      success: true,
      data: {
        statistics: userFlights[0] || {
          totalFlights: 0,
          approved: 0,
          rejected: 0,
          completed: 0,
          pending: 0
        },
        recentFlights
      }
    });
  } catch (error) {
    console.error('User stats error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch user statistics' });
  }
});

// Get flight history with filters
router.get('/history', authenticateToken, async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.json({
        success: true,
        data: { flights: [], message: 'History available when MongoDB is connected' }
      });
    }

    const { status, purpose, startDate, endDate, page = 1, limit = 20 } = req.query;
    const query = {};

    // Only show user's own flights unless admin
    if (req.user.role !== 'admin' && req.user.role !== 'authority') {
      query.userId = req.user.id;
    }

    if (status) query.status = status;
    if (purpose) query.purpose = purpose;
    if (startDate || endDate) {
      query.scheduledStart = {};
      if (startDate) query.scheduledStart.$gte = new Date(startDate);
      if (endDate) query.scheduledStart.$lte = new Date(endDate);
    }

    const total = await Flight.countDocuments(query);
    const flights = await Flight.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .populate('userId', 'firstName lastName email');

    res.json({
      success: true,
      data: {
        flights,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error('History error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch flight history' });
  }
});

// Export data (for admin)
router.get('/export', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin' && req.user.role !== 'authority') {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }

    if (mongoose.connection.readyState !== 1) {
      return res.status(400).json({ success: false, message: 'MongoDB connection required for export' });
    }

    const { format = 'json', startDate, endDate } = req.query;
    const query = {};

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    const flights = await Flight.find(query)
      .populate('userId', 'firstName lastName email organization')
      .lean();

    if (format === 'csv') {
      const headers = 'Flight Number,Status,User,Purpose,Scheduled Start,Scheduled End,Drone Model,Max Altitude,Created At\n';
      const csv = flights.map(f => 
        `${f.flightNumber},${f.status},${f.userId?.email || 'N/A'},${f.purpose},${f.scheduledStart},${f.scheduledEnd},${f.drone?.model || 'N/A'},${f.maxAltitude},${f.createdAt}`
      ).join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=flights-export.csv');
      return res.send(headers + csv);
    }

    res.json({
      success: true,
      data: { flights, exportedAt: new Date(), count: flights.length }
    });
  } catch (error) {
    console.error('Export error:', error);
    res.status(500).json({ success: false, message: 'Failed to export data' });
  }
});

export default router;
