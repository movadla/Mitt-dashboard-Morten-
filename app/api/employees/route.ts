import { NextRequest, NextResponse } from "next/server";
import { addEmployee, getEmployees } from "@/lib/employees";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const employees = await getEmployees();
    return NextResponse.json({ employees });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  try {
    const employee = await addEmployee(body);
    return NextResponse.json(employee, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}
