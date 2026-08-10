import { getFplData } from "@/lib/fpl";

export async function GET() {
  return Response.json(await getFplData());
}
