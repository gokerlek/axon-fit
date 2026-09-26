/**
 * Danışan sayfalarının sekme başlığı (`layout.tsx`): Genel "Ayşe · Uygulama", alt sayfalar
 * "Ölçümler · Ayşe · Uygulama". Next şablonları zincirlemez (alt sayfanın başlığına yalnız en yakın
 * üst şablon uygulanır): danışanın şablonu kökün şablonunu içine alır. Adın içindeki `$` gibi
 * karakterler değiştirme deseni sayılmaz.
 */
export function clientTitle(name: string, parentTemplate?: string | null): { default: string; template: string } {
  const own = `%s · ${name}`;
  const template = parentTemplate?.includes('%s') ? parentTemplate.replace('%s', () => own) : own;
  return { default: name, template };
}
