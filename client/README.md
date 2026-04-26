## Development

### Running the App in Development Mode

Start both the Vite dev server and Electron simultaneously:

```bash
npm run electron-dev
```

This will:

- Start the Vite development server at `http://localhost:5173`
- Wait for the dev server to be ready
- Launch the Electron app

### Running Commands Separately

If you prefer to run them separately:

1. **Start the Vite dev server:**

    ```bash
    npm run dev
    ```

2. **In a separate terminal, start Electron:**

    ```bash
    npm run electron
    ```

---

## Building for Production

### Building the Electron App

To create a distributable package:

```bash
npm run electron-build
cd ..
cd server
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
python main.py
```

This will:

- Build the React app for production
- Package the Electron app for Windows (NSIS installer + portable)
- Output files will be in `client/dist-electron/`

### Build Options

| Command                  | Description                          |
| ------------------------ | ------------------------------------ |
| `npm run build`          | Build React app only                 |
| `npm run electron-build` | Full Windows build (NSIS + Portable) |
| `npm run electron-dist`  | Build without publishing             |
| `npm run build:portable` | Build portable `.exe` only           |

---

## Server Setup

The Electron app requires a local Python server (`server.exe`) to handle audio streaming. This server should be located at:

```
client/resources/server/server.exe
```

### ⚠️ If `server.exe` is Missing

If the `server.exe` file is not present, you need to build it from source. Follow these steps:

#### Step 1: Navigate to the Server Directory

```bash
cd server
```

#### Step 2: Create a Python Virtual Environment

```bash
python -m venv venv
```

#### Step 3: Activate the Virtual Environment

**Windows (PowerShell):**

```powershell
.\venv\Scripts\Activate.ps1
```

**Windows (Command Prompt):**

```cmd
.\venv\Scripts\activate.bat
```

#### Step 4: Install Dependencies

```bash
pip install -r requirements.txt
```

#### Step 5: Install PyInstaller

```bash
pip install pyinstaller
```

#### Step 6: Build the Executable

```bash
pyinstaller --onefile --name server main.py
```

> **Note:** The output file will be named `server.exe` (as specified by `--name server`)

#### Step 7: Copy the Executable

Copy the generated executable to the client resources folder:

```bash
copy dist\server.exe ..\client\resources\server\
```

Or manually copy `server/dist/server.exe` to `client/resources/server/`

---

## Troubleshooting

### Server Executable Not Found

If you see the error `Server executable not found at: ...`, it means the `server.exe` is missing. Follow the [Server Setup](#server-setup) section above to build it.

### Development Server Not Starting

If `npm run electron-dev` hangs:

1. Make sure port `5173` is not in use
2. Try running `npm run dev` first in a separate terminal
3. Then run `npm run electron` in another terminal

### Audio Streaming Issues

- Ensure the server is running on port `8080`
- The main Phonolytics backend should be accessible on port `8000`
- Check that your audio devices are properly configured

### Build Failures

If `npm run electron-build` fails:

1. Ensure all dependencies are installed: `npm install`
2. Check that `server.exe` exists in `client/resources/server/`
3. Try clearing the build cache: delete `client/dist` and `client/dist-electron` folders

---

## Project Structure

```
Phonolytics-DesktopApp/
├── client/                 # Electron + React frontend
│   ├── electron/           # Electron main process
│   │   ├── main.js         # Main Electron entry point
│   │   └── preload.js      # Preload script
│   ├── src/                # React source files
│   ├── public/             # Static assets
│   ├── resources/          # Extra resources bundled with app
│   │   └── server/         # Server executable location
│   │       └── server.exe  # Local Python server (required)
│   ├── dist/               # Built React app
│   └── dist-electron/      # Built Electron packages
└── server/                 # Python backend server source
    ├── main.py             # FastAPI server entry point
    ├── streaming_utils.py  # Audio streaming utilities
    └── requirements.txt    # Python dependencies
```

---

## Available Scripts

| Script                   | Description                                  |
| ------------------------ | -------------------------------------------- |
| `npm run dev`            | Start Vite development server                |
| `npm run build`          | Build React for production                   |
| `npm run electron`       | Start Electron (requires running dev server) |
| `npm run electron-dev`   | Start both Vite and Electron in dev mode     |
| `npm run electron-build` | Build complete Windows installer             |
| `npm run electron-dist`  | Build distributable without publishing       |
| `npm run build:portable` | Build portable Windows executable            |
| `npm run lint`           | Run ESLint                                   |

---
