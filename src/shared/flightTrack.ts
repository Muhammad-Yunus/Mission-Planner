export interface WaypointNode {
  seq: number;
  lat: number;
  lng: number;
  alt: number;
}

export interface LatLngLiteral {
  lat: number;
  lng: number;
}

export interface TrackSample {
  lat: number;
  lng: number;
  alt: number;
  headingDeg: number;
  nearestWaypointSeq: number;
}

interface RowEndpoints {
  rowIndex: number;
  start: LatLngLiteral;
  mid: LatLngLiteral;
  end: LatLngLiteral;
}

const DEFAULT_CENTER_LAT = 46.54354;
const DEFAULT_CENTER_LNG = 6.51716;

// Sweep axis (~15 deg NNE): projects cleanly ~22 deg UP-RIGHT on the 315 deg NW tilted map
const SWEEP_LAT = 0.00125;
const SWEEP_LNG = 0.00048;

// Cross-track axis (strictly perpendicular to sweep in metric ground plane): steps DOWN-RIGHT
const STEP_LAT = -0.000052;
const STEP_LNG = 0.00028;

// Subtle field contour across the 11 parallel rows matching the reference screenshot
const ROW_SCALES: Array<{ left: number; right: number }> = [
  { left: 0.78, right: 0.78 }, // Row 0: WP 1, 2, 3
  { left: 0.90, right: 0.88 }, // Row 1: 4, 5
  { left: 0.98, right: 0.96 }, // Row 2: 6, 7
  { left: 1.04, right: 1.02 }, // Row 3: 8, 9
  { left: 1.04, right: 1.04 }, // Row 4: 10, 11
  { left: 1.00, right: 1.04 }, // Row 5: 12, 13
  { left: 0.96, right: 0.98 }, // Row 6: 14, 15
  { left: 0.90, right: 0.94 }, // Row 7: 16, 17
  { left: 0.84, right: 0.88 }, // Row 8: 18, 19
  { left: 0.76, right: 0.82 }, // Row 9: 20, 21
  { left: 0.68, right: 0.76 }, // Row 10: 22, 23
];

function computeRowEndpoints(): RowEndpoints[] {
  const rows: RowEndpoints[] = [];
  const totalRows = ROW_SCALES.length;
  const halfRows = (totalRows - 1) / 2;

  for (let r = 0; r < totalRows; r++) {
    const offset = r - halfRows;
    const rowCenterLat = DEFAULT_CENTER_LAT + offset * STEP_LAT;
    const rowCenterLng = DEFAULT_CENTER_LNG + offset * STEP_LNG;
    const { left, right } = ROW_SCALES[r];

    const leftPt = {
      lat: Number((rowCenterLat - SWEEP_LAT * left).toFixed(6)),
      lng: Number((rowCenterLng - SWEEP_LNG * left).toFixed(6)),
    };
    const rightPt = {
      lat: Number((rowCenterLat + SWEEP_LAT * right).toFixed(6)),
      lng: Number((rowCenterLng + SWEEP_LNG * right).toFixed(6)),
    };

    const evenRow = r % 2 === 0;
    const start = evenRow ? leftPt : rightPt;
    const end = evenRow ? rightPt : leftPt;
    const mid = {
      lat: Number(((start.lat + end.lat) / 2).toFixed(6)),
      lng: Number(((start.lng + end.lng) / 2).toFixed(6)),
    };

    rows.push({ rowIndex: r, start, mid, end });
  }

  return rows;
}

/**
 * Generates the exact 23-waypoint serpentine mapping grid:
 * Row 0: 1 (start), 2 (mid), 3 (end)
 * Rows 1..10: 4,5 | 6,7 | 8,9 | 10,11 | 12,13 | 14,15 | 16,17 | 18,19 | 20,21 | 22,23
 */
export function generateRoute17Waypoints(altitudeM = 118.3): WaypointNode[] {
  const rows = computeRowEndpoints();
  const wps: WaypointNode[] = [];
  let seq = 1;

  for (const row of rows) {
    if (row.rowIndex === 0) {
      wps.push({ seq: seq++, lat: row.start.lat, lng: row.start.lng, alt: altitudeM });
    }
    wps.push({ seq: seq++, lat: row.mid.lat, lng: row.mid.lng, alt: altitudeM });
    wps.push({ seq: seq++, lat: row.end.lat, lng: row.end.lng, alt: altitudeM });
  }

  return wps;
}

