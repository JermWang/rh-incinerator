import type { Metadata } from "next";
import { ActivityView } from "@/components/activity-view";

export const metadata: Metadata = { title: "Activity" };

export default function ActivityPage() {
  return (
    <div className="mx-auto max-w-[840px] px-4 py-14 md:px-6 md:py-20">
      <div className="label-xs">Activity</div>
      <h1 className="mt-3 text-[32px] font-medium tracking-[-0.02em] md:text-[40px]">Your cleanups.</h1>
      <p className="mt-3 text-[14px] text-fg-2">History for the connected wallet. Stored locally and, for signed-in sessions, in the sponsor ledger.</p>
      <div className="mt-8">
        <ActivityView />
      </div>
    </div>
  );
}
