import { NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth/session";
import { exportUserData } from "@/lib/privacy/export";

// Downloads the signed-in person's own data as JSON.
export async function GET() {
  const user = await getCurrentUser();
  if (!user || user.role !== "patient") return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const data = await exportUserData(user.id);
  await audit({ actorUserId: user.id, actorType: "patient", resourceType: "user", resourceId: user.id, action: "data.exported", result: "success" });
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="kindly-data-${new Date().toISOString().slice(0, 10)}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
