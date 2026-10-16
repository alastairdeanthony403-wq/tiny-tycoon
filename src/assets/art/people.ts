import type { AssetDef } from '../types';
import { ART } from '../spec';
import { drawCharacter } from './characters';
import { ARCHETYPES, STAFF_LOOKS, OUTFITS, customerAppearance, staffAppearance, type ArchetypeId } from '../characters';

/**
 * Registry entries for people. In the world characters are drawn live (they animate and face the
 * camera); these entries give each archetype, staff role and outfit an id, metadata and a portrait
 * thumbnail drawn by the same character renderer.
 */
const BOX = { w: 40, h: 52, ax: 20, ay: 49 };
const ANIM = ['idle', 'walk', 'carry', 'browse', 'reach', 'queue', 'pay', 'work', 'restock', 'clean', 'celebrate'];

/** A customer id whose deterministic look comes from `archetype` (first match). */
function sampleCustomer(archetype: ArchetypeId) {
  const type = archetype === 'trendy' ? 'celebrity' : archetype === 'tourist' ? 'tourist' : archetype === 'senior' ? 'foodie' : archetype === 'gamer' ? 'impatient' : archetype === 'shopper' ? 'office' : 'student';
  for (let id = 1; id < 500; id++) {
    const a = customerAppearance(type, id);
    if (a.archetype === archetype) return a;
  }
  return customerAppearance(type, 1);
}

export function peopleAssets(): AssetDef[] {
  const base = (id: string, category: AssetDef['category'], draw: AssetDef['draw'], ref: string): AssetDef => ({
    id,
    category,
    size: { w: BOX.w, h: BOX.h },
    anchor: { x: BOX.ax, y: BOX.ay },
    layer: 'character',
    camera: 'billboard',
    animation: { states: ANIM, cycle: ART.anim.walkCycle },
    draw,
    ref,
  });
  const out: AssetDef[] = [];
  for (const a of Object.keys(ARCHETYPES) as ArchetypeId[]) {
    out.push(base(`char.${a}`, 'character', (ctx) => drawCharacter(ctx, BOX.ax, BOX.ay, sampleCustomer(a), { state: 'idle', t: 0, front: true, right: true }), a));
  }
  for (const role of Object.keys(STAFF_LOOKS)) {
    out.push(base(`staff.${role}`, 'staff', (ctx) => drawCharacter(ctx, BOX.ax, BOX.ay, staffAppearance(role, 2, null), { state: 'idle', t: 0, front: true, right: true }), role));
  }
  for (const o of Object.keys(OUTFITS)) {
    out.push(base(`outfit.${o}`, 'outfit', (ctx) => drawCharacter(ctx, BOX.ax, BOX.ay, staffAppearance('cashier', 2, o), { state: 'idle', t: 0, front: true, right: true }), o));
  }
  return out;
}
