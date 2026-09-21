/** Marka işareti: tek atımlık EKG çizgisi. Dekoratif — ekran okuyuculardan gizli. */
export function PulseLine({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 240 40" fill="none" aria-hidden focusable="false">
      <path
        d="M0 20h78l8-13 10 26 9-19 7 6h128"
        stroke="var(--primary)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
