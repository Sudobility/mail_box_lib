/**
 * React hook for managing mailer webhooks
 * Integrates with useWalletStatus and useIndexerMailWebhooks
 * Caches webhooks using Zustand store
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useIndexerMailWebhooks } from '@sudobility/indexer_client';
import {
  Chain,
  type NetworkClient,
  type Optional,
  validateAddress,
} from '@sudobility/types';
import type { IndexerWebhookData } from '@sudobility/mail_box_types';
import {
  type MessageResult,
  OnchainMailerClient,
  type Wallet,
} from '@sudobility/contracts';
import { RpcHelpers } from '@sudobility/configs';
import { useWalletStatus } from '../core/useWalletStatus';
import { useMailWebhooksStore } from '../../stores/mailWebhooksStore';

/**
 * Request type for creating a new mail webhook
 */
export interface WebhookCreateRequest {
  webhookUrl: string;
}

/**
 * Configuration for useMailerWebhooks hook
 */
export interface UseMailerWebhooksConfig {
  /** Network client for API calls */
  networkClient: NetworkClient;
  /** Indexer endpoint URL */
  endpointUrl: string;
  /** Whether to use dev mode */
  dev?: boolean;
  /** Whether to automatically fetch webhooks when wallet is verified */
  autoFetch?: boolean;
}

/**
 * Return type for useMailerWebhooks hook
 */
export interface UseMailerWebhooksReturn {
  /** Array of mail webhooks for the current wallet */
  webhooks: IndexerWebhookData[];
  /** Total number of webhooks */
  total: number;
  /** Whether there are more webhooks available */
  hasMore: boolean;
  /** Loading state */
  isLoading: boolean;
  /** Error message if any */
  error: Optional<string>;
  /** Whether the data is from cache */
  isCached: boolean;
  /** Timestamp when data was cached */
  cachedAt: Optional<number>;
  /** Fetch webhooks for the current wallet */
  fetchWebhooks: () => Promise<void>;
  /** Create a new webhook */
  createWebhook: (webhookData: WebhookCreateRequest) => Promise<void>;
  /** Delete a webhook */
  deleteWebhook: (webhookId: string) => Promise<void>;
  /** Send email through webhook - validates recipient (only wallet addresses supported), returns undefined on error */
  sendWebhookEmail: (
    connectedWallet: Wallet,
    to: string,
    webhookId: string,
    chain: Chain
  ) => Promise<Optional<MessageResult>>;
  /** Clear error state */
  clearError: () => void;
  /** Refresh webhooks (bypass cache) */
  refreshWebhooks: () => Promise<void>;
}

/**
 * Hook for managing mailer webhooks
 *
 * This hook automatically observes wallet status and fetches mail webhooks
 * when a wallet is verified. Webhooks are cached using Zustand store.
 *
 * @param config - Configuration for the hook
 * @returns UseMailerWebhooksReturn with webhooks and management functions
 *
 * @example
 * ```typescript
 * const {
 *   webhooks,
 *   isLoading,
 *   createWebhook,
 *   deleteWebhook
 * } = useMailerWebhooks({
 *   endpointUrl: 'https://api.example.com',
 *   autoFetch: true
 * });
 *
 * // Create a new webhook
 * await createWebhook({
 *   webhookUrl: 'https://example.com/webhook'
 * });
 *
 * // Delete a webhook
 * await deleteWebhook('webhook-id');
 * ```
 */
