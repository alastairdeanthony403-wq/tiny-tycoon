import type { UnlockInfo } from '../core/bus';
import { getProduct } from '../config/products';
import { DEPARTMENT_MAP } from '../config/departments';
import { STAFF_MAP } from '../config/staff';
import { LOCATION_MAP } from '../config/locations';
import { OBJECT_MAP } from '../config/objects';
import { t } from '../core/i18n';

/** Icon + localized name for something that unlocks (level-up reveal, "next level" preview). */
export function unlockLine(u: UnlockInfo): string {
  switch (u.kind) {
    case 'product':
      return `${getProduct(u.id)?.icon} ${t(`product.${u.id}`)}`;
    case 'department':
      return `${DEPARTMENT_MAP[u.id]?.icon} ${t(`dept.${u.id}`)}`;
    case 'staff':
      return `${STAFF_MAP[u.id as keyof typeof STAFF_MAP]?.icon} ${t(`staff.${u.id}`)}`;
    case 'location':
      return `${LOCATION_MAP[u.id]?.icon} ${t(`location.${u.id}`)}`;
    case 'upgrade':
      return `⬆️ ${t(`upg.${u.id}`)}`;
    case 'decor':
    case 'feature':
      return u.id === 'expansion' ? `🏗️ ${t('unlock.expansion')}` : `${OBJECT_MAP[u.id]?.icon ?? '✨'} ${t(`object.${u.id}`)}`;
    case 'customer':
      return `🧍 ${t(`customer.${u.id}`)}`;
    default:
      return u.id;
  }
}