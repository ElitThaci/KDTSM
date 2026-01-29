import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Routes
import authRoutes from './routes/auth.js';
import flightRoutes from './routes/flights.js';
import aiRoutes from './routes/ai.js';
import simulationRoutes from './routes/simulation.js';
import zonesRoutes from './routes/zones.js';
import airplaneRoutes from './routes/airplanes.js';
import statsRoutes from './routes/stats.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/flights', flightRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/simulation', simulationRoutes);
app.use('/api/zones', zonesRoutes);
app.use('/api/airplanes', airplaneRoutes);
app.use('/api/stats', statsRoutes);

// Serve static files from client
app.use(express.static(path.join(__dirname, '../client/public')));

// Catch-all route for SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/public/index.html'));
});

// MongoDB Connection
let dbMode = 'in-memory';

const connectDB = async () => {
  const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/kdtms';
  
  try {
    await mongoose.connect(mongoURI, {
      serverSelectionTimeoutMS: 5000,
    });
    dbMode = 'mongodb';
    console.log('✅ MongoDB Connected:', mongoURI.includes('localhost') ? 'localhost' : 'remote');
  } catch (error) {
    console.log('⚠️  MongoDB connection failed, using in-memory mode');
    console.log('   To use MongoDB, ensure it\'s running and set MONGODB_URI in .env');
    console.log('   Error:', error.message);
    dbMode = 'in-memory';
  }
};

// Export database mode for routes
export { dbMode };

// Global error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    success: false, 
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Start server
connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`
╔══════════════════════════════════════════════════════════════╗
║     🚁 KOSOVO DRONE TRAFFIC MANAGEMENT SYSTEM 🚁             ║
╠══════════════════════════════════════════════════════════════╣
║  Server running on: http://localhost:${PORT}                    ║
║  Environment: ${(process.env.NODE_ENV || 'development').padEnd(16)}                     ║
║  Database: ${dbMode.padEnd(20)}                         ║
║  API Base: /api                                              ║
╚══════════════════════════════════════════════════════════════╝
    `);
  });
});

export default app;
