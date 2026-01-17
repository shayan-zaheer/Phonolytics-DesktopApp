import pyaudiowpatch as pyaudio
import threading
import websocket
import numpy as np
import time
import json
import logging
import queue

# ------------------------
# GLOBAL STATE
# ------------------------
p = pyaudio.PyAudio()
audio_queues = {}
websockets = {}
stream_threads = []
is_streaming = False

# ------------------------
# AUDIO CONFIGURATION FOR YOUR SERVER
# ------------------------
CHUNK = 480                 # 30ms frames for stable connection
FORMAT = pyaudio.paInt16    
CHANNELS = 1                
RATE = 16000               
SERVER_WS_URL = "ws://127.0.0.1:8000/call/1/1/{}"

# Buffer management
MAX_BUFFER_SIZE = 5         
SEND_INTERVAL = 0.03        

# ------------------------
# LOGGING
# ------------------------
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("audio_client")

# ------------------------
# DEVICE HANDLING
# ------------------------
def get_devices():
    mic_index = None
    sys_index = None

    try:
        mic_index = p.get_default_input_device_info()['index']
    except Exception as e:
        print("Could not detect microphone:", e)

    try:
        if hasattr(p, "get_default_wasapi_loopback"):
            sys_index = p.get_default_wasapi_loopback()['index']
        else:
            for i in range(p.get_device_count()):
                d = p.get_device_info_by_index(i)
                name = d.get('name', '').lower()
                if ('loopback' in name or 'stereo mix' in name) and (d.get('maxInputChannels') or 0) > 0:
                    sys_index = i
                    break
    except Exception as e:
        print("Could not detect system audio:", e)

    print(f"Detected mic index: {mic_index}, system index: {sys_index}")
    return mic_index, sys_index

# ------------------------
# AUDIO PROCESSING
# ------------------------
def resample_audio(data, original_rate=44100, target_rate=16000):
    if original_rate == target_rate:
        return data
        
    audio_data = np.frombuffer(data, dtype=np.int16)
    if len(audio_data) == 0:
        return b''
        
    ratio = target_rate / original_rate
    target_length = int(len(audio_data) * ratio)
    
    if target_length == 0:
        return b''
        
    indices = np.arange(target_length) / ratio
    indices = np.clip(indices, 0, len(audio_data) - 1)
    resampled = np.interp(indices, np.arange(len(audio_data)), audio_data)
    return resampled.astype(np.int16).tobytes()

def convert_stereo_to_mono(stereo_data):
    audio_array = np.frombuffer(stereo_data, dtype=np.int16)
    if len(audio_array) % 2 != 0:
        audio_array = audio_array[:-1]
    if len(audio_array) == 0:
        return b''
    stereo_array = audio_array.reshape(-1, 2)
    mono_array = np.mean(stereo_array, axis=1, dtype=np.int16)
    return mono_array.tobytes()

# ------------------------
# WEBSOCKET HANDLING
# ------------------------
def create_websocket_connection(tag):
    ws_url = SERVER_WS_URL.format(tag)
    ws = websocket.WebSocket()
    ws.settimeout(30)
    
    try:
        logger.info(f"[{tag}] Connecting to {ws_url}")
        ws.connect(ws_url)
        logger.info(f"[{tag}] WebSocket connected successfully")
        return ws
    except Exception as e:
        logger.error(f"[{tag}] WebSocket connection failed: {e}")
        return None

def handle_server_messages(ws, tag):
    global is_streaming
    try:
        while is_streaming:
            try:
                ws.settimeout(1.0)
                message = ws.recv()
                
                if message:
                    try:
                        data = json.loads(message)
                        msg_type = data.get("type")
                        
                        if msg_type == "connection":
                            logger.info(f"[{tag}] Server confirmed connection: channel {data.get('channel_id')}")
                        elif msg_type == "transcription":
                            logger.info(f"[{tag}] Transcription: {data.get('text')}")
                        elif msg_type == "analysis":
                            logger.info(f"[{tag}] Analysis: {data}")
                        else:
                            logger.debug(f"[{tag}] Server message: {data}")
                            
                    except json.JSONDecodeError:
                        logger.debug(f"[{tag}] Non-JSON message: {message}")
                        
            except websocket.WebSocketTimeoutException:
                continue
            except Exception as e:
                if is_streaming:
                    logger.error(f"[{tag}] Error receiving: {e}")
                break
    except Exception as e:
        logger.error(f"[{tag}] Message handler error: {e}")

