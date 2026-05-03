# Project Overview
Purpose: Local edge server running on a Raspberry Pi for IoT devices.
Scope: Realtime data collection from ESP32 devices, storage in SQLite, anomaly detection via a local ML model (.pkg), and a responsive web dashboard to visualize data and anomaly rates.

# Architecture
Backend: Python with FastAPI (chosen for REST APIs and WebSocket support for realtime).
Frontend: Vanilla HTML, CSS, JS with a premium glassmorphism aesthetic. No heavy frameworks.
Integrations: Receives HTTP POST requests from ESP32, uses WebSocket to stream data to the frontend UI.
Database: SQLite.

# Core Components
Component: main.py
Description: The core FastAPI application that handles routing, database interaction, anomaly detection inference, and WebSocket connections.

Component: static/ and templates/
Description: Contains the lightweight vanilla frontend with premium UI styling.

Component: model.pkg
Description: A pre-trained machine learning model used to calculate the anomaly rate from sensor data.

# Key Decisions
Decision: FastAPI
Reason: Excellent for real-time WebSockets and fast REST APIs while remaining lightweight enough for a Raspberry Pi.

Decision: Vanilla Frontend with Glassmorphism
Reason: Meets the requirement for 'no framework' while providing a premium, modern user experience.

# Constraints
Technical: Must run efficiently on a Raspberry Pi, meaning lightweight operations.
Business: N/A

# Open Questions
- What library was used to export `model.pkg`? (Currently mocked using a fallback if the file can't be loaded).
- What exact sensor metrics are being sent? (Assumed temperature and humidity for demonstration).
