import { Text } from "react-native";
import { router } from "expo-router";
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
import { total, money } from "../../domain/demo";
export default function Orders() {
  const { orders: allOrders, center, catalog } = useWorkspace();
  const orders = allOrders.filter((o) => o.centerId === center?.id);
  return (
    <Shell>
      <Label>MIS PEDIDOS</Label>
      <Title>Todo lo que has pedido.</Title>
      <Button label="Nuevo pedido" onPress={() => router.push("/orders/new")} />
      {orders.length === 0 ? (
        <Card>
          <Text style={s.sectionTitle}>Todavía no hay pedidos.</Text>
          <Copy>
            Los pedidos que prepares aparecerán aquí durante esta sesión de
            demostración.
          </Copy>
        </Card>
      ) : (
        orders.map((o) => (
          <Card key={o.id}>
            <Text style={s.sectionTitle}>
              Pedido de ejemplo · {o.id.slice(-6)}
            </Text>
            <Copy>
              Entrega solicitada: {o.delivery} · {o.lines.length} productos ·{" "}
              {money(total(o.lines, catalog))}
            </Copy>
            <Text style={s.pill}>Registrado en la demostración</Text>
            <Button
              label="Ver detalle"
              secondary
              onPress={() =>
                router.push({ pathname: "/orders/[id]", params: { id: o.id } })
              }
            />
          </Card>
        ))
      )}
    </Shell>
  );
}
