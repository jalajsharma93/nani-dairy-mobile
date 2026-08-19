# NANI Dairy Feature Status

As of August 19, 2026 (mobile codebase + API contract in `src/services/api.ts`).

## Status Legend
- `Implemented`: usable in app today.
- `Partial`: core flow exists, but important gaps remain.
- `Planned`: not implemented yet.

## Module Status
| Module | Status | What is implemented | Remaining / gaps |
|---|---|---|---|
| Auth & Session | Implemented | Login, logout, token persistence, role-based route guards, password change, user management APIs/hooks. | MFA, password policy hardening, account lockout, audit dashboards. |
| Role-Based UX | Implemented | Tabs/services are role-filtered (`ADMIN`, `MANAGER`, `WORKER`, `VET`, `DELIVERY`, `FEED_MANAGER`) and action-level controls are enforced across task, animal, feed, customer, sales, delivery, payroll, health, breeding, treatment, stock, integration, governance, and release-readiness flows. | MFA/password-policy hardening remains under production hardening. |
| Dashboard | Implemented | Daily AM/PM milk totals, QC status, delivery and finance snapshots, role-based quick actions. | Advanced KPI drilldowns, configurable widgets. |
| Animals | Implemented | Animal create/update/list, detail screen, parentage fields, lifecycle reasons, terminal status constraints, parent lookup, genealogy profile navigation, lineage quality review, lifecycle audit history, per-animal profitability cards, and herd profitability ranking. | Future enhancements can add richer pedigree visualization. |
| Milk Entry | Implemented | Per-animal entry, AM/PM save, batch total save, QC lock behavior after PASS, offline queue support. | Shift cutoff locks, stronger anomaly alerts. |
| QC | Implemented | Batch QC status, cow-level QC capture, extended lab/attachment fields, automated threshold rule engine, supervisor/admin override approvals, and override audit history. | Future enhancements can add external lab integration. |
| Animal Health | Partial | Vaccination/deworming records, due/overdue tracking, timeline view, vaccine schedule support, and age/lactation-based health protocol checklist generation per animal. | Attachments and deeper vet evidence workflow enrichment. |
| Breeding & Calving | Implemented | Heat/insemination/pregnancy/calving events, summary indicators, calf linkage fields, conception/repeat breeder/service-period KPI analytics, and overdue decision cards. | Future enhancements can add predictive breeding recommendations. |
| Treatments | Partial | Per-animal treatment records, follow-up dates, withdrawal dates, treatment templates, prescription evidence fields, compliance summary states, and withdrawal-compliance lock wired into sale/dispatch flows (with privileged override path). | Expanded protocol catalogs and richer prescription attachment governance. |
| Feed Monitoring | Implemented | Per-cow/group/all feed logs, ration phase handling, feed management task support, feed forecasts, procurement planning, efficiency insights, and intake-vs-yield recommendations. | Future enhancements can add automatic ration formulation. |
| Feed Management | Partial | Raw material, recipes, SOP tasks, low stock awareness, 30/90-day consumption forecast with reorder quantity/cost recommendations, and procurement run automation with run-history visibility. | Approval workflow hardening and tighter procurement policy controls. |
| Customers | Implemented | Customer master, subscription toggles, subscription lines (AM/PM/products), pause/skip dates, balance tracking. | Proration and advanced billing rules. |
| Sales | Partial | Sale create/edit, cooperative quality pricing inputs, ledger, reconciliation, month-close bulk ops, subscription invoice/statement APIs with proration + holiday credit math, invoice lifecycle transitions (DRAFT/FINALIZED/POSTED + ADMIN reopen), CSV export entry points, and month-level exception approval view. | PDF export, stricter posting controls, and deeper multi-level approval chains. |
| Delivery Ops | Implemented | Daily route board, delivery task generation from subscriptions, add-ons, assignment/reassignment, run close, reconciliation, auto-assignment support, bulk pending-stop status updates, route optimization, and SLA tracking. | Richer operator UX patterns for very large route volume. |
| Delivery + Stock Link | Implemented | Delivery status updates trigger day stock sync, run closure evaluates stock state, and both-shift closure auto-transfers pending milk-to-curd stock when applicable. | Notification-channel delivery remains in Phase 3. |
| Tasking (Unified) | Implemented | Today Tasks + Worklist combined into one operational board; old routes redirect to unified board; recurring templates, automation run (dry/full), escalation/reminder settings, and run-result reminder details. | Notification-channel delivery (push/SMS/WhatsApp) and policy hardening. |
| Employees | Implemented | Employee CRUD, identity/bank details fields, attendance (daily/shift/hours), monthly report and CSV export, wage engine hooks with advances/deductions/bonus/production incentives, payslip export, and finalized payout status workflow (`PENDING`/`APPROVED`/`PAID`). | Future enhancements can add native PDF generation and richer wage policy templates. |
| Expenses | Implemented | Expense CRUD, category/payment mode, daily summary, offline queue support. | Full finance accounting workflows and controls. |
| Stock Manager | Partial | Milk/curd/buttermilk/ghee stage balances, conversion/adjustment transactions, day sync hooks. | End-to-end production chain planning and yield optimization. |
| Offline Sync | Implemented | Queue + retry + dead-letter visibility, conflict detection, sync center resolution actions, de-duplication by operation conflict key, and offline capture for key operations. | Future enhancements can add field-level merge UI. |
| Localization | Implemented | English + easy Hindi language switch, broad UI label coverage via i18n provider, label fallbacks, and final Phase 2 edge-string pass across the operational screens. | New Phase 3 screens should continue using the i18n provider. |
| Calendar Date Inputs | Implemented | Reusable date input with popup calendar + manual typing across major forms. | Convert remaining minor date fields if any newly added screens appear. |

## Cross-Module Flows Implemented
- Milk save updates batch + entries, then triggers delivery generation and stock sync hooks.
- Subscription customers feed into daily delivery planning.
- Delivery execution and reconciliation are separated into Delivery Ops for operational clarity.
- Unified daily task board combines auto-alert worklist and assigned operational tasks.
- Offline queue is visible and recoverable from Sync Center.

## Planned Roadmap

### Phase 1 (High Priority)
- Done: QC rule engine with auto hold/reject thresholds and supervisor override approvals.
- Done: Employee wage engine (fixed/shift/hourly/production), advances and deductions.
- Done: Treatment compliance lock integration into all sale/dispatch pathways.
- Done: Delivery route optimization + SLA tracking for high-volume operations.

### Phase 2
- Done: Subscription billing depth (proration, holiday handling, monthly statements/invoices) with lifecycle transitions implemented; export/final posting hardening remains.
- Done: Per-animal profitability analytics (milk value vs feed/treatment/labor view).
- Done: Inventory forecasting (30/90-day feed planning with reorder recommendations).
- Done: Task automation (recurring templates, escalation, reminders, and automation-run summary UI).

### Phase 3
- Notification system (push/SMS/WhatsApp) for due tasks and critical alerts.
- Integration layer for RFID/tag scan, analyzer, weighing scale, IoT.
- Immutable audit trail + approval chains across financial and QC exceptions.
- Production hardening: automated tests, monitoring/alerting, backup/restore drills.

## Deferred (By Current Product Decision)
- PostgreSQL migration.
- CI/CD pipeline finalization.
