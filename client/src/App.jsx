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
                console.error("Failed to start call");
            }
        } catch (error) {
            console.error("Failed to connect:", error);
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
            console.error("Failed to end call:", error);
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

            window.electronAPI.onServerError?.((error) => {
                console.log('Error received:', error);
                setServerError(error);
                if (error.type === 'dependency-error') {
                    setServerStatus('dependency-error');
                }
            });

            window.electronAPI.onServerStatusChanged?.((event, status) => {
                console.log('Status changed:', status);
                
                // Only update status if it's a meaningful change
                if (status.status === 'stopped' || status.status === 'connected' || status.status === 'ready') {
                    setServerStatus(status.status);
                    
                    // If connection is lost while streaming, automatically stop the call
                    if (status.status === 'stopped' && isStreaming) {
                        console.log('Connection lost - automatically stopping call');
                        setIsStreaming(false);
                        // Also call the stop endpoint to clean up server-side state
                        const apiBase = import.meta.env.VITE_API_BASE || 'http://localhost:8080';
                        fetch(`${apiBase}/stop`, {
                            method: "POST",
                        }).catch(err => {
                            console.error("Failed to stop streaming on server:", err);
                        });
                    }
                }
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
                        <img src="./logo.svg" alt="Phonolytics" className="logo-icon" />
                        <h1>Phonolytics</h1>
                        {isElectron && <span className="electron-badge">Desktop</span>}
                    </div>
                    <div className="status-panel">
                        <div className={`status-indicator ${
                            serverStatus === 'stopped' && isStreaming 
                                ? "error" 
                                : isStreaming 
                                ? "active" 
                                : "inactive"
                        }`}>
                            <div className="pulse"></div>
                            <span>
                                {serverStatus === 'stopped' && isStreaming
                                    ? "Call Stopped - Connection Lost"
                                    : isStreaming 
                                    ? "Call in Progress" 
                                    : "Ready to Start"}
                            </span>
                        </div>
                    </div>
                </div>
            </header>

            <main className="main-content">
                <section className="control-panel">
                    <div className="panel-header">
                        <h2>Call Controls</h2>
                        <p className="panel-description">
                            Manage your microphone and system audio during the call.
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

                    <div className="control-buttons">
                        <button
                            className={`btn ${isStreaming ? "btn-stop" : "btn-start"}`}
                            onClick={isStreaming ? stopStreaming : startStreaming}
                            disabled={isLoading}
                        >
                            <span className="btn-icon">
                                {isLoading ? "⚡" : isStreaming ? "⏹" : "▶"}
                            </span>
                            <span className="btn-text">
                                {isLoading
                                    ? "Processing..."
                                    : isStreaming
                                    ? "End Call"
                                    : "Start Call"}
                            </span>
                        </button>
                    </div>
                </section>

                <section className="info-panel">
                    <div className="panel-header">
                        <h2>Call Information</h2>
                    </div>

                    <div className="info-grid">

                        <div className="info-card">
                            <div className="info-icon">🎤</div>
                            <div className="info-content">
                                <h3>Microphone</h3>
                                <p>Your voice is being captured through the microphone.</p>
                                <div className="info-status">
                                    <span className={`status-dot ${isStreaming ? "active" : "inactive"}`}></span>
                                    <span>{isStreaming ? "Live" : "Idle"}</span>
                                </div>
                            </div>
                        </div>

                        <div className="info-card">
                            <div className="info-icon">🔊</div>
                            <div className="info-content">
                                <h3>System Audio</h3>
                                <p>Your computer’s audio is being shared during the call.</p>
                                <div className="info-status">
                                    <span className={`status-dot ${isStreaming ? "active" : "inactive"}`}></span>
                                    <span>{isStreaming ? "Live" : "Idle"}</span>
                                </div>
                            </div>
                        </div>

                        <div className="info-card">
                            <div className="info-icon">🌐</div>
                            <div className="info-content">
                                <h3>Connection</h3>
                                <p>Your audio is being sent through an active connection.</p>
                                <div className="info-status">
                                    <span className={`status-dot ${isStreaming ? "active" : "inactive"}`}></span>
                                    <span>{isStreaming ? "Connected" : "Not Connected"}</span>
                                </div>
                            </div>
                        </div>

                        <div className="info-card">
                            <div className="info-icon">⚡</div>
                            <div className="info-content">
                                <h3>Performance</h3>
                                <p>Smooth, real-time audio handling for clear call quality.</p>

                                {serverError && serverError.type === 'dependency-error' && (
                                    <div className="error-banner">
                                        <h4>⚠️ Setup Required</h4>
                                        <p>{serverError.message}</p>
                                        <p style={{ fontSize: '0.9em', color: '#ccc', marginTop: '10px' }}>
                                            Some components needed for audio calls are missing.
                                            Please reinstall Phonolytics to fix this issue.
                                        </p>
                                    </div>
                                )}

                                <div className="info-status">
                                    <span
                                        className={`status-dot ${
                                            serverError?.type === 'dependency-error'
                                                ? "error"
                                                : serverStatus === 'stopped'
                                                ? "error"
                                                : isStreaming
                                                ? "active"
                                                : "ready"
                                        }`}
                                    ></span>
                                    <span>
                                        {serverError?.type === 'dependency-error'
                                            ? "Setup Required"
                                            : serverStatus === 'stopped'
                                            ? "Connection Lost"
                                            : isStreaming
                                            ? "Active"
                                            : "Ready"}
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