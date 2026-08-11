import { NextRequest, NextResponse } from "next/server";
import { addShoppingItem, getShoppingItems } from "@/lib/shoppingList";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const items = await getShoppingItems();
    return NextResponse.json({ items });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  try {
    const item = await addShoppingItem(body);
    return NextResponse.json(item, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}
