const { app, BrowserWindow, Menu, shell, ipcMain } = require('electron')
const path = require('path')
const { spawn } = require('child_process')
const fs = require('fs')
const isDev = process.env.NODE_ENV === 'development'

let mainWindow
let pythonServer = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: path.join(__dirname, '../public/logo.ico'),
    show: false,
    titleBarStyle: 'default',
    frame: true,
    backgroundColor: '#0a0a0a'
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
    
    if (isDev) {
      mainWindow.focus()
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  setApplicationMenu()
}

// Server management functions
function startPythonServer() {
  return new Promise((resolve, reject) => {
    try {
      console.log('Starting Python server...')
      
      // Get the server path
      let serverPath
      if (isDev) {
        // In development, server is in the project directory
        serverPath = path.join(__dirname, '../../server')
      } else {
        // In production, server is in resources
        const possiblePaths = [
          path.join(process.resourcesPath, 'server'),
          path.join(__dirname, '../server'),
          path.join(__dirname, '../../server')
        ]
        
        serverPath = possiblePaths.find(p => fs.existsSync(path.join(p, 'main.py')))
        
        if (!serverPath) {
          console.error('Server directory not found')
          reject(new Error('Server directory not found'))
          return
        }
      }
      
      const serverScript = path.join(serverPath, 'main.py')
      
      if (!fs.existsSync(serverScript)) {
        console.error('Server script not found:', serverScript)
        reject(new Error('Server script not found'))
        return
      }
      
      console.log('Starting server from:', serverScript)
      
      // Start the Python server
      pythonServer = spawn('python', [serverScript], {
        cwd: serverPath,
        stdio: ['pipe', 'pipe', 'pipe']
      })
      
      // Handle server output
      pythonServer.stdout.on('data', (data) => {
        console.log('Server stdout:', data.toString())
      })
      
      pythonServer.stderr.on('data', (data) => {
        console.log('Server stderr:', data.toString())
      })
      
      pythonServer.on('error', (error) => {
        console.error('Failed to start Python server:', error)
        reject(error)
      })
      
      pythonServer.on('close', (code) => {
        console.log(`Python server process exited with code ${code}`)
        pythonServer = null
      })
      
      // Give the server a moment to start
      setTimeout(() => {
        if (pythonServer && !pythonServer.killed) {
          console.log('Python server started successfully')
          resolve()
        } else {
          reject(new Error('Server failed to start'))
        }
      }, 2000)
      
    } catch (error) {
      console.error('Error starting Python server:', error)
      reject(error)
    }
  })
}

function stopPythonServer() {
  return new Promise((resolve) => {
    if (pythonServer) {
      console.log('Stopping Python server...')
      
      pythonServer.on('close', () => {
        console.log('Python server stopped')
        pythonServer = null
        resolve()
      })
      
      // Try graceful shutdown first
      pythonServer.kill('SIGTERM')
      
      // Force kill after 5 seconds if still running
      setTimeout(() => {
        if (pythonServer && !pythonServer.killed) {
          console.log('Force killing Python server')
          pythonServer.kill('SIGKILL')
          pythonServer = null
        }
        resolve()
      }, 5000)
    } else {
      resolve()
    }
  })
}

function setApplicationMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'New Recording',
          accelerator: 'CmdOrCtrl+N',
          click: () => {
            mainWindow.webContents.send('menu-new-recording')
          }
        },
        { type: 'separator' },
        {
          label: 'Open Recordings Folder',
          click: () => {
            shell.openPath(path.join(__dirname, '../../server/recordings'))
          }
        },
        { type: 'separator' },
        {
          label: isDev ? 'Exit' : 'Quit Phonolytics',
          accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
          click: () => {
            app.quit()
          }
        }
      ]
    },
    {
      label: 'Audio',
      submenu: [
        {
          label: 'Start Recording',
          accelerator: 'CmdOrCtrl+R',
          click: () => {
            mainWindow.webContents.send('menu-start-recording')
          }
        },
        {
          label: 'Stop Recording',
          accelerator: 'CmdOrCtrl+S',
          click: () => {
            mainWindow.webContents.send('menu-stop-recording')
          }
        },
        { type: 'separator' },
        {
          label: 'Refresh Devices',
          accelerator: 'CmdOrCtrl+D',
          click: () => {
            mainWindow.webContents.send('menu-refresh-devices')
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
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About Phonolytics',
          click: () => {
            const aboutWindow = new BrowserWindow({
              width: 400,
              height: 300,
              modal: true,
              parent: mainWindow,
              webPreferences: {
                nodeIntegration: false,
                contextIsolation: true
              }
            })
            
            aboutWindow.loadURL(`data:text/html;charset=utf-8,
              <html>
                <head>
                  <title>About Phonolytics</title>
                  <style>
                    body { 
                      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                      background: #0a0a0a;
                      color: #ffffff;
                      text-align: center;
                      padding: 50px;
                      margin: 0;
                    }
                    h1 { color: #00d4ff; font-size: 24px; margin-bottom: 10px; }
                    p { margin: 10px 0; }
                    .version { color: #a0a0a0; font-size: 14px; }
                  </style>
                </head>
                <body>
                  <h1>🎵 Phonolytics</h1>
                  <p>Advanced Audio Streaming & Recording Application</p>
                  <p class="version">Version 1.0.0</p>
                  <p>Built with Electron, React & FastAPI</p>
                </body>
              </html>
            `)
            
            aboutWindow.setMenuBarVisibility(false)
          }
        },
        {
          label: 'Learn More',
          click: () => {
            shell.openExternal('https://github.com/shayan-zaheer/Phonolytics-DesktopApp')
          }
        }
      ]
    }
  ]

  // macOS specific menu adjustments
  if (process.platform === 'darwin') {
    template.unshift({
      label: app.getName(),
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    })

    // Window menu
    template[4].submenu = [
      { role: 'close' },
      { role: 'minimize' },
      { role: 'zoom' },
      { type: 'separator' },
      { role: 'front' }
    ]
  }

  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
}

// App event handlers
app.whenReady().then(async () => {
  createWindow()
  
  // Start Python server
  try {
    await startPythonServer()
    console.log('Python server started successfully')
  } catch (error) {
    console.error('Failed to start Python server:', error)
    // Show error dialog to user
    const { dialog } = require('electron')
    await dialog.showMessageBox(mainWindow, {
      type: 'error',
      title: 'Server Error',
      message: 'Failed to start Python server',
      detail: 'The application requires Python and its dependencies to function properly. Please ensure Python is installed and try again.',
      buttons: ['OK']
    })
  }

  app.on('activate', () => {
    // On macOS, re-create a window when the dock icon is clicked
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', async () => {
  // Stop Python server when app is closing
  await stopPythonServer()
  
  // On macOS, keep the app running even when all windows are closed
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', async (event) => {
  // Prevent quit until server is stopped
  if (pythonServer) {
    event.preventDefault()
    await stopPythonServer()
    app.quit()
  }
})

// Security: Prevent new window creation
app.on('web-contents-created', (event, contents) => {
  contents.on('new-window', (event, navigationUrl) => {
    event.preventDefault()
    shell.openExternal(navigationUrl)
  })
})

// IPC handlers for communication with renderer process
ipcMain.handle('app-version', () => {
  return app.getVersion()
})

ipcMain.handle('show-message-box', async (event, options) => {
  const { dialog } = require('electron')
  const result = await dialog.showMessageBox(mainWindow, options)
  return result
})

ipcMain.handle('get-server-status', () => {
  return {
    running: pythonServer !== null && !pythonServer.killed,
    pid: pythonServer ? pythonServer.pid : null
  }
})

ipcMain.handle('restart-server', async () => {
  try {
    await stopPythonServer()
    await startPythonServer()
    return { success: true }
  } catch (error) {
    return { success: false, error: error.message }
  }
})

// Handle app protocol (for deep linking if needed)
app.setAsDefaultProtocolClient('phonolytics')
