import { useState } from "react";
import { Text } from "react-native";
import { router } from "expo-router";
import { Shell, Label, Title, Copy, Card, Button, s } from "../components/ui";
import { useWorkspace } from "../components/workspace";
export default function Assistant() {
  const [show, setShow] = useState(false);
  const { add, notify, center, catalog } = useWorkspace();
  return (
    <Shell>
      <Label>ASISTENTE CUINORA</Label>
      <Title>Una ayuda para empezar.</Title>
      <Copy>
        Vista previa del asistente del centro. Gemini todavía no está conectado
        a esta app.
      </Copy>
      <Card>
        <Text style={s.sectionTitle}>Explora un ejemplo</Text>
        <Copy>
          «Para {center?.name ?? "el centro seleccionado"}: 20 kg de muslo de
          pollo, 4 kg de fideos de arroz y arroz para 60 comensales a 80 g por
          persona. Hay 6 sin lácteos. Para el viernes que viene.»
        </Copy>
        <Button
          label="Ver propuesta de ejemplo"
          onPress={() => setShow(true)}
        />
      </Card>
      {show && (
        <Card>
          <Text style={s.pill}>
            Respuesta preparada de demostración · No generada por IA
          </Text>
          <Text style={s.sectionTitle}>
            Tres productos. Una fecha por aclarar.
          </Text>
          <Copy>
            NX-06-002 · Muslo de pollo · 20 kg{"\n"}NX-02-015 · Fideos de arroz
            · 4 kg{"\n"}NX-01-001 · Arroz basmati · 60 × 80 g = 4,8 kg
          </Copy>
          <Copy>
            Atención: 6 comensales sin lácteos. La documentación de estos
            productos no permite validar su idoneidad para esa dieta.
          </Copy>
          <Text style={s.fieldLabel}>
            ¿Qué fecha exacta es «el viernes que viene»?
          </Text>
          <Button
            label="Añadir propuesta a mi cesta"
            disabled={!center}
            onPress={() => {
              const selections = [
                ["NX-06-002", 20],
                ["NX-02-015", 4],
                ["NX-01-001", 4.8],
              ] as const;
              if (
                selections.some(([sku]) => !catalog.some((p) => p.sku === sku))
              ) {
                notify(
                  "El catálogo actual no contiene todas las referencias de este ejemplo.",
                );
                return;
              }
              for (const [sku, n] of selections)
                add(catalog.find((p) => p.sku === sku)!.id, n);
              notify(
                "Propuesta de ejemplo añadida. Revisa cantidades y fecha.",
              );
              router.push("/orders/new");
            }}
          />
        </Card>
      )}
    </Shell>
  );
}
