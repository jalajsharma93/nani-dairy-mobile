# NANI Dairy Feature Status

As of February 28, 2026 (mobile codebase + API contract in `app/services/api.ts`).

## Status Legend
- `Implemented`: usable in app today.
- `Partial`: core flow exists, but important gaps remain.
- `Planned`: not implemented yet.

## Module Status
| Module | Status | What is implemented | Remaining / gaps |
|---|---|---|---|
| Auth & Session | Implemented | Login, logout, token persistence, role-based route guards, password change, user management APIs/hooks. | MFA, password policy hardening, account lockout, audit dashboards. |
| Role-Based UX | Partial | Tabs/services are role-filtered (`ADMIN`, `MANAGER`, `WORKER`, `VET`, `DELIVERY`, `FEED_MANAGER`). | Fine-grained action-level policies still mixed in some screens. |
| Dashboard | Implemented | Daily AM/PM milk totals, QC status, delivery and finance snapshots, role-based quick actions. | Advanced KPI drilldowns, configurable widgets. |
| Animals | Partial | Animal create/update/list, detail screen, parentage fields, lifecycle basics, health links. | Full lifecycle workflows (retire/sold/dead transitions and constraints), advanced genealogy workflows. |
| Milk Entry | Implemented | Per-animal entry, AM/PM save, batch total save, QC lock behavior after PASS, offline queue support. | Shift cutoff locks, stronger anomaly alerts. |
| QC | Partial | Batch QC status + cow-level QC capture with key parameters and updates. | Full extended lab/attachment parameters, automated threshold rule engine + approvals. |
| Animal Health | Partial | Vaccination/deworming records, due/overdue tracking, timeline view, vaccine schedule support. | Rich protocol engine by age/lactation, attachments and vet workflow enrichment. |
| Breeding & Calving | Partial | Heat/insemination/pregnancy/calving events, summary indicators, calf linkage fields. | Advanced KPIs (conception/repeat breeder trends), deeper decision analytics. |
| Treatments | Partial | Per-animal treatment records, follow-up dates, withdrawal dates, prescription URL handling, and withdrawal-compliance lock wired into sale/dispatch flows (with privileged override path). | Deeper protocol templates and stronger prescription evidence workflow. |
| Feed Monitoring | Partial | Per-cow/group/all feed logs, ration phase handling, feed management task support. | Optimization engine, intake-vs-yield intelligence, stricter workflow approvals. |
| Feed Management | Partial | Raw material, recipes, SOP tasks, low stock awareness. | Procurement planning, reorder automation, 30/90-day forecasting. |
| Customers | Implemented | Customer master, subscription toggles, subscription lines (AM/PM/products), pause/skip dates, balance tracking. | Proration and advanced billing rules. |
| Sales | Partial | Sale create/edit, cooperative quality pricing inputs, ledger, reconciliation, month-close bulk ops. | Deeper invoice lifecycle, stronger exception handling and approvals. |
| Delivery Ops | Implemented | Daily route board, delivery task generation from subscriptions, add-ons, assignment/reassignment, run close, reconciliation, auto-assignment support, bulk pending-stop status updates, route optimization, and SLA tracking. | Richer operator UX patterns for very large route volume. |
| Delivery + Stock Link | Partial | Delivery status updates trigger day stock sync; shift-closure banner prompts milk-to-curd transfer. | Fully automated no-click closure orchestration + notification channels. |
| Tasking (Unified) | Implemented | Today Tasks + Worklist combined into one operational board; old routes redirect to unified board. | Recurring templates, escalation rules, reminder notifications. |
| Employees | Partial | Employee CRUD, identity/bank details fields, attendance (daily/shift/hours), monthly report and CSV export, and wage engine hooks with advances/deductions/bonus/production incentives and net payable salary. | Payslip PDF, finalized monthly payout workflow, production-linked wage policy tuning. |
| Expenses | Implemented | Expense CRUD, category/payment mode, daily summary, offline queue support. | Full finance accounting workflows and controls. |
| Stock Manager | Partial | Milk/curd/buttermilk/ghee stage balances, conversion/adjustment transactions, day sync hooks. | End-to-end production chain planning and yield optimization. |
| Offline Sync | Partial | Queue + retry + dead-letter visibility, sync center, offline capture for key operations. | Conflict resolution policies/version merge semantics. |
| Localization | Implemented | English + easy Hindi language switch, broad UI label coverage via i18n provider. | Final translation QA for every edge string. |
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
- Subscription billing depth: proration, holiday handling, monthly statements/invoices.
- Per-animal profitability analytics: milk value vs feed/treatment/labor.
- Inventory forecasting: 30/90-day feed planning with reorder recommendations.
- Task automation: recurring templates, escalation, reminders.

### Phase 3
- Notification system (push/SMS/WhatsApp) for due tasks and critical alerts.
- Integration layer for RFID/tag scan, analyzer, weighing scale, IoT.
- Immutable audit trail + approval chains across financial and QC exceptions.
- Production hardening: automated tests, monitoring/alerting, backup/restore drills.

## Deferred (By Current Product Decision)
- PostgreSQL migration.
- CI/CD pipeline finalization.
