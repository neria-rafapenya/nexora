import { useState } from "react";
import { View, Text } from "react-native";
import { router } from "expo-router";
import { products, total, money } from "../../domain/demo";
import {
  Shell,
  Label,
  Title,
  Copy,
  Card,
  Button,
  Field,
  s,
} from "../../components/ui";
import { useWorkspace } from "../../components/workspace";
export default function New() {
  const { cart, setQuantity, submit, center } = useWorkspace();
  const [delivery, setDelivery] = useState("");
  const [error, setError] = useState("");
  return (
    <Shell>
      <Label>NUEVO PEDIDO</Label>
      <Title>Revisa tu cesta.</Title>
      <Copy>
        Centro: {center?.name ?? "Sin seleccionar"} · Este recorrido no envía
        pedidos reales.
      </Copy>
      {cart.length === 0 ? (
        <Card>
          <Text style={s.sectionTitle}>Tu cesta aún está vacía.</Text>
          <Copy>Elige productos del catálogo para empezar.</Copy>
          <Button
            label="Ir al catálogo"
            onPress={() => router.push("/catalog")}
          />
        </Card>
      ) : (
        <>
          <Card>
            {cart.map((l) => {
              const p = products.find((p) => p.id === l.productId)!;
              return (
                <View
                  key={l.productId}
                  style={[
                    s.row,
                    {
                      justifyContent: "space-between",
                      alignItems: "center",
                      paddingVertical: 12,
                      borderBottomWidth: 1,
                      borderColor: "#e2e7df",
                    },
                  ]}
                >
                  <View style={{ flex: 1, minWidth: 150 }}>
                    <Text style={s.fieldLabel}>{p.name}</Text>
                    <Copy>
                      {money(p.price)} / {p.unit}
                    </Copy>
                  </View>
                  <Button
                    label="−"
                    secondary
                    onPress={() => setQuantity(p.id, l.quantity - 1)}
                  />
                  <Text
                    accessibilityLabel={"Cantidad de " + p.name}
                    style={s.fieldLabel}
                  >
                    {l.quantity} {p.unit}
                  </Text>
                  <Button
                    label="+"
                    secondary
                    onPress={() => setQuantity(p.id, l.quantity + 1)}
                  />
                  <Text style={s.fieldLabel}>
                    {money(p.price * l.quantity)}
                  </Text>
                </View>
              );
            })}
            <Text style={s.sectionTitle}>
              Total de ejemplo: {money(total(cart))}
            </Text>
          </Card>
          <Card>
            <Field
              label="Fecha de entrega (AAAA-MM-DD)"
              value={delivery}
              onChangeText={setDelivery}
              placeholder="2026-11-20"
            />
            <Copy>
              La disponibilidad de entrega se confirmará al conectar la
              operativa real.
            </Copy>
            {error !== "" && (
              <Text role="alert" style={{ color: "#a33728", fontSize: 13 }}>
                {error}
              </Text>
            )}
            <Button
              label="Registrar pedido de demostración"
              onPress={() => {
                const d = new Date(delivery + "T12:00:00");
                if (
                  !/^\d{4}-\d{2}-\d{2}$/.test(delivery) ||
                  Number.isNaN(d.valueOf()) ||
                  d.toISOString().slice(0, 10) !== delivery ||
                  d < new Date()
                ) {
                  setError(
                    "Introduce una fecha futura válida en formato AAAA-MM-DD.",
                  );
                  return;
                }
                const id = submit(delivery);
                router.replace({ pathname: "/orders/[id]", params: { id } });
              }}
            />
          </Card>
        </>
      )}
    </Shell>
  );
}
