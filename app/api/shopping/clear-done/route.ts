import { NextResponse } from "next/server";
import { clearDoneShoppingItems } from "@/lib/shoppingList";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    await clearDoneShoppingItems();
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
