const { app, BrowserWindow, shell, Menu, ipcMain, safeStorage } = require('electron')
const path = require('path')
const { spawn } = require('child_process')
const fs = require('fs')
// Use app.isPackaged - more reliable than NODE_ENV for dev detection
const isDev = !app.isPackaged

let mainWindow
let serverProcess = null
let connectionStatusPollInterval = null
let lastConnectionStatus = null

// API Configuration for local server
const API_CONFIG = {
  BASE_URL: 'http://localhost:8000',
  ENDPOINTS: {
    HEALTH: '/health',
    START_STREAM: '/start-streaming',
    STOP_STREAM: '/stop-streaming',
    DEVICES: '/devices',
    WEBSOCKET: '/ws'
  }
}

// Local server (port 8080) configuration
const LOCAL_SERVER_CONFIG = {
  BASE_URL: 'http://localhost:8080',
  ENDPOINTS: {
    HEALTH: '/health'
  }
}

// Function to start the server executable
function startServerProcess() {
  console.log('Starting server process...')
  
  // Path to server executable
  const serverExePath = isDev 
    ? path.join(__dirname, '../resources/server/server.exe')
    : path.join(process.resourcesPath, 'server', 'server.exe')
  
  console.log('Server executable path:', serverExePath)
  
  if (!fs.existsSync(serverExePath)) {
    console.error('Server executable not found at:', serverExePath)
    return false
  }
  
  try {
    serverProcess = spawn(serverExePath, [], {
      cwd: path.dirname(serverExePath),
      detached: false,
      stdio: ['pipe', 'pipe', 'pipe']
    })
    
    serverProcess.stdout.on('data', (data) => {
      console.log('SERVER:', data.toString())
    })
    
    serverProcess.stderr.on('data', (data) => {
      console.error('SERVER ERROR:', data.toString())
    })
    
    serverProcess.on('close', (code) => {
      console.log(`Server process exited with code ${code}`)
      serverProcess = null
    })
    
    serverProcess.on('error', (error) => {
      console.error('Server process error:', error)
      serverProcess = null
    })
    
    console.log('Server process started successfully')
    return true
    
  } catch (error) {
    console.error('Failed to start server process:', error)
    return false
  }
}

// Function to stop the server process
function stopServerProcess() {
  return new Promise((resolve) => {
    if (serverProcess) {
      console.log('Stopping server process...')
      
      serverProcess.on('close', () => {
        console.log('Server process stopped')
        serverProcess = null
        resolve()
      })
      
      serverProcess.kill('SIGTERM')
      
      // Force kill after 5 seconds if graceful shutdown fails
      setTimeout(() => {
        if (serverProcess && !serverProcess.killed) {
          console.log('Force killing server process')
          serverProcess.kill('SIGKILL')
          serverProcess = null
        }
        resolve()
      }, 5000)
    } else {
      resolve()
    }
  })
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      enableRemoteModule: false,
      nodeIntegration: false
    },
    show: false,
    icon: path.join(__dirname, '../public/logo.ico')
  })

  // Load the app
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
  })

  // Handle window closed
  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// Handle API requests from renderer
ipcMain.handle('api-request', async (event, { endpoint, method = 'GET', data }) => {
  try {
    const url = `${API_CONFIG.BASE_URL}${endpoint}`
    console.log(`API Request: ${method} ${url}`)
    
    const fetch = require('electron').net.request || require('https').request
    
    const options = {
      method: method,
      headers: {
        'Content-Type': 'application/json'
      }
    }
    
    if (method !== 'GET' && data) {
      options.body = JSON.stringify(data)
    }

    const response = await fetch(url, options)
    const result = await response.json()
    
    return { success: true, data: result }
  } catch (error) {
    console.error('API Request failed:', error)
    return { success: false, error: error.message }
  }
})

// Handle window controls
ipcMain.handle('window-minimize', () => {
  if (mainWindow) mainWindow.minimize()
})

ipcMain.handle('window-maximize', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize()
    } else {
      mainWindow.maximize()
    }
  }
})

ipcMain.handle('window-close', () => {
  if (mainWindow) mainWindow.close()
})

// Handle external links
ipcMain.handle('open-external', (event, url) => {
  shell.openExternal(url)
})

// Secure Token Storage using safeStorage
const TOKEN_FILE_PATH = path.join(app.getPath('userData'), 'secure_auth_token.enc');

