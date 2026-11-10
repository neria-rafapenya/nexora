import { Text } from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import {
  Shell,
  Label,
  Title,
  Copy,
  Card,
  Button,
  s,
} from "../../components/ui";
import { useWorkspace } from "../../components/workspace";
import { products, total, money } from "../../domain/demo";
export default function Detail() {
  const { id } = useLocalSearchParams();
  const { orders, center } = useWorkspace();
  const o = orders.find((o) => o.id === id && o.centerId === center?.id);
  return (
    <Shell>
      <Label>DETALLE DEL PEDIDO</Label>
      <Title>{o ? "Tu pedido de demostración" : "Pedido no disponible"}</Title>
      {o ? (
        <Card>
          <Text style={s.pill}>Registrado en esta sesión · Sin envío real</Text>
          <Copy>
            Centro: {o.centerName} · Entrega solicitada: {o.delivery}
          </Copy>
          {o.lines.map((l) => (
            <Text key={l.productId} style={s.copy}>
              {products.find((p) => p.id === l.productId)?.name} · {l.quantity}{" "}
              {products.find((p) => p.id === l.productId)?.unit}
            </Text>
          ))}
          <Text style={s.sectionTitle}>{money(total(o.lines))}</Text>
          <Copy>
            La revisión interna y la entrega al ERP se conectarán al flujo
            remoto. Este registro no las ejecuta.
          </Copy>
        </Card>
      ) : (
        <Copy>
          La demostración guarda los pedidos únicamente mientras esta sesión
          permanece abierta.
        </Copy>
      )}
      <Button
        label="Ver mis pedidos"
        secondary
        onPress={() => router.replace("/orders")}
      />
    </Shell>
  );
}
