import { registerAll, hasAsset } from './registry';
import { productAssets } from './art/products';
import { PRODUCTS } from '../config/products';
import { environmentAssets } from './art/environment';
import { uiAssets } from './art/ui';
import { furnitureAssets } from './art/furniture';
import { peopleAssets } from './art/people';
import { themeAssets } from './art/themes';

/** Registers every built-in asset once. Safe to call repeatedly. */
let done = false;
export function registerBuiltinAssets(): void {
  if (done) return;
  done = true;
  registerAll(productAssets(PRODUCTS));
  registerAll(environmentAssets());
  registerAll(uiAssets());
  registerAll(furnitureAssets());
  registerAll(peopleAssets());
  registerAll(themeAssets());
}

export function productAssetId(productId: string): string {
  return `product.${productId}`;
}

export { hasAsset };
