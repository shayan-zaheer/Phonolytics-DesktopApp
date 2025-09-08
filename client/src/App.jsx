import { useState, useEffect, useCallback } from 'react'
import './App.css'
import ServerStatus from './ServerStatus'

function App() {
  const [isStreaming, setIsStreaming] = useState(false)
  const [devices, setDevices] = useState([])
  const [status, setStatus] = useState('Ready')
  const [micIndex, setMicIndex] = useState(null)
  const [systemIndex, setSystemIndex] = useState(null)
  const [isLoading, setIsLoading] = useState(false)
  const [audioLevels, setAudioLevels] = useState({ mic: 0, system: 0 })
  const [isElectron, setIsElectron] = useState(false)

  const API_BASE = 'http://localhost:8080'

  const fetchDevices = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/devices`)
      const data = await response.json()
      setDevices(data.devices || [])
      setMicIndex(data.detected_mic_index)
      setSystemIndex(data.detected_system_index)
    } catch (error) {
      console.error('Failed to fetch devices:', error)
    }
  }, [])

  const startStreaming = useCallback(async () => {
    setIsLoading(true)
    try {
      const response = await fetch(`${API_BASE}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      })

      if (response.ok) {
        setIsStreaming(true)
        setStatus('Streaming Active')
      } else {
        const error = await response.json()
        setStatus(`Error: ${error.detail}`)
      }
    } catch (error) {
      setStatus('Connection Failed')
      console.error('Failed to start streaming:', error)
    } finally {
      setIsLoading(false)
    }
  }, [])

  const stopStreaming = useCallback(async () => {
    setIsLoading(true)
    try {
      const response = await fetch(`${API_BASE}/stop`, { method: 'POST' })
      
      if (response.ok) {
        setIsStreaming(false)
        setStatus('Stream Stopped')
      }
    } catch (error) {
      setStatus('Stop Failed')
      console.error('Failed to stop streaming:', error)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    setIsElectron(window.electronAPI !== undefined)

    if (window.electronAPI) {
      window.electronAPI.onMenuStartRecording(() => {
        if (!isStreaming && !isLoading) {
          startStreaming()
        }
      })

      window.electronAPI.onMenuStopRecording(() => {
        if (isStreaming && !isLoading) {
          stopStreaming()
        }
      })

      window.electronAPI.onMenuRefreshDevices(() => {
        fetchDevices()
      })

      window.electronAPI.onMenuNewRecording(() => {
        if (!isStreaming && !isLoading) {
          startStreaming()
        }
      })

      return () => {
        window.electronAPI.removeAllListeners('menu-start-recording')
        window.electronAPI.removeAllListeners('menu-stop-recording')
        window.electronAPI.removeAllListeners('menu-refresh-devices')
        window.electronAPI.removeAllListeners('menu-new-recording')
      }
    }
  }, [isStreaming, isLoading, startStreaming, stopStreaming, fetchDevices])

  useEffect(() => {
    if (isStreaming) {
      const interval = setInterval(() => {
        setAudioLevels({
          mic: Math.random() * 100,
          system: Math.random() * 100
        })
      }, 100)
      return () => clearInterval(interval)
    } else {
      setAudioLevels({ mic: 0, system: 0 })
    }
  }, [isStreaming])

  useEffect(() => {
    fetchDevices()
  }, [fetchDevices])

  return (
    <div className="app">
      <div className="grid-background"></div>

      <header className="header">
        <div className="header-content">
          <div className="logo">
            <img src="./logo.svg" alt="Phonolytics" className="logo-icon" />
            <h1>Phonolytics</h1>
            {isElectron && <span className="electron-badge">Desktop</span>}
          </div>
          <div className="status-panel">
            <div className={`status-indicator ${isStreaming ? 'active' : 'inactive'}`}>
              <div className="pulse"></div>
              <span>{status}</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="main-content">
        {/* Server Status (only in Electron) */}
        {isElectron && <ServerStatus />}
        
        {/* Control Panel */}
        <section className="control-panel">
          <div className="panel-header">
            <h2>Audio Control Center</h2>
            <div className="devices-info">
              <span className="device-tag mic">MIC #{micIndex}</span>
              <span className="device-tag system">SYS #{systemIndex}</span>
            </div>
          </div>

          {/* Audio Visualizer */}
          <div className="audio-visualizer">
            <div className="channel">
              <label>Microphone</label>
              <div className="level-meter">
                <div
                  className="level-fill mic"
                  style={{ width: `${audioLevels.mic}%` }}
                ></div>
              </div>
              <span className="level-value">{Math.round(audioLevels.mic)}%</span>
            </div>
            <div className="channel">
              <label>System Audio</label>
              <div className="level-meter">
                <div
                  className="level-fill system"
                  style={{ width: `${audioLevels.system}%` }}
                ></div>
              </div>
              <span className="level-value">{Math.round(audioLevels.system)}%</span>
            </div>
          </div>

          {/* Control Buttons */}
          <div className="control-buttons">
            <button
              className={`btn ${isStreaming ? 'btn-stop' : 'btn-start'}`}
              onClick={isStreaming ? stopStreaming : startStreaming}
              disabled={isLoading}
            >
              <span className="btn-icon">
                {isLoading ? '⚡' : isStreaming ? '⏹' : '▶'}
              </span>
              <span className="btn-text">
                {isLoading ? 'Processing...' : isStreaming ? 'Stop Recording' : 'Start Recording'}
              </span>
            </button>
          </div>
        </section>

        {/* Recordings Panel */}
        {/* Device Info Panel */}
        <section className="device-panel">
          <div className="panel-header">
            <h2>Audio Devices</h2>
          </div>
          <div className="devices-list">
            {devices.slice(0, 6).map((device, index) => (
              <div key={index} className="device-item">
                <div className="device-info">
                  <span className="device-name">{device.name}</span>
                  <span className="device-details">
                    {device.maxInputChannels} ch • {Math.round(device.defaultSampleRate)} Hz
                  </span>
                </div>
                <div className={`device-status ${device.index === micIndex ? 'mic-active' :
                    device.index === systemIndex ? 'system-active' : 'inactive'
                  }`}>
                  {device.index === micIndex ? '🎤' :
                    device.index === systemIndex ? '🔊' : '◯'}
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  )
}

export default App
