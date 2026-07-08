# Playwright Migration PR Chain

PRs must be opened and merged in the order listed below. Each PR builds on
the previous one. Phase 3 spec PRs all branch from the last Phase 2 PR and
can be opened/merged in any order within that phase.

**Base branch**: `bmaio/CNV-92460`

---

## Phase 1 -- Infrastructure (10 PRs)

| # | Branch | Description |
|---|--------|-------------|
| 1 | `bmaio/CNV-92460-infra-01` | Core types, constants, env config, context managers |
| 2 | `bmaio/CNV-92460-infra-02` | Client base layer and proxy handlers |
| 3 | `bmaio/CNV-92460-infra-03` | Kubernetes client handlers (part 1) |
| 4 | `bmaio/CNV-92460-infra-04` | Kubernetes client handlers (part 2) and main client |
| 5 | `bmaio/CNV-92460-infra-05` | Core utilities |
| 6 | `bmaio/CNV-92460-infra-06` | Resource management utilities |
| 7 | `bmaio/CNV-92460-infra-07` | Data factories |
| 8 | `bmaio/CNV-92460-infra-08` | Data model test fixtures |
| 9 | `bmaio/CNV-92460-infra-09` | Base fixture infrastructure |
| 10 | `bmaio/CNV-92460-infra-10` | Tier-specific fixtures and config updates |

## Phase 2 -- Page Objects and Components (10 PRs)

| # | Branch | Description |
|---|--------|-------------|
| 11 | `bmaio/CNV-92460-deps-01` | Base page objects (base-page, page-commons) |
| 12 | `bmaio/CNV-92460-deps-02` | Shared components |
| 13 | `bmaio/CNV-92460-deps-03` | Cluster page objects |
| 14 | `bmaio/CNV-92460-deps-04` | Overview page objects and components |
| 15 | `bmaio/CNV-92460-deps-05` | Create VM page objects and components |
| 16 | `bmaio/CNV-92460-deps-06` | VM list and actions page objects and components |
| 17 | `bmaio/CNV-92460-deps-07` | VM detail page objects and components |
| 18 | `bmaio/CNV-92460-deps-08` | VM tabs, config, and remaining page objects and components |
| 19 | `bmaio/CNV-92460-deps-09` | VM wizard page objects and components |
| 20 | `bmaio/CNV-92460-deps-10` | Settings page objects and remaining files |

## Phase 3 -- Spec Files (33 PRs)

All branch from `bmaio/CNV-92460-deps-10`. Can be merged in any order.

### Gating (4 specs)

| # | Branch | Source spec |
|---|--------|------------|
| 21 | `bmaio/CNV-92460-spec-create-vm-browsing` | `gating/scenario-create-vm-browsing.spec.ts` |
| 22 | `bmaio/CNV-92460-spec-virtualization-pages` | `gating/scenario-virtualization-pages.spec.ts` |
| 23 | `bmaio/CNV-92460-spec-vm-creation-wizard` | `gating/scenario-vm-creation-wizard.spec.ts` |
| 24 | `bmaio/CNV-92460-spec-vm-management` | `gating/scenario-vm-management.spec.ts` |

### Tier 1 (13 specs)

| # | Branch | Source spec |
|---|--------|------------|
| 25 | `bmaio/CNV-92460-spec-bootable-volumes` | `tier1/bootable-volumes/bootable-volumes.spec.ts` |
| 26 | `bmaio/CNV-92460-spec-checkups` | `tier1/checkups/checkups.spec.ts` |
| 27 | `bmaio/CNV-92460-spec-create-vm-custom-config` | `tier1/create-vm/create-vm-wizard-custom-config.spec.ts` |
| 28 | `bmaio/CNV-92460-spec-create-vm-from-template` | `tier1/create-vm/create-vm-wizard-from-template.spec.ts` |
| 29 | `bmaio/CNV-92460-spec-create-vm-yaml` | `tier1/create-vm/create-vm-yaml.spec.ts` |
| 30 | `bmaio/CNV-92460-spec-instance-types` | `tier1/instanceTypes/instanceType.spec.ts` |
| 31 | `bmaio/CNV-92460-spec-migration-policies` | `tier1/migrationpolicies/migration-policies.spec.ts` |
| 32 | `bmaio/CNV-92460-spec-template-creation-flows` | `tier1/templates/template-creation-flows.spec.ts` |
| 33 | `bmaio/CNV-92460-spec-templates` | `tier1/templates/templates.spec.ts` |
| 34 | `bmaio/CNV-92460-spec-vm-lifecycle-actions` | `tier1/virtualmachines/vm-actions/vm-lifecycle-actions.spec.ts` |
| 35 | `bmaio/CNV-92460-spec-vm-config-details` | `tier1/virtualmachines/vm-tabs/vm-configuration-details.spec.ts` |
| 36 | `bmaio/CNV-92460-spec-vm-config-scheduling` | `tier1/virtualmachines/vm-tabs/vm-configuration-scheduling.spec.ts` |
| 37 | `bmaio/CNV-92460-spec-vm-console-diagnostics-t1` | `tier1/virtualmachines/vm-tabs/vm-console-diagnostics.spec.ts` |

