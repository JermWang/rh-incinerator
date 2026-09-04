import { getAddress, isAddressEqual, type Address, type Hex, type PublicClient } from "viem";
import { ZERO_ADDRESS } from "./constants";

/**
 * On-chain proxy resolution (ERC-1967). Used to fingerprint issuer
 * implementations (Stock Tokens) without depending on an explorer.
 */
const IMPLEMENTATION_SLOT: Hex = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
const BEACON_SLOT: Hex = "0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50";
const IMPLEMENTATION_SELECTOR: Hex = "0x5c60da1b"; // implementation()

const cache = new Map<string, { value: Address | null; expires: number }>();
const TTL_MS = 30 * 60 * 1000;

export async function resolveImplementation(client: PublicClient, address: Address): Promise<Address | null> {
  const key = address.toLowerCase();
  const hit = cache.get(key);
  const now = Date.now();
  if (hit && hit.expires > now) return hit.value;
  let value: Address | null = null;
  try {
    const impl = slotToAddress(await client.getStorageAt({ address, slot: IMPLEMENTATION_SLOT }));
    if (impl) value = impl;
    else {
      const beacon = slotToAddress(await client.getStorageAt({ address, slot: BEACON_SLOT }));
      if (beacon) {
        const ret = await client.call({ to: beacon, data: IMPLEMENTATION_SELECTOR });
        value = ret.data ? slotToAddress(ret.data) : null;
      }
    }
  } catch {
    value = null;
  }
  cache.set(key, { value, expires: now + TTL_MS });
  return value;
}

function slotToAddress(word: Hex | undefined): Address | null {
  if (!word || word.length < 66) return null;
  const a = getAddress(`0x${word.slice(-40)}`);
  return isAddressEqual(a, ZERO_ADDRESS) ? null : a;
}
