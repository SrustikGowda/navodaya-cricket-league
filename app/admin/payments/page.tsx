import { redirect } from "next/navigation";

/** Payments are a tick list in Settings now. */
export default function PaymentsPage() {
  redirect("/admin/settings#payments");
}
