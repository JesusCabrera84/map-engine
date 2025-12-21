// src/engine/MapEngine.ts
var MapEngine = class {
  options;
  constructor(options) {
    this.options = options;
  }
  /**
   * Updates the map theme.
   */
  setTheme(theme) {
    this.options.theme = theme;
    this.onThemeChange(theme);
  }
};

// src/providers/google/GoogleMapEngine.ts
import { setOptions, importLibrary } from "@googlemaps/js-api-loader";

// src/engine/motion/NetworkBuffer.ts
var SimpleNetworkBuffer = class {
  buffer = [];
  lastProcessedTimestamp = 0;
  maxBufferSize = 50;
  push(packet) {
    const ts = packet.timestamp || Date.now();
    if (ts < this.lastProcessedTimestamp) {
      return;
    }
    this.buffer.push(packet);
    this.buffer.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
    if (this.buffer.length > this.maxBufferSize) {
      this.buffer.shift();
    }
  }
  pop() {
    if (this.buffer.length === 0) {
      return null;
    }
    const next = this.buffer.shift();
    if (next) {
      this.lastProcessedTimestamp = next.timestamp || Date.now();
    }
    return next || null;
  }
  getLatestTimestamp() {
    if (this.buffer.length === 0) {
      return this.lastProcessedTimestamp;
    }
    const last = this.buffer[this.buffer.length - 1];
    return last && last.timestamp || this.lastProcessedTimestamp;
  }
};

