import { Toaster } from "@/components/ui/sonner";

export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-emerald-50/40">
      {children}
      <Toaster />
    </div>
  );
}
