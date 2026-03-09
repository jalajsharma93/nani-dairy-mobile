import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";

export type PersistedSession = {
  token: string;
};

const STORAGE_KEY = "nani_auth_session";
const SESSION_FILE_URI = FileSystem.documentDirectory
  ? `${FileSystem.documentDirectory}${STORAGE_KEY}.json`
  : null;

export async function readPersistedSession(): Promise<PersistedSession | null> {
  try {
    if (Platform.OS === "web") {
      if (typeof localStorage === "undefined") {
        return null;
      }
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return null;
      }
      const parsed = JSON.parse(raw) as Partial<PersistedSession>;
      if (typeof parsed.token !== "string" || !parsed.token.trim()) {
        return null;
      }
      return { token: parsed.token };
    }

    if (!SESSION_FILE_URI) {
      return null;
    }

    const info = await FileSystem.getInfoAsync(SESSION_FILE_URI);
    if (!info.exists) {
      return null;
    }

    const raw = await FileSystem.readAsStringAsync(SESSION_FILE_URI);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<PersistedSession>;
    if (typeof parsed.token !== "string" || !parsed.token.trim()) {
      return null;
    }
    return { token: parsed.token };
  } catch {
    return null;
  }
}

export async function writePersistedSession(session: PersistedSession): Promise<void> {
  if (Platform.OS === "web") {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    }
    return;
  }

  if (!SESSION_FILE_URI) {
    return;
  }

  await FileSystem.writeAsStringAsync(SESSION_FILE_URI, JSON.stringify(session));
}

export async function clearPersistedSession(): Promise<void> {
  if (Platform.OS === "web") {
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(STORAGE_KEY);
    }
    return;
  }

  if (!SESSION_FILE_URI) {
    return;
  }

  const info = await FileSystem.getInfoAsync(SESSION_FILE_URI);
  if (info.exists) {
    await FileSystem.deleteAsync(SESSION_FILE_URI);
  }
}
