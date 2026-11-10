import { useState } from "react";
import { Text } from "react-native";
import { router } from "expo-router";
import { Shell, Label, Title, Copy, Card, Button, s } from "../components/ui";
import { useWorkspace } from "../components/workspace";
export default function Assistant() {
  const [show, setShow] = useState(false);
  const { add, notify } = useWorkspace();
  return (
    <Shell>
      <Label>ASISTENTE HOREKIA</Label>
      <Title>Una ayuda para empezar.</Title>
      <Copy>
        Vista previa del asistente del centro. Gemini todavía no está conectado
        a esta app.
      </Copy>
      <Card>
        <Text style={s.sectionTitle}>Explora un ejemplo</Text>
        <Copy>
          «Para Sant Jordi: 20 kg de muslo de pollo, 4 kg de fideos de arroz y
          arroz para 60 comensales a 80 g por persona. Hay 6 sin lácteos. Para
          el viernes que viene.»
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
            onPress={() => {
              add("chicken", 20);
              add("noodles", 4);
              add("rice", 4.8);
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
