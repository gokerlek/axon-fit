/**
 * Telefonda (`touch:` = kaba işaretçi ya da <40rem) egzersiz sayfalarındaki bütün denetimler en az
 * 44 px yüksek (SPEC §6). Kapsayıcıya verilir; açılır listelerin içi (portal) kendi bileşeninde.
 */
export const TOUCH_TARGETS =
  'touch:[&_[data-slot=button]]:min-h-11 touch:[&_[data-slot=toggle]]:min-h-11 touch:[&_[data-slot=toggle-group-item]]:min-h-11 touch:[&_[data-slot=input]]:min-h-11 touch:[&_[data-slot=select-trigger]]:min-h-11 touch:[&_[data-slot=input-group]]:min-h-11';
