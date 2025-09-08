import threading
import logging
from typing import Optional
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import pyaudiowpatch as pyaudio
import uvicorn
from streaming_utils import start_streaming, stop_streaming

# ------------------------
# DEFAULT AUDIO CONFIGURATION
# ------------------------
DEFAULT_CHUNK = 1024
DEFAULT_FORMAT = pyaudio.paInt16
DEFAULT_CHANNELS = 2
DEFAULT_RATE = 44100

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
# UTILITY: PRINT / LIST DEVICES
# ------------------------
def list_devices():
    p = pyaudio.PyAudio()
    devices = []
    for i in range(p.get_device_count()):
        d = p.get_device_info_by_index(i)
        devices.append({
            "index": d.get("index"),
            "name": d.get("name"),
            "maxInputChannels": d.get("maxInputChannels"),
            "defaultSampleRate": d.get("defaultSampleRate"),
        })
    p.terminate()
    return devices

def detect_default_indexes():
    p = pyaudio.PyAudio()
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
    p.terminate()
    return mic_index, sys_index

# ------------------------
# API ENDPOINTS
# ------------------------
@app.get("/devices")
def api_list_devices():
    devices = list_devices()
    mic_idx, sys_idx = detect_default_indexes()
    return {"devices": devices, "detected_mic_index": mic_idx, "detected_system_index": sys_idx}

@app.post("/start")
def api_start_streaming():
    start_streaming()
    return {"status": "started"}

@app.post("/stop")
def api_stop_streaming():
    stop_streaming()
    return {"status": "stopped"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080)
