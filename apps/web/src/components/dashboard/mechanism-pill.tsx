import type { BurnMechanism } from "@incinerator/chain";
import { Pill } from "@/components/ui/badge";
import { Tooltip } from "@/components/ui/tooltip";

export function MechanismPill({ mechanism, reason }: { mechanism: BurnMechanism; reason?: string | undefined }) {
  switch (mechanism) {
    case "BURNABLE":
      return <Pill tone="neutral">Burnable</Pill>;
    case "SEND_TO_DEAD":
      return <Pill tone="neutral">Send to dead</Pill>;
    case "UNSUPPORTED":
      return (
        <Tooltip content={<span>Unable to safely incinerate. This asset uses non-standard transfer behaviour.{reason ? ` (${reason})` : ""}</span>}>
          <span>
            <Pill tone="warn">Unsupported</Pill>
          </span>
        </Tooltip>
      );
    default:
      return (
        <Tooltip content={reason ?? "Burn mechanism could not be determined. Rescan to retry."}>
          <span>
            <Pill tone="neutral">Not probed</Pill>
          </span>
        </Tooltip>
      );
  }
}
