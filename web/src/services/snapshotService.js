import axios from 'axios'

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1'

function formatApiError(error) {
  const detail = error?.response?.data?.detail
  if (!detail) return error?.message || 'Request failed'

  if (typeof detail === 'string') return detail

  if (Array.isArray(detail)) {
    return detail
      .map((entry) => {
        if (typeof entry === 'string') return entry
        const field = Array.isArray(entry?.loc) ? entry.loc.join('.') : 'field'
        const message = entry?.msg || 'Invalid value'
        return `${field}: ${message}`
      })
      .join('; ')
  }

  if (typeof detail === 'object') {
    try {
      return JSON.stringify(detail)
    } catch {
      return 'Request failed'
    }
  }

  return String(detail)
}

export async function fetchSessionSnapshot(sessionId, token) {
  try {
    const response = await axios.get(
      `${API_BASE_URL}/sessions/${sessionId}/snapshot`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    )
    return { data: response.data, error: null }
  } catch (error) {
    console.error('Snapshot fetch error:', error)
    return {
      data: null,
      error: formatApiError(error)
    }
  }
}

export function startSnapshotPolling(sessionId, token, callback, interval = 2000) {
  const intervalId = setInterval(async () => {
    const { data, error } = await fetchSessionSnapshot(sessionId, token)
    if (data) {
      callback(data)
    } else {
      console.error('Polling error:', error)
    }
  }, interval)

  return () => clearInterval(intervalId)
}

export async function endSession(sessionId, token, reason = 'USER_ENDED') {
  try {
    const response = await axios.put(
      `${API_BASE_URL}/sessions/${sessionId}/end`,
      { reason },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    )
    return { data: response.data, error: null }
  } catch (error) {
    console.error('End session error:', error)
    return {
      data: null,
      error: formatApiError(error)
    }
  }
}
