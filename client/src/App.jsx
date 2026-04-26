import { useState, useEffect, useCallback, useRef } from "react";
import "./App.css";
import logo from "./assets/logo.png";
import Login from "./Login";
import { fetchWithAuth } from "./api";
import TitleBar from "./components/TitleBar";

function App() {
    const [authToken, setAuthToken] = useState(null);
    const [isAuthLoading, setIsAuthLoading] = useState(true);
    const [isStreaming, setIsStreaming] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [audioLevels, setAudioLevels] = useState({ mic: 0, system: 0 });
    const [isElectron, setIsElectron] = useState(false);
    const [serverError, setServerError] = useState(null);
    const [serverStatus, setServerStatus] = useState("unknown");

    // Realtime Help WS URL (generated dynamically by backend on start up)
    const [callId, setCallId] = useState(null);
    const HELP_WS_URL = callId ? `ws://127.0.0.1:8000/calls/recording/${callId}/agent` : null;
    const [helpMessages, setHelpMessages] = useState([]);
    const [helpIsReplying, setHelpIsReplying] = useState(false);
    const [helpStatus, setHelpStatus] = useState("disconnected");
    const helpWsRef = useRef(null);
    const helpPendingSendRef = useRef(false);
    const helpIdleTimerRef = useRef(null);
    const helpScrollRef = useRef(null);
    const helpExpectingReplyRef = useRef(false);

    const API_BASE = import.meta.env.VITE_API_BASE;
    const BACKEND_API_BASE = import.meta.env.VITE_BACKEND_API_BASE || "http://127.0.0.1:8000";

    const startStreaming = useCallback(async () => {
        setIsLoading(true);
        try {
            // Step 1: Create a Call record on the backend (links call to agent via JWT)
            const backendResponse = await fetchWithAuth(`${BACKEND_API_BASE}/calls/start-recording`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
            });

            if (!backendResponse.ok) {
                console.error("Failed to create call record on backend");
                return;
            }

            const backendData = await backendResponse.json();
            const newCallId = String(backendData.call_id);

            // Step 2: Start audio streaming on the local server, passing the backend call_id
            const response = await fetchWithAuth(`${API_BASE}/start`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ call_id: newCallId }),
            });

            if (response.ok) {
                setCallId(newCallId);
                setIsStreaming(true);
            } else {
                console.error("Failed to start call on local server");
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
            const response = await fetchWithAuth(`${API_BASE}/stop`, {
                method: "POST",
            });

            if (response.ok) {
                setIsStreaming(false);
                setCallId(null);
            }
        } catch (error) {
            console.error("Failed to end call:", error);
        } finally {
            setIsLoading(false);
        }
    }, []);

    const appendAssistantChunk = useCallback((chunk) => {
        if (!chunk) return;
        setHelpMessages((prev) => {
            // Teleprompter mode: only keep the current message (no history)
            if (prev.length === 0)
                return [{ role: "assistant", content: chunk }];
            const last = prev[prev.length - 1];
            if (last?.role === "assistant") {
                return [
                    { role: "assistant", content: `${last.content}${chunk}` },
                ];
            } else {
                return [{ role: "assistant", content: chunk }];
            }
        });
    }, []);

    const sanitizeHelpChunk = useCallback((chunk) => {
        if (typeof chunk !== "string" || chunk.length === 0) return "";

        let text = chunk;

        // If a JSON wrapper got concatenated into a string, strip it.
        // Example from upstream: {"type":"connection",...} and {"type":"realtime_help_complete",...}
        text = text.replace(/\{\s*"type"\s*:\s*"connection"[^}]*\}/g, "");
        text = text.replace(
            /\{\s*"type"\s*:\s*"realtime_help_complete"[^}]*\}/g,
            "",
        );
        text = text.replace(
            /\{\s*"type"\s*:\s*"realtime_help_end"[^}]*\}/g,
            "",
        );

        // Remove tag markers only (keep content inside)
        text = text.replace(/<\/?think>/gi, "");

        return text;
    }, []);

    const resetHelpIdleTimer = useCallback(() => {
        if (helpIdleTimerRef.current) {
            clearTimeout(helpIdleTimerRef.current);
        }
        helpIdleTimerRef.current = setTimeout(() => {
            setHelpIsReplying(false);
        }, 1200);
    }, []);

    const ensureHelpSocket = useCallback(() => {
        if (!HELP_WS_URL) return null;
        
        const existing = helpWsRef.current;
        if (
            existing &&
            (existing.readyState === WebSocket.OPEN ||
                existing.readyState === WebSocket.CONNECTING)
        ) {
            return existing;
        }

        setHelpStatus("connecting");
        const ws = new WebSocket(HELP_WS_URL);
        helpWsRef.current = ws;

        ws.onopen = () => {
            setHelpStatus("connected");
            if (helpPendingSendRef.current) {
                helpPendingSendRef.current = false;
                ws.send(JSON.stringify({ event: "realtime_help" }));
                setHelpIsReplying(true);
                helpExpectingReplyRef.current = true;
                // Create a fresh assistant bubble for this response
                setHelpMessages((prev) => [
                    ...prev,
                    { role: "assistant", content: "" },
                ]);
            }
        };

        ws.onclose = () => {
            setHelpStatus("disconnected");
            setHelpIsReplying(false);
            helpExpectingReplyRef.current = false;
        };

        ws.onerror = () => {
            setHelpStatus("error");
            setHelpIsReplying(false);
            helpExpectingReplyRef.current = false;
        };

        ws.onmessage = (evt) => {
            resetHelpIdleTimer();

            const raw = evt?.data;
            let data = null;
            if (typeof raw === "string") {
                try {
                    data = JSON.parse(raw);
                } catch {
                    data = raw;
                }
            } else {
                data = raw;
            }

            // Only render realtime-help responses. Ignore other traffic on the same socket.
            if (data && typeof data === "object") {
                const msgType = data.type || data.event;

                // Ignore obvious non-help messages.
                if (
                    msgType === "connection" ||
                    msgType === "transcription" ||
                    msgType === "analysis"
                ) {
                    return;
                }

                if (msgType === "realtime_help_start") {
                    setHelpIsReplying(true);
                    helpExpectingReplyRef.current = true;
                    setHelpMessages((prev) => [
                        ...prev,
                        { role: "assistant", content: "" },
                    ]);
                    return;
                }

                if (
                    msgType === "realtime_help_complete" ||
                    msgType === "realtime_help_end"
                ) {
                    setHelpIsReplying(false);
                    helpExpectingReplyRef.current = false;
                    return;
                }

                const chunk =
                    msgType === "realtime_help_chunk" &&
                    typeof data.text === "string"
                        ? data.text
                        : typeof data.text === "string"
                          ? data.text
                          : typeof data.chunk === "string"
                            ? data.chunk
                            : null;

                // Many upstreams just stream objects with a text field (sometimes without msgType).
                if (helpExpectingReplyRef.current && chunk) {
                    const cleaned = sanitizeHelpChunk(chunk);
                    if (cleaned) {
                        appendAssistantChunk(cleaned);
                        setHelpIsReplying(true);
                    }
                }

                return;
            }

            if (typeof data === "string") {
                // Only accept raw string chunks while we are expecting a help reply.
                if (!helpExpectingReplyRef.current) return;

                // Ignore JSON-ish strings
                const trimmed = data.trim();
                if (
                    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
                    (trimmed.startsWith("[") && trimmed.endsWith("]"))
                ) {
                    return;
                }

                const cleaned = sanitizeHelpChunk(data);
                if (cleaned) {
                    appendAssistantChunk(cleaned);
                    setHelpIsReplying(true);
                }
            }
        };

        return ws;
    }, [appendAssistantChunk, resetHelpIdleTimer, HELP_WS_URL]);

    const requestRealtimeHelp = useCallback(() => {
        if (!HELP_WS_URL) {
             console.error("Cannot request help: No active call (callId is null)");
             return;
        }

        const ws = ensureHelpSocket();
        if (!ws) return;

        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ event: "realtime_help" }));
            setHelpIsReplying(true);
            helpExpectingReplyRef.current = true;
            setHelpMessages((prev) => [
                ...prev,
                { role: "assistant", content: "" },
            ]);
        } else {
            helpPendingSendRef.current = true;
            helpExpectingReplyRef.current = true;
        }
    }, [ensureHelpSocket]);

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
                console.log("Error received:", error);
                setServerError(error);
                if (error.type === "dependency-error") {
                    setServerStatus("dependency-error");
                }
            });

            window.electronAPI.onServerStatusChanged?.((event, status) => {
                console.log("Status changed:", status);

                // Only update status if it's a meaningful change
                if (
                    status.status === "stopped" ||
                    status.status === "connected" ||
                    status.status === "ready"
                ) {
                    setServerStatus(status.status);

                    // If connection is lost while streaming, automatically stop the call
                    if (status.status === "stopped" && isStreaming) {
                        console.log(
                            "Connection lost - automatically stopping call",
                        );
                        setIsStreaming(false);
                        // Also call the stop endpoint to clean up server-side state
                        const apiBase =
                            import.meta.env.VITE_API_BASE ||
                            "http://localhost:8080";
                        fetch(`${apiBase}/stop`, {
                            method: "POST",
                        }).catch((err) => {
                            console.error(
                                "Failed to stop streaming on server:",
                                err,
                            );
                        });
                    }
                }
            });

            return () => {
                window.electronAPI.removeAllListeners?.("menu-start-recording");
                window.electronAPI.removeAllListeners?.("menu-stop-recording");
                window.electronAPI.removeAllListeners?.("server-error");
                window.electronAPI.removeAllListeners?.(
                    "server-status-changed",
                );
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

    useEffect(() => {
        const el = helpScrollRef.current;
        if (!el) return;
        el.scrollTop = el.scrollHeight;
    }, [helpMessages, helpIsReplying]);

    useEffect(() => {
        return () => {
            if (helpIdleTimerRef.current) {
                clearTimeout(helpIdleTimerRef.current);
            }
            try {
                helpWsRef.current?.close();
            } catch {
                // ignore
            }
        };
    }, []);

    // Initial Auth Check
    useEffect(() => {
        const loadSecureToken = async () => {
            let token = null;
            if (window.electronAPI && window.electronAPI.getToken) {
                try {
                    const result = await window.electronAPI.getToken();
                    if (result && result.success && result.token) {
                        token = result.token;
                    }
                } catch (e) {
                    console.error("Failed to load secure token", e);
                }
            } else {
                token = localStorage.getItem("phonolytics_access_token");
            }
            setAuthToken(token);
            setIsAuthLoading(false);
        };
        loadSecureToken();
    }, []);

    const handleLoginSuccess = async (token, user) => {
        setAuthToken(token);
        if (window.electronAPI && window.electronAPI.saveToken) {
            await window.electronAPI.saveToken(token);
        } else {
            localStorage.setItem("phonolytics_access_token", token);
        }
    };

    const handleLogout = async () => {
        try {
            await fetchWithAuth(`${BACKEND_API_BASE}/auth/logout`, { method: "POST" });
        } catch (e) {
            console.error("Logout request failed:", e);
        }
        setAuthToken(null);
        if (window.electronAPI && window.electronAPI.deleteToken) {
            await window.electronAPI.deleteToken();
        } else {
            localStorage.removeItem("phonolytics_access_token");
        }
    };

    if (isAuthLoading) {
        return (
            <div className="app">
                <TitleBar />
                <div className="grid-background"></div>
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 'calc(100vh - 32px)', color: 'var(--text-secondary)' }}>
                    Loading secure environment...
                </div>
            </div>
        );
    }

    if (!authToken) {
        return (
            <div className="app">
                <TitleBar />
                <Login onLoginSuccess={handleLoginSuccess} />
            </div>
        );
    }

    return (
        <div className="app">
            <TitleBar />
            <div className="grid-background"></div>

            <header className="header">
                <div className="header-content">
                    <div className="logo">
                        <img
                            src={logo}
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
                                serverStatus === "stopped" && isStreaming
                                    ? "error"
                                    : isStreaming
                                      ? "active"
                                      : "inactive"
                            }`}
                        >
                            <div className="pulse"></div>
                            <span>
                                {serverStatus === "stopped" && isStreaming
                                    ? "Call Stopped - Connection Lost"
                                    : isStreaming
                                      ? "Call in Progress"
                                      : "Ready to Start"}
                            </span>
                        </div>
                        <button className="btn btn-stop" style={{ padding: "0.5rem 1rem", fontSize: "0.85rem" }} onClick={handleLogout}>
                            Logout
                        </button>
                    </div>
                </div>
            </header>

            <main className="main-content">
                <section className="control-panel">
                    <div className="panel-header">
                        <h2>Call Controls</h2>
                        <p className="panel-description">
                            Manage your microphone and system audio during the
                            call.
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
                            className={`btn ${isStreaming ? "btn-stop" : "btn-start"}`}
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
                                      ? "End Call"
                                      : "Start Call"}
                            </span>
                        </button>
                    </div>
                </section>

                <section className="realtime-help-panel liquid-glass chat-container">
                    <div className="glass-content">
                        <div className="panel-header">
                            <h2>Realtime Help</h2>
                            <button
                                className="btn btn-help"
                                onClick={requestRealtimeHelp}
                                disabled={helpIsReplying}
                                title={HELP_WS_URL}
                            >
                                {helpIsReplying ? "Replying…" : "Get Help"}
                            </button>
                        </div>

                        <div className="help-transcript" ref={helpScrollRef}>
                            {helpMessages.length === 0 ? (
                                <div className="help-empty">
                                    Press “Get Help” to request realtime
                                    guidance.
                                </div>
                            ) : (
                                helpMessages
                                    .filter((m) => m.role === "assistant")
                                    .map((m, idx) => (
                                        <div
                                            key={idx}
                                            className="help-row help-row-assistant"
                                        >
                                            <div className="help-bubble help-bubble-assistant">
                                                {m.content}
                                            </div>
                                        </div>
                                    ))
                            )}

                            {helpIsReplying && (
                                <div className="help-row help-row-assistant">
                                    <div className="help-bubble help-bubble-assistant help-typing">
                                        <span className="help-typing-label">
                                            …is replying…
                                        </span>
                                        <span className="help-dots">
                                            <span
                                                className="dot"
                                                style={{
                                                    animationDelay: "0ms",
                                                }}
                                            ></span>
                                            <span
                                                className="dot"
                                                style={{
                                                    animationDelay: "200ms",
                                                }}
                                            ></span>
                                            <span
                                                className="dot"
                                                style={{
                                                    animationDelay: "400ms",
                                                }}
                                            ></span>
                                        </span>
                                    </div>
                                </div>
                            )}
                        </div>
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
                                <p>
                                    Your voice is being captured through the
                                    microphone.
                                </p>
                                <div className="info-status">
                                    <span
                                        className={`status-dot ${isStreaming ? "active" : "inactive"}`}
                                    ></span>
                                    <span>{isStreaming ? "Live" : "Idle"}</span>
                                </div>
                            </div>
                        </div>

                        <div className="info-card">
                            <div className="info-icon">🔊</div>
                            <div className="info-content">
                                <h3>System Audio</h3>
                                <p>
                                    Your computer’s audio is being shared during
                                    the call.
                                </p>
                                <div className="info-status">
                                    <span
                                        className={`status-dot ${isStreaming ? "active" : "inactive"}`}
                                    ></span>
                                    <span>{isStreaming ? "Live" : "Idle"}</span>
                                </div>
                            </div>
                        </div>

                        <div className="info-card">
                            <div className="info-icon">🌐</div>
                            <div className="info-content">
                                <h3>Connection</h3>
                                <p>
                                    Your audio is being sent through an active
                                    connection.
                                </p>
                                <div className="info-status">
                                    <span
                                        className={`status-dot ${isStreaming ? "active" : "inactive"}`}
                                    ></span>
                                    <span>
                                        {isStreaming
                                            ? "Connected"
                                            : "Not Connected"}
                                    </span>
                                </div>
                            </div>
                        </div>

                        <div className="info-card">
                            <div className="info-icon">⚡</div>
                            <div className="info-content">
                                <h3>Performance</h3>
                                <p>
                                    Smooth, real-time audio handling for clear
                                    call quality.
                                </p>

                                {serverError &&
                                    serverError.type === "dependency-error" && (
                                        <div className="error-banner">
                                            <h4>⚠️ Setup Required</h4>
                                            <p>{serverError.message}</p>
                                            <p
                                                style={{
                                                    fontSize: "0.9em",
                                                    color: "#ccc",
                                                    marginTop: "10px",
                                                }}
                                            >
                                                Some components needed for audio
                                                calls are missing. Please
                                                reinstall Phonolytics to fix
                                                this issue.
                                            </p>
                                        </div>
                                    )}

                                <div className="info-status">
                                    <span
                                        className={`status-dot ${
                                            serverError?.type ===
                                            "dependency-error"
                                                ? "error"
                                                : serverStatus === "stopped"
                                                  ? "error"
                                                  : isStreaming
                                                    ? "active"
                                                    : "ready"
                                        }`}
                                    ></span>
                                    <span>
                                        {serverError?.type ===
                                        "dependency-error"
                                            ? "Setup Required"
                                            : serverStatus === "stopped"
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
