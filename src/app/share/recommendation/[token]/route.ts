import { NextResponse, type NextRequest } from "next/server";
import { getViewer } from "@/lib/auth/viewer";
import { previewRecommendationLink } from "@/lib/lists/actions";
import { safeNextPath } from "@/lib/validate";
import { appOrigin } from "@/lib/app-origin";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  // Mai `request.url` come base: l'origine verrebbe dall'header `Host`, che lo
  // scrive chi chiama. Stessa regola di `/auth/callback`.
  const origin = appOrigin(request.url);
  const viewer = await getViewer();
  if (!viewer) {
    const next = `/share/recommendation/${encodeURIComponent(token)}`;
    return NextResponse.redirect(
      new URL(`/login?next=${encodeURIComponent(safeNextPath(next))}`, origin),
    );
  }
  const preview = await previewRecommendationLink(token);
  if (!preview)
    return NextResponse.redirect(new URL("/library?view=recommended", origin));
  return NextResponse.redirect(
    new URL(
      `/title/${preview.mediaType}/${preview.titleId}?recommendation=${encodeURIComponent(token)}`,
      origin,
    ),
  );
}
