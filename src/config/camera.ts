/** Camera limits and feel (balance values; all angles in degrees). */
export const CAMERA = {
  /** Yaw is unlimited (full 360°, wraps seamlessly). 0 = the classic isometric view. */
  defaultYaw: 0,
  /** Pitch = angle between the ground and the view direction. 30° is the classic 2:1 isometric look. */
  defaultPitch: 30,
  minPitch: 20,
  maxPitch: 60,
  /** Player zoom on top of the automatic "fit the shop" zoom. */
  minZoom: 0.5,
  maxZoom: 3,
  /** Hard cap on the final on-screen scale, so zooming in never becomes unusable. */
  maxAbsoluteZoom: 3.2,
  /** Pan limit around the shop centre, in tiles beyond half the shop size. */
  panMarginTiles: 3,
  /** Degrees of yaw per CSS pixel of horizontal drag (× sensitivity). */
  dragYawPerPx: 0.4,
  /** Degrees of pitch per CSS pixel of vertical drag (× sensitivity). */
  dragPitchPerPx: 0.25,
  /** Step for the rotate buttons / Q E keys. */
  rotateStep: 45,
  tiltStep: 10,
  zoomStep: 1.2,
  /** Exponential smoothing: fraction of the gap left after one second (smaller = snappier). */
  smoothing: 0.0015,
  sensitivities: [0.5, 1, 1.6] as const,
};
