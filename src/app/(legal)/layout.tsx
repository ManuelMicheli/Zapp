/**
 * I documenti legali stanno in un route group tutto loro perché non devono avere
 * niente del guscio `(app)`: né la nav, né i provider, né il gate del consenso —
 * si leggono prima di avere un account, ed è il gate stesso a rimandarci.
 */
export default function LegalLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <>{children}</>;
}
