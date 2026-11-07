/** Dựng trang phục lên nhân vật MPFB bằng vỏ từ thân (xem docs/design/WARDROBE.md). */
export * from './regions';
export * from './shellClass';
export * from './coverage';
export * from './zones';
export * from './plan';
export * from './compat';
export * from './pool';
export * from './bodyMorphs';
export { MpfbOutfit, structureSignature, colorSignature, type MpfbOutfitProps, type OutfitRigLike } from './MpfbOutfit';
export { MpfbOutfitOn, findBodyMesh, type MpfbOutfitOnProps } from './MpfbOutfitOn';
export * from './accessoryPlan';
export * from './accessoryMeasure';
export * from './accessoryHat';
export * from './patternTexture';
export { attachAccessories, morphedBodyData, type AttachedAccessories } from './accessoryRig';
export { MpfbAccessories } from './MpfbAccessories';
export * from './hairHat';
