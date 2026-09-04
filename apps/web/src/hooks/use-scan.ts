"use client";

import { useQuery } from "@tanstack/react-query";
import type { Address } from "viem";
import { api } from "@/lib/api";

export function useScan(address: Address | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ["scan", address],
    queryFn: () => api.scan(address!),
    enabled: Boolean(address) && enabled,
    staleTime: 60_000,
    retry: 1,
  });
}