// src/utils/geo.ts
function haversineDistance(coords1, coords2) {
  const R = 6371e3;
  const lat1 = coords1.lat;
  const lon1 = coords1.lng ?? coords1.lon ?? 0;
  const lat2 = coords2.lat;
  const lon2 = coords2.lng ?? coords2.lon ?? 0;
  const \u03C61 = lat1 * Math.PI / 180;
  const \u03C62 = lat2 * Math.PI / 180;
  const \u0394\u03C6 = (lat2 - lat1) * Math.PI / 180;
  const \u0394\u03BB = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(\u0394\u03C6 / 2) * Math.sin(\u0394\u03C6 / 2) + Math.cos(\u03C61) * Math.cos(\u03C62) * Math.sin(\u0394\u03BB / 2) * Math.sin(\u0394\u03BB / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
function computeBearing(lat1, lon1, lat2, lon2) {
  const \u03C61 = lat1 * Math.PI / 180;
  const \u03C62 = lat2 * Math.PI / 180;
  const \u0394\u03BB = (lon2 - lon1) * Math.PI / 180;
  const y = Math.sin(\u0394\u03BB) * Math.cos(\u03C62);
  const x = Math.cos(\u03C61) * Math.sin(\u03C62) - Math.sin(\u03C61) * Math.cos(\u03C62) * Math.cos(\u0394\u03BB);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}
function extrapolatePosition(lat, lon, speedMps, bearingDeg, deltaSeconds) {
  const R = 6378137;
  const dist = speedMps * deltaSeconds;
  const \u03B4 = dist / R;
  const \u03B8 = bearingDeg * Math.PI / 180;
  const \u03C61 = lat * Math.PI / 180;
  const \u03BB1 = lon * Math.PI / 180;
  const \u03C62 = Math.asin(Math.sin(\u03C61) * Math.cos(\u03B4) + Math.cos(\u03C61) * Math.sin(\u03B4) * Math.cos(\u03B8));
  const \u03BB2 = \u03BB1 + Math.atan2(
    Math.sin(\u03B8) * Math.sin(\u03B4) * Math.cos(\u03C61),
    Math.cos(\u03B4) - Math.sin(\u03C61) * Math.sin(\u03C62)
  );
  return {
    lat: \u03C62 * 180 / Math.PI,
    lon: \u03BB2 * 180 / Math.PI
  };
}
function lerpPosition(pos1, pos2, t) {
  return {
    lat: pos1.lat + (pos2.lat - pos1.lat) * t,
    lon: pos1.lon + (pos2.lon - pos1.lon) * t
  };
}
function lerpAngle(start, end, t) {
  const diff = ((end - start + 180) % 360 + 360) % 360 - 180;
  return (start + diff * t + 360) % 360;
}

// src/engine/motion/PhysicsModel.ts
var KinematicPhysicsModel = class {
  // We keep track of the "physics" velocity, which might differ from the last reported speed
  // if we want to model inertia. For now, we trust the telemetry speed but allow integration.
  currentSpeed = 0;
  currentHeading = 0;
  step(currentPose, dt) {
    const newPos = extrapolatePosition(
      currentPose.lat,
      currentPose.lng,
      this.currentSpeed,
      this.currentHeading,
      dt
    );
    const newUncertainty = currentPose.uncertaintyRadius + this.currentSpeed * 0.1 * dt;
    return {
      lat: newPos.lat,
      lng: newPos.lon,
      heading: this.currentHeading,
      speed: this.currentSpeed,
      uncertaintyRadius: newUncertainty
    };
  }
  update(observation) {
    const speedMs = (observation.speedKmh || 0) * 1e3 / 3600;
    this.currentSpeed = speedMs;
    if (observation.bearing !== void 0) {
      this.currentHeading = observation.bearing;
    }
  }
};

// src/engine/motion/ConfidenceModel.ts
var DEFAULT_POLICY = {
  fullConfidenceMs: 5e3,
  decayMs: 1e4,
  maxStaleMs: 15 * 60 * 1e3
};
var TimeBasedConfidenceModel = class {
  lastUpdateTime = 0;
  currentTime = 0;
  policy;
  constructor(policy) {
    this.policy = { ...DEFAULT_POLICY, ...policy };
  }
  update(observation) {
    const now = Date.now();
    this.lastUpdateTime = now;
    this.currentTime = now;
  }
  decay(dt) {
    this.currentTime += dt * 1e3;
  }
  getConfidence() {
    const age = this.currentTime - this.lastUpdateTime;
    if (age < this.policy.fullConfidenceMs) {
      return 1;
    } else if (age < this.policy.fullConfidenceMs + this.policy.decayMs) {
      const decayStart = this.policy.fullConfidenceMs;
      const decayEnd = decayStart + this.policy.decayMs;
      return 1 - (age - decayStart) / (decayEnd - decayStart);
    } else {
      return 0;
    }
  }
  getState() {
    const age = this.currentTime - this.lastUpdateTime;
    const confidence = this.getConfidence();
    if (age < this.policy.fullConfidenceMs) {
      return "REAL";
    } else if (confidence > 0) {
      return "COASTING";
    } else if (age > this.policy.maxStaleMs) {
      return "FROZEN";
    } else {
      return "PREDICTED";
    }
  }
};

// src/engine/motion/IntentModel.ts
var VarianceIntentModel = class {
  recentBearings = [];
  windowSize = 5;
  update(observation) {
    if (observation.bearing !== void 0) {
      this.recentBearings.push(observation.bearing);
      if (this.recentBearings.length > this.windowSize) {
        this.recentBearings.shift();
      }
    }
  }
  getIntent() {
    if (this.recentBearings.length < 2) {
      return { action: "UNKNOWN", confidence: 0 };
    }
    const variance = this.calculateCircularVariance(this.recentBearings);
    if (variance < 0.01) {
      return { action: "STRAIGHT", confidence: 1 - variance };
    } else if (variance > 0.1) {
      return { action: "TURN", confidence: variance };
    } else {
      return { action: "STRAIGHT", confidence: 0.5 };
    }
  }
  calculateCircularVariance(angles) {
    const rads = angles.map((d) => d * Math.PI / 180);
    let sumCos = 0;
    let sumSin = 0;
    for (const r of rads) {
      sumCos += Math.cos(r);
      sumSin += Math.sin(r);
    }
    const R = Math.sqrt(sumCos * sumCos + sumSin * sumSin);
    const R_bar = R / angles.length;
    return 1 - R_bar;
  }
};

// src/engine/motion/MotionEngine.ts
var StandardMotionEngine = class {
  buffer;
  physics;
  confidence;
  intent;
  // Current best estimate
  currentPose = {
    lat: 0,
    lng: 0,
    heading: 0,
    speed: 0,
    uncertaintyRadius: 0
  };
  lastTickTime = 0;
  initialized = false;
  constructor(policy) {
    this.buffer = new SimpleNetworkBuffer();
    this.physics = new KinematicPhysicsModel();
    this.confidence = new TimeBasedConfidenceModel(policy);
    this.intent = new VarianceIntentModel();
  }
  input(packet) {
    this.buffer.push(packet);
    if (!this.initialized && packet.timestamp) {
      this.processObservation(packet);
      this.initialized = true;
      this.lastTickTime = packet.timestamp;
      this.lastTickTime = Date.now();
    }
  }
  getEstimate() {
    return {
      pose: this.currentPose,
      state: this.confidence.getState(),
      intent: this.intent.getIntent(),
      timestamp: this.lastTickTime
      // Virtual time
    };
  }
  tick(now) {
    if (!this.initialized) return;
    let packet = this.buffer.pop();
    while (packet) {
      this.processObservation(packet);
      packet = this.buffer.pop();
    }
    const dt = (now - this.lastTickTime) / 1e3;
    this.lastTickTime = now;
    if (dt <= 0) return;
    this.confidence.decay(dt);
    const state = this.confidence.getState();
    if (state === "FROZEN") {
      this.currentPose.speed = 0;
    } else {
      this.currentPose = this.physics.step(this.currentPose, dt);
    }
  }
  processObservation(packet) {
    this.physics.update(packet);
    this.confidence.update(packet);
    this.intent.update(packet);
    const observedLat = packet.lat;
    const observedLng = packet.lng;
    const blendFactor = this.initialized ? 0.5 : 1;
    const corrected = lerpPosition(
      { lat: this.currentPose.lat, lon: this.currentPose.lng },
      { lat: observedLat, lon: observedLng },
      blendFactor
    );
    this.currentPose.lat = corrected.lat;
    this.currentPose.lng = corrected.lon;
    if (packet.bearing !== void 0) {
      const angleBlend = this.initialized ? 0.5 : 1;
      this.currentPose.heading = lerpAngle(this.currentPose.heading, packet.bearing, angleBlend);
    }
    this.currentPose.uncertaintyRadius = 5;
  }
};

// src/engine/controllers/LiveMotionController.ts
var LiveMotionController = class {
  constructor(markerAdapter, policy) {
    this.markerAdapter = markerAdapter;
    this.policy = {
      fullConfidenceMs: 5e3,
      decayMs: 1e4,
      maxStaleMs: 15 * 60 * 1e3,
      ...policy
    };
  }
  // Map vehicle ID to its own Motion Engine brain
  engines = /* @__PURE__ */ new Map();
  liveAnimationFrameId = null;
  lastLiveFrameTime = 0;
  policy;
  /**
   * Updates the state of a vehicle/unit using the Motion Engine.
   */
  update(input) {
    const { id } = input;
    let engine = this.engines.get(id);
    if (!engine) {
      engine = new StandardMotionEngine(this.policy);
      this.engines.set(id, engine);
    }
    engine.input(input);
  }
  remove(id) {
    this.engines.delete(id);
  }
  start() {
    if (typeof window === "undefined") return;
    if (this.liveAnimationFrameId !== null) return;
    const animate = (time) => {
      if (!this.lastLiveFrameTime) this.lastLiveFrameTime = time;
      const now = Date.now();
      this.engines.forEach((engine, id) => {
        engine.tick(now);
        const estimate = engine.getEstimate();
        this.markerAdapter.setMarkerPosition(id, estimate.pose.lat, estimate.pose.lng);
        this.markerAdapter.setMarkerRotation?.(id, estimate.pose.heading);
        this.handleStateVisuals(id, estimate.state);
      });
      this.lastLiveFrameTime = time;
      this.liveAnimationFrameId = requestAnimationFrame(animate);
    };
    this.liveAnimationFrameId = requestAnimationFrame(animate);
  }
  handleStateVisuals(id, state) {
  }
  stop() {
    if (this.liveAnimationFrameId !== null) {
      cancelAnimationFrame(this.liveAnimationFrameId);
      this.liveAnimationFrameId = null;
      this.lastLiveFrameTime = 0;
    }
  }
  clear() {
    this.engines.clear();
  }
};

// src/engine/controllers/TripReplayController.ts
var DEFAULT_REPLAY_SVG_PATH = "M 0,-6 L 4,6 L 0,4 L -4,6 Z";
function buildSvgSymbol(bearing) {
  return {
    path: DEFAULT_REPLAY_SVG_PATH,
    rotation: bearing,
    scale: 3,
    fillOpacity: 1,
    strokeWeight: 1,
    strokeColor: "#000000",
    fillColor: "#FFFFFF",
    // White arrow
    anchor: new google.maps.Point(0, 0)
    // Centered
  };
}
var TripReplayController = class {
  constructor(map, google2) {
    this.map = map;
    this.google = google2;
  }
  tripMarkers = [];
  currentPolyline = null;
  vehicleMarker = null;
  // Data state
  coordinates = [];
  baseDuration = 0;
  // Animation state
  animationFrameId = null;
  isPaused = false;
  animationStartTime = 0;
  pausedTime = 0;
  totalAnimationTime = 0;
  animationPath = [];
  onFinish = null;
  lastPauseTime = 0;
  load(coordinates) {
    this.stop();
    this.coordinates = coordinates || [];
    this.drawPolyline(this.coordinates);
    if (this.coordinates.length >= 2) {
      const first = this.coordinates[0];
      const last = this.coordinates[this.coordinates.length - 1];
      if (first.ts && last.ts) {
        this.baseDuration = Number(last.ts) - Number(first.ts);
      } else if (first.timestamp && last.timestamp) {
        this.baseDuration = new Date(last.timestamp).getTime() - new Date(first.timestamp).getTime();
      } else {
        this.baseDuration = 1e4;
      }
    }
  }
  drawPolyline(coordinates) {
    this.clearPolyline();
    if (!coordinates || coordinates.length === 0) return;
    const path = [];
    const bounds = new this.google.maps.LatLngBounds();
    coordinates.forEach((coord) => {
      const lat = Number(coord.lat);
      const lng = Number(coord.lng || coord.lon);
      if (!isNaN(lat) && !isNaN(lng)) {
        const pos = { lat, lng };
        path.push(pos);
        bounds.extend(pos);
        if (coord.itemType === "alert") {
          let iconUrl = null;
          if (coord.type === "ignition_on") iconUrl = "/marker/marker-power-on.png";
          else if (coord.type === "ignition_off") iconUrl = "/marker/marker-power-off.png";
          if (iconUrl) {
            const marker = new this.google.maps.Marker({
              position: pos,
              map: this.map,
              icon: {
                url: iconUrl,
                scaledSize: new this.google.maps.Size(32, 32),
                anchor: new this.google.maps.Point(16, 16)
              },
              title: coord.type
            });
            this.tripMarkers.push(marker);
          }
        }
      }
    });
    this.currentPolyline = new this.google.maps.Polyline({
      path,
      geodesic: true,
      strokeColor: "#00FFFF",
      strokeOpacity: 1,
      strokeWeight: 4,
      map: this.map
    });
    this.map.fitBounds(bounds);
  }
  play(options = {}, onFinish) {
    if (!this.coordinates || this.coordinates.length < 2) return;
    this.stop();
    this.onFinish = onFinish || null;
    let duration = options.duration;
    if (!duration && options.speed) {
      duration = this.baseDuration / options.speed;
    }
    if (!duration) duration = 1e4;
    const rawPath = this.coordinates.map((c) => {
      let bearing = void 0;
      if (c.heading !== void 0) bearing = Number(c.heading);
      else if (c.course !== void 0) bearing = Number(c.course);
      else if (c.bearing !== void 0) bearing = Number(c.bearing);
      return {
        lat: Number(c.lat),
        lng: Number(c.lng || c.lon),
        bearing
      };
    }).filter((c) => !isNaN(c.lat) && !isNaN(c.lng));
    this.animationPath = this.prepareAnimationPath(rawPath, duration);
    this.animationStartTime = performance.now();
    this.pausedTime = 0;
    this.isPaused = false;
    if (!this.vehicleMarker) {
      this.vehicleMarker = new this.google.maps.Marker({
        map: this.map,
        zIndex: 1e3,
        icon: buildSvgSymbol(0)
      });
    } else {
      this.vehicleMarker.setMap(this.map);
    }
    if (this.animationPath.length > 0) {
      const firstSeg = this.animationPath[0];
      const start = firstSeg.type === "move" ? firstSeg.start : firstSeg.position;
      this.vehicleMarker.setPosition(start);
      if (firstSeg.type === "move" && firstSeg.bearing !== void 0) {
        this.vehicleMarker.setIcon(buildSvgSymbol(firstSeg.bearing));
      }
    }
    this.startAnimationLoop();
  }
  startAnimationLoop() {
    const animate = (time) => {
      if (this.isPaused) {
        return;
      }
      const elapsed = time - this.animationStartTime - this.pausedTime;
      if (elapsed >= this.totalAnimationTime) {
        const last = this.animationPath[this.animationPath.length - 1];
        const end = last.type === "move" ? last.end : last.position;
        if (this.vehicleMarker) {
          this.vehicleMarker.setPosition(end);
          if (last.type === "move" && last.bearing !== void 0) {
            this.vehicleMarker.setIcon(buildSvgSymbol(last.bearing));
          }
        }
        this.isPaused = true;
        this.onFinish?.();
        return;
      }
      const segment = this.animationPath.find((s) => elapsed >= s.startTime && elapsed < s.endTime);
      if (segment && this.vehicleMarker) {
        if (segment.type === "stop") {
          this.vehicleMarker.setPosition(segment.position);
        } else if (segment.type === "move") {
          const segElapsed = elapsed - segment.startTime;
          const progress = segElapsed / segment.duration;
          const lat = segment.start.lat + (segment.end.lat - segment.start.lat) * progress;
          const lng = segment.start.lng + (segment.end.lng - segment.start.lng) * progress;
          this.vehicleMarker.setPosition({ lat, lng });
          if (segment.bearing !== void 0) {
            this.vehicleMarker.setIcon(buildSvgSymbol(segment.bearing));
          }
        }
      }
      this.animationFrameId = requestAnimationFrame(animate);
    };
    this.animationFrameId = requestAnimationFrame(animate);
  }
  stop() {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    if (this.vehicleMarker) {
      this.vehicleMarker.setMap(null);
    }
    this.isPaused = false;
    this.pausedTime = 0;
  }
  pause() {
    if (this.isPaused || !this.animationFrameId) return;
    this.isPaused = true;
    this.lastPauseTime = performance.now();
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }
  resume() {
    if (!this.isPaused) return;
    this.isPaused = false;
    const now = performance.now();
    const pauseDuration = now - this.lastPauseTime;
    this.pausedTime += pauseDuration;
    this.startAnimationLoop();
  }
  clearPolyline() {
    if (this.currentPolyline) {
      this.currentPolyline.setMap(null);
      this.currentPolyline = null;
    }
    this.tripMarkers.forEach((m) => m.setMap(null));
    this.tripMarkers = [];
    this.stop();
  }
  prepareAnimationPath(rawPath, totalDuration) {
    const segments = [];
    const STOP_THRESHOLD = 5;
    const STOP_PAUSE_DURATION = 400;
    let currentStop = null;
    for (let i = 0; i < rawPath.length - 1; i++) {
      const p1 = rawPath[i];
      const p2 = rawPath[i + 1];
      const dist = haversineDistance(p1, p2);
      let bearing = 0;
      if (p1.bearing !== void 0) {
        bearing = p1.bearing;
      } else {
        bearing = computeBearing(p1.lat, p1.lng, p2.lat, p2.lng);
      }
      if (dist < STOP_THRESHOLD) {
        if (!currentStop) {
          currentStop = { type: "stop", position: p1, duration: STOP_PAUSE_DURATION, bearing };
          segments.push(currentStop);
        }
      } else {
        currentStop = null;
        segments.push({
          type: "move",
          start: p1,
          end: p2,
          distance: dist,
          duration: 0,
          bearing
        });
      }
    }
    const totalMoveDist = segments.filter((s) => s.type === "move").reduce((acc, s) => acc + s.distance, 0);
    const totalStopDur = segments.filter((s) => s.type === "stop").reduce((acc, s) => acc + s.duration, 0);
    const availableMoveTime = Math.max(1e3, totalDuration - totalStopDur);
    segments.forEach((s) => {
      if (s.type === "move") {
        s.duration = s.distance / totalMoveDist * availableMoveTime;
      }
    });
    let accumulated = 0;
    segments.forEach((s) => {
      s.startTime = accumulated;
      accumulated += s.duration;
      s.endTime = accumulated;
    });
    this.totalAnimationTime = accumulated;
    return segments;
  }
};

// src/providers/google/GoogleMapEngine.ts
function buildSvgIcon(config) {
  return {
    path: config.path,
    fillColor: config.fillColor || "#FFFFFF",
    fillOpacity: config.fillOpacity ?? 1,
    strokeColor: config.strokeColor || "transparent",
    strokeWeight: config.strokeWeight ?? 0,
    scale: config.scale ?? 1,
    anchor: config.anchor ? new google.maps.Point(config.anchor.x, config.anchor.y) : null
  };
}
var GoogleMapEngine = class extends MapEngine {
  map = null;
  googleApi = null;
  markers = /* @__PURE__ */ new Map();
  // Controllers
  liveController;
  tripController = null;
  markerAdapter;
  constructor(options) {
    super(options);
    const lastRotation = /* @__PURE__ */ new Map();
    this.markerAdapter = {
      setMarkerPosition: (id, lat, lng) => {
        const m = this.markers.get(id)?.marker;
        if (m && this.googleApi) {
          m.setPosition(new this.googleApi.maps.LatLng(lat, lng));
        }
      },
      setMarkerRotation: (id, bearing) => {
        const m = this.markers.get(id)?.marker;
        if (!m) return;
        const icon = m.getIcon();
        if (!icon) return;
        if (icon.url) return;
        if (typeof icon === "object" && icon.path) {
          const newIcon = { ...icon, rotation: bearing };
          m.setIcon(newIcon);
        }
        const prev = lastRotation.get(id);
        if (prev !== void 0 && Math.abs(prev - bearing) < 2) return;
        lastRotation.set(id, bearing);
      }
    };
    this.liveController = new LiveMotionController(this.markerAdapter, this.options.liveMotionPolicy);
    this.liveController.start();
  }
  async mount(element) {
    const apiKey = this.options.apiKey || import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      throw new Error("Google Maps API Key is required");
    }
    setOptions({
      key: apiKey,
      v: "weekly",
      libraries: ["places"]
    });
    await importLibrary("maps");
    await importLibrary("marker");
    this.googleApi = google;
    const initialTheme = this.options.theme || "modern";
    const styles = this.getStylesForTheme(initialTheme);
    const backgroundColor = this.getBackgroundColorForTheme(initialTheme);
    const mapOptions = {
      backgroundColor: this.options.backgroundColor || backgroundColor,
      center: this.options.center || { lat: 19.4326, lng: -99.1332 },
      zoom: this.options.zoom || 13,
      fullscreenControl: true,
      streetViewControl: this.options.streetViewControl ?? false,
      mapTypeControl: false,
      zoomControl: true,
      styles: styles || void 0,
      disableDefaultUI: true,
      ...this.options.mapOptions
    };
    const el = typeof element === "string" ? document.getElementById(element) : element;
    if (!el) throw new Error("Map container element not found");
    this.map = new this.googleApi.maps.Map(el, mapOptions);
    if (mapOptions.backgroundColor) {
      this.map.getDiv().style.backgroundColor = mapOptions.backgroundColor;
    }
    this.tripController = new TripReplayController(this.map, this.googleApi);
    return this.map;
  }
  getBackgroundColorForTheme(theme) {
    switch (theme) {
      case "modern":
        return "#0b1524";
      case "dark":
        return "#0B1524";
      case "light":
      default:
        return "#0F1115";
    }
  }
  getStylesForTheme(theme) {
    if (this.options.styles && this.options.styles[theme]) {
      return this.options.styles[theme];
    }
    return null;
  }
  onThemeChange(theme) {
    console.log("[GoogleMapEngine] onThemeChange called with:", theme);
    if (this.map) {
      const styles = this.getStylesForTheme(theme);
      const backgroundColor = this.getBackgroundColorForTheme(theme);
      const styleCount = styles ? `${styles.length} rules` : "Default (null)";
      console.log(`[GoogleMapEngine] Applying styles: ${styleCount}, bg: ${backgroundColor}`);
      this.map.setOptions({ styles, backgroundColor });
      this.map.getDiv().style.backgroundColor = backgroundColor;
    } else {
      console.warn("[GoogleMapEngine] Map not initialized, skipping theme update");
    }
  }
  adaptToInput(vehicle, lat, lng, id) {
    const motion = {};
    if (vehicle.alert === "Turn On") motion.ignition = "on";
    else if (vehicle.alert === "Turn Off") motion.ignition = "off";
    if (vehicle.engine_status !== void 0) {
      const status = String(vehicle.engine_status).toLowerCase();
      motion.moving = status === "1" || status === "true" || status === "on";
    }
    const input = {
      id,
      lat,
      lng,
      speedKmh: Number(vehicle.speed || 0),
      bearing: Number(vehicle.course || 0),
      motion
    };
    if (vehicle.ts) {
      input.timestamp = Number(vehicle.ts);
    } else if (vehicle.timestamp) {
      input.timestamp = Number(vehicle.timestamp);
    }
    return input;
  }
  addVehicleMarker(vehicle) {
    if (!this.map || !this.googleApi) return;
    const lat = Number(vehicle.lat || vehicle.latitude);
    const lng = Number(vehicle.lng || vehicle.longitude);
    const id = vehicle.id || vehicle.device_id || vehicle.deviceId;
    if (isNaN(lat) || isNaN(lng) || !id) {
      console.warn("Invalid coords or ID for vehicle", vehicle);
      return;
    }
    const position = { lat, lng };
    let iconConfig = { url: "" };
    if (this.options.iconResolver) {
      iconConfig = this.options.iconResolver(vehicle);
    }
    const markerOptions = {
      position,
      map: this.map,
      title: String(vehicle.device_id || id)
    };
    if (vehicle.icon) {
      markerOptions.icon = buildSvgIcon(vehicle.icon);
    } else if (iconConfig.url) {
      markerOptions.icon = {
        url: iconConfig.url,
        scaledSize: iconConfig.size ? new this.googleApi.maps.Size(iconConfig.size[0], iconConfig.size[1]) : null,
        anchor: iconConfig.anchor ? new this.googleApi.maps.Point(iconConfig.anchor[0], iconConfig.anchor[1]) : null
      };
    } else {
    }
    const marker = new this.googleApi.maps.Marker(markerOptions);
    let content = "";
    if (this.options.infoWindowRenderer) {
      content = this.options.infoWindowRenderer(vehicle);
    }
    const infoWindow = new this.googleApi.maps.InfoWindow({ content });
    marker.addListener("click", () => {
      infoWindow.open(this.map, marker);
    });
    this.markers.set(id, { marker, infoWindow });
    this.liveController.update(this.adaptToInput(vehicle, lat, lng, id));
  }
  updateVehicleMarker(vehicle) {
    const id = vehicle.id || vehicle.device_id || vehicle.deviceId;
    const existing = this.markers.get(id);
    if (!existing) {
      this.addVehicleMarker(vehicle);
      return;
    }
    const lat = Number(vehicle.lat || vehicle.latitude);
    const lng = Number(vehicle.lng || vehicle.longitude);
    if (!isNaN(lat) && !isNaN(lng)) {
      if (this.options.infoWindowRenderer) {
        existing.infoWindow.setContent(this.options.infoWindowRenderer(vehicle));
      }
      if (vehicle.icon) {
        existing.marker.setIcon(buildSvgIcon(vehicle.icon));
      } else if (this.options.iconResolver) {
        const iconConfig = this.options.iconResolver(vehicle);
        if (iconConfig.url) {
          existing.marker.setIcon({
            url: iconConfig.url,
            scaledSize: iconConfig.size ? new this.googleApi.maps.Size(iconConfig.size[0], iconConfig.size[1]) : null,
            anchor: iconConfig.anchor ? new this.googleApi.maps.Point(iconConfig.anchor[0], iconConfig.anchor[1]) : null
          });
        }
      }
      this.liveController.update(this.adaptToInput(vehicle, lat, lng, id));
    }
  }
  removeMarker(id) {
    const data = this.markers.get(id);
    if (data) {
      data.marker.setMap(null);
      this.markers.delete(id);
    }
    this.liveController.remove(id);
  }
  clearAllMarkers() {
    this.markers.forEach((data) => data.marker.setMap(null));
    this.markers.clear();
    this.liveController.clear();
  }
  startLive() {
    this.liveController.start();
  }
  stopLive() {
    this.liveController.stop();
  }
  centerOnVehicles(vehicles) {
    if (!this.map || !this.googleApi || !vehicles.length) return;
    const bounds = new this.googleApi.maps.LatLngBounds();
    let hasValid = false;
    vehicles.forEach((v) => {
      const lat = Number(v.lat || v.latitude);
      const lng = Number(v.lng || v.longitude);
      if (!isNaN(lat) && !isNaN(lng)) {
        bounds.extend({ lat, lng });
        hasValid = true;
      }
    });
    if (hasValid) {
      this.map.fitBounds(bounds);
    }
  }
  setCenter(lat, lng) {
    if (this.map) {
      this.map.setCenter({ lat, lng });
    }
  }
  setZoom(zoom) {
    if (this.map) {
      this.map.setZoom(zoom);
    }
  }
  // ==========================================
  // TRIP POLYLINE & ANIMATION DELEGATION
  // ==========================================
  drawTripPolyline(coordinates) {
    if (this.tripController) {
      this.tripController.drawPolyline(coordinates);
    }
  }
  clearTripPolyline() {
    if (this.tripController) {
      this.tripController.clearPolyline();
    }
  }
  stopTripAnimation() {
    if (this.tripController) {
      this.tripController.stop();
    }
  }
  animateTrip(coordinates, totalDuration = 1e4, onFinish) {
    if (this.tripController) {
      this.tripController.load(coordinates);
      this.tripController.play({ duration: totalDuration }, onFinish);
    }
  }
  dispose() {
    this.liveController.stop();
    if (this.tripController) {
      this.tripController.stop();
      this.tripController.clearPolyline();
    }
    this.clearAllMarkers();
    this.map = null;
  }
};
export {
  GoogleMapEngine,
  LiveMotionController,
  MapEngine,
  TripReplayController,
  computeBearing,
  extrapolatePosition,
  haversineDistance,
  lerpPosition
};
//# sourceMappingURL=index.js.map