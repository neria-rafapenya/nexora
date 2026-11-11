import { DateField } from "../../components/DateField";
import {
  minimumDeliveryDate,
  validDeliveryDate,
} from "../../domain/delivery-date";
import { useState } from "react";
import { View, Text } from "react-native";
import { router } from "expo-router";
import { total, money } from "../../domain/demo";
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
export default function New() {
  const {
    cart,
    setQuantity,
    submit,
    center,
    catalog: products,
  } = useWorkspace();
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
              Total de ejemplo: {money(total(cart, products))}
            </Text>
          </Card>
          <Card>
            <DateField
              label="Fecha de entrega"
              value={delivery}
              min={minimumDeliveryDate()}
              onChange={(value) => {
                setDelivery(value);
                setError("");
              }}
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
                if (!validDeliveryDate(delivery)) {
                  setError(
                    "Selecciona una fecha de entrega a partir de mañana.",
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
