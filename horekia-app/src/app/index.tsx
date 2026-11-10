import { View, Text, useWindowDimensions } from "react-native";
import { router } from "expo-router";
import { Feather } from "@expo/vector-icons";
import {
  Shell,
  Label,
  Title,
  Copy,
  Card,
  Button,
  s,
  colors,
} from "../components/ui";
import { useWorkspace } from "../components/workspace";
export default function Home() {
  const { orders, cart, center } = useWorkspace();
  const { width } = useWindowDimensions();
  return (
    <Shell>
      <View style={{ gap: 10 }}>
        <Label>{center?.name.toUpperCase() ?? "SELECCIONA UN CENTRO"}</Label>
        <Title>Tu centro, bien abastecido.</Title>
        <Copy>
          Menos tiempo preparando pedidos. Más tiempo para cuidar el servicio.
        </Copy>
      </View>
      <View style={[s.row, { alignItems: "stretch" }]}>
        <Card
          style={{
            flex: width > 1000 ? 2 : 1,
            minWidth: 250,
            backgroundColor: "#e8eddf",
            borderColor: "#dfe6d4",
            padding: 30,
          }}
        >
          <Label>UN POCO DE AYUDA INTELIGENTE</Label>
          <Text
            style={[s.title, { fontSize: 29, lineHeight: 36, maxWidth: 440 }]}
          >
            Cuéntanos qué necesitas.{"\n"}Demos forma a tu pedido.
          </Text>
          <Copy>
            Prepara tu cesta con el catálogo o explora cómo sería pedir con
            ayuda de la IA.
          </Copy>
          <Button
            label="Preparar un pedido"
            onPress={() => router.push("/orders/new")}
          />
          <Text
            style={{
              fontSize: 70,
              color: "#9bad8b",
              alignSelf: "flex-end",
              lineHeight: 76,
            }}
          >
            ✳
          </Text>
        </Card>
        <View style={{ flex: 1, minWidth: 240, gap: 18 }}>
          <Card>
            <Feather name="truck" size={22} color={colors.green} />
            <Label>PEDIDOS ENVIADOS</Label>
            <Text style={s.title}>
              {orders.filter((o) => o.centerId === center?.id).length}
            </Text>
            <Copy>En esta sesión de demostración.</Copy>
            <Button
              label="Ver mis pedidos"
              secondary
              onPress={() => router.push("/orders")}
            />
          </Card>
          <Card>
            <Label>TU CESTA</Label>
            <Text style={s.sectionTitle}>
              {cart.length} productos seleccionados
            </Text>
            <Button
              label="Continuar pedido"
              secondary
              onPress={() => router.push("/orders/new")}
            />
          </Card>
        </View>
      </View>
      <View style={{ gap: 18 }}>
        <Text style={s.sectionTitle}>Todo a mano para tu día a día</Text>
        <View style={s.row}>
          {[
            [
              "box",
              "Catálogo",
              "Consulta productos, formatos y fichas.",
              "/catalog",
            ],
            [
              "message-circle",
              "Asistente",
              "Explora un ejemplo de ayuda con tu pedido.",
              "/assistant",
            ],
            [
              "map-pin",
              "Mi centro",
              "Revisa el perfil y el contexto de tu centro.",
              "/profile",
            ],
          ].map(([icon, title, desc, path]) => (
            <Card key={title} style={{ flex: 1, minWidth: 220 }}>
              <Feather name={icon as "box"} size={22} color={colors.green} />
              <Text style={s.sectionTitle}>{title}</Text>
              <Copy>{desc}</Copy>
              <Button
                label="Abrir"
                secondary
                onPress={() => router.push(path as "/catalog")}
              />
            </Card>
          ))}
        </View>
      </View>
    </Shell>
  );
}
