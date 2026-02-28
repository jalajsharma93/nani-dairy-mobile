import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";
import {
  AddDeliveryTaskAddonPayload,
  CreateDeliveryTaskPayload,
  CreateExpensePayload,
  CreateFeedLogPayload,
  CreateMedicalTreatmentPayload,
  CreateSalePayload,
  DeliveryTaskApi,
  ExpenseApi,
  FeedApi,
  GenericTaskStatus,
  MilkApi,
  MilkEntryApi,
  QcStatus,
  SalesApi,
  SaveMilkEntriesPayload,
  Shift,
  TaskApi,
  TreatmentApi,
  UpdateMilkEntriesQcPayload,
  UpdateFeedLogPayload,
  UpdateDeliveryTaskStatusPayload,
} from "../services/api";

type PendingSyncType =
  | "DELIVERY_TASK_STATUS"
  | "DELIVERY_ADD_ON"
  | "DELIVERY_TASK_CREATE"
  | "GENERIC_TASK_STATUS"
  | "MILK_SAVE_BATCH_AND_ENTRIES"
  | "QC_COW_UPDATE"
  | "QC_BATCH_STATUS_UPDATE"
  | "SALE_SAVE"
  | "SALE_DELIVERY_UPDATE"
  | "SALE_RECONCILE_UPDATE"
  | "EXPENSE_SAVE"
  | "TREATMENT_SAVE"
  | "FEED_BULK_LOG_CREATE"
  | "FEED_LOG_UPDATE";

type DeliveryTaskStatusPendingPayload = {
  deliveryTaskId: string;
  payload: UpdateDeliveryTaskStatusPayload;
};

type GenericTaskStatusPendingPayload = {
  taskId: string;
  payload: { status: GenericTaskStatus };
};

type DeliveryTaskCreatePendingPayload = {
  payload: CreateDeliveryTaskPayload;
};

type MilkSavePendingPayload = {
  date: string;
  shift: SaveMilkEntriesPayload["shift"];
  totalLiters: number;
  entries: SaveMilkEntriesPayload["entries"];
};

type QcCowUpdatePendingPayload = {
  payload: UpdateMilkEntriesQcPayload;
};

type QcBatchStatusUpdatePendingPayload = {
  payload: {
    date: string;
    shift: Shift;
    qcStatus: QcStatus;
  };
};

type SaleSavePendingPayload = {
  saleId?: string | null;
  payload: CreateSalePayload;
};

type SaleDeliveryUpdatePendingPayload = {
  saleId: string;
  payload: {
    delivered: boolean;
    deliveryNote?: string | null;
    collectedAmount?: number | null;
  };
};

type SaleReconcileUpdatePendingPayload = {
  saleId: string;
  payload: {
    reconciled: boolean;
    note?: string | null;
  };
};

type ExpenseSavePendingPayload = {
  expenseId?: string | null;
  payload: CreateExpensePayload;
};

type TreatmentSavePendingPayload = {
  animalId: string;
  treatmentId?: string | null;
  payload: CreateMedicalTreatmentPayload;
};

type FeedBulkLogCreatePendingPayload = {
  logs: CreateFeedLogPayload[];
};

type FeedLogUpdatePendingPayload = {
  feedLogId: string;
  payload: UpdateFeedLogPayload;
};

type PendingSyncPayload =
  | DeliveryTaskStatusPendingPayload
  | AddDeliveryTaskAddonPayload
  | DeliveryTaskCreatePendingPayload
  | GenericTaskStatusPendingPayload
  | MilkSavePendingPayload
  | QcCowUpdatePendingPayload
  | QcBatchStatusUpdatePendingPayload
  | SaleSavePendingPayload
  | SaleDeliveryUpdatePendingPayload
  | SaleReconcileUpdatePendingPayload
  | ExpenseSavePendingPayload
  | TreatmentSavePendingPayload
  | FeedBulkLogCreatePendingPayload
  | FeedLogUpdatePendingPayload;

type PendingSyncState = "PENDING" | "DEAD_LETTER";

export type PendingSyncOperation = {
  localId: string;
  type: PendingSyncType;
  state: PendingSyncState;
  createdAt: string;
  attempts: number;
  lastError?: string | null;
  payload: PendingSyncPayload;
};

export type PendingSyncSummary = {
  total: number;
  deliveryTaskStatus: number;
  deliveryAddOn: number;
  deliveryTaskCreate: number;
  genericTaskStatus: number;
  milkSave: number;
  qcCowUpdate: number;
  qcBatchStatusUpdate: number;
  saleSave: number;
  saleDeliveryUpdate: number;
  saleReconcileUpdate: number;
  expenseSave: number;
  treatmentSave: number;
  feedBulkCreate: number;
  feedLogUpdate: number;
  deadLetter: number;
};

