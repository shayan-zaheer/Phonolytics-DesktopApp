import { useState, useEffect } from 'react'

const ServerStatus = () => {
  const [serverStatus, setServerStatus] = useState({ running: false, pid: null })
  const [isChecking, setIsChecking] = useState(false)
  const [isRestarting, setIsRestarting] = useState(false)

  const checkServerStatus = async () => {
    if (!window.electronAPI) return
    
    setIsChecking(true)
    try {
      const status = await window.electronAPI.getServerStatus()
      setServerStatus(status)
    } catch (error) {
      console.error('Failed to get server status:', error)
    } finally {
      setIsChecking(false)
    }
  }

  const restartServer = async () => {
    if (!window.electronAPI) return
    
    setIsRestarting(true)
    try {
      const result = await window.electronAPI.restartServer()
      if (result.success) {
        await checkServerStatus()
      } else {
        console.error('Failed to restart server:', result.error)
      }
    } catch (error) {
      console.error('Failed to restart server:', error)
    } finally {
      setIsRestarting(false)
    }
  }

  useEffect(() => {
    if (window.electronAPI) {
      checkServerStatus()
      
      // Check server status every 10 seconds
      const interval = setInterval(checkServerStatus, 10000)
      
      return () => clearInterval(interval)
    }
  }, [])

  // Don't show anything if not running in Electron
  if (!window.electronAPI) {
    return null
  }

  return (
    <div className="server-status">
      <div className="server-status-header">
        <h3>Server Status</h3>
        <button 
          onClick={checkServerStatus} 
          disabled={isChecking}
          className="btn-icon"
          title="Refresh server status"
        >
          {isChecking ? '🔄' : '↻'}
        </button>
      </div>
      
      <div className="server-status-content">
        <div className={`status-indicator ${serverStatus.running ? 'running' : 'stopped'}`}>
          <span className="status-dot"></span>
          <span className="status-text">
            {serverStatus.running ? 'Running' : 'Stopped'}
          </span>
        </div>
        
        {serverStatus.running && serverStatus.pid && (
          <div className="server-info">
            <small>PID: {serverStatus.pid}</small>
          </div>
        )}
        
        <div className="server-actions">
          <button 
            onClick={restartServer}
            disabled={isRestarting}
            className="btn-secondary btn-small"
          >
            {isRestarting ? 'Restarting...' : 'Restart Server'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default ServerStatus
