import React, { useState, useEffect } from 'react'
import { LoginScreen } from './components/LoginScreen'
import { SessionMap } from './components/SessionMap'
import './styles/App.css'

function App() {
  const [token, setToken] = useState(localStorage.getItem('auth_token') || '')
  const [sessionId, setSessionId] = useState('')
  const [sessionInput, setSessionInput] = useState('')
  const [sessionInputError, setSessionInputError] = useState('')
  const [loading, setLoading] = useState(true)

  const isValidUuid = (value) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)

  // Check for token/session in URL params or localStorage
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const urlToken = params.get('token')
    const urlSessionId = params.get('session_id')
    
    if (urlToken) {
      setToken(urlToken)
      localStorage.setItem('auth_token', urlToken)
    }
    if (urlSessionId) {
      if (isValidUuid(urlSessionId)) {
        setSessionId(urlSessionId)
      } else {
        setSessionInput(urlSessionId)
        setSessionInputError('Invalid session ID format. Please enter a full UUID.')
      }
    }
    
    setLoading(false)
  }, [])

  const handleLogout = () => {
    setToken('')
    setSessionId('')
    setSessionInput('')
    localStorage.removeItem('auth_token')
  }

  const handleLoadSession = () => {
    const trimmed = sessionInput.trim()
    if (!trimmed) return

    if (!isValidUuid(trimmed)) {
      setSessionInputError('Invalid session ID format. Please enter a full UUID.')
      return
    }

    setSessionInputError('')
    setSessionId(trimmed)
  }

  if (loading) {
    return <div className="loading">Loading...</div>
  }

  if (!token) {
    return <LoginScreen onLogin={(newToken) => {
      setToken(newToken)
      localStorage.setItem('auth_token', newToken)
    }} />
  }

  if (!sessionId) {
    return (
      <div className="session-id-container">
        <div className="session-id-box">
          <h1>🗺️ MeetUp Web</h1>
          <p>Enter your active session ID to view live locations</p>
          
          <div className="form-group">
            <label>Session ID (UUID)</label>
            <input
              type="text"
              value={sessionInput}
              onChange={(e) => {
                setSessionInput(e.target.value)
                if (sessionInputError) setSessionInputError('')
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  handleLoadSession()
                }
              }}
              placeholder="00000000-0000-0000-0000-000000000000"
              className="form-input"
            />
            {sessionInputError && (
              <div className="error-message" style={{ marginTop: 10, marginBottom: 0 }}>
                {sessionInputError}
              </div>
            )}
          </div>

          <button 
            onClick={handleLoadSession}
            disabled={!sessionInput.trim()}
            className="btn btn-primary btn-block"
          >
            Load Session
          </button>

          <button 
            onClick={handleLogout}
            className="btn btn-secondary btn-block"
          >
            Logout
          </button>

          <p className="hint">
            💡 Share the session ID from mobile app, or check your browser URL
          </p>
        </div>
      </div>
    )
  }

  return (
    <SessionMap 
      sessionId={sessionId} 
      token={token}
      onLogout={handleLogout}
    />
  )
}

export default App
