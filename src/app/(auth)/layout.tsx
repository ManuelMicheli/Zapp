export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col justify-center px-6 py-12">
      <div className="mb-10 text-center">
        <h1 className="text-4xl font-extrabold tracking-tight">
          Zapp<span className="text-accent">.</span>
        </h1>
        <p className="mt-2 text-sm text-muted">
          Film e serie, tutte le piattaforme, un&apos;unica app.
        </p>
      </div>
      {children}
    </div>
  );
}