# ------------------------
# AUDIO CAPTURE & SENDING
# ------------------------
def audio_capture_thread(device_index, tag):
    global is_streaming, audio_queues
    if device_index is None:
        return

    device_info = p.get_device_info_by_index(device_index)
    device_rate = int(device_info.get('defaultSampleRate', 44100))
    device_channels = min(device_info.get('maxInputChannels', 1), 2)
    device_chunk = int(device_rate * 0.03)

    audio_queues[tag] = queue.Queue(maxsize=MAX_BUFFER_SIZE)

    try:
        stream = p.open(
            format=FORMAT,
            channels=device_channels,
            rate=device_rate,
            input=True,
            input_device_index=device_index,
            frames_per_buffer=device_chunk
        )
        logger.info(f"[{tag}] Audio capture started: {device_rate}Hz, {device_channels}ch")
    except Exception as e:
        logger.error(f"[{tag}] Failed to open audio stream: {e}")
        return

    while is_streaming:
        try:
            data = stream.read(device_chunk, exception_on_overflow=False)
            
            if device_channels == 2:
                data = convert_stereo_to_mono(data)
            
            if device_rate != 16000:
                data = resample_audio(data, device_rate, 16000)
            
            if data:
                try:
                    audio_queues[tag].put_nowait(data)
                except queue.Full:
                    try:
                        audio_queues[tag].get_nowait()
                        audio_queues[tag].put_nowait(data)
                    except queue.Empty:
                        pass
        except Exception as e:
            logger.error(f"[{tag}] Capture error: {e}")
            break

    try:
        stream.stop_stream()
        stream.close()
        logger.info(f"[{tag}] Capture stopped")
    except Exception as e:
        logger.error(f"[{tag}] Error stopping stream: {e}")

def network_send_thread(tag):
    global is_streaming, websockets, audio_queues
    log_interval = 2
    last_log = 0
    start_time = time.time()
    
    # Retry loop for initial connection
    while is_streaming:
        ws = create_websocket_connection(tag)
        if ws:
            break
            
        if time.time() - last_log >= log_interval:
            logger.info(f"[{tag}] Waiting for server... (attempting to connect)")
            last_log = time.time()
            
        # Stop trying after 30 seconds to prevent infinite zombie threads
        if time.time() - start_time > 30:
            logger.error(f"[{tag}] Timed out waiting for server connection")
            return
            
        time.sleep(1)

    if not is_streaming:
        if ws:
            ws.close()
        return

    websockets[tag] = ws
    msg_handler = threading.Thread(target=handle_server_messages, args=(ws, tag))
    msg_handler.daemon = True
    msg_handler.start()

    frames_sent = 0
    last_log_time = time.time()
    consecutive_errors = 0

    while is_streaming and consecutive_errors < 3:
        try:
            audio_data = audio_queues[tag].get(timeout=0.1)
            ws.send(audio_data, opcode=websocket.ABNF.OPCODE_BINARY)
            frames_sent += 1
            consecutive_errors = 0
            
            if time.time() - last_log_time >= 10.0:
                queue_size = audio_queues[tag].qsize()
                logger.info(f"[{tag}] Sent {frames_sent} frames, queue: {queue_size}")
                frames_sent = 0
                last_log_time = time.time()
            
            time.sleep(SEND_INTERVAL)
            
        except queue.Empty:
            continue
        except Exception as e:
            consecutive_errors += 1
            logger.error(f"[{tag}] Send error ({consecutive_errors}/3): {e}")
            if consecutive_errors < 3:
                time.sleep(0.1)

    try:
        ws.close()
        logger.info(f"[{tag}] WebSocket closed")
    except Exception as e:
        logger.error(f"[{tag}] Error closing WebSocket: {e}")

    if tag in websockets:
        del websockets[tag]

# ------------------------
# STREAM CONTROL
# ------------------------
def start_streaming():
    global is_streaming, stream_threads
    if is_streaming:
        return
        
    is_streaming = True


    mic_idx, sys_idx = get_devices()
    stream_threads = []

    for tag, device_idx in [("MIC", mic_idx), ("SYS", sys_idx)]:
        if device_idx is not None:
            capture_thread = threading.Thread(target=audio_capture_thread, args=(device_idx, tag))
            capture_thread.daemon = True
            stream_threads.append(capture_thread)
            capture_thread.start()
            
            send_thread = threading.Thread(target=network_send_thread, args=(tag,))
            send_thread.daemon = True
            stream_threads.append(send_thread)
            send_thread.start()

    logger.info(f"Started streaming with {len(stream_threads)} threads")

def stop_streaming():
    global is_streaming, stream_threads, websockets, audio_queues
    if not is_streaming:
        return
        
    logger.info("Stopping streaming...")
    is_streaming = False
    
    for tag, ws in list(websockets.items()):
        try:
            ws.close()
        except Exception:
            pass
    websockets.clear()
    
    for t in stream_threads:
        t.join(timeout=2)
    
    for tag in list(audio_queues.keys()):
        while not audio_queues[tag].empty():
            try:
                audio_queues[tag].get_nowait()
            except queue.Empty:
                break
        del audio_queues[tag]
    
    stream_threads = []
    
   
    logger.info("Streaming stopped successfully")
    
