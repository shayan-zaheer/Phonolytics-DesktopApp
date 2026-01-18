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