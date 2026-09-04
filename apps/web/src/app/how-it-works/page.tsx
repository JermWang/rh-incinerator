import type { Metadata } from "next";
import { Panel } from "@/components/ui/panel";

export const metadata: Metadata = { title: "How it works" };

const steps = [
  ["Connect", "Connect any EVM wallet and switch to Robinhood Chain. Incinerator detects, without changing custody, whether your wallet can route sponsored batches (EIP-7702 or ERC-4337 with an ERC-7677 paymaster), batch calls, or only send plain transactions."],
  ["Scan", "Balances, NFTs and approvals are discovered through the Robinhood Chain explorer index, then every balance, ownership and allowance is re-read directly from the chain. Stock Tokens, stablecoins, wrapped assets, LP and lending positions are protected by default."],
  ["Select", "Nothing is pre-selected. Unknown tokens start unselected. Protected assets need an explicit unlock. Tokens whose burn or transfer misbehaves in simulation are marked unsupported and cannot be selected."],
  ["Review", "Each operation is listed with exactly what it does: burn via the token contract, transfer to the dead address, or approval revocation. The estimated gas, what you pay and the gas source are shown before you confirm."],
  ["Sign", "If your wallet supports sponsorship and the policy engine approves, the sponsor pays gas and you pay 0 ETH. Otherwise you pay standard network fees. Either way you sign; Incinerator never signs on your behalf."],
  ["Confirm", "Transaction hashes link to the Robinhood Chain explorer. Sponsored gas is reconciled against the sponsor's real on-chain spend."],
];

export default function HowItWorksPage() {
  return (
    <div className="mx-auto max-w-[840px] px-4 py-14 md:px-6 md:py-20">
      <div className="label-xs">How it works</div>
      <h1 className="mt-3 text-[32px] font-medium tracking-[-0.02em] md:text-[40px]">Six steps. One signature.</h1>
      <p className="mt-3 max-w-[560px] text-[14px] leading-relaxed text-fg-2">
        Ethereum does not refund storage the way Solana refunds rent. Instead of pretending otherwise, Incinerator routes a bounded share of creator fees into paying the gas for cleanups.
      </p>
      <ol className="mt-10 flex flex-col gap-3">
        {steps.map(([title, body], i) => (
          <li key={title}>
            <Panel level={1} radius="lg" className="flex gap-5 p-5">
              <span className="tnum shrink-0 text-[12px] text-fg-3">0{i + 1}</span>
              <div>
                <div className="text-[14px] font-medium text-fg">{title}</div>
                <p className="mt-1.5 text-[13.5px] leading-relaxed text-fg-2">{body}</p>
              </div>
            </Panel>
          </li>
        ))}
      </ol>
    </div>
  );
}
