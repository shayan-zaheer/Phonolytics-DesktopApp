import sys
import os
# Add current directory to Python path to fix imports
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import threading
import logging
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import pyaudiowpatch as pyaudio
import uvicorn
import uuid
from streaming_utils import start_streaming, stop_streaming

# ------------------------
# APP & LOGGER
# ------------------------

app = FastAPI(title="Audio Streamer API")
logger = logging.getLogger("audio_streamer")
logging.basicConfig(level=logging.INFO)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ------------------------
# SERVER STATE
# ------------------------
class StreamState:
    def __init__(self):
        self.p = pyaudio.PyAudio()
        self.is_streaming = False
        self.threads = []
        self._lock = threading.Lock()

    def set_streaming(self, value: bool):
        with self._lock:
            self.is_streaming = value

    def get_streaming(self) -> bool:
        with self._lock:
            return self.is_streaming

state = StreamState()

# ------------------------
# UTILITY: PRINT / LIST DEVICES
# ------------------------
def list_devices():
    p = state.p
    devices = []
    for i in range(p.get_device_count()):
        d = p.get_device_info_by_index(i)
        devices.append({
            "index": d.get("index"),
            "name": d.get("name"),
            "maxInputChannels": d.get("maxInputChannels"),
            "defaultSampleRate": d.get("defaultSampleRate"),
        })
    return devices

def detect_default_indexes():
    p = state.p
    mic_index = None
    sys_index = None
    
    # Detect microphone
    try:
        mic_index = p.get_default_input_device_info().get("index")
        logger.info("Detected microphone at index: %s", mic_index)
    except Exception as e:
        logger.error("Could not detect microphone: %s", e)

    # Detect system audio (WASAPI loopback)
    try:
        # First try the direct WASAPI method
        if hasattr(p, "get_default_wasapi_loopback"):
            sys_index = p.get_default_wasapi_loopback().get("index")
            logger.info("Found WASAPI loopback at index: %s", sys_index)
        else:
            # Search through all devices for loopback
            logger.info("Searching for loopback devices...")
            for i in range(p.get_device_count()):
                d = p.get_device_info_by_index(i)
                name = (d.get("name") or "").lower()
                max_input = d.get("maxInputChannels", 0)
                
                # Log all devices with input channels for debugging
                if max_input > 0:
                    logger.info("Device %d: %s (channels: %d)", i, d.get("name"), max_input)
                
                # Look for loopback devices (various naming patterns)
                if max_input > 0 and any(keyword in name for keyword in ["loopback", "stereo mix", "what u hear", "wave out mix"]):
                    sys_index = i
                    logger.info("Found system audio device at index %d: %s", i, d.get("name"))
                    break
            
            if sys_index is None:
                logger.warning("No system audio loopback device found")
                
    except Exception as e:
        logger.error("Could not detect system audio: %s", e)

    logger.info("Final detection - Mic: %s, System: %s", mic_index, sys_index)
    return mic_index, sys_index

# ------------------------
# WEBSOCKET ENDPOINTS
# ------------------------
@app.websocket("/call/{call_id}/{user_id}/{device_type}")
async def websocket_endpoint(websocket: WebSocket, call_id: str, user_id: str, device_type: str):
    await websocket.accept()
    logger.info(f"WebSocket connected: /call/{call_id}/{user_id}/{device_type}")
    try:
        while True:
            # Receive audio data
            data = await websocket.receive_bytes()
            # Log received data
            logger.debug(f"Received {len(data)} bytes from {device_type}")
    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected: /call/{call_id}/{user_id}/{device_type}")

# ------------------------
# API ENDPOINTS
# ------------------------
@app.get("/devices")
def api_list_devices():
    devices = list_devices()
    mic_idx, sys_idx = detect_default_indexes()
    return {"devices": devices, "detected_mic_index": mic_idx, "detected_system_index": sys_idx}

# ------------------------
# ENDPOINTS
# ------------------------

@app.get("/")
def health_check():
    return {"status": "healthy", "service": "audio-streamer"}

@app.get("/health")
def detailed_health():
    return {
        "status": "healthy",
        "service": "audio-streamer", 
        "streaming": state.get_streaming()
    }

from pydantic import BaseModel as PydanticBaseModel

class StartRequest(PydanticBaseModel):
    call_id: str = None

@app.post("/start")
def api_start_streaming(request: StartRequest = None):
    if request and request.call_id:
        call_id = str(request.call_id)
    else:
        call_id = f"call_{uuid.uuid4().hex[:8]}"
    start_streaming(call_id)
    return {"status": "started", "call_id": call_id}

@app.post("/stop")
def api_stop_streaming():
    stop_streaming()
    return {"status": "stopped"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080)
