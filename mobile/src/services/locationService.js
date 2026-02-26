/**
 * LocationService - Industry-standard GPS location management
 * 
 * Features:
 * - Promise-based permission management
 * - Continuous location tracking with configurable intervals
 * - Event-driven architecture for scalability
 * - Automatic resource cleanup
 * - Comprehensive error handling with recovery
 * - Memory leak prevention
 * - Debuggable logging
 */

import * as Location from 'expo-location';
import { Platform } from 'react-native';

const DEBUG = process.env.NODE_ENV !== 'production';

/**
 * EventEmitter pattern for location updates
 * Allows multiple subscribers without tight coupling
 */
class EventEmitter {
  constructor() {
    this.listeners = new Map();
  }

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(callback);
    
    // Return unsubscribe function
    return () => {
      this.listeners.get(event).delete(callback);
    };
  }

  emit(event, data) {
    if (!this.listeners.has(event)) return;
    
    for (const callback of this.listeners.get(event)) {
      try {
        callback(data);
      } catch (error) {
        console.error(`Error in ${event} listener:`, error);
      }
    }
  }

  removeAllListeners(event) {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
  }
}

/**
 * LocationService Singleton
 * Manages GPS tracking with proper lifecycle management
 */
class LocationService extends EventEmitter {
  constructor() {
    super();
    
    // Current location state
    this.currentLocation = null;
    this.isTracking = false;
    this.hasPermission = false;
    
    // Watchers and timers for cleanup
    this.locationWatcher = null;
    this.cacheUpdateTimer = null;
    
    // Configuration
    this.config = {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: 2000, // 2 seconds
      distanceInterval: 5, // 5 meters
      enableBackground: false, // Can be enabled for productionmock data for development/testing
      useMockLocation: false,
      mockLocationInterval: 2000,
    };
    
    // Retry configuration
    this.permissionRetries = 0;
    this.maxPermissionRetries = 3;
    
    // Performance metrics
    this.metrics = {
      totalUpdates: 0,
      totalErrors: 0,
      lastUpdateTime: null,
      startTime: null,
    };
  }

  /**
   * Initialize and request location permission
   * @returns {Promise<boolean>} - true if permission granted
   */
  async requestPermission() {
    try {
      DEBUG && console.log('[LocationService] Requesting permission...');
      
      const { status } = await Location.requestForegroundPermissionsAsync();
      
      if (status === 'granted') {
        this.hasPermission = true;
        this.permissionRetries = 0;
        this.emit('permissionGranted');
        DEBUG && console.log('[LocationService] Permission granted');
        return true;
      } else if (status === 'denied') {
        this.hasPermission = false;
        this.emit('permissionDenied');
        DEBUG && console.warn('[LocationService] Permission denied');
        return false;
      } else {
        // 'undetermined' or other status
        this.emit('permissionUndetermined');
        return false;
      }
    } catch (error) {
      console.error('[LocationService] Permission request error:', error);
      this.metrics.totalErrors++;
      this.emit('permissionError', { error });
      return false;
    }
  }

  /**
   * Check if location services are enabled on device
   * @returns {Promise<boolean>}
   */
  async checkLocationServicesEnabled() {
    try {
      const enabled = await Location.hasServicesEnabledAsync();
      
      if (!enabled) {
        this.emit('locationServicesDisabled');
        DEBUG && console.warn('[LocationService] Location services disabled');
      }
      
      return enabled;
    } catch (error) {
      console.error('[LocationService] Location services check error:', error);
      // Continue anyway - might work
      return true;
    }
  }

  /**
   * Get current location once
   * @returns {Promise<{lat, lon, accuracy_m, timestamp}>} - Location object or null
   */
  async getCurrentLocation() {
    try {
      // Check permission first
      if (!this.hasPermission) {
        const granted = await this.requestPermission();
        if (!granted) {
          throw new Error('Location permission not granted');
        }
      }

      DEBUG && console.log('[LocationService] Getting current location...');
      
      const location = await Location.getCurrentPositionAsync({
        accuracy: this.config.accuracy,
        mayPromptForPermissionAgain: false,
      });

      const { latitude, longitude, accuracy } = location.coords;
      
      const locationData = {
        lat: latitude,
        lon: longitude,
        accuracy_m: accuracy || 10,
        timestamp: new Date().toISOString(),
      };

      this.currentLocation = locationData;
      this.metrics.totalUpdates++;
      
      DEBUG && console.log('[LocationService] Current location:', locationData);
      
      return locationData;
    } catch (error) {
      console.error('[LocationService] Get location error:', error);
      this.metrics.totalErrors++;
      this.emit('locationError', { error });
      
      // Return mock location for development if configured
      if (this.config.useMockLocation) {
        return this._getMockLocation();
      }
      
      return null;
    }
  }

