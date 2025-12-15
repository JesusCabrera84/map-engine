# Map Engine – Roadmap

This document describes the evolutionary roadmap of the `map-engine`.
Its purpose is to **preserve architectural intent**, avoid premature
over-engineering, and clearly separate *implemented capabilities*
from *future aspirations*.

---

## Current Status

**Version:** `v0.1.x`  
**Stage:** Live Motion Engine (Extrapolation-based)

The engine is currently optimized for:
- High visual smoothness
- Low cognitive overhead
- Real-time vehicle tracking
- Frontend-only execution
- Backend-agnostic data contracts

This is a **deliberate stopping point**.

---

## Stage 1 – Extraction & Stabilization ✅ (Completed)

### Goal
Extract existing map and motion logic into a reusable, isolated engine
without altering observable behavior.

### Delivered
- `MapEngine` abstract base
- Concrete implementation (`GoogleMapEngine`)
- Marker lifecycle management
- SVG-based directional markers
- InfoWindow rendering hooks
- Live motion smoothing
- Bearing calculation & rotation
- Teleport detection
- Graceful stop handling
- No business logic
- No persistence
- No backend assumptions

### Outcome
A clean, reusable engine that mirrors existing production behavior.

---

## Stage 2 – Visual Intelligence Layer 🟡 (Completed – Pragmatic)

### Goal
Improve perceived motion quality and visual stability while keeping
the engine deterministic and predictable.

### Delivered
- `LiveMotionController`
- `TripReplayController`
- Decoupled input model (`LiveMotionInput`)
- Dead-reckoning with confidence decay
- Prediction window with tunable policy
- Drift correction
- Smooth rotational interpolation
- Motion state inference (moving / stopped)
- Signal staleness handling
- Replay animation with stops and pauses

### Explicit Non-Goals
- No semantic message classification
- No routing awareness
- No AI or probabilistic modeling
- No backend reconciliation

This stage intentionally favors **pragmatism over abstraction**.

---

## Stage 3 – Predictive Motion Engine 🔵 (Planned – NOT Implemented)

> **This stage is intentionally deferred.**

Stage 3 introduces **anticipation**, not just extrapolation.

### Core Principle
The engine no longer asks *“where was the vehicle?”*  
It asks *“where is the vehicle likely going?”*

---

### Planned Capabilities

#### 1. Explicit Prediction State
Introduce a cognitive motion mode:
- `real`
- `predicted`
- `coasting`
- `frozen`

Used to:
- Drive rendering decisions
- Expose uncertainty to the UI
- Avoid implicit behavior

---

#### 2. Separation of Physics and Confidence
Decouple:
- Physical motion (speed, heading)
- Epistemic confidence (trust in data)

Enables:
- Continued motion under uncertainty
- Visual freezing without physical stop
- Better handling of jamming and signal loss

---

#### 3. Intent Modeling
Track heading stability over time:
- Heading variance
- Straight-line probability
- Turn confidence

Allows:
- Rejecting isolated noisy turns
- Smoother urban movement
- Early anticipation of maneuvers

---

#### 4. Unified Motion Engine
Single motion core shared by:
- Live tracking
- Replay
- Simulation

Only the **time source** changes:
- Live → `requestAnimationFrame`
- Replay → timeline clock

---

#### 5. Network Awareness
Account for:
- Packet jitter
- Timestamp skew
- Message reordering
- Late arrivals

Required for:
- High-latency environments
- Multi-region backends
- Forensic accuracy

---

#### 6. Semantic Constraint Layer
Before map snapping:
- Constrain motion based on intent
- Suppress impossible turns
- Enforce directional continuity

Road/OSRM integration comes **after** this layer.

---

#### 7. Visual Uncertainty Representation
Expose uncertainty honestly:
- Direction cones
- Opacity decay
- Ghost markers

This is not cosmetic — it reflects mathematical confidence.

---

## Explicitly Out of Scope (Until Stage 3)

- Roads API / OSRM snapping
- Machine learning models
- Historical persistence
- Backend authority resolution
- Fraud / theft inference
- Risk analytics

---

## When to Revisit Stage 3

Stage 3 should only be considered when:
- GPS jamming becomes common
- Signal loss exceeds acceptable UX thresholds
- Forensic replay accuracy is required
- Premium or security-sensitive clients demand it
- Backend latency becomes unpredictable
- Motion ambiguity creates user distrust

Until then, Stage 2 is the **correct engineering choice**.

---

## Design Philosophy

> Precision is not accuracy.  
> Smoothness is not intelligence.  
> Prediction is not extrapolation.

The map-engine evolves **only when the problem demands it**.

---

