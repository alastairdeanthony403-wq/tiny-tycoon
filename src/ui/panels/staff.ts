import { Panel } from '../panel';
import type { AppApi } from '../api';
import { el, setText } from '../dom';
import { UpgradeButton, card, iconBox, sectionTitle, tag } from '../components';
import { STAFF, STAFF_LEVEL_SPEED, STAFF_MAX_LEVEL, TRAIT_MAP } from '../../config/staff';
import { formatMoney } from '../../core/format';
import { t } from '../../core/i18n';

/** Hiring cards + EmployeeCard list with levelling. */
export class StaffPanel extends Panel {
  constructor(private app: AppApi) {
    super('staff', t('nav.staff'), '🧑‍💼');
  }

  protected structureKey(): string {
    const g = this.app.game;
    return [g.shop.locationId, g.state.player.level, g.shop.staff.map((s) => `${s.id}:${s.level}`).join(), g.shop.departments.join(), g.shop.objects.length].join('|');
  }

  protected build(add: (fn: () => void) => void): Node[] {
    const g = this.app.game;
    const wages = el('b');
    add(() => setText(wages, `${formatMoney(g.economy.wagesPerMinute())}${t('ui.per_min')}`));
    const out: Node[] = [card('stats-card', el('div', { class: 'stat-row' }, el('span', {}, t('staff.wages')), wages)), el('p', { class: 'hint' }, t('staff.hint'))];
    out.push(sectionTitle(t('staff.hire'), '📋'));
    for (const s of STAFF) {
      const cand = g.employees.candidate(s.id);
      const trait = TRAIT_MAP[cand.trait];
      const count = el('small', { class: 'count' });
      const btn = new UpgradeButton({
        key: `hire-${s.id}`,
        tut: `hire-${s.id}`,
        label: () => t('staff.hire_btn'),
        cost: () => g.employees.hireCost(s.id),
        can: () => g.employees.canHire(s.id),
        onBuy: () => {
          const c = g.employees.hireCost(s.id);
          const ok = !!g.employees.hire(s.id);
          if (ok) {
            this.app.spendFeedback(c);
            this.refresh(true);
          }
          return ok;
        },
      });
      add(() => {
        btn.update();
        setText(count, `${g.employees.count(s.id)}/${g.employees.maxStaff(s.id)}`);
      });
      const locked = g.state.player.level < s.requiredLevel;
      const reqs: Node[] = [];
      if (locked) reqs.push(tag(`🔒 ${t('reason.level_n', { n: s.requiredLevel })}`, 'locked'));
      if (s.requiredDepartmentAny && !s.requiredDepartmentAny.some((d) => g.shop.departments.includes(d))) reqs.push(tag(`🔒 ${s.requiredDepartmentAny.map((d) => t(`dept.${d}`)).join(' / ')}`, 'locked'));
      out.push(
        card(
          locked ? 'locked-card' : '',
          iconBox(s.icon),
          el(
            'div',
            { class: 'card-main' },
            el('b', {}, t(`staff.${s.id}`), ' ', count),
            el('small', {}, t(`staff.${s.id}.desc`)),
            el('div', { class: 'candidate' }, `${t('staff.candidate')}: `, el('b', {}, cand.name), ' ', tag(`${trait.icon} ${t(`trait.${trait.id}`)}`, 'trait'), el('small', {}, ` ${t(`trait.${trait.id}.desc`)}`)),
            el('div', { class: 'tags' }, tag(`💼 ${formatMoney(s.salary)}${t('ui.per_min')}`), ...reqs),
          ),
          btn.el,
        ),
      );
    }
    out.push(sectionTitle(t('staff.team'), '👥'));
    if (!g.shop.staff.length) out.push(el('p', { class: 'hint' }, t('staff.none')));
    for (const e of g.shop.staff) {
      const trait = TRAIT_MAP[e.trait];
      const speed = Math.round(STAFF_LEVEL_SPEED[e.level - 1] * 100);
      const nextSpeed = e.level < STAFF_MAX_LEVEL ? Math.round(STAFF_LEVEL_SPEED[e.level] * 100) : null;
      const station = e.assignedUid ? g.shopMgr.getObject(e.assignedUid) : undefined;
      const btn = new UpgradeButton({
        key: `lvl-${e.id}`,
        label: () => t('staff.train'),
        cost: () => g.employees.levelUpCost(e),
        can: () => {
          const c = g.employees.levelUpCost(e);
          return c === null ? { ok: false, reason: 'max' } : g.economy.canAfford(c) ? { ok: true } : { ok: false, reason: 'money' };
        },
        onBuy: () => {
          const c = g.employees.levelUpCost(e) ?? 0;
          const ok = g.employees.levelUp(e.id);
          if (ok) {
            this.app.spendFeedback(c);
            this.refresh(true);
          }
          return ok;
        },
      });
      add(() => btn.update());
      const fire = el(
        'button',
        {
          class: 'btn btn-ghost btn-small',
          onclick: () =>
            this.app.confirm({
              icon: '👋',
              title: t('staff.fire_title', { name: e.name }),
              text: t('staff.fire_text'),
              okLabel: t('staff.fire'),
              danger: true,
              onOk: () => {
                g.employees.fire(e.id);
                this.refresh(true);
              },
            }),
        },
        t('staff.fire'),
      );
      out.push(
        card(
          'employee-card',
          iconBox(STAFF.find((s) => s.id === e.type)!.icon),
          el(
            'div',
            { class: 'card-main' },
            el('b', {}, `${e.name} · ${t(`staff.${e.type}`)}`, ' ', tag(`${t('ui.lv')} ${e.level}`, 'lv')),
            el('div', { class: 'stat-preview' }, `${t('stat.speed')} ${speed}%${nextSpeed ? ` → ${nextSpeed}%` : ''}`),
            el('div', { class: 'tags' }, tag(`${trait.icon} ${t(`trait.${trait.id}`)}`, 'trait'), station ? tag(`📍 ${t(`object.${station.kind}`)}`) : e.type === 'cashier' || e.type === 'chef' ? tag(`⚠ ${t('staff.no_station')}`, 'warn') : null),
          ),
          el('div', { class: 'col' }, btn.el, fire),
        ),
      );
    }
    return out;
  }
}
