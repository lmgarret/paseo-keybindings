import type { PluginTheme } from "@getpaseo/plugin";
import { Icon } from "@getpaseo/plugin/client/ui";
import type { ReactNode } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import { parseChord } from "./keys";

export const MONO = Platform.select({ web: "Menlo, Monaco, Consolas, 'Courier New', monospace", ios: "Menlo", default: "monospace" });

/** "#rrggbb" or "#rgb" with alpha; other color formats are returned unchanged. */
export function withAlpha(color: string, alpha: number): string {
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(color);
  const hex = short ? `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}` : color;
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return color;
  const a = Math.round(alpha * 255)
    .toString(16)
    .padStart(2, "0");
  return `${hex}${a}`;
}

export function Button({
  theme,
  label,
  icon,
  onPress,
  variant = "secondary",
  disabled,
  accessibilityLabel,
}: {
  theme: PluginTheme;
  label?: string;
  icon?: string;
  onPress(): void;
  variant?: "primary" | "secondary" | "ghost";
  disabled?: boolean;
  accessibilityLabel?: string;
}) {
  const c = theme.colors;
  const background = variant === "primary" ? c.accent : variant === "secondary" ? c.surface2 : "transparent";
  const color = variant === "primary" ? c.accentForeground : c.foreground;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        paddingHorizontal: label ? 10 : 6,
        paddingVertical: 5,
        borderRadius: 6,
        backgroundColor: pressed && variant !== "primary" ? c.surface2 : background,
        borderWidth: variant === "secondary" ? 1 : 0,
        borderColor: c.border,
        opacity: disabled ? 0.45 : pressed ? 0.8 : 1,
      })}
    >
      {icon ? <Icon name={icon} size={14} color={color} /> : null}
      {label ? <Text style={{ color, fontSize: 13 }}>{label}</Text> : null}
    </Pressable>
  );
}

const KEY_LABELS: Record<string, string> = {
  ctrl: "Ctrl",
  shift: "Shift",
  alt: Platform.OS === "ios" ? "Option" : "Alt",
  meta: "Cmd",
  left: "←",
  right: "→",
  up: "↑",
  down: "↓",
  space: "Space",
  enter: "Enter",
  escape: "Esc",
  backspace: "Backspace",
  delete: "Delete",
  tab: "Tab",
};

/** Renders "ctrl+shift+c" as key caps. */
export function KeyCaps({ theme, value }: { theme: PluginTheme; value: string }) {
  let parts: string[];
  try {
    const chord = parseChord(value);
    parts = [
      ...(chord.ctrl ? ["ctrl"] : []),
      ...(chord.shift ? ["shift"] : []),
      ...(chord.alt ? ["alt"] : []),
      ...(chord.meta ? ["meta"] : []),
      chord.key,
    ];
  } catch {
    return <Text style={{ color: theme.colors.statusDanger, fontFamily: MONO, fontSize: 12 }}>{value}</Text>;
  }
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 3 }}>
      {parts.map((part, i) => (
        <View key={`${part}-${i}`} style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
          {i > 0 ? <Text style={{ color: theme.colors.foregroundMuted, fontSize: 11 }}>+</Text> : null}
          <View
            style={{
              paddingHorizontal: 5,
              paddingVertical: 1,
              borderRadius: 4,
              borderWidth: 1,
              borderBottomWidth: 2,
              borderColor: theme.colors.border,
              backgroundColor: theme.colors.surface1,
            }}
          >
            <Text style={{ color: theme.colors.foreground, fontSize: 12 }}>
              {KEY_LABELS[part] ?? (part.length === 1 ? part.toUpperCase() : part)}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

export function Banner({
  theme,
  tone,
  children,
  actions,
}: {
  theme: PluginTheme;
  tone: "warning" | "danger" | "info";
  children: ReactNode;
  actions?: ReactNode;
}) {
  const color =
    tone === "danger" ? theme.colors.statusDanger : tone === "warning" ? theme.colors.statusWarning : theme.colors.accent;
  return (
    <View
      style={{
        flexDirection: "row",
        flexWrap: "wrap",
        alignItems: "center",
        gap: 8,
        padding: 10,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: color,
        backgroundColor: withAlpha(color, 0.1),
      }}
    >
      <Icon name={tone === "info" ? "Info" : "TriangleAlert"} size={16} color={color} />
      <Text style={{ color: theme.colors.foreground, flex: 1, minWidth: 160, fontSize: 13 }}>{children}</Text>
      {actions}
    </View>
  );
}
