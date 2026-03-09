import { Ionicons } from "@expo/vector-icons";
import { useMemo, useState } from "react";
import { Modal, Pressable, Text, TextInput, View } from "react-native";
import { DairyColors } from "@/src/constants/dairy-theme";

type DateInputProps = {
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
};

const WEEK_DAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function parseIsoDate(value: string): Date | null {
  const clean = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
    return null;
  }
  const date = new Date(`${clean}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  if (
    date.getFullYear() !== Number(clean.slice(0, 4)) ||
    date.getMonth() + 1 !== Number(clean.slice(5, 7)) ||
    date.getDate() !== Number(clean.slice(8, 10))
  ) {
    return null;
  }
  return date;
}

function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function DateInput({ value, onChangeText, placeholder, disabled }: DateInputProps) {
  const today = useMemo(() => new Date(), []);
  const [calendarVisible, setCalendarVisible] = useState(false);
  const [monthCursor, setMonthCursor] = useState(() => parseIsoDate(value) ?? today);

  const selectedDate = parseIsoDate(value);
  const viewMonthLabel = monthCursor.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });

  const calendarCells = useMemo(() => {
    const firstDay = new Date(monthCursor.getFullYear(), monthCursor.getMonth(), 1);
    const firstWeekDay = firstDay.getDay();
    const daysInMonth = new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 0).getDate();
    const cells: { key: string; day: number | null; dateIso?: string }[] = [];
    for (let i = 0; i < firstWeekDay; i += 1) {
      cells.push({ key: `empty-${i}`, day: null });
    }
    for (let day = 1; day <= daysInMonth; day += 1) {
      const date = new Date(monthCursor.getFullYear(), monthCursor.getMonth(), day);
      cells.push({ key: `day-${day}`, day, dateIso: toIsoDate(date) });
    }
    return cells;
  }, [monthCursor]);

  return (
    <>
      <View
        style={{
          marginTop: 6,
          borderWidth: 1,
          borderColor: DairyColors.border,
          borderRadius: 10,
          backgroundColor: DairyColors.surfaceMuted,
          flexDirection: "row",
          alignItems: "center",
        }}
      >
        <TextInput
          editable={!disabled}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder ?? "YYYY-MM-DD"}
          placeholderTextColor="#99A99A"
          style={{
            flex: 1,
            padding: 10,
            color: DairyColors.textPrimary,
          }}
        />
        <Pressable
          disabled={disabled}
          onPress={() => {
            setMonthCursor(selectedDate ?? today);
            setCalendarVisible(true);
          }}
          style={{
            height: 42,
            width: 42,
            alignItems: "center",
            justifyContent: "center",
            borderLeftWidth: 1,
            borderLeftColor: DairyColors.border,
            opacity: disabled ? 0.45 : 1,
          }}
        >
          <Ionicons name="calendar-outline" size={18} color={DairyColors.primary} />
        </Pressable>
      </View>

      <Modal animationType="fade" transparent visible={calendarVisible} onRequestClose={() => setCalendarVisible(false)}>
        <Pressable
          onPress={() => setCalendarVisible(false)}
          style={{
            flex: 1,
            backgroundColor: "rgba(15,20,24,0.3)",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <Pressable
            onPress={() => {}}
            style={{
              borderRadius: 14,
              borderWidth: 1,
              borderColor: DairyColors.border,
              backgroundColor: DairyColors.surface,
              padding: 12,
            }}
          >
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Pressable
                onPress={() =>
                  setMonthCursor((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))
                }
                style={{
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: DairyColors.border,
                  paddingHorizontal: 8,
                  paddingVertical: 6,
                }}
              >
                <Text style={{ color: DairyColors.textPrimary, fontWeight: "700" }}>{"<"}</Text>
              </Pressable>
              <Text style={{ color: DairyColors.textPrimary, fontWeight: "800" }}>{viewMonthLabel}</Text>
              <Pressable
                onPress={() =>
                  setMonthCursor((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))
                }
                style={{
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: DairyColors.border,
                  paddingHorizontal: 8,
                  paddingVertical: 6,
                }}
              >
                <Text style={{ color: DairyColors.textPrimary, fontWeight: "700" }}>{">"}</Text>
              </Pressable>
            </View>

            <View style={{ marginTop: 10, flexDirection: "row", flexWrap: "wrap" }}>
              {WEEK_DAYS.map((weekday) => (
                <View key={weekday} style={{ width: "14.2857%", alignItems: "center", paddingVertical: 5 }}>
                  <Text style={{ color: DairyColors.textSecondary, fontWeight: "700", fontSize: 12 }}>{weekday}</Text>
                </View>
              ))}
              {calendarCells.map((cell) =>
                cell.day == null ? (
                  <View key={cell.key} style={{ width: "14.2857%", height: 38 }} />
                ) : (
                  <Pressable
                    key={cell.key}
                    onPress={() => {
                      onChangeText(cell.dateIso ?? "");
                      setCalendarVisible(false);
                    }}
                    style={{
                      width: "14.2857%",
                      height: 38,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <View
                      style={{
                        minWidth: 30,
                        height: 30,
                        borderRadius: 15,
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor:
                          selectedDate && cell.dateIso === toIsoDate(selectedDate)
                            ? DairyColors.primary
                            : "transparent",
                      }}
                    >
                      <Text
                        style={{
                          color:
                            selectedDate && cell.dateIso === toIsoDate(selectedDate)
                              ? "white"
                              : DairyColors.textPrimary,
                          fontWeight: "700",
                        }}
                      >
                        {cell.day}
                      </Text>
                    </View>
                  </Pressable>
                )
              )}
            </View>

            <View style={{ marginTop: 10, flexDirection: "row", gap: 8 }}>
              <Pressable
                onPress={() => onChangeText(toIsoDate(new Date()))}
                style={{
                  flex: 1,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: DairyColors.border,
                  backgroundColor: DairyColors.surfaceMuted,
                  alignItems: "center",
                  paddingVertical: 10,
                }}
              >
                <Text style={{ color: DairyColors.textPrimary, fontWeight: "700" }}>Today</Text>
              </Pressable>
              <Pressable
                onPress={() => setCalendarVisible(false)}
                style={{
                  flex: 1,
                  borderRadius: 10,
                  backgroundColor: DairyColors.primary,
                  alignItems: "center",
                  paddingVertical: 10,
                }}
              >
                <Text style={{ color: "white", fontWeight: "800" }}>Done</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
