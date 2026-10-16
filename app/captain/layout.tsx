import { BackButton } from "@/components/back-button";

export const dynamic = "force-dynamic";

export default function CaptainLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <BackButton />
      {children}
    </>
  );
}
