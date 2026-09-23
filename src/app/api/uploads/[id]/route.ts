import { isAdmin } from "@/lib/auth/admin";
import { isPlayer } from "@/lib/auth/player";
import { UPLOAD_NAME_RE, openUpload } from "@/lib/uploads";

export const dynamic = "force-dynamic";

// 404 zamiast 401/403 — nie zdradzamy, czy plik istnieje.
const notFound = () => new Response("Nie znaleziono", { status: 404 });

// Zdjęcia dowodów: tylko dla gracza lub admina.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UPLOAD_NAME_RE.test(id)) return notFound();
  if (!(await isPlayer()) && !(await isAdmin())) return notFound();

  const file = await openUpload(id);
  if (!file) return notFound();

  return new Response(file.stream, {
    headers: {
      "Content-Type": file.contentType,
      "Content-Length": String(file.size),
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": "inline",
    },
  });
}