ipcMain.handle('save-token', async (event, token) => {
  try {
    if (safeStorage.isEncryptionAvailable()) {
      const encryptedToken = safeStorage.encryptString(token);
      fs.writeFileSync(TOKEN_FILE_PATH, encryptedToken);
      return { success: true };
    } else {
      // Fallback if encryption is not available on this OS
      fs.writeFileSync(TOKEN_FILE_PATH, Buffer.from(token, 'utf-8'));
      return { success: true };
    }
  } catch (error) {
    console.error('Failed to save token:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-token', async () => {
  try {
    if (!fs.existsSync(TOKEN_FILE_PATH)) {
      return { success: true, token: null };
    }
    const fileBuffer = fs.readFileSync(TOKEN_FILE_PATH);
    if (safeStorage.isEncryptionAvailable()) {
      try {
        const decryptedToken = safeStorage.decryptString(fileBuffer);
        return { success: true, token: decryptedToken };
      } catch (err) {
        // Might be unencrypted fallback
        return { success: true, token: fileBuffer.toString('utf-8') };
      }
    } else {
      return { success: true, token: fileBuffer.toString('utf-8') };
    }
  } catch (error) {
    console.error('Failed to get token:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('delete-token', async () => {
  try {
    if (fs.existsSync(TOKEN_FILE_PATH)) {
      fs.unlinkSync(TOKEN_FILE_PATH);
    }
    return { success: true };
  } catch (error) {
    console.error('Failed to delete token:', error);
    return { success: false, error: error.message };
  }
});

// Function to poll connection status
function startConnectionStatusPolling() {
  if (connectionStatusPollInterval) {
    return // Already polling
  }

  connectionStatusPollInterval = setInterval(async () => {
    try {
      const https = require('https')
      const http = require('http')
      const url = require('url')
      
      const healthUrl = `${LOCAL_SERVER_CONFIG.BASE_URL}${LOCAL_SERVER_CONFIG.ENDPOINTS.HEALTH}`
      const parsedUrl = url.parse(healthUrl)
      const client = parsedUrl.protocol === 'https:' ? https : http
      
      const request = client.get(healthUrl, (response) => {
        let data = ''
        
        response.on('data', (chunk) => {
          data += chunk
        })
        
        response.on('end', () => {
          try {
            const health = JSON.parse(data)
            const isStreaming = health.streaming || false
            const connectionStatus = health.connection?.connected
            
            // Only check connection status when streaming is active
            if (isStreaming) {
              // connectionStatus can be true, false, or null (null = not yet determined)
              const currentStatus = connectionStatus === true
              
              // Only notify if status changed from a known state (not null)
              if (lastConnectionStatus !== null && lastConnectionStatus !== currentStatus) {
                if (!currentStatus && connectionStatus === false) {
                  // Connection lost - notify renderer
                  mainWindow.webContents.send('server-status-changed', {
                    status: 'stopped',
                    message: health.connection?.last_error || 'Connection to port 8000 server lost'
                  })
                  console.log('Connection status changed: Connection lost')
                } else if (currentStatus) {
                  // Connection restored
                  mainWindow.webContents.send('server-status-changed', {
                    status: 'connected',
                    message: 'Connected to port 8000 server'
                  })
                  console.log('Connection status changed: Connected')
                }
              }
              
              // Update last known status (only track true/false, not null)
              if (connectionStatus !== null) {
                lastConnectionStatus = currentStatus
              }
            } else {
              // Not streaming, reset status tracking
              if (lastConnectionStatus !== null) {
                lastConnectionStatus = null
                // Optionally notify that streaming stopped
                mainWindow.webContents.send('server-status-changed', {
                  status: 'ready',
                  message: 'Not streaming'
                })
              }
            }
          } catch (error) {
            console.error('Error parsing health response:', error)
          }
        })
      })
      
      request.on('error', (error) => {
        // Server might be down, but don't spam errors
        if (lastConnectionStatus !== false) {
          console.error('Error checking connection status:', error.message)
          lastConnectionStatus = false
          if (mainWindow) {
            mainWindow.webContents.send('server-status-changed', {
              status: 'stopped',
              message: 'Cannot reach local server'
            })
          }
        }
      })
      
      request.setTimeout(5000, () => {
        request.destroy()
      })
    } catch (error) {
      console.error('Error in connection status polling:', error)
    }
  }, 2000) // Poll every 2 seconds
}

// Function to stop connection status polling
function stopConnectionStatusPolling() {
  if (connectionStatusPollInterval) {
    clearInterval(connectionStatusPollInterval)
    connectionStatusPollInterval = null
    lastConnectionStatus = null
  }
}

// Create menu
function createMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Exit',
          accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
          click: () => {
            app.quit()
          }
        }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'close' }
      ]
    }
  ]

  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
}

app.whenReady().then(async () => {
  // Start the server process first
  startServerProcess()
  
  // Create the main window
  createWindow()
  
  // Create menu
  createMenu()
  
  // Start polling connection status
  startConnectionStatusPolling()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('before-quit', async (event) => {
  // Stop connection status polling
  stopConnectionStatusPolling()
  
  if (serverProcess && !serverProcess.killed) {
    event.preventDefault()
    console.log('Stopping server before quit...')
    await stopServerProcess()
    app.quit()
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// Handle app errors
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error)
  const { dialog } = require('electron')
  dialog.showErrorBox('Unexpected Error', error.message)
})