function toLocalMeters(pt: LatLngLiteral, origin: LatLngLiteral) {
  const cosLat = Math.cos((origin.lat * Math.PI) / 180);
  const metersPerDegLat = 111_320;
  const metersPerDegLng = 111_320 * cosLat;
  return {
    x: (pt.lng - origin.lng) * metersPerDegLng,
    y: (pt.lat - origin.lat) * metersPerDegLat,
  };
}

function fromLocalMeters(m: { x: number; y: number }, origin: LatLngLiteral): LatLngLiteral {
  const cosLat = Math.cos((origin.lat * Math.PI) / 180);
  const metersPerDegLat = 111_320;
  const metersPerDegLng = 111_320 * cosLat;
  return {
    lat: Number((origin.lat + m.y / metersPerDegLat).toFixed(6)),
    lng: Number((origin.lng + m.x / metersPerDegLng).toFixed(6)),
  };
}

function cubicBezierXY(
  p0: { x: number; y: number },
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  p3: { x: number; y: number },
  t: number
) {
  const u = 1 - t;
  return {
    x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
    y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
  };
}

function quadraticBezierXY(
  p0: { x: number; y: number },
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  t: number
) {
  const u = 1 - t;
  return {
    x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
    y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y,
  };
}

export function computeCompassHeading(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const dLon = toRad(lng2 - lng1);
  const y = Math.sin(dLon) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

export function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getWaypointCentroid(waypoints: WaypointNode[]): LatLngLiteral {
  if (waypoints.length === 0) {
    return { lat: DEFAULT_CENTER_LAT, lng: DEFAULT_CENTER_LNG };
  }
  const sum = waypoints.reduce(
    (acc, w) => ({ lat: acc.lat + w.lat, lng: acc.lng + w.lng }),
    { lat: 0, lng: 0 }
  );
  return {
    lat: sum.lat / waypoints.length,
    lng: sum.lng / waypoints.length,
  };
}

/**
 * Smooth filleted polyline path for freehand / custom-drawn waypoint routes.
 * Rounds every interior corner smoothly with quadratic Bezier fillets while keeping legs straight.
 */
function buildCustomFilletedTrack(waypoints: WaypointNode[]): {
  entryPoints: LatLngLiteral[];
  missionSamples: TrackSample[];
  exitPoints: LatLngLiteral[];
} {
  if (waypoints.length === 0) {
    return { entryPoints: [], missionSamples: [], exitPoints: [] };
  }
  if (waypoints.length === 1) {
    return {
      entryPoints: [],
      missionSamples: [
        {
          lat: waypoints[0].lat,
          lng: waypoints[0].lng,
          alt: waypoints[0].alt,
          headingDeg: 0,
          nearestWaypointSeq: waypoints[0].seq,
        },
      ],
      exitPoints: [],
    };
  }

  const origin = getWaypointCentroid(waypoints);
  const ptsM = waypoints.map((w) => toLocalMeters(w, origin));
  const rawPoints: Array<{ lat: number; lng: number; alt: number; seq: number }> = [];

  if (waypoints.length === 2) {
    const steps = 16;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const xy = {
        x: ptsM[0].x + (ptsM[1].x - ptsM[0].x) * t,
        y: ptsM[0].y + (ptsM[1].y - ptsM[0].y) * t,
      };
      const geo = fromLocalMeters(xy, origin);
      rawPoints.push({
        lat: geo.lat,
        lng: geo.lng,
        alt: waypoints[0].alt + (waypoints[1].alt - waypoints[0].alt) * t,
        seq: t < 0.5 ? waypoints[0].seq : waypoints[1].seq,
      });
    }
  } else {
    let cursor = ptsM[0];
    const startGeo = fromLocalMeters(cursor, origin);
    rawPoints.push({ lat: startGeo.lat, lng: startGeo.lng, alt: waypoints[0].alt, seq: waypoints[0].seq });

    for (let i = 1; i < ptsM.length - 1; i++) {
      const prev = ptsM[i - 1];
      const curr = ptsM[i];
      const next = ptsM[i + 1];

      const vIn = { x: curr.x - prev.x, y: curr.y - prev.y };
      const lenIn = Math.hypot(vIn.x, vIn.y) || 1;
      const vOut = { x: next.x - curr.x, y: next.y - curr.y };
      const lenOut = Math.hypot(vOut.x, vOut.y) || 1;

      const uIn = { x: vIn.x / lenIn, y: vIn.y / lenIn };
      const uOut = { x: vOut.x / lenOut, y: vOut.y / lenOut };

      // Fillet radius proportional to local leg lengths so turns look smooth & never self-intersect
      const fillet = Math.min(28, lenIn * 0.35, lenOut * 0.35);
      const enterPt = { x: curr.x - uIn.x * fillet, y: curr.y - uIn.y * fillet };
      const exitPt = { x: curr.x + uOut.x * fillet, y: curr.y + uOut.y * fillet };

      const legSteps = 10;
      for (let s = 1; s <= legSteps; s++) {
        const t = s / legSteps;
        const xy = {
          x: cursor.x + (enterPt.x - cursor.x) * t,
          y: cursor.y + (enterPt.y - cursor.y) * t,
        };
        const geo = fromLocalMeters(xy, origin);
        rawPoints.push({
          lat: geo.lat,
          lng: geo.lng,
          alt: waypoints[i].alt,
          seq: t < 0.5 ? waypoints[i - 1].seq : waypoints[i].seq,
        });
      }

      const arcSteps = 12;
      for (let a = 1; a <= arcSteps; a++) {
        const t = a / arcSteps;
        const xy = quadraticBezierXY(enterPt, curr, exitPt, t);
        const geo = fromLocalMeters(xy, origin);
        rawPoints.push({
          lat: geo.lat,
          lng: geo.lng,
          alt: waypoints[i].alt,
          seq: waypoints[i].seq,
        });
      }

      cursor = exitPt;
    }

    const lastIdx = ptsM.length - 1;
    const endPt = ptsM[lastIdx];
    const tailSteps = 10;
    for (let s = 1; s <= tailSteps; s++) {
      const t = s / tailSteps;
      const xy = {
        x: cursor.x + (endPt.x - cursor.x) * t,
        y: cursor.y + (endPt.y - cursor.y) * t,
      };
      const geo = fromLocalMeters(xy, origin);
      rawPoints.push({
        lat: geo.lat,
        lng: geo.lng,
        alt: waypoints[lastIdx].alt,
        seq: t < 0.5 ? waypoints[lastIdx - 1].seq : waypoints[lastIdx].seq,
      });
    }
  }

  const missionSamples: TrackSample[] = rawPoints.map((pt, idx) => {
    const prev = rawPoints[Math.max(0, idx - 1)];
    const next = rawPoints[Math.min(rawPoints.length - 1, idx + 1)];
    const headingDeg =
      prev.lat === next.lat && prev.lng === next.lng
        ? 0
        : computeCompassHeading(prev.lat, prev.lng, next.lat, next.lng);
    return {
      lat: pt.lat,
      lng: pt.lng,
      alt: pt.alt,
      headingDeg,
      nearestWaypointSeq: pt.seq,
    };
  });

  return { entryPoints: [], missionSamples, exitPoints: [] };
}

