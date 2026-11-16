/**
 * React hook for managing mailer templates
 * Integrates with useWalletStatus and useIndexerMailTemplates
 * Caches templates using Zustand store
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useIndexerMailTemplates } from '@sudobility/indexer_client';
import {
  Chain,
  type NetworkClient,
  type Optional,
  validateAddress,
} from '@sudobility/types';
import type {
  IndexerTemplateCreateRequest,
  IndexerTemplateData,
  IndexerTemplateUpdateRequest,
} from '@sudobility/mail_box_types';
import {
  type MessageResult,
  OnchainMailerClient,
  type Wallet,
} from '@sudobility/contracts';
import { RpcHelpers } from '@sudobility/configs';
import { useWalletStatus } from '../core/useWalletStatus';
import { useMailTemplatesStore } from '../../stores/mailTemplatesStore';

/**
 * Configuration for useMailerTemplates hook
 */
export interface UseMailerTemplatesConfig {
  /** Network client for API calls */
  networkClient: NetworkClient;
  /** Indexer endpoint URL */
  endpointUrl: string;
  /** Whether to use dev mode */
  dev?: boolean;
  /** Whether to automatically fetch templates when wallet is verified */
  autoFetch?: boolean;
}

/**
 * Return type for useMailerTemplates hook
 */
export interface UseMailerTemplatesReturn {
  /** Array of mail templates for the current wallet */
  templates: IndexerTemplateData[];
  /** Total number of templates */
  total: number;
  /** Whether there are more templates available */
  hasMore: boolean;
  /** Loading state */
  isLoading: boolean;
  /** Error message if any */
  error: Optional<string>;
  /** Whether the data is from cache */
  isCached: boolean;
  /** Timestamp when data was cached */
  cachedAt: Optional<number>;
  /** Fetch templates for the current wallet */
  fetchTemplates: () => Promise<void>;
  /** Create a new template */
  createTemplate: (templateData: IndexerTemplateCreateRequest) => Promise<void>;
  /** Update an existing template */
  updateTemplate: (
    templateId: string,
    updates: IndexerTemplateUpdateRequest
  ) => Promise<void>;
  /** Delete a template */
  deleteTemplate: (templateId: string) => Promise<void>;
  /** Send email using prepared template - validates recipient and chooses appropriate method, returns undefined on error */
  sendPreparedEmail: (
    connectedWallet: Wallet,
    to: string,
    templateId: string,
    chain: Chain
  ) => Promise<Optional<MessageResult>>;
  /** Clear error state */
  clearError: () => void;
  /** Refresh templates (bypass cache) */
  refreshTemplates: () => Promise<void>;
}

/**
 * Hook for managing mailer templates
 *
 * This hook automatically observes wallet status and fetches mail templates
 * when a wallet is verified. Templates are cached using Zustand store.
 *
 * @param config - Configuration for the hook
 * @returns UseMailerTemplatesReturn with templates and management functions
 *
 * @example
 * ```typescript
 * const {
 *   templates,
 *   isLoading,
 *   createTemplate,
 *   updateTemplate,
 *   deleteTemplate
 * } = useMailerTemplates({
 *   endpointUrl: 'https://api.example.com',
 *   autoFetch: true
 * });
 *
 * // Create a new template
 * await createTemplate({
 *   templateName: 'Welcome Email',
 *   bodyContent: 'Welcome to our service!'
 * });
 *
 * // Update a template
 * await updateTemplate('template-id', {
 *   bodyContent: 'Updated content'
 * });
 * ```
 */