  /**
   * Start continuous location tracking
   * @param {Function} onLocationChange - Callback for location updates
   * @returns {Promise<boolean>} - true if tracking started successfully
   */
  async startTracking(onLocationChange) {
    try {
      if (this.isTracking) {
        DEBUG && console.warn('[LocationService] Already tracking');
        return true;
      }

      DEBUG && console.log('[LocationService] Starting location tracking...');
      
      // Check permission
      if (!this.hasPermission) {
        const granted = await this.requestPermission();
        if (!granted) {
          throw new Error('Location permission not granted');
        }
      }

      // Check location services
      const servicesEnabled = await this.checkLocationServicesEnabled();
      if (!servicesEnabled) {
        throw new Error('Location services are disabled');
      }

      this.metrics.startTime = Date.now();
      
      // If using mock location for testing
      if (this.config.useMockLocation) {
        this._startMockTracking(onLocationChange);
        return true;
      }

      // Real location tracking
      this.locationWatcher = await Location.watchPositionAsync(
        {
          accuracy: this.config.accuracy,
          timeInterval: this.config.timeInterval,
          distanceInterval: this.config.distanceInterval,
        },
        (location) => {
          const { latitude, longitude, accuracy } = location.coords;
          
          const locationData = {
            lat: latitude,
            lon: longitude,
            accuracy_m: accuracy || 10,
            timestamp: new Date().toISOString(),
          };

          this.currentLocation = locationData;
          this.metrics.totalUpdates++;
          this.metrics.lastUpdateTime = Date.now();

          // Emit to all subscribers
          this.emit('locationUpdate', locationData);
          
          // Call provided callback
          if (onLocationChange) {
            try {
              onLocationChange(locationData);
            } catch (error) {
              console.error('[LocationService] Callback error:', error);
            }
          }

          DEBUG && console.log('[LocationService] Location updated:', {
            lat: locationData.lat.toFixed(4),
            lon: locationData.lon.toFixed(4),
          });
        }
      );

      this.isTracking = true;
      this.emit('trackingStarted');
      
      DEBUG && console.log('[LocationService] Tracking started');
      return true;
    } catch (error) {
      console.error('[LocationService] Start tracking error:', error);
      this.metrics.totalErrors++;
      this.emit('trackingError', { error });
      return false;
    }
  }

  /**
   * Stop location tracking
   */
  stopTracking() {
    try {
      DEBUG && console.log('[LocationService] Stopping location tracking...');
      
      if (this.locationWatcher) {
        this.locationWatcher.remove();
        this.locationWatcher = null;
      }

      if (this.cacheUpdateTimer) {
        clearInterval(this.cacheUpdateTimer);
        this.cacheUpdateTimer = null;
      }

      this.isTracking = false;
      this.emit('trackingStopped');
      
      // Log metrics
      if (this.metrics.startTime) {
        const duration = Date.now() - this.metrics.startTime;
        DEBUG && console.log('[LocationService] Session metrics:', {
          duration: `${(duration / 1000).toFixed(2)}s`,
          updates: this.metrics.totalUpdates,
          errors: this.metrics.totalErrors,
          avgUpdatesPerSecond: (this.metrics.totalUpdates / (duration / 1000)).toFixed(2),
        });
      }
      
      DEBUG && console.log('[LocationService] Tracking stopped');
    } catch (error) {
      console.error('[LocationService] Stop tracking error:', error);
    }
  }

  /**
   * Get last known location
   * @returns {Object|null}
   */
  getLastLocation() {
    return this.currentLocation;
  }

  /**
   * Subscribe to location updates (event-driven)
   * @param {Function} callback
   * @returns {Function} - Unsubscribe function
   */
  subscribe(callback) {
    return this.on('locationUpdate', callback);
  }

  /**
   * Check current tracking status
   * @returns {Object} - Status information
   */
  getStatus() {
    return {
      isTracking: this.isTracking,
      hasPermission: this.hasPermission,
      currentLocation: this.currentLocation,
      metrics: { ...this.metrics },
    };
  }

  /**
   * Configure service parameters  
   * @param {Object} newConfig
   */
  configure(newConfig) {
    this.config = { ...this.config, ...newConfig };
    DEBUG && console.log('[LocationService] Configuration updated:', this.config);
  }

  /**
   * Clean up all resources
   */
  dispose() {
    DEBUG && console.log('[LocationService] Disposing resources...');
    
    this.stopTracking();
    this.removeAllListeners();
    this.currentLocation = null;
    this.hasPermission = false;
    this.metrics = {
      totalUpdates: 0,
      totalErrors: 0,
      lastUpdateTime: null,
      startTime: null,
    };
    
    DEBUG && console.log('[LocationService] Disposed');
  }

  // ===== PRIVATE METHODS =====

  /**
   * Get mock location for testing (India - Bangalore area)
   * @returns {Object}
   * @private
   */
  _getMockLocation() {
    const baseLatitude = 12.9716;
    const baseLongitude = 77.5946;
    
    // Add small random offset for testing
    const latOffset = (Math.random() - 0.5) * 0.01;
    const lonOffset = (Math.random() - 0.5) * 0.01;
    
    return {
      lat: baseLatitude + latOffset,
      lon: baseLongitude + lonOffset,
      accuracy_m: Math.random() * 20 + 10,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Start mock location tracking for development
   * @param {Function} onLocationChange
   * @private
   */
  _startMockTracking(onLocationChange) {
    DEBUG && console.log('[LocationService] Starting mock location tracking');
    
    this.isTracking = true;
    this.emit('trackingStarted');
    
    this.cacheUpdateTimer = setInterval(() => {
      const location = this._getMockLocation();
      
      this.currentLocation = location;
      this.metrics.totalUpdates++;
      this.metrics.lastUpdateTime = Date.now();
      
      this.emit('locationUpdate', location);
      
      if (onLocationChange) {
        try {
          onLocationChange(location);
        } catch (error) {
          console.error('[LocationService] Mock callback error:', error);
        }
      }
    }, this.config.mockLocationInterval);
  }
}

// Create singleton instance
const locationService = new LocationService();

// Export for use in components
export default locationService;
