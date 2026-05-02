# Installations
    Create a virtual environment using
    
    ``` python -m venv venv ```

    Activate the environment using

    ``` .\venv\Scripts\Activate.ps1 ```

    Install dependecies

    ``` pip install -r requirements.txt ```

# Run the Server

    Always run the server on 8080, because main web server is to be run on 8000

    ``` uvicorn main:app --port 8080 ```

# Build for Desktop App

If any changes are made to the backend, you must rebuild the executable and update the client resources:

1.  Run the PyInstaller command:
    ``` powershell
    pyinstaller --onefile main.py
    ```
2.  Copy the generated executable from `server/dist/main.exe` to the client's resources folder:
    ``` powershell
    cp .\dist\main.exe ..\client\resources\server\
    ```