/**
 * Generates dense C1-continuous geographic track points:
 * - For survey missions ('Horizontal mapp.' / 'Linear corridor' with odd waypoint count >= 3):
 *   straight parallel sweeps + metric-accurate 180-deg circular Bezier U-turns.
 * - For freehand custom paths ('Custom path'):
 *   straight legs joined by smooth filleted Bezier corners.
 */
export function buildSmoothFlightTrack(
  waypoints: WaypointNode[],
  missionType = 'Horizontal mapp.'
): {
  entryPoints: LatLngLiteral[];
  missionSamples: TrackSample[];
  exitPoints: LatLngLiteral[];
} {
  if (missionType === 'Custom path' || waypoints.length < 3 || waypoints.length % 2 === 0) {
    return buildCustomFilletedTrack(waypoints);
  }

  const rows: Array<{
    start: LatLngLiteral;
    mid: LatLngLiteral;
    end: LatLngLiteral;
    startSeq: number;
    midSeq: number;
    endSeq: number;
  }> = [];

  rows.push({
    start: { lat: waypoints[0].lat, lng: waypoints[0].lng },
    mid: { lat: waypoints[1].lat, lng: waypoints[1].lng },
    end: { lat: waypoints[2].lat, lng: waypoints[2].lng },
    startSeq: waypoints[0].seq,
    midSeq: waypoints[1].seq,
    endSeq: waypoints[2].seq,
  });

  for (let i = 3; i + 1 < waypoints.length; i += 2) {
    const prevRow = rows[rows.length - 1];
    const midWp = waypoints[i];
    const endWp = waypoints[i + 1];
    const start = {
      lat: 2 * midWp.lat - endWp.lat,
      lng: 2 * midWp.lng - endWp.lng,
    };
    rows.push({
      start,
      mid: { lat: midWp.lat, lng: midWp.lng },
      end: { lat: endWp.lat, lng: endWp.lng },
      startSeq: prevRow.endSeq,
      midSeq: midWp.seq,
      endSeq: endWp.seq,
    });
  }

  const origin = getWaypointCentroid(waypoints);
  const rawPoints: Array<{ lat: number; lng: number; alt: number; seq: number }> = [];
  const defaultAlt = waypoints[0]?.alt ?? 118.3;

  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    const sweepSteps = 12;
    for (let s = 0; s <= sweepSteps; s++) {
      const t = s / sweepSteps;
      const lat = row.start.lat + (row.end.lat - row.start.lat) * t;
      const lng = row.start.lng + (row.end.lng - row.start.lng) * t;
      const seq = t < 0.25 ? row.startSeq : t < 0.75 ? row.midSeq : row.endSeq;
      rawPoints.push({ lat, lng, alt: defaultAlt, seq });
    }

    if (r + 1 < rows.length) {
      const nextRow = rows[r + 1];
      const pStart = toLocalMeters(row.start, origin);
      const pEnd = toLocalMeters(row.end, origin);
      const nStart = toLocalMeters(nextRow.start, origin);
      const nEnd = toLocalMeters(nextRow.end, origin);

      const uVec = { x: pEnd.x - pStart.x, y: pEnd.y - pStart.y };
      const uLen = Math.hypot(uVec.x, uVec.y) || 1;
      const u = { x: uVec.x / uLen, y: uVec.y / uLen };

      const vVec = { x: nEnd.x - nStart.x, y: nEnd.y - nStart.y };
      const vLen = Math.hypot(vVec.x, vVec.y) || 1;
      const v = { x: vVec.x / vLen, y: vVec.y / vLen };

      const delta = { x: nStart.x - pEnd.x, y: nStart.y - pEnd.y };
      const along = delta.x * u.x + delta.y * u.y;
      const cross = Math.abs(-u.y * delta.x + u.x * delta.y);

      const baseHandle = Math.max(14, cross * 0.68);
      const bulge1 = baseHandle + Math.max(0, along * 0.85);
      const bulge2 = baseHandle + Math.max(0, -along * 0.85);

      const c1 = { x: pEnd.x + u.x * bulge1, y: pEnd.y + u.y * bulge1 };
      const c2 = { x: nStart.x - v.x * bulge2, y: nStart.y - v.y * bulge2 };

      const arcSteps = 16;
      for (let a = 1; a < arcSteps; a++) {
        const xy = cubicBezierXY(pEnd, c1, c2, nStart, a / arcSteps);
        const geo = fromLocalMeters(xy, origin);
        rawPoints.push({
          lat: geo.lat,
          lng: geo.lng,
          alt: defaultAlt,
          seq: row.endSeq,
        });
      }
    }
  }

  // Smooth entry & exit approach legs for survey mapping routes
  const entryPoints: LatLngLiteral[] = [];
  const exitPoints: LatLngLiteral[] = [];

  if (rows.length > 0 && waypoints.length === 23) {
    const first = rows[0];
    const fStart = toLocalMeters(first.start, origin);
    const fEnd = toLocalMeters(first.end, origin);
    const fVec = { x: fEnd.x - fStart.x, y: fEnd.y - fStart.y };
    const fLen = Math.hypot(fVec.x, fVec.y) || 1;
    const fu = { x: fVec.x / fLen, y: fVec.y / fLen };
    const eStart = { x: fStart.x + 150, y: fStart.y - 260 };
    const eCtrl1 = { x: fStart.x + 25, y: fStart.y - 120 };
    const eCtrl2 = { x: fStart.x - fu.x * 65, y: fStart.y - fu.y * 65 };
    for (let i = 0; i <= 18; i++) {
      entryPoints.push(fromLocalMeters(cubicBezierXY(eStart, eCtrl1, eCtrl2, fStart, i / 18), origin));
    }

    const last = rows[rows.length - 1];
    const lStart = toLocalMeters(last.start, origin);
    const lEnd = toLocalMeters(last.end, origin);
    const lVec = { x: lEnd.x - lStart.x, y: lEnd.y - lStart.y };
    const lLen = Math.hypot(lVec.x, lVec.y) || 1;
    const lu = { x: lVec.x / lLen, y: lVec.y / lLen };
    const xCtrl1 = { x: lEnd.x + lu.x * 75, y: lEnd.y + lu.y * 75 };
    const xCtrl2 = { x: lEnd.x + 40, y: lEnd.y + 210 };
    const xEnd = { x: lEnd.x + 280, y: lEnd.y + 320 };
    for (let i = 0; i <= 18; i++) {
      exitPoints.push(fromLocalMeters(cubicBezierXY(lEnd, xCtrl1, xCtrl2, xEnd, i / 18), origin));
    }
  }

  const missionSamples: TrackSample[] = rawPoints.map((pt, idx) => {
    const prev = rawPoints[Math.max(0, idx - 1)];
    const next = rawPoints[Math.min(rawPoints.length - 1, idx + 1)];
    const headingDeg = computeCompassHeading(prev.lat, prev.lng, next.lat, next.lng);
    return {
      lat: pt.lat,
      lng: pt.lng,
      alt: pt.alt,
      headingDeg,
      nearestWaypointSeq: pt.seq,
    };
  });

  return { entryPoints, missionSamples, exitPoints };
}

