import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AdminChrome } from "@/components/admin-chrome";
import { BackButton } from "@/components/back-button";
import { getActor } from "@/lib/auth";

export const metadata = { title: "Admin", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const path = (await headers()).get("x-ncl-path") ?? "";
  const actor = await getActor();
  const signingIn = path === "/admin/login";
  if (!actor || actor.role !== "organizer") {
    if (!signingIn) redirect("/admin/login");
    return <div className="admin-shell admin-signin-shell"><BackButton />{children}</div>;
  }
  if (signingIn) redirect("/admin");
  return <AdminChrome email={actor.displayName || actor.email}>{children}</AdminChrome>;
}
