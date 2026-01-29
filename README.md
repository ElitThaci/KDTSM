#  Kosovo Drone Traffic Management System (KDTMS)

A comprehensive web application for simulating drone traffic management in Kosovo, featuring real-time flight tracking, AI-powered recommendations, restricted zone visualization, and full KCAA (Kosovo Civil Aviation Authority) regulatory compliance.

![KDTMS](https://img.shields.io/badge/Version-2.0.0-brightgreen) ![Node.js](https://img.shields.io/badge/Node.js-18+-blue) ![MongoDB](https://img.shields.io/badge/MongoDB-Ready-green) ![License](https://img.shields.io/badge/License-Educational-orange)

##  Features

### Core Functionality
- **User Authentication**: Secure registration and login with JWT tokens
- **MongoDB Database**: Persistent storage for users, flights, and statistics
- **Interactive Map**: Dark-themed Leaflet map with accurate Kosovo borders
- **Flight Planning**: Create flights using waypoints, circles, or rectangles
- **Real-time Simulation**: 25+ simulated drone flights with live movement
- **Flight Validation**: Automatic checking against borders, restricted zones, and existing flights
- **Conflict Detection**: Automatic rejection of flights that overlap in time and space

### AI-Powered Features
- **Real Weather Integration**: WeatherAPI.com integration for live weather data
- **Weather Analysis**: Temperature, wind, visibility, and precipitation assessment
- **Traffic Scoring**: Real-time traffic density analysis
- **Terrain Assessment**: Elevation and terrain hazard evaluation
- **Smart Suggestions**: AI-generated flight recommendations
- **Alternative Times**: Suggested optimal flight windows
- **Risk Assessment**: Combined scoring for flight viability

### Real-time Data
- **Live Airplane Traffic**: OpenSky Network integration for commercial aircraft tracking
- **Weather Forecast**: Real-time weather data for flight planning
- **Flight Deconfliction**: Automatic conflict detection with existing flights

### Regulatory Compliance
- **KCAA Regulations**: Built-in Kosovo aviation rules
- **Restricted Zones**: Government, military, diplomatic, and heritage sites
- **Airport No-Fly Zones**: Pristina (8km) and Gjakova (5km) airports
- **Altitude Limits**: Max 120m AGL enforcement
- **Border Validation**: Automatic rejection of flights outside Kosovo
- **Trajectory Validation**: Path crossing detection - flights cannot cross outside Kosovo

## 🗺️ Map Features

### Restricted Zones Displayed
- **Airports**: Prishtina International (BKPR), Gjakova Airport (BKGJ)
- **Military**: Camp Bondsteel, Camp Film City, KSF Headquarters
- **Government**: Assembly, Presidential Palace, Prime Minister Office
- **Diplomatic**: US, UK, German Embassies
- **Infrastructure**: Power plants, water treatment facilities
- **Heritage**: UNESCO sites (Gračanica, Visoki Dečani, Patriarchate of Peć)

### Visual Elements
- Kosovo border with teal/green dashed line
- Red circles for airport no-fly zones
- Orange circles for government/diplomatic zones
- Purple circles for heritage sites
- Live drone markers with real-time movement
- Live airplane markers with heading indicators
- Flight path visualization (green for valid, red for invalid)

## 🛠️ Tech Stack

### Backend
- **Runtime**: Node.js 18+
- **Framework**: Express.js 4.x
- **Database**: MongoDB (with in-memory fallback)
- **Authentication**: JWT with bcrypt
- **Validation**: express-validator

### Frontend
- **HTML5/CSS3**: Modern, responsive design
- **JavaScript**: Vanilla ES6+
- **Mapping**: Leaflet.js with Drawing plugin
- **Styling**: Custom CSS with CSS Variables
- **Fonts**: Space Grotesk, JetBrains Mono

### External APIs
- **WeatherAPI.com**: Real weather forecasts
- **OpenSky Network**: Live airplane traffic

## 📦 Installation

### Prerequisites
- Node.js 18 or higher
- MongoDB (optional, uses in-memory storage if unavailable)
- npm or yarn

### Setup

```bash
# Clone or extract the project
cd drone-traffic-kosovo

# Install server dependencies
cd server
npm install

# Configure environment (optional)
cp .env.example .env
# Edit .env with your MongoDB URI and API keys

# Start the server
npm start

# The application will be available at http://localhost:3001
```

### MongoDB Setup (Recommended)

```bash
# Option 1: Local MongoDB
# Ensure MongoDB is running on localhost:27017

# Option 2: MongoDB Atlas (Cloud)
# Set MONGODB_URI in .env file:
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/kdtms

# Use MongoDB Compass to connect and manage the database
```

##  Usage

### Getting Started

1. **Register**: Create a new account with your details
2. **Accept Terms**: Read and accept KCAA regulations
3. **Plan Flight**: Use the mapping tools to create your flight path
4. **Get AI Analysis**: Click "Get AI Recommendations" for insights
5. **Submit Request**: Submit your flight for approval

### Flight Planning Tools

| Tool | Description |
|------|-------------|
|  Waypoints | Click map to add sequential waypoints |
|  Circle | Draw circular operation area (entire area = flight zone) |
|  Rectangle | Draw rectangular operation area (entire area = flight zone) |
|  Clear | Remove all waypoints and drawings |

### Drone Selection

Over 20 drone models available including:
- **DJI**: Mavic 3, Mini 4, Air 3, Avata 2, Matrice series
- **Autel**: EVO II, EVO Nano
- **Parrot**: Anafi AI, Anafi USA
- **Skydio**: 2+, X2
- **Fixed Wing**: eBee X, WingtraOne
- **DIY Option**: Custom drone with user-defined specs

##  AI Features & Future Enhancements

### Current AI Features
- Weather-based flight scoring
- Traffic density analysis
- Terrain hazard assessment
- Combined viability scoring
- Smart suggestion generation
- Alternative time recommendations

### Suggested AI Enhancements (Fix #3)

1. **Natural Language Flight Planning**
   - "Plan a photography flight around Pristina tomorrow morning"
   - AI interprets and creates optimal flight path

2. **Predictive Traffic Analysis**
   - ML-based prediction of airspace congestion
   - Optimal time slot recommendations

3. **Computer Vision Integration**
   - Drone camera feed analysis
   - Automatic obstacle detection
   - No-fly zone visual recognition

4. **Voice Assistant Integration**
   - Voice commands for flight planning
   - Real-time voice alerts during simulation

5. **Anomaly Detection**
   - Detect unusual flight patterns
   - Alert for potential regulatory violations

6. **Smart Route Optimization**
   - Multi-waypoint optimization (TSP solver)
   - Battery-aware routing
   - Wind-adjusted path planning

7. **Historical Pattern Learning**
   - Learn from past flight approvals/rejections
   - Improve recommendations over time

8. **Risk Prediction Model**
   - ML model for flight risk assessment
   - Based on weather, traffic, time, and location

9. **Chatbot Integration**
   - AI assistant for regulations Q&A
   - Flight planning guidance

10. **Image Generation**
    - Generate visual flight path previews
    - 3D terrain visualization with AI

##  Database Schema

### Users Collection
- Authentication credentials
- Profile information
- Flight statistics
- Login history
- Registered drones

### Flights Collection
- Flight details and parameters
- Waypoints/operation area
- Status tracking with history
- AI recommendations
- Validation results
- Conflict records
- Telemetry logs

##  KCAA Regulations Implemented

| Regulation | Value |
|------------|-------|
| Max Altitude AGL | 120 meters |
| Max Altitude Near Airport | 50 meters |
| Min Visibility | 3,000 meters |
| Max Wind Speed | 40 km/h |
| Operations | Daylight only (06:00-20:00) |
| VLOS Required | Yes |
| Minimum Pilot Age | 16 years |

##  Security Features

- JWT-based authentication
- Password hashing with bcrypt
- Input validation on all endpoints
- CORS and Helmet protection
- Secure session management
- MongoDB injection prevention

##  Project Structure

```
drone-traffic-kosovo/
├── server/
│   ├── index.js              # Express server entry
│   ├── package.json          # Server dependencies
│   ├── .env.example          # Environment template
│   ├── config/
│   │   └── database.js       # MongoDB connection
│   ├── models/
│   │   ├── User.js           # User model (MongoDB)
│   │   └── Flight.js         # Flight model (MongoDB)
│   ├── routes/
│   │   ├── auth.js           # Authentication routes
│   │   ├── flights.js        # Flight management
│   │   ├── ai.js             # AI recommendations
│   │   ├── airplanes.js      # Live airplane traffic
│   │   ├── simulation.js     # Simulation control
│   │   ├── stats.js          # Statistics API
│   │   └── zones.js          # Geographic data
│   └── data/
│       └── kosovoData.js     # Kosovo border & zones
└── client/
    └── public/
        ├── index.html        # Main HTML file
        └── app.js            # Client JavaScript
```