/**
 * Generates parallel serpentine mapping waypoints clipped inside an arbitrary drawn polygon.
 * Emits Row 0: [start, mid, end] and Rows 1..N: [mid, end] so buildSmoothFlightTrack
 * renders smooth rounded 180-deg U-turns automatically.
 */
export function generateSurveyGridFromPolygon(
  polygon: LatLngLiteral[],
  options: {
    spacingM?: number;
    altitudeM?: number;
    perpendicular?: boolean;
    reverse?: boolean;
  } = {}
): {
  waypoints: WaypointNode[];
  areaHa: number;
  areaKm: number;
} {
  if (polygon.length < 3) {
    return { waypoints: [], areaHa: 0, areaKm: 0 };
  }

  const origin = {
    lat: polygon.reduce((s, p) => s + p.lat, 0) / polygon.length,
    lng: polygon.reduce((s, p) => s + p.lng, 0) / polygon.length,
  };
  const polyM = polygon.map((p) => toLocalMeters(p, origin));

  // Shoelace polygon area in square meters
  let areaSqM = 0;
  for (let i = 0; i < polyM.length; i++) {
    const a = polyM[i];
    const b = polyM[(i + 1) % polyM.length];
    areaSqM += a.x * b.y - b.x * a.y;
  }
  areaSqM = Math.abs(areaSqM) / 2;
  const areaHa = Number((areaSqM / 10_000).toFixed(2));
  const areaKm = Number((areaSqM / 1_000_000).toFixed(3));

  // Align primary sweep angle with the longest edge of the polygon
  let bestLen = 0;
  let sweepAngle = 0;
  for (let i = 0; i < polyM.length; i++) {
    const a = polyM[i];
    const b = polyM[(i + 1) % polyM.length];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len > bestLen) {
      bestLen = len;
      sweepAngle = Math.atan2(dy, dx);
    }
  }
  if (options.perpendicular) {
    sweepAngle += Math.PI / 2;
  }

  const cosA = Math.cos(-sweepAngle);
  const sinA = Math.sin(-sweepAngle);
  const rotPoly = polyM.map((p) => ({
    u: p.x * cosA - p.y * sinA,
    v: p.x * sinA + p.y * cosA,
  }));

  let minV = Infinity;
  let maxV = -Infinity;
  for (const p of rotPoly) {
    if (p.v < minV) minV = p.v;
    if (p.v > maxV) maxV = p.v;
  }

  const requestedSpacing = Math.max(12, options.spacingM ?? 38);
  const spanV = maxV - minV;
  const effectiveSpacing = spanV / requestedSpacing > 20 ? spanV / 20 : requestedSpacing;

  const scanlines: Array<{ start: LatLngLiteral; mid: LatLngLiteral; end: LatLngLiteral }> = [];
  const startV = minV + Math.min(effectiveSpacing * 0.4, spanV * 0.15);

  const cosBack = Math.cos(sweepAngle);
  const sinBack = Math.sin(sweepAngle);
  const toGeo = (u: number, v: number) =>
    fromLocalMeters({ x: u * cosBack - v * sinBack, y: u * sinBack + v * cosBack }, origin);

  let rowIdx = 0;
  for (let v = startV; v < maxV - 2; v += effectiveSpacing) {
    const intersections: number[] = [];
    for (let i = 0; i < rotPoly.length; i++) {
      const a = rotPoly[i];
      const b = rotPoly[(i + 1) % rotPoly.length];
      if ((a.v <= v && b.v > v) || (b.v <= v && a.v > v)) {
        const t = (v - a.v) / (b.v - a.v);
        intersections.push(a.u + t * (b.u - a.u));
      }
    }
    intersections.sort((x, y) => x - y);
    if (intersections.length >= 2) {
      const uMin = intersections[0];
      const uMax = intersections[intersections.length - 1];
      if (uMax - uMin < 6) continue;

      const forward = options.reverse ? rowIdx % 2 === 1 : rowIdx % 2 === 0;
      const uStart = forward ? uMin : uMax;
      const uEnd = forward ? uMax : uMin;
      const uMid = (uStart + uEnd) / 2;

      scanlines.push({
        start: toGeo(uStart, v),
        mid: toGeo(uMid, v),
        end: toGeo(uEnd, v),
      });
      rowIdx++;
    }
  }

  const alt = options.altitudeM ?? 118.3;
  const waypoints: WaypointNode[] = [];
  let seq = 1;
  scanlines.forEach((line, idx) => {
    if (idx === 0) {
      waypoints.push({ seq: seq++, lat: line.start.lat, lng: line.start.lng, alt });
    }
    waypoints.push({ seq: seq++, lat: line.mid.lat, lng: line.mid.lng, alt });
    waypoints.push({ seq: seq++, lat: line.end.lat, lng: line.end.lng, alt });
  });

  return { waypoints, areaHa, areaKm };
}

