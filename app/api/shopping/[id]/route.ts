import { NextResponse } from "next/server";
import { deleteShoppingItem, toggleShoppingItem, updateShoppingItem, type ShoppingItemUpdateInput } from "@/lib/shoppingList";

export const dynamic = "force-dynamic";

// Uten body (som fra avhukingsknappen) -> huk av/på. Med body -> rediger felt.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  let body: ShoppingItemUpdateInput | null = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }

  try {
    const item = body && Object.keys(body).length > 0 ? await updateShoppingItem(id, body) : await toggleShoppingItem(id);
    if (!item) return NextResponse.json({ error: "Fant ikke varen" }, { status: 404 });
    return NextResponse.json(item);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    await deleteShoppingItem(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
