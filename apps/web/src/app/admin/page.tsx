import type { Metadata } from "next";
import { AdminView } from "@/components/admin-view";

export const metadata: Metadata = { title: "Admin", robots: { index: false, follow: false } };

export default function AdminPage() {
  return (
    <div className="mx-auto max-w-[960px] px-4 py-14 md:px-6 md:py-20">
      <div className="label-xs">Internal</div>
      <h1 className="mt-3 text-[28px] font-medium tracking-[-0.02em]">Sponsor operations</h1>
      <p className="mt-2 text-[13px] text-fg-2">Pause, resume, tune limits, denylist contracts and inspect spend. Treasury keys never touch this surface.</p>
      <div className="mt-8">
        <AdminView />
      </div>
    </div>
  );
}
