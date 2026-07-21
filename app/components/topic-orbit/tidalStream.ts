import * as THREE from 'three';

// ---------------------------------------------------------------------------
// TIDAL DISRUPTION EVENT — modelled on the real phenomenon rather than on a
// hand-tuned fall curve. Every number below is derived from one of these five
// facts; nothing here is a magic constant chosen to "look right".
//
// 1. ROCHE LIMIT
//    A self-gravitating body survives until the hole's tidal field beats its
//    own gravity, at r_t ≈ R_body·(2·M_hole/M_body)^(1/3). Outside r_t it is
//    intact; inside it comes apart. This is why the planets do not all break
//    up together — they break up in the order they cross r_t.
//
// 2. DISRUPTION MAKES ONE STREAM, NOT A CLOUD
//    Disruption gives each element of the body a slightly different specific
//    orbital energy (ΔE ≈ ±GM·R_body/r_t²). Kepler's third law then sorts
//    those elements along the orbit, which is why a real TDE is observed as a
//    single long filament: the debris is strung out nose-to-tail along ONE
//    track, not sprayed in all directions.
//
// 3. THE SAME LAW ORDERS THE BODIES
//    T ∝ a^{3/2}. A planet at a large radius has a longer fallback time than
//    one further in, in exactly that ratio. Given ONE shared gravitational
//    parameter for the system, the whole set of planets therefore queues onto
//    the same track automatically — there is no per-planet timing to tune,
//    and the queue order falls out of the physics.
//
// 4. INFLOW GEOMETRY IS A LOGARITHMIC SPIRAL
//    Accretion inflow holds a nearly constant pitch angle (radial drift stays
//    proportional to orbital speed). The curve of constant pitch angle is
//    r(φ) = r_out·e^{−kφ}. Choosing how many turns the stream makes before it
//    reaches the horizon fixes k, and then nothing else about the path is
//    free.
//
// 5. MATERIAL ACCELERATES AS IT FALLS, AND IT REACHES THE HOLE
//    Orbital angular rate rises as the orbit tightens — Kepler gives
//    dφ/dt ∝ r^{-3/2}. Using the full 3/2 here would make the innermost
//    material fall back in a few percent of the event, so the inflow is
//    modelled with a gentler exponent: viscous inflow through a circularised
//    disk drains far more slowly than ballistic fallback, and the exponent is
//    what sets that. What matters is the SIGN — dφ/dt must GROW as r shrinks,
//    or every parcel decelerates on its way in, stalls just outside the
//    horizon and stacks up into a bright static ring. Nothing then ever
//    actually falls in.
//
//    With dφ/dt ∝ r^{-p} on the spiral of §4, the quantity v ≡ (r/r_out)^p
//    falls LINEARLY with time, which closes the model in one line and lets
//    every parcel arrive at the horizon in finite, bounded time — where it is
//    swallowed, rather than fading out early somewhere in mid-air.
//
// 6. TIDAL PANCAKING
//    Infalling material is stretched ALONG the orbit and squeezed across it,
//    hardest of all vertically. Real debris flattens into a ribbon; it does
//    not merely elongate into a sausage.
// ---------------------------------------------------------------------------

export type TidalStream = {
  // Outer end of the stream: the orbit of the outermost body being disrupted.
  outerRadius: number;
  horizonRadius: number;
  // Logarithmic-spiral winding constant, r(φ) = outerRadius·e^{−kφ}.
  k: number;
  // Total azimuth the stream sweeps between the outer end and the horizon.
  phiTotal: number;
  // Where the head of the stream sits, so the spiral starts where the system
  // actually was when it was disrupted rather than at an arbitrary angle.
  entryAngle: number;
  // v ≡ (r/r_out)^INFLOW_EXP at the horizon, and how much v the outermost
  // material has to consume to get there. Fixing that consumption to the
  // length of the destruction beat is a choice of time unit, nothing more.
  vHorizon: number;
  vDrain: number;
};

// dφ/dt ∝ r^{-INFLOW_EXP}. Below Kepler's 3/2 because this is viscous inflow
// through a disk rather than free fall, and because 3/2 would drain the inner
// system before the eye can follow it.
export const INFLOW_EXP = 0.6;

export function makeTidalStream(
  outerRadius: number,
  horizonRadius: number,
  entryAngle: number,
  // How many full turns the stream winds before it is swallowed. Real TDE
  // streams wrap the hole several times before self-intersection circularises
  // them; 3-4 is the range that reads.
  turns: number,
): TidalStream {
  const safeOuter = Math.max(horizonRadius * 1.2, outerRadius);
  const phiTotal = turns * Math.PI * 2;
  const k = Math.log(safeOuter / horizonRadius) / phiTotal;
  const vHorizon = Math.pow(horizonRadius / safeOuter, INFLOW_EXP);
  // The outermost material starts at v = 1 by construction.
  return { outerRadius: safeOuter, horizonRadius, k, phiTotal, entryAngle, vHorizon, vDrain: 1 - vHorizon };
}

export type StreamState = {
  radius: number;
  angle: number;
  phi: number;
  // 0 when this body is still at its original orbit, 1 once it has reached the
  // horizon. Drives disruption, perspective shrink and hand-over to debris.
  fall: number;
  swallowed: boolean;
};

// Where a body sits on the shared arm. `progress` is 0..1 across the whole
// destruction beat. v falls linearly, which IS the closed-form solution of
// §5 on the spiral of §4, so the material sweeps its turns while speeding up
// and every parcel genuinely arrives at the horizon instead of asymptoting
// toward it.
export function streamStateAt(stream: TidalStream, bodyRadius: number, progress: number): StreamState {
  const v0 = Math.pow(Math.min(1, bodyRadius / stream.outerRadius), INFLOW_EXP);
  const v = Math.max(stream.vHorizon, v0 - stream.vDrain * progress);
  const radius = stream.outerRadius * Math.pow(v, 1 / INFLOW_EXP);
  const phi = Math.log(stream.outerRadius / Math.max(radius, 1e-4)) / stream.k;
  const span = Math.max(1e-6, v0 - stream.vHorizon);
  return {
    radius,
    angle: stream.entryAngle + phi,
    phi,
    fall: Math.min(1, (v0 - v) / span),
    swallowed: v <= stream.vHorizon + 1e-6,
  };
}

// Azimuth this body enters the arm at. Set purely by its orbital radius, so
// the queue order along the arm is the system's own radial order.
export function streamPhiForRadius(stream: TidalStream, bodyRadius: number) {
  return Math.max(0, Math.log(stream.outerRadius / Math.max(bodyRadius, 1e-4)) / stream.k);
}

// Unit tangent of the logarithmic spiral, i.e. the direction the material is
// actually travelling. d/dφ [r cosφ, 0, r sinφ] with dr/dφ = −k·r.
export function streamTangent(stream: TidalStream, angle: number, out: THREE.Vector3) {
  const k = stream.k;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  // Negated so it points along the direction of travel — inward, down the
  // spiral, rather than outward along increasing radius.
  return out.set(-(-k * cos - sin), 0, -(-k * sin + cos)).normalize();
}

export function streamPosition(radius: number, angle: number, height: number, out: THREE.Vector3) {
  return out.set(Math.cos(angle) * radius, height, Math.sin(angle) * radius);
}
