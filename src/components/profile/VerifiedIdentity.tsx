import { VERIFIED_ROLE_LABELS, type ProfileRecognition } from "@/lib/profile/progression";

interface Props {
  recognition: ProfileRecognition;
  /** La testata del profilo vive sopra un'immagine, quindi usa il vetro chiaro. */
  onBackdrop?: boolean;
}

/** Identità e qualifica assegnate manualmente: non influenza voti o ordinamenti. */
export function VerifiedIdentity({ recognition, onBackdrop = false }: Props) {
  if (!recognition.verifiedAt) return null;

  const roleLabel = recognition.verifiedRole
    ? VERIFIED_ROLE_LABELS[recognition.verifiedRole]
    : null;
  const label = roleLabel ? `Identità verificata · ${roleLabel}` : "Identità verificata";

  return (
    <span
      className={`inline-flex max-w-full shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[10px] font-semibold leading-none tracking-normal ${
        onBackdrop
          ? "border border-white/15 bg-black/35 text-white/90 backdrop-blur-md"
          : "border border-accent/25 bg-accent/[0.12] text-accent-pale"
      }`}
      title={label}
      aria-label={label}
    >
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="m9 12 2 2 4-5" />
        <path d="M12 3.5 14.2 5l2.7-.2.8 2.5 2.1 1.7-.9 2.5.9 2.5-2.1 1.7-.8 2.5-2.7-.2-2.2 1.5L9.8 18l-2.7.2-.8-2.5L4.2 14l.9-2.5L4.2 9l2.1-1.7.8-2.5 2.7.2L12 3.5Z" />
      </svg>
      <span className="truncate">{roleLabel ?? "Identità verificata"}</span>
    </span>
  );
}
