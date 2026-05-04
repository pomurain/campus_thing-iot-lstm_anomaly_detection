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
from typing import Optional

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
                  device_id TEXT,
                  created_at DATETIME,
                  t_dht REAL,
                  t_bmp REAL,
                  is_anomaly BOOLEAN)''')
    c.execute('''CREATE TABLE IF NOT EXISTS gas_data
                 (id INTEGER PRIMARY KEY AUTOINCREMENT,
                  device_id TEXT,
                  created_at DATETIME,
                  gas_raw REAL,
                  gas_lpg REAL,
                  gas_co REAL)''')
    conn.commit()
    conn.close()

init_db()

# Ensure directories exist
os.makedirs("static", exist_ok=True)
os.makedirs("templates", exist_ok=True)

app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

class SensorData(BaseModel):
    type: str # 'temp' or 'gas'
    device_id: str
    t_dht: Optional[float] = None
    t_bmp: Optional[float] = None
    gas_raw: Optional[float] = None
    gas_lpg: Optional[float] = None
    gas_co: Optional[float] = None

class MockModel:
    """Fallback model if the real .keras model cannot be loaded."""
    def predict(self, features):
        return random.choice([True, False])

# Load the machine learning model
try:
    from tensorflow.keras.models import load_model
    import numpy as np
    model = load_model('model_2_features.keras')
    print("Successfully loaded model_2_features.keras")
except ImportError:
    print("Warning: tensorflow is not installed. Using MockModel.")
    model = MockModel()
except FileNotFoundError:
    print("Warning: model_2_features.keras not found. Using MockModel for demonstration.")
    model = MockModel()
except Exception as e:
    print(f"Warning: Could not load model_2_features.keras due to error: {e}. Using MockModel.")
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
    Unified endpoint for ESP32 devices to post either temp or gas data.
    """
    created_at = datetime.datetime.now().isoformat()
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()

    if data.type == "temp":
        # 1. Perform anomaly detection
        try:
            features = [data.t_dht, data.t_bmp]
            if isinstance(model, MockModel):
                is_anomaly = model.predict(features)
            else:
                import numpy as np
                padded_features = np.zeros((1, 60, 2))
                padded_features[0, -1, :] = features
                pred = model.predict(padded_features)
                is_anomaly = bool(pred[0][0] > 0.5)
        except Exception as e:
            print(f"Prediction error: {e}")
            is_anomaly = False

        c.execute("INSERT INTO sensor_data (device_id, created_at, t_dht, t_bmp, is_anomaly) VALUES (?, ?, ?, ?, ?)",
                  (data.device_id, created_at, data.t_dht, data.t_bmp, is_anomaly))
        
        message = {
            "type": "temp",
            "device_id": data.device_id,
            "created_at": created_at,
            "t_dht": data.t_dht,
            "t_bmp": data.t_bmp,
            "is_anomaly": is_anomaly
        }
    elif data.type == "gas":
        c.execute("INSERT INTO gas_data (device_id, created_at, gas_raw, gas_lpg, gas_co) VALUES (?, ?, ?, ?, ?)",
                  (data.device_id, created_at, data.gas_raw, data.gas_lpg, data.gas_co))
        
        message = {
            "type": "gas",
            "device_id": data.device_id,
            "created_at": created_at,
            "gas_raw": data.gas_raw,
            "gas_lpg": data.gas_lpg,
            "gas_co": data.gas_co
        }
    else:
        conn.close()
        return {"status": "error", "message": "Invalid data type"}

    conn.commit()
    conn.close()
    
    await manager.broadcast(message)
    if data.type == "temp":
        return {"status": "success", "is_anomaly": is_anomaly}
    return {"status": "success"}

@app.get("/api/temp")
async def get_all_temp_data(limit: int = 50):
    """
    Retrieve historical data.
    """
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    c.execute("SELECT * FROM sensor_data ORDER BY created_at DESC LIMIT ?", (limit,))
    rows = c.fetchall()
    conn.close()
    
    results = []
    for row in rows:
        results.append({
            "id": row[0],
            "device_id": row[1],
            "created_at": row[2],
            "t_dht": row[3],
            "t_bmp": row[4],
            "is_anomaly": bool(row[5])
        })
    return results

@app.get("/api/gas")
async def get_all_gas_data(limit: int = 50):
    """
    Retrieve historical gas data.
    """
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    c.execute("SELECT * FROM gas_data ORDER BY created_at DESC LIMIT ?", (limit,))
    rows = c.fetchall()
    conn.close()
    
    results = []
    for row in rows:
        results.append({
            "id": row[0],
            "device_id": row[1],
            "created_at": row[2],
            "gas_raw": row[3],
            "gas_lpg": row[4],
            "gas_co": row[5]
        })
    return results

@app.get("/api/stats")
async def get_stats():
    """
    Retrieve statistics.
    """
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    
    c.execute("SELECT device_id, COUNT(*), SUM(CASE WHEN is_anomaly THEN 1 ELSE 0 END) FROM sensor_data GROUP BY device_id")
    device_rows = c.fetchall()

    c.execute("SELECT COUNT(*), SUM(CASE WHEN is_anomaly THEN 1 ELSE 0 END) FROM sensor_data")
    row = c.fetchone()
    conn.close()
    
    total = row[0] if row else 0
    anomalies = row[1] if row and row[1] else 0
    rate = (anomalies / total * 100) if total > 0 else 0.0
    
    devices = []
    for d in device_rows:
        d_total = d[1]
        d_anom = d[2] if d[2] else 0
        devices.append({
            "device_id": d[0],
            "total_records": d_total,
            "total_anomalies": d_anom,
            "anomaly_rate": round((d_anom / d_total * 100) if d_total > 0 else 0, 2)
        })
        
    return {
        "total_records": total,
        "total_anomalies": anomalies,
        "anomaly_rate": round(rate, 2),
        "devices": devices
    }

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            # Keep connection alive
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)
