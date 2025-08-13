import threading
import logging
from typing import Optional
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
import websocket
import pyaudiowpatch as pyaudio
import wave
from datetime import datetime
import os
import uvicorn

# ------------------------
# DEFAULT AUDIO CONFIGURATION
# ------------------------
DEFAULT_CHUNK = 1024
DEFAULT_FORMAT = pyaudio.paInt16
DEFAULT_CHANNELS = 2
DEFAULT_RATE = 44100
DEFAULT_SERVER_WS_URL = "ws://127.0.0.1:8000/call/1/1/{}"

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

# Create directory for recordings
os.makedirs("recordings", exist_ok=True)

# ------------------------
# SERVER STATE
# ------------------------
class StreamState:
    def __init__(self):
        self.p = pyaudio.PyAudio()
        self.is_streaming = False
        self.threads = []
        self.recording_files = {}  # {"MIC": filepath, "SYS": filepath}
        self._lock = threading.Lock()

    def set_streaming(self, value: bool):
        with self._lock:
            self.is_streaming = value

    def get_streaming(self) -> bool:
        with self._lock:
            return self.is_streaming

state = StreamState()

# ------------------------
# REQUEST MODELS
# ------------------------
class StartRequest(BaseModel):
    server_ws_url: Optional[str] = DEFAULT_SERVER_WS_URL
    chunk: Optional[int] = DEFAULT_CHUNK
    channels: Optional[int] = DEFAULT_CHANNELS
    rate: Optional[int] = DEFAULT_RATE

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
# STREAMING THREAD TARGET
# ------------------------
def stream_device(device_index: int, tag: str, server_ws_url: str, chunk: int, channels: int, rate: int):
    if device_index is None:
        logger.warning("[%s] No device found.", tag)
        return

    ws_url = server_ws_url.format(tag)
    ws = websocket.WebSocket()
    try:
        ws.connect(ws_url, timeout=5)
        logger.info("[%s] Connected to %s", tag, ws_url)
    except Exception as e:
        logger.error("[%s] WebSocket connection failed: %s", tag, e)
        return

    # Get device info and use its native sample rate for system audio
    try:
        device_info = state.p.get_device_info_by_index(device_index)
        device_name = device_info.get("name", "Unknown")
        native_rate = int(device_info.get("defaultSampleRate", rate))
        
        # Use native rate for system audio, default rate for microphone
        actual_rate = native_rate if tag == "SYS" else rate
        
        logger.info("[%s] Device: %s, Using sample rate: %d Hz", tag, device_name, actual_rate)
        
        stream = state.p.open(
            format=DEFAULT_FORMAT,
            channels=channels,
            rate=actual_rate,
            input=True,
            input_device_index=device_index,
            frames_per_buffer=chunk
        )
        logger.info("[%s] Audio stream opened successfully", tag)
        
    except Exception as e:
        logger.error("[%s] Failed to open audio stream: %s", tag, e)
        ws.close()
        return

    # Create WAV file for saving
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filepath = os.path.join("recordings", f"{tag}_{timestamp}.wav")
    wf = wave.open(filepath, "wb")
    wf.setnchannels(channels)
    wf.setsampwidth(state.p.get_sample_size(DEFAULT_FORMAT))
    wf.setframerate(actual_rate)
    state.recording_files[tag] = filepath

    logger.info("[%s] Streaming & recording started -> %s", tag, filepath)

    try:
        while state.get_streaming():
            try:
                data = stream.read(chunk, exception_on_overflow=False)
                ws.send(data, opcode=websocket.ABNF.OPCODE_BINARY)
                wf.writeframes(data)  # save to file
            except Exception as e:
                logger.error("[%s] Error: %s", tag, e)
                break
    finally:
        try:
            stream.stop_stream()
            stream.close()
            wf.close()
            ws.close()
        except Exception:
            pass
        logger.info("[%s] Stopped.", tag)

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

@app.post("/start")
def api_start_streaming(req: StartRequest):
    if state.get_streaming():
        raise HTTPException(status_code=400, detail="Already streaming")

    server_ws_url = req.server_ws_url or DEFAULT_SERVER_WS_URL
    chunk = req.chunk or DEFAULT_CHUNK
    channels = req.channels or DEFAULT_CHANNELS
    rate = req.rate or DEFAULT_RATE

    mic_idx, sys_idx = detect_default_indexes()
    state.set_streaming(True)

    t_mic = threading.Thread(target=stream_device, args=(mic_idx, "MIC", server_ws_url, chunk, channels, rate), daemon=True)
    t_sys = threading.Thread(target=stream_device, args=(sys_idx, "SYS", server_ws_url, chunk, channels, rate), daemon=True)
    state.threads = [t_mic, t_sys]
    for t in state.threads:
        t.start()

    return {"status": "started", "mic_index": mic_idx, "sys_index": sys_idx}

@app.post("/stop")
def api_stop_streaming():
    if not state.get_streaming():
        return {"status": "not_streaming"}

    state.set_streaming(False)
    for t in state.threads:
        if t.is_alive():
            t.join(timeout=3)
    state.threads = []

    return {"status": "stopped", "recordings": state.recording_files}

@app.get("/download/{tag}")
def api_download_recording(tag: str):
    tag = tag.upper()
    if tag not in state.recording_files:
        raise HTTPException(status_code=404, detail="No recording found for this tag")
    filepath = state.recording_files[tag]
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="Recording file missing")
    return FileResponse(filepath, filename=os.path.basename(filepath))

@app.get("/recordings")
def api_list_recordings():
    files = [f for f in os.listdir("recordings") if f.endswith(".wav")]
    return {"recordings": files}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
