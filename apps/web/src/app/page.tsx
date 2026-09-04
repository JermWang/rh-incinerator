import Image from "next/image";
import Link from "next/link";
import { ART, Mascot } from "@/components/brand";
import { ConnectButton } from "@/components/wallet/connect-button";

/**
 * One screen, one decision: connect and clean. Everything that used to live on
 * separate marketing pages is either three lines here or on /transparency.
 */
export default function LandingPage() {
  return (
    <div className="mx-auto max-w-[1180px] px-4 md:px-6">
      <section className="grid items-center gap-8 pb-14 pt-10 md:grid-cols-[1.02fr_0.98fr] md:gap-6 md:pb-20 md:pt-16">
        <div className="quiet order-2 md:order-1">
          <Image
            src={ART.wordmark}
            alt="RH Incinerator"
            width={1100}
            height={367}
            priority
            className="w-[min(100%,420px)] md:w-[min(100%,470px)]"
          />
          <h1 className="mt-5 text-[30px] font-medium leading-[1.08] tracking-[-0.03em] text-fg md:text-[40px]">
            Clean your wallet.
            <br />
            Keep your ETH.
          </h1>
          <p className="mt-4 max-w-[440px] text-[15px] leading-relaxed text-fg-2">
            Burn junk tokens and revoke stale approvals on Robinhood Chain. Eligible cleanups are paid for by creator fees, so you pay nothing.
          </p>
          <div className="mt-7">
            <ConnectButton size="lg" goToApp />
          </div>
          <p className="mt-3 text-[12px] text-fg-3">Non-custodial. You sign every action. No seed phrase, ever.</p>
        </div>

        <div className="order-1 flex justify-center md:order-2 md:justify-end">
          <Mascot art="fire" size={520} priority alt="Incinerator mascot burning unwanted tokens" className="w-[min(88vw,420px)] drop-shadow-[0_24px_60px_rgba(204,255,0,0.10)] md:w-[min(46vw,520px)]" />
        </div>
      </section>

      <section aria-labelledby="steps" className="pb-6">
        <h2 id="steps" className="sr-only">
          How it works
        </h2>
        <ol className="grid gap-px overflow-hidden rounded-[18px] border border-hairline bg-hairline sm:grid-cols-3">
          {[
            ["Connect", "Scan your wallet for junk tokens, NFTs and open approvals."],
            ["Select", "Nothing is pre-picked. Real assets stay locked until you unlock them."],
            ["Incinerate", "Every action is simulated first, then you sign once."],
          ].map(([title, body], i) => (
            <li key={title} className="bg-bg-1/92 px-5 py-5 backdrop-blur-md">
              <div className="tnum text-[11px] text-accent">0{i + 1}</div>
              <div className="mt-2 text-[15px] font-medium text-fg">{title}</div>
              <p className="mt-1.5 text-[13px] leading-relaxed text-fg-2">{body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-6 overflow-hidden rounded-[18px] border border-hairline bg-glass-1">
        <div className="flex flex-col items-center gap-6 px-6 py-7 sm:flex-row sm:px-8">
          <Image src={ART.freeBurns} alt="Free burns" width={860} height={573} className="w-[220px] shrink-0 sm:w-[240px]" />
          <div>
            <p className="text-[14.5px] leading-relaxed text-fg-2">
              Solana refunds rent when you close an account. Ethereum does not. Instead, a bounded share of Pons creator fees funds a gas budget that pays for your cleanup.
            </p>
            <Link href="/transparency" className="mt-3 inline-block text-[12px] font-medium uppercase tracking-[0.14em] text-accent hover:underline">
              See the live sponsor pool
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