export const useMailerWebhooks = (
  config: UseMailerWebhooksConfig
): UseMailerWebhooksReturn => {
  const { networkClient, endpointUrl, dev = false, autoFetch = true } = config;

  // Get wallet status
  const { walletAddress, indexerAuth, isVerified } = useWalletStatus();

  // Get indexer hook
  const indexerHook = useIndexerMailWebhooks(networkClient, endpointUrl, dev);

  // Create OnchainMailerClient instance
  const mailerClient = useMemo(() => new OnchainMailerClient(), []);

  // Local loading state for send operations
  const [isSending, setIsSending] = useState(false);

  // Get Zustand store methods
  const { setWebhooks: setCachedWebhooks, clearWebhooks: clearCachedWebhooks } =
    useMailWebhooksStore();

  // Subscribe directly to cached data for this wallet address
  // This ensures component re-renders when cache updates
  const cachedData = useMailWebhooksStore(state =>
    walletAddress ? state.cache[walletAddress.toLowerCase()] : undefined
  );

  const cachedWebhooks = useMemo(
    () => cachedData?.webhooks || [],
    [cachedData]
  );

  /**
   * Fetch webhooks from indexer
   */
  const fetchWebhooks = useCallback(async () => {
    if (!walletAddress || !indexerAuth) {
      return;
    }

    try {
      const response = await indexerHook.getWebhooks(
        walletAddress,
        indexerAuth
      );

      if (response.success && response.data) {
        setCachedWebhooks(
          walletAddress,
          response.data.webhooks,
          response.data.total,
          response.data.hasMore
        );
      }
    } catch (err) {
      console.error('Failed to fetch mail webhooks:', err);
      // Error is handled by indexerHook
    }
  }, [walletAddress, indexerAuth, indexerHook, setCachedWebhooks]);

  /**
   * Refresh webhooks (bypass cache)
   */
  const refreshWebhooks = useCallback(async () => {
    if (walletAddress) {
      clearCachedWebhooks(walletAddress);
    }
    await fetchWebhooks();
  }, [walletAddress, clearCachedWebhooks, fetchWebhooks]);

  /**
   * Create a new webhook
   */
  const createWebhook = useCallback(
    async (webhookData: WebhookCreateRequest) => {
      if (!walletAddress || !indexerAuth) {
        console.error('Cannot create webhook: Wallet not verified');
        return;
      }

      await indexerHook.createWebhook(walletAddress, indexerAuth, webhookData);

      // Refresh webhooks after creation
      await refreshWebhooks();
    },
    [walletAddress, indexerAuth, indexerHook, refreshWebhooks]
  );

  /**
   * Delete a webhook
   */
  const deleteWebhook = useCallback(
    async (webhookId: string) => {
      if (!walletAddress || !indexerAuth) {
        console.error('Cannot delete webhook: Wallet not verified');
        return;
      }

      await indexerHook.deleteWebhook(walletAddress, webhookId, indexerAuth);

      // Refresh webhooks after deletion
      await refreshWebhooks();
    },
    [walletAddress, indexerAuth, indexerHook, refreshWebhooks]
  );

  /**
   * Simple email validation regex
   */
  const isValidEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  /**
   * Send email through webhook
   * Note: Currently webhooks only support wallet addresses as recipients.
   * Email addresses are validated but will return undefined as they're not supported.
   */
  const sendWebhookEmail = useCallback(
    async (
      connectedWallet: Wallet,
      to: string,
      webhookId: string,
      chain: Chain
    ): Promise<Optional<MessageResult>> => {
      setIsSending(true);

      try {
        const chainInfo = RpcHelpers.getChainInfo(chain);
        if (!chainInfo) {
          console.error(`Invalid chain: ${chain}`);
          return undefined;
        }

        const chainType = RpcHelpers.getChainType(chain);
        if (!chainType) {
          console.error(`Invalid chain: ${chain}`);
          return undefined;
        }

        // Check if 'to' is an email address
        if (isValidEmail(to)) {
          // Webhooks currently only support wallet addresses, not email addresses
          console.error(
            'Webhooks currently only support sending to wallet addresses, not email addresses'
          );
          return undefined;
        }

        // Check if 'to' is a valid wallet address for the chain
        const isValidWalletAddress = validateAddress(to, chainType);

        if (isValidWalletAddress) {
          // Send through webhook to wallet address
          return await mailerClient.sendThroughWebhook(
            connectedWallet,
            chainInfo,
            to,
            webhookId
          );
        }

        // Neither valid email nor valid wallet address
        console.error(
          `Invalid recipient: "${to}" is not a valid wallet address for ${chain}`
        );
        return undefined;
      } finally {
        setIsSending(false);
      }
    },
    [mailerClient]
  );

  /**
   * Auto-fetch webhooks when wallet is verified
   */
  useEffect(() => {
    if (autoFetch && isVerified && walletAddress && indexerAuth) {
      // Only fetch if not cached
      if (!cachedData) {
        fetchWebhooks();
      }
    }
  }, [
    autoFetch,
    isVerified,
    walletAddress,
    indexerAuth,
    cachedData,
    fetchWebhooks,
  ]);

  // Determine if we're showing cached data
  const isCached = !!cachedData && !indexerHook.isLoading;

  return useMemo(
    () => ({
      webhooks: cachedWebhooks,
      total: cachedData?.total || 0,
      hasMore: cachedData?.hasMore || false,
      isLoading: indexerHook.isLoading || isSending,
      error: indexerHook.error,
      isCached,
      cachedAt: cachedData?.cachedAt,
      fetchWebhooks,
      createWebhook,
      deleteWebhook,
      sendWebhookEmail,
      clearError: indexerHook.clearError,
      refreshWebhooks,
    }),
    [
      cachedWebhooks,
      cachedData,
      indexerHook.isLoading,
      isSending,
      indexerHook.error,
      indexerHook.clearError,
      isCached,
      fetchWebhooks,
      createWebhook,
      deleteWebhook,
      sendWebhookEmail,
      refreshWebhooks,
    ]
  );
};
