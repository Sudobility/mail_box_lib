# @sudobility/mail_box_lib

Platform-agnostic shared utilities library for the 0xMail blockchain email ecosystem. Provides multi-chain wallet management (EVM and Solana), on-chain mailer contract hooks, name service resolution (ENS/SNS), provider-free global state, and TanStack Query integration. Designed as a foundational dependency consumed by both web and React Native applications.

- **Package**: `@sudobility/mail_box_lib` (BUSL-1.1)
- **Module format**: ES Module (`"type": "module"`), compiled to `dist/`
- **Package manager**: Bun
- **Node**: >=18

## Installation

```bash
bun add @sudobility/mail_box_lib
```

`@sudobility/*` packages are published to GitHub Packages, so consumers need an `.npmrc` with `@sudobility:registry=https://npm.pkg.github.com` and an authenticated read token.

Peer dependencies (provided by the consuming app): `react` (>=18), `@tanstack/react-query` (>=5), `zustand` (>=5), `viem` (>=2), `@bonfida/spl-name-service` (>=3), and the `@sudobility/*` packages `types`, `contracts`, `di`, `configs`, `mail_box_types`, `wildduck_client`, `indexer_client`.

## Usage

```typescript
import {
  // Mail orchestration & accounts
  useMailApp, useWalletStatus, useWalletAccounts, useSelectedAccount,
  useAccountMailboxes, useMessages, useMessage,

  // On-chain mailer contracts
  useMailerClient, useMailerClaims, useMailerDelegations,

  // Points and referrals
  usePoints, useWalletPoints, useReferralCode,

  // Providers
  QueryClientProvider, NetworkProvider,

  // Utilities & types
  createGlobalState, formatWalletAddress, createAuthMessage,
  resolveNameOrAddress, type Message,
} from '@sudobility/mail_box_lib';
```

> Note: `Optional<T>` is used pervasively throughout the codebase but comes from `@sudobility/types`, not from this package — import it from there.

### Core hooks

```typescript
// Central mail-app orchestration (account selection + WildDuck auth)
const { accounts, selectedAccount, isLoading } = useMailApp(config);

// Wallet status (provider-free global state)
const { walletAddress, isConnected } = useWalletStatus();

// Contract operations
const { sendMessage, delegateTo, claimRevenue } = useMailerClient(config);

// Name resolution (ENS/SNS → wallet, or wallet → name)
const result = await resolveNameOrAddress(input);
```

## Public API

Everything below is re-exported from the package root (`src/index.ts`). Note that the Zustand stores and the name-service query hooks are internal and are **not** part of the public API — use `resolveNameOrAddress` / `ENSName` / `SNSName` for name resolution.

### Hooks — core / mail
`useMailApp`, `useWalletStatus`, `useWalletAccounts`, `useSelectedAccount`, `useSelectedChain`, `useAccountMailboxes`, `useMailboxesAndSettings`, `useMailAccountSettings`, `useAccountWildduckAuth` (`clearAccountWildduckAuthCache`), `useCustomAddress`, `useMessages`, `useMessage`, `usePoints`, `useWalletPoints`, `useReferralCode`, `useKYC`

### Hooks — contracts
`useMailerClient`, `useMailerClaims`, `useMailerContractApproval`, `useMailerDelegations`, `useMailerPermissions`, `useMailerTemplates`, `useMailerWebhooks`, `useWalletDetector`

### Providers & query
`QueryClientProvider`, `useQueryClient`, `queryClient`, `STALE_TIMES`, `NetworkProvider`, `useNetwork`

### Wallet, points & utilities
`connectWallet`, `disconnectWallet`, `verifyWallet`, `createPointsService`, `PointsService`, `createGlobalState`, `createAuthMessage`, `createSIWEMessage`, `createSolanaSignMessage`, `detectAddressType`, `isValidAddress`, `isValidBlockchainUsername`, `resolveNameOrAddress`, `ENSName`, `SNSName`, `formatWalletAddress`, `formatFileSize`, `formatNumber`, `formatPercentage`, `useLocation`, `useSearchParams`, `createNotificationHelper`, `isWalletAvailable`, `ReferralConsumptionHelper`, `createReferralHelper`, `convertFileToBase64Attachment`

### Email transforms & addressing
`chainTypeToString`, `flattenEmailGroups`, `transformWalletAccountsToEmailGroups`, plus-subaddressing helpers (`parseSubaddress`, `buildSubaddress`, `sameBaseAddress`, …), and from-identity helpers (`buildFromIdentities`, `replyFromAddress`, …)

### Key types
`Message`, `UserPoints`, `Wallet`, `User`, `WalletUserData`, `PersistenceService`, `DocSection`, plus DI interface types re-exported from `@sudobility/di` (`AnalyticsClient`, `AppConfig`, `PlatformStorage`, `NotificationService`, …)

## Development

```bash
bun install
bun run check-all          # lint + typecheck + test:run (run before any PR)
bun run build              # tsc -p tsconfig.build.json + ESM-import fixup
bun run test:run           # Vitest, run once
bun run test:watch         # Vitest, watch mode
bun run test:coverage      # Vitest with V8 coverage
bun run typecheck          # tsc --noEmit (full strict mode)
bun run lint               # ESLint
bun run format             # Prettier
```

> There is no `test` script, so `bun test` invokes Bun's built-in test runner — **not** Vitest. Always use `bun run test:run` / `bun run test:watch`.

Scaffolding helpers: `bun run create:hook`, `create:service`, `create:type`, `create:test`.

## Related packages

- `@sudobility/contracts` — `OnchainMailerClient`, wallet types
- `@sudobility/wildduck_client` — WildDuck email API client
- `@sudobility/indexer_client` — indexer API client
- `@sudobility/di` — dependency injection interfaces
- `@sudobility/configs` — chain configuration (`ChainInfo`, RpcHelpers)
- `@sudobility/types` — shared types (`Optional`, `ChainType`)
- `@sudobility/mail_box_types` — WildDuck + indexer type definitions

## License

BUSL-1.1
