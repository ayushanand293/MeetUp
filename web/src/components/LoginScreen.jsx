import React, { useState } from 'react'
import '../styles/App.css'

export function LoginScreen({ onLogin }) {
  const [token, setToken] = useState('')
  const [error, setError] = useState('')

  const handleLogin = (e) => {
    e.preventDefault()
    setError('')

    if (!token.trim()) {
      setError('Please enter a valid JWT token')
      return
    }

    // Validate token format (should have 3 parts separated by dots)
    if (token.split('.').length !== 3) {
      setError('Invalid token format. JWT should have 3 parts separated by dots.')
      return
    }

    onLogin(token)
  }

  return (
    <div className="login-container">
      <div className="login-box">
        <h1>🗺️ MeetUp</h1>
        <p>Real-time Location Sharing</p>
        
        <form onSubmit={handleLogin}>
          <div className="form-group">
            <label>JWT Token</label>
            <textarea
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Paste your JWT token here"
              style={{ fontFamily: 'monospace', minHeight: '100px', fontSize: '0.85rem' }}
              required
            />
          </div>

          {error && <div className="error-message">{error}</div>}

          <button 
            type="submit"
            className="btn btn-primary btn-block"
          >
            Login with Token
          </button>
        </form>

        <p className="hint">
          💡 Get your JWT token by calling the backend login endpoint or using the test seed data.
        </p>

        <details style={{ marginTop: '20px', color: '#666', fontSize: '0.85rem' }}>
          <summary style={{ cursor: 'pointer', fontWeight: '600' }}>Need help getting a token?</summary>
          <div style={{ marginTop: '10px', backgroundColor: '#f5f5f5', padding: '10px', borderRadius: '4px' }}>
            <p><strong>Option 1: Use seed data</strong></p>
            <pre style={{ backgroundColor: '#fff', padding: '8px', overflow: 'auto', fontSize: '0.8rem' }}>
{`docker-compose exec backend python seed.py`}
            </pre>
            <p style={{ marginTop: '10px' }}><strong>Option 2: Login via backend API</strong></p>
            <pre style={{ backgroundColor: '#fff', padding: '8px', overflow: 'auto', fontSize: '0.8rem' }}>
{`curl -X POST http://localhost:8000/api/v1/auth/login \\
  -H "Content-Type: application/json" \\
  -d '{"email":"alice@test.com","password":"password"}'`}
            </pre>
          </div>
        </details>
      </div>
    </div>
  )
}
