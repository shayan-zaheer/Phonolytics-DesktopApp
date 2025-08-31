# Phonolytics Desktop App - Python Prerequisites

## Overview

The Phonolytics Desktop App now automatically checks for and installs Python prerequisites when running as an Electron application. This ensures that all required dependencies are available before the app attempts to connect to the Python backend server.

## Features

### Automatic Python Detection
- Checks if Python is installed and accessible via PATH
- Verifies Python version meets minimum requirements (3.8+)
- Detects Python installations in common locations

### Package Management
- Automatically installs required Python packages:
  - `fastapi` - Web framework for the backend API
  - `uvicorn` - ASGI server for running the FastAPI application
  - `websocket-client` - WebSocket client for real-time communication
  - `pyaudiowpatch` - Audio processing and recording capabilities

### Installation Methods

#### 1. NSIS Installer (Windows)
The Windows installer (`electron-build`) now includes:
- Custom NSIS script that checks for Python before app installation
- Automatic Python 3.11.9 download and installation if not found
- Silent installation with proper PATH configuration
- Required package installation during setup

#### 2. In-App Prerequisites Checker
When running the Electron app:
- Automatic prerequisite checking on startup
- User-friendly interface for installing missing components
- Real-time installation progress and logging
- Manual installation instructions as fallback

#### 3. Standalone Installation Scripts
Located in `client/installer-scripts/`:
- `install-python-prerequisites.ps1` - PowerShell script for comprehensive setup
- `setup-prerequisites.bat` - Batch script for basic installation
- `installer.nsh` - NSIS script for installer integration

## File Structure

```
client/
├── installer-scripts/
│   ├── installer.nsh                     # NSIS installer script
│   ├── install-python-prerequisites.ps1  # PowerShell setup script
│   └── setup-prerequisites.bat          # Batch setup script
├── electron/
│   ├── main.js                          # Updated with Python checking IPC handlers
│   └── preload.js                       # Updated with Python management APIs
├── src/
│   ├── PythonPrerequisitesChecker.jsx   # React component for in-app setup
│   ├── App.jsx                          # Updated to include prerequisites checker
│   └── App.css                          # Updated with prerequisites styling
└── package.json                         # Updated build configuration
```

## Build Configuration Changes

### package.json Updates
- Added NSIS installer target alongside portable
- Included installer scripts in build artifacts
- Custom NSIS script integration
- Enhanced extraResources configuration

### Build Commands
```bash
# Build with installer (includes Python prerequisites)
npm run electron-build

# Build portable version
npm run build:portable

# Development mode
npm run electron-dev
```

## Usage

### For End Users
1. **Download and run the installer** - Python will be automatically installed if needed
2. **Launch the app** - Prerequisites will be checked and installed if missing
3. **Manual installation** - Follow in-app instructions if automatic installation fails

### For Developers
1. **Development mode** - Prerequisites checker will show in Electron but not in web mode
2. **Testing** - Use the standalone scripts to test Python installation
3. **Customization** - Modify scripts in `installer-scripts/` for different requirements

## Prerequisites Checker Component

The `PythonPrerequisitesChecker` component provides:
- Real-time status of Python installation
- Visual indicators for each requirement
- One-click installation buttons
- Detailed error logging
- Manual installation instructions
- Automatic recheck functionality

## Error Handling

The system gracefully handles:
- No internet connection during Python download
- Insufficient permissions for system-wide installation
- Partially installed or corrupted Python environments
- Missing or outdated pip installations
- Network timeouts during package installation

## Security Considerations

- Downloads Python from official python.org sources
- Uses PowerShell execution policies appropriately
- Requests administrator privileges when needed
- Validates package installations before proceeding

## Troubleshooting

### Common Issues
1. **Python not found after installation**
   - Restart the application or computer
   - Check Windows PATH environment variable
   - Try running the manual installation script

2. **Package installation fails**
   - Check internet connection
   - Run as administrator
   - Manually install packages using `pip install package-name`

3. **Permission errors**
   - Run installer as administrator
   - Use user-specific Python installation instead of system-wide

### Manual Installation
If automatic installation fails:
1. Download Python 3.8+ from [python.org](https://python.org/downloads/)
2. Ensure "Add Python to PATH" is checked during installation
3. Open Command Prompt and run:
   ```
   pip install fastapi uvicorn websocket-client pyaudiowpatch
   ```
4. Restart the Phonolytics application

## Future Enhancements

- Support for virtual environments
- Automatic Python version updates
- Package version conflict resolution
- Offline installation capabilities
- Cross-platform installation support (macOS, Linux)
- Integration with conda environments
