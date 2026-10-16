import { AdminPasswordForm } from "@/components/admin-password";
import { organizerPasswordConfigured } from "@/lib/integrations";

export const metadata = { title: "Organizer sign-in", robots: { index: false, follow: false } };

export default function OrganizerLoginPage() {
  if (!organizerPasswordConfigured()) {
    return (
      <main className="admin-signin">
        <h1>Organizer sign-in</h1>
        <p className="alert" role="alert">
          Organizer sign-in is not configured. Set ADMIN_PASSWORD and SESSION_SECRET (at least 16 characters) on the server. The admin area stays closed until both are set.
        </p>
      </main>
    );
  }
  return (
    <main>
      <AdminPasswordForm />
    </main>
  );
}
