import Link from "next/link";
import { getScoliaData } from "@/lib/scolia";
import { DartDashboard } from "./DartDashboard";

export const dynamic = "force-dynamic";

export default async function DartPage() {
  const data = await getScoliaData();

  return (
    <main style={{ background: "#07090f", minHeight: "100vh" }} className="px-4 py-6 pb-12">
      <div className="max-w-md mx-auto">
        <div className="flex items-center gap-3 mb-5">
          <Link href="/" className="text-zinc-500 hover:text-zinc-300 text-sm transition-colors">
            ← Dashboard
          </Link>
          <span className="text-zinc-700">|</span>
          <h1 className="text-zinc-100 font-semibold tracking-wide">Dart</h1>
          {!data && (
            <span className="ml-auto text-zinc-600 text-xs">Frakoblet</span>
          )}
        </div>
        <DartDashboard data={data} />
      </div>
    </main>
  );
}