export const useMailerTemplates = (
  config: UseMailerTemplatesConfig
): UseMailerTemplatesReturn => {
  const { networkClient, endpointUrl, dev = false, autoFetch = true } = config;

  // Get wallet status
  const { walletAddress, indexerAuth, isVerified } = useWalletStatus();

  // Get indexer hook
  const indexerHook = useIndexerMailTemplates(networkClient, endpointUrl, dev);

  // Create OnchainMailerClient instance
  const mailerClient = useMemo(() => new OnchainMailerClient(), []);

  // Local loading state for send operations
  const [isSending, setIsSending] = useState(false);

  // Get Zustand store methods
  const {
    setTemplates: setCachedTemplates,
    clearTemplates: clearCachedTemplates,
  } = useMailTemplatesStore();

  // Subscribe directly to cached data for this wallet address
  // This ensures component re-renders when cache updates
  const cachedData = useMailTemplatesStore(state =>
    walletAddress ? state.cache[walletAddress.toLowerCase()] : undefined
  );

  const cachedTemplates = useMemo(
    () => cachedData?.templates || [],
    [cachedData]
  );

  /**
   * Fetch templates from indexer
   */
  const fetchTemplates = useCallback(async () => {
    if (!walletAddress || !indexerAuth) {
      return;
    }

    try {
      const response = await indexerHook.getTemplates(
        walletAddress,
        indexerAuth
      );

      if (response.success && response.data) {
        setCachedTemplates(
          walletAddress,
          response.data.templates,
          response.data.total,
          response.data.hasMore
        );
      }
    } catch (err) {
      console.error('Failed to fetch mail templates:', err);
      // Error is handled by indexerHook
    }
  }, [walletAddress, indexerAuth, indexerHook, setCachedTemplates]);

  /**
   * Refresh templates (bypass cache)
   */
  const refreshTemplates = useCallback(async () => {
    if (walletAddress) {
      clearCachedTemplates(walletAddress);
    }
    await fetchTemplates();
  }, [walletAddress, clearCachedTemplates, fetchTemplates]);

  /**
   * Create a new template
   */
  const createTemplate = useCallback(
    async (templateData: IndexerTemplateCreateRequest) => {
      if (!walletAddress || !indexerAuth) {
        console.error('Cannot create template: Wallet not verified');
        return;
      }

      await indexerHook.createTemplate(
        walletAddress,
        indexerAuth,
        templateData
      );

      // Refresh templates after creation
      await refreshTemplates();
    },
    [walletAddress, indexerAuth, indexerHook, refreshTemplates]
  );

  /**
   * Update an existing template
   */
  const updateTemplate = useCallback(
    async (templateId: string, updates: IndexerTemplateUpdateRequest) => {
      if (!walletAddress || !indexerAuth) {
        console.error('Cannot update template: Wallet not verified');
        return;
      }

      await indexerHook.updateTemplate(
        walletAddress,
        templateId,
        indexerAuth,
        updates
      );

      // Refresh templates after update
      await refreshTemplates();
    },
    [walletAddress, indexerAuth, indexerHook, refreshTemplates]
  );

  /**
   * Delete a template
   */
  const deleteTemplate = useCallback(
    async (templateId: string) => {
      if (!walletAddress || !indexerAuth) {
        console.error('Cannot delete template: Wallet not verified');
        return;
      }

      await indexerHook.deleteTemplate(walletAddress, templateId, indexerAuth);

      // Refresh templates after deletion
      await refreshTemplates();
    },
    [walletAddress, indexerAuth, indexerHook, refreshTemplates]
  );

  /**
   * Simple email validation regex
   */
  const isValidEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  /**
   * Send email using prepared template
   * Validates recipient and chooses appropriate method (wallet address or email)
   */
  const sendPreparedEmail = useCallback(
    async (
      connectedWallet: Wallet,
      to: string,
      templateId: string,
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

        // Check if 'to' is a valid email address
        if (isValidEmail(to)) {
          // Send to email address
          return await mailerClient.sendPreparedToEmailAddress(
            connectedWallet,
            chainInfo,
            to,
            templateId
          );
        }

        // Check if 'to' is a valid wallet address for the chain
        const isValidWalletAddress = validateAddress(to, chainType);

        if (isValidWalletAddress) {
          // Send to wallet address
          return await mailerClient.sendPrepared(
            connectedWallet,
            chainInfo,
            to,
            templateId
          );
        }

        // Neither valid email nor valid wallet address
        console.error(
          `Invalid recipient: "${to}" is neither a valid email address nor a valid wallet address for ${chain}`
        );
        return undefined;
      } finally {
        setIsSending(false);
      }
    },
    [mailerClient]
  );

  /**
   * Auto-fetch templates when wallet is verified
   */
  useEffect(() => {
    if (autoFetch && isVerified && walletAddress && indexerAuth) {
      // Only fetch if not cached
      if (!cachedData) {
        fetchTemplates();
      }
    }
  }, [
    autoFetch,
    isVerified,
    walletAddress,
    indexerAuth,
    cachedData,
    fetchTemplates,
  ]);

  // Determine if we're showing cached data
  const isCached = !!cachedData && !indexerHook.isLoading;

  return useMemo(
    () => ({
      templates: cachedTemplates,
      total: cachedData?.total || 0,
      hasMore: cachedData?.hasMore || false,
      isLoading: indexerHook.isLoading || isSending,
      error: indexerHook.error,
      isCached,
      cachedAt: cachedData?.cachedAt,
      fetchTemplates,
      createTemplate,
      updateTemplate,
      deleteTemplate,
      sendPreparedEmail,
      clearError: indexerHook.clearError,
      refreshTemplates,
    }),
    [
      cachedTemplates,
      cachedData,
      indexerHook.isLoading,
      isSending,
      indexerHook.error,
      indexerHook.clearError,
      isCached,
      fetchTemplates,
      createTemplate,
      updateTemplate,
      deleteTemplate,
      sendPreparedEmail,
      refreshTemplates,
    ]
  );
};
