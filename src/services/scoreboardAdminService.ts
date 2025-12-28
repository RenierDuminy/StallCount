import { supabase } from "./supabaseClient";

export type ScoreboardSubscriptionInput = {
  type: "match" | "venue";
  target: string;
  priority?: number;
};

export type ScoreboardRegistrationInput = {
  deviceLabel: string;
  hardwareId: string;
  operator?: string;
  notes?: string;
  metadata?: Record<string, string>;
  registeredAt?: string;
};

export type ScoreboardRegistrationPayload = {
  registration: ScoreboardRegistrationInput;
  subscriptions: ScoreboardSubscriptionInput[];
};

type NormalizedTarget = {
  target_type: ScoreboardSubscriptionInput["type"];
  target_id: string;
  priority?: number;
};

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function randomId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
}

function asUuid(value?: string | null) {
  if (!value) return null;
  const trimmed = value.trim();
  return UUID_REGEX.test(trimmed) ? trimmed : null;
}

function normalizeMetadata(metadata?: Record<string, string>) {
  if (!metadata) return {};
  return Object.entries(metadata).reduce<Record<string, string>>((acc, [key, value]) => {
    const trimmedKey = key.trim();
    if (!trimmedKey) return acc;
    acc[trimmedKey] = value?.trim() ?? "";
    return acc;
  }, {});
}

function normalizeRegistration(registration: ScoreboardRegistrationInput) {
  const timestamp = registration.registeredAt || new Date().toISOString();
  return {
    device_label: registration.deviceLabel?.trim() || "Unnamed device",
    hardware_id: registration.hardwareId?.trim() || randomId(),
    operator_name: registration.operator?.trim() || null,
    notes: registration.notes?.trim() || null,
    registered_at: timestamp,
    metadata: normalizeMetadata(registration.metadata),
  };
}

function normalizeTargets(subscriptions: ScoreboardSubscriptionInput[]) {
  const sanitized = subscriptions
    .map((sub) => ({
      target_type: sub.type,
      target_id: asUuid(sub.target),
      priority: sub.priority,
    }))
    .filter((item): item is NormalizedTarget => Boolean(item.target_id));

  return sanitized.map((sub, index) => ({
    ...sub,
    priority: sub.priority ?? 100 + index,
  }));
}

export async function registerScoreboardDevice(payload: ScoreboardRegistrationPayload) {
  const device = normalizeRegistration(payload.registration);
  const targets = normalizeTargets(payload.subscriptions);

  const { data, error } = await supabase.rpc("register_scoreboard_device", {
    p_device: device,
    p_targets: targets,
  });

  if (error) {
    throw new Error(error.message || "Unable to register device.");
  }

  return data as string | null;
}
