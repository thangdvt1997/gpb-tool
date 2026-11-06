import { registerInteractable, type InteractableDef } from '../registry';
import { subscribeObjectStates } from '../objectStates';
import { doorInteractable, registerDoorTicker, type DoorOptions } from './door';
import { wrapChairs, chairInteractable, bindSeatRelease, type ChairHooks, type SeatPose } from './chair';
import { computerInteractable, type ComputerOptions } from './computer';
import { drawerInteractables, type DrawerCabinetOptions } from './drawer';
import { switchInteractable, type SwitchOptions } from './lightSwitch';
import { tvInteractable, type TvOptions } from './tv';
import { curtainInteractable, type CurtainOptions } from './curtain';
import { registerItem, surfaceInteractable, type ItemOptions, type SurfaceOptions } from './smallItem';
import { printerInteractable, registerPrinterTicker, type PrinterOptions } from './printer';
import { waterInteractable, registerWaterTicker, type WaterOptions } from './waterCooler';

export * from './interactEvents';
export * from './tickers';
export * from './door';
export * from './chair';
export * from './computer';
export * from './drawer';
export * from './lightSwitch';
export * from './tv';
export * from './curtain';
export * from './smallItem';
export * from './printer';
export * from './waterCooler';

/** Cấu hình toàn bộ vật tương tác của một khu. Mọi mảng tùy chọn. */
export interface ObjectsConfig {
  doors?: DoorOptions[];
  /** Def ghế có sẵn (chairInteractables(objects)) + tư thế ghế theo def. */
  chairs?: { defs: readonly InteractableDef[]; seatOf: (d: InteractableDef) => SeatPose | null; hooks: ChairHooks };
  looseChairs?: Parameters<typeof chairInteractable>[0][];
  computers?: ComputerOptions[];
  cabinets?: DrawerCabinetOptions[];
  switches?: SwitchOptions[];
  tvs?: TvOptions[];
  curtains?: CurtainOptions[];
  items?: ItemOptions[];
  surfaces?: SurfaceOptions[];
  printers?: PrinterOptions[];
  coolers?: WaterOptions[];
}

/** Đăng ký mọi vật + tick. Trả một hàm hủy tất cả (dùng làm cleanup useEffect). */
export function registerObjects(cfg: ObjectsConfig): () => void {
  const offs: Array<() => void> = [];
  const reg = (d: InteractableDef) => offs.push(registerInteractable(d));
  cfg.doors?.forEach((o) => {
    reg(doorInteractable(o));
    offs.push(registerDoorTicker(o));
  });
  if (cfg.chairs) {
    wrapChairs(cfg.chairs.defs, cfg.chairs.seatOf, cfg.chairs.hooks).forEach(reg);
    offs.push(bindSeatRelease(cfg.chairs.hooks.who));
  }
  cfg.looseChairs?.forEach((o) => reg(chairInteractable(o)));
  cfg.computers?.forEach((o) => reg(computerInteractable(o)));
  cfg.cabinets?.forEach((o) => drawerInteractables(o).forEach(reg));
  cfg.switches?.forEach((o) => reg(switchInteractable(o)));
  cfg.tvs?.forEach((o) => reg(tvInteractable(o)));
  cfg.curtains?.forEach((o) => reg(curtainInteractable(o)));
  cfg.items?.forEach((o) => offs.push(registerItem(o, registerInteractable, subscribeObjectStates as (cb: () => void) => () => void)));
  cfg.surfaces?.forEach((o) => reg(surfaceInteractable(o)));
  cfg.printers?.forEach((o) => {
    reg(printerInteractable(o));
    offs.push(registerPrinterTicker(o));
  });
  cfg.coolers?.forEach((o) => {
    reg(waterInteractable(o));
    offs.push(registerWaterTicker(o));
  });
  return () => offs.splice(0).reverse().forEach((f) => f());
}
