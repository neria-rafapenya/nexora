import React from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  useWindowDimensions,
  TextInput,
} from "react-native";
import { Link, usePathname } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useWorkspace } from "./workspace";
export const colors = {
  green: "#174c3e",
  ink: "#203d33",
  muted: "#718078",
  line: "#e2e7df",
  cream: "#f7f8f3",
  orange: "#bb6845",
};
export function Label({ children }: { children: React.ReactNode }) {
  return <Text style={s.label}>{children}</Text>;
}
export function Title({ children }: { children: React.ReactNode }) {
  return (
    <Text role="heading" style={s.title}>
      {children}
    </Text>
  );
}
export function Copy({ children }: { children: React.ReactNode }) {
  return <Text style={s.copy}>{children}</Text>;
}
export function Card({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: object;
}) {
  return <View style={[s.card, style]}>{children}</View>;
}
export function Button({
  label,
  onPress,
  secondary = false,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  secondary?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        s.button,
        secondary && s.secondary,
        disabled && { opacity: 0.45 },
        pressed && { opacity: 0.8 },
      ]}
    >
      <Text
        style={{
          color: secondary ? colors.green : "white",
          fontSize: 13,
          fontWeight: "600",
        }}
      >
        {label}
      </Text>
      <Feather
        name="arrow-up-right"
        size={16}
        color={secondary ? colors.green : "white"}
      />
    </Pressable>
  );
}
export function Field({
  label,
  value,
  onChangeText,
  placeholder,
  multiline = false,
}: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  multiline?: boolean;
}) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={s.fieldLabel}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        style={[
          s.input,
          multiline && { minHeight: 140, textAlignVertical: "top" },
        ]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        multiline={multiline}
        placeholderTextColor="#8b958e"
      />
    </View>
  );
}
const nav = [
  ["/", "Inicio", "grid"],
  ["/catalog", "Catálogo", "box"],
  ["/orders", "Mis pedidos", "shopping-bag"],
  ["/assistant", "Asistente", "message-circle"],
  ["/profile", "Mi centro", "map-pin"],
] as const;
export function Shell({ children }: { children: React.ReactNode }) {
  const { width } = useWindowDimensions();
  const wide = width > 900;
  const path = usePathname();
  const { cart, notice, notify, centers, center, centerError, selectCenter } =
    useWorkspace();
  const menu = (
    <>
      {nav.map(([href, label, icon]) => (
        <Link key={href} href={href} asChild>
          <Pressable
            style={StyleSheet.flatten([
              s.navItem,
              (path === href || (href !== "/" && path.startsWith(href))) &&
                s.navActive,
            ])}
          >
            <Feather name={icon} size={18} color={colors.green} />
            <Text style={s.navText}>{label}</Text>
          </Pressable>
        </Link>
      ))}
    </>
  );
  return (
    <View style={s.app}>
      {wide && (
        <View style={s.sidebar}>
          <Link href="/" style={s.logo}>
            horekia<Text style={{ color: "#94aa7c" }}>✳</Text>
          </Link>
          <Text style={[s.label, { marginTop: 36, marginBottom: 14 }]}>
            TU ESPACIO DE COMPRA
          </Text>
          {menu}
          <View style={{ flex: 1 }} />
          <View style={s.centerInfo}>
            <View style={s.avatar}>
              <Text style={{ color: colors.green, fontWeight: "700" }}>SJ</Text>
            </View>
            <View>
              <Text style={s.fieldLabel}>{center?.name ?? "Sin centro"}</Text>
              <Text style={s.copy}>Centro de demostración</Text>
            </View>
          </View>
        </View>
      )}
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={s.header}>
          {!wide ? (
            <Link href="/" style={[s.logo, { fontSize: 24 }]}>
              horekia✳
            </Link>
          ) : (
            <Text style={s.copy}>
              Espacio del centro /{" "}
              {nav.find(([h]) =>
                h === "/" ? path === "/" : path.startsWith(h),
              )?.[1] ?? "Pedido"}
            </Text>
          )}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 18 }}>
            <Text style={s.demoBadge}>DEMOSTRACIÓN</Text>
            <Link href="/orders/new" asChild>
              <Pressable accessibilityLabel="Abrir cesta" style={s.basket}>
                <Feather name="shopping-bag" size={18} color={colors.green} />
                <Text style={s.fieldLabel}>{cart.length}</Text>
              </Pressable>
            </Link>
          </View>
        </View>
        <ScrollView
          contentContainerStyle={{ padding: wide ? 40 : 20, paddingBottom: 50 }}
        >
          <View
            style={{
              maxWidth: 1160,
              width: "100%",
              alignSelf: "center",
              gap: 26,
            }}
          >
            <View style={{ gap: 8 }}>
              <Text style={s.fieldLabel}>Centro activo</Text>
              <View style={s.row}>
                {centers.map((c) => (
                  <Pressable
                    key={c.id}
                    accessibilityRole="button"
                    accessibilityState={{ selected: center?.id === c.id }}
                    onPress={() => selectCenter(c.id)}
                  >
                    <Text
                      style={[
                        s.pill,
                        center?.id === c.id && {
                          backgroundColor: colors.green,
                          color: "white",
                        },
                      ]}
                    >
                      {c.name.replace(/^Demo /, "")}
                    </Text>
                  </Pressable>
                ))}
              </View>
              {centerError !== "" && (
                <Text role="alert" style={s.copy}>
                  {centerError}
                </Text>
              )}
              {centers.length === 0 && !centerError && (
                <Text style={s.copy}>Cargando centros…</Text>
              )}
            </View>
            {notice !== "" && (
              <Pressable
                onPress={() => notify("")}
                accessibilityLabel="Cerrar aviso"
              >
                <Text role="status" style={s.notice}>
                  {notice} ×
                </Text>
              </Pressable>
            )}
            {children}
            <Text style={[s.copy, { marginTop: 20 }]}>
              Entorno de diseño · Datos ficticios · Los pedidos y las respuestas
              no se envían a servicios reales.
            </Text>
          </View>
        </ScrollView>
        {!wide && <View style={s.mobileNav}>{menu}</View>}
      </View>
    </View>
  );
}
export const s = StyleSheet.create({
  app: { flex: 1, backgroundColor: colors.cream, flexDirection: "row" },
  sidebar: {
    width: 228,
    backgroundColor: "white",
    padding: 22,
    borderRightWidth: 1,
    borderColor: colors.line,
  },
  logo: {
    fontSize: 32,
    fontWeight: "800",
    letterSpacing: -1.8,
    color: colors.green,
  },
  header: {
    minHeight: 78,
    paddingHorizontal: 24,
    backgroundColor: "white",
    borderBottomWidth: 1,
    borderColor: colors.line,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  navItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 10,
    marginBottom: 5,
  },
  navActive: { backgroundColor: "#eaf0e5" },
  navText: { fontSize: 13, color: colors.green, fontWeight: "500" },
  mobileNav: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    backgroundColor: "white",
    borderTopWidth: 1,
    borderColor: colors.line,
    padding: 5,
  },
  centerInfo: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    paddingTop: 18,
    borderTopWidth: 1,
    borderColor: colors.line,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#eaf0e5",
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    fontSize: 11,
    letterSpacing: 1.8,
    fontWeight: "700",
    color: "#788d7c",
  },
  title: {
    fontSize: 36,
    lineHeight: 43,
    letterSpacing: -1.2,
    fontWeight: "500",
    color: colors.ink,
  },
  copy: { fontSize: 13, lineHeight: 21, color: colors.muted },
  card: {
    padding: 24,
    borderRadius: 16,
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: colors.line,
    gap: 14,
  },
  button: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 20,
    paddingVertical: 15,
    paddingHorizontal: 20,
    backgroundColor: colors.green,
    borderRadius: 25,
    alignSelf: "flex-start",
  },
  secondary: { backgroundColor: "#eaf0e5" },
  fieldLabel: { fontSize: 13, fontWeight: "600", color: colors.ink },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 10,
    padding: 14,
    fontSize: 13,
    color: colors.ink,
    backgroundColor: "white",
  },
  demoBadge: {
    fontSize: 10,
    letterSpacing: 1,
    fontWeight: "700",
    color: "#826b3f",
    backgroundColor: "#f5eedc",
    padding: 7,
    borderRadius: 6,
  },
  basket: { flexDirection: "row", alignItems: "center", gap: 8 },
  notice: {
    backgroundColor: "#e6efe1",
    padding: 16,
    borderRadius: 10,
    fontSize: 13,
    color: colors.green,
  },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 18 },
  sectionTitle: { fontSize: 20, fontWeight: "500", color: colors.ink },
  link: { fontSize: 13, fontWeight: "600", color: colors.green },
  pill: {
    fontSize: 12,
    color: colors.green,
    backgroundColor: "#eaf0e5",
    padding: 7,
    borderRadius: 7,
    alignSelf: "flex-start",
  },
});