export type PendingSyncFlushResult = {
  processed: number;
  success: number;
  failed: number;
  remaining: number;
};

const STORAGE_KEY = "nani_offline_sync_ops";
const OPS_FILE_URI = FileSystem.documentDirectory
  ? `${FileSystem.documentDirectory}${STORAGE_KEY}.json`
  : null;
let runningFlush: Promise<PendingSyncFlushResult> | null = null;
const MAX_SYNC_ATTEMPTS = 5;

function operationId() {
  return `sync_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

async function readRaw(): Promise<PendingSyncOperation[]> {
  try {
    if (Platform.OS === "web") {
      if (typeof localStorage === "undefined") {
        return [];
      }
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return [];
      }
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        return [];
      }
      return parsed
        .map((entry) => normalizeOperation(entry as Partial<PendingSyncOperation>))
        .filter((entry): entry is PendingSyncOperation => !!entry);
    }

    if (!OPS_FILE_URI) {
      return [];
    }
    const info = await FileSystem.getInfoAsync(OPS_FILE_URI);
    if (!info.exists) {
      return [];
    }
    const raw = await FileSystem.readAsStringAsync(OPS_FILE_URI);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .map((entry) => normalizeOperation(entry as Partial<PendingSyncOperation>))
      .filter((entry): entry is PendingSyncOperation => !!entry);
  } catch {
    return [];
  }
}

function normalizeOperation(entry: Partial<PendingSyncOperation>): PendingSyncOperation | null {
  if (!entry || typeof entry.localId !== "string" || typeof entry.type !== "string") {
    return null;
  }
  return {
    localId: entry.localId,
    type: entry.type as PendingSyncType,
    state: entry.state === "DEAD_LETTER" ? "DEAD_LETTER" : "PENDING",
    createdAt: typeof entry.createdAt === "string" ? entry.createdAt : new Date().toISOString(),
    attempts: Number.isFinite(entry.attempts as number) ? (entry.attempts as number) : 0,
    lastError: entry.lastError ?? null,
    payload: entry.payload as PendingSyncPayload,
  };
}

async function writeRaw(rows: PendingSyncOperation[]): Promise<void> {
  const serialized = JSON.stringify(rows);
  if (Platform.OS === "web") {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(STORAGE_KEY, serialized);
    }
    return;
  }
  if (!OPS_FILE_URI) {
    return;
  }
  await FileSystem.writeAsStringAsync(OPS_FILE_URI, serialized);
}

async function enqueue(type: PendingSyncType, payload: PendingSyncPayload, error?: string): Promise<void> {
  const current = await readRaw();
  current.push({
    localId: operationId(),
    type,
    state: "PENDING",
    payload,
    createdAt: new Date().toISOString(),
    attempts: 0,
    lastError: error ?? null,
  });
  await writeRaw(current);
}

export async function queueDeliveryTaskStatus(
  deliveryTaskId: string,
  payload: UpdateDeliveryTaskStatusPayload,
  error?: string
): Promise<void> {
  await enqueue("DELIVERY_TASK_STATUS", { deliveryTaskId, payload }, error);
}

export async function queueDeliveryAddOn(
  payload: AddDeliveryTaskAddonPayload,
  error?: string
): Promise<void> {
  await enqueue("DELIVERY_ADD_ON", payload, error);
}

export async function queueDeliveryTaskCreate(
  payload: CreateDeliveryTaskPayload,
  error?: string
): Promise<void> {
  await enqueue("DELIVERY_TASK_CREATE", { payload }, error);
}

export async function queueGenericTaskStatus(
  taskId: string,
  payload: { status: GenericTaskStatus },
  error?: string
): Promise<void> {
  await enqueue("GENERIC_TASK_STATUS", { taskId, payload }, error);
}

export async function queueMilkSaveBatchAndEntries(
  payload: {
    date: string;
    shift: SaveMilkEntriesPayload["shift"];
    totalLiters: number;
    entries: SaveMilkEntriesPayload["entries"];
  },
  error?: string
): Promise<void> {
  await enqueue("MILK_SAVE_BATCH_AND_ENTRIES", payload, error);
}

export async function queueFeedBulkLogCreate(
  logs: CreateFeedLogPayload[],
  error?: string
): Promise<void> {
  await enqueue("FEED_BULK_LOG_CREATE", { logs }, error);
}

export async function queueFeedLogUpdate(
  feedLogId: string,
  payload: UpdateFeedLogPayload,
  error?: string
): Promise<void> {
  await enqueue("FEED_LOG_UPDATE", { feedLogId, payload }, error);
}

export async function queueQcCowUpdate(
  payload: UpdateMilkEntriesQcPayload,
  error?: string
): Promise<void> {
  await enqueue("QC_COW_UPDATE", { payload }, error);
}

export async function queueQcBatchStatusUpdate(
  payload: {
    date: string;
    shift: Shift;
    qcStatus: QcStatus;
  },
  error?: string
): Promise<void> {
  await enqueue("QC_BATCH_STATUS_UPDATE", { payload }, error);
}

export async function queueSaleSave(
  payload: {
    saleId?: string | null;
    payload: CreateSalePayload;
  },
  error?: string
): Promise<void> {
  await enqueue("SALE_SAVE", payload, error);
}

export async function queueSaleDeliveryUpdate(
  saleId: string,
  payload: {
    delivered: boolean;
    deliveryNote?: string | null;
    collectedAmount?: number | null;
  },
  error?: string
): Promise<void> {
  await enqueue("SALE_DELIVERY_UPDATE", { saleId, payload }, error);
}

export async function queueSaleReconcileUpdate(
  saleId: string,
  payload: {
    reconciled: boolean;
    note?: string | null;
  },
  error?: string
): Promise<void> {
  await enqueue("SALE_RECONCILE_UPDATE", { saleId, payload }, error);
}

export async function queueExpenseSave(
  payload: {
    expenseId?: string | null;
    payload: CreateExpensePayload;
  },
  error?: string
): Promise<void> {
  await enqueue("EXPENSE_SAVE", payload, error);
}

export async function queueTreatmentSave(
  payload: {
    animalId: string;
    treatmentId?: string | null;
    payload: CreateMedicalTreatmentPayload;
  },
  error?: string
): Promise<void> {
  await enqueue("TREATMENT_SAVE", payload, error);
}

export async function getPendingSyncSummary(): Promise<PendingSyncSummary> {
  const rows = await readRaw();
  return {
    total: rows.length,
    deliveryTaskStatus: rows.filter((row) => row.type === "DELIVERY_TASK_STATUS").length,
    deliveryAddOn: rows.filter((row) => row.type === "DELIVERY_ADD_ON").length,
    deliveryTaskCreate: rows.filter((row) => row.type === "DELIVERY_TASK_CREATE").length,
    genericTaskStatus: rows.filter((row) => row.type === "GENERIC_TASK_STATUS").length,
    milkSave: rows.filter((row) => row.type === "MILK_SAVE_BATCH_AND_ENTRIES").length,
    qcCowUpdate: rows.filter((row) => row.type === "QC_COW_UPDATE").length,
    qcBatchStatusUpdate: rows.filter((row) => row.type === "QC_BATCH_STATUS_UPDATE").length,
    saleSave: rows.filter((row) => row.type === "SALE_SAVE").length,
    saleDeliveryUpdate: rows.filter((row) => row.type === "SALE_DELIVERY_UPDATE").length,
    saleReconcileUpdate: rows.filter((row) => row.type === "SALE_RECONCILE_UPDATE").length,
    expenseSave: rows.filter((row) => row.type === "EXPENSE_SAVE").length,
    treatmentSave: rows.filter((row) => row.type === "TREATMENT_SAVE").length,
    feedBulkCreate: rows.filter((row) => row.type === "FEED_BULK_LOG_CREATE").length,
    feedLogUpdate: rows.filter((row) => row.type === "FEED_LOG_UPDATE").length,
    deadLetter: rows.filter((row) => row.state === "DEAD_LETTER").length,
  };
}

export async function getPendingSyncOperations(limit = 200): Promise<PendingSyncOperation[]> {
  const rows = await readRaw();
  return rows
    .sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1))
    .slice(0, Math.max(1, limit));
}

export async function removePendingSyncOperation(localId: string): Promise<void> {
  const rows = await readRaw();
  await writeRaw(rows.filter((row) => row.localId !== localId));
}

export async function clearDeadLetterSyncOperations(): Promise<void> {
  const rows = await readRaw();
  await writeRaw(rows.filter((row) => row.state !== "DEAD_LETTER"));
}

export async function clearAllPendingSyncOperations(): Promise<void> {
  await writeRaw([]);
}

export async function requeueDeadLetterSyncOperations(): Promise<void> {
  const rows = await readRaw();
  await writeRaw(
    rows.map((row) =>
      row.state === "DEAD_LETTER"
        ? {
            ...row,
            state: "PENDING",
            attempts: 0,
            lastError: row.lastError ?? null,
          }
        : row
    )
  );
}

async function flushNow(): Promise<PendingSyncFlushResult> {
  const rows = await readRaw();
  const pendingRows = rows.filter((row) => row.state !== "DEAD_LETTER");
  if (pendingRows.length === 0) {
    return { processed: 0, success: 0, failed: 0, remaining: 0 };
  }

  let success = 0;
  let failed = 0;
  const remaining: PendingSyncOperation[] = rows.filter((row) => row.state === "DEAD_LETTER");

  for (const row of pendingRows) {
    try {
      if (row.type === "DELIVERY_TASK_STATUS") {
        const payload = row.payload as DeliveryTaskStatusPendingPayload;
        await DeliveryTaskApi.updateStatus(payload.deliveryTaskId, payload.payload);
      } else if (row.type === "DELIVERY_ADD_ON") {
        await DeliveryTaskApi.addOn(row.payload as AddDeliveryTaskAddonPayload);
      } else if (row.type === "DELIVERY_TASK_CREATE") {
        const payload = row.payload as DeliveryTaskCreatePendingPayload;
        await DeliveryTaskApi.create(payload.payload);
      } else if (row.type === "MILK_SAVE_BATCH_AND_ENTRIES") {
        const payload = row.payload as MilkSavePendingPayload;
        await MilkApi.saveBatch({
          date: payload.date,
          shift: payload.shift,
          totalLiters: payload.totalLiters,
        });
        await MilkEntryApi.saveEntries({
          date: payload.date,
          shift: payload.shift,
          entries: payload.entries,
        });
      } else if (row.type === "QC_COW_UPDATE") {
        const payload = row.payload as QcCowUpdatePendingPayload;
        await MilkEntryApi.updateQc(payload.payload);
      } else if (row.type === "QC_BATCH_STATUS_UPDATE") {
        const payload = row.payload as QcBatchStatusUpdatePendingPayload;
        await MilkApi.updateQc(payload.payload);
      } else if (row.type === "SALE_SAVE") {
        const payload = row.payload as SaleSavePendingPayload;
        if (payload.saleId) {
          await SalesApi.update(payload.saleId, payload.payload);
        } else {
          await SalesApi.create(payload.payload);
        }
      } else if (row.type === "SALE_DELIVERY_UPDATE") {
        const payload = row.payload as SaleDeliveryUpdatePendingPayload;
        await SalesApi.updateDelivery(payload.saleId, payload.payload);
      } else if (row.type === "SALE_RECONCILE_UPDATE") {
        const payload = row.payload as SaleReconcileUpdatePendingPayload;
        await SalesApi.reconcile(payload.saleId, payload.payload);
      } else if (row.type === "EXPENSE_SAVE") {
        const payload = row.payload as ExpenseSavePendingPayload;
        if (payload.expenseId) {
          await ExpenseApi.update(payload.expenseId, payload.payload);
        } else {
          await ExpenseApi.create(payload.payload);
        }
      } else if (row.type === "TREATMENT_SAVE") {
        const payload = row.payload as TreatmentSavePendingPayload;
        if (payload.treatmentId) {
          await TreatmentApi.update(payload.animalId, payload.treatmentId, payload.payload);
        } else {
          await TreatmentApi.create(payload.animalId, payload.payload);
        }
      } else if (row.type === "FEED_BULK_LOG_CREATE") {
        const payload = row.payload as FeedBulkLogCreatePendingPayload;
        await Promise.all(payload.logs.map((log) => FeedApi.create(log)));
      } else if (row.type === "FEED_LOG_UPDATE") {
        const payload = row.payload as FeedLogUpdatePendingPayload;
        await FeedApi.update(payload.feedLogId, payload.payload);
      } else {
        const payload = row.payload as GenericTaskStatusPendingPayload;
        await TaskApi.updateStatus(payload.taskId, payload.payload);
      }
      success += 1;
    } catch (e: any) {
      failed += 1;
      const nextAttempts = row.attempts + 1;
      remaining.push({
        ...row,
        attempts: nextAttempts,
        state: nextAttempts >= MAX_SYNC_ATTEMPTS ? "DEAD_LETTER" : "PENDING",
        lastError: String(e?.message ?? "Unknown sync error"),
      });
    }
  }

  await writeRaw(remaining);
  return {
    processed: pendingRows.length,
    success,
    failed,
    remaining: remaining.length,
  };
}

export async function flushPendingSyncOperations(): Promise<PendingSyncFlushResult> {
  if (runningFlush) {
    return runningFlush;
  }
  runningFlush = flushNow().finally(() => {
    runningFlush = null;
  });
  return runningFlush;
}

export function shouldQueueForOffline(error: unknown): boolean {
  const message = String((error as any)?.message ?? "").toLowerCase();
  return (
    message.includes("network request failed") ||
    message.includes("failed to fetch") ||
    message.includes("request timed out") ||
    message.includes("networkerror")
  );
}
