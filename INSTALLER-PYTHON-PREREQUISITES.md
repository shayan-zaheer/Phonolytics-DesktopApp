# Phonolytics Installer with Python Prerequisites

## Overview

The Phonolytics Windows installer now includes automatic Python prerequisite checking and guidance for installation. This ensures users have the necessary Python environment to run the backend server.

## How It Works

### During Installation

1. **Python Detection**: The installer checks if Python is available in the system PATH
2. **User Prompt**: If Python is not found, the user is prompted to install it
3. **Package Installation**: If Python is already installed, required packages are automatically installed
4. **Browser Redirect**: If Python needs to be installed, the installer opens python.org in the user's browser

### Required Python Packages

The installer automatically installs these packages if Python is available:
- `fastapi` - Web framework for the backend API
- `uvicorn` - ASGI server for running FastAPI
- `websocket-client` - WebSocket communication
- `pyaudiowpatch` - Audio recording and processing

## File Structure

```
client/
├── installer-scripts/
│   └── installer.nsh              # NSIS script for Python prerequisites
├── package.json                   # Build configuration with NSIS setup
└── dist-electron/                 # Generated installer output
    ├── Phonolytics Setup 1.0.0.exe
    └── win-unpacked/
```

## Build Configuration

### package.json Changes

The build configuration includes:
- NSIS installer target with custom script
- Installer scripts included in build artifacts
- No code signing for development builds

### NSIS Script Features

- Python detection via command line
- User-friendly prompts for missing Python
- Automatic package installation for existing Python
- Browser integration for manual Python installation
- Detailed logging of installation steps

## Installation Process

### For Users with Python Already Installed

1. Installer detects existing Python installation
2. Automatically installs required packages
3. Continues with normal app installation
4. Ready to use immediately

### For Users Without Python

1. Installer detects missing Python
2. Shows informative dialog about Python requirement
3. User chooses to install Python or skip
4. If chosen, opens python.org in browser after installation
5. User manually installs Python with PATH option enabled
6. Can run installer again or manually install packages

## Building the Installer

### Development Build
```bash
npm run build
npm run electron-build
```

### Production Build
```bash
npm run build
set CSC_IDENTITY_AUTO_DISCOVERY=false
npx electron-builder --win --config.compression=store
```

## Manual Python Setup (Fallback)

If users skip the automatic setup or encounter issues:

1. **Download Python**: Visit https://python.org/downloads/
2. **Install with PATH**: Check "Add Python to PATH" during installation
3. **Install Packages**: Open Command Prompt and run:
   ```
   python -m pip install fastapi uvicorn websocket-client pyaudiowpatch
   ```
4. **Verify**: Run `python --version` to confirm installation

## User Experience

### Smooth Installation (Python Available)
1. Run installer → Python detected → Packages installed → App ready

### Guided Installation (Python Missing)
1. Run installer → Python not found → User informed → Browser opens
2. Install Python → Run app → Backend server starts automatically

### Error Handling
- Clear error messages for common issues
- Fallback instructions for manual installation
- Detailed logging for troubleshooting

## Technical Details

### Python Detection Method
- Uses `python --version` command execution
- Checks exit code to determine availability
- Provides detailed feedback in installer log

### Package Installation
- Uses pip module execution for reliability
- Upgrades pip before installing packages
- Handles individual package installation
- Logs success/failure for each package

### Browser Integration
- Uses NSIS ExecShell for browser opening
- Opens official Python download page
- Provides clear instructions for manual installation

## Future Enhancements

- Automatic Python download and silent installation
- Version-specific Python requirement checking
- Virtual environment support
- Offline installer with bundled Python
- Cross-platform installer support (macOS, Linux)

## Troubleshooting

### Common Issues

1. **Python not detected after installation**
   - Restart computer to refresh PATH
   - Reinstall Python with "Add to PATH" option

2. **Package installation fails**
   - Check internet connection
   - Run installer as administrator
   - Manually install packages via command line

3. **Permission errors**
   - Run installer as administrator
   - Use user-specific Python installation

### Support Resources

- Python.org documentation: https://docs.python.org/
- pip documentation: https://pip.pypa.io/
- Phonolytics GitHub repository for issues
