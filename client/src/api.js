// Fetch wrapper with automatic Authorization header
export const fetchWithAuth = async (url, options = {}) => {
  let token = null;

  // Try to get token securely from Electron Main Process if available
  if (window.electronAPI && window.electronAPI.getToken) {
    try {
      const response = await window.electronAPI.getToken();
      if (response && response.success) {
        token = response.token;
      }
    } catch (err) {
      console.error("Error getting secure token via IPC:", err);
    }
  } else {
    // Fallback for standard web browser environment
    token = localStorage.getItem("phonolytics_access_token");
  }

  // Setup headers
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };

  // Append Bearer token if we have one
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const finalOptions = {
    ...options,
    headers,
  };

  // Perform the actual fetch request
  const response = await fetch(url, finalOptions);
  
  // Optional: Handle 401 Unauthorized globally here
  if (response.status === 401) {
    console.error("Authentication token expired or invalid");
    // You could trigger a global logout event here
  }

  return response;
};
