export type Shift = "AM" | "PM";
export type BatchStatus = "PENDING" | "PASS" | "HOLD" | "REJECT";

export type MilkBatch = {
  date: string;
  shift: Shift;
  totalLiters: number;
  status: BatchStatus;
};

const batches: Record<string, MilkBatch> = {};

const keyOf = (date: string, shift: Shift) => `${date}__${shift}`;

export function saveMilkBatch(batch: MilkBatch) {
  batches[keyOf(batch.date, batch.shift)] = batch;
}

export function getMilkBatch(date: string, shift: Shift) {
  return batches[keyOf(date, shift)];
}

export function setBatchStatus(date: string, shift: Shift, status: BatchStatus) {
  const batch = getMilkBatch(date, shift);
  if (!batch) return;
  saveMilkBatch({ ...batch, status });
}