/**
 * Computes flight distance, duration, photo count, and centroid for any waypoint mission.
 */
export function computeMissionPathStats(
  waypoints: WaypointNode[],
  missionType: string,
  photoIntervalM = 50,
  polygonArea?: { areaHa: number; areaKm: number }
): {
  estFlightDistanceM: number;
  estFlightTime: string;
  photosCount: number;
  waypointsCount: number;
  areaHa: number;
  areaKm: number;
  centerLat: number;
  centerLng: number;
} {
  const { missionSamples } = buildSmoothFlightTrack(waypoints, missionType);
  let distM = 0;
  for (let i = 1; i < missionSamples.length; i++) {
    distM += haversineMeters(
      missionSamples[i - 1].lat,
      missionSamples[i - 1].lng,
      missionSamples[i].lat,
      missionSamples[i].lng
    );
  }
  const estFlightDistanceM = Math.max(0, Math.round(distM));
  // UAV survey cruise ~13.8 m/s
  const totalSec = Math.max(1, Math.round(estFlightDistanceM / 13.8));
  const hrs = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  const estFlightTime = `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  const photosCount = Math.max(1, Math.round(estFlightDistanceM / Math.max(5, photoIntervalM)));
  const centroid = getWaypointCentroid(waypoints);

  let areaHa = polygonArea?.areaHa ?? 0;
  let areaKm = polygonArea?.areaKm ?? 0;
  if (!polygonArea && waypoints.length >= 2) {
    let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
    for (const w of waypoints) {
      if (w.lat < minLat) minLat = w.lat;
      if (w.lat > maxLat) maxLat = w.lat;
      if (w.lng < minLng) minLng = w.lng;
      if (w.lng > maxLng) maxLng = w.lng;
    }
    const widthM = haversineMeters(minLat, minLng, minLat, maxLng);
    const heightM = haversineMeters(minLat, minLng, maxLat, minLng);
    const sqM = widthM * heightM;
    areaHa = Number((sqM / 10_000).toFixed(1));
    areaKm = Number((sqM / 1_000_000).toFixed(2));
  }

  return {
    estFlightDistanceM,
    estFlightTime,
    photosCount,
    waypointsCount: waypoints.length,
    areaHa,
    areaKm,
    centerLat: Number(centroid.lat.toFixed(6)),
    centerLng: Number(centroid.lng.toFixed(6)),
  };
}
