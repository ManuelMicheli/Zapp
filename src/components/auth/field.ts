/**
 * Campi dei form auth/onboarding: vetro scuro con bordo tenue e highlight in alto,
 * così restano leggibili sia sul foglio sfocato (mobile) sia sul pannello (desktop).
 */
export const AUTH_FIELD_BASE =
  "rounded-[16px] border border-white/[0.09] bg-white/[0.055] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition-[border-color,background-color,box-shadow] duration-200";

/** `<input>` singolo (login/signup). */
export const AUTH_FIELD_CLASS = `h-[54px] w-full ${AUTH_FIELD_BASE} px-[18px] text-base text-text outline-none placeholder:text-muted focus:border-accent/70 focus:bg-white/[0.075] focus:ring-4 focus:ring-accent/15`;

/** Contenitore con prefisso/suffisso (onboarding): il focus è del wrapper. */
export const AUTH_FIELD_WRAP_CLASS = `flex h-[54px] items-center ${AUTH_FIELD_BASE} px-[18px] focus-within:border-accent/70 focus-within:bg-white/[0.075] focus-within:ring-4 focus-within:ring-accent/15`;