### Tier 2 (6 specs)

| # | Branch | Source spec |
|---|--------|------------|
| 38 | `bmaio/CNV-92460-spec-create-vm-clone` | `tier2/create-vm/create-vm-wizard-clone.spec.ts` |
| 39 | `bmaio/CNV-92460-spec-template-detail-page` | `tier2/templates/template-detail-page.spec.ts` |
| 40 | `bmaio/CNV-92460-spec-vm-config-lifecycle` | `tier2/virtualmachines/vm-configuration-lifecycle.spec.ts` |
| 41 | `bmaio/CNV-92460-spec-vm-config-storage` | `tier2/virtualmachines/vm-configuration-storage.spec.ts` |
| 42 | `bmaio/CNV-92460-spec-vm-console-diagnostics-t2` | `tier2/virtualmachines/vm-console-diagnostics.spec.ts` |
| 43 | `bmaio/CNV-92460-spec-vm-overview-lifecycle` | `tier2/virtualmachines/vm-overview-lifecycle.spec.ts` |

### Settings (3 specs)

| # | Branch | Source spec |
|---|--------|------------|
| 44 | `bmaio/CNV-92460-spec-aaq-quotas` | `settings/aaq-quotas.spec.ts` |
| 45 | `bmaio/CNV-92460-spec-cluster-settings` | `settings/cluster-settings.spec.ts` |
| 46 | `bmaio/CNV-92460-spec-user-settings` | `settings/user-settings.spec.ts` |

### Nonpriv (5 specs)

| # | Branch | Source spec |
|---|--------|------------|
| 47 | `bmaio/CNV-92460-spec-nonpriv-bootable-volumes` | `nonpriv/nonpriv-bootable-volumes-crud.spec.ts` |
| 48 | `bmaio/CNV-92460-spec-nonpriv-catalog-wizard` | `nonpriv/nonpriv-catalog-wizard.spec.ts` |
| 49 | `bmaio/CNV-92460-spec-nonpriv-instance-types` | `nonpriv/nonpriv-instance-types-crud.spec.ts` |
| 50 | `bmaio/CNV-92460-spec-nonpriv-overview-templates` | `nonpriv/nonpriv-overview-templates.spec.ts` |
| 51 | `bmaio/CNV-92460-spec-nonpriv-templates` | `nonpriv/nonpriv-templates-crud.spec.ts` |

### Migrations (2 specs)

| # | Branch | Source spec |
|---|--------|------------|
| 52 | `bmaio/CNV-92460-spec-vm-migration-compute` | `migrations/vm-migration-compute.spec.ts` |
| 53 | `bmaio/CNV-92460-spec-vm-migration-storage` | `migrations/vm-migration-storage.spec.ts` |

---

## Aggregation

After all PRs are merged, the final state lives on `main`. For pre-merge
testing, create an aggregation branch that merges all Phase 3 spec branches
together on top of `deps-10`.

## Exclusions

The following are intentionally excluded from this migration:

- Allure reporting (`allure-playwright`, `allure.ts`, `allure-no-stdout-reporter.ts`)
- AI test failure diagnosis (`@cursor/sdk`, `diagnose-protocol.ts`)
- Networking page objects, fixture, and spec (`vm-networks-crud.spec.ts`)
- ACM / fleet-virtualization-acm fixtures and handlers
- s390x fixtures and mocks
- Visual test fixtures and page objects
- STD (Software Test Description) documents
