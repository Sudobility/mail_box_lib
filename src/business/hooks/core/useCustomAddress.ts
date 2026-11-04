/**
 * useCustomAddress Hook
 * Reads and manages a wallet's user-defined (custom) email address via the
 * indexer. Wraps the lower-level indexer_client hooks so the settings UI gets a
 * single, ergonomic API: current address, remaining set allowance, an
 * availability check, and a one-time set action.
 */

import { useCallback, useMemo } from 'react';
import { NetworkClient, Optional } from '@sudobility/types';
import type { IndexerCustomAddressAvailabilityData } from '@sudobility/mail_box_types';
import {
  IndexerUserAuth,
  useIndexerCustomAddressAvailability,
  useIndexerGetCustomAddress,
  useIndexerSetCustomAddress,
} from '@sudobility/indexer_client';

export interface UseCustomAddressReturn {
  /** The wallet's active custom address local part, or null if none set. */
  customAddress: Optional<string>;
  /** Remaining number of times the user may (re)set a custom address. */
  creditsRemaining: number;
  /** Whether the user may set a custom address now (has credit and none active). */
  canSet: boolean;
  /** True while the current state is loading. */
  isLoading: boolean;
  /** True while a set request is in flight. */
  isSetting: boolean;
  /** Last error message, if any. */
  error: Optional<string>;
  /** Check whether a desired local part is available (public check). */
  checkAvailability: (
    name: string
  ) => Promise<Optional<IndexerCustomAddressAvailabilityData>>;
  /** Claim a custom address. Returns true on success. */
  setCustomAddress: (name: string) => Promise<boolean>;
  /** Refetch the current custom-address state. */
  refresh: () => Promise<void>;
}

/**
 * @param networkClient - Network client for HTTP requests
 * @param endpointUrl - Indexer API endpoint URL
 * @param dev - Whether to use dev mode headers
 * @param walletAddress - The owning wallet address
 * @param auth - Wallet-signed authentication credentials
 */
export function useCustomAddress(
  networkClient: NetworkClient,
  endpointUrl: string,
  dev: boolean,
  walletAddress: string,
  auth: IndexerUserAuth
): UseCustomAddressReturn {
  const stateQuery = useIndexerGetCustomAddress(
    networkClient,
    endpointUrl,
    dev,
    walletAddress,
    auth
  );

  const availability = useIndexerCustomAddressAvailability(
    networkClient,
    endpointUrl,
    dev
  );

  const setter = useIndexerSetCustomAddress(networkClient, endpointUrl, dev);

  const customAddress = stateQuery.data?.data?.customAddress ?? null;
  const creditsRemaining = stateQuery.data?.data?.creditsRemaining ?? 1;
  const canSet = creditsRemaining > 0 && !customAddress;

  // Depend on the leaf hooks' individual callbacks (which are stable across
  // renders) rather than the whole hook-return objects (whose identity changes
  // on every pending/error/loading transition). Otherwise these wrappers change
  // identity on each request and loop any effect that depends on them.
  const { checkAvailability: availabilityCheck } = availability;
  const { setCustomAddress: setterSetCustomAddress } = setter;
  const { refetch: refetchState } = stateQuery;

  const checkAvailability = useCallback(
    async (
      name: string
    ): Promise<Optional<IndexerCustomAddressAvailabilityData>> => {
      const response = await availabilityCheck(name);
      return response?.data;
    },
    [availabilityCheck]
  );

  const setCustomAddress = useCallback(
    async (name: string): Promise<boolean> => {
      const response = await setterSetCustomAddress(walletAddress, auth, name);
      if (response?.success) {
        await refetchState();
        return true;
      }
      return false;
    },
    [setterSetCustomAddress, walletAddress, auth, refetchState]
  );

  const refresh = useCallback(async (): Promise<void> => {
    await refetchState();
  }, [refetchState]);

  const error = availability.error ?? setter.error ?? null;

  return useMemo(
    () => ({
      customAddress,
      creditsRemaining,
      canSet,
      isLoading: stateQuery.isLoading,
      isSetting: setter.isLoading,
      error,
      checkAvailability,
      setCustomAddress,
      refresh,
    }),
    [
      customAddress,
      creditsRemaining,
      canSet,
      stateQuery.isLoading,
      setter.isLoading,
      error,
      checkAvailability,
      setCustomAddress,
      refresh,
    ]
  );
}
