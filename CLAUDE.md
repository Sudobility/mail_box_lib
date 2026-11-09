# CLAUDE.md — mail_box_lib

> **Git policy — never auto-commit or auto-push.** Leave work in the working tree.
> Run `git commit`, `git push`, `gh pr create`, or `scripts/push_all.sh` **only when the
> user explicitly asks in that turn**. Approval for an earlier change does not carry
> forward. Stay on the current branch (`main`); do not create feature branches.

## What this is

`@sudobility/mail_box_lib` is a platform-agnostic shared utilities library for the 0xMail
blockchain-email ecosystem. It is a **library**, not an app — pure business logic, React
hooks, and utilities consumed by both web and React Native apps. No UI components, no
platform-specific code: everything platform-specific is injected via `@sudobility/di`
interfaces.

- ESM only (`"type": "module"`); compiled to `dist/` via `tsconfig.build.json`.
- Package manager is **Bun** (lockfile is `bun.lock`). Use `bun run <script>`, not npm/yarn.
- `@sudobility/*` deps resolve from GitHub Packages (`.npmrc` sets the registry); installs
  need an authenticated read token.
- Version, exact dep versions, and the full script list live in `package.json` — read it
  there rather than trusting any number copied into docs.

## Stack

TypeScript 6 (strict) · React 19 (hooks only) · TanStack Query v5 · Zustand v5 ·
viem v2 (EVM) · `@bonfida/spl-name-service` (Solana) · Vitest 4 + happy-dom · ESLint 10
(flat config) · Prettier.

## Commands

```bash
bun run check-all      # lint + typecheck + test:run — the gate before any PR
bun run build          # tsc -p tsconfig.build.json && scripts/fix-esm-imports.mjs
bun run test:run       # Vitest once
bun run test:watch     # Vitest watch
bun run test:coverage  # Vitest + V8 coverage
bun run typecheck      # tsc --noEmit (full strict, stricter than the build)
bun run lint           # ESLint (src, .ts/.tsx)
bun run format         # Prettier
```

**Gotcha:** there is no `test` script, so `bun test` runs Bun's native test runner (wrong),
not Vitest. Always use `bun run test:run` / `bun run test:watch`.

Run a single test: `bun run test:run <path-to-test>`.

Scaffolding: `bun run create:hook | create:service | create:type | create:test`. The many
`analyze:*`, `intelligence:*`, `learning:*`, `automation:*`, `ecosystem:*` scripts are
auxiliary tooling under `scripts/` — not part of the normal dev loop.

## Layout

```
src/
  index.ts              # curated public barrel — the ONLY public surface
  business/
    hooks/{core,contracts,kyc,nameservice}/   # React hooks (platform-agnostic)
    core/{auth,query,navigation,analytics,wallet}/  # domain logic, no UI
    context/            # QueryProvider, NetworkContext (DI-based)
    stores/             # Zustand caches (mailbox/messages/templates/webhooks) — internal
    points/, types/
  types/                # type defs + service interfaces (persistence, etc.)
  utils/{auth,blockchain,contracts,email,nameservice,navigation,notification}/
```

## Public API is curated — this matters

`src/index.ts` exports a **hand-picked named list**, not `export *`. Many symbols that exist
in `src/` are intentionally internal. In particular, these are **NOT public**, despite being
real and useful internally:

- Zustand stores (`useMailboxStore`, `useUnifiedMessagesStore`, `useMailTemplatesStore`,
  `useMailWebhooksStore`).
- Name-service query hooks (`useENSFromWallet`, `useWalletFromENS`, `useSNSFromWallet`,
  `useWalletFromSNS`, `useNameServiceResolution`). The public name-resolution surface is
  `resolveNameOrAddress`, `ENSName`, `SNSName`.
- `Optional<T>` is re-used everywhere but comes from `@sudobility/types` and is **not**
  re-exported here.

When adding a symbol intended for consumers, add it to the relevant barrel **and** to the
curated list in `src/index.ts`, or it won't be importable from the package.

## Conventions

- **`Optional<T>` is mandatory** for every nullable/undefined value (from `@sudobility/types`).
  Never write `string | null` or `T | undefined | null` — use `Optional<T>`.
- **Hook shape:** `useState<Optional<string>>(null)` for error, `isLoading` flag, async
  action wrapped in `useCallback` with try/catch/finally, returns `{ action, isLoading,
  error, clearError }`.
- **Platform-agnostic only.** No direct `window`/`document`/RN API use in business logic;
  go through DI interfaces (`PlatformNetwork`, `StorageService`, `AnalyticsClient`,
  `NotificationService`, `NavigationService`) or the provider-free `createGlobalState`.
- **Provider-free global state** (`utils/useGlobalState.ts`): module-level shared state
  without React Context — required for React Native compatibility (e.g. wallet status).
- Zustand stores key by `userId` or lowercased `walletAddress`, carry `cachedAt`, and expose
  `set`/`get`/`clear`/`clearAll`. `unifiedMessagesStore` cross-populates the single-message
  cache from list responses and vice versa.
- Name resolution: ENS (`.eth`, `.box`) via viem/subgraph; SNS (`.sol`) via a dynamic
  `@bonfida` import. Platform navigation picks `navigation.web.ts` vs
  `navigation.reactnative.ts` automatically.

## Multi-chain notes

`ChainType` (from `@sudobility/types`) distinguishes EVM vs Solana. `OnchainMailerClient`
(`@sudobility/contracts`) is stateless — pass `connectedWallet: Wallet` and
`chainInfo: ChainInfo` per call; memoize the client with `useMemo(() => new
OnchainMailerClient(), [])`. Auth messages differ by chain (SIWE for EVM, custom for
Solana); signature encoding differs (base64 EVM / base58 Solana). Low-level viem contract
calls live in `utils/contracts/mailerService.ts` (`MailerContract`: send, claim, USDC
approval, 90/10 priority-email revenue split).

## TypeScript / lint config

- `tsconfig.json`: ES2020 target, ESNext modules, bundler resolution, `react-jsx`, all
  strict flags incl. `noUnusedLocals/Parameters`, `exactOptionalPropertyTypes`,
  `noUncheckedIndexedAccess`.
- `tsconfig.build.json` **relaxes** those last four for build compatibility, so `bun run
  build` can pass while `bun run typecheck` is stricter — typecheck is the real gate.
- ESLint flat config (`eslint.config.js`): `no-explicit-any` off, unused vars allowed with
  `_` prefix, `exhaustive-deps` warns, Prettier errors are lint errors.

## Testing

Vitest + happy-dom; setup in `src/test/setup.ts`. Hook tests use `@testing-library/react`
(`renderHook`, `act`, `waitFor`); mock external packages with `vi.mock()`. Tests live in
`__tests__/` dirs beside source and are excluded from the build. Coverage threshold is 70%
global (80% for `src/business/core/`).

> A stale `jest.config.cjs`/`jest.setup.cjs` sits in the repo; the project uses **Vitest** —
> ignore the Jest files.
