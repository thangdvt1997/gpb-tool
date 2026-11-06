/** Nối dữ liệu thật trong repo vào adapter. Đây là điểm duy nhất import catalog/manifest (thay bằng service sau này). */
import manifest from '../../public/models/manifest.json';
import { ACCESSORIES_CATALOG, ACCESSORY_SLOT_LABELS, GARMENT_GROUP_LABELS, GARMENTS, STYLE_TAG_LABELS } from '../fashion/catalog';
import { PROP_SPOTS } from '../scene/officePropsLayout';
import { fromAccessories, fromGarments, fromManifest, fromPropSpots, mergeItems, type ManifestLike, type MergeResult } from './adapter';

export function buildDefaultLibrary(): MergeResult {
  return mergeItems(
    fromManifest(manifest as unknown as ManifestLike),
    fromGarments(GARMENTS, GARMENT_GROUP_LABELS, STYLE_TAG_LABELS),
    fromAccessories(ACCESSORIES_CATALOG, ACCESSORY_SLOT_LABELS, STYLE_TAG_LABELS),
    fromPropSpots(PROP_SPOTS),
  );
}
