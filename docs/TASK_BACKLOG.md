# NANI Dairy Task Backlog

Last updated: August 19, 2026.

## Completed Phase 2 Core
- [x] Phase 2.1: Subscription billing depth
  - [x] Proration on plan change/start/stop
  - [x] Holiday/skip billing rules
  - [x] Monthly statement generation
  - [x] Invoice-ready API payloads
- [x] Phase 2.2: Per-animal profitability analytics
- [x] Phase 2.3: Inventory forecasting (30/90 day)
- [x] Phase 2.4: Task automation (recurring templates, escalation, reminders, manual run + summary)

## Completed Phase 2 Closeout
- [x] Fine-grained action-level role policies
- [x] QC advanced lab parameters + approval hardening
- [x] Animal lifecycle constraints and genealogy workflows
- [x] Health protocol engine by age/lactation
- [x] Breeding KPI analytics
- [x] Treatment protocol templates + stronger evidence flow
- [x] Feed optimization and intake-vs-yield intelligence
- [x] Feed procurement automation and reorder planning
- [x] Sales invoice lifecycle and exception approvals
- [x] Fully automated delivery-to-stock closure orchestration
- [x] Employee payslip export + finalized payout workflow
- [x] Offline conflict resolution and merge policy
- [x] Final i18n QA for edge strings

## Phase 3
- [ ] Notification system (push/SMS/WhatsApp)
- [ ] Integration layer (RFID/analyzer/weigh scale/IoT)
- [ ] Immutable audit + approval chains
- [ ] Production hardening (tests, monitoring, backup/restore, security)

## Deferred
- [ ] PostgreSQL migration
- [ ] CI/CD finalization

## Post-Deployment Technical Debt
- [ ] Refactor oversized UI/API files (reduce complexity before scale)
  - [ ] Split large tab screens into feature subcomponents/hooks (`sales`, `delivery-ops`, `feed`, `employees`)
  - [ ] Split `src/services/api.ts` into domain clients (`animals`, `milk`, `sales`, `feed`, `health`, `tasks`)
  - [ ] Extract shared role/actor helpers to avoid repeated controller logic
  - [ ] Add regression checks around refactored flows (login, milk, QC, sales, delivery)
