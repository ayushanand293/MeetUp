import React, { useState, useEffect, useRef } from 'react'
import L from 'leaflet'
import { fetchSessionSnapshot, endSession, startSnapshotPolling } from '../services/snapshotService'
import '../styles/App.css'

export function SessionMap({ sessionId, token, onLogout }) {
  const mapRef = useRef(null)
  const mapInstanceRef = useRef(null)
  const markersRef = useRef({})
  const pollingStopRef = useRef(null)
  
  const [sessionData, setSessionData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [lastUpdate, setLastUpdate] = useState(null)
  const [paused, setPaused] = useState(false)

  // Initialize map
  useEffect(() => {
    if (loading) return
    if (!mapRef.current) return
    if (mapInstanceRef.current) return

    const container = mapRef.current
    if (container._leaflet_id) {
      delete container._leaflet_id
    }

    const map = L.map(container).setView([28.5355, 77.0892], 14)

    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '©OpenStreetMap, ©CartoDB',
      maxZoom: 19
    }).addTo(map)

    setTimeout(() => {
      map.invalidateSize()
    }, 0)

    mapInstanceRef.current = map

    return () => {
      map.remove()
      mapInstanceRef.current = null
    }
  }, [loading])

  // Fetch initial snapshot
  useEffect(() => {
    const initSnapshot = async () => {
      setLoading(true)
      const { data, error: fetchError } = await fetchSessionSnapshot(sessionId, token)
      
      if (data) {
        setSessionData(data)
        setLastUpdate(new Date())
        updateMapMarkers(data)
      } else {
        setError(fetchError)
      }
      setLoading(false)
    }

    initSnapshot()
  }, [sessionId, token])

  // Start polling
  useEffect(() => {
    if (loading || paused) return

    const stopPolling = startSnapshotPolling(
      sessionId,
      token,
      (data) => {
        setSessionData(data)
        setLastUpdate(new Date())
        updateMapMarkers(data)
      },
      2000 // Poll every 2 seconds
    )

    pollingStopRef.current = stopPolling
    return () => stopPolling()
  }, [sessionId, token, paused, loading])

  // Render markers once map is ready and session data is available
  useEffect(() => {
    if (loading) return
    if (!sessionData) return
    if (!mapInstanceRef.current) return
    updateMapMarkers(sessionData)
  }, [loading, sessionData])

  const updateMapMarkers = (data) => {
    if (!mapInstanceRef.current) return

    const map = mapInstanceRef.current
    const locations = data.locations || {}

    // Clear old markers
    Object.values(markersRef.current).forEach(marker => marker.remove())
    markersRef.current = {}

    // Add new markers
    let validLocationCount = 0
    Object.entries(locations).forEach(([userId, location]) => {
      if (!location) return

      const lat = location.lat
      const lon = location.lon
      const accuracy = location.accuracy_m || 10

      // Create marker
      const marker = L.circleMarker([lat, lon], {
        radius: 8,
        color: '#007AFF',
        weight: 2,
        opacity: 1,
        fillColor: '#007AFF',
        fillOpacity: 0.7
      }).addTo(map)

      // Add accuracy circle
      L.circle([lat, lon], {
        radius: accuracy,
        color: '#007AFF',
        weight: 1,
        opacity: 0.3,
        fill: false
      }).addTo(map)

      // Popup
      const age = location.updated_at ? getTimeSince(new Date(location.updated_at)) : 'unknown'
      marker.bindPopup(
        `<strong>User ${userId.substring(0, 8)}...</strong><br/>
         Accuracy: ${accuracy}m<br/>
         Updated: ${age}`
      )

      markersRef.current[userId] = marker
      validLocationCount++
    })

    // Fit bounds
    if (validLocationCount > 0) {
      const latlngs = Object.values(markersRef.current).map(m => m.getLatLng())
      const bounds = L.latLngBounds(latlngs)
      map.fitBounds(bounds, { padding: [50, 50] })
    }
  }

  const handleEndSession = async () => {
    if (!window.confirm('End this session?')) return

    setLoading(true)
    const { error: endError } = await endSession(sessionId, token, 'USER_ENDED')
    
    if (endError) {
      setError(endError)
    } else {
      alert('Session ended')
      onLogout()
    }
  }

  const handleLogout = () => {
    onLogout()
  }

  if (loading) {
    return <div className="loading">Loading session...</div>
  }

  if (error) {
    return (
      <div className="error-container">
        <h2>Error</h2>
        <p>{error}</p>
        <button onClick={handleLogout} className="btn btn-primary">
          Back to Login
        </button>
      </div>
    )
  }

  if (!sessionData) {
    return <div className="loading">No session data</div>
  }

  return (
    <div className="session-container">
      <div className="map-header">
        <div className="header-left">
          <h2>🗺️ Active Session</h2>
          <div className="session-info">
            <span className={`status-badge status-${sessionData.session_status?.toLowerCase() || 'unknown'}`}>
              {sessionData.session_status || 'Unknown'}
            </span>
            {lastUpdate && (
              <span className="last-update">
                Updated: {lastUpdate.toLocaleTimeString()}
              </span>
            )}
          </div>
        </div>
        <div className="header-right">
          <button 
            onClick={() => setPaused(!paused)}
            className={`btn ${paused ? 'btn-warning' : 'btn-secondary'}`}
          >
            {paused ? '▶ Resume' : '⏸ Pause'}
          </button>
          <button 
            onClick={handleEndSession}
            className="btn btn-danger"
          >
            ⏹ End Session
          </button>
          <button 
            onClick={handleLogout}
            className="btn btn-secondary"
          >
            Logout
          </button>
        </div>
      </div>

      <div 
        ref={mapRef} 
        className="map"
        style={{ height: 'calc(100vh - 120px)' }}
      />

      <div className="map-footer">
        <p className="info-text">
          📍 {Object.values(sessionData.locations || {}).filter(l => l).length} users visible
          {paused && ' (Polling paused)'}
        </p>
      </div>
    </div>
  )
}

function getTimeSince(date) {
  const seconds = Math.floor((new Date() - date) / 1000)
  
  if (seconds < 5) return 'just now'
  if (seconds < 60) return `${seconds}s ago`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  return `${Math.floor(seconds / 3600)}h ago`
}
