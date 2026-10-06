import { describe, it, expect } from 'vitest';
import { en } from '../src/locales/en';
import { PRODUCTS } from '../src/config/products';
import { DEPARTMENTS } from '../src/config/departments';
import { OBJECTS, CHECKOUT_TIER_KEYS } from '../src/config/objects';
import { STAFF, TRAITS } from '../src/config/staff';
import { UPGRADES } from '../src/config/upgrades';
import { LOCATIONS } from '../src/config/locations';
import { THEMES } from '../src/config/cosmetics';
import { PERKS } from '../src/config/prestige';
import { ACHIEVEMENTS, MILESTONES } from '../src/config/achievements';
import { EVENTS } from '../src/config/events';
import { MAIN_QUESTS, SIDE_QUEST_TEMPLATES } from '../src/config/quests';
import { CUSTOMER_TYPES } from '../src/config/customers';
import { t, registerLocale, setLanguage } from '../src/core/i18n';

/** Every data-driven entry must have its localization keys (no raw keys shown to players). */
describe('localization', () => {
  const need: string[] = [];
  for (const p of PRODUCTS) need.push(`product.${p.id}`, `product.${p.id}.desc`, `cat.${p.category}`, `rarity.${p.rarity}`, `display.${p.display}`);
  for (const d of DEPARTMENTS) need.push(`dept.${d.id}`, `dept.${d.id}.desc`);
  for (const o of OBJECTS) need.push(`object.${o.id}`, `object.${o.id}.desc`);
  for (const k of CHECKOUT_TIER_KEYS) need.push(`checkout.${k}`);
  for (const s of STAFF) need.push(`staff.${s.id}`, `staff.${s.id}.desc`);
  for (const tr of TRAITS) need.push(`trait.${tr.id}`, `trait.${tr.id}.desc`);
  for (const u of UPGRADES) need.push(`upg.${u.id}`, `upg.${u.id}.desc`, `upg.${u.id}.stat`, `upgcat.${u.category}`);
  for (const l of LOCATIONS) {
    need.push(`location.${l.id}`, `location.${l.id}.desc`);
    if (l.special) need.push(`loc.special.${l.special}`);
  }
  for (const th of THEMES) need.push(`theme.${th.id}`);
  for (const p of PERKS) need.push(`perk.${p.id}`, `perk.${p.id}.desc`);
  for (const a of ACHIEVEMENTS) {
    need.push(`ach.${a.id}`, `ach.${a.id}.desc`);
    if (a.title) need.push(`title.${a.title}`);
  }
  for (const m of MILESTONES) need.push(`milestone.${m.id}`, `milestone.${m.id}.desc`);
  for (const e of EVENTS) need.push(`event.${e.id}`, `event.${e.id}.desc`, `event.${e.id}.offer`);
  for (const q of MAIN_QUESTS) {
    need.push(`quest.${q.id}`);
    if (q.tutorial) need.push(`tut.${q.id}`);
  }
  for (const s of SIDE_QUEST_TEMPLATES) need.push(`quest.${s.id}`);
  for (const c of CUSTOMER_TYPES) need.push(`customer.${c.id}`);
  for (let i = 1; i <= 5; i++) need.push(`rep.${i}`);

  it('has every data-driven key', () => {
    const missing = need.filter((k) => !(k in en));
    expect(missing).toEqual([]);
  });

  it('substitutes variables and falls back to English', () => {
    expect(t('reason.level_n', { n: 5 })).toBe('Level 5');
    registerLocale('xx', { 'ui.ok': 'Okey' });
    setLanguage('xx');
    expect(t('ui.ok')).toBe('Okey');
    expect(t('ui.cancel')).toBe('Cancel');
    setLanguage('en');
  });
});
