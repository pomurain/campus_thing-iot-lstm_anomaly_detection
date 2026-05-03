import asyncio
import datetime
import os
import pickle
import random
import sqlite3

from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel

app = FastAPI(title="IoT Edge Server")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DB_FILE = "iot_data.db"

def init_db():
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    c.execute('''CREATE TABLE IF NOT EXISTS sensor_data
                 (id INTEGER PRIMARY KEY AUTOINCREMENT,
                  timestamp DATETIME,
                  device_id TEXT,
                  sensor_type TEXT,
                  value REAL,
                  anomaly_score REAL)''')
    conn.commit()
    conn.close()

init_db()

# Ensure directories exist
os.makedirs("static", exist_ok=True)
os.makedirs("templates", exist_ok=True)

app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

class SensorData(BaseModel):
    device_id: str
    sensor_type: str  # e.g., 'temperature', 'humidity', 'vibration'
    value: float

class MockModel:
    """Fallback model if the real .pkg model cannot be loaded."""
    def predict(self, value, sensor_type, device_id):
        # We can simulate different ESP behavior
        if device_id == 'esp32-01' and value > 30:
            return random.uniform(0.6, 1.0)
        if sensor_type == 'temperature' and (value > 35 or value < -10):
            return random.uniform(0.7, 1.0)
        elif sensor_type == 'humidity' and (value > 90 or value < 20):
            return random.uniform(0.7, 1.0)
        return random.uniform(0.0, 0.2)

# Load the machine learning model
try:
    with open('model.pkg', 'rb') as f:
        model = pickle.load(f)
    print("Successfully loaded model.pkg")
except FileNotFoundError:
    print("Warning: model.pkg not found. Using MockModel for demonstration.")
    model = MockModel()
except Exception as e:
    print(f"Warning: Could not load model.pkg due to error: {e}. Using MockModel.")
    model = MockModel()

# Active websocket connections
class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception:
                pass

manager = ConnectionManager()

@app.get("/", response_class=HTMLResponse)
async def read_root(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

@app.post("/api/data")
async def receive_data(data: SensorData):
    """
    Endpoint for ESP32 devices to post sensor data.
    """
    # 1. Perform anomaly detection
    # Assuming the model takes value, sensor_type, and device_id.
    try:
        anomaly_score = model.predict(data.value, data.sensor_type, data.device_id)
    except Exception:
        # Fallback if model interface is different
        anomaly_score = 0.0

    timestamp = datetime.datetime.now().isoformat()
    
    # 2. Save to database
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    c.execute("INSERT INTO sensor_data (timestamp, device_id, sensor_type, value, anomaly_score) VALUES (?, ?, ?, ?, ?)",
              (timestamp, data.device_id, data.sensor_type, data.value, anomaly_score))
    conn.commit()
    conn.close()
    
    # 3. Broadcast to all connected clients
    message = {
        "timestamp": timestamp,
        "device_id": data.device_id,
        "sensor_type": data.sensor_type,
        "value": data.value,
        "anomaly_score": anomaly_score
    }
    
    await manager.broadcast(message)
    return {"status": "success", "anomaly_score": anomaly_score}

@app.get("/api/data")
async def get_all_data(limit: int = 50):
    """
    Retrieve historical data.
    """
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    c.execute("SELECT * FROM sensor_data ORDER BY timestamp DESC LIMIT ?", (limit,))
    rows = c.fetchall()
    conn.close()
    
    results = []
    for row in rows:
        results.append({
            "id": row[0],
            "timestamp": row[1],
            "device_id": row[2],
            "sensor_type": row[3],
            "value": row[4],
            "anomaly_score": row[5]
        })
    return results

@app.get("/api/stats")
async def get_stats():
    """
    Retrieve statistics per device.
    """
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    
    c.execute("SELECT device_id, COUNT(*), SUM(CASE WHEN anomaly_score > 0.5 THEN 1 ELSE 0 END) FROM sensor_data GROUP BY device_id")
    rows = c.fetchall()
    conn.close()
    
    device_stats = []
    for row in rows:
        device_id = row[0]
        total = row[1]
        anomalies = row[2] or 0
        rate = (anomalies / total * 100) if total > 0 else 0.0
        device_stats.append({
            "device_id": device_id,
            "total_records": total,
            "total_anomalies": anomalies,
            "anomaly_rate": round(rate, 2)
        })
        
    return {"devices": device_stats}

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            # Keep connection alive
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)
