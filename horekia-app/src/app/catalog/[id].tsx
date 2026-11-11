import { Text, View } from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { money } from "../../domain/demo";
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
export default function Product() {
  const { id } = useLocalSearchParams();
  const { add, notify, center, mode, catalog: products } = useWorkspace();
  const p = products.find((x) => x.id === id);
  return (
    <Shell>
      {p ? (
        <>
          <Label>
            {p.family.toUpperCase()} · {p.sku}
          </Label>
          <Title>{p.name}</Title>
          <View style={s.row}>
            <Card style={{ flex: 1, minWidth: 240 }}>
              <View
                style={{
                  backgroundColor: p.color,
                  borderRadius: 14,
                  padding: 35,
                }}
              >
                <Text
                  style={{
                    fontSize: 70,
                    textAlign: "center",
                    color: "#74846c",
                  }}
                >
                  {p.symbol}
                </Text>
              </View>
              <Text style={s.sectionTitle}>
                {money(p.price)} / {p.unit}
              </Text>
              <Copy>
                {mode === "AUTHENTICATED"
                  ? "Precio del catálogo de tu empresa. El pedido sigue siendo de demostración."
                  : "Precio ficticio para probar el recorrido de compra."}
              </Copy>
              <Button
                label="Añadir a la cesta"
                disabled={!center}
                onPress={() => {
                  add(p.id);
                  notify("Producto añadido.");
                }}
              />
            </Card>
            <Card style={{ flex: 1, minWidth: 240 }}>
              <Text style={s.sectionTitle}>Información alimentaria</Text>
              <Text style={s.pill}>Pendiente de validación de Calidad</Text>
              <Copy>
                Este producto de demostración no dispone de una ficha de
                alérgenos validada. No permite confirmar si es adecuado para una
                dieta o alergia.
              </Copy>
              <Text style={s.sectionTitle}>Documentación</Text>
              <Copy>No hay documentos disponibles en esta demostración.</Copy>
            </Card>
          </View>
        </>
      ) : (
        <>
          <Title>Producto no encontrado</Title>
          <Button
            label="Volver al catálogo"
            onPress={() => router.replace("/catalog")}
          />
        </>
      )}
    </Shell>
  );
}
