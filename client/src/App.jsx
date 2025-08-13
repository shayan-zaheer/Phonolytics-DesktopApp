import { useState, useEffect } from 'react'
import './App.css'

const API_BASE = 'http://localhost:8000'

function App() {
  const [devices, setDevices] = useState([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamingStatus, setStreamingStatus] = useState('')
  const [recordings, setRecordings] = useState([])
  const [detectedDevices, setDetectedDevices] = useState({ mic: null, system: null })
  const [loading, setLoading] = useState(false)

  // Fetch devices on component mount
  useEffect(() => {
    fetchDevices()
    fetchRecordings()
  }, [])

  const fetchDevices = async () => {
    try {
      const response = await fetch(`${API_BASE}/devices`)
      const data = await response.json()
      setDevices(data.devices || [])
      setDetectedDevices({
        mic: data.detected_mic_index,
        system: data.detected_system_index
      })
    } catch (error) {
      console.error('Failed to fetch devices:', error)
      setStreamingStatus('Error: Could not connect to backend server')
    }
  }

  const fetchRecordings = async () => {
    try {
      const response = await fetch(`${API_BASE}/recordings`)
      const data = await response.json()
      setRecordings(data.recordings || [])
    } catch (error) {
      console.error('Failed to fetch recordings:', error)
    }
  }

  const startStreaming = async () => {
    setLoading(true)
    try {
      const response = await fetch(`${API_BASE}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      })
      
      if (response.ok) {
        const data = await response.json()
        setIsStreaming(true)
        setStreamingStatus(`Recording started - Mic: ${data.mic_index}, System: ${data.sys_index}`)
      } else {
        const error = await response.json()
        setStreamingStatus(`Error: ${error.detail}`)
      }
    } catch (error) {
      setStreamingStatus('Error: Could not start streaming')
      console.error('Start streaming error:', error)
    }
    setLoading(false)
  }

  const stopStreaming = async () => {
    setLoading(true)
    try {
      const response = await fetch(`${API_BASE}/stop`, {
        method: 'POST'
      })
      
      if (response.ok) {
        const data = await response.json()
        setIsStreaming(false)
        setStreamingStatus('Recording stopped')
        // Refresh recordings list
        fetchRecordings()
        
        if (data.recordings) {
          setStreamingStatus(`Recording stopped. Saved files: ${Object.keys(data.recordings).join(', ')}`)
        }
      }
    } catch (error) {
      setStreamingStatus('Error: Could not stop streaming')
      console.error('Stop streaming error:', error)
    }
    setLoading(false)
  }

  const downloadRecording = (filename) => {
    // Extract tag from filename (MIC_ or SYS_)
    const tag = filename.startsWith('MIC_') ? 'MIC' : 'SYS'
    const downloadUrl = `${API_BASE}/download/${tag}`
    
    // Create a temporary link and click it
    const link = document.createElement('a')
    link.href = downloadUrl
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>🎵 Audio Streaming & Recording App</h1>
        <p>Record microphone and system audio simultaneously</p>
      </header>

      <main className="main-content">
        {/* Status Section */}
        <section className="status-section">
          <h2>Status</h2>
          <div className={`status-indicator ${isStreaming ? 'streaming' : 'stopped'}`}>
            {isStreaming ? '🔴 Recording...' : '⚫ Stopped'}
          </div>
          {streamingStatus && (
            <p className="status-message">{streamingStatus}</p>
          )}
        </section>

        {/* Controls Section */}
        <section className="controls-section">
          <h2>Controls</h2>
          <div className="button-group">
            <button 
              onClick={startStreaming} 
              disabled={isStreaming || loading}
              className="btn btn-start"
            >
              {loading ? 'Starting...' : '🎤 Start Recording'}
            </button>
            
            <button 
              onClick={stopStreaming} 
              disabled={!isStreaming || loading}
              className="btn btn-stop"
            >
              {loading ? 'Stopping...' : '⏹️ Stop Recording'}
            </button>
            
            <button 
              onClick={fetchRecordings}
              className="btn btn-refresh"
            >
              🔄 Refresh Recordings
            </button>
          </div>
        </section>

        {/* Device Info Section */}
        <section className="devices-section">
          <h2>Detected Devices</h2>
          <div className="device-info">
            <div className="device-item">
              <strong>🎤 Microphone:</strong> 
              {detectedDevices.mic !== null ? (
                <span className="device-found">
                  Index {detectedDevices.mic} - {devices.find(d => d.index === detectedDevices.mic)?.name || 'Unknown'}
                </span>
              ) : (
                <span className="device-not-found">Not detected</span>
              )}
            </div>
            <div className="device-item">
              <strong>🔊 System Audio:</strong> 
              {detectedDevices.system !== null ? (
                <span className="device-found">
                  Index {detectedDevices.system} - {devices.find(d => d.index === detectedDevices.system)?.name || 'Unknown'}
                </span>
              ) : (
                <span className="device-not-found">Not detected</span>
              )}
            </div>
          </div>
        </section>

        {/* Recordings Section */}
        <section className="recordings-section">
          <h2>📁 Saved Recordings ({recordings.length})</h2>
          {recordings.length === 0 ? (
            <p className="no-recordings">No recordings yet. Start recording to create audio files.</p>
          ) : (
            <div className="recordings-list">
              {recordings.map((filename, index) => (
                <div key={index} className="recording-item">
                  <div className="recording-info">
                    <span className="recording-name">{filename}</span>
                    <span className="recording-type">
                      {filename.startsWith('MIC_') ? '🎤 Microphone' : '🔊 System Audio'}
                    </span>
                  </div>
                  <button 
                    onClick={() => downloadRecording(filename)}
                    className="btn btn-download"
                  >
                    📥 Download
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* All Devices Section (for debugging) */}
        <details className="devices-details">
          <summary>🔧 All Available Devices ({devices.length})</summary>
          <div className="devices-list">
            {devices.map((device, index) => (
              <div key={index} className="device-detail">
                <strong>Index {device.index}:</strong> {device.name}
                <br />
                <small>
                  Input Channels: {device.maxInputChannels}, 
                  Sample Rate: {device.defaultSampleRate}Hz
                </small>
              </div>
            ))}
          </div>
        </details>
      </main>

      <footer className="app-footer">
        <p>Make sure the backend server is running on port 8000</p>
      </footer>
    </div>
  )
}

export default App
