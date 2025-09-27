import { useState, useEffect, useCallback } from "react";
import "./App.css";

function App() {
    const [isStreaming, setIsStreaming] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [audioLevels, setAudioLevels] = useState({ mic: 0, system: 0 });
    const [isElectron, setIsElectron] = useState(false);
    const [serverError, setServerError] = useState(null);
    const [serverStatus, setServerStatus] = useState('unknown');

    const API_BASE = import.meta.env.VITE_API_BASE;

    const startStreaming = useCallback(async () => {
        setIsLoading(true);
        try {
            const response = await fetch(`${API_BASE}/start`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({}),
            });

            if (response.ok) {
                setIsStreaming(true);
            } else {
                console.error("Failed to start streaming");
            }
        } catch (error) {
            console.error("Failed to connect to server:", error);
        } finally {
            setIsLoading(false);
        }
    }, []);

    const stopStreaming = useCallback(async () => {
        setIsLoading(true);
        try {
            const response = await fetch(`${API_BASE}/stop`, {
                method: "POST",
            });

            if (response.ok) {
                setIsStreaming(false);
            }
        } catch (error) {
            console.error("Failed to stop streaming:", error);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        setIsElectron(window.electronAPI !== undefined);

        if (window.electronAPI) {
            window.electronAPI.onMenuStartRecording(() => {
                if (!isStreaming && !isLoading) {
                    startStreaming();
                }
            });

            window.electronAPI.onMenuStopRecording(() => {
                if (isStreaming && !isLoading) {
                    stopStreaming();
                }
            });

            // Listen for server errors
            window.electronAPI.onServerError?.((error) => {
                console.log('Server error received:', error);
                setServerError(error);
                if (error.type === 'dependency-error') {
                    setServerStatus('dependency-error');
                }
            });

            // Listen for server status changes
            window.electronAPI.onServerStatusChanged?.((status) => {
                console.log('Server status changed:', status);
                setServerStatus(status.status);
            });

            return () => {
                window.electronAPI.removeAllListeners?.("menu-start-recording");
                window.electronAPI.removeAllListeners?.("menu-stop-recording");
                window.electronAPI.removeAllListeners?.("server-error");
                window.electronAPI.removeAllListeners?.("server-status-changed");
            };
        }
    }, [isStreaming, isLoading, startStreaming, stopStreaming]);

    useEffect(() => {
        if (isStreaming) {
            const interval = setInterval(() => {
                setAudioLevels({
                    mic: Math.random() * 100,
                    system: Math.random() * 100,
                });
            }, 100);
            return () => clearInterval(interval);
        } else {
            setAudioLevels({ mic: 0, system: 0 });
        }
    }, [isStreaming]);

    return (
        <div className="app">
            <div className="grid-background"></div>

            <header className="header">
                <div className="header-content">
                    <div className="logo">
                        <img
                            src="./logo.svg"
                            alt="Phonolytics"
                            className="logo-icon"
                        />
                        <h1>Phonolytics</h1>
                        {isElectron && (
                            <span className="electron-badge">Desktop</span>
                        )}
                    </div>
                    <div className="status-panel">
                        <div
                            className={`status-indicator ${
                                isStreaming ? "active" : "inactive"
                            }`}
                        >
                            <div className="pulse"></div>
                            <span>
                                {isStreaming ? "Streaming Active" : "Ready"}
                            </span>
                        </div>
                    </div>
                </div>
            </header>

            <main className="main-content">
                <section className="control-panel">
                    <div className="panel-header">
                        <h2>Audio Streaming Control</h2>
                        <p className="panel-description">
                            Stream audio from your microphone and system audio
                            in real-time
                        </p>
                    </div>

                    <div className="audio-visualizer">
                        <div className="channel">
                            <label>Microphone</label>
                            <div className="level-meter">
                                <div
                                    className="level-fill mic"
                                    style={{ width: `${audioLevels.mic}%` }}
                                ></div>
                            </div>
                            <span className="level-value">
                                {Math.round(audioLevels.mic)}%
                            </span>
                        </div>
                        <div className="channel">
                            <label>System Audio</label>
                            <div className="level-meter">
                                <div
                                    className="level-fill system"
                                    style={{ width: `${audioLevels.system}%` }}
                                ></div>
                            </div>
                            <span className="level-value">
                                {Math.round(audioLevels.system)}%
                            </span>
                        </div>
                    </div>

                    <div className="control-buttons">
                        <button
                            className={`btn ${
                                isStreaming ? "btn-stop" : "btn-start"
                            }`}
                            onClick={
                                isStreaming ? stopStreaming : startStreaming
                            }
                            disabled={isLoading}
                        >
                            <span className="btn-icon">
                                {isLoading ? "⚡" : isStreaming ? "⏹" : "▶"}
                            </span>
                            <span className="btn-text">
                                {isLoading
                                    ? "Processing..."
                                    : isStreaming
                                    ? "Stop Audio Stream"
                                    : "Start Audio Stream"}
                            </span>
                        </button>
                    </div>
                </section>

                <section className="info-panel">
                    <div className="panel-header">
                        <h2>Streaming Information</h2>
                    </div>
                    <div className="info-grid">
                        <div className="info-card">
                            <div className="info-icon">🎤</div>
                            <div className="info-content">
                                <h3>Microphone Audio</h3>
                                <p>
                                    Captures audio from your default microphone
                                    device for real-time streaming
                                </p>
                                <div className="info-status">
                                    <span
                                        className={`status-dot ${
                                            isStreaming ? "active" : "inactive"
                                        }`}
                                    ></span>
                                    <span>
                                        {isStreaming ? "Streaming" : "Standby"}
                                    </span>
                                </div>
                            </div>
                        </div>
                        <div className="info-card">
                            <div className="info-icon">🔊</div>
                            <div className="info-content">
                                <h3>System Audio</h3>
                                <p>
                                    Captures system audio output for
                                    comprehensive audio streaming
                                </p>
                                <div className="info-status">
                                    <span
                                        className={`status-dot ${
                                            isStreaming ? "active" : "inactive"
                                        }`}
                                    ></span>
                                    <span>
                                        {isStreaming ? "Streaming" : "Standby"}
                                    </span>
                                </div>
                            </div>
                        </div>
                        <div className="info-card">
                            <div className="info-icon">🌐</div>
                            <div className="info-content">
                                <h3>Network Stream</h3>
                                <p>
                                    Real-time audio data transmission to
                                    connected endpoints
                                </p>
                                <div className="info-status">
                                    <span
                                        className={`status-dot ${
                                            isStreaming ? "active" : "inactive"
                                        }`}
                                    ></span>
                                    <span>
                                        {isStreaming
                                            ? "Connected"
                                            : "Disconnected"}
                                    </span>
                                </div>
                            </div>
                        </div>
                        <div className="info-card">
                            <div className="info-icon">⚡</div>
                            <div className="info-content">
                                <h3>Performance</h3>
                                <p>
                                    Low-latency audio processing with optimized
                                    buffer management
                                </p>
                                {serverError && serverError.type === 'dependency-error' && (
                                    <div className="error-banner">
                                        <h4>⚠️ Configuration Required</h4>
                                        <p>{serverError.message}</p>
                                        <p style={{ fontSize: '0.9em', color: '#ccc', marginTop: '10px' }}>
                                            The Python audio processing engine is missing required components. 
                                            Please reinstall Phonolytics to resolve this issue.
                                        </p>
                                    </div>
                                )}
                                
                                <div className="info-status">
                                    <span
                                        className={`status-dot ${
                                            serverError?.type === 'dependency-error' ? "error" :
                                            serverStatus === 'stopped' ? "error" :
                                            isStreaming ? "active" : "ready"
                                        }`}
                                    ></span>
                                    <span>
                                        {serverError?.type === 'dependency-error' ? "Configuration Error" :
                                         serverStatus === 'stopped' ? "Server Stopped" :
                                         isStreaming ? "Active" : "Ready"}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>
            </main>
        </div>
    );
}

export default App;