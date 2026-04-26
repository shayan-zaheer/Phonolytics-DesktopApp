import { useState } from 'react';
import logo from './assets/logo.png';

export default function Login({ onLoginSuccess }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      // Calling the backend API for agent login
      const API_BASE = import.meta.env.VITE_BACKEND_API_BASE || "http://127.0.0.1:8000";
      
      const response = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      if (!response.ok) {
        throw new Error('Invalid credentials. Please try again.');
      }

      const data = await response.json();
      
      // Usually, the access token is returned here. We pass it to the success handler.
      if (data.access_token) {
        onLoginSuccess(data.access_token, data.user);
      }

    } catch (err) {
      setError(err.message || 'Failed to connect to the server.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="login-container">
       <div className="grid-background"></div>
       <div className="login-card liquid-glass">
         <img src={logo} alt="Phonolytics" className="login-logo" />
         <h2>Agent Login</h2>
         <p className="login-subtitle">Please sign in to access Phonolytics</p>
         
         {error && <div className="login-error">{error}</div>}

         <form onSubmit={handleSubmit} className="login-form">
           <div className="form-group">
             <label>Email</label>
             <input 
               type="email" 
               value={email} 
               onChange={e => setEmail(e.target.value)} 
               required 
               placeholder="agent@example.com"
               className="login-input"
             />
           </div>
           
           <div className="form-group">
             <label>Password</label>
             <input 
               type="password" 
               value={password} 
               onChange={e => setPassword(e.target.value)} 
               required 
               placeholder="••••••••"
               className="login-input"
             />
           </div>

           <button type="submit" className="btn btn-start login-btn" disabled={isLoading}>
             {isLoading ? 'Signing In...' : 'Sign In'}
           </button>
         </form>
       </div>
    </div>
  );
}
