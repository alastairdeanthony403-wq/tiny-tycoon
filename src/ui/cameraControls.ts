import type { Camera } from '../render/iso';
import type { AppApi } from './api';
import { el, toggle } from './dom';
import { t } from '../core/i18n';
import { CAMERA } from '../config/camera';

/**
 * Compact on-screen camera controls (an alternative to gestures). Always visible: Return to Shop,
 * the Shop Lock toggle, rotate left and right. "More" reveals zoom, tilt, reset and the drag mode.
 */
export class CameraControls {
  el: HTMLElement;
  private more: HTMLElement;
  private modeBtn: HTMLButtonElement;
  private lockBtn: HTMLButtonElement;
  private expanded = false;

  constructor(private app: AppApi, private camera: Camera, private onSettingsChanged: () => void) {
    const btn = (icon: string, label: string, onclick: () => void, extra: Record<string, string> = {}) =>
      el('button', { class: 'cam-btn', 'aria-label': label, title: label, onclick: () => { onclick(); this.app.sfx('click'); }, ...extra }, icon) as HTMLButtonElement;
    this.modeBtn = btn('', '', () => this.toggleMode(), { 'data-cam': 'mode' });
    // Shop Lock: shows (and switches) the camera's real mode; aria-pressed mirrors it
    this.lockBtn = btn('', '', () => this.toggleLock(), { 'data-cam': 'lock' });
    this.more = el(
      'div',
      { class: 'cam-more hidden', id: 'cam-more' },
      btn('＋', t('cam.zoom_in'), () => this.camera.zoomBy(CAMERA.zoomStep), { 'data-cam': 'zoom-in' }),
      btn('－', t('cam.zoom_out'), () => this.camera.zoomBy(1 / CAMERA.zoomStep), { 'data-cam': 'zoom-out' }),
      btn('⤒', t('cam.tilt_up'), () => this.camera.tiltBy(CAMERA.tiltStep), { 'data-cam': 'tilt-up' }),
      btn('⤓', t('cam.tilt_down'), () => this.camera.tiltBy(-CAMERA.tiltStep), { 'data-cam': 'tilt-down' }),
      btn('⛶', t('cam.frame'), () => this.camera.returnToShop(), { 'data-cam': 'frame' }),
      btn('🎯', t('cam.reset'), () => this.camera.resetView(), { 'data-cam': 'reset' }),
      this.modeBtn,
    );
    const moreBtn = btn('⋯', t('cam.more'), () => this.setExpanded(!this.expanded), { 'data-cam': 'more', 'aria-controls': 'cam-more', 'aria-expanded': 'false' });
    this.el = el(
      'div',
      { class: 'cam-ctrl', role: 'toolbar', 'aria-label': t('cam.label') },
      this.more,
      btn('🏪', t('cam.shop'), () => this.camera.returnToShop(), { 'data-cam': 'shop', class: 'cam-btn cam-shop' }),
      this.lockBtn,
      btn('⟲', t('cam.rotate_left'), () => this.camera.rotateBy(CAMERA.rotateStep), { 'data-cam': 'rotate-left' }),
      btn('⟳', t('cam.rotate_right'), () => this.camera.rotateBy(-CAMERA.rotateStep), { 'data-cam': 'rotate-right' }),
      moreBtn,
    );
    this.refresh();
  }

  private setExpanded(v: boolean): void {
    this.expanded = v;
    toggle(this.more, 'hidden', !v);
    this.el.querySelector('[data-cam="more"]')?.setAttribute('aria-expanded', String(v));
  }

  private toggleMode(): void {
    const s = this.app.game.state.settings;
    s.cameraDrag = s.cameraDrag === 'orbit' ? 'pan' : 'orbit';
    this.app.toast(t(s.cameraDrag === 'orbit' ? 'cam.mode_orbit_toast' : 'cam.mode_pan_toast'), s.cameraDrag === 'orbit' ? '🔄' : '✋');
    this.refresh();
    this.onSettingsChanged();
  }

  toggleLock(): void {
    const on = !this.camera.locked;
    this.camera.setLocked(on);
    this.app.toast(t(on ? 'cam.lock_on_toast' : 'cam.lock_off_toast'), on ? '🔒' : '🧭');
  }

  /** Re-read settings and the camera mode (drag mode and Shop Lock buttons). */
  refresh(): void {
    const locked = this.camera.locked;
    this.lockBtn.textContent = locked ? '🔒' : '🔓';
    this.lockBtn.setAttribute('aria-pressed', String(locked));
    this.lockBtn.classList.toggle('on', locked);
    const lockLabel = t(locked ? 'cam.lock_on' : 'cam.lock_off');
    this.lockBtn.setAttribute('aria-label', lockLabel);
    this.lockBtn.title = lockLabel;
    const orbit = this.app.game.state.settings.cameraDrag !== 'pan';
    // The button shows what one-finger drag will switch TO.
    this.modeBtn.textContent = orbit ? '✋' : '🔄';
    const label = orbit ? t('cam.mode_to_pan') : t('cam.mode_to_orbit');
    this.modeBtn.setAttribute('aria-label', label);
    this.modeBtn.title = label;
  }
}
