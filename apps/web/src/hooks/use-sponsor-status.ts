"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export function useSponsorStatus() {
  return useQuery({
    queryKey: ["sponsor-status"],
    queryFn: api.sponsorStatus,
    refetchInterval: 30_000,
    staleTime: 10_000,
  });
}
